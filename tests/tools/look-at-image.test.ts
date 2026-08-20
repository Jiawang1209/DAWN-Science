/**
 * `look_at_image`（2026-08-20，视觉服务的缝二）。
 * 盯的是边界：格式不认、超上界、视觉没配、远端走执行器。
 */
import { describe, expect, it } from "vitest"
import { mkdtempSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach } from "vitest"
import { createLookAtImageTool } from "../../src/tools/look-at-image.js"
import type { 视觉端点 } from "../../src/runtime/vision.js"

const dirs: string[] = []
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

function 工作区(): string {
  const d = mkdtempSync(join(tmpdir(), "dawn-look-"))
  dirs.push(d)
  return d
}

const 端点: 视觉端点 = { baseUrl: "https://v.example/v1", model: "qwen-vl", apiKey: "k" }
// 一个字节都算图——工具不验魔数，那是端点的事
const 一张假图 = Buffer.from([0x89, 0x50, 0x4e, 0x47])

const 跑 = async (tool: ReturnType<typeof createLookAtImageTool>, params: Record<string, unknown>) => {
  const r = await tool.execute("t1", params)
  return { 文字: r.content[0]!.text, 错: r.isError === true }
}

describe("look_at_image", () => {
  it("视觉此刻没配置：说清去哪配，不装作工具不存在", async () => {
    const tool = createLookAtImageTool({ 端点: () => undefined, workspace: 工作区() })
    const r = await 跑(tool, { path: "a.png" })
    expect(r.错).toBe(true)
    expect(r.文字).toContain("设置")
  })

  it("不是图片格式：按后缀如实拒绝", async () => {
    const tool = createLookAtImageTool({ 端点: () => 端点, workspace: 工作区() })
    const r = await 跑(tool, { path: "notes.txt" })
    expect(r.错).toBe(true)
    expect(r.文字).toContain("text/plain")
  })

  it("本地读得到就送去转述，回来的话带上是谁转述的", async () => {
    const ws = 工作区()
    writeFileSync(join(ws, "fig.png"), 一张假图)
    const tool = createLookAtImageTool({ 端点: () => 端点, workspace: ws })
    /**
     * 拦下真网络：把 `描述图片` 的 fetch 换掉做不到（工具内部直接 import），
     * 所以这里给一个**必然连不上的端点**，断言失败被原样交给模型——
     * 这同时验证了「视觉端点的失败不吞」。成功路径由 e2e 对着 mock 服务器验。
     */
    const r = await 跑(tool, { path: "fig.png" })
    expect(r.错).toBe(true)
    expect(r.文字).toMatch(/连不上|没回话/)
  })

  it("路径越界：守卫的拒绝原样传出去", async () => {
    const ws = 工作区()
    const tool = createLookAtImageTool({ 端点: () => 端点, workspace: ws })
    const r = await 跑(tool, { path: "../外面.png" })
    expect(r.错).toBe(true)
    expect(r.文字).toContain("读不了")
  })

  it("远端会话走执行器的 readFile，路径按远端 cwd 解析", async () => {
    const 读过: string[] = []
    const tool = createLookAtImageTool({
      端点: () => 端点,
      workspace: "/本机不该被碰",
      remote: {
        executor: {
          exec: async () => ({ code: 0, stdout: "", stderr: "" }),
          readFile: async (p: string) => {
            读过.push(p)
            return 一张假图
          },
          writeFile: async () => {},
        },
        cwd: { get: () => "/home/ug2478/项目" },
      },
    })
    // 端点连不上所以最终报错，但**读的是远端那条路**——这一步先发生
    await 跑(tool, { path: "figures/fig.png" })
    expect(读过).toEqual(["/home/ug2478/项目/figures/fig.png"])
  })
})
