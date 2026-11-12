import { expect, it } from "vitest"
import { 校验计划 } from "../../src/schedule/recurrence.js"

it.each(["2026-02-29", "2026-02-30", "2026-04-31", "2026-13-01", "2026-01-00"])("rejects an impossible recurring start date instead of silently moving it: %s", start => {
  expect(校验计划({ kind: "everyDays", start, everyDays: 2, time: "08:00", timeZone: "Asia/Shanghai" })).toMatch(/日期/)
})

it.each(["2024-02-29", "2026-02-28", "2026-12-31"])("accepts a real recurring start date: %s", start => {
  expect(校验计划({ kind: "everyDays", start, everyDays: 2, time: "08:00", timeZone: "Asia/Shanghai" })).toBeUndefined()
})
