/**
 * 上下文仪表（2026-09-27，spec `2026-09-27-上下文用量与压缩-design.md` §2.1）。
 *
 * 输入卡附栏右侧、权限那颗左边，**常驻**：它说的是「这一句发出去时模型的桌面还剩多大」，属于「要发出去的这件事」（D4）。
 * 点开是一个上拉弹层（与「权限」那颗同一副做法：点外面、Esc 关）：真数、估的那一截、自动压缩线、「现在压缩」。
 *
 * ## 三条不许
 * - **不拿字节凑 token**：还没有过回复时写「—」，不先估一个（pi 那时只数对话，系统提示词与工具说明不在里面）。
 * - **不给外部 agent 估数**：ACP / 外部 CLI 自己管上下文，写「读不到」（D5）。
 * - **不轮询**：换会话、这一轮做完、一次压缩结束、打开弹层——四个时刻各取一次（`use上下文用量`）。
 */
import { useCallback, useEffect, useRef, useState, type FocusEvent } from "react"
import { Button } from "./primitives.js"
import { t, tf } from "./i18n/index.js"
import { formatTokens } from "./format.js"
import type { ContextUsage } from "./panels.js"
import type { SessionSummary } from "../protocol/index.js"

export type 仪表档 = "normal" | "warn" | "over" | "dim"

export interface 仪表读数 {
  档: 仪表档
  /** 按钮上「上下文」之后那一截 */
  值: string
  /** 弹层里一行一行的说明（第一行是主数） */
  细节: string[]
  已用?: number | undefined
  上限?: number | undefined
  线?: number | undefined
  /** 这一段能不能在 DAWN 里压（外部 agent 不能） */
  能压: boolean
}

/** 提醒档从自动压缩线的 85% 起。按线算、不按上限算：线随模型不同（上限 − 留给摘要的那份） */
export const 提醒比例 = 0.85

/**
 * 读数（纯函数，单测直接打）。`kind` 决定画不画、能不能压；`u` 缺省 = 还没取到；`错` = 取数失败的原因。
 */
export function 读仪表(kind: SessionSummary["kind"], u: ContextUsage | undefined, 错?: string): 仪表读数 | undefined {
  if (kind === "kernel" || kind === "pty") return undefined
  if (kind !== "native") {
    return { 档: "dim", 值: t("读不到"), 细节: [t("这是外部 agent，它自己管上下文与压缩；DAWN 读不到它用了多少")], 能压: false }
  }
  if (错) return { 档: "dim", 值: "—", 细节: [tf("没取到：{0}", 错)], 能压: true }
  if (!u) return { 档: "dim", 值: "—", 细节: [t("还没取到")], 能压: true }
  const 上限 = u.contextWindow
  const 线 = u.compactAt
  const 线说 = 线 !== undefined && 上限 !== undefined ? [tf("到 {0} tokens 会自动压缩（给摘要留 {1}）", formatTokens(线), formatTokens(上限 - 线))] : []
  if (u.afterCompaction) {
    return { 档: "normal", 值: t("已压缩"), 细节: [t("刚压缩过，等下一次回复才知道现在用了多少"), ...线说], 上限, 线, 能压: true }
  }
  if (u.usedTokens === undefined) {
    return { 档: "normal", 值: "—", 细节: [t("第一次回复之后才知道——系统提示词与工具说明也占地方，只数对话会少算"), ...线说], 上限, 线, 能压: true }
  }
  const 已用 = u.usedTokens
  if (!上限) {
    return { 档: "normal", 值: formatTokens(已用), 细节: [tf("已用 {0} tokens", formatTokens(已用)), t("这个模型没报上限，算不出比例，也不会自动压缩")], 已用, 能压: true }
  }
  const 比 = (已用 / 上限) * 100
  const 百分 = 比 < 1 ? "<1%" : `${Math.round(比)}%`
  const 档: 仪表档 = 线 !== undefined && 已用 >= 线 ? "over" : 线 !== undefined && 已用 >= 线 * 提醒比例 ? "warn" : "normal"
  return {
    档,
    值: u.estimated ? tf("约 {0}", 百分) : 百分,
    细节: [
      tf("{0} / {1} tokens", formatTokens(已用), formatTokens(上限)),
      ...(u.estimated ? [t("其中有一截是估的：最近一次回复之后新加的内容按字数估")] : []),
      ...(档 === "over" ? [t("已过自动压缩线：下一次回复之前会先压缩")] : 档 === "warn" ? [t("快满了")] : []),
      ...线说,
    ],
    已用,
    上限,
    线,
    能压: true,
  }
}

