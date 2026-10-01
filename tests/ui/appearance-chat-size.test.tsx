import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { AppearancePanel } from "../../src/ui/Settings.js"
import { setLang } from "../../src/ui/i18n/index.js"

const KEY = "dawn.global.chat-font-size"

beforeEach(() => {
  localStorage.removeItem(KEY)
  document.documentElement.style.removeProperty("--dawn-chat-size")
  setLang("zh")
})
afterEach(cleanup)

describe("外观里的对话字号", () => {
  it("范围是 13–19，默认 15px", () => {
    render(<AppearancePanel />)
    const slider = screen.getByRole("slider", { name: "对话字号" }) as HTMLInputElement
    expect(slider.min).toBe("13")
    expect(slider.max).toBe("19")
    expect(slider.step).toBe("1")
    expect(slider.value).toBe("15")
    expect(screen.getByText("15px")).toBeTruthy()
  })

  it("拖动后即时改根字号并记住选择", () => {
    render(<AppearancePanel />)
    const slider = screen.getByRole("slider", { name: "对话字号" })
    fireEvent.change(slider, { target: { value: "18" } })
    expect(document.documentElement.style.getPropertyValue("--dawn-chat-size")).toBe("18px")
    expect(localStorage.getItem(KEY)).toBe("18")
    expect(screen.getByText("18px")).toBeTruthy()
  })
})
