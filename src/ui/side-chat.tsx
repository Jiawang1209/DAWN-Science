/**
 * 坞里第八格「对话」（2026-09-24，spec `2026-09-24-侧边对话-design.md` §2）。
 *
 * 一段与主对话**同时跑**的独立会话。空着时：「另开一段」+ 同一个地方的其他会话，点一段挂进来；
 * 挂着时：头上是它的名字、运行中点、两颗**常驻**按钮（换到主区 / 从坞里拿下），其下就是主区那个
 * `ConversationView`——输入框、待发条、权限卡、`@`、附件、斜杠一样不少（§2.3：它自己跑工具，
 * 权限卡弹不出来它就卡住），只省右侧那条轮次刻度尺（`紧凑`）。
 *
 * **叶子组件只发回调**：挂谁、拿下、对调都由 `App.tsx` 做——与坞里别的格同一条纪律。
 */
import { useStore } from "@nanostores/react"
import type { ComponentProps, DragEvent, ClipboardEvent } from "react"
import type { SessionSummary } from "../protocol/index.js"
import { Button, Loader } from "./primitives.js"
import { 加号描边图标 } from "./icons.js"
import { t } from "./i18n/index.js"
import { ConversationView } from "./views.js"
import { 侧槽 } from "./state/side-chat.js"

export type 坞格对话回调 = Omit<ComponentProps<typeof ConversationView>, "session" | "items" | "待发" | "紧凑">
/** 侧槽里那两样「当前是什么」：权限卡、会话开关。坞格自己订，渲染时交给 App 那份 `对话回调` */
export type 槽现值 = {
  待答权限: ComponentProps<typeof ConversationView>["待答权限"]
  会话开关们: ComponentProps<typeof ConversationView>["会话开关们"]
}