/** 整句是不是 `/compact`（后面可以跟一句要保留什么）。大小写不敏感；`/compactx`、句中提到的都不算 */
export function 是压缩命令(text: string): { instructions?: string } | undefined {
  const m = /^\/compact(?:\s+([\s\S]*))?$/i.exec(text.trim())
  if (!m) return undefined
  const 要求 = m[1]?.trim()
  return 要求 ? { instructions: 要求 } : {}
}

/**
 * 这一段的上下文用量（2026-09-27）。**不轮询**，四个时刻各取一次：换会话、这一轮做完（`busy` 由真变假）、
 * 一次压缩结束（`压缩记号` 变了）、打开弹层（调返回的 `重取`）。
 *
 * `取` 走 ref：调用方（App 的 `对话回调`）每次渲染都造一个新函数，放进依赖会让 effect 每次渲染都重取。
 * 取回来时会话已经换了的，丢掉（与 `loadContextUsage` 的身份守卫同一个理由）。**失败要出声**：原因交给 `读仪表` 写进弹层。
 */
export function use上下文用量(
  sessionId: string,
  取: (() => Promise<ContextUsage>) | undefined,
  busy: boolean,
  压缩记号: string,
): { usage: ContextUsage | undefined; 错: string | undefined; 重取: () => void } {
  const [态, 设态] = useState<{ id: string; usage?: ContextUsage; 错?: string } | undefined>(undefined)
  const 取ref = useRef(取)
  取ref.current = 取
  const 当前 = useRef(sessionId)
  当前.current = sessionId
  const 有取 = !!取
  const 重取 = useCallback(() => {
    const f = 取ref.current
    if (!f) return
    const id = 当前.current
    f().then(
      (usage) => {
        if (当前.current === id) 设态({ id, usage })
      },
      (e: unknown) => {
        if (当前.current === id) 设态({ id, 错: e instanceof Error ? e.message : String(e) })
      },
    )
  }, [])
  /**
   * **一件事只取一次**（2026-09-27 复审）：此前三个 effect 各管一个时刻，而这几个时刻常常同一次渲染一起到——
   * 换到一段压缩过的会话（换会话 + 记号变了）、压缩结束（记号变了 + `busy` 落下：`说着` 含「正在压缩」），
   * 各取一次就是两三次。合成一个 effect、按上一次的值判断：
   * 换会话 → 取；否则 `busy` 真变假 → 取；否则记号变了且不忙 → 取（没有 start 的 end）。压缩开始（变忙）不取——那时的数马上就过时。
   */
  const 上次 = useRef<{ id: string; 有取: boolean; busy: boolean; 记号: string } | undefined>(undefined)
  useEffect(() => {
    const 前 = 上次.current
    上次.current = { id: sessionId, 有取, busy, 记号: 压缩记号 }
    const 该取 = !前 || 前.id !== sessionId || 前.有取 !== 有取 ? true : 前.busy && !busy ? true : 前.记号 !== 压缩记号 && !busy
    if (该取) 重取()
  }, [sessionId, 有取, busy, 压缩记号, 重取])
  const 这段 = 态?.id === sessionId ? 态 : undefined
  return { usage: 这段?.usage, 错: 这段?.错, 重取 }
}

/** 按钮上的小圆环：已用 / 上限。拿不到比例时画一个空环——**不画一个假的满格** */
function 圆环({ 已用, 上限 }: { 已用?: number | undefined; 上限?: number | undefined }) {
  const 比 = 已用 !== undefined && 上限 ? Math.min(1, 已用 / 上限) : 0
  const 周 = 2 * Math.PI * 6
  return (
    <svg className="ctx-meter-ring" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="6" className="ctx-meter-ring-track" />
      <circle cx="8" cy="8" r="6" className="ctx-meter-ring-fill" strokeDasharray={`${比 * 周} ${周}`} transform="rotate(-90 8 8)" />
    </svg>
  )
}

