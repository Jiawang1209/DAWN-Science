/**
 * 换包（规格 U3）。盯的是**顺序与回滚**：
 * 「先备份、再换上、错了原样滚回」——中间任何一步失败都不许留下一个
 * 半换的应用（那时人手上既不是旧版也不是新版，而且他不知道）。
 *
 * 三个平台的分支都在这里验；**mac 那条今天在真包上走过一遍**（2026-09-06 探针），
 * win 与 Linux 只有单测，规格 §不做 里明说了「未在真机验过」。
 */
import { describe, expect, it } from "vitest"
import { 换包 } from "../../src/update/换包.js"
import type { 换包依赖 } from "../../src/update/换包.js"

const 记账 = (over: Partial<换包依赖> = {}) => {
  const 账: string[] = []
  const 依赖: 换包依赖 = {
    运行: async (cmd, args) => {
      账.push(`运行 ${cmd} ${args.join(" ")}`)
    },
    改名: async (a, b) => {
      账.push(`改名 ${a} → ${b}`)
    },
    拷贝: async (a, b) => {
      账.push(`拷贝 ${a} → ${b}`)
    },
    chmod: async (p, m) => {
      账.push(`chmod ${m.toString(8)} ${p}`)
    },
    删: async (p) => {
      账.push(`删 ${p}`)
    },
    找app: () => "/tmp/staged/DAWN Science.app",
    读包版本: () => "0.0.3",
    ...over,
  }
  return { 账, 依赖 }
}

const mac参数 = {
  方式: "mac-zip" as const,
  包路径: "/tmp/dl/DAWN-Science-0.0.3-mac-arm64.zip",
  期望版本: "0.0.3",
  当前版本: "0.0.2",
  应用路径: "/Applications/DAWN Science.app",
}

describe("mac：解开 → 核对 → 备份 → 换上", () => {
  it("顺序是备份在前、换上在后", async () => {
    const { 账, 依赖 } = 记账()
    await 换包(mac参数, 依赖)
    const 备份 = 账.findIndex((l) => l.includes("→ /Applications/DAWN Science.app.old-0.0.2"))
    const 换上 = 账.findIndex((l) => l.startsWith("改名 /tmp/staged/DAWN Science.app →"))
    expect(备份).toBeGreaterThanOrEqual(0)
    expect(换上).toBeGreaterThan(备份)
  })

  it("**新包的版本对不上就拒绝换**——宁可不更新，也不能装上一个不知道是什么的东西", async () => {
    const { 账, 依赖 } = 记账({ 读包版本: () => "0.0.1" })
    await expect(换包(mac参数, 依赖)).rejects.toThrow(/0\.0\.1.*0\.0\.3|0\.0\.3.*0\.0\.1/)
    expect(账.some((l) => l.includes(".old-"))).toBe(false) // 一步都还没动
  })

  it("解开之后找不到 .app → 说清楚是包里没有，不是「更新失败」", async () => {
    const { 依赖 } = 记账({ 找app: () => undefined })
    await expect(换包(mac参数, 依赖)).rejects.toThrow(/包里没有|\.app/)
  })

  it("换上那一步失败 → **旧的滚回原位**", async () => {
    let 第几次 = 0
    const { 账, 依赖 } = 记账({
      改名: async (a, b) => {
        第几次 += 1
        账.push(`改名 ${a} → ${b}`)
        if (第几次 === 2) throw new Error("磁盘满了")
      },
    })
    await expect(换包(mac参数, 依赖)).rejects.toThrow(/磁盘满了/)
    // 最后一步必须是把备份改回原名
    expect(账.at(-1)).toBe("改名 /Applications/DAWN Science.app.old-0.0.2 → /Applications/DAWN Science.app")
  })
})

describe("windows", () => {
  it("静默拉起安装器（/S）", async () => {
    const { 账, 依赖 } = 记账()
    await 换包(
      { 方式: "win-nsis", 包路径: "C:\\dl\\DAWN.exe", 期望版本: "0.0.3", 当前版本: "0.0.2" },
      依赖,
    )
    expect(账.some((l) => l === "运行 C:\\dl\\DAWN.exe /S")).toBe(true)
  })
})

describe("AppImage", () => {
  it("换掉 $APPIMAGE 那个文件，并且给它执行位", async () => {
    const { 账, 依赖 } = 记账()
    await 换包(
      {
        方式: "appimage",
        包路径: "/tmp/dl/new.AppImage",
        期望版本: "0.0.3",
        当前版本: "0.0.2",
        应用路径: "/home/u/DAWN.AppImage",
      },
      依赖,
    )
    expect(账).toContain("拷贝 /tmp/dl/new.AppImage → /home/u/DAWN.AppImage")
    // 少了执行位，下一次它就再也起不来了——而那时应用已经退了，人只看到「点了没反应」
    expect(账).toContain("chmod 755 /home/u/DAWN.AppImage")
  })
})

/**
 * 2026-09-06 真机演练抓到的那一个：**服务层拼参数时漏了 `应用路径`**，
 * 而当时它是可选的——十个单测全绿（每个用例自己传了它），真机上
 * 点「重启并更新」什么都不会发生，日志里才有一句「不知道这个 .app 在哪儿」。
 *
 * 现在类型上它是必填的（判别式），这条用例守着另一半：
 * **安装器自己知道这个 app 在哪儿**，没有就说清楚。
 */
describe("应用路径归安装器管", () => {
  it("本机安装器没拿到应用路径时，mac 那条说得出是这件事", async () => {
    const { 本机安装器 } = await import("../../src/update/本机安装器.js")
    const 装 = 本机安装器({ 下载目录: "/tmp", 重启: () => {} })
    await expect(
      装.换包({ 方式: "mac-zip", 包路径: "/tmp/x.zip", 期望版本: "0.0.3", 当前版本: "0.0.2" }),
    ).rejects.toThrow(/不知道这个应用装在哪儿/)
  })
})
