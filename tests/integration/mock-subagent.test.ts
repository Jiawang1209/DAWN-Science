/**
 * 假模型的子 agent 三支（2026-09-27，子 agent 看得见；准入规则 1）。
 * 主区说「派子agent」→ 调 subagent；子进程收到「子任务…」→ 先说一句再 read；「子任务慢…」→ bash sleep 15。dev:mock 与 e2e 共用。
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest"
// @ts-expect-error -- .mjs 脚本，无类型声明；它同时服务于 npm run dev:mock
import { startMockInferenceServer } from "../../scripts/mock-inference-server.mjs"

let server: { url: string; close: () => Promise<void> }
beforeAll(async () => {
  server = await startMockInferenceServer()
})
afterAll(async () => {
  await server?.close()
})

const 问 = async (messages: unknown[]) => {
  const r = await fetch(`${server.url}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model: "m", stream: false, messages }),
  })
  return (await r.json()) as { choices: { message: { content: string | null; tool_calls?: { function: { name: string; arguments: string } }[] } }[] }
}
const 调了 = (j: Awaited<ReturnType<typeof 问>>) => {
  const c = j.choices[0]!.message.tool_calls?.[0]?.function
  return c ? { name: c.name, args: JSON.parse(c.arguments) as Record<string, unknown> } : undefined
}

describe("mock · 子 agent 三支", () => {
  it("「派子agent」→ 调 subagent，交给 data-auditor 一个以「子任务」开头的任务", async () => {
    const c = 调了(await 问([{ role: "user", content: "派子agent看看这个仓库" }]))
    expect(c?.name).toBe("subagent")
    expect(c?.args.agent).toBe("data-auditor")
    expect(String(c?.args.task)).toMatch(/^子任务：/)
  })
  it("「派子agent慢…」→ 任务以「子任务慢」开头", async () => {
    const c = 调了(await 问([{ role: "user", content: "派子agent慢慢看" }]))
    expect(String(c?.args.task)).toMatch(/^子任务慢/)
  })
  it("子进程收到「子任务…」→ 先说一句，再 read README.md", async () => {
    const j = await 问([{ role: "user", content: "子任务：读一下 README.md" }])
    expect(j.choices[0]!.message.content).toBe("我先读一下 README。")
    expect(调了(j)).toEqual({ name: "read", args: { path: "README.md" } })
  })
  it("子进程收到「子任务慢…」→ bash sleep 15", async () => {
    expect(调了(await 问([{ role: "user", content: "子任务慢：跑一段慢的再回话" }]))).toEqual({ name: "bash", args: { command: "sleep 15" } })
  })
  it("拿到工具结果之后那一问不再调——不循环；「慢慢跑」那一支不受影响", async () => {
    const j = await 问([
      { role: "user", content: "子任务：读一下 README.md" },
      { role: "assistant", content: null, tool_calls: [{ id: "c", type: "function", function: { name: "read", arguments: "{}" } }] },
      { role: "tool", tool_call_id: "c", content: "# readme" },
    ])
    expect(j.choices[0]!.message.tool_calls).toBeUndefined()
    expect(调了(await 问([{ role: "user", content: "慢慢跑一下" }]))?.args).toEqual({ command: "sleep 20" })
  })
})
