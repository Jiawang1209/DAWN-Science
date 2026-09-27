/**
 * 回退的两道闸（2026-09-27，Task 5 复审）。
 *
 * ① **转述图片的那几秒也算「在忙」**：空闲时发一句带图的、模型要转述——人那句已经进了转录，`送一轮` 要等转述完才开跑，
 *    这期间 `inFlight` 还是 0。不拦的话回退会从这条缝里过去：转录撤了那句、pi 那边随后又收到它，两边说的不是一件事。
 * ② **认技能调用按真名单，不按长相**：`/data.csv 看一下` 是路径不是技能；`/skill:画图` 的名字是中文。
 *
 * 白盒（与 `vision-seam.test.ts` 同一个设法）：往私有表里塞一段假会话、换掉 `送一轮`，只验闸本身。
 */
import { describe, expect, it, vi } from "vitest"
import { NativeRuntime, 原文对得上 } from "../../src/runtime/native.js"

const 端点 = { baseUrl: "https://v.example/v1", model: "qwen-vl", apiKey: "k" }
const 一张图 = [{ data: "aGk=", mimeType: "image/png" }]

function 摆一段() {
  const rt = new NativeRuntime({ vision: () => 端点 })
  const 内部 = rt as unknown as {
    sessions: Map<string, unknown>
    送一轮: (sessionId: string, data: string) => void
  }
  内部.sessions.set("s1", {
    session: { model: { id: "deepseek-v4", input: ["text"] }, isStreaming: false, isCompacting: false },
    inFlight: 0,
    回退中: false,
    转述中: 0,
    待发: [],
  })
  const 送了: string[] = []
  内部.送一轮 = (_id, data) => void 送了.push(data)
  return { rt, 送了 }
}

describe("转述图片期间算在忙", () => {
  it("空闲时发带图的一句：转述没回来之前，预览、回退、压缩都拒；回来之后放开", async () => {
    let 放行!: () => void
    const 卡住 = new Promise<void>((r) => (放行 = r))
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        await 卡住
        return new Response(JSON.stringify({ choices: [{ message: { content: "一块红色方块" } }] }))
      }),
    )
    try {
      const { rt, 送了 } = 摆一段()
      rt.writeWithImages("s1" as never, "看这张", 一张图)
      const 那句 = { 倒数第几句: 1, 文: "看这张" }
      await expect(rt.previewRewind("s1" as never, 那句)).rejects.toThrow(/还在跑/)
      await expect(rt.rewind("s1" as never, 那句, "both", [])).rejects.toThrow(/还在跑/)
      expect(() => rt.compact("s1" as never, undefined)).toThrow(/还没说完/)

      放行()
      await vi.waitFor(() => expect(送了).toHaveLength(1))
      // 放开了：不再是「还在跑」（假会话没有 sessionManager，往下走会别处出错——那不是这里验的）
      await expect(rt.previewRewind("s1" as never, 那句)).rejects.not.toThrow(/还在跑/)
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

describe("原文对得上：技能按记录里的展开块认、提示模板按真名单认", () => {
  const 名单 = { 模板: new Set(["整理"]) }

  it("`/skill:画图`（中文名）：pi 那句是展开后的技能块 → 对得上", () => {
    const pi那句 = `<skill name="画图" location="/x/画图/SKILL.md">\nReferences are relative to /x/画图.\n\n正文\n</skill>\n\n画个散点图`
    expect(原文对得上("/skill:画图 画个散点图", pi那句, 名单)).toBe(true)
    expect(原文对得上("/skill:画图", `<skill name="画图" location="/x">\n正文\n</skill>`, 名单)).toBe(true)
  })

  it("技能调用对的不是这一句 → 对不上", () => {
    expect(原文对得上("/skill:画图 画个散点图", "改两个文件", 名单)).toBe(false)
  })

  it("技能后来删了：pi 那句仍是它的展开块 → 仍对得上（认的是记录，不是此刻的名单）", () => {
    expect(原文对得上("/skill:旧的 x", `<skill name="旧的" location="/y">\n正文\n</skill>\n\nx`, { 模板: new Set<string>() })).toBe(true)
  })

  it("`/data.csv 看一下`（一段根路径）不是技能：照常核对原文", () => {
    expect(原文对得上("/data.csv 看一下", "改两个文件", 名单)).toBe(false)
    expect(原文对得上("/data.csv 看一下", "/data.csv 看一下", 名单)).toBe(true)
  })

  it("提示模板 `/整理`：在名单上才免核；不在名单上就是普通的一句", () => {
    expect(原文对得上("/整理 这几段", "模板展开后的一大段", 名单)).toBe(true)
    expect(原文对得上("/画图 x", "别的", 名单)).toBe(false)
    expect(原文对得上("/画图 x", "/画图 x", 名单)).toBe(true)
  })
})
