/**
 * 下载那一段（规格 U5 的前半）。**对着一台真的 http 服务器验**——
 * 假一个 `fetch` 出来的话，验的是我们自己写的替身，而流、进度、
 * 中断这三件恰恰都在真实现里。
 */
import { describe, expect, it, afterAll } from "vitest"
import http from "node:http"
import { mkdtempSync, readFileSync, existsSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { 下载到 } from "../../src/update/下载.js"

const 包大小 = 200_000
const server = http.createServer((req, res) => {
  const u = new URL(req.url ?? "/", "http://x")
  if (u.pathname === "/slow") {
    // 分块慢慢吐，中断那条用例要有机会中断
    res.writeHead(200, { "content-length": String(包大小) })
    let 发了 = 0
    const 定时 = setInterval(() => {
      if (发了 >= 包大小) {
        clearInterval(定时)
        res.end()
        return
      }
      res.write(Buffer.alloc(10_000, 1))
      发了 += 10_000
    }, 20)
    req.on("close", () => clearInterval(定时))
    return
  }
  if (u.pathname === "/short") {
    res.writeHead(200).end(Buffer.alloc(10, 1))
    return
  }
  if (u.pathname === "/pkg") {
    res.writeHead(200, { "content-length": String(包大小) }).end(Buffer.alloc(包大小, 7))
    return
  }
  res.writeHead(500).end()
})
server.listen(0, "127.0.0.1")
const 根 = () => `http://127.0.0.1:${(server.address() as { port: number }).port}`
afterAll(() => server.close())

const 临时 = () => mkdtempSync(join(tmpdir(), "dawn-dl-"))

describe("下载到", () => {
  it("下得下来，落在指定目录，字节数对得上", async () => {
    const 目录 = 临时()
    const 进度: number[] = []
    const 路径 = await 下载到({
      资源: { name: "pkg.zip", size: 包大小, url: `${根()}/pkg` },
      目录,
      进度: (p) => 进度.push(p.已下),
      signal: new AbortController().signal,
    })
    expect(路径).toBe(join(目录, "pkg.zip"))
    expect(readFileSync(路径).length).toBe(包大小)
    expect(进度.length).toBeGreaterThan(0)
    expect(进度.at(-1)).toBe(包大小)
  })

  it("大小与 Release 说的对不上就拒收，**并说清楚差多少**", async () => {
    const 目录 = 临时()
    await expect(
      下载到({
        资源: { name: "pkg.zip", size: 包大小, url: `${根()}/short` },
        目录,
        进度: () => {},
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow(/10 .*200000|200000.*10/)
    // 半截的东西不许留在盘上——下次启动看到它会以为已经下好了
    expect(existsSync(join(目录, "pkg.zip"))).toBe(false)
  })

  it("能中断，而且中断之后不留半截文件", async () => {
    const 目录 = 临时()
    const 闸 = new AbortController()
    const p = 下载到({
      资源: { name: "pkg.zip", size: 包大小, url: `${根()}/slow` },
      目录,
      进度: (x) => {
        if (x.已下 > 0) 闸.abort()
      },
      signal: 闸.signal,
    })
    await expect(p).rejects.toThrow(/取消|中止/)
    expect(existsSync(join(目录, "pkg.zip"))).toBe(false)
  })

  it("服务器回 500 时把状态码说出来", async () => {
    await expect(
      下载到({
        资源: { name: "pkg.zip", size: 1, url: `${根()}/boom` },
        目录: 临时(),
        进度: () => {},
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow(/500/)
  })
})
