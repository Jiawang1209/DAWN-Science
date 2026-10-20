import { beforeEach, describe, expect, it, vi } from "vitest"
import { $background, setBackground, chatBackground, settingsBackground } from "../../src/ui/state/background.js"

beforeEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
  document.documentElement.removeAttribute("style")
  for (const pref of [chatBackground, settingsBackground]) pref.set(null)
})

describe.each([chatBackground, settingsBackground])("内容背景偏好", pref => {
  it("默认不覆盖，独立保存并恢复", () => {
    expect(pref.load()).toBeNull()
    pref.set("#E7DCF5")
    expect(pref.store.get()).toBe("#e7dcf5")
    pref.store.set(null)
    expect(pref.load()).toBe("#e7dcf5")
  })
  it("不接受非法颜色，坏存储回落默认", () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    pref.set("#abcdef")
    pref.set("broken")
    expect(pref.store.get()).toBe("#abcdef")
    localStorage.setItem(pref.storageKey, "bad")
    expect(pref.load()).toBeNull()
  })
  it("存储失败仍即时生效，重置后撤销本项覆盖", () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota") })
    pref.set("#abcdef")
    expect(pref.store.get()).toBe("#abcdef")
    pref.set(null)
    expect(pref.store.get()).toBeNull()
  })
})

it("三项背景独立，重置对话背景不影响侧栏与设置页", () => {
  setBackground("#2f6feb")
  chatBackground.set("#e7dcf5")
  settingsBackground.set("#f1ebe0")
  chatBackground.set(null)
  expect($background.get()).toBe("#2f6feb")
  expect(settingsBackground.store.get()).toBe("#f1ebe0")
  expect(document.documentElement.style.getPropertyValue("--theme-user-background-light")).not.toBe("")
  expect(document.documentElement.style.getPropertyValue("--theme-user-settings-background-light")).not.toBe("")
  expect(document.documentElement.style.getPropertyValue("--theme-user-chat-background-light")).toBe("")
})
