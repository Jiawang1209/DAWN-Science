/**
 * 界面 primitive —— **一个关注点一个组件**。
 *
 * 学自 Hermes `DESIGN.md`：*"One primitive per concern. One `Button`, one
 * `SearchField`, one `Loader`, one `ErrorState`. Migrate onto them; don't fork."*
 *
 * ## 为什么这件事排在改界面之前
 *
 * 没有 primitive 时，每个页面各自决定按钮多高、空状态长什么样、
 * 出错怎么显示。**三个页面就是三套**，而且没人知道哪套是对的。
 * 本项目此前正是如此：`views.tsx` / `panels.tsx` / `Settings.tsx`
 * 各写各的按钮内距。
 *
 * ## 调用点的规矩
 *
 * **传 `variant` / `size`，不要用 `className` 去改内距、高度、圆角、描边。**
 * 那些属性属于 primitive 自己。要改就改 primitive，让所有调用点一起变——
 * 这条由 `tests/ui/design-contract.test.ts` 强制。
 */
import type { ButtonHTMLAttributes, ReactNode } from "react"

/* ── Button ───────────────────────────────────────────────────────── */

export type ButtonVariant =
  /** 主动作。一屏里通常只有一个 */
  | "primary"
  /** 默认的非主动作，带柔和填充 */
  | "secondary"
  /** 透明 + 1px 描边，无填充 */
  | "outline"
  /** 无框安静按钮，hover 才出现底 */
  | "ghost"
  /**
   * 摧毁性动作（删除、移除）。**它不是"红色的 primary"**——
   * 一屏里可以没有主动作，但摧毁性动作必须一眼认得出来，
   * 而且**不该被顺手按到**（确认框里焦点落在「取消」上）。
   */
  | "danger"
  /** 行内文字按钮（「取消」「清空」），无盒子 */
  | "text"
  /** 破坏性动作 */
  | "destructive"

/**
 * `card` 是 2026-08-09 加的一档：**一整张可点的卡**（空态的开场建议）。
 *
 * 它本可以写成调用点的一个 `className="opener"` 再在 CSS 里改内距与圆角——
 * **而那正是本文件第 16 行明令禁止的事**。扫描抓不到语义类名，
 * 但规则不是给扫描看的。多一档尺寸，几何就仍然只有一个家。
 */
export type ButtonSize = "default" | "sm" | "xs" | "inline" | "icon" | "card"

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className"> {
  variant?: ButtonVariant
  size?: ButtonSize
  /**
   * **刻意收窄**：只接受布局用途的类名（如 `grow`），
   * 不接受重新指定 primitive 自己的内距/高度/圆角。
   * 契约测试会扫描调用点。
   */
  className?: string
  children?: ReactNode
  /**
   * 拿到那个真实的 `<button>`。
   *
   * **只为量它的位置**：会话行的 `⋯` 菜单要开在这颗按钮的右边，
   * 而位置只能问 DOM。React 19 起 `ref` 是普通 prop，不必 forwardRef。
   */
  ref?: React.Ref<HTMLButtonElement>
}

export function Button({
  variant = "secondary",
  size = "default",
  className,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={["btn", `btn-${variant}`, `btn-${size}`, className].filter(Boolean).join(" ")}
      {...rest}
    />
  )
}

/* ── Row ──────────────────────────────────────────────────────────── */

/**
 * 列表里的一行（会话、agent、入口）。
 *
 * **它存在的理由是消歧义。** 行的几何（通栏、齐左、6/12 内距）与按钮的几何
 * 是两套东西；同时挂 `.btn-default` 和 `.row` 会让两个内距打架，
 * 而"谁赢"取决于样式表里谁写在后面——那是**位置依赖**，最坏的一种耦合。
 *
 * 所以：行用 `size="inline"` 把按钮的盒子清零，几何全部由 `.row` 拥有。
 * 对应 Hermes 的 `ListRow`。
 */
