/**
 * 对话里的产物条 `GENERATED · N`（spec 2026-08-26-产物 §4）。
 *
 * **按轮派生，不是转录项**：这一轮 = 上一句用户发言之后、这条 agent 回复之前的所有工具调用；
 * 产物按 `bornToolCallId` 对到这些工具调用（转录里 tool item 的 id 就是 pi 的 toolCallId）。
 * 三态分得开：正常 / 未知 / 混合；确认没新建**不画**。
 */
import type { Artifact, TranscriptItem } from "../protocol/index.js"
import type { ArtifactList } from "./state/catalog.js"
import { Button } from "./primitives.js"
import { t, tf } from "./i18n/index.js"
import { 文件类按名字 } from "./file-kind.js"

export type 轮产物 =
  | { kind: "none" }
  | { kind: "unknown"; reason: "invisible_agent" | "not_observed" }
  | { kind: "some"; artifacts: Artifact[]; unknownCount: number }

export function 本轮产物(items: readonly TranscriptItem[], agentTurnId: string, list: ArtifactList, sessionKind: string): 轮产物 {
  // pty / cli 的工具不经我们的包装器，看不见；acp 借手时走我们的工具，按账本算
  if (sessionKind === "pty" || sessionKind === "cli") return { kind: "unknown", reason: "invisible_agent" }
  const end = items.findIndex((i) => i.id === agentTurnId)
  if (end < 0) return { kind: "none" }
  const 本轮工具 = new Set<string>()
  for (let i = end - 1; i >= 0; i--) {
    const it = items[i]!
    if (it.type === "turn" && it.who === "user") break
    if (it.type === "tool") 本轮工具.add(it.id)
  }
  if (本轮工具.size === 0) return { kind: "none" }
  const artifacts = list.artifacts.filter((a) => a.bornToolCallId && 本轮工具.has(a.bornToolCallId))
  const unknownCount = list.unknown.filter((u) => u.toolCallId && 本轮工具.has(u.toolCallId)).length
  if (artifacts.length === 0 && unknownCount === 0) return { kind: "none" }
  if (artifacts.length === 0 && unknownCount === 本轮工具.size) return { kind: "unknown", reason: "not_observed" }
  return { kind: "some", artifacts, unknownCount }
}

const 徽标 = (path: string) => {
  const k = 文件类按名字(path.split("/").pop() ?? path, "file")
  return k === "image" ? "IMAGE" : k === "table" ? "CSV" : k === "pdf" ? "PDF" : k === "markdown" ? "MD" : k === "code" || k === "shell" ? "CODE" : k === "notebook" ? "NB" : k.toUpperCase()
}

const 折叠阈值 = 8

export function GeneratedStrip({ 产物, onOpen }: { 产物: 轮产物; onOpen: (path: string) => void }) {
  if (产物.kind === "none") return null
  if (产物.kind === "unknown") {
    return (
      <p className="generated-strip unknown" role="note">
        <span className="label">{t("本轮产出未知")}</span>
        <span className="caveat">
          {产物.reason === "invisible_agent" ? t("外部 CLI 的文件操作不可见") : t("远端会话或非 git 工作区，探针没跑")}
        </span>
      </p>
    )
  }
  const 显示 = 产物.artifacts.slice(0, 折叠阈值)
  const 还有 = 产物.artifacts.length - 显示.length
  return (
    <div className="generated-strip" role="group" aria-label={t("本轮生成的文件")}>
      <span className="label">
        {tf("GENERATED · {0}", 产物.artifacts.length)}
        {产物.unknownCount > 0 ? <span className="caveat"> · {tf("另有 {0} 次运行产出未知", 产物.unknownCount)}</span> : null}
      </span>
      <ul className="generated-chips">
        {显示.map((a) => (
          <li key={a.path}>
            <Button variant="ghost" size="inline" className={`generated-chip${a.exists === false ? " gone" : ""}`} aria-label={a.path} onClick={() => onOpen(a.path)}>
              <span className="kind-tag">{徽标(a.path)}</span>
              <span className="name">{a.path.split("/").pop()}</span>
              {a.exists === false ? <span className="caveat">{t("已不存在")}</span> : null}
            </Button>
          </li>
        ))}
        {还有 > 0 ? <li className="caveat">{tf("还有 {0} 个，在坞的「产物」里看全部", 还有)}</li> : null}
      </ul>
    </div>
  )
}
