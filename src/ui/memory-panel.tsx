/**
 * 设置「记忆」屏(2026-08-25,规格 `2026-08-25-记忆-design.md` §五)。
 *
 * 上半:**待确认区**——模型提议的记忆(可改文案/改轨)与待装技能混排,
 * [采纳/装进技能库][归档][拒绝];hits ≥2 显示「提过 N 次」。
 * 下半:**三轨浏览**——user/memory/key 切页,行内删除/归档,归档页转正;
 * 顶部一条输入框直写(人即确认者)。
 *
 * 所有确认动作的生效时点如实写在屏上:**下一段会话生效**。
 */
import { useCallback, useEffect, useState } from "react"
import { Button } from "./primitives.js"
import { t, tf } from "./i18n/index.js"

interface 取数口 {
  get<T>(operation: string, request?: unknown): Promise<T>
}

interface 建议 {
  id: string
  target: string
  content: string
  reason: string
  hits: number
  time: string
  workspace?: string
}

interface 待装 {
  name: string
  description: string
  content: string
}

const 轨名 = (target: string) =>
  target === "user" ? t("用户档案") : target === "memory" ? t("全局事实") : t("项目关键记忆")

export function MemoryPanel({
  client,
  workspace,
  onChanged,
}: {
  client: 取数口
  /** 当前会话的项目工作区(key 轨用);没有就如实说明 */
  workspace?: string | undefined
  /** 处理完一条待确认后报一声(侧栏角标重取) */
  onChanged?: () => void
}) {
  const [建议们, 设建议们] = useState<建议[]>([])
  const [技能们, 设技能们] = useState<待装[]>([])
  const [轨, 设轨] = useState<"user" | "memory" | "key">("user")
  const [看归档, 设看归档] = useState(false)
  const [条目们, 设条目们] = useState<string[]>([])
  const [错, 设错] = useState("")
  const [新条, 设新条] = useState("")
  /** 展开编辑中的建议:id → { content, target } */
  const [编辑, 设编辑] = useState<Record<string, { content: string; target: string }>>({})

  const 拉队列 = useCallback(() => {
    void client
      .get<{ suggestions: 建议[]; pendingSkills: 待装[] }>("memorySuggestions", {})
      .then((r) => {
        设建议们(r.suggestions)
        设技能们(r.pendingSkills)
        设错("")
      })
      .catch((e) => 设错(e instanceof Error ? e.message : String(e)))
  }, [client])

  const 拉条目 = useCallback(() => {
    void client
      .get<{ entries: string[] }>("memoryEntries", {
        target: 轨,
        archived: 看归档,
        ...(workspace ? { workspace } : {}),
      })
      .then((r) => {
        设条目们(r.entries)
        设错("")
      })
      .catch((e) => {
        设条目们([])
        设错(e instanceof Error ? e.message : String(e))
      })
  }, [client, 轨, 看归档, workspace])

  useEffect(() => 拉队列(), [拉队列])
  useEffect(() => 拉条目(), [拉条目])

  const 处理 = (kind: "suggestion" | "skill", id: string, decision: "approve" | "archive" | "reject") => {
    const 改 = 编辑[id]
    void client
      .get<{ ok: boolean; message: string }>("memoryResolve", {
        kind,
        id,
        decision,
        ...(kind === "suggestion" && 改 ? { content: 改.content, target: 改.target } : {}),
        ...(workspace ? { workspace } : {}),
      })
      .then((r) => {
        if (!r.ok) 设错(r.message)
        else 设错("")
        拉队列()
        拉条目()
        onChanged?.()
      })
      .catch((e) => 设错(e instanceof Error ? e.message : String(e)))
  }

  const 直写 = (action: "add" | "remove" | "archive" | "promote", 参: { content?: string; match?: string }) => {
    void client
      .get<{ ok: boolean; message: string }>("memoryWrite", {
        action,
        target: 轨,
        ...(workspace ? { workspace } : {}),
        ...参,
      })
      .then((r) => {
        设错(r.ok ? "" : r.message)
        拉条目()
      })
      .catch((e) => 设错(e instanceof Error ? e.message : String(e)))
  }

  const 待确认数 = 建议们.length + 技能们.length
  return (
    <div className="memory-panel">
      <section className="set-section">
        <h3 className="set-section-title">{tf("待确认({0})", 待确认数)}</h3>
        <div className="set-section-desc">
          {t("模型提议的长期记忆与技能。采纳后下一段会话生效;拒绝即丢弃;归档是不注入的冷存储。")}
        </div>
        {待确认数 === 0 ? <p className="hint">{t("没有待确认的——模型提议之后会出现在这里。")}</p> : null}
        {建议们.map((s) => {
          const 改 = 编辑[s.id]
          return (
            <div key={s.id} className="memory-suggestion">
              <div className="memory-suggestion-head">
                <span className="memory-track-chip">{轨名(改?.target ?? s.target)}</span>
                {s.hits >= 2 ? <span className="memory-hits">{tf("提过 {0} 次", s.hits)}</span> : null}
              </div>
              {改 ? (
                <>
                  <textarea
                    className="control memory-edit"
                    aria-label={t("改一改再采纳")}
                    value={改.content}
                    onChange={(e) => 设编辑({ ...编辑, [s.id]: { ...改, content: e.target.value } })}
                  />
                  <select
                    className="control"
                    aria-label={t("换一条轨")}
                    value={改.target}
                    onChange={(e) => 设编辑({ ...编辑, [s.id]: { ...改, target: e.target.value } })}
                  >
                    <option value="user">{t("用户档案")}</option>
                    <option value="memory">{t("全局事实")}</option>
                    <option value="key">{t("项目关键记忆")}</option>
                  </select>
                </>
              ) : (
                <p className="memory-suggestion-content">{s.content}</p>
              )}
              {s.reason ? <p className="hint memory-reason">{tf("理由:{0}", s.reason)}</p> : null}
              <div className="memory-actions">
                <Button variant="secondary" size="sm" onClick={() => 处理("suggestion", s.id, "approve")}>
                  {t("采纳")}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => 处理("suggestion", s.id, "archive")}>
                  {t("收进归档")}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => 处理("suggestion", s.id, "reject")}>
                  {t("拒绝")}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    设编辑(
                      改
                        ? Object.fromEntries(Object.entries(编辑).filter(([k]) => k !== s.id))
                        : { ...编辑, [s.id]: { content: s.content, target: s.target } },
                    )
                  }
                >
                  {改 ? t("不改了") : t("改一改")}
                </Button>
              </div>
            </div>
          )
        })}
        {技能们.map((sk) => (
          <div key={sk.name} className="memory-suggestion">
            <div className="memory-suggestion-head">
              <span className="memory-track-chip">{t("技能")}</span>
              <span className="memory-skill-name">{sk.name}</span>
            </div>
            <p className="memory-suggestion-content">{sk.description}</p>
            <details>
              <summary className="hint">{t("看完整 SKILL.md")}</summary>
              <pre className="memory-skill-body">{sk.content}</pre>
            </details>
            <div className="memory-actions">
              <Button variant="secondary" size="sm" onClick={() => 处理("skill", sk.name, "approve")}>
                {t("装进技能库")}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => 处理("skill", sk.name, "reject")}>
                {t("拒绝")}
              </Button>
            </div>
          </div>
        ))}
        {错 ? <p className="caveat">{错}</p> : null}
      </section>

      <section className="set-section">
        <h3 className="set-section-title">{t("记忆库")}</h3>
        <div className="memory-track-tabs" role="tablist" aria-label={t("看哪条轨")}>
          {(["user", "memory", "key"] as const).map((tg) => (
            <Button key={tg} variant="ghost" size="sm" role="tab" aria-selected={轨 === tg} onClick={() => 设轨(tg)}>
              {轨名(tg)}
            </Button>
          ))}
          <label className="memory-archived-toggle">
            <input type="checkbox" checked={看归档} onChange={(e) => 设看归档(e.target.checked)} />
            {t("看归档的")}
          </label>
        </div>
        {轨 === "key" && !workspace ? (
          <p className="hint">{t("当前没有活跃项目——开一段带工作区的会话,才有它的项目关键记忆。")}</p>
        ) : (
          <>
            {轨 === "key" ? (
              <p className="hint">{t("这条轨落在项目的 .dawn/memory/ 里,提交进 git 就跟着仓库走(协作者可见;私人向的放用户档案)。")}</p>
            ) : null}
            {!看归档 ? (
              <div className="memory-add-row">
                <input
                  className="control"
                  aria-label={t("直接添加一条记忆")}
                  placeholder={t("直接记一条(你添加 = 你确认,下一段会话生效)")}
                  value={新条}
                  onChange={(e) => 设新条(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter" || !新条.trim()) return
                    直写("add", { content: 新条.trim() })
                    设新条("")
                  }}
                />
              </div>
            ) : null}
            {条目们.length === 0 ? (
              <p className="hint">{看归档 ? t("归档是空的。") : t("这条轨还是空的。")}</p>
            ) : (
              <ul className="memory-entries">
                {条目们.map((e, i) => (
                  <li key={`${i}-${e.slice(0, 20)}`} className="memory-entry">
                    <span className="memory-entry-text">{e}</span>
                    <span className="memory-entry-ops">
                      {看归档 ? (
                        /* 归档页只有转正——归档本身就是「不删」的去处,再给删除就自相矛盾 */
                        <Button variant="ghost" size="sm" onClick={() => 直写("promote", { match: e.slice(0, 60) })}>
                          {t("移回主记忆")}
                        </Button>
                      ) : (
                        <>
                          <Button variant="ghost" size="sm" onClick={() => 直写("archive", { match: e.slice(0, 60) })}>
                            {t("收进归档")}
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => 直写("remove", { match: e.slice(0, 60) })}>
                            {t("抹掉这条")}
                          </Button>
                        </>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </section>
    </div>
  )
}
