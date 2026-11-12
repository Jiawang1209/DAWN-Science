import { expect, it } from "vitest"
import { 下一次, 最近一次到期, 校验计划, type 计划 } from "../../src/schedule/recurrence.js"

const huge = [
  { kind: "interval", everyMinutes: 1e12, anchor: "2026-01-01T00:00:00Z", timeZone: "UTC" },
  { kind: "everyDays", everyDays: 1e9, start: "2026-01-01", time: "08:00", timeZone: "UTC" },
] as const

it.each(huge)("$kind: rejects periods larger than the complete supported calendar span", plan => {
  expect(校验计划(plan)).toBeDefined()
})

it.each(huge)("$kind: legacy oversized periods have no next representable occurrence instead of throwing", plan => {
  expect(下一次(plan, "2026-11-12T00:00:00Z")).toBeNull()
  expect(最近一次到期(plan, "2026-11-12T00:00:00Z")).toBeNull()
})

it.each([
  { kind: "interval", everyMinutes: 1, anchor: "+275760-09-13T00:00:00.000Z", timeZone: "UTC" },
  { kind: "everyDays", everyDays: 2, start: "9999-01-01", time: "00:00", timeZone: "UTC" },
  { kind: "daily", time: "00:00", timeZone: "UTC" },
  { kind: "monthly", day: 13, time: "00:00", timeZone: "UTC" },
] as const)("$kind: stops at the maximum JS date and retains its final due occurrence", plan => {
  const last = "+275760-09-13T00:00:00.000Z"
  expect(下一次(plan, last)).toBeNull()
  const due = 最近一次到期(plan, last)
  expect(due === null || Date.parse(due) <= Date.parse(last)).toBe(true)
})

it("invalid reference clocks produce no occurrence", () => {
  const p = { kind: "daily", time: "08:00", timeZone: "UTC" } as const
  expect(下一次(p, "not-a-time")).toBeNull()
  expect(最近一次到期(p, "not-a-time")).toBeNull()
})

it("the maximum supported interval spans the two JS date endpoints exactly", () => {
  const first = "-271821-04-20T00:00:00.000Z", last = "+275760-09-13T00:00:00.000Z"
  const p = { kind: "interval", everyMinutes: 288_000_000_000, anchor: first, timeZone: "UTC" } as const
  expect(校验计划(p)).toBeUndefined()
  expect(下一次(p, first)).toBe(last)
  expect(最近一次到期(p, last)).toBe(last)
  expect(下一次(p, last)).toBeNull()
})

it.each([1, 288_000_000_000])("millisecond precision survives a full-span subtraction (period=%s minutes)", everyMinutes => {
  const first = -8_640_000_000_000_000 + 1, last = 8_640_000_000_000_000
  const p = { kind: "interval", everyMinutes, anchor: new Date(first).toISOString(), timeZone: "UTC" } as const
  const expected = everyMinutes === 1 ? new Date(last - 59_999).toISOString() : p.anchor
  expect(最近一次到期(p, new Date(last).toISOString())).toBe(expected)
  expect(下一次(p, expected)).toBeNull()
})

for (const [timeZone, offset] of [["UTC", 0], ["Etc/GMT-14", 14], ["Etc/GMT+12", -12]] as const) {
  it.each([0, 8, 23])(`calendar limits respect the local clock in ${timeZone} at %s:00`, hour => {
    const limit = 8_640_000_000_000_000n, day = 86_400_000n, h = 3_600_000n
    const time = `${String(hour).padStart(2, "0")}:00`
    const candidates = (edge: bigint) => [-2, -1, 0, 1, 2].map(i => edge + BigInt(i) * day + BigInt(hour - offset) * h).filter(t => t >= -limit && t <= limit)
    const iso = (n: bigint | undefined) => n === undefined ? null : new Date(Number(n)).toISOString()
    const max = new Date(Number(limit)).toISOString(), min = new Date(Number(-limit)).toISOString()
    const latest = candidates(limit).filter(t => t <= limit).at(-1)
    const first = candidates(-limit).find(t => t > -limit)
    const plans: 计划[] = [
      { kind: "daily", time, timeZone },
      { kind: "weekly", weekdays: ["MO", "TU", "WE", "TH", "FR", "SA", "SU"], time, timeZone },
    ]
    for (const p of plans) {
      expect(下一次(p, max)).toBeNull()
      expect(最近一次到期(p, max)).toBe(iso(latest))
      expect(下一次(p, min)).toBe(iso(first))
      expect(最近一次到期(p, min)).toBe(iso(candidates(-limit).find(t => t === -limit)))
    }
    const p = { kind: "everyDays", start: "9999-01-01", everyDays: 1, time, timeZone } as const
    expect(最近一次到期(p, max)).toBe(iso(latest))
  })
}
