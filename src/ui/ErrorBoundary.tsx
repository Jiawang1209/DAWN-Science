/**
 * 顶层错误边界（2026-08-08 新增）。
 *
 * **今天已经有两次「界面死了但什么都不说」了**：
 *   1. `window.prompt` 在 Electron 里抛错，React 根随之死掉——点什么都没反应
 *   2. 默认参数造出的无限渲染循环，渲染进程吃满 4 GB
 *
 * 两次的共同点是**故障没有出口**：主进程一切正常，终端一个字都没有，
 * 用户看到的只是一个不响应的窗口。规格 7.5 说失败必须出声，
 * 而渲染期异常此前根本没有出声的地方。
 *
 * 边界不修复任何东西，它只保证**你知道它坏了、坏在哪**。
 */
import { Component, type ErrorInfo, type ReactNode } from "react"

import { t } from "./i18n/index.js"
interface State {
  error: Error | undefined
  stack: string | undefined
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  override state: State = { error: undefined, stack: undefined }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error }
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // 主进程已把渲染进程的 console 转发到终端（electron/main.ts），
    // 所以这一句会出现在你跑 `npm run app` 的那个终端里
    console.error("[界面崩溃]", error, info.componentStack)
    this.setState({ stack: info.componentStack ?? undefined })
  }

  override render(): ReactNode {
    const { error, stack } = this.state
    if (!error) return this.props.children
    return (
      <div className="app-shell">
        <div className="topbar">
          <span className="brand">DAWN Science</span>
        </div>
        <div className="panels">
          <section className="panel">
            <h3 className="panel-title">{t("界面崩溃了")}</h3>
            <div className="panel-body">
              <p className="caveat">{error.message}</p>
              {/**
                * **给一条出路**（2026-08-13，作者第二次撞见崩溃屏之后补的）。
                *
                * 此前这一屏只有报错与堆栈——**看得懂原因，却没有任何东西可按**，
                * 唯一的办法是自己去关掉再开。
                *
                * 而这类崩溃里最常见的一种恰恰是**重新加载就能好**：
                * 应用更新之后窗口没关，手里那份 index 指着已经被换掉的分片名，
                * 一 reload 就拿到新的了。
                *
                * **不用 `Button` primitive**：这一屏是在 React 树已经崩了之后渲染的，
                * 此时不能再依赖任何可能同样崩掉的组件——
                * 这条纪律本文件顶上就写着，设计契约里也为它开了例外。
                */}
              <p>
                <button className="btn btn-primary" onClick={() => location.reload()}>
                  {t("重新加载")}
                </button>
              </p>
              {/* 完整堆栈也给出来：这是给你转贴给我的东西，不是装饰 */}
              <pre className="tool-result">{stack ?? error.stack ?? t("（没有堆栈）")}</pre>
              <p className="hint">
                {t("同样的内容已经打到你跑")} <code>npm run app</code> {t("的终端里。")}
              </p>
            </div>
          </section>
        </div>
        <div className="statusbar" />
      </div>
    )
  }
}
