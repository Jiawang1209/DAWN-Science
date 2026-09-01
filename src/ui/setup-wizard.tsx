/**
 * 首启向导（2026-08-27，spec `2026-08-27-首启向导与环境检测-design.md` §3.1）。
 *
 * 只在**没有任何凭证**时替换主区。门槛只有 key：填了「开始使用」才亮。
 * 解释器那段是可选的锦上添花——检测本机 Python / R 让人选一个，不配也能聊。
 * 「先跳过」记 `dawn.global.setupSkipped`（作用域 global，写在 key 里）；跳过后底部红字仍在，点它回来。
 */
import { useEffect, useState } from "react"
import type { FaultI18n, InterpreterCandidate } from "../protocol/index.js"
import { Button } from "./primitives.js"
import { InterpreterPicker } from "./interpreter-picker.js"
import { t, tf } from "./i18n/index.js"

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

export interface 探测结果 {
  python: readonly InterpreterCandidate[]
  r: readonly InterpreterCandidate[]
}

export function SetupWizard({
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
  // 默认服务商：常用的优先，别落到字母序第一个 amazon-bedrock（打包版里看到的）
  const 默认服务商 = (列: readonly string[] = []) => ["deepseek", "openai", "anthropic", "kimi", "moonshot"].find((p) => 列.includes(p)) ?? 列[0] ?? ""
  const [provider, setProvider] = useState(() => 默认服务商(providers))
  useEffect(() => {
    if (!provider && providers.length) setProvider(默认服务商(providers))
  }, [providers, provider])
  const [secret, setSecret] = useState("")
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
    if (!provider || !secret.trim()) return
    setSaving(true)
    setKeyError(undefined)
    try {
      await onSaveKey(provider, secret.trim())
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

  return (
    <div className="setup-wizard" role="region" aria-label={t("首次设置")}>
      <div className="sw-head">
        <h1>{t("欢迎使用 DAWN Science")}</h1>
        <Button variant="ghost" size="sm" onClick={onSkip}>
          {t("先跳过")}
        </Button>
      </div>

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
          <label>
            {t("服务商")}
            <select className="control" value={provider} onChange={(e) => setProvider(e.target.value)} aria-label={t("服务商")}>
              {providers.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
          <label className="sw-key-field">
            {t("API key")}
            <input className="control" type="password" value={secret} onChange={(e) => setSecret(e.target.value)} aria-label={t("API key")} autoComplete="off" />
          </label>
          <Button type="submit" variant="primary" size="sm" disabled={saving || !provider || !secret.trim()}>
            {/* 保存要等对方回一句（B9 的验证，最多 8 秒）——只写「正在保存」看着像卡死 */}
            {saving ? t("正在保存并验证 key…") : t("保存")}
          </Button>
        </form>
        {keyError ? <p className="field-error">{keyError}</p> : null}
        <p className="hint">{t("填完立刻可以对话。key 只存在本机。")}</p>
      </section>

      <section className="sw-section">
        <h2>
          {t("解释器")} <span className="sw-opt">{t("（可选）")}</span>
        </h2>
        <InterpreterPicker language="python" candidates={probed?.python} probing={probing} error={probeError} current={interpreters.python} onPick={(p) => onSetInterpreter("python", p)} onProbe={() => void 探()} />
        <InterpreterPicker language="R" candidates={probed?.r} probing={probing} current={interpreters.r} onPick={(p) => onSetInterpreter("R", p)} onProbe={() => void 探()} />
      </section>

      <div className="sw-foot">
        {有key ? null : <span className="hint">{configured.length > 0 ? t("填的 key 还用不了，原因在上面") : t("先填一个 key")}</span>}
        <Button variant="primary" disabled={!有key} onClick={onStart}>
          {t("开始使用 →")}
        </Button>
      </div>
    </div>
  )
}
