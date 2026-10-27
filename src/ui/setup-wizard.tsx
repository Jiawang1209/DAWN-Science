/**
 * 主区域四步向导：认识产品、了解功能、配置模型、可选计算环境。
 * 密钥验证沿用现有回调与 hard/soft 判据；草稿和探测结果在回退时保留。
 * 完成与暂缓由 App 记录；补填凭证可通过 initialStep 直接进入模型页。
 */
import { useEffect, useRef, useState } from "react"
import { useStore } from "@nanostores/react"
import type { FaultI18n, InterpreterCandidate } from "../protocol/index.js"
import { Button } from "./primitives.js"
import { InterpreterPicker } from "./interpreter-picker.js"
import { t, tf, setLang, $lang } from "./i18n/index.js"
import { 对话图标, 笔记本文件图标, 文件夹图标, 服务器图标 } from "./icons.js"
import { 测试连通, type 测试, type 测试请求 } from "./Settings.js"
import { parseSetupEndpoint, type EndpointDefaults, type SetupConnection } from "./setup-endpoint.js"
import rpIcon from "../../packaging/icon.svg"

export const 跳过键 = "dawn.global.setupSkipped"

export function 读跳过(): boolean {
  try {
    return localStorage.getItem(跳过键) === "1"
  } catch {
    return false
  }
}
export function 记跳过(v: boolean): void {
  try {
    if (v) localStorage.setItem(跳过键, "1")
    else localStorage.removeItem(跳过键)
  } catch {
    /* 存不进去就算了：下次打开再见一次向导，不算错 */
  }
}

const 引导完成键 = "dawn.global.onboardingDone"

/** 兼容旧版本已完成或主动跳过首次设置的用户。 */
export function 读引导完成(): boolean {
  try {
    return localStorage.getItem(引导完成键) === "1" || 读跳过()
  } catch {
    return false
  }
}
export function 记引导完成(): void {
  try {
    localStorage.setItem(引导完成键, "1")
  } catch {
    // 存储不可用时仍可完成当前流程。
  }
}

const 密钥入口: Readonly<Record<string, string>> = {
  deepseek: "https://platform.deepseek.com/api_keys",
  openai: "https://platform.openai.com/api-keys",
  anthropic: "https://platform.claude.com/settings/keys",
}

export interface 探测结果 {
  python: readonly InterpreterCandidate[]
  r: readonly InterpreterCandidate[]
}

