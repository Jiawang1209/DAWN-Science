/**
 * **网页预览这一格的门**（批 1 立起来，批 3 放开，2026-08-18）。
 *
 * 作者定的范围是「**先本机的东西，其次任意网站**」。批 3 放开了 http(s)
 * 那一半，**而 `file:` 那一半一个字都没松**——它仍然只认工作目录里的文件。
 *
 * 放开之后守卫并没有消失，是**挪了地方**：从「哪些地址能开」挪到了
 * 「那个视图能干什么」（独立分区、权限一律拒、证书错误不放行、
 * 弹窗不新开窗口、下载落到设置里那个目录）。
 * **拿一张网址白名单当安全边界本来就是假的。**
 *
 * 判定抽成纯函数放在这里，是因为它**必须能在没有 Electron 的地方跑**——
 * 与 `ipc.ts` 那句「把只有 Electron 才跑得起来的东西塞进协议等于毁掉那个前提」
 * 同一条理由。
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest"
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { 可以开吗 } from "../../src/electron/web-preview.js"

let ws: string
beforeEach(() => {
  ws = mkdtempSync(join(tmpdir(), "dawn-web-"))
  writeFileSync(join(ws, "报告.html"), "<h1>hi</h1>")
  mkdirSync(join(ws, "out"), { recursive: true })
  writeFileSync(join(ws, "out", "fig.html"), "<h1>fig</h1>")
})
afterEach(() => rmSync(ws, { recursive: true, force: true }))

const 放行 = (u: string) => 可以开吗(u, ws).ok

describe("网页地址门", () => {
  it("localhost 与 127.0.0.1 放行，端口随意", () => {
    expect(放行("http://localhost:64070/")).toBe(true)
    expect(放行("http://127.0.0.1:8888/lab")).toBe(true)
    expect(放行("https://localhost:8443/")).toBe(true)
    expect(放行("http://[::1]:3000/")).toBe(true)
  })

  it("**任意网站也放行**（批 3，作者定的第二期）", () => {
    expect(放行("https://example.com/")).toBe(true)
    expect(放行("http://localhost.evil.com/")).toBe(true)
  })

  it("**`file:` 那一半一个字都没松** —— 放开的只有 http(s)", () => {
    expect(放行("file:///etc/passwd")).toBe(false)
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
    expect(可以开吗(`file://${join(ws, "报告.html")}`, undefined).ok).toBe(false)
  })

  it("**别的协议一律拦**，逐个点名", () => {
    for (const u of ["javascript:alert(1)", "data:text/html,<h1>x", "chrome://settings", "ftp://localhost/"]) {
      const r = 可以开吗(u, ws)
      expect(r.ok, `${u} 不该放行`).toBe(false)
    }
  })

  it("**一句话不是地址**：没写协议、又不像主机名的，说它不是地址", () => {
    // 批 3 放开任意网站之后这条才需要：在那之前主机名不是 localhost 就直接拦了，
    // 而 `new URL("http://这不是一个地址")` 是合法的 IDN 主机名

    const r = 可以开吗("这不是一个地址", ws)
    expect(r.ok).toBe(false)
    if (r.ok) throw new Error("上一句断言过了")
    expect(r.why).toMatch(/不是|不像|地址/)
  })

  it("**写了协议就信他** —— 内网的单标签主机名是真实存在的", () => {
    expect(放行("http://intranet/")).toBe(true)
  })

  it("**光秃秃的 host:port 也认**：地址栏里没人会打 `http://`", () => {
    // 人在地址栏敲的是 `localhost:64070`，不是 `http://localhost:64070`
    const r = 可以开吗("localhost:64070", ws)
    expect(r.ok).toBe(true)
    if (!r.ok) throw new Error("上一句断言过了")
    expect(r.url).toBe("http://localhost:64070/")
  })

  it("补全出来的东西**仍然要过同一道门**；外网主机名没写协议补 https（本机仍是 http）", () => {
    const r = 可以开吗("example.com", ws)
    expect(r.ok).toBe(true)
    if (!r.ok) throw new Error("上一句断言过了")
    expect(r.url).toBe("https://example.com/")
    const 本机 = 可以开吗("127.0.0.1:8888", ws)
    expect(本机.ok && 本机.url).toBe("http://127.0.0.1:8888/")
  })
})
