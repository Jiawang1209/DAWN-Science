/**
 * backend 认的那个接口（规格 U8）：**六个操作回同一个信封**。
 * 盯的是「`自动检查` 每次现读」——记一份在内存里，就会出现
 * 「明明在关于里关了、它却还在查」这种没法解释的画面。
 */
import { describe, expect, it, vi } from "vitest"
import { 建更新服务, type 安装器 } from "../../src/update/服务.js"
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
  async function downloadable(download: 安装器["下载"]) {
    let disk: 更新盘面 = { auto: true }
    const manager = new 更新管家({
      当前版本: "0.0.2", 源: { 查最新: async () => ({ 版本: "0.0.3", 页面: "https://example.invalid/release", 资源: [{ name: "DAWN-Science-0.0.3-mac-arm64.zip", size: 4, url: "https://example.invalid/package" }] }) },
      事实: { platform: "darwin", arch: "arm64", appPath: "/A/demo.app", 可写: () => true },
      读状态: () => disk, 写状态: value => { disk = value },
    })
    const service = 建更新服务({ 管家: manager, 读盘: () => disk, 安装器: { 下载: download, 换包: async () => {}, 重启: () => {} } })
    await service.检查(true)
    return service
  }

  it("取消发生在 HTTP 响应前时，AbortError 也回到可下载状态", async () => {
    const service = await downloadable((_resource, _progress, signal) => new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => reject(new DOMException("This operation was aborted", "AbortError")), { once: true })
    }))
    await service.下载()
    service.取消()
    await vi.waitFor(() => expect(service.状态().状态.阶段).not.toBe("downloading"))
    expect(service.状态().状态.阶段).toBe("available")
  })

  it.each(["success", "failure"])("取消并重试后，旧下载迟到的进度或结果不能覆盖新下载：%s", async outcome => {
    const downloads: { progress: (p: { 已下: number; 共: number }) => void; resolve: (path: string) => void; reject: (error: Error) => void }[] = []
    const service = await downloadable((_resource, progress) => new Promise((resolve, reject) => downloads.push({ progress, resolve, reject })))
    await service.下载()
    expect(service.取消().状态.阶段).toBe("available")
    await service.下载()
    downloads[0]!.progress({ 已下: 4, 共: 4 })
    expect(downloads).toHaveLength(1) // Retry waits for the old file's cleanup.
    if (outcome === "success") downloads[0]!.resolve("/old.zip")
    else downloads[0]!.reject(new DOMException("This operation was aborted", "AbortError"))
    await vi.waitFor(() => expect(downloads).toHaveLength(2))
    expect(service.状态().状态).toMatchObject({ 阶段: "downloading", 已下: 0 })
    downloads[1]!.resolve("/new.zip")
    await vi.waitFor(() => expect(service.状态().状态).toMatchObject({ 阶段: "ready", 包路径: "/new.zip" }))
  })

  it("错误原话含有‘取消’也不能冒充用户取消", async () => {
    const service = await downloadable(async () => { throw new Error("服务器取消了资源访问权限") })
    await service.下载()
    await vi.waitFor(() => expect(service.状态().状态.阶段).not.toBe("downloading"))
    expect(service.状态().状态).toMatchObject({ 阶段: "failed", 失败于: "下载", 原话: "服务器取消了资源访问权限" })
  })

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
  it("这台机器上装不了时**说的是装不了**，不是「更新失败」", async () => {
    // 没打包 / 无头：下下来也没用。**这句话要能让人自己走下一步**（去发布页）
    await expect(起().下载()).rejects.toThrow(/装不了.*发布页/)
  })
})
