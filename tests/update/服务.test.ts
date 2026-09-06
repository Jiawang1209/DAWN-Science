/**
 * backend 认的那个接口（规格 U8）：**六个操作回同一个信封**。
 * 盯的是「`自动检查` 每次现读」——记一份在内存里，就会出现
 * 「明明在关于里关了、它却还在查」这种没法解释的画面。
 */
import { describe, expect, it } from "vitest"
import { 建更新服务 } from "../../src/update/服务.js"
import { 更新管家 } from "../../src/update/检查.js"
import type { 更新盘面 } from "../../src/update/状态.js"

const 起 = () => {
  let 盘: 更新盘面 = { auto: true }
  const 管家 = new 更新管家({
    当前版本: "0.0.2",
    源: { 查最新: async () => undefined },
    事实: { platform: "darwin", arch: "arm64", appPath: "/A/x.app", 可写: () => true },
    读状态: () => 盘,
    写状态: (下) => {
      盘 = 下
    },
    现在: () => 1,
  })
  return 建更新服务({ 管家, 读盘: () => 盘 })
}

describe("更新服务", () => {
  it("每个操作都回「完整状态 + 那个开关」", async () => {
    const 服务 = 起()
    expect(服务.状态()).toEqual({ 状态: { 阶段: "idle", 当前: "0.0.2" }, 自动检查: true })
    const r = await 服务.检查(true)
    expect(r.状态.阶段).toBe("latest")
    expect(r.自动检查).toBe(true)
  })
  it("关掉自动检查之后，回执里当场就是 false（不是下次启动才对）", () => {
    const 服务 = 起()
    expect(服务.设偏好({ auto: false }).自动检查).toBe(false)
    expect(服务.状态().自动检查).toBe(false)
  })
  it("下载与安装还没接上时**说的是这一步没接**，不是「更新失败」", async () => {
    await expect(起().下载()).rejects.toThrow(/还没接上/)
  })
})
