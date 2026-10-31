import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { 读跳过, 记跳过, 读引导完成, 记引导完成 } from "../../src/ui/setup-wizard.js"

const original = window.dawn
beforeEach(() => localStorage.clear())
afterEach(() => { if (original) window.dawn = original; else delete window.dawn })
function installation(id: string) {
  window.dawn = { invoke: async () => { throw new Error("读取引导状态不应调用 IPC") }, onboardingInstallationId: id }
}

describe("引导完成与跳过按安装隔离", () => {
  it("同一次安装的重启、升级保留完成和跳过状态", () => {
    installation("first")
    记引导完成()
    记跳过(true)
    installation("first")
    expect(读引导完成()).toBe(true)
    expect(读跳过()).toBe(true)
  })
  it("新的安装不继承旧安装完成/跳过，旧键也不被清理", () => {
    installation("old")
    记引导完成()
    记跳过(true)
    installation("new")
    expect(读引导完成()).toBe(false)
    expect(读跳过()).toBe(false)
    记跳过(false)
    installation("old")
    expect(读引导完成()).toBe(true)
    expect(读跳过()).toBe(true)
  })
})
