/**
 * 自绘色盘（2026-08-24，作者拍板）：**不弹 macOS 的系统面板**——
 * 系统面板是另一个窗口，我们的「按 C 复制 / Shift 切格式 / Esc」够不着它，
 * 两块面板叠在一起（作者截图）就是这个裂缝的样子。自己画一个，功能才能长在里面：
 *
 * 明度方块（s×v）+ 色相条 + 吸管捷径 + 当前值一行，底下两行提示；
 * **拖到哪主题色就跟到哪（点一下即定色），按 C 复制颜色值，按 Shift 切换 RGB/HEX，Esc 关掉。**
 *
 * 颜色字面量都从 `hsv转hex` 算（组件里不许写裸色值，设计契约扫描守着）；
 * 方块与色相条的渐变端点通过 CSS 变量从这里喂进去。
 */
import { useEffect, useMemo, useRef, useState } from "react"
import { t } from "./i18n/index.js"
import { hex转hsv, hsv转hex, hex转三元组 } from "./state/accent.js"
import { 吸管图标 } from "./icons.js"
import { Button } from "./primitives.js"

export function ColorPanel({
  accent,
  onPick,
  onClose,
  onEyedropper,
}: {
  accent: string
  onPick: (hex: string) => void
  onClose: () => void
  /** 面板里的吸管捷径：收面板、进屏幕取色 */
  onEyedropper: () => void
}) {
  /**
   * h/s/v 存在本地：从 hex 反推会丢信息（灰色的 h 是 0、纯白的 s 是 0），
   * 拖色相条时颜色暂时是灰的也不能让把手跳回 0。
   */
  const 初 = hex转hsv(accent)
  const [h, 设h] = useState(初.h)
  const [s, 设s] = useState(初.s)
  const [v, 设v] = useState(初.v)
  const [格式, 设格式] = useState<"hex" | "rgb">("hex")
  const [已复制, 设已复制] = useState(false)
  const 色 = hsv转hex(h, s, v)
  const 值 = 格式 === "hex" ? 色 : hex转三元组(色)

  const 复制 = () =>
    void navigator.clipboard.writeText(值).then(() => {
      设已复制(true)
      setTimeout(() => 设已复制(false), 1200)
    }).catch((e: unknown) => console.error("[色盘] 复制失败：", e))

  // C 复制、Shift 切格式、Esc 关——面板开着就听（没有依赖数组：拿的都是最新闭包）
  useEffect(() => {
    const 键 = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
      else if (e.key === "Shift") 设格式((f) => (f === "hex" ? "rgb" : "hex"))
      else if (e.key === "c" || e.key === "C") {
        e.preventDefault()
        复制()
      }
    }
    window.addEventListener("keydown", 键)
    return () => window.removeEventListener("keydown", 键)
  })
  // 点面板外面 = 关（mousedown 而不是 click：拖出去松手不该关）
  const 根 = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const 点 = (e: MouseEvent) => {
      if (根.current && e.target instanceof Node && !根.current.contains(e.target)) onClose()
    }
    window.addEventListener("mousedown", 点)
    return () => window.removeEventListener("mousedown", 点)
  }, [onClose])

  /** 把一次指针位置换算成 s/v 并生效——**点到哪，主题色就定到哪** */
  const 从方块 = (el: HTMLElement, e: { clientX: number; clientY: number }) => {
    const r = el.getBoundingClientRect()
    const ns = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width))
    const nv = 1 - Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))
    设s(ns)
    设v(nv)
    onPick(hsv转hex(h, ns, nv))
  }
  const 从条 = (el: HTMLElement, e: { clientX: number }) => {
    const r = el.getBoundingClientRect()
    const nh = 360 * Math.min(1, Math.max(0, (e.clientX - r.left) / r.width))
    设h(nh)
    onPick(hsv转hex(nh, s, v))
  }
  /** 按下即取值，随后跟着拖（pointer capture 让拖出边界也不断） */
  const 拖 = (算: (el: HTMLElement, e: { clientX: number; clientY: number }) => void) =>
    (e: React.PointerEvent<HTMLElement>) => {
      const el = e.currentTarget
      el.setPointerCapture(e.pointerId)
      算(el, e)
      const 动 = (ev: PointerEvent) => 算(el, ev)
      const 停 = () => {
        el.removeEventListener("pointermove", 动)
        el.removeEventListener("pointerup", 停)
      }
      el.addEventListener("pointermove", 动)
      el.addEventListener("pointerup", 停)
    }

  /** 色相条的彩虹：13 个算出来的端点（每 30°），不写一个字面量 */
  const 彩虹 = useMemo(
    () => `linear-gradient(to right, ${Array.from({ length: 13 }, (_, i) => hsv转hex(i * 30 === 360 ? 0 : i * 30, 1, 1)).join(", ")})`,
    [],
  )
  const 纯色相 = hsv转hex(h, 1, 1)
  const 白 = hsv转hex(0, 0, 1)
  const 黑 = hsv转hex(0, 0, 0)

  return (
    <div ref={根} className="cpanel" role="dialog" aria-label={t("色盘")}>
      <div
        className="cpanel-sv"
        role="slider"
        aria-label={t("明度与饱和度")}
        aria-valuetext={色}
        style={{ background: `linear-gradient(to top, ${黑}, transparent), linear-gradient(to right, ${白}, ${纯色相})` }}
        onPointerDown={拖(从方块)}
      >
        <span className="cpanel-dot" style={{ left: `${s * 100}%`, top: `${(1 - v) * 100}%` }} aria-hidden="true" />
      </div>
      <div className="cpanel-mid">
        <Button variant="ghost" size="icon" aria-label={t("屏幕取色")} onClick={onEyedropper}>
          <吸管图标 />
        </Button>
        <span className="cpanel-now" style={{ background: 色 }} aria-hidden="true" />
        <div className="cpanel-hue" role="slider" aria-label={t("色相")} aria-valuetext={String(Math.round(h))} style={{ background: 彩虹 }} onPointerDown={拖(从条)}>
          <span className="cpanel-hue-dot" style={{ left: `${(h / 360) * 100}%` }} aria-hidden="true" />
        </div>
      </div>
      <p className="dropper-val" role="status" aria-live="polite">
        <code>{已复制 ? t("已复制") : 值}</code>
      </p>
      <p className="dropper-hint">{t("按 C 复制颜色值")}</p>
      <p className="dropper-hint">{t("按 Shift 切换 RGB/HEX")}</p>
    </div>
  )
}