export function SideChat(p: {
  /** 坞里挂的那段；undefined = 空态 */
  session: SessionSummary | undefined
  /** 挂着一段、但它的摘要还没到手（切项目那一拍）——说「在打开」，不冒充空态 */
  opening?: boolean | undefined
  /**
   * 此刻没有「地方」可挂（主区是一段不属于任何项目的临时会话、或什么都没选）。
   * 给了就在空态里**直说为什么**，不画一个点不出东西的空格子（规格 7.5）
   */
  noPlace?: string | undefined
  /** 同一个地方的其他会话（不含主区那段、不含已归档） */
  同处: readonly { sessionId: string; title: string; running: boolean }[]
  running: boolean
  canReadMain: boolean | undefined
  onNew: (() => void) | undefined
  /** 「另开一段」正在建（Task 6 审查 M4）：按钮置灰，双击不会建出两段 */
  newBusy?: boolean | undefined
  /**
   * 空态 / 打开中时有文件拖进来、粘进来（Task 6 审查 M2）。这时坞里没有输入框收，主区又按「落在坞格里的
   * 不归我」让开了——不接住的话文件就静静没了。接住（`preventDefault`，主区那条页面级监听就不再收）并出声
   */
  onStrayFiles?: (() => void) | undefined
  onPick: (id: string) => void
  onSwap: () => void
  onTakeOut: () => void
  /**
   * 主区那套 ConversationView 的回调，按坞里这段的 id 绑好了。空态时没有那一段，给不出来。
   * **是个函数**：侧槽的权限卡与开关由坞格自己订（审查 M1），渲染时把当下的值交回去取那一份回调
   */
  conversation: ((现: 槽现值) => 坞格对话回调) | undefined
}) {
  if (!p.session) {
    // 空态 / 打开中没有输入框：拖进来、粘进来的文件接住并出声，不许静静没了（审查 M2）
    const 有文件 = (dt: DataTransfer | null) => !!dt && [...dt.items].some((it) => it.kind === "file")
    const 接住 = {
      onDragOver: (e: DragEvent) => {
        if (有文件(e.dataTransfer)) e.preventDefault()
      },
      onDrop: (e: DragEvent) => {
        if (e.dataTransfer.files.length === 0) return
        e.preventDefault()
        p.onStrayFiles?.()
      },
      onPaste: (e: ClipboardEvent) => {
        if (e.clipboardData.files.length === 0) return
        e.preventDefault()
        p.onStrayFiles?.()
      },
    }
    if (p.opening) {
      return (
        <div className="side-chat side-chat-empty" {...接住}>
          <Loader label={t("正在打开这段对话")} />
        </div>
      )
    }
    return (
      <div className="side-chat side-chat-empty" {...接住}>
        <h2 className="side-chat-heading">{t("坞里的对话")}</h2>
        {p.noPlace ? (
          <p className="side-chat-note">{p.noPlace}</p>
        ) : (
          <>
            {p.onNew ? (
              /* 描边 + ＋：它下面那排会话也是按钮（ghost、静止时无底无框），「新建」若也用 ghost，
                 看上去就是又一行标题，悬停前认不出能点（「看不见的能力等于不存在」）。
                 ＋ 与标签栏那颗「在这里再开一段」、侧栏「新建任务」同一个图标 */
              <Button variant="outline" size="sm" className="side-chat-new" onClick={p.onNew} disabled={!!p.newBusy} aria-busy={p.newBusy ? true : undefined}>
                <加号描边图标 className="row-icon" />
                {t("另开一段")}
              </Button>
            ) : null}
            {p.同处.length === 0 ? (
              <p className="side-chat-note">{t("这里还没有别的会话")}</p>
            ) : (
              <div className="side-chat-list" role="list" aria-label={t("同一处的其他会话")}>
                {p.同处.map((x) => (
                  <div role="listitem" key={x.sessionId}>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="side-chat-pick"
                      data-running={x.running ? "1" : undefined}
                      onClick={() => p.onPick(x.sessionId)}
                    >
                      <span className="side-chat-dot" aria-hidden="true" />
                      <span className="side-chat-pick-title">{x.title}</span>
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    )
  }
  return <挂着 {...p} session={p.session} />
}

/** 拆出来是因为它要订侧槽——hooks 不许条件调用，空态那一支不该订 */
function 挂着(p: Parameters<typeof SideChat>[0] & { session: SessionSummary }) {
  const items = useStore(侧槽.$items)
  const 待发 = useStore(侧槽.$待发)
  // 权限卡与开关也订在这儿、不订在 App 上（审查 M1）：坞里弹一张卡只重渲染坞格，不拖着主区那份转录陪跑
  const 待答权限 = useStore(侧槽.$待答权限)
  const 会话开关们 = useStore(侧槽.$会话开关)
  return (
    <div className="side-chat" data-running={p.running ? "1" : undefined}>
      <header className="side-chat-head">
        <span className="side-chat-dot" aria-hidden="true" />
        <span className="side-chat-title" title={p.session.title ?? t("新对话")}>
          {p.session.title ?? t("新对话")}
        </span>
        {/* 两颗都**常驻**：悬停才出现的东西必须另有入口，而这两件事在别处没有入口 */}
        <Button variant="ghost" size="sm" className="side-chat-swap" onClick={p.onSwap}>
          {t("换到主区")}
        </Button>
        <Button variant="ghost" size="icon" className="side-chat-out" aria-label={t("从坞里拿下")} onClick={p.onTakeOut}>
          ×
        </Button>
      </header>
      {/* 不假装能看（§2.5）：ACP / CLI 的 agent 没有 read_main_session，这句一直摆着 */}
      {p.canReadMain === false ? <p className="side-chat-caveat">{t("这个 agent 看不见主对话")}</p> : null}
      {p.conversation ? (
        <ConversationView key={p.session.sessionId} session={p.session} items={items} 待发={待发} 紧凑 {...p.conversation({ 待答权限, 会话开关们 })} />
      ) : null}
    </div>
  )
}
