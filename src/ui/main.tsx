import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { App } from "./App.js"
import { ErrorBoundary } from "./ErrorBoundary.js"
import "./styles.css"

const root = document.getElementById("root")
if (!root) throw new Error("找不到 #root —— index.html 与入口不匹配")
createRoot(root).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
