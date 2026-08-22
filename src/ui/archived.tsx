/**
 * 「已归档」那一屏（session-archive，2026-08-22，学自 dsh-archive-manager 的「设置 → 已归档」）。
 *
 * 归档是**藏，不是删**：这里列出全部藏起来的会话，按项目分组；搜标题；
 * 「取消归档」回原项目原位置；「删除」与侧栏删会话同一条路（进废纸篓）；「删掉全部」先问。
 * 侧栏只在 N > 0 时给入口，所以这一屏空着的时候多半是刚删完——照样说清。
 */
import { useEffect, useMemo, useState } from "react"
import type { SessionSummary } from "../protocol/index.js"
import { Button, EmptyState, Loader, Row } from "./primitives.js"
import { t, tf } from "./i18n/index.js"
import { 年月日时分 } from "./format.js"
import { 文件夹图标, 时钟图标 } from "./icons.js"

export type 归档的会话 = SessionSummary & { projectName: string; workspace: string }

export function ArchivedView({
  load,
  unarchive,
  remove,
  removeAll,
  问,
  onOpen,
}: {
  load: () => Promise<{ sessions: 归档的会话[] }>
  unarchive: (sessionId: string) => Promise<unknown>
  remove: (sessionId: string) => Promise<{ transcriptTrashed: boolean; problem?: string | undefined }>
  removeAll: () => Promise<{ deleted: number; transcriptsTrashed: number; problems: string[] }>
  问: (req: { title: string; detail: React.ReactNode; confirmLabel: string }) => Promise<"confirm" | "alt" | "cancel">
  /** 点一行 = **取消归档并打开**：归档了的会话不在侧栏的名单里，对话屏找不到它的摘要；要看就先回来 */
  onOpen: (s: 归档的会话) => void
}) {
  const [数据, 设数据] = useState<归档的会话[] | undefined>(undefined)
  const [出错, 设出错] = useState<string | undefined>(undefined)
  const [代, 设代] = useState(0)
  const [忙, 设忙] = useState<string | undefined>(undefined)
  const [回话, 设回话] = useState<{ kind: "ok" | "bad"; text: string } | undefined>(undefined)
  const [搜, 设搜] = useState("")
  const [项目, 设项目] = useState<string>("all")

  useEffect(() => {
    let 还在 = true
    load()
      .then((d) => 还在 && 设数据(d.sessions))
      .catch((e: unknown) => 还在 && 设出错(e instanceof Error ? e.message : String(e)))
    return () => {
      还在 = false
    }
  }, [load, 代])

  const 做 = async (key: string, 事: () => Promise<string | undefined>) => {
    设忙(key)
    设回话(undefined)
    try {
      const 说 = await 事()
      if (说) 设回话({ kind: "ok", text: 说 })
      设代((n) => n + 1)
    } catch (e) {
      设回话({ kind: "bad", text: e instanceof Error ? e.message : String(e) })
    } finally {
      设忙(undefined)
    }
  }

  const 分组 = useMemo(() => {
    const q = 搜.trim().toLowerCase()
    const m = new Map<string, { name: string; workspace: string; list: 归档的会话[] }>()
    for (const s of 数据 ?? []) {
      if (项目 !== "all" && s.projectId !== 项目) continue
      if (q && !(s.title ?? "").toLowerCase().includes(q) && !s.projectName.toLowerCase().includes(q)) continue
      const g = m.get(s.projectId) ?? { name: s.projectName, workspace: s.workspace, list: [] }
      g.list.push(s)
      m.set(s.projectId, g)
    }
    return [...m.entries()]
  }, [数据, 搜, 项目])
  const 项目们 = useMemo(() => {
    const m = new Map<string, string>()
    for (const s of 数据 ?? []) m.set(s.projectId, s.projectName)
    return [...m.entries()]
  }, [数据])

  if (出错) return <EmptyState title={t("读不到已归档的会话")} description={出错} />
  if (!数据) return <Loader label={t("正在读已归档的会话")} />

  return (
    <div className="skills-page archived-page">
      <header className="skills-head">
        <h1 className="panel-title">{t("已归档")}</h1>
        <p className="hint">{t("归档是藏起来，不是删掉：会话与对话记录都还在，取消归档就回到原来的项目、原来的位置。点一行 = 放回去并打开。")}</p>
        {数据.length > 0 ? (
          <div className="skills-actions">
            <Button
              variant="secondary"
              size="sm"
              className="menu-danger"
              disabled={忙 === "all"}
              onClick={() =>
                void (async () => {
                  const 答 = await 问({
                    title: tf("删掉全部 {0} 段已归档的会话？", 数据.length),
                    detail: t("会停掉它们的进程，删掉会话记录，对话记录进废纸篓。账本不动。"),
                    confirmLabel: tf("删掉 {0} 段", 数据.length),
                  })
                  if (答 !== "confirm") return
                  await 做("all", async () => {
                    const r = await removeAll()
                    return [tf("删了 {0} 段，{1} 个对话记录进了废纸篓", r.deleted, r.transcriptsTrashed), ...r.problems].join("；")
                  })
                })()
              }
            >
              {t("清空归档")}
            </Button>
          </div>
        ) : null}
        {回话 ? (
          <p className={回话.kind === "bad" ? "caveat" : "mcp-ok"} role="status">
            {回话.text}
          </p>
        ) : null}
      </header>

      {数据.length === 0 ? (
        <EmptyState title={t("没有归档的会话")} description={t("会话行的「⋯」里有「收进归档」；归档了的会从侧栏藏起来、到这儿来。")} />
      ) : (
        <>
          <div className="skills-filters">
            <div className="theme-choices" role="radiogroup" aria-label={t("项目")}>
              <Button variant={项目 === "all" ? "primary" : "secondary"} size="sm" role="radio" aria-checked={项目 === "all"} onClick={() => 设项目("all")}>
                {t("全部")}（{数据.length}）
              </Button>
              {项目们.map(([id, name]) => (
                <Button key={id} variant={项目 === id ? "primary" : "secondary"} size="sm" role="radio" aria-checked={项目 === id} onClick={() => 设项目(id)}>
                  {name}（{数据.filter((s) => s.projectId === id).length}）
                </Button>
              ))}
            </div>
            <input className="control skills-search" type="search" value={搜} aria-label={t("搜已归档的会话")} placeholder={t("按标题或项目搜")} onChange={(e) => 设搜(e.target.value)} />
          </div>
          {分组.length === 0 ? (
            <EmptyState title={t("没有对上的会话")} description={t("换个词，或者把筛选清掉。")} />
          ) : (
            分组.map(([pid, g]) => (
              <section key={pid} className="archived-group">
                <h2 className="archived-group-title">
                  <文件夹图标 className="row-icon" />
                  <span>{g.name}</span>
                  <span className="hint archived-group-path">{g.workspace}</span>
                </h2>
                <ul className="skill-group">
                  {g.list.map((s) => (
                    <li key={s.sessionId} className="skill-row archived-row">
                      <Row className="skill-row-main archived-row-main" onClick={() => onOpen(s)}>
                        <p className="skill-name">
                          <span className="skill-name-text">{s.title ?? t("新会话")}</span>
                          {s.remote ? <span className="tag">{s.remote.label}</span> : null}
                        </p>
                        <p className="skill-desc">
                          <时钟图标 className="row-icon" /> {tf("归档于 {0}", 年月日时分(s.archivedAt ?? s.createdAt))}
                          {s.lastActiveAt ? ` · ${tf("上次活动 {0}", 年月日时分(s.lastActiveAt))}` : ""}
                        </p>
                      </Row>
                      <div className="archived-row-actions">
                        <Button variant="ghost" size="sm" disabled={忙 === s.sessionId} onClick={() => void 做(s.sessionId, async () => { await unarchive(s.sessionId); return tf("「{0}」回到了「{1}」", s.title ?? t("新会话"), g.name) })}>
                          {t("放回去")}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="menu-danger"
                          disabled={忙 === s.sessionId}
                          onClick={() =>
                            void (async () => {
                              const 答 = await 问({
                                title: tf("删除会话「{0}」？", s.title ?? t("新会话")),
                                detail: t("会停掉它的进程，删掉会话记录，对话记录进废纸篓。账本不动。"),
                                confirmLabel: "删除会话",
                              })
                              if (答 !== "confirm") return
                              await 做(s.sessionId, async () => {
                                const r = await remove(s.sessionId)
                                return r.transcriptTrashed ? t("已删除，对话记录进了废纸篓") : tf("已删除；{0}", r.problem ?? t("它还没有对话记录"))
                              })
                            })()
                          }
                        >
                          {t("删除")}
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ))
          )}
        </>
      )}
    </div>
  )
}
