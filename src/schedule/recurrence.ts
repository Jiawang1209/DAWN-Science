/**
 * 计划 → 时刻（schedule，2026-08-22）。
 *
 * 学自 dsh-automation 的 `recurrence.ts`（Apache-2.0，思路借、代码自己写）。第一批四种：
 * 一次 / 每天 / 每周 / 每 N 分钟（月与「每 N 天」第二档）。**全是纯函数**，时刻一律 ISO UTC 串。
 *
 * **带时区**，但不引 luxon：四种计划只需要「某时区的 y-m-d HH:mm 对应哪个 UTC 时刻」，
 * `Intl.DateTimeFormat` 的 `formatToParts` 能把一个 UTC 时刻折成该时区的本地分量，
 * 用切换前后的偏移反解：重复时段取第一次，夏令时空洞按偏移变化向后平移。
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
const 分钟 = 60_000
const 一天 = 24 * 60 * 分钟
// JS Date 的两端各为距 epoch 一亿天；周期不得超过整个可表示跨度。
const 最大时刻 = 8_640_000_000_000_000

const 时刻可表示 = (ms: number): boolean => Number.isFinite(ms) && Math.abs(ms) <= 最大时刻
const 周期可表示 = (n: number, unit: number): boolean => Number.isSafeInteger(n) && n >= 1 && n <= 2 * 最大时刻 / unit
function 可表示ISO(ms: number): string | null { return 时刻可表示(ms) ? new Date(ms).toISOString() : null }

function 日历日期合法(value: string): boolean {
  const parts = /^(\d{4}|[+-]\d{6})-(\d{2})-(\d{2})$/.exec(value)
  if (!parts || parts[1] === "-000000") return false
  const year = Number(parts[1]), month = Number(parts[2]), day = Number(parts[3])
  const equivalentYear = year - Math.floor((year - 2000) / 400) * 400
  // 日历日可位于 UTC 范围外，但其带偏移的真实时刻仍可表示；在安全周期验证日期。
  const date = new Date(Date.UTC(equivalentYear, month - 1, day))
  return date.getUTCFullYear() === equivalentYear && date.getUTCMonth() + 1 === month && date.getUTCDate() === day
}

function 时刻合法(value: string): boolean {
  // 新建/替换时刻只接受 ISO 日期，或带显式时区的 ISO 日期时间。
  // 不把非 ISO、空白或依赖宿主时区的输入交给 Date.parse 猜测。
  if (value !== value.trim()) return false
  const match = /^((?:\d{4}|[+-]\d{6})-\d{2}-\d{2})(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2}))?$/i.exec(value)
  return !!match && 日历日期合法(match[1]!) && Number.isFinite(Date.parse(value))
}

/** 存量格式仍可解析，但不能将已保存的非法 ISO 日历日滚动到另一天执行。 */
function 解析现有时刻(value: string): number {
  const day = /^((?:\d{4}|[+-]\d{6})-\d{2}-\d{2})(?:T|\s|$)/i.exec(value.trim())?.[1]
  return day && !日历日期合法(day) ? NaN : Date.parse(value)
}

/** 公历每 400 年重复；归到安全周期计算，保留日期边界外用于时区反解的本地坐标。 */
function 日历UTC(y: number, m: number, d: number, h = 0, mi = 0): number {
  const cycles = Math.floor((y - 2000) / 400)
  return Date.UTC(y - cycles * 400, m - 1, d, h, mi) + cycles * 146_097 * 一天
}

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
  if (p.kind === "once") return 时刻合法(p.at) ? undefined : `时刻要用有效 ISO 日期或带时区的 ISO 时间：${p.at}`
  if (p.kind === "interval") {
    if (!Number.isSafeInteger(p.everyMinutes) || p.everyMinutes < 1) return "间隔至少 1 分钟"
    if (p.everyMinutes > 2 * 最大时刻 / 分钟) return "间隔超出可计算日期范围"
    return 时刻合法(p.anchor) ? undefined : `锚点要用有效 ISO 日期或带时区的 ISO 时间：${p.anchor}`
  }
  if (!时间格式.test(p.time)) return `时间要写成 HH:mm（24 小时），给的是 ${p.time}`
  if (p.kind === "weekly" && p.weekdays.length === 0) return "每周至少选一个星期"
  if (p.kind === "monthly" && (!Number.isInteger(p.day) || p.day < 1 || p.day > 31)) return "每月几号要在 1 到 31 之间"
  if (p.kind === "everyDays") {
    if (!Number.isSafeInteger(p.everyDays) || p.everyDays < 1) return "每几天至少 1 天"
    if (p.everyDays > 2 * 最大时刻 / 一天) return "间隔超出可计算日期范围"
    if (!/^\d{4}-\d{2}-\d{2}$/.test(p.start)) return `起点要写成 YYYY-MM-DD，给的是 ${p.start}`
    if (!日历日期合法(p.start)) return `起点不是有效日期：${p.start}`
  }
  return undefined
}

