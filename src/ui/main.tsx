import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { App } from "./App.js"
import { ErrorBoundary } from "./ErrorBoundary.js"
import { loadTheme } from "./state/theme.js"
import "./styles.css"

/**
 * **在 createRoot 之前**读回主题并挂上类。
 *
 * 顺序是刻意的：晚一步就会先按亮色画一帧再跳成暗色。
 * 这也是把「跟随系统」放在 JS 里解析所付出的全部代价——
 * 换来的是 `tokens.css` 里只有一份暗色种子。
 */
loadTheme()

const root = document.getElementById("root")
if (!root) throw new Error("找不到 #root —— index.html 与入口不匹配")
createRoot(root).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
