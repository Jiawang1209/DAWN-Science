import { expect, it } from "vitest"
import { 本地时刻转UTC, 下一次, 最近一次到期, 校验计划 } from "../../src/schedule/recurrence.js"

it.each(["0000", "0001", "0099", "0100", "2026"])("converts the literal calendar year %s without adding 1900", year => {
  expect(本地时刻转UTC(Number(year), 1, 1, 8, 0, "UTC")).toBe(`${year}-01-01T08:00:00.000Z`)
})

it.each(["0000", "0001", "0099"])("everyDays calculation agrees with the accepted start year %s", year => {
  const p = { kind: "everyDays" as const, start: `${year}-01-01`, everyDays: 3, time: "08:00", timeZone: "UTC" }
  expect(校验计划(p)).toBeUndefined()
  expect(下一次(p, `${year}-01-01T00:00:00Z`)).toBe(`${year}-01-01T08:00:00.000Z`)
  expect(下一次(p, `${year}-01-01T08:00:00Z`)).toBe(`${year}-01-04T08:00:00.000Z`)
  expect(最近一次到期(p, `${year}-01-04T07:00:00Z`)).toBe(`${year}-01-01T08:00:00.000Z`)
})

it("daily, weekly and monthly use the same literal-year calendar", () => {
  expect(下一次({ kind: "daily", time: "08:00", timeZone: "UTC" }, "0099-01-01T08:00:00Z")).toBe("0099-01-02T08:00:00.000Z")
  expect(下一次({ kind: "weekly", weekdays: ["MO"], time: "08:00", timeZone: "UTC" }, "0001-01-01T00:00:00Z")).toBe("0001-01-01T08:00:00.000Z")
  expect(下一次({ kind: "monthly", day: 31, time: "08:00", timeZone: "UTC" }, "0099-01-31T08:00:00Z")).toBe("0099-03-31T08:00:00.000Z")
})