export function ContextMeter({
  读数,
  onCompact,
  不能压的原因,
  onOpen,
}: {
  读数: 仪表读数
  /** 「现在压缩」。不给 = 不画那颗（外部 agent、或没有会话） */
  onCompact?: (() => Promise<void>) | undefined
  /** 给了就把「现在压缩」灰着，并把这句写在旁边（D8：这一轮还在跑） */
  不能压的原因?: string | undefined
  /** 弹层打开时：要一次新数 */
  onOpen?: (() => void) | undefined
}) {
  /**
   * 两种开法（作者 2026-09-27：「悬浮这个按钮之后，可以看到我们的上下文的用量」）：
   * - **悬停 / 键盘聚焦 = 看一眼**：移开就收。离开时留 150ms，让指针能从按钮挪进弹层去点「现在压缩」。
   * - **点一下 = 钉住**：点外面、Esc、再点一下才收。触控板轻点、读屏都走这条——悬停不是唯一入口。
   * 按钮本身常驻、写着比例，所以这不是「悬停才出现的能力」；悬停只是更快地看细节。
   */
  const [看一眼, 设看一眼] = useState(false)
  const [钉住, 设钉住] = useState(false)
  const 开着 = 看一眼 || 钉住
  const 设开着 = (v: boolean) => {
    设钉住(v)
    if (!v) 设看一眼(false)
  }
  const 收的计时 = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const 进 = () => {
    clearTimeout(收的计时.current)
    if (!开着) {
      onOpen?.()
      设出错(undefined)
    }
    设看一眼(true)
  }
  const 出 = () => {
    clearTimeout(收的计时.current)
    收的计时.current = setTimeout(() => 设看一眼(false), 150)
  }
  /**
   * 焦点挂在**整块**上、不挂在按钮上（2026-09-27 复审 I1）：挂在按钮上时，Tab 进「现在压缩」按钮先失焦，
   * 150ms 后弹层带着焦点一起卸掉，焦点掉回 body。React 的 onFocus / onBlur 会冒泡；焦点只是在块里挪的那次失焦不算。
   */
  const 失焦 = (e: FocusEvent) => {
    if (e.relatedTarget instanceof Node && 盒.current?.contains(e.relatedTarget)) return
    出()
  }
  useEffect(() => () => clearTimeout(收的计时.current), [])
  const [压着, 设压着] = useState(false)
  const [出错, 设出错] = useState<string | undefined>(undefined)
  const 盒 = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!钉住) return
    const 关 = (e: MouseEvent) => {
      if (!盒.current?.contains(e.target as Node)) 设开着(false)
    }
    document.addEventListener("mousedown", 关)
    return () => document.removeEventListener("mousedown", 关)
  }, [钉住])
  const 字 = 读数.档 === "warn" ? tf("上下文 {0} · 快满了", 读数.值) : tf("上下文 {0}", 读数.值)
  const [主, ...余] = 读数.细节
  return (
    <div
      className="ctx-meter"
      ref={盒}
      data-level={读数.档}
      onMouseEnter={进}
      onMouseLeave={出}
      onFocus={进}
      onBlur={失焦}
      onKeyDown={(e) => e.key === "Escape" && 设开着(false)}
    >
      <Button
        variant="ghost"
        size="inline"
        className="ctx-meter-trigger"
        aria-haspopup="dialog"
        aria-expanded={开着}
        onClick={() => {
          if (!开着) {
            onOpen?.()
            设出错(undefined)
          }
          设开着(!钉住)
        }}
      >
        <圆环 已用={读数.已用} 上限={读数.上限} />
        {字}
      </Button>
      {开着 ? (
        <div className="menu ctx-meter-pop" role="dialog" aria-label={t("上下文")}>
          <p className="ctx-meter-head">{主}</p>
          {读数.上限 && 读数.已用 !== undefined ? (
            <div className="ctx-meter-bar" aria-hidden="true">
              {/* 宽度是数据（这一次的已用 / 上限），与 `ContextPanel` 那条堆叠条同一个理由用行内样式 */}
              <span className="ctx-meter-fill" style={{ width: `${Math.min(100, (读数.已用 / 读数.上限) * 100)}%` }} />
              {读数.线 !== undefined ? <span className="ctx-meter-line" style={{ left: `${(读数.线 / 读数.上限) * 100}%` }} /> : null}
            </div>
          ) : null}
          {余.map((x) => (
            <p key={x} className="hint">
              {x}
            </p>
          ))}
          {读数.能压 && onCompact ? (
            <>
              <Button
                variant="secondary"
                size="sm"
                disabled={!!不能压的原因 || 压着}
                onClick={() => {
                  设压着(true)
                  设出错(undefined)
                  onCompact()
                    .then(() => 设开着(false))
                    .catch((e: unknown) => 设出错(e instanceof Error ? e.message : String(e)))
                    .finally(() => 设压着(false))
                }}
              >
                {t("现在压缩")}
              </Button>
              {不能压的原因 ? <p className="hint">{不能压的原因}</p> : null}
              {出错 ? (
                <p className="caveat" role="alert">
                  {出错}
                </p>
              ) : null}
              <p className="hint">{t("也可以在输入框里打 /compact，后面跟一句要保留什么")}</p>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
