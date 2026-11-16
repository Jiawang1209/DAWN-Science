import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { 读跳过, 记跳过, 读引导完成, 记引导完成 } from "../../src/ui/setup-wizard.js"

const original = window.dawn
beforeEach(() => localStorage.clear())
afterEach(() => { vi.restoreAllMocks(); if (original) window.dawn = original; else delete window.dawn })
function installation(id: string) {
  window.dawn = { invoke: async () => { throw new Error("读取引导状态不应调用 IPC") }, onboardingInstallationId: id }
}

describe("引导状态按用户配置保留，不随安装或版本重置", () => {
  it("完成或跳过后，覆盖安装和升级仍然保留", () => {
    installation("first@0.0.50")
    记引导完成(); 记跳过(true)
    installation("reinstalled@0.0.51")
    expect(读引导完成()).toBe(true)
    expect(读跳过()).toBe(true)
    expect(localStorage.getItem("dawn.global.onboardingDone")).toBe("1")
  })
  it("迁移旧安装版本的状态，同时保留旧键", () => {
    localStorage.setItem("dawn.global.onboardingDone.old@0.0.49", "1")
    localStorage.setItem("dawn.global.setupSkipped.old@0.0.49", "1")
    installation("new@0.0.51")
    expect(读引导完成()).toBe(true)
    expect(读跳过()).toBe(true)
    expect(localStorage.getItem("dawn.global.onboardingDone")).toBe("1")
    expect(localStorage.getItem("dawn.global.onboardingDone.old@0.0.49")).toBe("1")
  })
  it("旧版仅有跳过标记也有效；无状态仍是首次使用", () => {
    expect(读引导完成()).toBe(false); expect(读跳过()).toBe(false)
    localStorage.setItem("dawn.global.setupSkipped", "1")
    installation("new")
    expect(读跳过()).toBe(true)
    expect(读引导完成()).toBe(false)
  })
  it("只迁移对应前缀且值为 1 的标记", () => {
    localStorage.setItem("other.dawn.global.onboardingDone.old", "1")
    localStorage.setItem("dawn.global.onboardingDone.old", "0")
    localStorage.setItem("dawn.global.setupSkippedExtra.old", "1")
    expect(读引导完成()).toBe(false); expect(读跳过()).toBe(false)
  })
  it("存储不可读写时不妨碍当前使用", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw Error("unavailable") })
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw Error("unavailable") })
    expect(读引导完成()).toBe(false)
    expect(() => { 记引导完成(); 记跳过(true) }).not.toThrow()
  })
})
