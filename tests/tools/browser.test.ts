/**
 * 浏览器插件（2026-08-25，学自 dsh-reef）：名册与纯逻辑（清理 / 净化）在 node 下直接验；
 * 真开浏览器的整链路验证在 e2e（假模型点名调工具）与人工。
 */
import { mkdtempSync, writeFileSync, readdirSync, utimesSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { browser工具定义, 清截图, 净化, 工作区内写入目标 } from "../../src/tools/browser/tools.js"
import { symlinkSync, realpathSync } from "node:fs"
import { browserTools } from "../../src/tools/browser/index.js"
import { 插件册 } from "../../src/tools/plugins.js"
import { 旁观, 截一帧 } from "../../src/tools/browser/session.js"

describe("浏览器插件", () => {
  it("15 个工具、四族；关一族少一族；off 全关", () => {
    const 族们 = browser工具定义("/tmp")
    expect(族们.map((f) => `${f.族}:${f.工具.length}`)).toEqual(["browse:7", "read:2", "act:4", "artifact:2"])
    const 全开 = { off: false, browse: true, read: true, act: true, artifact: true }
    expect(browserTools("/tmp", 全开)).toHaveLength(15)
    expect(browserTools("/tmp", { ...全开, act: false })).toHaveLength(11)
    expect(browserTools("/tmp", { ...全开, off: true })).toEqual([])
  })

  it("插件册三条：office / browser / memory，键前缀各归各", () => {
    expect(插件册.map((p) => p.id)).toEqual(["office", "browser", "memory"])
    expect(插件册[1]!.键).toBe("plugin.browser")
    expect(插件册[1]!.族们().reduce((n, f) => n + f.tools.length, 0)).toBe(15)
  })

  it("清截图：过老的与超额的删掉，别人的文件与新截图活着", () => {
    const d = mkdtempSync(join(tmpdir(), "dawn-shot-"))
    const 老 = join(d, "老.png")
    writeFileSync(老, "x")
    const 老时 = (Date.now() - 8 * 24 * 3600 * 1000) / 1000
    utimesSync(老, 老时, 老时)
    writeFileSync(join(d, "新.png"), "x")
    writeFileSync(join(d, "别人的.txt"), "留着")
    const 删了 = 清截图(d)
    expect(删了).toBe(1)
    expect(readdirSync(d).sort()).toEqual(["别人的.txt", "新.png"])
  })

  describe("旁观面（2026-08-25，坞「网页」格的「agent 旁观」页签）", () => {
    it("没开时如实说没开，历史照给（空数组也是答案）", async () => {
      const d = await 旁观()
      expect(d.open).toBe(false)
      expect(Array.isArray(d.history)).toBe(true)
      expect(d.activeTitle).toBe("")
    })

    it("没开时截帧响亮拒绝，不静默回空图，也不偷偷把浏览器拉起来", async () => {
      await expect(截一帧()).rejects.toThrow(/没开/)
      expect((await 旁观()).open).toBe(false)
    })
  })

  describe("browser_download 写入目标守卫(审查 debug E2)", () => {
    it("正常相对路径落工作区,建出父目录", () => {
      const ws = mkdtempSync(join(tmpdir(), "dawn-dl-"))
      const 目标 = 工作区内写入目标(ws, "sub/dir/a.csv")
      // macOS 上 /var → /private/var,守卫内部 realpath 过,这里用 realpath 后的 ws 比
      expect(目标.startsWith(realpathSync(ws))).toBe(true)
      expect(目标.endsWith("a.csv")).toBe(true)
    })
    it("绝对路径拒绝", () => {
      const ws = mkdtempSync(join(tmpdir(), "dawn-dl-"))
      expect(() => 工作区内写入目标(ws, "/etc/passwd")).toThrow(/绝对路径|工作区内/)
    })
    it("`../` 逃逸拒绝", () => {
      const ws = mkdtempSync(join(tmpdir(), "dawn-dl-"))
      expect(() => 工作区内写入目标(ws, "../../x")).toThrow(/工作区之外/)
    })
    it("经符号链接逃逸拒绝", () => {
      const ws = mkdtempSync(join(tmpdir(), "dawn-dl-"))
      const 外 = mkdtempSync(join(tmpdir(), "dawn-outside-"))
      symlinkSync(外, join(ws, "link"))
      expect(() => 工作区内写入目标(ws, "link/x.csv")).toThrow(/符号链接|工作区之外/)
    })
  })

  it("净化：函数与 bigint 降级、循环引用不炸", () => {
    expect(净化({ a: 1, f: () => 1, b: 10n })).toEqual({ a: 1, f: "[function]", b: "10" })
    const 环: Record<string, unknown> = {}
    环.self = 环
    expect(typeof 净化(环)).toBe("string")
  })
})
