import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { App } from "./App.js"
import { ErrorBoundary } from "./ErrorBoundary.js"
import { loadTheme } from "./state/theme.js"
import { loadSidebar } from "./state/sidebar.js"
import { loadLang } from "./i18n/index.js"
import "./styles.css"

/**
 * **在 createRoot 之前**读回主题并挂上类。
 *
 * 顺序是刻意的：晚一步就会先按亮色画一帧再跳成暗色。
 * 这也是把「跟随系统」放在 JS 里解析所付出的全部代价——
 * 换来的是 `tokens.css` 里只有一份暗色种子。
 */
loadTheme()

/**
 * 侧栏的宽度与折叠**也在第一帧之前读回**（2026-08-13）。
 *
 * 同一条理由：晚一步就会先按 264 画一帧、再跳成人上次拖到的宽度。
 * 折叠状态更明显——**先闪一下侧栏再收掉**，那一下比不记住还难受。
 */
loadSidebar()

/**
 * **语言也在第一帧之前读回**（2026-08-13）。
 *
 * 与主题、侧栏同一条理由，只是后果更刺眼：晚一步就会先按英文画一整屏，
 * 再整屏跳成中文。
 */
loadLang()

const root = document.getElementById("root")
if (!root) throw new Error("找不到 #root —— index.html 与入口不匹配")
createRoot(root).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
