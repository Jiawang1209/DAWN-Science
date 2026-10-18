/**
 * 坞里「子 agent」那一格（2026-09-27，spec `2026-09-27-子agent看得见-design.md` §2.2 草图 A）。
 *
 * 没选中：按调用分组、最新在上；选中：紧凑标题与同批切换条 → 左对齐过程与折叠交回原文（统一滚动）
 * → 固定续问区（D3）。工具/Markdown/思考/复制复用现有组件。**叶子组件只发回调**：看谁、接着问都由 `App.tsx` 做。
 */
import { memo, useEffect, useMemo, useRef, useState, type Ref } from "react"
import { useStore } from "@nanostores/react"
import { StickToBottom } from "use-stick-to-bottom"
import type { TranscriptItem } from "../protocol/index.js"
import { 拆子转录id } from "../protocol/index.js"
import { Button } from "./primitives.js"
import { t, tf } from "./i18n/index.js"
import { AgentMarkdown } from "./markdown.js"
import { TranscriptRow, ToolRow, CopyButton, ThinkingBlock } from "./views.js"
import { resourceLabels, subagentAnswerIds, subagentToolSummary } from "./subagent-presentation.js"
import { 返回图标, 上箭头图标, 三角图标 } from "./icons.js"
import { 子槽, $子agent信息, $子转录id } from "./state/subagent-view.js"
import { 主槽 } from "./state/transcript.js"
import { $侧边会话id, 侧槽 } from "./state/side-chat.js"

type 组 = Extract<TranscriptItem, { type: "subagents" }>
const 记号 = { running: "⏳", ok: "✓", error: "✗" } as const
type 状态 = keyof typeof 记号

/** 状态的一个词。逐条写成字面量：i18n 扫描只认调用点上的字符串字面量 */
function 状态词(s: 状态): string {
  return s === "running" ? t("运行中") : s === "ok" ? t("完成") : t("失败")
}

/**
 * 清单与切换条上那颗的可及名字：「看 explorer（完成）」（2026-09-27 审查）。
 * 原先就是可见文案「✓ explorer」——那是主区 chip「✓ explorer完成」的**子串**，按名字找就同时命中两颗。
 * 带「看」、状态放括号里：两边谁也不是谁的一部分。
 */
const 看它 = (agent: string, s: 状态) => tf("看 {0}（{1}）", agent, 状态词(s))

