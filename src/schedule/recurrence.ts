/**
 * 计划 → 时刻（schedule，2026-08-22）。
 *
 * 学自 dsh-automation 的 `recurrence.ts`（Apache-2.0，思路借、代码自己写）。第一批四种：
 * 一次 / 每天 / 每周 / 每 N 分钟（月与「每 N 天」第二档）。**全是纯函数**，时刻一律 ISO UTC 串。
 *
 * **带时区**，但不引 luxon：四种计划只需要「某时区的 y-m-d HH:mm 对应哪个 UTC 时刻」，
 * `Intl.DateTimeFormat` 的 `formatToParts` 能把一个 UTC 时刻折成该时区的本地分量，
 * 两次迭代就能反解（夏令时切换那一小时除外——那时取靠后的那个解，与 luxon 的行为一致）。
 */

export type 计划 =
  | { kind: "once"; at: string; timeZone: string }
  | { kind: "daily"; time: string; timeZone: string }
  | { kind: "weekly"; weekdays: 星期[]; time: string; timeZone: string }
  | { kind: "interval"; everyMinutes: number; anchor: string; timeZone: string }
  /** 每月几号（第二档）。没有那一天的月份跳过 */
  | { kind: "monthly"; day: number; time: string; timeZone: string }
  /** 每 N 天（第二档），从 `start`（本地 y-m-d）那天起算 */
  | { kind: "everyDays"; everyDays: number; time: string; start: string; timeZone: string }

export type 星期 = "MO" | "TU" | "WE" | "TH" | "FR" | "SA" | "SU"
const 星期序: 星期[] = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"]

const 时间格式 = /^(?:[01]\d|2[0-3]):[0-5]\d$/

/** 认不认识这个 IANA 时区 */
export function 时区合法(zone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone })
    return true
  } catch {
    return false
  }
}

/** 回一句毛病；没毛病回 undefined */
export function 校验计划(p: 计划): string | undefined {
  if (!时区合法(p.timeZone)) return `不认识的时区：${p.timeZone}`
  if (p.kind === "once") return Number.isNaN(Date.parse(p.at)) ? `时刻不是 ISO：${p.at}` : undefined
  if (p.kind === "interval") {
    if (!Number.isInteger(p.everyMinutes) || p.everyMinutes < 1) return "间隔至少 1 分钟"
    return Number.isNaN(Date.parse(p.anchor)) ? `锚点不是 ISO：${p.anchor}` : undefined
  }
  if (!时间格式.test(p.time)) return `时间要写成 HH:mm（24 小时），给的是 ${p.time}`
  if (p.kind === "weekly" && p.weekdays.length === 0) return "每周至少选一个星期"
  if (p.kind === "monthly" && (!Number.isInteger(p.day) || p.day < 1 || p.day > 31)) return "每月几号要在 1 到 31 之间"
  if (p.kind === "everyDays") {
    if (!Number.isInteger(p.everyDays) || p.everyDays < 1) return "每几天至少 1 天"
    if (!/^\d{4}-\d{2}-\d{2}$/.test(p.start)) return `起点要写成 YYYY-MM-DD，给的是 ${p.start}`
  }
  return undefined
}

