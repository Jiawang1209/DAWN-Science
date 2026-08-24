/**
 * 浏览器插件 · 真浏览器集成（2026-08-25）：复用系统 Chrome/Edge 对一张本地页面走完
 * open → snapshot → elements → type/click → eval → screenshot 的真实链路。
 * **探测不到浏览器就带理由跳过**——不装死也不假绿。
 */
import { mkdtempSync, writeFileSync, readdirSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterAll, describe, expect, it } from "vitest"
import { browserTools } from "../../src/tools/browser/index.js"
import { 关浏览器, 旁观, 截一帧 } from "../../src/tools/browser/session.js"

const 有浏览器 = await (async () => {
  try {
    const { chromium } = await import("playwright-core")
    const b = await chromium.launch({ channel: "chrome", headless: true }).catch(() => chromium.launch({ channel: "msedge", headless: true }))
    await b.close()
    return true
  } catch {
    return false
  }
})()

interface 工具 {
  name: string
  execute: (id: string, params: Record<string, unknown>) => Promise<{ content: { text: string }[]; isError?: boolean }>
}

describe.skipIf(!有浏览器)("浏览器插件 · 真链路（本机没有 Chrome/Edge 时跳过）", () => {
  const ws = mkdtempSync(join(tmpdir(), "dawn-browser-"))
  const 页 = join(ws, "页.html")
  writeFileSync(页, `<!doctype html><title>试验页</title><body>
    <h1>DAWN 试验页</h1><p>正文在这。</p>
    <input id="q" placeholder="搜点什么">
    <button id="go" onclick="document.title='点过了'">走</button>
    <a href="https://example.com/甲">链接甲</a></body>`)
  const 全开 = { off: false, browse: true, read: true, act: true, artifact: true }
  const all = browserTools(ws, 全开) as 工具[]
  const 取 = (n: string) => all.find((t) => t.name === n)!
  const 文字 = (r: { content: { text: string }[] }) => r.content.map((c) => c.text).join("\n")

  afterAll(async () => {
    await 关浏览器()
  })

  it("open → snapshot：正文、链接、输入框数都在", async () => {
    const 开 = await 取("browser_open").execute("1", { url: `file://${页}` })
    expect(开.isError).toBeUndefined()
    const s = await 取("browser_snapshot").execute("2", {})
    const t = 文字(s)
    expect(t).toContain("DAWN 试验页")
    expect(t).toContain("正文在这")
    expect(t).toContain("输入框：1 个")
    expect(t).toContain("example.com")
  }, 30_000)

  it("elements 给现成选择器；type + click 真的生效（eval 验证）", async () => {
    const e = await 取("browser_elements").execute("3", {})
    expect(文字(e)).toContain("#q")
    expect(文字(e)).toContain("#go")
    await 取("browser_type").execute("4", { selector: "#q", text: "你好", clear: true })
    await 取("browser_click").execute("5", { selector: "#go" })
    const v = await 取("browser_eval").execute("6", { code: "({ v: document.querySelector('#q').value, t: document.title })" })
    expect(文字(v)).toContain("你好")
    expect(文字(v)).toContain("点过了")
  }, 30_000)

  it("screenshot 落进工作区 .dawn/screenshots", async () => {
    const r = await 取("browser_screenshot").execute("7", {})
    expect(r.isError).toBeUndefined()
    expect(readdirSync(join(ws, ".dawn", "screenshots")).some((n) => n.endsWith(".png"))).toBe(true)
  }, 30_000)

  it("旁观：open 之后 observe 里有那条历史；frame 是合法 PNG（2026-08-25 旁观面）", async () => {
    const d = await 旁观()
    expect(d.open).toBe(true)
    expect(d.history.length).toBeGreaterThan(0)
    expect(d.history[0]?.url).toBeTruthy()
    // page.url() 回的是百分号编码过的（web-preview e2e 为同一件事栽过）——解码再比
    expect(decodeURIComponent(d.activeUrl)).toContain("页.html")
    const png = Buffer.from(await 截一帧(), "base64")
    expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a")
  }, 30_000)
})
