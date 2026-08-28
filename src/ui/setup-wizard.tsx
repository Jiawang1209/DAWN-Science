/**
 * 首启向导（2026-08-27，spec `2026-08-27-首启向导与环境检测-design.md` §3.1）。
 *
 * 只在**没有任何凭证**时替换主区。门槛只有 key：填了「开始使用」才亮。
 * 解释器那段是可选的锦上添花——检测本机 Python / R 让人选一个，不配也能聊。
 * 「先跳过」记 `dawn.global.setupSkipped`（作用域 global，写在 key 里）；跳过后底部红字仍在，点它回来。
 */
import { useEffect, useState } from "react"
import type { InterpreterCandidate } from "../protocol/index.js"
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
}: {
  /** 可填 key 的服务商 id 清单（`listKnownProviders`） */
  providers: readonly string[]
  /** 已经有 key 的服务商 */
  configured: readonly string[]
  /** 服务商目录取不到时后端给的原因（`listKnownProviders.problem`）——没有它，下拉是空的、两个按钮全灰、一个字的解释都没有（2026-08-28） */
  problem?: string | undefined
  /** `listCredentials.encrypted === false`：系统没有安全存储，key 会明文落盘——首启的人还没进过设置屏，得在这里说 */
  plaintext?: boolean | undefined
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

  const 有key = configured.length > 0

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
            {saving ? t("正在保存…") : t("保存")}
          </Button>
        </form>
        {keyError ? <p className="field-error">{keyError}</p> : null}
        <p className="hint">{t("填完立刻可以对话。key 只存在本机。")}</p>
      </section>

      <section className="sw-section">
        <h2>
          {t("解释器")} <span className="sw-opt">{t("（可选，笔记本用；不配也能聊）")}</span>
        </h2>
        <InterpreterPicker language="python" candidates={probed?.python} probing={probing} error={probeError} current={interpreters.python} onPick={(p) => onSetInterpreter("python", p)} onProbe={() => void 探()} />
        <InterpreterPicker language="R" candidates={probed?.r} probing={probing} current={interpreters.r} onPick={(p) => onSetInterpreter("R", p)} onProbe={() => void 探()} />
      </section>

      <div className="sw-foot">
        {有key ? null : <span className="hint">{t("先填一个 key")}</span>}
        <Button variant="primary" disabled={!有key} onClick={onStart}>
          {t("开始使用 →")}
        </Button>
      </div>
    </div>
  )
}
