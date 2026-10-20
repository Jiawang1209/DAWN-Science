import { beforeEach, expect, it } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { AppearancePanel } from "../../src/ui/Settings.js"
import { $accent, DEFAULT_ACCENT } from "../../src/ui/state/accent.js"
import { $background, setBackground, chatBackground, settingsBackground } from "../../src/ui/state/background.js"

beforeEach(() => {
  localStorage.clear()
  $accent.set(DEFAULT_ACCENT)
  setBackground(null)
  chatBackground.set(null)
  settingsBackground.set(null)
})

it("两组预设各自可识别，背景选择不改主题色", () => {
  render(<AppearancePanel />)
  expect(screen.getByRole("radiogroup", { name: "背景色选择" }).querySelectorAll('[role="radio"]')).toHaveLength(6)
  fireEvent.click(screen.getByRole("radio", { name: "背景色：蓝" }))
  expect($background.get()).toBe("#2f6feb")
  expect($accent.get()).toBe(DEFAULT_ACCENT)
  expect(screen.getByRole("radio", { name: "绿" }).getAttribute("aria-checked")).toBe("true")
})

it("HEX/RGB立即生效，非法值保留纠错，Esc恢复", () => {
  render(<AppearancePanel />)
  const input = screen.getByRole("textbox", { name: "背景颜色值，可输入 HEX 或 RGB" })
  fireEvent.change(input, { target: { value: "rgb(231, 220, 245)" } })
  fireEvent.keyDown(input, { key: "Enter" })
  expect($background.get()).toBe("#e7dcf5")
  fireEvent.change(input, { target: { value: "broken" } })
  fireEvent.keyDown(input, { key: "Enter" })
  expect(input.getAttribute("aria-invalid")).toBe("true")
  expect($background.get()).toBe("#e7dcf5")
  fireEvent.keyDown(input, { key: "Escape" })
  expect((input as HTMLInputElement).value).toBe("#e7dcf5")
})

it("恢复默认只清背景，不撤销主题色", () => {
  render(<AppearancePanel />)
  fireEvent.click(screen.getByRole("radio", { name: "紫" }))
  fireEvent.click(screen.getByRole("radio", { name: "背景色：蓝" }))
  fireEvent.click(screen.getByRole("button", { name: "重置背景" }))
  expect($background.get()).toBeNull()
  expect($accent.get()).toBe("#7c5cff")
  expect(document.documentElement.style.getPropertyValue("--theme-user-background-light")).toBe("")
})


it("内容和设置各自使用相同颜色控件，独立选择与重置", () => {
  render(<AppearancePanel />)
  fireEvent.click(screen.getByRole("radio", { name: "背景色：蓝" }))
  fireEvent.click(screen.getByRole("radio", { name: "对话内容：紫" }))
  fireEvent.click(screen.getByRole("radio", { name: "设置页：橙" }))
  expect(chatBackground.store.get()).toBe("#7c5cff")
  expect(settingsBackground.store.get()).toBe("#e0701a")
  fireEvent.click(screen.getByRole("button", { name: "重置对话内容" }))
  expect(chatBackground.store.get()).toBeNull()
  expect(settingsBackground.store.get()).toBe("#e0701a")
  expect($background.get()).toBe("#2f6feb")
  fireEvent.click(screen.getByRole("button", { name: "重置设置页" }))
  expect(settingsBackground.store.get()).toBeNull()
  expect($accent.get()).toBe(DEFAULT_ACCENT)
})
