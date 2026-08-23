/**
 * 「定时」那一屏（schedule，2026-08-22，学自 dsh-automation 的设置页）。
 *
 * 列表：名字 / 计划 / 跑在哪 / 下一次 / 上一次结果；行尾「⋯」：立即运行 / 编辑 / 暂停或恢复 / 删除。
 * 新建 / 编辑：名字、任务说明、计划（一次 / 每天 / 每周 / 每 N 分钟）、跑在哪（本机项目或服务器）、用哪个 agent。
 * 下面是执行记录。**常驻一句「DAWN 关着的时候不跑」**——别让人以为关了电脑也会跑。
 */
import { useEffect, useMemo, useRef, useState } from "react"
import { Button, EmptyState, Loader, Row } from "./primitives.js"
import { t, tf } from "./i18n/index.js"
import { 年月日时分 } from "./format.js"

export type 计划 =
  | { kind: "once"; at: string; timeZone: string }
  | { kind: "daily"; time: string; timeZone: string }
  | { kind: "weekly"; weekdays: ("MO" | "TU" | "WE" | "TH" | "FR" | "SA" | "SU")[]; time: string; timeZone: string }
  | { kind: "interval"; everyMinutes: number; anchor: string; timeZone: string }
  | { kind: "monthly"; day: number; time: string; timeZone: string }
  | { kind: "everyDays"; everyDays: number; time: string; start: string; timeZone: string }

export interface 运行摘要 {
  id: string
  scheduleId: string
  trigger: "schedule" | "manual"
  scheduledFor: string
  status: "queued" | "running" | "succeeded" | "failed" | "skipped" | "cancelled"
  sessionId?: string
  startedAt?: string
  finishedAt?: string
  summary?: string
  error?: { code: string; message: string }
}
export interface 定时摘要 {
  id: string
  revision: number
  name: string
  prompt: string
  status: "active" | "paused"
  schedule: 计划
  agentId: string
  workspace?: string
  connectionId?: string
  where: string
  permission: "allow-all" | "ask-risky" | "deny-risky"
  nextAt?: string
  lastRun?: 运行摘要
}

export interface ScheduleActions {
  load: () => Promise<{ schedules: 定时摘要[]; nextDueAt?: string }>
  loadRuns: (id?: string) => Promise<{ runs: 运行摘要[] }>
  create: (req: { name: string; prompt: string; schedule: 计划; agentId: string; workspace?: string; connectionId?: string; permission?: "allow-all" | "ask-risky" | "deny-risky" }) => Promise<unknown>
  update: (req: { id: string; name?: string; prompt?: string; schedule?: 计划; status?: "active" | "paused"; permission?: "allow-all" | "ask-risky" | "deny-risky" }) => Promise<unknown>
  remove: (id: string) => Promise<unknown>
  runNow: (id: string) => Promise<unknown>
  问: (req: { title: string; detail: React.ReactNode; confirmLabel: string }) => Promise<"confirm" | "alt" | "cancel">
  /** 打开某次运行的会话 */
  openSession: (sessionId: string) => void
  /** 可选的去处与 agent */
  projects: { projectId: string; name: string; workspace: string }[]
  connections: { id: string; label: string }[]
  agents: { agentId: string; remoteCapable: boolean }[]
}

const 星期 = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"] as const
const 星期名 = (): Record<(typeof 星期)[number], string> => ({ MO: t("一"), TU: t("二"), WE: t("三"), TH: t("四"), FR: t("五"), SA: t("六"), SU: t("日") })
const 本机时区 = () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"

