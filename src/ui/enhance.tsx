/**
 * composer 上那颗「✦ 增强 ▾」（提示词增强 E2，2026-08-21）。
 *
 * 设计：`docs/superpowers/specs/2026-08-21-提示词增强-design.md`「界面」一节。
 * 点文字用当前档增强；点小箭头换档（基础 / 标准 / 专家，记在 `dawn.global.enhance-mode`，只在菜单里显示）；
 * 增强中变「取消」；改完变「撤回」，**撤回最多 5 层、敲键盘也不消失**
 * （参考项目那条「一敲键就没」不抄——人改两个字再想撤回是常事）。
 *
 * 草稿的读写由调用方给（`draft` / `setDraft`）：对话屏的草稿住在 `$drafts`，空态屏住在 useState，
 * 这颗按钮不关心住哪儿。
 *
 * **撤回栈的作用域是「框里这一版草稿」**（2026-09-08 作者报的）：
 * 那句话发出去之后，栈必须跟着它一起没。上一版没有这条，于是
 * *「对话提交上去了，竟然还[能]撤销，我撤销之后竟然还是原来的对话」*——
 * 按下「撤回」，已经发走的那句话的**上一版**被填回了空框。
 * 作用域由调用方用 `重置记号` 声明（学 `$drafts` 那条：持久化状态必须在 key 里声明作用域）。
 */
import { useEffect, useRef, useState } from "react"
import { atom } from "nanostores"
import { Button, Row } from "./primitives.js"
import { t, tf } from "./i18n/index.js"
import { 下拉图标, 星图标 } from "./icons.js"

export type EnhanceMode = "basic" | "standard" | "expert"
export const ENHANCE_MODE_KEY = "dawn.global.enhance-mode"

export interface EnhanceOutcome {
  text: string
  note?: string | undefined
  usedContext: { rounds?: [number, number]; docs?: string[]; code?: string[] } | null
  /** 这次改写用的是哪个模型（`deepseek/deepseek-chat` 这种）。7.33 起 */
  model: string
  /**
   * **这次是不是借了别人的模型**（7.33，2026-09-09 作者问出来的）。
   *
   * native 会话用的就是它此刻那个模型（= 你屏幕上那颗 pill），`false`；
   * cli / ACP 会话与空态屏够不着自己的模型，借配置里第一个 native，`true`。
   */
  borrowed: boolean
}

const 档名: Record<EnhanceMode, () => string> = {
  basic: () => t("基础"),
  standard: () => t("标准"),
  expert: () => t("专家"),
}
const 档说明: Record<EnhanceMode, () => string> = {
  basic: () => t("只改写，不带参考"),
  standard: () => t("带上本会话里相关的几轮对话"),
  expert: () => t("再加工作区里相关的文档与代码（只在像开发任务时）"),
}

/**
 * **快捷键的写法**（2026-09-29）。按钮的悬停提示与命令面板那条共用这一处——两处写法不同就是两个名字。
 * 绑定本身不在这里：在 `EnhanceControl` 的 keydown 里。
 */
export const 优化输入快捷键: string =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? "⌘⇧E" : "Ctrl+Shift+E"

/**
 * **主区那颗「优化输入」此刻能不能按**（2026-09-29，命令面板那条读它）。
 *
 * 权威是按钮自己：草稿在哪、有没有 key、是不是正在改写，只有它同时知道
 * （空态屏的草稿住在它自己的 useState 里，App 看不见）。所以由**主区那颗**挂上时写、卸下时清：
 *   - `undefined` = 眼前没有主区输入框（设置屏之类）；
 *   - `{ unavailable }` = 在，但此刻按不了，写明是哪一种；
 *   - `{}` = 能按。
 * 坞里那颗不写：命令面板那条只对主区那段说话（与拖放「落在坞里的归坞里、其余归主区」同一条分家）。
 */
export const $优化输入 = atom<{ unavailable?: string | undefined } | undefined>(undefined)

/** 主区那颗挂上时登记的「去增强」。命令面板经 `请求优化输入` 叫它——**与点那颗按钮是同一个函数** */
let 主区去增强: (() => void) | undefined
/** 此刻登记着的是哪一颗（审查 09-29）：卸下时只清自己那份——后挂上的那颗不会被先卸下的这颗清掉 */
let 主区是谁: object | undefined

