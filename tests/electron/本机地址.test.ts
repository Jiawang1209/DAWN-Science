/**
 * **网页预览只认本机**（批 1，2026-08-18）。
 *
 * 作者定的范围是「**先本机的东西，其次任意网站**」。第一期这道门要能说清
 * 两件事：放什么进来，以及**拦下来的时候说得出为什么**——
 * 一个静默跳回去的地址栏，与「这个功能坏了」在屏幕上长得一模一样。
 *
 * 判定抽成纯函数放在这里，是因为它**必须能在没有 Electron 的地方跑**——
 * 与 `ipc.ts` 那句「把只有 Electron 才跑得起来的东西塞进协议等于毁掉那个前提」
 * 同一条理由。
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest"
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { 本机地址吗 } from "../../src/electron/web-preview.js"

let ws: string
beforeEach(() => {
  ws = mkdtempSync(join(tmpdir(), "dawn-web-"))
  writeFileSync(join(ws, "报告.html"), "<h1>hi</h1>")
  mkdirSync(join(ws, "out"), { recursive: true })
  writeFileSync(join(ws, "out", "fig.html"), "<h1>fig</h1>")
})
afterEach(() => rmSync(ws, { recursive: true, force: true }))

const 放行 = (u: string) => 本机地址吗(u, ws).ok

describe("本机地址吗", () => {
  it("localhost 与 127.0.0.1 放行，端口随意", () => {
    expect(放行("http://localhost:64070/")).toBe(true)
    expect(放行("http://127.0.0.1:8888/lab")).toBe(true)
    expect(放行("https://localhost:8443/")).toBe(true)
    expect(放行("http://[::1]:3000/")).toBe(true)
  })

  it("**外网一律拦下**，而且说得出拦的是什么", () => {
    const r = 本机地址吗("https://example.com/", ws)
    expect(r.ok).toBe(false)
    if (r.ok) throw new Error("上一句断言过了")
    // **点名说是哪个主机**：笼统一句「不允许」会让人以为是功能坏了
    expect(r.why).toContain("example.com")
  })

  it("**长得像 localhost 的不算**：子域名与前缀都要拦", () => {
    // `localhost.evil.com` 与 `127.0.0.1.evil.com` 是真实存在的钓鱼写法
    expect(放行("http://localhost.evil.com/")).toBe(false)
    expect(放行("http://127.0.0.1.evil.com/")).toBe(false)
    expect(放行("http://notlocalhost/")).toBe(false)
  })

  it("工作区**里面**的 file: 放行", () => {
    expect(放行(`file://${join(ws, "报告.html")}`)).toBe(true)
    expect(放行(`file://${join(ws, "out", "fig.html")}`)).toBe(true)
  })

  it("**工作区外面的 file: 拦下** —— 那是路径守卫的活，不另开一套", () => {
    expect(放行("file:///etc/passwd")).toBe(false)
    expect(放行(`file://${join(ws, "..", "别处.html")}`)).toBe(false)
  })

  it("没有工作区时**一个 file: 都不放**，不拿家目录顶上", () => {
    expect(本机地址吗(`file://${join(ws, "报告.html")}`, undefined).ok).toBe(false)
  })

  it("**别的协议一律拦**，逐个点名", () => {
    for (const u of ["javascript:alert(1)", "data:text/html,<h1>x", "chrome://settings", "ftp://localhost/"]) {
      const r = 本机地址吗(u, ws)
      expect(r.ok, `${u} 不该放行`).toBe(false)
    }
  })

  it("不是地址的东西**说它不是地址**，不当成外网", () => {
    const r = 本机地址吗("这不是一个地址", ws)
    expect(r.ok).toBe(false)
    if (r.ok) throw new Error("上一句断言过了")
    expect(r.why).toMatch(/不是|地址/)
  })

  it("**光秃秃的 host:port 也认**：地址栏里没人会打 `http://`", () => {
    // 人在地址栏敲的是 `localhost:64070`，不是 `http://localhost:64070`
    const r = 本机地址吗("localhost:64070", ws)
    expect(r.ok).toBe(true)
    if (!r.ok) throw new Error("上一句断言过了")
    expect(r.url).toBe("http://localhost:64070/")
  })

  it("补全出来的东西**仍然要过同一道门**", () => {
    expect(放行("example.com")).toBe(false)
  })
})
