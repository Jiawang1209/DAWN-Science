/**
 * 对话里的产物条 `GENERATED · N`（spec 2026-08-26-产物 §4）。
 *
 * **按轮派生，不是转录项**：这一轮 = 从这条 agent 回复往前，直到（不含）上一条 turn 为止的所有工具调用；
 * 产物按 `bornToolCallId` 对到这些工具调用（转录里 tool item 的 id 就是 pi 的 toolCallId）。
 * 三态分得开：正常 / 未知 / 混合；确认没新建**不画**。
 *
 * **老 run 没有 `toolCallId`**（v16 之前，账本还没记这一列）：这类产物既对不到任何
 * 一次工具调用，也就没法挂到某一条 agent 回复上——本组件对它们保持沉默，
 * 是设计如此，不是遗漏。它们只在坞「产物」格的会话级清单里露面（Task 11/12）。
 */
import type { Artifact, TranscriptItem } from "../protocol/index.js"
import type { ArtifactList } from "./state/catalog.js"
import { Button } from "./primitives.js"
import { t, tf } from "./i18n/index.js"

export type 轮产物 =
  | { kind: "none" }
  /** `load_failed`：清单没取到（网络 / 后端错），与「探针没跑」是两回事——不能落成 none（审查 B） */
  | { kind: "unknown"; reason: "invisible_agent" | "not_observed" | "load_failed"; error?: string }
  | { kind: "some"; artifacts: Artifact[]; unknownCount: number }

/** `endIndex`：调用方在 `items.map` 里已经知道下标时传进来，省一次 `findIndex`；给错了（那一格不是这条 turn）就回退去找 */
export function 本轮产物(items: readonly TranscriptItem[], agentTurnId: string, list: ArtifactList, sessionKind: string, endIndex?: number): 轮产物 {
  // pty / cli 的工具不经我们的包装器，看不见；acp 借手时走我们的工具，按账本算
  if (sessionKind === "pty" || sessionKind === "cli") return { kind: "unknown", reason: "invisible_agent" }
  // 清单取失败时 `sync.ts` 落的是空清单 + error：空清单是「确认没有」，这里不能照它算成 none
  if (list.error !== undefined) return { kind: "unknown", reason: "load_failed", error: list.error }
  const end = endIndex !== undefined && items[endIndex]?.id === agentTurnId ? endIndex : items.findIndex((i) => i.id === agentTurnId)
  if (end < 0) return { kind: "none" }
  const 本轮工具 = new Set<string>()
  /**
   * **边界是任意一条 turn，不分 user/agent。**
   * 转录里一条 turn = 模型的一条消息；工具调用之后模型再开口是新的一条，
   * 产物挂在工具之后那条上，前一条不再重复认领——否则同一批工具调用会被
   * 两条相邻的 agent 回复各画一次。
   */
  for (let i = end - 1; i >= 0; i--) {
    const it = items[i]!
    if (it.type === "turn") break
    if (it.type === "tool") 本轮工具.add(it.id)
  }
  if (本轮工具.size === 0) return { kind: "none" }
  const artifacts = list.artifacts.filter((a) => a.bornToolCallId && 本轮工具.has(a.bornToolCallId))
  const unknownCount = list.unknown.filter((u) => u.toolCallId && 本轮工具.has(u.toolCallId)).length
  if (artifacts.length === 0 && unknownCount === 0) return { kind: "none" }
  /**
   * **没有产物但有「不知道」，就是 unknown**——不再要求 `unknownCount === 本轮工具.size`。
   * `list.unknown` 只收账本上 `filesCreated` 缺省的那几次；不在内置白名单、也没套溯源的
   * 工具（子 agent 等）本来就对不上任何 unknown 条目，于是 `本轮工具.size` 与匹配上的
   * unknownCount 凑不齐是正常的——用旧判据会漏判，把「其实不知道」误判成 `some` 里的
   * `unknownCount`，最坏还会画出 `GENERATED · 0`。
   */
  if (artifacts.length === 0) return { kind: "unknown", reason: "not_observed" }
  return { kind: "some", artifacts, unknownCount }
}

/** **从协议已经分好的 `kind` 派生**，不再对着路径重跑一遍判类——那是重复劳动，两边分类逻辑还可能悄悄分岔 */
const 徽标 = (kind: Artifact["kind"]) =>
  kind === "image" ? "IMAGE" : kind === "table" ? "CSV" : kind === "pdf" ? "PDF" : kind === "markdown" ? "MD" : kind === "code" || kind === "shell" ? "CODE" : kind === "notebook" ? "NB" : kind.toUpperCase()

const 折叠阈值 = 8

export function GeneratedStrip({ 产物, onOpen }: { 产物: 轮产物; onOpen: (path: string) => void }) {
  if (产物.kind === "none") return null
  if (产物.kind === "unknown") {
    return (
      <p className="generated-strip unknown" role="note">
        <span className="label">{t("本轮产出未知")}</span>
        <span className="caveat">
          {产物.reason === "invisible_agent"
            ? t("外部 CLI 的文件操作不可见")
            : 产物.reason === "load_failed"
              ? `${t("产物清单没取到")}${产物.error ? `：${产物.error}` : ""}`
              : t("远端会话或非 git 工作区，探针没跑")}
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
            <Button variant="ghost" size="inline" className={`generated-chip${a.exists === false ? " gone" : ""}`} aria-label={tf("打开产物 {0}", a.path)} onClick={() => onOpen(a.path)}>
              <span className="kind-tag">{徽标(a.kind)}</span>
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
