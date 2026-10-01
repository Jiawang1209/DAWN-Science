import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { AppearancePanel } from "../../src/ui/Settings.js"
import { $workStepMode, WORK_STEP_MODE_KEY } from "../../src/ui/state/work-steps.js"
import { setLang } from "../../src/ui/i18n/index.js"

beforeEach(() => {
  localStorage.removeItem(WORK_STEP_MODE_KEY)
  $workStepMode.set("standard")
  setLang("zh")
})
afterEach(cleanup)

describe("外观里的工作步骤展示", () => {
  it("提供简洁与标准单选，切换后即时更新并持久化", () => {
    render(<AppearancePanel />)
    const compact = screen.getByRole("radio", { name: "简洁" })
    const standard = screen.getByRole("radio", { name: "标准" })
    expect(standard.getAttribute("aria-checked")).toBe("true")
    fireEvent.click(compact)
    expect(compact.getAttribute("aria-checked")).toBe("true")
    expect($workStepMode.get()).toBe("simple")
    expect(localStorage.getItem(WORK_STEP_MODE_KEY)).toBe("simple")
  })
})
