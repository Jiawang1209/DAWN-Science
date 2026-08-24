/**
 * 「agent 旁观」面（2026-08-25，规格 `2026-08-25-agent浏览器旁观-design.md`）：
 * 旁观 agent 那台 headless 浏览器——当前页截图一帧 + 去过哪儿。
 *
 * **它是普通 DOM**。「自己浏览」那半是主进程里的 `WebContentsView`，
 * Playwright 与视觉基线都看不见；这一面 e2e 直接断言得到——判据走这里。
 *
 * 轮询在 `WebPanel` 里（页签上的活跃点在浏览面也得亮），这里只管画与截帧：
 * 活跃 URL 变了自动重截一帧，手动按钮常驻。**不做 CDP 投流**——旁观，不直播。
 */
import { useCallback, useEffect, useRef, useState } from "react"
import { Button } from "./primitives.js"
import { t, tf } from "./i18n/index.js"

export interface Agent旁观数据 {
  open: boolean
  channel: string
  activeUrl: string
  activeTitle: string
  tabs: number
  history: { url: string; title: string; at: string }[]
}

export function AgentBrowserPane({
  数,
  错,
  frame,
  onRevisit,
}: {
  数: Agent旁观数据 | undefined
  /** 轮询失败时的话（失败必须出声） */
  错: string
  frame(): Promise<string>
  /** 点历史条目：在「自己浏览」面**重新访问**——那是人自己的会话，不是 agent 那份 */
  onRevisit(url: string): void
}) {
  const [帧, 设帧] = useState<{ png: string; at: string } | undefined>()
  const [帧错, 设帧错] = useState("")
  const 帧过 = useRef("")
  const 刷帧 = useCallback(() => {
    void frame()
      .then((png) => {
        设帧({ png, at: new Date().toLocaleTimeString() })
        设帧错("")
      })
      .catch((e) => 设帧错(e instanceof Error ? e.message : String(e)))
  }, [frame])

  /** 活跃 URL 变了自动重截。**只对开着的浏览器**——关了就让画面停在最后一帧的说明上 */
  useEffect(() => {
    const url = 数?.open ? 数.activeUrl : ""
    if (!url || url === 帧过.current) return
    帧过.current = url
    刷帧()
  }, [数?.open, 数?.activeUrl, 刷帧])

  if (!数) return <p className="hint agent-watch-empty">{错 || t("正在问 agent 的浏览器…")}</p>
  if (!数.open && 数.history.length === 0) {
    return (
      <p className="empty agent-watch-empty">
        {t("agent 还没用过浏览器。它一动，这里就能看到它去过哪儿、正在看什么。")}
      </p>
    )
  }
  return (
    <div className="agent-watch">
      {错 ? <p className="caveat">{错}</p> : null}
      <div className="agent-frame">
        {帧 ? (
          <img src={`data:image/png;base64,${帧.png}`} alt={t("agent 当前页的截图")} />
        ) : (
          <p className="hint">
            {数.open
              ? t("画面还没截过——按「刷新画面」。")
              : t("浏览器已经关了，画面没了；去过哪儿还在下面。")}
          </p>
        )}
        {帧错 ? <p className="caveat">{帧错}</p> : null}
        <div className="agent-frame-bar">
          <span className="agent-frame-url" title={数.activeUrl}>
            {数.activeUrl}
          </span>
          <Button variant="secondary" size="sm" disabled={!数.open} onClick={刷帧}>
            {t("刷新画面")}
          </Button>
          {帧 ? <span className="hint agent-frame-at">{tf("截于 {0}", 帧.at)}</span> : null}
        </div>
        {数.activeTitle ? <p className="agent-frame-title">{数.activeTitle}</p> : null}
      </div>
      <div className="agent-visits">
        <h3 className="panel-title">{t("去过哪儿")}</h3>
        {数.history.length === 0 ? (
          <p className="hint">{t("还没去过任何地方。")}</p>
        ) : (
          <ul>
            {数.history.map((h, i) => (
              <li key={`${h.at}-${i}`}>
                {/**
                  * 重新访问是**你自己的会话**——不同登录态下同一 URL 内容可以不同，
                  * 措辞不许让两个东西长得一样（title 里说清）。
                  */}
                <button
                  type="button"
                  className="agent-visit"
                  title={t("重新访问（你自己的会话，不是 agent 看到的那份）")}
                  onClick={() => onRevisit(h.url)}
                >
                  <span className="agent-visit-at">{h.at.slice(11, 19)}</span>
                  <span className="agent-visit-title">{h.title || h.url}</span>
                  <span className="agent-visit-url">{h.url}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