export function 说计划(p: 计划): string {
  if (p.kind === "once") return tf("{0} 一次", 年月日时分(p.at))
  if (p.kind === "daily") return tf("每天 {0}", p.time)
  if (p.kind === "interval") return tf("每 {0} 分钟", p.everyMinutes)
  if (p.kind === "monthly") return tf("每月 {0} 号 {1}", p.day, p.time)
  if (p.kind === "everyDays") return tf("每 {0} 天 {1}（从 {2} 起）", p.everyDays, p.time, p.start)
  const 名 = 星期名()
  return tf("每周{0} {1}", p.weekdays.map((w) => 名[w]).join("、"), p.time)
}
const 状态名 = (s: 运行摘要["status"]) =>
  s === "succeeded" ? t("成功") : s === "failed" ? t("失败") : s === "skipped" ? t("跳过") : s === "running" ? t("跑着") : s === "queued" ? t("排队") : t("取消了")

/** 本地 `datetime-local` 的值 ↔ ISO */
const 本地转ISO = (v: string) => (v ? new Date(v).toISOString() : "")
const ISO转本地 = (iso: string) => {
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

interface 表单 {
  name: string
  prompt: string
  kind: 计划["kind"]
  time: string
  at: string
  everyMinutes: number
  weekdays: (typeof 星期)[number][]
  day: number
  everyDays: number
  start: string
  permission: "allow-all" | "ask-risky" | "deny-risky"
  去哪: string
  agentId: string
}
const 今天 = () => new Date().toISOString().slice(0, 10)
const 空表单 = (agentId: string, 去哪: string): 表单 => ({ name: "", prompt: "", kind: "daily", time: "09:00", at: "", everyMinutes: 60, weekdays: ["MO"], day: 1, everyDays: 2, start: 今天(), permission: "deny-risky", 去哪, agentId })
const 表单自定义 = (d: 定时摘要): 表单 => ({
  name: d.name, prompt: d.prompt, kind: d.schedule.kind,
  // 每月 / 每 N 天也有时间（2026-08-23 审查抓的：此前编辑这两种会把时间悄悄改回 09:00）
  time: d.schedule.kind === "daily" || d.schedule.kind === "weekly" || d.schedule.kind === "monthly" || d.schedule.kind === "everyDays" ? d.schedule.time : "09:00",
  at: d.schedule.kind === "once" ? ISO转本地(d.schedule.at) : "",
  everyMinutes: d.schedule.kind === "interval" ? d.schedule.everyMinutes : 60,
  weekdays: d.schedule.kind === "weekly" ? d.schedule.weekdays : ["MO"],
  day: d.schedule.kind === "monthly" ? d.schedule.day : 1,
  everyDays: d.schedule.kind === "everyDays" ? d.schedule.everyDays : 2,
  start: d.schedule.kind === "everyDays" ? d.schedule.start : 今天(),
  permission: d.permission,
  去哪: d.connectionId ? `远端:${d.connectionId}` : `本机:${d.workspace ?? ""}`,
  agentId: d.agentId,
})
function 表单转计划(f: 表单): 计划 | string {
  const timeZone = 本机时区()
  if (f.kind === "once") return f.at ? { kind: "once", at: 本地转ISO(f.at), timeZone } : t("选一个时刻")
  if (f.kind === "daily") return { kind: "daily", time: f.time, timeZone }
  if (f.kind === "interval") return f.everyMinutes >= 1 ? { kind: "interval", everyMinutes: Math.floor(f.everyMinutes), anchor: new Date().toISOString(), timeZone } : t("间隔至少 1 分钟")
  if (f.kind === "monthly") return f.day >= 1 && f.day <= 31 ? { kind: "monthly", day: Math.floor(f.day), time: f.time, timeZone } : t("每月几号要在 1 到 31 之间")
  if (f.kind === "everyDays") return f.everyDays >= 1 && /^\d{4}-\d{2}-\d{2}$/.test(f.start) ? { kind: "everyDays", everyDays: Math.floor(f.everyDays), time: f.time, start: f.start, timeZone } : t("每几天至少 1 天，起点要选一天")
  return f.weekdays.length ? { kind: "weekly", weekdays: f.weekdays, time: f.time, timeZone } : t("每周至少选一天")
}

export function ScheduleView({ actions }: { actions?: ScheduleActions | undefined }) {
  const [数据, 设数据] = useState<{ schedules: 定时摘要[]; nextDueAt?: string } | undefined>(undefined)
  const [记录, 设记录] = useState<运行摘要[]>([])
  const [出错, 设出错] = useState<string | undefined>(undefined)
  const [代, 设代] = useState(0)
  const [忙, 设忙] = useState<string | undefined>(undefined)
  const [回话, 设回话] = useState<{ kind: "ok" | "bad"; text: string } | undefined>(undefined)
  const [编辑, 设编辑] = useState<{ id?: string; f: 表单 } | undefined>(undefined)
  const [菜单, 设菜单] = useState<{ id: string; top: number; left: number } | undefined>(undefined)
  const [看记录的, 设看记录的] = useState<string | undefined>(undefined)
  /** 执行记录的筛（第二档）：时段 × 状态 */
  const [筛时段, 设筛时段] = useState<"all" | "day" | "week" | "month">("all")
  const [筛状态, 设筛状态] = useState<"all" | 运行摘要["status"]>("all")

  useEffect(() => {
    if (!actions) return
    let 还在 = true
    actions
      .load()
      .then((d) => 还在 && 设数据(d))
      .catch((e: unknown) => 还在 && 设出错(e instanceof Error ? e.message : String(e)))
    actions
      .loadRuns(看记录的)
      .then((r) => 还在 && 设记录(r.runs))
      // 读不到要出声（2026-08-23 审查抓的：此前吞掉之后显示「还没跑过」）
      .catch((e: unknown) => 还在 && 设回话({ kind: "bad", text: e instanceof Error ? e.message : String(e) }))
    return () => {
      还在 = false
    }
  }, [actions, 代, 看记录的])
  // 跑着的时候每 3 秒重取一次，好看见它结束
  useEffect(() => {
    if (!记录.some((r) => r.status === "running" || r.status === "queued")) return
    const id = setInterval(() => 设代((n) => n + 1), 3000)
    return () => clearInterval(id)
  }, [记录])

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

  const 去处 = useMemo(
    () => [
      ...(actions?.projects ?? []).map((p) => ({ key: `本机:${p.workspace}`, label: p.name, sub: p.workspace, 远端: false })),
      ...(actions?.connections ?? []).map((c) => ({ key: `远端:${c.id}`, label: c.label, sub: t("服务器"), 远端: true })),
    ],
    [actions],
  )

  const 筛过的记录 = useMemo(() => {
    const now = Date.now()
    const 起 = 筛时段 === "day" ? now - 86_400_000 : 筛时段 === "week" ? now - 7 * 86_400_000 : 筛时段 === "month" ? now - 30 * 86_400_000 : 0
    return 记录.filter((r) => (筛状态 === "all" || r.status === 筛状态) && Date.parse(r.scheduledFor) >= 起)
  }, [记录, 筛时段, 筛状态])

  if (!actions) return <EmptyState title={t("本次运行没有装配定时任务")} description={t("这是启动时的装配问题，不是配置问题。")} />
  if (出错) return <EmptyState title={t("读不到定时任务")} description={出错} />
  if (!数据) return <Loader label={t("正在读定时任务")} />

  const 开新建 = () => 设编辑({ f: 空表单(actions.agents[0]?.agentId ?? "", 去处[0]?.key ?? "") })
  const 提交 = async () => {
    if (!编辑) return
    const f = 编辑.f
    const 计 = 表单转计划(f)
    if (typeof 计 === "string") {
      设回话({ kind: "bad", text: 计 })
      return
    }
    if (!f.name.trim() || !f.prompt.trim()) {
      设回话({ kind: "bad", text: t("名字和任务说明都要填") })
      return
    }
    await 做("form", async () => {
      if (编辑.id) {
        await actions.update({ id: 编辑.id, name: f.name, prompt: f.prompt, schedule: 计, permission: f.permission })
        设编辑(undefined)
        return tf("「{0}」改好了；已排队的那次按旧的跑", f.name)
      }
      const 远端 = f.去哪.startsWith("远端:")
      await actions.create({ name: f.name, prompt: f.prompt, schedule: 计, agentId: f.agentId, permission: f.permission, ...(远端 ? { connectionId: f.去哪.slice(3) } : { workspace: f.去哪.slice(3) }) })
      设编辑(undefined)
      return tf("「{0}」建好了", f.name)
    })
  }

  return (
    <div className="skills-page schedule-page">
      <header className="skills-head">
        <h1 className="panel-title">{t("定时")}</h1>
        <p className="hint">{t("到点了就开一段全新的会话、把任务说明发给它、等它做完——不继承任何对话。无人值守：要确认的一律拒。")}</p>
        {/* **常驻，不是提示一次**：这是最容易被误解的一件事 */}
        <p className="caveat">{t("DAWN 关着的时候不跑。回来时超过 15 分钟的那次记成「跳过」，不补。")}</p>
        <div className="skills-actions">
          <Button variant="secondary" size="sm" disabled={Boolean(编辑)} onClick={开新建}>
            {t("新建定时任务")}
          </Button>
          {数据.nextDueAt ? <span className="hint skills-count">{tf("下一次：{0}", 年月日时分(数据.nextDueAt))}</span> : null}
        </div>
        {回话 ? (
          <p className={回话.kind === "bad" ? "caveat" : "mcp-ok"} role="status">
            {回话.text}
          </p>
        ) : null}
      </header>

      {编辑 ? (
        <form
          className="schedule-form"
          aria-label={编辑.id ? t("编辑定时任务") : t("新建定时任务")}
          onSubmit={(e) => {
            e.preventDefault()
            void 提交()
          }}
        >
          <label className="schedule-field">
            <span>{t("名字")}</span>
            <input className="control" value={编辑.f.name} onChange={(e) => 设编辑({ ...编辑, f: { ...编辑.f, name: e.target.value } })} />
          </label>
          <label className="schedule-field">
            <span>{t("任务说明")}</span>
            <textarea className="control" rows={4} value={编辑.f.prompt} placeholder={t("自包含地写：它每次都是一段新对话，记不得上次")} onChange={(e) => 设编辑({ ...编辑, f: { ...编辑.f, prompt: e.target.value } })} />
          </label>
          <div className="schedule-field">
            <span>{t("计划")}</span>
            <div className="theme-choices" role="radiogroup" aria-label={t("计划")}>
              {(["daily", "weekly", "monthly", "everyDays", "interval", "once"] as const).map((k) => (
                <Button key={k} variant={编辑.f.kind === k ? "primary" : "secondary"} size="sm" role="radio" aria-checked={编辑.f.kind === k} onClick={() => 设编辑({ ...编辑, f: { ...编辑.f, kind: k } })}>
                  {k === "daily" ? t("每天") : k === "weekly" ? t("每周") : k === "monthly" ? t("每月") : k === "everyDays" ? t("每 N 天") : k === "interval" ? t("每 N 分钟") : t("一次")}
                </Button>
              ))}
            </div>
            {编辑.f.kind === "daily" || 编辑.f.kind === "weekly" || 编辑.f.kind === "monthly" || 编辑.f.kind === "everyDays" ? (
              <input className="control schedule-time" type="time" aria-label={t("几点")} value={编辑.f.time} onChange={(e) => 设编辑({ ...编辑, f: { ...编辑.f, time: e.target.value } })} />
            ) : null}
            {编辑.f.kind === "monthly" ? (
              <input className="control schedule-time" type="number" min={1} max={31} aria-label={t("每月几号")} value={编辑.f.day} onChange={(e) => 设编辑({ ...编辑, f: { ...编辑.f, day: Number(e.target.value) } })} />
            ) : null}
            {编辑.f.kind === "everyDays" ? (
              <span className="schedule-inline">
                <input className="control schedule-time" type="number" min={1} aria-label={t("每几天")} value={编辑.f.everyDays} onChange={(e) => 设编辑({ ...编辑, f: { ...编辑.f, everyDays: Number(e.target.value) } })} />
                <input className="control schedule-time" type="date" aria-label={t("从哪天起")} value={编辑.f.start} onChange={(e) => 设编辑({ ...编辑, f: { ...编辑.f, start: e.target.value } })} />
              </span>
            ) : null}
            {编辑.f.kind === "weekly" ? (
              <div className="theme-choices" role="group" aria-label={t("星期几")}>
                {星期.map((w) => {
                  const 选了 = 编辑.f.weekdays.includes(w)
                  return (
                    <Button key={w} variant={选了 ? "primary" : "secondary"} size="sm" aria-pressed={选了} onClick={() => 设编辑({ ...编辑, f: { ...编辑.f, weekdays: 选了 ? 编辑.f.weekdays.filter((x) => x !== w) : [...编辑.f.weekdays, w] } })}>
                      {星期名()[w]}
                    </Button>
                  )
                })}
              </div>
            ) : null}
            {编辑.f.kind === "interval" ? (
              <input className="control schedule-time" type="number" min={1} aria-label={t("每几分钟")} value={编辑.f.everyMinutes} onChange={(e) => 设编辑({ ...编辑, f: { ...编辑.f, everyMinutes: Number(e.target.value) } })} />
            ) : null}
            {编辑.f.kind === "once" ? (
              <input className="control schedule-time" type="datetime-local" aria-label={t("哪个时刻")} value={编辑.f.at} onChange={(e) => 设编辑({ ...编辑, f: { ...编辑.f, at: e.target.value } })} />
            ) : null}
            <span className="hint">{tf("时区：{0}", 本机时区())}</span>
          </div>
          <div className="schedule-field">
            <span>{t("工具权限")}</span>
            <div className="theme-choices" role="radiogroup" aria-label={t("工具权限")}>
              {(["deny-risky", "allow-all"] as const).map((p) => (
                <Button key={p} variant={编辑.f.permission === p ? "primary" : "secondary"} size="sm" role="radio" aria-checked={编辑.f.permission === p} onClick={() => 设编辑({ ...编辑, f: { ...编辑.f, permission: p } })}>
                  {p === "deny-risky" ? t("自动拦截") : t("完全访问")}
                </Button>
              ))}
            </div>
            <span className="hint">{t("无人值守：「自动拦截」会拒掉改原始数据、装包、联网、删东西；问不到人的一律拒。")}</span>
          </div>
          {!编辑.id ? (
            <>
              <label className="schedule-field">
                <span>{t("跑在哪")}</span>
                <select
                  className="control"
                  value={编辑.f.去哪}
                  onChange={(e) => {
                    const 去哪 = e.target.value
                    // 切到远端时当前 agent 可能手到不了服务器——校正到能用的第一项（2026-08-23 审查抓的：此前只靠服务端拒）
                    const 能用 = actions.agents.filter((a) => !去哪.startsWith("远端:") || a.remoteCapable)
                    const agentId = 能用.some((a) => a.agentId === 编辑.f.agentId) ? 编辑.f.agentId : (能用[0]?.agentId ?? 编辑.f.agentId)
                    设编辑({ ...编辑, f: { ...编辑.f, 去哪, agentId } })
                  }}
                >
                  {去处.map((x) => (
                    <option key={x.key} value={x.key}>
                      {x.label} — {x.sub}
                    </option>
                  ))}
                </select>
              </label>
              <label className="schedule-field">
                <span>{t("用哪个 agent")}</span>
                <select className="control" value={编辑.f.agentId} onChange={(e) => 设编辑({ ...编辑, f: { ...编辑.f, agentId: e.target.value } })}>
                  {actions.agents
                    .filter((a) => !编辑.f.去哪.startsWith("远端:") || a.remoteCapable)
                    .map((a) => (
                      <option key={a.agentId} value={a.agentId}>
                        {a.agentId}
                      </option>
                    ))}
                </select>
              </label>
            </>
          ) : (
            <p className="hint">{t("跑在哪、用哪个 agent 建好就不改了；要换就删了重建。")}</p>
          )}
          <div className="skills-actions">
            <Button variant="primary" size="sm" type="submit" disabled={忙 === "form"}>
              {编辑.id ? t("保存改动") : t("建好")}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => 设编辑(undefined)}>
              {t("算了")}
            </Button>
          </div>
        </form>
      ) : null}

      {数据.schedules.length === 0 && !编辑 ? (
        <EmptyState title={t("还没有定时任务")} description={t("比如：每天早上九点看看昨晚跑完的数据，把异常写成一段话。")} />
      ) : (
        <ul className="skill-group" aria-label={t("定时任务清单")}>
          {数据.schedules.map((d) => (
            <li key={d.id} className="skill-row" data-state={d.status === "paused" ? "off" : undefined}>
              <div className="skill-row-main">
                <p className="skill-name">
                  <span className="skill-name-text">{d.name}</span>
                  <span className="tag">{说计划(d.schedule)}</span>
                  <span className="tag">{d.where}</span>
                  {d.status === "paused" ? <span className="tag tag-off">{t("暂停中")}</span> : null}
                  {d.permission === "allow-all" ? <span className="tag tag-bad">{t("完全访问")}</span> : null}
                  {d.lastRun ? <span className={`tag tag-${d.lastRun.status === "succeeded" ? "model" : d.lastRun.status === "failed" ? "bad" : "manual"}`}>{tf("上次{0}", 状态名(d.lastRun.status))}</span> : null}
                </p>
                <p className="skill-desc">
                  {d.nextAt ? tf("下一次 {0}", 年月日时分(d.nextAt)) : t("不会再跑")}
                  {d.lastRun?.summary ? ` · ${d.lastRun.summary}` : d.lastRun?.error ? ` · ${d.lastRun.error.message}` : ""}
                </p>
              </div>
              <div className="row-actions skill-row-actions">
                <Button variant="ghost" size="sm" disabled={忙 === d.id} onClick={() => void 做(d.id, async () => { await actions.update({ id: d.id, status: d.status === "active" ? "paused" : "active" }); return d.status === "active" ? tf("「{0}」暂停了", d.name) : tf("「{0}」恢复了", d.name) })}>
                  {d.status === "active" ? t("暂停") : t("恢复")}
                </Button>
                <行尾菜单
                  d={d}
                  开着={菜单?.id === d.id ? 菜单 : undefined}
                  设开着={设菜单}
                  onRunNow={() => void 做(d.id, async () => { await actions.runNow(d.id); 设看记录的(d.id); return tf("「{0}」开跑了，记录在下面", d.name) })}
                  onEdit={() => 设编辑({ id: d.id, f: 表单自定义(d) })}
                  onRuns={() => 设看记录的(d.id)}
                  onDelete={() =>
                    void (async () => {
                      const 答 = await actions.问({ title: tf("删掉定时任务「{0}」？", d.name), detail: t("以后不再跑；已经跑过的记录留着。"), confirmLabel: t("删掉它") })
                      if (答 !== "confirm") return
                      await 做(d.id, async () => { await actions.remove(d.id); return tf("「{0}」删了", d.name) })
                    })()
                  }
                />
              </div>
            </li>
          ))}
        </ul>
      )}

      <section className="schedule-runs">
        <h2 className="panel-title">
          {看记录的 ? tf("「{0}」的执行记录", 数据.schedules.find((d) => d.id === 看记录的)?.name ?? 看记录的) : t("执行记录")}
          {看记录的 ? (
            <Button variant="ghost" size="sm" onClick={() => 设看记录的(undefined)}>
              {t("看全部的")}
            </Button>
          ) : null}
        </h2>
        {记录.length > 0 ? (
          <div className="skills-filters">
            <div className="theme-choices" role="radiogroup" aria-label={t("时段")}>
              {(["all", "day", "week", "month"] as const).map((k) => (
                <Button key={k} variant={筛时段 === k ? "primary" : "secondary"} size="sm" role="radio" aria-checked={筛时段 === k} onClick={() => 设筛时段(k)}>
                  {k === "all" ? t("全部") : k === "day" ? t("今天") : k === "week" ? t("这一周") : t("这个月")}
                </Button>
              ))}
            </div>
            <select className="control schedule-time" aria-label={t("状态")} value={筛状态} onChange={(e) => 设筛状态(e.target.value as typeof 筛状态)}>
              <option value="all">{t("所有状态")}</option>
              {(["succeeded", "failed", "skipped", "running", "queued", "cancelled"] as const).map((s) => (
                <option key={s} value={s}>{状态名(s)}</option>
              ))}
            </select>
          </div>
        ) : null}
        {记录.length === 0 ? (
          <p className="hint">{t("还没跑过。")}</p>
        ) : 筛过的记录.length === 0 ? (
          <p className="hint">{t("这个筛法下没有记录。")}</p>
        ) : (
          <ul className="skill-group">
            {筛过的记录.map((r) => (
              <li key={r.id} className="skill-row schedule-run-row">
                <Row className="skill-row-main archived-row-main" onClick={() => r.sessionId && actions.openSession(r.sessionId)}>
                  <p className="skill-name">
                    <span className={`tag tag-${r.status === "succeeded" ? "model" : r.status === "failed" ? "bad" : "manual"}`}>{状态名(r.status)}</span>
                    <span className="skill-name-text">{数据.schedules.find((d) => d.id === r.scheduleId)?.name ?? r.scheduleId}</span>
                    <span className="tag">{r.trigger === "manual" ? t("手动") : t("到点")}</span>
                    <span className="hint">{年月日时分(r.scheduledFor)}</span>
                  </p>
                  <p className="skill-desc">{r.summary ?? r.error?.message ?? (r.status === "running" ? t("跑着…") : "")}</p>
                </Row>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function 行尾菜单({ d, 开着, 设开着, onRunNow, onEdit, onRuns, onDelete }: { d: 定时摘要; 开着: { top: number; left: number } | undefined; 设开着: (m: { id: string; top: number; left: number } | undefined) => void; onRunNow: () => void; onEdit: () => void; onRuns: () => void; onDelete: () => void }) {
  const 按钮 = useRef<HTMLButtonElement>(null)
  const 打开 = () => {
    const r = 按钮.current?.getBoundingClientRect()
    if (!r) return
    设开着({ id: d.id, top: Math.min(Math.max(8, r.bottom + 4), window.innerHeight - 180), left: Math.max(8, r.right - 180) })
  }
  const 点 = (f: () => void) => () => {
    设开着(undefined)
    f()
  }
  return (
    <>
      <Button ref={按钮} variant="ghost" size="icon" className="row-more" aria-label={tf("定时任务操作：{0}", d.name)} aria-expanded={Boolean(开着)} onClick={() => (开着 ? 设开着(undefined) : 打开())}>
        ⋯
      </Button>
      {开着 ? (
        <>
          <div className="menu-scrim" onClick={() => 设开着(undefined)} />
          <div className="row-menu" role="menu" aria-label={tf("定时任务操作：{0}", d.name)} style={{ top: 开着.top, left: 开着.left }}>
            <Button variant="ghost" size="inline" role="menuitem" onClick={点(onRunNow)}>{t("立即跑一次")}</Button>
            <Button variant="ghost" size="inline" role="menuitem" onClick={点(onEdit)}>{t("编辑")}</Button>
            <Button variant="ghost" size="inline" role="menuitem" onClick={点(onRuns)}>{t("看它的记录")}</Button>
            <Button variant="text" size="inline" role="menuitem" className="menu-danger" onClick={点(onDelete)}>{t("删除")}</Button>
          </div>
        </>
      ) : null}
    </>
  )
}
