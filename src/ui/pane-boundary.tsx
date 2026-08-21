/**
 * 一格一个的错误边界（dock-polish ⑥，2026-08-21，学自 DSH-better-sidebar 的 `RenderBoundary`）。
 *
 * 顶层 `ErrorBoundary` 管的是「整个界面死了要出声」；这一层管的是**一格坏了别连累别的格**：
 * 预览一个怪文件把「文件」那一格炸了，对话与侧栏不该跟着白屏。
 * 它说清是哪一格、什么错，给一颗「再开这一格」；切到别的格再切回来也会重试（调用方按房客给 `key`）。
 *
 * 与顶层那个同一条纪律：**坏掉之后的那一屏不依赖任何可能同样坏掉的组件**——裸 `<button>`。
 */
import { Component, type ErrorInfo, type ReactNode } from "react"
import { t, tf } from "./i18n/index.js"

interface State {
  error: Error | undefined
}

export class PaneBoundary extends Component<{ 名: string; children: ReactNode }, State> {
  override state: State = { error: undefined }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(`[${this.props.名}] 这一格崩了：`, error, info.componentStack)
  }

  override render(): ReactNode {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <div className="pane-broken" role="alert">
        <p className="pane-broken-title">{tf("「{0}」这一格坏了", this.props.名)}</p>
        <p className="caveat">{error.message}</p>
        <p>
          <button className="btn btn-outline btn-sm" onClick={() => this.setState({ error: undefined })}>
            {t("再开这一格")}
          </button>
        </p>
        <p className="hint">{t("别的地方还能用；同样的内容已经打到终端里。")}</p>
      </div>
    )
  }
}