/** 某 UTC 时刻在该时区的本地分量 */
export function 本地分量(ms: number, zone: string): { y: number; m: number; d: number; h: number; mi: number; wd: 星期 } {
  const f = new Intl.DateTimeFormat("en-US", { timeZone: zone, hourCycle: "h23", era: "short", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", weekday: "short" })
  const 取: Record<string, string> = {}
  for (const x of f.formatToParts(new Date(ms))) 取[x.type] = x.value
  const wd = ({ Sun: "SU", Mon: "MO", Tue: "TU", Wed: "WE", Thu: "TH", Fri: "FR", Sat: "SA" } as const)[取["weekday"] as "Sun"]
  const year = Number(取["year"])
  return { y: 取["era"] === "BC" ? 1 - year : year, m: Number(取["month"]), d: Number(取["day"]), h: Number(取["hour"]) % 24, mi: Number(取["minute"]), wd }
}

/** 该时区的 y-m-d h:mi 是哪个 UTC 时刻（ISO）。重复取早，空洞向后平移 */
export function 本地时刻转UTC(y: number, m: number, d: number, h: number, mi: number, zone: string): string {
  const 目标 = 日历UTC(y, m, d, h, mi)
  const 显示时刻 = (t: number): number => {
    const 本 = 本地分量(t, zone)
    return 日历UTC(本.y, 本.m, 本.d, 本.h, 本.mi)
  }
  // 两侧采样涵盖切换前后偏移；不固定偏移为整小时，也不在空洞中迭代振荡。
  const 样本 = [-一天, 0, 一天].map(差 => 目标 + 差).filter(时刻可表示)
  const 偏移 = new Set(样本.map(t => 显示时刻(t) - t))
  const 候选 = [...偏移].map(差 => 目标 - 差).filter(时刻可表示).sort((a, b) => a - b)
  const 精确 = 候选.find(t => 显示时刻(t) === 目标)
  if (精确 !== undefined) return new Date(精确).toISOString()
  // 不存在的本地时间取显示在目标之后的候选，例如 02:30 → 03:30。
  const 靠后 = 候选.filter(t => 显示时刻(t) > 目标)
    .sort((a, b) => 显示时刻(a) - 显示时刻(b))[0]!
  return new Date(靠后).toISOString()
}

/** 超出日期范围时没有该候选；其他编程错误仍抛出。 */
function 可表示本地时刻(y: number, m: number, d: number, h: number, mi: number, zone: string): string | null {
  if (!Number.isFinite(日历UTC(y, m, d, h, mi))) return null
  try { return 本地时刻转UTC(y, m, d, h, mi, zone) }
  catch (error) { if (error instanceof RangeError) return null; throw error }
}

/** 按本地日历从某一天起往后数 `n` 天的 y-m-d（用 UTC 的日历算，只关心日期分量） */
function 加天(y: number, m: number, d: number, n: number): [number, number, number] {
  const years = Math.floor((y - 2000) / 400), days = Math.floor(n / 146_097)
  const t = new Date(Date.UTC(y - years * 400, m - 1, d + n - days * 146_097))
  return [t.getUTCFullYear() + (years + days) * 400, t.getUTCMonth() + 1, t.getUTCDate()]
}

/** after 之后（严格大于）的下一次；没有了回 null */
export function 下一次(p: 计划, after: string): string | null {
  const a = Date.parse(after)
  if (!Number.isFinite(a)) return null
  if (p.kind === "once") { const t = 解析现有时刻(p.at); return t > a ? 可表示ISO(t) : null }
  if (p.kind === "interval") {
    if (!周期可表示(p.everyMinutes, 分钟)) return null
    const 锚 = 解析现有时刻(p.anchor)
    if (!Number.isFinite(锚)) return null
    const 步 = BigInt(p.everyMinutes) * BigInt(分钟)
    if (a < 锚) return 可表示ISO(锚)
    // 两个合法时刻的差可超过 Number 的安全整数；保留边界前后的 1 ms。
    const n = (BigInt(a) - BigInt(锚)) / 步 + 1n
    return 可表示ISO(Number(BigInt(锚) + n * 步))
  }
  if (校验计划(p) !== undefined) return null
  const [h, mi] = p.time.split(":").map(Number) as [number, number]
  const 本 = 本地分量(a, p.timeZone)
  if (p.kind === "everyDays") {
    if (!周期可表示(p.everyDays, 一天)) return null
    const [sy, sm, sd] = p.start.split("-").map(Number) as [number, number, number]
    const 差 = Math.round((日历UTC(本.y, 本.m, 本.d) - 日历UTC(sy, sm, sd)) / 一天)
    const 第几次 = Math.max(0, Math.ceil(差 / p.everyDays))
    const 候选 = (k: number): string | null => {
      const [y, m, d] = 加天(sy, sm, sd, k * p.everyDays)
      return 可表示本地时刻(y, m, d, h, mi, p.timeZone)
    }
    const t = 候选(第几次)
    if (t === null) return null
    return Date.parse(t) > a ? t : 候选(第几次 + 1)
  }
  // 从 after 那天起逐天找；每周最多看 8 天、每月最多 62 天。
  const 最多 = p.kind === "monthly" ? 62 : 8
  for (let i = 0; i <= 最多; i++) {
    const [y, m, d] = 加天(本.y, 本.m, 本.d, i)
    if (!这天合规则(p, y, m, d)) continue
    const 候选 = 可表示本地时刻(y, m, d, h, mi, p.timeZone)
    if (候选 === null) continue
    const t = Date.parse(候选)
    if (t <= a) continue
    return 候选
  }
  return null
}

/** 按日期的规则：每天都合；每周看星期；每月看几号；每 N 天看离起点的天数 */
function 这天合规则(p: 计划, y: number, m: number, d: number): boolean {
  if (p.kind === "weekly") {
    const equivalentYear = y - Math.floor((y - 2000) / 400) * 400
    return p.weekdays.includes(星期序[new Date(Date.UTC(equivalentYear, m - 1, d)).getUTCDay()]!)
  }
  if (p.kind === "monthly") return d === p.day
  if (p.kind === "everyDays") {
    const [sy, sm, sd] = p.start.split("-").map(Number) as [number, number, number]
    const 差 = Math.round((日历UTC(y, m, d) - 日历UTC(sy, sm, sd)) / 一天)
    return 差 >= 0 && 差 % p.everyDays === 0
  }
  return true
}

/** now 之前（含）最近的一次到期；还没到过回 null */
export function 最近一次到期(p: 计划, now: string): string | null {
  const n = Date.parse(now)
  if (!Number.isFinite(n)) return null
  if (p.kind === "once") { const t = 解析现有时刻(p.at); return t <= n ? 可表示ISO(t) : null }
  if (p.kind === "interval") {
    if (!周期可表示(p.everyMinutes, 分钟)) return null
    const 锚 = 解析现有时刻(p.anchor)
    if (!Number.isFinite(锚)) return null
    const 步 = BigInt(p.everyMinutes) * BigInt(分钟)
    if (n < 锚) return null
    return 可表示ISO(Number(BigInt(锚) + (BigInt(n) - BigInt(锚)) / 步 * 步))
  }
  if (校验计划(p) !== undefined) return null
  const [h, mi] = p.time.split(":").map(Number) as [number, number]
  const 本 = 本地分量(n, p.timeZone)
  if (p.kind === "everyDays") {
    if (!周期可表示(p.everyDays, 一天)) return null
    const [sy, sm, sd] = p.start.split("-").map(Number) as [number, number, number]
    const 差 = Math.round((日历UTC(本.y, 本.m, 本.d) - 日历UTC(sy, sm, sd)) / 一天)
    let 第几次 = Math.floor(差 / p.everyDays)
    if (第几次 < 0) return null
    const 候选 = (k: number): string | null => {
      const [y, m, d] = 加天(sy, sm, sd, k * p.everyDays)
      return 可表示本地时刻(y, m, d, h, mi, p.timeZone)
    }
    const t = 候选(第几次)
    if (t !== null && Date.parse(t) <= n) return t
    第几次--
    return 第几次 < 0 ? null : 候选(第几次)
  }
  const 最多 = p.kind === "monthly" ? 62 : 8
  for (let i = 0; i <= 最多; i++) {
    const [y, m, d] = 加天(本.y, 本.m, 本.d, -i)
    if (!这天合规则(p, y, m, d)) continue
    const 候选 = 可表示本地时刻(y, m, d, h, mi, p.timeZone)
    if (候选 === null) continue
    const t = Date.parse(候选)
    if (t > n) continue
    return 候选
  }
  return null
}

export { 星期序 }
