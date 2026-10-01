import { beforeEach, describe, expect, it } from "vitest"
import { $workStepMode, loadWorkStepMode, setWorkStepMode, WORK_STEP_MODE_KEY } from "../../src/ui/state/work-steps.js"

describe("工作步骤展示偏好", () => {
  beforeEach(() => {
    localStorage.removeItem(WORK_STEP_MODE_KEY)
    $workStepMode.set("standard")
  })

  it("缺省为标准模式，保留现有展开行为", () => {
    expect(loadWorkStepMode()).toBe("standard")
    expect($workStepMode.get()).toBe("standard")
  })

  it("选择简洁模式会立刻生效并在重启后读回", () => {
    setWorkStepMode("simple")
    expect($workStepMode.get()).toBe("simple")
    expect(localStorage.getItem(WORK_STEP_MODE_KEY)).toBe("simple")
    expect(loadWorkStepMode()).toBe("simple")
  })
})
