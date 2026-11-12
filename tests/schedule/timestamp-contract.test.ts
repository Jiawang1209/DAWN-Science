import { expect, it } from "vitest"
import { execFileSync } from "node:child_process"
import { pathToFileURL } from "node:url"
import { resolve } from "node:path"
import { 校验计划 } from "../../src/schedule/recurrence.js"

for (const kind of ["once", "interval"] as const) {
  const plan = (value: string) => kind === "once"
    ? { kind, at: value, timeZone: "UTC" } as const
    : { kind, anchor: value, everyMinutes: 30, timeZone: "UTC" } as const
  it.each([
    " 2026-02-30 ", "2026/02/30 08:00:00 GMT", "Feb 30, 2026 08:00:00 GMT",
    "2026-12-01T08:00:00", "2026-02-28T08:00:00+24:00", "2026-02-28T24:01:00Z",
    "2026-02-28T08:00:00Z\n", "Sat, 28 Feb 2026 08:00:00 GMT",
  ])(`${kind}: refuses ambiguous or non-ISO new timestamps (%j)`, value => {
    expect(校验计划(plan(value))).toBeDefined()
  })
  it.each([
    "2026-02-28", "2024-02-29T23:59:59.123Z", "2026-03-01T00:00:00+14:00",
    "2026-02-28T23:00-0500", "2026-02-28T24:00:00Z", "2026-02-28t08:00:00z",
    "+010000-01-01T00:00:00Z", "-000001-12-31T23:59:59Z",
  ])(`${kind}: retains supported ISO dates and explicit offsets (%s)`, value => {
    expect(校验计划(plan(value))).toBeUndefined()
  })
}

it.each(["UTC", "America/Los_Angeles", "Asia/Shanghai"])("new timestamp admission and explicit instants are independent of host TZ=%s", TZ => {
  const module = pathToFileURL(resolve("src/schedule/recurrence.ts")).href
  const source = `import {校验计划,下一次} from ${JSON.stringify(module)};
    const plan = at => ({kind:"once",at,timeZone:"Asia/Shanghai"});
    console.log(JSON.stringify({ambiguousRejected:校验计划(plan("2026-12-01T08:00:00"))!==undefined,
      offset:下一次(plan("2026-12-01T08:00:00+08:00"),"2026-11-30T00:00:00Z"),
      dateOnly:下一次(plan("2026-12-01"),"2026-11-30T00:00:00Z")}));`
  const result = JSON.parse(execFileSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", source], { encoding: "utf8", env: { ...process.env, TZ } }))
  expect(result).toEqual({ ambiguousRejected: true, offset: "2026-12-01T00:00:00.000Z", dateOnly: "2026-12-01T00:00:00.000Z" })
})