/**
 * 命令面板「优化输入」的唯一出口：叫主区那颗按钮去改写框里那一版草稿。
 * 没挂着就什么都不做（面板那条此时已列成不可用、写了原因）。
 */
export function 请求优化输入(): void {
  主区去增强?.()
}

export function loadEnhanceMode(): EnhanceMode {
  try {
    const v = localStorage.getItem(ENHANCE_MODE_KEY)
    return v === "basic" || v === "standard" || v === "expert" ? v : "standard"
  } catch {
    return "standard"
  }
}

export function EnhanceControl({
  draft,
  setDraft,
  enhance,
  cancel,
  reason,
  重置记号,
  onProblem,
  onNote,
  坞里,
}: {
  draft: string
  setDraft: (text: string) => void
  /** 真去改写。`requestId` 给取消用 */
  enhance: (req: { text: string; mode: EnhanceMode; requestId: string }) => Promise<EnhanceOutcome>
  cancel: (requestId: string) => Promise<unknown>
  /**
   * **做不了时灰着、说理由，不再整颗消失**（2026-08-28 作者定的：「界面里面还是要有的」）。
   * 看不见的能力等于不存在——没 key 的人本来就该在这里看到「填一个就能用」。
   */
  reason?: string | undefined
  /**
   * **框里这一版草稿的身份**。它一变，撤回栈就清空。
   *
   * 调用方在「这句话已经发出去了」那一刻换一个值——撤回栈的寿命到此为止。
   * 不给的话栈就一直留着，那正是 2026-09-08 那条缺陷。
   */
  重置记号?: string | number | undefined
  /** 出错往 composer 下那条说 */
  onProblem: (msg: string | undefined) => void
  /** 「带上了什么 / 为什么没带」也往 composer 下面说——行内放不下 */
  onNote: (msg: string | undefined) => void
  /**
   * 这颗长在坞里那段对话上（侧边对话）。**两段对话同时在屏上时，快捷键与命令面板只归一颗**：
   * 焦点在坞格（`.side-chat`）里时归坞里那颗，其余归主区那颗——此前两颗都在 window 上听 ⌘⇧E，
   * 坞开着时按一下两个框同时被改写。命令面板那条只叫主区那颗。
   */
  坞里?: boolean | undefined
}) {
  const [mode, 设mode] = useState<EnhanceMode>(loadEnhanceMode)
  const [菜单, 设菜单] = useState(false)
  const [忙, 设忙] = useState<string | undefined>(undefined)
  /** 撤回栈：每次增强前的草稿压一层，最多 5 层 */
  const [栈, 设栈] = useState<string[]>([])
  const 当前请求 = useRef<string | undefined>(undefined)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!菜单) return
    const away = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) 设菜单(false)
    }
    document.addEventListener("pointerdown", away)
    return () => document.removeEventListener("pointerdown", away)
  }, [菜单])

  /**
   * **草稿换了一版（多半是发出去了）→ 这一颗按钮身上的一切都作废。**
   *
   * 两样一起收，因为它们描述的是同一件事——「框里这一版草稿」：
   *
   *   - **撤回栈**：留着的话，按下「撤回」会把**已经发走的那句话的上一版**
   *     填回空框（2026-09-08 作者报的那一条）。
   *   - **还在飞的那一次改写**：不作废的话，它回来时会 `setDraft(r.text)`——
   *     把**已经发出去的那句话的改写版**灌进刚清空的框里，并且顺手立起一颗
   *     「撤回」。这是同一条缺陷的另一半：点了「优化输入」紧接着按回车就能撞上。
   *     （上一版特意写了「只清栈、不碰改写中」，理由是那件事有自己的终点——
   *     但那个终点会把结果写进**下一版**草稿里，所以它并不独立。）
   *
   * `cancel` 只在真有在飞的请求时才叫：挂载那一次也会跑这个 effect。
   */
  useEffect(() => {
    设栈([])
    const 在飞的 = 当前请求.current
    if (!在飞的) return
    当前请求.current = undefined
    设忙(undefined)
    void cancel(在飞的).catch(() => {})
    // cancel 是调用方给的，身份每次渲染都可能变；这里只该跟着「哪一版草稿」跑
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [重置记号])

  const 换档 = (m: EnhanceMode) => {
    设mode(m)
    设菜单(false)
    try {
      localStorage.setItem(ENHANCE_MODE_KEY, m)
    } catch {
      /* 记不住就记不住，这次仍然生效 */
    }
  }

  const 去增强 = async () => {
    const text = draft.trim()
    if (!text || 忙) return
    const requestId = `enh-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`
    当前请求.current = requestId
    设忙(t("改写中"))
    onProblem(undefined)
    onNote(undefined)
    const 之前 = draft
    try {
      const r = await enhance({ text, mode, requestId })
      if (当前请求.current !== requestId) return // 已取消
      设栈((前) => [...前, 之前].slice(-5))
      setDraft(r.text)
      onNote(说这一次(r))
    } catch (e) {
      if (当前请求.current !== requestId) return
      onProblem(tf("增强失败：{0}", e instanceof Error ? e.message : String(e)))
    } finally {
      if (当前请求.current === requestId) {
        当前请求.current = undefined
        设忙(undefined)
      }
    }
  }

  const 去取消 = () => {
    const id = 当前请求.current
    if (!id) return
    当前请求.current = undefined
    设忙(undefined)
    void cancel(id).catch(() => {})
  }

  const 撤回 = () => {
    const 上 = 栈.at(-1)
    if (上 === undefined) return
    设栈((前) => 前.slice(0, -1))
    setDraft(上)
    onNote(undefined)
  }

  // ⌘⇧E。焦点落在坞格里的归坞里那颗，其余归主区那颗（见 `坞里`）
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "e") {
        const 在坞里 = e.target instanceof Element && !!e.target.closest(".side-chat")
        if (在坞里 !== !!坞里) return
        e.preventDefault()
        if (忙) 去取消()
        else void 去增强()
      }
    }
    window.addEventListener("keydown", h)
    return () => window.removeEventListener("keydown", h)
  })

  // 命令面板那条：主区那颗登记「去增强」、报上能不能按。每次渲染都换成最新的闭包（草稿、档位都在里面）
  const 我 = useRef({})
  useEffect(() => {
    if (坞里) return
    主区是谁 = 我.current
    主区去增强 = () => void 去增强()
  })
  const 为何不能 = reason ?? (忙 ? t("正在改写，等它回来") : !draft.trim() ? t("先写点什么再优化") : undefined)
  useEffect(() => {
    if (坞里) return
    $优化输入.set(为何不能 ? { unavailable: 为何不能 } : {})
  }, [坞里, 为何不能])
  useEffect(() => {
    if (坞里) return
    const 自己 = 我.current
    return () => {
      if (主区是谁 !== 自己) return
      主区是谁 = undefined
      主区去增强 = undefined
      $优化输入.set(undefined)
    }
  }, [坞里])

  if (reason) {
    return (
      <div className="enhance-control">
        <Button variant="ghost" size="sm" className="enhance-main" disabled aria-label={reason}>
          <星图标 className="row-icon" /> <span className="enhance-word">{t("优化输入")}</span>
        </Button>
        <span className="enhance-tip" aria-hidden="true">
          {`${t("优化输入")} · ${优化输入快捷键}`}
          <span className="enhance-tip-why">{reason}</span>
        </span>
      </div>
    )
  }
  const 空 = !draft.trim()

  return (
    <div className="enhance-control" ref={box}>
      {/**
        * **一颗按钮、两个点击区**（2026-08-21 作者定的：档位与增强合并，省位置）：
        * 点文字 = 增强（忙时 = 放弃）；点右边那个小箭头 = 换档。档位只在菜单里看得见。
        */}
      {忙 ? (
        <Button variant="ghost" size="sm" className="enhance-main busy" onClick={去取消}>
          <span className="enhance-spin" aria-hidden="true" />
          <span>{tf("{0}…放弃", 忙)}</span>
        </Button>
      ) : (
        <Button
          variant="ghost"
          size="sm"
          className="enhance-main"
          disabled={空}
          /* 灰的理由进标签，不再常驻一句话在旁边（2026-08-22 作者：「后面的先写点什么，有点儿不好看」） */
          aria-label={空 ? t("先写点什么再优化") : t("优化输入")}
          aria-keyshortcuts="Meta+Shift+E Control+Shift+E"
          onClick={() => void 去增强()}
        >
          <星图标 className="row-icon" /> <span className="enhance-word">{t("优化输入")}</span>
        </Button>
      )}
      {/**
        * **悬停提示：名字 + 快捷键**（2026-09-29 作者定的）。坞那么窄时这颗只剩一颗星（styles.css 那条容器查询），
        * 光看星认不出是什么——自己画、不用原生 `title`（设计契约禁的）。读屏走按钮自己的 `aria-label` / `aria-keyshortcuts`，
        * 所以这里 `aria-hidden`。悬停才出现，所以它另有入口：命令面板「优化输入」。忙时不画（那颗已经写着「…放弃」）
        */}
      {忙 ? null : (
        <span className="enhance-tip" aria-hidden="true">
          {`${t("优化输入")} · ${优化输入快捷键}`}
          {空 ? <span className="enhance-tip-why">{t("先写点什么再优化")}</span> : null}
        </span>
      )}
      <Button
        variant="ghost"
        size="icon"
        className="enhance-mode"
        aria-haspopup="menu"
        aria-expanded={菜单}
        aria-label={tf("档位：{0}", 档名[mode]())}
        onClick={() => 设菜单((v) => !v)}
      >
        <下拉图标 />
      </Button>
      {栈.length > 0 ? (
        <Button variant="ghost" size="sm" className="enhance-undo" onClick={撤回}>
          {栈.length > 1 ? tf("撤回（{0}）", 栈.length) : t("撤回")}
        </Button>
      ) : null}
      {菜单 ? (
        <div className="agent-menu enhance-menu" role="menu" aria-label={t("选档位")}>
          <ul>
            {(["basic", "standard", "expert"] as const).map((m) => (
              <li key={m}>
                <Row role="menuitemradio" aria-checked={m === mode} active={m === mode} onClick={() => 换档(m)}>
                  <span className="sess">
                    <span className="name">{档名[m]()}</span>
                    <span className="sub">{档说明[m]()}</span>
                  </span>
                </Row>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}

/**
 * 那行灰字最终说什么（2026-09-09）。
 *
 * 两件事拼一行：**这次谁改的**、**带了什么上下文**。
 *
 * **「谁改的」只在借了别人的模型时才说。** 没借的时候那就是你屏幕上那颗 pill，
 * 再说一遍是纯噪音——而噪音多了，真正该被看见的那一句就沉下去了。
 * 借了的时候必须说：作者 2026-09-09 问「优化输入是不是锁死在某一个 LLM」，
 * 根子就在这儿——**在 claude / codex 那种会话里它确实换了一个人改写，而界面一个字都不说。**
 *
 * 抽成纯函数是因为它是一条**可判定的规则**，不该只能靠打开界面去看。
 */
export function 说这一次(r: Pick<EnhanceOutcome, "note" | "usedContext" | "model" | "borrowed">): string | undefined {
  const 段: string[] = []
  if (r.borrowed) 段.push(tf("这段对话的 agent 没有可直接调用的模型，用「{0}」改的", r.model))
  if (r.note) 段.push(tf("这次没带上下文：{0}", r.note))
  else if (r.usedContext) 段.push(说参考(r.usedContext))
  return 段.length > 0 ? 段.join("；") : undefined
}

function 说参考(u: NonNullable<EnhanceOutcome["usedContext"]>): string {
  const 段: string[] = []
  if (u.rounds) 段.push(tf("对话第 {0}–{1} 轮", u.rounds[0], u.rounds[1]))
  if (u.docs?.length) 段.push(tf("{0} 份文档", u.docs.length))
  if (u.code?.length) 段.push(tf("{0} 个代码文件", u.code.length))
  return tf("带上了：{0}", 段.join("、"))
}
