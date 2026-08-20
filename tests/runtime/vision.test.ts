/**
 * 视觉客户端的三种失败与一种成功（2026-08-20）。
 * **失败必须出声**（规格 7.5）：超时 / 非 200 / 回空，各说各的话。
 */
import { describe, expect, it } from "vitest"
import { 描述图片, 转述提问 } from "../../src/runtime/vision.js"

const 端点 = { baseUrl: "https://v.example/v1/", model: "qwen-vl", apiKey: "k" }
const 一张图 = [{ data: "aGk=", mimeType: "image/png" }]

function 假fetch(应答: (url: string, init: RequestInit) => Response | Promise<Response>): typeof fetch {
  return ((url: string, init: RequestInit) => Promise.resolve(应答(url, init))) as unknown as typeof fetch
}

describe("描述图片", () => {
  it("成功：POST 到 /chat/completions，带图、带钥匙、不要流", async () => {
    let 收到的: { url?: string; body?: Record<string, unknown>; auth?: string | undefined } = {}
    const f = 假fetch((url, init) => {
      收到的 = {
        url,
        body: JSON.parse(String(init.body)) as Record<string, unknown>,
        auth: (init.headers as Record<string, string>)["authorization"],
      }
      return new Response(JSON.stringify({ choices: [{ message: { content: "一块红色方块" } }] }))
    })
    const r = await 描述图片(端点, 一张图, undefined, f)
    expect(r).toBe("一块红色方块")
    // 尾斜杠被归一，不会拼出 v1//chat
    expect(收到的.url).toBe("https://v.example/v1/chat/completions")
    expect(收到的.auth).toBe("Bearer k")
    expect(收到的.body!["stream"]).toBe(false)
    expect(收到的.body!["model"]).toBe("qwen-vl")
    const messages = 收到的.body!["messages"] as { content: { type: string }[] }[]
    expect(messages[0]!.content.map((c) => c.type)).toEqual(["text", "image_url"])
    // 没给提问时用内置那句（面向数据图表）
    expect(JSON.stringify(收到的.body)).toContain(转述提问.slice(0, 10))
  })

  it("非 200：带上端点回的原话", async () => {
    const f = 假fetch(() => new Response("model not found", { status: 404 }))
    await expect(描述图片(端点, 一张图, undefined, f)).rejects.toThrow(/404.*model not found/s)
  })

  it("非 200 且原话太长：截断要说清省了多少", async () => {
    const f = 假fetch(() => new Response("x".repeat(1000), { status: 500 }))
    await expect(描述图片(端点, 一张图, undefined, f)).rejects.toThrow(/只引了前 400/)
  })

  it("回 200 但内容是空的：与网络错误是两回事，话也要不同", async () => {
    const f = 假fetch(() => new Response(JSON.stringify({ choices: [{ message: { content: "" } }] })))
    await expect(描述图片(端点, 一张图, undefined, f)).rejects.toThrow(/内容是空的/)
  })

  it("连不上：说清是哪个地址", async () => {
    const f = (() => Promise.reject(new Error("ECONNREFUSED"))) as unknown as typeof fetch
    await expect(描述图片(端点, 一张图, undefined, f)).rejects.toThrow(/连不上.*v\.example.*ECONNREFUSED/s)
  })

  it("content 是分段数组（有些端点这么回）也拼得起来", async () => {
    const f = 假fetch(() =>
      new Response(JSON.stringify({ choices: [{ message: { content: [{ type: "text", text: "前半" }, { type: "text", text: "后半" }] } }] })),
    )
    expect(await 描述图片(端点, 一张图, undefined, f)).toBe("前半后半")
  })
})
