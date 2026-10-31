import { afterEach, describe, expect, it, vi } from "vitest"
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, renameSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createOnboardingInstallation } from "../../src/electron/onboarding-installation.js"
import { 建更新服务 } from "../../src/update/服务.js"
import { 更新管家 } from "../../src/update/检查.js"
import type { 更新盘面 } from "../../src/update/状态.js"

const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "dawn-installation-"))
  roots.push(root)
  const app = join(root, "DAWN.app")
  mkdirSync(app)
  writeFileSync(join(app, "exe"), "same-version")
  const stateFile = join(root, "profile", "onboarding-installation.json")
  const log = vi.fn()
  const options = { stateFile, identityPaths: [app, join(app, "exe")], log }
  const open = () => createOnboardingInstallation(options)
  const replace = () => {
    renameSync(app, `${app}.previous`)
    mkdirSync(app)
    writeFileSync(join(app, "exe"), "same-version")
  }
  return { root, app, stateFile, log, options, open, replace }
}

describe("引导安装世代，不修改业务数据", () => {
  it("普通重启和改动不相关文件保持同一世代", () => {
    const f = fixture()
    const first = f.open()
    writeFileSync(join(f.app, ".DS_Store"), "Finder changed directory mtime")
    expect(f.open().id).toBe(first.id)
  })
  it("同路径同版本重新复制安装，即使保留 profile 也产生新世代", () => {
    const f = fixture()
    const first = f.open()
    const data = join(f.root, "profile", "credentials.json")
    writeFileSync(data, "opaque-existing-data")
    f.replace()
    expect(f.open().id).not.toBe(first.id)
    expect(readFileSync(data, "utf8")).toBe("opaque-existing-data")
  })
  it("成功自动换包后接续世代；再手动重装仍产生新世代", () => {
    const f = fixture()
    const first = f.open()
    f.replace()
    first.adoptAutomaticUpdate()
    expect(f.open().id).toBe(first.id)
    rmSync(`${f.app}.previous`, { recursive: true })
    f.replace()
    expect(f.open().id).not.toBe(first.id)
  })
  it("失败换包不调用成功接续；重启不变，后续手动安装重置", async () => {
    const f = fixture()
    const first = f.open()
    let disk: 更新盘面 = { auto: true }
    const manager = new 更新管家({
      当前版本: "0.0.2", 事实: { platform: "darwin", arch: "arm64", appPath: f.app, 可写: () => true },
      源: { 查最新: async () => ({ 版本: "0.0.3", 页面: "https://example.invalid/release", 发布于: "2026-10-31T00:00:00Z",
        资源: [{ name: "DAWN-Science-0.0.3-mac-arm64.zip", url: "https://example.invalid/update.zip", size: 1 }] }) },
      读状态: () => disk, 写状态: value => { disk = value },
    })
    await manager.检查({ 自动: false })
    manager.开始下载(1)
    manager.下好了("/tmp/never-read-update.zip")
    const restart = vi.fn(() => first.adoptAutomaticUpdate())
    const updater = 建更新服务({ 管家: manager, 读盘: () => disk,
      安装器: { 下载: async () => "", 换包: async () => { throw new Error("disk full") }, 重启: restart } })
    expect((await updater.装()).状态.阶段).toBe("failed")
    expect(restart).not.toHaveBeenCalled()
    expect(f.open().id).toBe(first.id)
    f.replace()
    expect(f.open().id).not.toBe(first.id)
  })
  it("Windows 安装器标记是权威：自动更新沿用，手动覆盖换标记", () => {
    const f = fixture()
    const installMarkerFile = join(f.app, ".dawn-onboarding-install-id")
    writeFileSync(installMarkerFile, "{0ce4e110-12fa-4b2f-b6ea-883fb4492821}")
    const open = () => createOnboardingInstallation({ ...f.options, installMarkerFile })
    const first = open()
    f.replace()
    writeFileSync(installMarkerFile, "{0ce4e110-12fa-4b2f-b6ea-883fb4492821}")
    expect(open().id).toBe(first.id)
    writeFileSync(installMarkerFile, "{aa7656fc-6159-477a-86c6-dab4c91506c0}")
    expect(open().id).not.toBe(first.id)
  })
  it("损坏元数据恢复为新世代并记录原因", () => {
    const f = fixture()
    const first = f.open()
    writeFileSync(f.stateFile, "broken")
    expect(f.open().id).not.toBe(first.id)
    expect(f.log).toHaveBeenCalled()
  })
  it("存储写不进时仍返回临时世代，不因引导元数据阻断 App", () => {
    const f = fixture()
    mkdirSync(f.stateFile, { recursive: true })
    const first = f.open()
    expect(first.id).toMatch(/^[a-f\d-]{36}$/)
    expect(() => first.adoptAutomaticUpdate()).not.toThrow()
    expect(f.log).toHaveBeenCalled()
  })
})