/** `askWhy` → 一句话。逐条写成字面量：i18n 扫描只认调用点上的字符串字面量 */
function 为什么不能问(why: string | undefined): string {
  switch (why) {
    case "running":
      return t("它还在跑，跑完才能接着问")
    case "asking":
      return t("它还在答上一句")
    case "team":
      return t("团队成员请在「团队」格里给它发消息")
    // 会话文件太大（过程没读）不在这里：文件在，后端照给 canAsk——续问在子进程里读它，不经界面
    case "no-transcript":
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
  agentNames?: Readonly<Record<string, string>> | undefined
  onPick: (toolCallId: string, index: number) => void
  onBack: () => void
  onAsk: (text: string) => Promise<void>
}) {
  const id = useStore($子转录id)
  const items = useStore(子槽.$items)
  const 信息 = useStore($子agent信息)
  const [草稿, 设草稿] = useState("")
  const [在发, 设在发] = useState(false)
  const 清单ref = useRef<HTMLDivElement>(null)
  const 回ref = useRef<HTMLButtonElement>(null)
  /**
   * 焦点（2026-09-27 审查）：打开一个（从「没在看」到「在看」）落在「回到清单」；回到清单落在第一颗。
   * **同批里换人不动**——人正按着切换条，抢走焦点就是把他的手拨开。挂载时就在看（点 chip 开的）也算「打开」。
   */
  const 上一个 = useRef<string | undefined>(undefined)
  useEffect(() => {
    const 前 = 上一个.current
    上一个.current = id
    if (id && !前) 回ref.current?.focus()
    else if (!id && 前) 清单ref.current?.querySelector<HTMLElement>(".subagent-pick")?.focus()
  }, [id])

  if (!id) {
    if (p.groups.length === 0) return <p className="hint subagent-empty">{t("这段对话还没派过子 agent")}</p>
    return <SubagentList ref={清单ref} groups={p.groups} onPick={p.onPick} />
  }

  const 拆 = 拆子转录id(id)
  const 同批 = 拆 ? p.groups.find((g) => g.id === `sub:${拆.toolCallId}`) : undefined
  const 名称 = 信息 ? p.agentNames?.[信息.agent] ?? 信息.agent : ""
  const 答复们 = subagentAnswerIds(items)
  const 资源名称 = resourceLabels(items)
  const 首句 = items.find(x => x.type === "turn" && x.who === "user")
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
      <header className="subagent-header">
        <Button ref={回ref} variant="ghost" size="sm" className="subagent-back" onClick={p.onBack}>
          {/* 借「产物」详情页回名单那颗的原话（2026-09-27）：「全部子 agent」会让坞格名「子 agent」成了它的子串，按名字找就找不准 */}
          <返回图标 />{t("回到清单")}
        </Button>
        {信息 ? <><h2 className="subagent-title" title={信息.agent}>{名称}</h2><span className="subagent-status" data-status={信息.status}>{记号[信息.status]} {信息.asking ? t("在答你的问题") : 状态词(信息.status)}</span></> : null}
      </header>
        {同批 && 同批.agents.length > 1
          ? <nav className="subagent-batch">{同批.agents.map((a) => (
              <Button
                key={a.index}
                variant="ghost"
                size="sm"
                className="subagent-sibling"
                data-status={a.status}
                aria-pressed={a.index === 拆?.序号}
                aria-label={看它(a.agent, a.status)}
                onClick={() => p.onPick(拆!.toolCallId, a.index)}
              >
                {记号[a.status]} {p.agentNames?.[a.agent] ?? a.agent}
              </Button>
            ))}</nav>
          : null}
      {信息?.task ? <details className="subagent-task"><summary><span>{t("任务")}</span><span className="subagent-task-preview">{信息.task}</span><三角图标 className="subagent-task-caret"/></summary><CopyButton text={信息.task} label={t("复制我说的这段")}/><AgentMarkdown text={信息.task} streaming={false}/></details> : null}
      <StickToBottom className="subagent-turns" resize="smooth" initial="smooth">
        <StickToBottom.Content className="subagent-turns-inner">
          {items.map(item => {
            if (item.type === "tool") return <ToolRow key={item.id} item={item} summary={subagentToolSummary(item, 资源名称)}/>
            if (item.type !== "turn") return <TranscriptRow key={item.id} item={item} agentId={信息?.agent ?? ""}/>
            if (item === 首句 && item.text === 信息?.task && !item.images?.length && !item.thinking) return null
            if (!item.text && !item.thinking && !item.images?.length) return null
            const answer = 答复们.has(item.id)
            return <article key={item.id} className={`subagent-message ${item.who}${answer ? " answer" : ""}`} data-turn-id={item.id}>
              {item.who === "user" ? <div className="subagent-user-head"><span className="subagent-message-label">{t("你")}</span><CopyButton text={item.text} label={t("复制我说的这段")}/></div> : <span className="sr-only">{名称}</span>}
              {answer ? <div className="subagent-answer-head"><span>{t("答复")}</span><CopyButton text={item.text} label={t("复制这段回答")}/></div> : null}
              {item.who === "agent" && item.final && item.text && !answer ? <CopyButton text={item.text} label={t("复制这段回答")}/> : null}
              {item.thinking ? <ThinkingBlock text={item.thinking} ms={item.thinkingMs}/> : null}
              {item.images?.length ? <div className="turn-images">{item.images.map((src, index) => <img key={index} className="turn-image" src={src} alt={tf("这一轮附的第 {0} 张图", index + 1)}/>)}</div> : null}
              <AgentMarkdown text={item.text} streaming={!item.final}/>
            </article>
          })}
      {信息?.status === "error" && 信息.error ? <p className="caveat">{信息.error}</p> : null}
      {信息?.result ? (
        <details className="subagent-result" aria-label={t("交回主 agent 的结果")}>
          <summary className="subagent-result-head">{t("交回主 agent 的结果")}</summary>
          <CopyButton text={信息.result.text} label={t("复制交回内容")}/>
          <AgentMarkdown text={信息.result.text} streaming={false} />
          {信息.result.truncated ? (
            <p className="hint">{tf("原始 {0} 字节，主 agent 只拿到前 {1} 字节", 信息.result.truncated.originalBytes, 信息.result.truncated.keptBytes)}</p>
          ) : null}
        </details>
      ) : null}
        </StickToBottom.Content>
      </StickToBottom>
      {信息 ? (
        信息.canAsk ? (
          <form
            className="subagent-ask"
            onSubmit={(e) => {
              e.preventDefault()
              void 发()
            }}
          >
            <div className="subagent-composer">
              <textarea className="control subagent-ask-text" aria-label={t("接着问它")} placeholder={t("继续向这位子 Agent 提问…")} value={草稿} onChange={(e) => 设草稿(e.target.value)} rows={2} disabled={在发} />
            <div className="subagent-composer-footer"><p className="hint">{t("它的回答不会回到主对话")}</p><Button type="submit" variant="primary" size="sm" className="subagent-ask-send" disabled={在发 || !草稿.trim()}>
              <上箭头图标 />{t("接着问")}
            </Button></div></div>
          </form>
        ) : (
          <p className="hint subagent-ask-why">{为什么不能问(信息.askWhy)}</p>
        )
      ) : null}
    </div>
  )
}

/**
 * 没选中时的清单：这段对话派过的，按调用分组、最新在上（2026-09-27）。`memo`：`groups` 身份不变就不重画——
 * 外面那一层只在子 agent 组本身换了身份时才给新的数组。
 */
const SubagentList = memo(function SubagentList(p: {
  ref: Ref<HTMLDivElement>
  groups: readonly 组[]
  onPick: (toolCallId: string, index: number) => void
}) {
  return (
    <div ref={p.ref} className="subagent-pane subagent-list">
      {[...p.groups].reverse().map((g) => (
        <section key={g.id} className="subagent-list-group">
          {g.agents.map((a) => (
            <Button
              key={a.index}
              variant="ghost"
              size="sm"
              className="subagent-pick"
              data-status={a.status}
              aria-label={看它(a.agent, a.status)}
              onClick={() => p.onPick(g.id.slice("sub:".length), a.index)}
            >
              {记号[a.status]} {a.agent}
            </Button>
          ))}
        </section>
      ))}
    </div>
  )
})

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
  /**
   * 只认子 agent 组本身的身份（2026-09-27 审查）：流式字每一拍都给 `条目` 一个新数组，
   * 但子 agent 组没变时（`setList` 保住了没变的条目身份）这里交出上一次那个数组——清单、切换条都不跟着重画。
   */
  const 上次 = useRef<readonly 组[]>([])
  const groups = useMemo(() => {
    const 新 = 条目.filter((x): x is 组 => x.type === "subagents")
    const 旧 = 上次.current
    if (新.length === 旧.length && 新.every((g, i) => g === 旧[i])) return 旧
    上次.current = 新
    return 新
  }, [条目])
  return <SubagentPane groups={groups} agentNames={!id || 父 === p.mainSessionId ? p.agentNames : undefined} onPick={p.onPick} onBack={p.onBack} onAsk={p.onAsk} />
}
