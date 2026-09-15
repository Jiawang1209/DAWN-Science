/**
 * `fetchLocalImage` 的守卫（7.34，案例卡片封面）。起一台真的本机 HTTP 服务来验，不 mock fetch。
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { createServer, type Server } from "node:http"
import type { AddressInfo } from "node:net"
import { 取本机图片 } from "../../src/workbench/本机图片.js"

let 服务: Server
let 根: string
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEElEQVR4nGO4o6YGRAwQCgAjRgSh7v9IEwAAAABJRU5ErkJggg==",
  "base64",
)

beforeAll(async () => {
  服务 = createServer((req, res) => {
    if (req.url === "/a.png") return void (res.writeHead(200, { "content-type": "image/png" }), res.end(png))
    if (req.url === "/page") return void (res.writeHead(200, { "content-type": "text/html" }), res.end("<p>hi</p>"))
    if (req.url === "/big") return void (res.writeHead(200, { "content-type": "image/png" }), res.end(Buffer.alloc(2 * 1024 * 1024 + 1)))
    if (req.url === "/slow") return void setTimeout(() => (res.writeHead(200, { "content-type": "image/png" }), res.end(png)), 400)
    res.writeHead(404)
    res.end()
  })
  await new Promise<void>((r) => 服务.listen(0, "127.0.0.1", r))
  根 = `http://127.0.0.1:${(服务.address() as AddressInfo).port}`
})
afterAll(() => new Promise<void>((r) => 服务.close(() => r())))

describe("取本机图片", () => {
  it("本机地址上的 png → mediaType + base64", async () => {
    const r = await 取本机图片(`${根}/a.png`)
    expect(r.mediaType).toBe("image/png")
    expect(Buffer.from(r.base64, "base64").equals(png)).toBe(true)
  })

  it("**不是本机地址 → 拒**，一个字节都不去取", async () => {
    await expect(取本机图片("https://example.com/a.png")).rejects.toThrow(/本机/)
  })

  it("404 → 拒，并说出状态码", async () => {
    await expect(取本机图片(`${根}/nope.png`)).rejects.toThrow(/404/)
  })

  it("不是图片 → 拒，并说出它是什么", async () => {
    await expect(取本机图片(`${根}/page`)).rejects.toThrow(/text\/html/)
  })

  it("超过 2MB → 拒", async () => {
    await expect(取本机图片(`${根}/big`)).rejects.toThrow(/2MB/)
  })

  it("超时 → 拒", async () => {
    await expect(取本机图片(`${根}/slow`, { 超时毫秒: 100 })).rejects.toThrow(/超时/)
  })
})
