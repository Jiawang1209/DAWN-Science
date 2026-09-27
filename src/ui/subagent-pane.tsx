/**
 * 坞里「子 agent」那一格（2026-09-27，spec `2026-09-27-子agent看得见-design.md` §2.2 草图 A）。
 *
 * 没选中：这段对话派过的子 agent，按调用分组、最新在上；选中：格顶同一批切换条 → 转录（与主区同一套行、折叠组、贴底跟随）
 * → 交回主 agent 的结果 → 接着问（D3）。**叶子组件只发回调**：看谁、接着问都由 `App.tsx` 做。
 */
import { useMemo, useState } from "react"
import { useStore } from "@nanostores/react"
import { StickToBottom } from "use-stick-to-bottom"
import type { TranscriptItem } from "../protocol/index.js"
import { 拆子转录id } from "../protocol/index.js"
import { Button } from "./primitives.js"
import { t, tf } from "./i18n/index.js"
import { AgentMarkdown } from "./markdown.js"
import { TranscriptRow, ToolGroupRow } from "./views.js"
import { 分组转录 } from "./tool-group.js"
import { 子槽, $子agent信息, $子转录id } from "./state/subagent-view.js"
import { 主槽 } from "./state/transcript.js"
import { $侧边会话id, 侧槽 } from "./state/side-chat.js"

type 组 = Extract<TranscriptItem, { type: "subagents" }>
const 记号 = { running: "⏳", ok: "✓", error: "✗" } as const

/** `askWhy` → 一句话。逐条写成字面量：i18n 扫描只认调用点上的字符串字面量 */
function 为什么不能问(why: string | undefined): string {
  switch (why) {
    case "running":
      return t("它还在跑，跑完才能接着问")
    case "asking":
      return t("它还在答上一句")
    case "team":
      return t("团队成员请在「团队」格里给它发消息")
    default:
      return t("这一次没有留下会话文件，续不了")
  }
}