export function Row({
  active,
  className,
  ...rest
}: Omit<ButtonProps, "variant" | "size"> & { active?: boolean }) {
  return (
    <Button
      variant="ghost"
      size="inline"
      className={["row", active ? "active" : "", className].filter(Boolean).join(" ")}
      {...rest}
    />
  )
}

/* ── Loader ───────────────────────────────────────────────────────── */

/** 动画帧。**用字符而不是转圈图**——终端出身的应用里这个更协调 */
const LOADER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]

/**
 * 加载指示。
 *
 * **永远不要直接写「加载中…」这四个字**（Hermes：*"Never ship the literal text
 * 'Loading…'"*）。理由不是文案品味：一个只会说「加载中」的界面，
 * 说不出「在等什么」，也说不出「等多久算不正常」。
 * `label` 是必填的，它逼调用点回答第一个问题。
 */
export function Loader({ label, inline }: { label: string; inline?: boolean }) {
  return (
    <span className={inline ? "loader loader-inline" : "loader"} role="status" aria-live="polite">
      <span className="loader-glyph" aria-hidden="true">
        {LOADER_FRAMES.map((f, i) => (
          <span key={f} style={{ animationDelay: `${i * 80}ms` }}>
            {f}
          </span>
        ))}
      </span>
      <span className="loader-label">{label}</span>
    </span>
  )
}

/* ── 空 / 错误 ────────────────────────────────────────────────────── */

/**
 * 空状态。
 *
 * **必须给出下一步动作。** 一片空白不告诉用户该做什么——
 * 而「不知道下一步点哪里」正是本项目被打回三次的那个问题。
 */
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="state-block">
      <p className="state-title">{title}</p>
      {description ? <p className="state-desc">{description}</p> : null}
      {action ? <div className="state-action">{action}</div> : null}
    </div>
  )
}

/**
 * 错误状态。
 *
 * 三件必须有：**发生了什么**、**为什么**（有就给）、**下一步能做什么**。
 * 只有第一件的错误提示等于告诉用户「坏了，自己想办法」。
 */
export function ErrorState({
  title,
  detail,
  action,
}: {
  title: string
  detail?: string
  action?: ReactNode
}) {
  return (
    <div className="state-block state-error" role="alert">
      <p className="state-title">
        <span className="state-icon" aria-hidden="true">
          ⊘
        </span>
        {title}
      </p>
      {detail ? <p className="state-desc">{detail}</p> : null}
      {action ? <div className="state-action">{action}</div> : null}
    </div>
  )
}

/* ── LogView ──────────────────────────────────────────────────────── */

/**
 * 原始日志。**每一处要展示裸文本的地方都用它**，不要各自写 `<pre>`。
 *
 * 它统一了三件事：等宽字体、发丝线边框、以及**超长内容横向自己滚动**——
 * 最后一条尤其重要，否则一条长堆栈会把整个页面撑出横向滚动条。
 */
export function LogView({ text, label }: { text: string; label?: string }) {
  return (
    <div className="logview">
      {label ? <p className="logview-label">{label}</p> : null}
      <pre className="logview-body">{text}</pre>
    </div>
  )
}

/* ── Field ────────────────────────────────────────────────────────── */

/**
 * 表单项：标签 + 控件 + 说明/错误。
 *
 * 把 `label` 与控件的关联收在一处，避免每个表单各自处理
 * `htmlFor` / `aria-describedby`——漏掉就是一个无障碍缺陷，
 * 而这类缺陷不会有人在界面上看出来。
 */
export function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string
  label: string
  hint?: string
  error?: string
  children: ReactNode
}) {
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined
  return (
    <div className={error ? "field field-invalid" : "field"}>
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      <div className="field-control" aria-describedby={describedBy}>
        {children}
      </div>
      {error ? (
        <p className="field-error" id={`${id}-error`}>
          {error}
        </p>
      ) : hint ? (
        <p className="field-hint" id={`${id}-hint`}>
          {hint}
        </p>
      ) : null}
    </div>
  )
}
