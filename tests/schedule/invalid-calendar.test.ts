import { expect, it } from "vitest"
import { 校验计划 } from "../../src/schedule/recurrence.js"

for (const kind of ["once", "interval"] as const) {
  const plan = (value: string) => kind === "once"
    ? { kind, at: value, timeZone: "UTC" } as const
    : { kind, anchor: value, everyMinutes: 30, timeZone: "UTC" } as const

  it.each(["2026-02-29T12:00:00Z", "2026-02-30T23:00:00-05:00", "2026-04-31T00:00:00+14:00", "2026-02-30"])(`${kind}: rejects an impossible ISO calendar date (%s)`, value => {
    expect(校验计划(plan(value))).toBeDefined()
  })

  it.each(["2024-02-29T23:30:00-05:00", "2026-03-01T00:30:00+14:00", "2026-02-28T08:30:00.123Z", "2026-12-31T23:59:59Z"])(`${kind}: keeps valid leap days and offsets that cross a UTC date (%s)`, value => {
    expect(校验计划(plan(value))).toBeUndefined()
  })
}

it.each(["2026-02-29", "2026-02-30", "2026-04-31", "2026-13-01", "2026-01-00"])("rejects an impossible recurring start date instead of silently moving it: %s", start => {
  expect(校验计划({ kind: "everyDays", start, everyDays: 2, time: "08:00", timeZone: "Asia/Shanghai" })).toMatch(/日期/)
})

it.each(["2024-02-29", "2026-02-28", "2026-12-31"])("accepts a real recurring start date: %s", start => {
  expect(校验计划({ kind: "everyDays", start, everyDays: 2, time: "08:00", timeZone: "Asia/Shanghai" })).toBeUndefined()
})