/** 某 UTC 时刻在该时区的本地分量 */
export function 本地分量(ms: number, zone: string): { y: number; m: number; d: number; h: number; mi: number; wd: 星期 } {
  const f = new Intl.DateTimeFormat("en-US", { timeZone: zone, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", weekday: "short" })
  const 取: Record<string, string> = {}
  for (const x of f.formatToParts(new Date(ms))) 取[x.type] = x.value
  const wd = ({ Sun: "SU", Mon: "MO", Tue: "TU", Wed: "WE", Thu: "TH", Fri: "FR", Sat: "SA" } as const)[取["weekday"] as "Sun"]
  return { y: Number(取["year"]), m: Number(取["month"]), d: Number(取["day"]), h: Number(取["hour"]) % 24, mi: Number(取["minute"]), wd }
}

/** 该时区的 y-m-d h:mi 是哪个 UTC 时刻（ISO）。夏令时空洞取靠后的解 */
export function 本地时刻转UTC(y: number, m: number, d: number, h: number, mi: number, zone: string): string {
  // 先把本地分量当成 UTC，再用「那一刻在该时区显示的分量」与目标的差去修正，两轮收敛
  let 猜 = Date.UTC(y, m - 1, d, h, mi)
  for (let i = 0; i < 2; i++) {
    const 本 = 本地分量(猜, zone)
    const 显示 = Date.UTC(本.y, 本.m - 1, 本.d, 本.h, 本.mi)
    const 差 = 显示 - Date.UTC(y, m - 1, d, h, mi)
    if (差 === 0) break
    猜 -= 差
  }
  return new Date(猜).toISOString()
}

const 分钟 = 60_000
const 一天 = 24 * 60 * 分钟

/** 按本地日历从某一天起往后数 `n` 天的 y-m-d（用 UTC 的日历算，只关心日期分量） */
function 加天(y: number, m: number, d: number, n: number): [number, number, number] {
  const t = new Date(Date.UTC(y, m - 1, d) + n * 一天)
  return [t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()]
}

/** after 之后（严格大于）的下一次；没有了回 null */
export function 下一次(p: 计划, after: string): string | null {
  const a = Date.parse(after)
  if (p.kind === "once") return Date.parse(p.at) > a ? new Date(Date.parse(p.at)).toISOString() : null
  if (p.kind === "interval") {
    const 锚 = Date.parse(p.anchor)
    const 步 = p.everyMinutes * 分钟
    if (a < 锚) return new Date(锚).toISOString()
    const n = Math.floor((a - 锚) / 步) + 1
    return new Date(锚 + n * 步).toISOString()
  }
  const [h, mi] = p.time.split(":").map(Number) as [number, number]
  const 本 = 本地分量(a, p.timeZone)
  // 从「after 那天」起逐天找第一个严格大于 after 且合规则的候选；每周最多看 8 天、每月最多 62 天、每 N 天最多 N+1 天
  const 最多 = p.kind === "monthly" ? 62 : p.kind === "everyDays" ? p.everyDays + 1 : 8
  for (let i = 0; i <= 最多; i++) {
    const [y, m, d] = 加天(本.y, 本.m, 本.d, i)
    if (!这天合规则(p, y, m, d)) continue
    const 候选 = 本地时刻转UTC(y, m, d, h, mi, p.timeZone)
    const t = Date.parse(候选)
    if (t <= a) continue
    return 候选
  }
  return null
}

/** 按日期的规则：每天都合；每周看星期；每月看几号；每 N 天看离起点的天数 */
function 这天合规则(p: 计划, y: number, m: number, d: number): boolean {
  if (p.kind === "weekly") return p.weekdays.includes(星期序[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]!)
  if (p.kind === "monthly") return d === p.day
  if (p.kind === "everyDays") {
    const [sy, sm, sd] = p.start.split("-").map(Number) as [number, number, number]
    const 差 = Math.round((Date.UTC(y, m - 1, d) - Date.UTC(sy, sm - 1, sd)) / 一天)
    return 差 >= 0 && 差 % p.everyDays === 0
  }
  return true
}

/** now 之前（含）最近的一次到期；还没到过回 null */
export function 最近一次到期(p: 计划, now: string): string | null {
  const n = Date.parse(now)
  if (p.kind === "once") return Date.parse(p.at) <= n ? new Date(Date.parse(p.at)).toISOString() : null
  if (p.kind === "interval") {
    const 锚 = Date.parse(p.anchor)
    const 步 = p.everyMinutes * 分钟
    if (n < 锚) return null
    return new Date(锚 + Math.floor((n - 锚) / 步) * 步).toISOString()
  }
  const [h, mi] = p.time.split(":").map(Number) as [number, number]
  const 本 = 本地分量(n, p.timeZone)
  const 最多 = p.kind === "monthly" ? 62 : p.kind === "everyDays" ? p.everyDays + 1 : 8
  for (let i = 0; i <= 最多; i++) {
    const [y, m, d] = 加天(本.y, 本.m, 本.d, -i)
    if (!这天合规则(p, y, m, d)) continue
    const 候选 = 本地时刻转UTC(y, m, d, h, mi, p.timeZone)
    const t = Date.parse(候选)
    if (t > n) continue
    return 候选
  }
  return null
}

export { 星期序 }