export function SubagentPane(p: {
  /**
   * 正在看的那个的父会话派过的 chip 组，按转录先后给（没选中时是主区那段的）；清单倒过来排（最新在上），
   * 同一批（同一次调用）的切换条也从这里找
   */
  groups: readonly 组[]
  onPick: (toolCallId: string, index: number) => void
  onBack: () => void
  onAsk: (text: string) => Promise<void>
}) {
  const id = useStore($子转录id)
  const items = useStore(子槽.$items)
  const 信息 = useStore($子agent信息)
  const [草稿, 设草稿] = useState("")
  const [在发, 设在发] = useState(false)

  if (!id) {
    if (p.groups.length === 0) return <p className="hint subagent-empty">{t("这段对话还没派过子 agent")}</p>
    return (
      <div className="subagent-pane subagent-list">
        {[...p.groups].reverse().map((g) => (
          <section key={g.id} className="subagent-list-group">
            {g.agents.map((a) => (
              <Button key={a.index} variant="ghost" size="sm" className="subagent-pick" data-status={a.status} onClick={() => p.onPick(g.id.slice("sub:".length), a.index)}>
                {记号[a.status]} {a.agent}
              </Button>
            ))}
          </section>
        ))}
      </div>
    )
  }

  const 拆 = 拆子转录id(id)
  const 同批 = 拆 ? p.groups.find((g) => g.id === `sub:${拆.toolCallId}`) : undefined
  const 块们 = 分组转录(items)
  const 发 = async () => {
    const 句 = 草稿.trim()
    if (!句) return
    设在发(true)
    try {
      await p.onAsk(句)
      设草稿("")
    } catch {
      // 出声由 `App` 那边做（`fail`）；这里只把草稿留着，人改一改还能再发——吞掉是为了不成一条未处理的拒绝
    } finally {
      设在发(false)
    }
  }

  return (
    <div className="subagent-pane" data-status={信息?.status} data-asking={信息?.asking ? "1" : undefined}>
      <header className="subagent-batch">
        <Button variant="ghost" size="sm" className="subagent-back" onClick={p.onBack}>
          {/* 借「产物」详情页回名单那颗的原话（2026-09-27）：「全部子 agent」会让坞格名「子 agent」成了它的子串，按名字找就找不准 */}
          {t("回到清单")}
        </Button>
        {同批 && 同批.agents.length > 1
          ? 同批.agents.map((a) => (
              <Button
                key={a.index}
                variant="ghost"
                size="sm"
                className="subagent-sibling"
                data-status={a.status}
                aria-pressed={a.index === 拆?.序号}
                onClick={() => p.onPick(拆!.toolCallId, a.index)}
              >
                {记号[a.status]} {a.agent}
              </Button>
            ))
          : null}
      </header>
      {信息 ? (
        <h2 className="subagent-title">
          {记号[信息.status]} {信息.agent}
          <span className="hint">{信息.asking ? t("在答你的问题") : 信息.status === "running" ? t("运行中") : 信息.status === "ok" ? t("完成") : t("失败")}</span>
        </h2>
      ) : null}
      <StickToBottom className="subagent-turns" resize="smooth" initial="smooth">
        <StickToBottom.Content className="subagent-turns-inner">
          {块们.map((块) =>
            块.kind === "group" ? (
              <ToolGroupRow key={块.key} tools={块.tools} />
            ) : (
              <TranscriptRow key={块.key} item={块.item} agentId={信息?.agent ?? ""} />
            ),
          )}
        </StickToBottom.Content>
      </StickToBottom>
      {信息?.status === "error" && 信息.error ? <p className="caveat">{信息.error}</p> : null}
      {信息?.result ? (
        <section className="subagent-result" aria-label={t("交回主 agent 的结果")}>
          <h3 className="subagent-result-head">{t("交回主 agent 的结果")}</h3>
          <AgentMarkdown text={信息.result.text} streaming={false} />
          {信息.result.truncated ? (
            <p className="hint">{tf("原始 {0} 字节，主 agent 只拿到前 {1} 字节", 信息.result.truncated.originalBytes, 信息.result.truncated.keptBytes)}</p>
          ) : null}
        </section>
      ) : null}
      {信息 ? (
        信息.canAsk ? (
          <form
            className="subagent-ask"
            onSubmit={(e) => {
              e.preventDefault()
              void 发()
            }}
          >
            <textarea className="control subagent-ask-text" aria-label={t("接着问它")} value={草稿} onChange={(e) => 设草稿(e.target.value)} rows={2} disabled={在发} />
            <Button type="submit" variant="outline" size="sm" className="subagent-ask-send" disabled={在发 || !草稿.trim()}>
              {t("接着问")}
            </Button>
            <p className="hint">{t("它的回答不会回到主对话")}</p>
          </form>
        ) : (
          <p className="hint subagent-ask-why">{为什么不能问(信息.askWhy)}</p>
        )
      ) : null}
    </div>
  )
}

/**
 * 「子 agent」那一格外面那一层（2026-09-27）：清单与同批切换条从哪一槽取。
 *
 * **不在 `App` 上订主槽的 `$items`**（计划原写法）：那会让整个 App 跟着每一段流式字重渲染——
 * `perf-render`（2026-09-22）刚把那条路砍掉。这里只在这一格开着时订，重渲染的只有这一格。
 * 正在看的那个属于坞里那段（侧边对话）时读侧槽，其余读主槽——切换条上的状态记号两边都是实时的。
 */
export function SubagentDock(p: Omit<Parameters<typeof SubagentPane>[0], "groups"> & { mainSessionId: string | undefined }) {
  const id = useStore($子转录id)
  const 侧id = useStore($侧边会话id)
  const 父 = id ? 拆子转录id(id)?.会话 : undefined
  const 用侧 = !!父 && 父 !== p.mainSessionId && 父 === 侧id
  const 条目 = useStore(用侧 ? 侧槽.$items : 主槽.$items)
  const groups = useMemo(() => 条目.filter((x): x is 组 => x.type === "subagents"), [条目])
  return <SubagentPane groups={groups} onPick={p.onPick} onBack={p.onBack} onAsk={p.onAsk} />
}