export function SetupWizard({
  initialStep = "welcome",
  modelCatalog,
  endpointDefaults,
  connections,
  needsBaseUrl,
  onSaveConnection,
  onTest,
  providers,
  configured,
  interpreters,
  onSaveKey,
  onSetInterpreter,
  onProbe,
  onSkip,
  onStart,
  problem,
  plaintext,
  broken,
  unusable,
}: {
  initialStep?: "welcome" | "key"
  modelCatalog?: Record<string, string[]> | undefined
  endpointDefaults?: EndpointDefaults | undefined
  connections?: Record<string, SetupConnection> | undefined
  needsBaseUrl?: readonly string[] | undefined
  onSaveConnection?: ((providerId: string, connection: SetupConnection) => Promise<void>) | undefined
  onTest?: 测试 | undefined
  /** 可填 key 的服务商 id 清单（`listKnownProviders`） */
  providers: readonly string[]
  /** 已经有 key 的服务商 */
  configured: readonly string[]
  /** 服务商目录取不到时后端给的原因（`listKnownProviders.problem`）——没有它，下拉是空的、两个按钮全灰、一个字的解释都没有（2026-08-28） */
  problem?: string | undefined
  /** `listCredentials.encrypted === false`：系统没有安全存储，key 会明文落盘——首启的人还没进过设置屏，得在这里说 */
  plaintext?: boolean | undefined
  /** 上一版存的、这版解不开的 key（未签名包更新后）——向导亮起的原因之一，要说清楚不是他没填过 */
  broken?: readonly string[] | undefined
  /**
   * key 存进去了、却建不出 agent 的那些（`getProviders.unusable`，B8）。
   * 没有它，「已填 deepseek ✓」下面一点「开始使用」，进去是个没有 agent 的空应用——原因得在人正看着的这一屏说。
   */
  unusable?: readonly { providerId: string; reason: string; soft?: boolean | undefined; kind?: "catalog" | "key" | undefined; i18n?: FaultI18n | undefined }[] | undefined
  interpreters: { python?: string | undefined; r?: string | undefined }
  onSaveKey: (providerId: string, secret: string) => Promise<void>
  onSetInterpreter: (language: "python" | "R", path: string) => void
  onProbe: () => Promise<探测结果>
  onSkip: () => void
  onStart: () => void
}) {
  const lang = useStore($lang)
  const [step, setStep] = useState(initialStep === "key" ? 2 : 0)
  const 标题 = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    标题.current?.focus()
  }, [step])
  const 步骤 = [t("认识 DAWN"), t("主要功能"), t("API Key"), t("计算环境")]
  const 标题文字 = [t("欢迎使用 DAWN Science"), t("让研究工作在这里衔接"), t("连接 AI 模型"), t("连接你的计算环境")]

  // 默认服务商：常用的优先，别落到字母序第一个 amazon-bedrock（打包版里看到的）
  const 默认服务商 = (列: readonly string[] = []) => ["deepseek", "openai", "anthropic", "kimi", "moonshot"].find((p) => 列.includes(p)) ?? 列[0] ?? ""
  const [provider, setProvider] = useState(() => 默认服务商(providers))
  useEffect(() => {
    if (!provider && providers.length) setProvider(默认服务商(providers))
  }, [providers, provider])
  // undefined 跟随所选服务商的地址；字符串（包括空串）保留用户手动草稿。
  const [baseUrlDraft, setBaseUrlDraft] = useState<string | undefined>(undefined)
  const [api, setApi] = useState("")
  const [model, setModel] = useState("")
  const [secret, setSecret] = useState("")
  const defaults: EndpointDefaults = { ...endpointDefaults }
  for (const [id, conn] of Object.entries(connections ?? {})) defaults[id] = { ...defaults[id], ...conn }
  const baseUrl = baseUrlDraft ?? defaults[provider]?.baseUrl ?? ""
  const 模型候选 = [...new Set([...(connections?.[provider]?.models ?? []), ...(modelCatalog?.[provider] ?? [])])]
  const 模型 = model.trim() || 模型候选[0]
  const 取请求 = (): 测试请求 | string => {
    if (!provider) return t("请选择服务商或填写 API URL。")
    if (!secret.trim()) return t("先填一个 key")
    let endpoint
    const 待解析地址 = baseUrl.trim() || (api || model.trim() ? defaults[provider]?.baseUrl : undefined)
    if (待解析地址) {
      try { endpoint = parseSetupEndpoint(待解析地址, defaults, api || (baseUrlDraft === undefined ? defaults[provider]?.api : undefined)) }
      catch { return t("API URL 需为 http(s) 地址，且不能包含账号、查询参数或片段。") }
    }
    if (!endpoint && needsBaseUrl?.includes(provider)) return t("这个服务商需要填写 API URL。")
    if ((endpoint || !providers.includes(provider)) && !模型) return t("填写模型 ID 后即可检测这个端点。")
    if (api && !endpoint && !defaults[provider]?.baseUrl) return t("指定协议时请同时填写 API URL。")
    const 地址 = endpoint?.baseUrl
    return {
      providerId: provider,
      secret: secret.trim(),
      ...(地址 ? { baseUrl: 地址, api: api || endpoint?.api || defaults[provider]?.api || "openai-completions" } : {}),
      ...(模型 ? { model: 模型 } : {}),
    }
  }
  const 选服务商 = (id: string) => {
    setProvider(id)
    setBaseUrlDraft(undefined)
    setApi("")
    setModel("")
    setKeyError(undefined)
  }
  const 改地址 = (value: string) => {
    setBaseUrlDraft(value)
    setKeyError(undefined)
    if (!value.trim()) return
    try {
      const endpoint = parseSetupEndpoint(value, defaults)
      if (endpoint.providerId !== provider) {
        setProvider(endpoint.providerId)
        setModel("")
        setApi("")
      }
    } catch {
      // 输入尚未形成合法 URL 时保留草稿，检测或保存时说明原因。
    }
  }
  const [saving, setSaving] = useState(false)
  const [keyError, setKeyError] = useState<string | undefined>(undefined)
  const [probed, setProbed] = useState<探测结果 | undefined>(undefined)
  const [probing, setProbing] = useState(false)
  const [probeError, setProbeError] = useState<string | undefined>(undefined)

  /** 「开始使用」的门槛是**至少一家能用**：全都建不出 agent 时放人进去，等于把他锁在一个空屏里 */
  const 用不了的 = (unusable ?? []).filter((u) => configured.includes(u.providerId))
  /** `soft` 是「没能验证」（B9）——话要摆出来，但**不算用不了**：断网时填的 key 可能是好的，拦了就是把人锁在门外 */
  const 有key = configured.length > 0 && configured.some((id) => !用不了的.some((u) => u.providerId === id && !u.soft))

  const 保存 = async () => {
    if (saving) return
    const req = 取请求()
    if (typeof req === "string") return setKeyError(req)
    setSaving(true)
    setKeyError(undefined)
    try {
      if (req.baseUrl || api || model.trim()) {
        if (!onSaveConnection) throw new Error(t("本次运行未提供连接配置保存功能。"))
        await onSaveConnection(provider, {
          ...connections?.[provider],
          ...(req.baseUrl ? { baseUrl: req.baseUrl, api: req.api } : {}),
          ...(req.model ? { models: [...new Set([req.model, ...(connections?.[provider]?.models ?? [])])] } : {}),
        })
      }
      await onSaveKey(provider, req.secret)
      setSecret("")
    } catch (e) {
      // 失败要出声：这是这一屏唯一的门槛，静默失败等于把人锁在门外
      setKeyError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }
  const 探 = async () => {
    setProbing(true)
    setProbeError(undefined)
    try {
      setProbed(await onProbe())
    } catch (e) {
      setProbeError(e instanceof Error ? e.message : String(e))
    } finally {
      setProbing(false)
    }
  }

  const 完成 = () => 有key ? onStart() : onSkip()

  return (
    <div className="setup-stage">
    <div className="setup-wizard" role="dialog" aria-modal="true" aria-label={t("首次设置")} onKeyDown={e => {
      e.stopPropagation()
      // 通过明确操作结束引导，Esc 不记录跳过，避免误触丢失当前步骤。
      if (e.key === "Escape") { e.preventDefault(); return }
      if (e.key !== "Tab") return
      const controls = [...e.currentTarget.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled), select:not(:disabled), a[href], [tabindex='0']")].filter(el => el.tabIndex >= 0)
      const first = controls[0], last = controls.at(-1)
      if (e.shiftKey && (document.activeElement === first || !controls.includes(document.activeElement as HTMLElement))) {
        e.preventDefault(); last?.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault(); first?.focus()
      }
    }}>
      <header className="sw-head">
        <span className="sw-brand"><img src={rpIcon} alt="" />DAWN Science<span className="sw-eyebrow">{t("首次设置")}</span></span>
        <div className="sw-head-actions">
          <div className="sw-language" role="radiogroup" aria-label={t("语言")} onKeyDown={e => {
            if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(e.key)) return
            e.preventDefault()
            const next = e.key === "Home" ? "zh" : e.key === "End" ? "en" : lang === "zh" ? "en" : "zh"
            setLang(next)
            e.currentTarget.querySelector<HTMLButtonElement>(`[data-lang="${next}"]`)?.focus()
          }}>
            {(["zh", "en"] as const).map(value => <Button key={value} size="sm" variant={lang === value ? "secondary" : "ghost"} role="radio" aria-checked={lang === value} tabIndex={lang === value ? 0 : -1} data-lang={value} data-native-name onClick={() => setLang(value)}>{value === "zh" ? "中文" : "English"}</Button>)}
          </div>
          <Button variant="ghost" size="sm" disabled={saving} onClick={onSkip}>{t("先跳过")}</Button>
        </div>
      </header>
      <div className={`sw-page sw-page-${step}`}>
        <div className="sw-page-head">
          {step === 0 ? <img className="sw-welcome-logo" src={rpIcon} alt="" /> : null}
          <p className="sw-eyebrow">{tf("第 {0} 步，共 4 步", step + 1)}</p>
          <h1 ref={标题} tabIndex={-1}>{标题文字[step]}</h1>
        </div>
        {step === 0 ? (
          <div className="sw-welcome">
            <p className="sw-lead">{t("面向科研的 AI 工作台，让对话、代码与研究结果连接起来。")}</p>
            <p>{t("从一个问题开始，与 AI 一起整理资料、分析数据，并在同一个工作空间中查看过程与成果。")}</p>
            <div className="sw-highlights"><span>{t("本地优先")}</span><span>R + Python</span><span>{t("项目协作")}</span></div>
            <p className="hint">{t("接下来，了解主要功能，再连接 AI 模型；计算环境可以稍后配置。")}</p>
          </div>
        ) : null}
        {step === 1 ? (
          <div className="sw-features">
            <article><对话图标 /><h2>{t("科研对话")}</h2><p>{t("围绕研究问题与 AI 交流，整理思路、阅读资料，协助编写与审阅代码。")}</p></article>
            <article><笔记本文件图标 /><h2>{t("R / Python 与 Notebook")}</h2><p>{t("连接解释器后，与 AI 在持久内核中分析数据，在 Notebook 中查看和接续计算。")}</p></article>
            <article><文件夹图标 /><h2>{t("项目文件与成果")}</h2><p>{t("以文件夹组织研究项目，查看数据、脚本、图表与文档，让工作过程有迹可循。")}</p></article>
            <article><服务器图标 /><h2>{t("远程计算")}</h2><p>{t("配置 SSH 服务器后，连接远程工作目录、终端与计算环境。")}</p></article>
          </div>
        ) : null}
        {step === 2 ? <>
        <p className="sw-description">{t("选择服务商并填入 API Key，即可连接 AI。你也可以稍后在设置中配置。")}</p>
          <section className="sw-section">
            <h2>
              {t("模型 key")} <span className="sw-req">{t("（必需）")}</span>
              {有key ? <span className="sw-ok">✓ {tf("已填 {0}", configured.join("、"))}</span> : null}
            </h2>
            {problem && providers.length === 0 ? <p className="caveat">{tf("服务商目录取不到：{0}", problem)}</p> : null}
            {plaintext ? <p className="caveat">{t("⚠ 系统未提供安全存储，凭证将以明文保存在用户数据目录")}</p> : null}
            {broken?.length ? <p className="caveat">{tf("上一版保存的 key 解不开了（{0}）——应用更新后系统钥匙串换了身份，请重新填一次", broken.join("、"))}</p> : null}
            {用不了的.map((u) => (
              <p key={u.providerId} className="caveat">
                {/* 理由按当前语言（B15）：带 msgid 的翻一遍；老后端只给 reason 的照旧显示。
                    B9 那几句（`kind: "key"`，soft 也是它）本身就是整句话（「deepseek 的 key 验证失败：…」），
                    套上「建不出可用的模型」就是 provider 名出现两次、还把「key 错了」说成「目录没模型」（2026-09-01 终审 F4）。
                    只有目录那层（B8）要套：它的原话是「模型目录读不出来：boom」，不带主语 */}
                {(() => {
                  const 话 = u.i18n ? tf(u.i18n.msgid, ...u.i18n.args) : u.reason
                  return u.kind === "key" || u.soft ? 话 : tf("{0} 的 key 已保存，但还建不出可用的模型：{1}", u.providerId, 话)
                })()}
              </p>
            ))}
            <form
              className="sw-key"
              onSubmit={(e) => {
                e.preventDefault()
                void 保存()
              }}
            >
              <label className="sw-url-field">
                API URL
                <input className="control" type="url" aria-label="API URL" disabled={saving} value={baseUrl} placeholder={t("例如 https://api.example.com/v1")} spellCheck={false} onChange={e => 改地址(e.target.value)} />
              </label>
              <p className="hint sw-url-field">{t("切换服务商会自动填写默认地址；你可以手动修改后测试连通。")}</p>
              <label>
                {t("服务商")}
                <select className="control" disabled={saving} value={provider} onChange={(e) => 选服务商(e.target.value)} aria-label={t("服务商")}>
                  {!providers.includes(provider) && provider ? <option value={provider}>{t("自定义端点")}</option> : null}
                  {providers.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t("API key")}
                <input className="control" disabled={saving} type="password" value={secret} onChange={(e) => setSecret(e.target.value)} aria-label={t("API key")} autoComplete="off" />
              </label>
              <label>
                {t("连接模型")}
                <input className="control" aria-label={t("连接模型")} disabled={saving} value={model} placeholder={模型 ?? t("填写服务商提供的模型 ID")} list="setup-models" onChange={e => setModel(e.target.value)} spellCheck={false} />
                <datalist id="setup-models">{模型候选.map(id => <option key={id} value={id} />)}</datalist>
              </label>
              <label>
                {t("接口协议")}
                <select className="control" aria-label={t("接口协议")} disabled={saving} value={api} onChange={e => setApi(e.target.value)}>
                  <option value="">{t("自动识别")}</option>
                  <option value="openai-completions">OpenAI Chat Completions</option>
                  <option value="openai-responses">OpenAI Responses</option>
                  <option value="anthropic-messages">Anthropic Messages</option>
                  {defaults[provider]?.api && !["openai-completions", "openai-responses", "anthropic-messages"].includes(defaults[provider]!.api!) ? <option value={defaults[provider]!.api}>{defaults[provider]!.api}</option> : null}
                </select>
              </label>
              <div className="sw-key-actions">
                {onTest ? <测试连通 取请求={取请求} 指纹={[provider, baseUrl, api, 模型, secret].join("\u0000")} onTest={onTest} /> : null}
                <Button type="submit" variant="primary" size="sm" disabled={saving || !provider || !secret.trim()}>
                  {/* 保存要等对方回一句（B9 的验证，最多 8 秒）——只写「正在保存」看着像卡死 */}
                  {saving ? t("正在保存并验证 key…") : t("保存")}
                </Button>
              </div>
            </form>
            {keyError ? <p className="field-error" role="alert">{keyError}</p> : null}
            {密钥入口[provider] ? <a className="sw-get-key" href={密钥入口[provider]} target="_blank" rel="noopener noreferrer">{tf("获取 {0} API Key →", provider)}</a> : null}
            <p className="hint">{t("填完立刻可以对话。key 只存在本机。")}</p>
            {!有key && configured.length > 0 ? <p className="hint">{t("填的 key 还用不了，原因在上面")}</p> : null}
          </section>

        </> : null}
        {step === 3 ? <>
        <p className="sw-description">{t("如果你准备运行 R 或 Python，可以连接本机已有的解释器；只使用 AI 对话时无需配置。")}</p>
      <section className="sw-section">
        <h2>
          {t("解释器")} <span className="sw-opt">{t("（可选）")}</span>
        </h2>
        <InterpreterPicker language="python" candidates={probed?.python} probing={probing} error={probeError} current={interpreters.python} onPick={(p) => onSetInterpreter("python", p)} onProbe={() => void 探()} />
        <InterpreterPicker language="R" candidates={probed?.r} probing={probing} current={interpreters.r} onPick={(p) => onSetInterpreter("R", p)} onProbe={() => void 探()} />
      </section>

        <p className="hint">{t("未配置不影响进入工作台，需要时可在「设置 → 内核」中补充。")}</p>
        {!有key ? <p className="caveat">{t("尚未配置可用的 API Key，进入后可在设置中补充。")}</p> : null}
        </> : null}
      </div>
      <ol className="sw-progress" aria-label={t("设置进度")}>
        {步骤.map((label, i) => (
          <li key={i} aria-current={step === i ? "step" : undefined} data-complete={step > i && (i !== 2 || 有key)} data-skipped={i === 2 && step > 2 && !有key}>
            <span className="sw-step-number" aria-hidden="true" /><span>{label}{i === 2 && step > 2 && !有key ? <small className="sw-step-status">{t("稍后配置")}</small> : null}</span>
          </li>
        ))}
      </ol>
      <footer className="sw-foot">
        {step > 0 ? <Button variant="ghost" disabled={saving} onClick={() => setStep(step - 1)}>{t("上一步")}</Button> : <span />}
        <div className="sw-foot-actions">
          {step === 2 ? <>
            <Button variant="text" disabled={saving} onClick={() => setStep(3)}>{t("稍后配置")}</Button>
            <Button variant="primary" disabled={!有key || saving} onClick={() => setStep(3)}>{t("下一页")}</Button>
          </> : step === 3 ? (
            <Button variant="primary" onClick={完成}>{interpreters.python || interpreters.r ? t("开始使用 →") : t("跳过，进入工作台")}</Button>
          ) : <Button variant="primary" onClick={() => setStep(step + 1)}>{t("下一页")}</Button>}
        </div>
      </footer>
    </div>
    </div>
  )
}
