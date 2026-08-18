/**
 * 「这是不是本机地址」的**共用那一半**（批 2，2026-08-18）。
 *
 * 主进程与渲染进程都读它。**各写一份的话**，一条链接会在「界面说能开」
 * 与「主进程说不能」之间打架，而那种不一致没有任何地方会报出来。
 */
import { describe, expect, it } from "vitest"
import { 像本机地址吗, 头一条网址, 解析地址 } from "../../src/policy/local-url.js"

describe("像本机地址吗", () => {
  it("本机放行，外网不放", () => {
    expect(像本机地址吗("http://localhost:64070/")).toBe(true)
    expect(像本机地址吗("127.0.0.1:8888")).toBe(true)
    expect(像本机地址吗("https://example.com/")).toBe(false)
  })

  it("**长得像 localhost 的不算**", () => {
    expect(像本机地址吗("http://localhost.evil.com/")).toBe(false)
  })

  it("`file:` 放宽一档，交给主进程去判在不在工作目录里", () => {
    // **放宽是有意的**：把一条本该能开的链接送去系统浏览器，
    // 比「送进坞、被拒、屏幕上说清为什么」更糟——前者人不知道发生了什么
    expect(像本机地址吗("file:///tmp/a.html")).toBe(true)
  })

  it("别的协议不放", () => {
    expect(像本机地址吗("javascript:alert(1)")).toBe(false)
    expect(像本机地址吗("data:text/html,x")).toBe(false)
  })
})

describe("解析地址", () => {
  it("`localhost:64070` 里那个冒号是端口，不是协议", () => {
    expect(解析地址("localhost:64070")?.href).toBe("http://localhost:64070/")
  })
  it("认不出来就返回 undefined，**不猜**", () => {
    expect(解析地址("这不是地址 里面还有空格")).toBeUndefined()
  })
})

describe("头一条网址", () => {
  it("从一段话里捞出那一条", () => {
    expect(头一条网址("可视化伴侣已在 http://localhost:64070 准备好，后面会展示完整产品闭环。"))
      .toBe("http://localhost:64070")
  })

  it("**收尾的标点不算地址的一部分**", () => {
    // 中文句号紧跟在地址后面是常态，带上它就打不开了
    expect(头一条网址("去 http://127.0.0.1:8888/lab。")).toBe("http://127.0.0.1:8888/lab")
    expect(头一条网址("见 (http://localhost:3000/x)")).toBe("http://localhost:3000/x")
  })

  it("**外网也给卡片**（批 3：那一格开得了任意网站了）", () => {
    // 只给本机的话，外网就只剩地址栏一条路进得去，这个功能等于半残
    expect(头一条网址("详见 https://example.com/doc")).toBe("https://example.com/doc")
  })

  it("**`file:` 不给卡** —— 在不在工作目录里只有主进程说了算", () => {
    // 一张点了才知道被拒的卡，比没有这张卡更让人困惑
    expect(头一条网址("打开 file:///tmp/a.html 看看")).toBeUndefined()
  })

  it("一条都没有就没有", () => {
    expect(头一条网址("这段话里一个地址都没有")).toBeUndefined()
  })
})
