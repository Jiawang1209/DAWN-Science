/**
 * 浏览器插件（2026-08-25，学自 dsh-reef）：名册与纯逻辑（清理 / 净化）在 node 下直接验；
 * 真开浏览器的整链路验证在 e2e（假模型点名调工具）与人工。
 */
import { mkdtempSync, writeFileSync, readdirSync, utimesSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { browser工具定义, 清截图, 净化 } from "../../src/tools/browser/tools.js"
import { browserTools } from "../../src/tools/browser/index.js"
import { 插件册 } from "../../src/tools/plugins.js"

describe("浏览器插件", () => {
  it("15 个工具、四族；关一族少一族；off 全关", () => {
    const 族们 = browser工具定义("/tmp")
    expect(族们.map((f) => `${f.族}:${f.工具.length}`)).toEqual(["browse:7", "read:2", "act:4", "artifact:2"])
    const 全开 = { off: false, browse: true, read: true, act: true, artifact: true }
    expect(browserTools("/tmp", 全开)).toHaveLength(15)
    expect(browserTools("/tmp", { ...全开, act: false })).toHaveLength(11)
    expect(browserTools("/tmp", { ...全开, off: true })).toEqual([])
  })

  it("插件册两条：office 与 browser，键前缀各归各", () => {
    expect(插件册.map((p) => p.id)).toEqual(["office", "browser"])
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

  it("净化：函数与 bigint 降级、循环引用不炸", () => {
    expect(净化({ a: 1, f: () => 1, b: 10n })).toEqual({ a: 1, f: "[function]", b: "10" })
    const 环: Record<string, unknown> = {}
    环.self = 环
    expect(typeof 净化(环)).toBe("string")
  })
})
