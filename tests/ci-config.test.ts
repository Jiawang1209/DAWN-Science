import { expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { parse } from "yaml"

it("CI prepares real child artifacts before running the node and UI suites on a clean checkout", () => {
  const workflow = parse(readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8"))
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"))
  let built = false
  let tested = false
  for (const step of workflow.jobs.test.steps) {
    for (const command of (step.run ?? "").split(/\n|&&/)) {
      if (/^\s*npm run build(?::electron)?\s*$/.test(command)) built = true
      if (/^\s*npm (?:test|run test)(?:\s|$)/.test(command)) {
        built ||= /^npm run build(?::electron)?$/.test(pkg.scripts.pretest ?? "")
      }
      if (/\bvitest\b|^\s*npm (?:test|run test)(?:\s|$)/.test(command)) {
        expect(built, "CI needs the compiled subagent child before integration tests start").toBe(true)
        tested = true
      }
    }
  }
  expect(tested, "CI must execute the test suites").toBe(true)
})
