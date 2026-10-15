import { beforeEach, expect, it } from "vitest"
import { $sidebarWidth, SIDEBAR_WIDTH_KEY, loadSidebar, setSidebarWidth } from "../../src/ui/state/sidebar.js"

beforeEach(() => localStorage.clear())

it("首次启动使用292px，旧的窄宽度恢复到可用下限", () => {
  expect(loadSidebar().width).toBe(292)
  localStorage.setItem(SIDEBAR_WIDTH_KEY, "280")
  expect(loadSidebar().width).toBe(292)
})

it("用户拖宽后重启保留偏好，越界拖动仍可恢复", () => {
  setSidebarWidth(384)
  expect(loadSidebar().width).toBe(384)
  setSidebarWidth(900)
  expect(loadSidebar().width).toBe(420)
  setSidebarWidth(0)
  expect($sidebarWidth.get()).toBe(292)
  expect(loadSidebar().width).toBe(292)
})
