/**
 * 「这台机器该下哪个包、下完能不能自己装上」。
 *
 * **十个资源名是从真的 v0.0.2 Release 上抄下来的**（2026-09-06 实测），
 * 不是照 `artifactName` 模板手推的——模板与线上产物对不上过一次，
 * 就足以让「下载并安装」变成一个 404。
 */
import { describe, expect, it } from "vitest"
import { 挑资源, type 平台事实, type 资源一个 } from "../../src/update/资源.js"

/** v0.0.2 Release 上真实的十个资源（名字与顺序原样） */
const 十个: 资源一个[] = [
  "DAWN-Science-0.0.3-linux-amd64.deb",
  "DAWN-Science-0.0.3-linux-arm64.AppImage",
  "DAWN-Science-0.0.3-linux-arm64.deb",
  "DAWN-Science-0.0.3-linux-x86_64.AppImage",
  "DAWN-Science-0.0.3-mac-arm64.dmg",
  "DAWN-Science-0.0.3-mac-arm64.zip",
  "DAWN-Science-0.0.3-mac-x64.dmg",
  "DAWN-Science-0.0.3-mac-x64.zip",
  "DAWN-Science-0.0.3-win-x64-portable.exe",
  "DAWN-Science-0.0.3-win-x64.exe",
].map((name, i) => ({ name, size: 1000 + i, url: `https://example.invalid/${name}` }))

const 事实 = (p: Partial<平台事实>): 平台事实 => ({
  platform: "darwin",
  arch: "arm64",
  appPath: "/Applications/DAWN Science.app",
  可写: () => true,
  ...p,
})

describe("mac", () => {
  it("arm64 挑 zip 而不是 dmg——dmg 要人拖，zip 我们能自己解", () => {
    const r = 挑资源(十个, 事实({ platform: "darwin", arch: "arm64" }))
    expect(r.能自装 && r.资源.name).toBe("DAWN-Science-0.0.3-mac-arm64.zip")
    expect(r.能自装 && r.方式).toBe("mac-zip")
  })
  it("x64 挑 x64 那份——挑错架构的包装上去就起不来了", () => {
    const r = 挑资源(十个, 事实({ platform: "darwin", arch: "x64" }))
    expect(r.能自装 && r.资源.name).toBe("DAWN-Science-0.0.3-mac-x64.zip")
  })
  it("开发模式（没有 .app）→ 说的是开发模式，不是「没有权限」", () => {
    // 报成「没有写权限」会把人送去 chmod 一个不存在的东西（2026-09-06 探针里真看到过这句）
    const r = 挑资源(十个, { platform: "darwin", arch: "arm64", 可写: () => true })
    expect(r.能自装).toBe(false)
    expect(!r.能自装 && r.原因).toMatch(/开发模式/)
  })
  it("装在写不进去的地方 → 装不了，而且原因说的是权限", () => {
    // 报成「更新失败」会把人送去查网络。这条纪律写在规格 U3
    const r = 挑资源(十个, 事实({ 可写: () => false }))
    expect(r.能自装).toBe(false)
    expect(!r.能自装 && r.原因).toMatch(/权限|写不/)
  })
})

describe("windows", () => {
  it("安装版挑 nsis 那个 exe，不是 portable", () => {
    const r = 挑资源(十个, 事实({ platform: "win32", arch: "x64", appPath: "C:\\x\\DAWN.exe" }))
    expect(r.能自装 && r.资源.name).toBe("DAWN-Science-0.0.3-win-x64.exe")
    expect(r.能自装 && r.方式).toBe("win-nsis")
  })
  it("便携版换不了自己（运行中的 exe 被系统锁着）", () => {
    const r = 挑资源(
      十个,
      事实({ platform: "win32", arch: "x64", portableExe: "D:\\DAWN-portable.exe" }),
    )
    expect(r.能自装).toBe(false)
    expect(!r.能自装 && r.原因).toMatch(/便携/)
  })
})

describe("linux", () => {
  it("从 AppImage 跑的就换那个文件", () => {
    const r = 挑资源(
      十个,
      事实({ platform: "linux", arch: "x64", appImage: "/home/u/DAWN.AppImage" }),
    )
    expect(r.能自装 && r.资源.name).toBe("DAWN-Science-0.0.3-linux-x86_64.AppImage")
    expect(r.能自装 && r.方式).toBe("appimage")
  })
  it("arm64 的 AppImage 是另一个名字（x86_64 / arm64 两套命名）", () => {
    const r = 挑资源(
      十个,
      事实({ platform: "linux", arch: "arm64", appImage: "/home/u/DAWN.AppImage" }),
    )
    expect(r.能自装 && r.资源.name).toBe("DAWN-Science-0.0.3-linux-arm64.AppImage")
  })
  it("deb 装的（没有 APPIMAGE）装不了，原因是要 root", () => {
    const r = 挑资源(十个, 事实({ platform: "linux", arch: "x64" }))
    expect(r.能自装).toBe(false)
    expect(!r.能自装 && r.原因).toMatch(/root|dpkg/)
  })
})

describe("挑不到的时候", () => {
  it("这个平台压根没出包 → 说清楚是没有包，不是装不了", () => {
    const r = 挑资源(十个, 事实({ platform: "freebsd", arch: "x64" }))
    expect(r.能自装).toBe(false)
    expect(!r.能自装 && r.原因).toMatch(/没有.*包|freebsd/)
  })
  it("Release 里少了这台机器要的那个 → 说得出少的是哪个", () => {
    const 少了mac = 十个.filter((a) => !a.name.includes("mac-arm64.zip"))
    const r = 挑资源(少了mac, 事实({}))
    expect(r.能自装).toBe(false)
    expect(!r.能自装 && r.原因).toMatch(/mac-arm64\.zip/)
  })
})
