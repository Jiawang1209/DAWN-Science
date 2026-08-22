/**
 * 计划 → 时刻（schedule，2026-08-22，学自 dsh-automation 的 recurrence）。
 * 四种：一次 / 每天 / 每周 / 每 N 分钟。**带时区**，不靠本机时区——用例里换时区结果要变。
 */
import { describe, expect, it } from "vitest"
import { 下一次, 最近一次到期, 校验计划, 本地时刻转UTC, type 计划 } from "../../src/schedule/recurrence.js"

const 沪 = "Asia/Shanghai"
const 纽 = "America/New_York"

describe("本地时刻转UTC", () => {
  it("上海 08:00 = UTC 00:00；纽约冬令时 08:00 = UTC 13:00、夏令时 = UTC 12:00", () => {
    expect(本地时刻转UTC(2026, 1, 15, 8, 0, 沪)).toBe("2026-01-15T00:00:00.000Z")
    expect(本地时刻转UTC(2026, 1, 15, 8, 0, 纽)).toBe("2026-01-15T13:00:00.000Z")
    expect(本地时刻转UTC(2026, 7, 15, 8, 0, 纽)).toBe("2026-07-15T12:00:00.000Z")
  })
})

describe("下一次", () => {
  it("一次：在未来就回它，过了就 null", () => {
    const p: 计划 = { kind: "once", at: "2026-09-01T00:00:00.000Z", timeZone: 沪 }
    expect(下一次(p, "2026-08-22T00:00:00.000Z")).toBe("2026-09-01T00:00:00.000Z")
    expect(下一次(p, "2026-09-01T00:00:00.000Z")).toBeNull()
  })
  it("每天 08:00（上海）：今天还没到就今天，到了就明天；严格大于 after", () => {
    const p: 计划 = { kind: "daily", time: "08:00", timeZone: 沪 }
    expect(下一次(p, "2026-08-22T23:00:00.000Z")).toBe("2026-08-23T00:00:00.000Z")
    expect(下一次(p, "2026-08-23T00:00:00.000Z")).toBe("2026-08-24T00:00:00.000Z")
  })
  it("每周一三 09:30（纽约，夏令时）", () => {
    const p: 计划 = { kind: "weekly", weekdays: ["MO", "WE"], time: "09:30", timeZone: 纽 }
    // 2026-08-22 是周六 → 下一次周一 08-24 09:30 EDT = 13:30Z
    expect(下一次(p, "2026-08-22T12:00:00.000Z")).toBe("2026-08-24T13:30:00.000Z")
    expect(下一次(p, "2026-08-24T13:30:00.000Z")).toBe("2026-08-26T13:30:00.000Z")
  })
  it("每 30 分钟，从锚点起算", () => {
    const p: 计划 = { kind: "interval", everyMinutes: 30, anchor: "2026-08-22T00:00:00.000Z", timeZone: 沪 }
    expect(下一次(p, "2026-08-22T00:10:00.000Z")).toBe("2026-08-22T00:30:00.000Z")
    expect(下一次(p, "2026-08-22T00:30:00.000Z")).toBe("2026-08-22T01:00:00.000Z")
    // 锚点之前：第一次就是锚点
    expect(下一次(p, "2026-08-21T00:00:00.000Z")).toBe("2026-08-22T00:00:00.000Z")
  })
})

describe("最近一次到期", () => {
  it("每天：now 之前（含）最近的那一次；一次过了就是它、没到就 null", () => {
    const p: 计划 = { kind: "daily", time: "08:00", timeZone: 沪 }
    expect(最近一次到期(p, "2026-08-23T05:00:00.000Z")).toBe("2026-08-23T00:00:00.000Z")
    expect(最近一次到期(p, "2026-08-23T00:00:00.000Z")).toBe("2026-08-23T00:00:00.000Z")
    const 一次: 计划 = { kind: "once", at: "2026-09-01T00:00:00.000Z", timeZone: 沪 }
    expect(最近一次到期(一次, "2026-08-22T00:00:00.000Z")).toBeNull()
    expect(最近一次到期(一次, "2026-09-02T00:00:00.000Z")).toBe("2026-09-01T00:00:00.000Z")
  })
  it("每 30 分钟：锚点之前 null", () => {
    const p: 计划 = { kind: "interval", everyMinutes: 30, anchor: "2026-08-22T00:00:00.000Z", timeZone: 沪 }
    expect(最近一次到期(p, "2026-08-21T00:00:00.000Z")).toBeNull()
    expect(最近一次到期(p, "2026-08-22T00:44:00.000Z")).toBe("2026-08-22T00:30:00.000Z")
  })
})

describe("校验计划", () => {
  it("时区不认识、时间格式错、间隔小于 1 分钟、每周一天都没选，各自说清", () => {
    expect(校验计划({ kind: "daily", time: "8:00", timeZone: 沪 })).toMatch(/HH:mm/)
    expect(校验计划({ kind: "daily", time: "08:00", timeZone: "Mars/Olympus" })).toMatch(/时区/)
    expect(校验计划({ kind: "interval", everyMinutes: 0, anchor: "2026-08-22T00:00:00.000Z", timeZone: 沪 })).toMatch(/分钟/)
    expect(校验计划({ kind: "weekly", weekdays: [], time: "08:00", timeZone: 沪 })).toMatch(/星期/)
    expect(校验计划({ kind: "daily", time: "08:00", timeZone: 沪 })).toBeUndefined()
  })
})

describe("第二档：每月、每 N 天", () => {
  it("每月 31 号 08:00：没有 31 号的月份跳过；严格大于 after", () => {
    const p: 计划 = { kind: "monthly", day: 31, time: "08:00", timeZone: "Asia/Shanghai" }
    // 2026-09 没有 31 → 10-31
    expect(下一次(p, "2026-08-31T00:00:00.000Z")).toBe("2026-10-31T00:00:00.000Z")
    expect(最近一次到期(p, "2026-09-15T00:00:00.000Z")).toBe("2026-08-31T00:00:00.000Z")
    expect(校验计划({ kind: "monthly", day: 0, time: "08:00", timeZone: "Asia/Shanghai" })).toMatch(/1.*31/)
  })
  it("每 3 天 09:00，从起点那天起算", () => {
    const p: 计划 = { kind: "everyDays", everyDays: 3, time: "09:00", start: "2026-08-22", timeZone: "Asia/Shanghai" }
    expect(下一次(p, "2026-08-22T00:00:00.000Z")).toBe("2026-08-22T01:00:00.000Z")
    expect(下一次(p, "2026-08-22T01:00:00.000Z")).toBe("2026-08-25T01:00:00.000Z")
    expect(最近一次到期(p, "2026-08-24T00:00:00.000Z")).toBe("2026-08-22T01:00:00.000Z")
    expect(最近一次到期(p, "2026-08-21T00:00:00.000Z")).toBeNull()
    expect(校验计划({ kind: "everyDays", everyDays: 0, time: "09:00", start: "2026-08-22", timeZone: "Asia/Shanghai" })).toMatch(/天/)
  })
})
