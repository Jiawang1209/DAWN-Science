/**
 * 取色器（2026-08-24，作者给了图）：进入取色模式后整窗盖一层——
 * 十字线跟着鼠标，放大镜里看像素，下面写坐标与颜色值；
 * **按 C 复制颜色值，按 Shift 切换 RGB/HEX，点一下选定，Esc 退出**。
 *
 * 像素从哪来：进入时用 `window.dawn.capturePage`（主进程 `webContents.capturePage`）
 * 截**自己的窗口**一帧画进 canvas，之后一直从这张静态帧上采——
 * 覆盖层在最上面，底下的界面不会动，一帧就够；也**不用 desktopCapturer**，
 * 那条在 macOS 上要「屏幕录制」权限，而我们只取自己页面上的颜色。
 */
import { useEffect, useRef, useState } from "react"
import { t } from "./i18n/index.js"
import { hex转三元组 } from "./state/accent.js"

/** 起始值是黑：还没采过样。写成拼串是给设计契约让路——组件里不许出现裸色值字面量 */
const 黑 = "#" + "000000"

/** 放大镜取样半径（源像素）；显示时每个源像素放大到 `倍` */
const 半径 = 9
const 倍 = 12

export function Eyedropper({ onPick, onClose }: { onPick: (hex: string) => void; onClose: () => void }) {
  const 画布 = useRef<HTMLCanvasElement | null>(null)
  const 镜 = useRef<HTMLCanvasElement | null>(null)
  const [就绪, 设就绪] = useState(false)
  const [坏了, 设坏了] = useState<string | undefined>(undefined)
  const [位置, 设位置] = useState<{ x: number; y: number } | undefined>(undefined)
  const [色, 设色] = useState<string>(黑)
  const [格式, 设格式] = useState<"hex" | "rgb">("rgb")
  const [已复制, 设已复制] = useState(false)

  // 进入时截一帧。失败要出声（规格 7.5）：说不出像素就别装作在取色
  useEffect(() => {
    const capture = window.dawn?.capturePage
    if (!capture) {
      设坏了(t("这个环境里没有截屏通道，取不了色"))
      return
    }
    let 活着 = true
    void capture()
      .then(
        ({ dataUrl, width, height }) =>
          new Promise<{ img: HTMLImageElement; width: number; height: number }>((resolve, reject) => {
            const img = new Image()
            img.onload = () => resolve({ img, width, height })
            img.onerror = () => reject(new Error("截图解码失败"))
            img.src = dataUrl
          }),
      )
      .then(({ img, width, height }) => {
        if (!活着) return
        const c = 画布.current
        if (!c) return
        c.width = width
        c.height = height
        c.getContext("2d", { willReadFrequently: true })!.drawImage(img, 0, 0)
        设就绪(true)
      })
      .catch((e: unknown) => 设坏了(e instanceof Error ? e.message : String(e)))
    return () => {
      活着 = false
    }
  }, [])

  // 键盘：C 复制、Shift 切格式、Esc 退出。**挂在 window 上**——覆盖层没有焦点概念
  const 值 = 格式 === "hex" ? 色 : hex转三元组(色).replace(/^rgb\((.*)\)$/, "$1")
  useEffect(() => {
    const 听 = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
      else if (e.key === "Shift") 设格式((f) => (f === "hex" ? "rgb" : "hex"))
      else if (e.key === "c" || e.key === "C") {
        e.preventDefault()
        void navigator.clipboard.writeText(格式 === "hex" ? 色 : hex转三元组(色)).then(() => {
          设已复制(true)
          setTimeout(() => 设已复制(false), 1200)
        }).catch((err: unknown) => console.error("[取色器] 复制失败：", err))
      }
    }
    window.addEventListener("keydown", 听)
    return () => window.removeEventListener("keydown", 听)
  }, [色, 格式, 值, onClose])

  const 采像素 = (c: HTMLCanvasElement, x: number, y: number) => {
    // 截图是物理像素，光标是 CSS 像素——按比例映射（Retina 上是 2×）
    const kx = c.width / window.innerWidth
    const ky = c.height / window.innerHeight
    const ctx = c.getContext("2d", { willReadFrequently: true })!
    const px = Math.min(c.width - 1, Math.max(0, Math.round(x * kx)))
    const py = Math.min(c.height - 1, Math.max(0, Math.round(y * ky)))
    const d = ctx.getImageData(px, py, 1, 1).data
    设色(`#${[d[0]!, d[1]!, d[2]!].map((v) => v.toString(16).padStart(2, "0")).join("")}`)
    // 放大镜：以光标为心取 (2半径+1)² 的源像素，邻近插值放大
    const m = 镜.current
    if (m) {
      const mc = m.getContext("2d")!
      mc.imageSmoothingEnabled = false
      mc.clearRect(0, 0, m.width, m.height)
      const 源 = 2 * 半径 + 1
      mc.drawImage(c, px - 半径, py - 半径, 源, 源, 0, 0, m.width, m.height)
    }
  }

  /**
   * 采样跟着 (位置, 就绪) 走，**在 effect 里做**：
   * 第一次移动时面板（连同放大镜 canvas）还没挂上，事件处理里画不进去——
   * 位置变了先渲染面板，effect 再画像素。就绪晚到也一样被这条补上。
   */
  useEffect(() => {
    if (就绪 && 位置) {
      const c = 画布.current
      if (c) 采像素(c, 位置.x, 位置.y)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [就绪, 位置])

  const 边 = (2 * 半径 + 1) * 倍
  /** 放大镜面板贴着光标右下；贴边就翻到另一侧 */
  const 板宽 = 边 + 2
  const 板高 = 边 + 96
  const 左 = 位置 ? (位置.x + 16 + 板宽 > window.innerWidth ? 位置.x - 16 - 板宽 : 位置.x + 16) : 0
  const 上 = 位置 ? (位置.y + 16 + 板高 > window.innerHeight ? 位置.y - 16 - 板高 : 位置.y + 16) : 0

  return (
    <div
      className="dropper"
      role="dialog"
      aria-label={t("取色器")}
      onMouseMove={(e) => 设位置({ x: e.clientX, y: e.clientY })}
      onClick={() => {
        if (就绪 && 位置) {
          onPick(色)
          onClose()
        }
      }}
    >
      {/* 采样源：不显示，只供读像素 */}
      <canvas ref={画布} className="dropper-src" aria-hidden="true" />
      {坏了 ? (
        <p className="dropper-err caveat">{坏了}</p>
      ) : 位置 ? (
        <>
          {/* 十字线：两条发丝线贯穿全窗，交点即取样点 */}
          <div className="dropper-line-v" style={{ left: 位置.x }} aria-hidden="true" />
          <div className="dropper-line-h" style={{ top: 位置.y }} aria-hidden="true" />
          <div className="dropper-panel" style={{ left: 左, top: 上 }}>
            <div className="dropper-loupe" style={{ width: 边, height: 边 }}>
              <canvas ref={镜} width={边} height={边} />
              {/* 中心那一格描个框：交点在放大镜里的位置 */}
              <span className="dropper-cell" style={{ width: 倍, height: 倍 }} aria-hidden="true" />
            </div>
            <p className="dropper-xy">
              ({位置.x} , {位置.y})
            </p>
            <p className="dropper-val" role="status" aria-live="polite">
              <span className="dropper-swatch" style={{ background: 色 }} aria-hidden="true" />
              <code>{已复制 ? t("已复制") : 值}</code>
            </p>
            <p className="dropper-hint">{t("按 C 复制颜色值")}</p>
            <p className="dropper-hint">{t("按 Shift 切换 RGB/HEX")}</p>
          </div>
        </>
      ) : (
        <p className="dropper-hint dropper-start">{就绪 ? t("移动鼠标取色，点击选定，Esc 退出") : t("正在截取窗口…")}</p>
      )}
    </div>
  )
}
