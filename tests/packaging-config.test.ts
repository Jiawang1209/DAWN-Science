/**
 * 打包配置里判得出对错的几条（准入规则 ②）。
 *
 * ## mac 包必须 ad-hoc 签名，不许 `identity: null`
 *
 * **2026-09-15 作者从 Release 下 0.0.6 的 mac 包，装完报「文件已损坏」。**
 * `identity: null` 让 electron-builder 完全跳过签名，但它改了 Info.plist 与可执行文件名，
 * Electron 自带的签名就碎了（`codesign --verify`：code has no resources but signature
 * indicates they must be present）。Apple Silicon 上带下载标记的碎签名 App 一律「已损坏」，
 * 右键打开也救不了。`"-"` 是 ad-hoc 签名，退化成「无法验证开发者」，用户点得过去。
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { parse } from "yaml"

const config = parse(readFileSync(join(__dirname, "..", "electron-builder.yml"), "utf8"))

describe("electron-builder.yml", () => {
  it("mac 包 ad-hoc 签名，而不是完全不签（不签的包在 Apple Silicon 上报「已损坏」）", () => {
    expect(config.mac.identity).not.toBeNull()
    expect(config.mac.identity).toBeDefined()
  })

  it("开着 hardenedRuntime 做 ad-hoc 签名时，entitlements 要关掉库校验（否则原生模块加载不了）", () => {
    if (config.mac.identity !== "-" || config.mac.hardenedRuntime === false) return
    for (const key of ["entitlements", "entitlementsInherit"] as const) {
      const plist = readFileSync(join(__dirname, "..", config.mac[key]), "utf8")
      expect(plist, key).toMatch(/com\.apple\.security\.cs\.disable-library-validation<\/key>\s*<true\/>/)
    }
  })
})
