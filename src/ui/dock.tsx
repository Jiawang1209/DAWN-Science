/**
 * 底部终端 dock（2026-08-11）。
 *
 * 作者：*「终端，我们要学习 Claude app、Codex app，要点击之后，界面下方
 * 单独出现一个地方，可以专门用于开启一个新的终端，并且这个终端的路径，
 * 应该是项目文件夹的路径。」*
 *
 * ## 与此前那个终端的区别，是**它不再抢主区**
 *
 * 原来一个 `pty` 会话就是一整屏：选中它，对话就没了。那等于说
 * 「你要么跟模型说话，要么敲命令」——而数据科学里这两件事本来就是**同时**的：
 * 模型在跑分析，你在下面 `ls` 一眼它到底写出了什么。
 *
 * 所以 dock 是**第二条订阅**（见 `state/dock.ts`）：它和当前对话同时活着。
 *
 * ## 路径就是项目文件夹
 *
 * 终端会话与别的会话走同一条 `createSession`，而 pty 运行时的 cwd 取
 * `spec.workspace`——**项目的工作区**。所以「终端开在项目文件夹里」
 * 不是这里另做的一件事，是同一个事实的自然结果。
 *
 * **没有项目时不给一个开不出来的按钮**：会话属于项目，没有项目就没有工作区，
 * 那时如实说清，并给出「打开项目文件夹」这条出路（规格 7.5）。
 */
import { useStore } from "@nanostores/react"
import { Button } from "./primitives.js"
import { TerminalPane } from "./terminal.js"
import { $dockChunks } from "./state/index.js"
import type { SessionSummary } from "../protocol/index.js"

import { t } from "./i18n/index.js"
export function TerminalDock({
  terminals,
  currentId,
  workspace,
  canOpen,
  onPick,
  onNew,
  onClose,
  onCloseDock,
  onInput,
  onOpenProject,
}: {
  /** 这个项目里活着的终端会话 */
  terminals: readonly SessionSummary[]
  currentId: string | undefined
  /** 新终端会开在哪。**摆出来**——不摆的话「它到底在哪个目录」只能靠 pwd 猜 */
  workspace?: string | undefined
  /** 能不能开新的。没有项目时不能——**给一个点了必然失败的按钮更坏** */
  canOpen: boolean
  onPick: (sessionId: string) => void
  onNew: () => void
  onClose: (sessionId: string) => void
  onCloseDock: () => void
  onInput: (data: string) => void
  onOpenProject: () => void
}) {
  const chunks = useStore($dockChunks)

  return (
    <section className="dock" aria-label={t("终端")}>
      <div className="dock-tabs">
        <span className="dock-title">{t("终端")}</span>
        {terminals.map((台, i) => (
          <span key={台.sessionId} className={`dock-tab${台.sessionId === currentId ? " current" : ""}`}>
            <Button
              variant="ghost"
              size="inline"
              aria-current={台.sessionId === currentId}
              onClick={() => onPick(台.sessionId)}
            >
              {/* 终端没有标题可言，**给它一个稳定的序号**比显示一串 id 强 */}
              {`终端 ${i + 1}`}
              {台.state === "exited" ? <span className="hint"> {t("已结束")}</span> : null}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label={`关闭终端 ${i + 1}`}
              onClick={() => onClose(台.sessionId)}
            >
              ×
            </Button>
          </span>
        ))}
        <Button variant="outline" size="sm" disabled={!canOpen} onClick={onNew}>
          {t("＋ 新终端")}
        </Button>
        <span className="spacer" />
        {/* **路径要摆出来**：终端开在哪个目录，是它唯一会让人猜错的事 */}
        {workspace ? <span className="dock-cwd">{workspace}</span> : null}
        <Button variant="ghost" size="sm" aria-label={t("收起终端")} onClick={onCloseDock}>
          {t("收起")}
        </Button>
      </div>

      <div className="dock-content">
        {!canOpen ? (
          /**
           * **只有「配置里没有终端 agent」这一种情况开不了**（2026-08-11）。
           *
           * 「没有打开项目」不再是拦路的理由——那时终端开在家目录
           * （作者：*「如果没有选择的话，那么终端就在家目录下」*）。
           */
          <p className="empty">
            配置里没有 <code>kind: pty</code> 的 agent，开不了终端。
            <Button variant="outline" size="sm" onClick={onOpenProject}>
              {t("打开项目文件夹")}
            </Button>
          </p>
        ) : currentId ? (
          <TerminalPane chunks={chunks} onInput={onInput} />
        ) : (
          <p className="empty">{t("还没有终端。点「＋ 新终端」开一个，它会开在上面那个目录里。")}</p>
        )}
      </div>
    </section>
  )
}
