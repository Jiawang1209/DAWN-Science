/**
 * 设置分类要跨重启活着（规格 `2026-09-16-设置右栏`）。
 *
 * **key 里的 `global` 是作用域声明**（`view.ts` 那条纪律：持久化状态必须在
 * key 里声明作用域）。它不属于某段会话、也不属于某个项目。
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import { $settingsSection, SETTINGS_SECTION_KEY, loadSettingsSection, 选设置分类 } from "../../src/ui/state/view.js"

beforeEach(() => {
  localStorage.clear()
  $settingsSection.set(undefined)
})

describe("设置分类的持久化", () => {
  it("选过之后存得下来", () => {
    选设置分类("models")
    expect(localStorage.getItem(SETTINGS_SECTION_KEY)).toBe("models")
  })

  it("读得回来", () => {
    localStorage.setItem(SETTINGS_SECTION_KEY, "mcp")
    loadSettingsSection()
    expect($settingsSection.get()).toBe("mcp")
  })

  it("**没存过就是没表达过偏好**——缺失不等于某个具体值", () => {
    loadSettingsSection()
    expect($settingsSection.get()).toBeUndefined()
  })

  it("**存储写不进去也不该拦住这一次选择**", () => {
    const 坏 = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota")
    })
    const 吵 = vi.spyOn(console, "error").mockImplementation(() => {})
    选设置分类("kernels")
    expect($settingsSection.get()).toBe("kernels")
    expect(吵).toHaveBeenCalled() // 失败必须出声（规格 7.5）
    坏.mockRestore()
    吵.mockRestore()
  })
})
