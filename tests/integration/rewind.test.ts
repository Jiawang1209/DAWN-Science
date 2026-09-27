/**
 * 回退这一轮的**真实链路**（2026-09-27，spec `2026-09-27-回退这一轮-design.md`）。
 * 真 pi、真 bash、真影子存档；只有模型是假的——走 mock 的「改两个文件」分支（dev:mock 里人点的也是它）。
 * 单元测试证不了的四件事，这里证：
 *   ① 包装层真的在 bash 执行**之前**拍了开头（不然退不回第一句之前）；
 *   ② `navigateTree` 真把对话退到那句之前、原文回 `editorText`，续接（`history()`）也看不到被撤的那句；
 *   ③ 只回退文件时给模型的那句话真的进了下一次请求；
 *   ④ 在跑时拒。
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { NativeRuntime } from "../../src/runtime/native.js"
import type { AgentEvent } from "../../src/runtime/types.js"
// @ts-expect-error -- .mjs 脚本，无类型声明；它同时服务于 npm run dev:mock
import { startMockInferenceServer, mockModelsJson } from "../../scripts/mock-inference-server.mjs"

let server: { url: string; requests: { body: { messages?: unknown[] } }[]; close: () => Promise<void> }
let dir: string
let modelsPath: string
beforeAll(async () => {
  server = await startMockInferenceServer()
  dir = mkdtempSync(join(tmpdir(), "dawn-rewind-"))
  modelsPath = join(dir, "models.json")
  writeFileSync(modelsPath, JSON.stringify(mockModelsJson(server.url), null, 2))
})
afterAll(async () => {
  await server?.close()
})

async function 起一段(名: string, 选项: { resume?: boolean; checkpoints?: boolean; compaction?: boolean } = {}) {
  const workspace = join(dir, 名)
  if (!选项.resume) {
    mkdirSync(workspace, { recursive: true })
    writeFileSync(join(workspace, "README.md"), "原样\n")
  }
  const runtime = new NativeRuntime({
    modelsPath,
    ...(选项.checkpoints === false ? { checkpoints: false } : {}),
    // pi 默认留最近 2 万 token，两三句话「没有可压缩的」——与 native-compaction.test.ts 同一个设法
    ...(选项.compaction ? { compaction: { keepRecentTokens: 1 } } : {}),
  })
  const sessionId = `s-${名}`
  const 事件: AgentEvent[] = []
  runtime.attach(sessionId, (e) => 事件.push(e))
  await runtime.start({
    sessionId,
    workspace,
    sessionDir: join(dir, `${名}-session`),
    native: { provider: "deepseek", model: "deepseek-flash" },
    ...(选项.resume ? { resume: true } : {}),
  })
  const 空闲了几次 = () => 事件.filter((e) => e.kind === "idle").length
  const 说完 = async (话: string) => {
    const 之前 = 空闲了几次()
    runtime.write(sessionId, 话)
    await vi.waitFor(() => expect(空闲了几次()).toBe(之前 + 1), { timeout: 20_000 })
  }
  const 读 = (p: string) => readFileSync(join(workspace, p), "utf8")
  return { runtime, sessionId, workspace, 事件, 说完, 读 }
}

describe("回退这一轮 · 真 pi", () => {
  it("两句之后回到第二句之前：文件与对话一起退，原文回来", { timeout: 60_000 }, async () => {
    const { runtime, sessionId, 说完, 读 } = await 起一段("both")
    try {
      await 说完("改两个文件")
      await 说完("再改两个文件")
      expect(读("out/图.txt")).toBe("x\nx\n")
      expect(读("README.md")).toBe("原样\n改过\n改过\n")

      const 预览 = await runtime.previewRewind(sessionId, { 倒数第几句: 1, 文: "再改两个文件" })
      expect(预览).toEqual({ ok: true, restore: ["README.md", "out/图.txt"], remove: [], keep: [], cannot: [] })

      const r = await runtime.rewind(sessionId, { 倒数第几句: 1, 文: "再改两个文件" }, "both", [])
      expect(r).toMatchObject({ restored: ["README.md", "out/图.txt"], editorText: "再改两个文件" })
      expect(读("out/图.txt")).toBe("x\n")
      expect(读("README.md")).toBe("原样\n改过\n")
      const 用户说过 = (await runtime.history(sessionId)).flatMap((x) => (x.kind === "text" && x.who === "user" ? [x.text] : []))
      expect(用户说过).toEqual(["改两个文件"])
    } finally {
      await runtime.stop(sessionId)
    }
  })

  it("只回退文件：回到第一句之前——新建的挪进 .dawn/trash，对话不动，下一次请求里有那句话", { timeout: 60_000 }, async () => {
    const { runtime, sessionId, workspace, 说完, 读 } = await 起一段("files")
    try {
      await 说完("改两个文件")
      await 说完("再改两个文件")
      const r = await runtime.rewind(sessionId, { 倒数第几句: 2, 文: "改两个文件" }, "files", [])
      expect(r.removed).toEqual(["out/图.txt"])
      expect(读("README.md")).toBe("原样\n")
      expect(existsSync(join(workspace, "out/图.txt"))).toBe(false)
      expect(readdirSync(join(workspace, ".dawn/trash")).some((d) => d.startsWith("rewind-"))).toBe(true)
      const 用户说过 = (await runtime.history(sessionId)).flatMap((x) => (x.kind === "text" && x.who === "user" ? [x.text] : []))
      expect(用户说过).toEqual(["改两个文件", "再改两个文件"])

      const 请求数 = server.requests.length
      await 说完("你好")
      const 这次 = JSON.stringify(server.requests.slice(请求数).map((q) => q.body.messages))
      expect(这次).toContain("rewound")
      expect(这次).toContain("out/图.txt")
    } finally {
      await runtime.stop(sessionId)
    }
  })

  it("在跑时拒：预览与回退都说「还在跑」", { timeout: 60_000 }, async () => {
    const { runtime, sessionId, 事件 } = await 起一段("busy")
    try {
      runtime.write(sessionId, "慢慢跑")
      await vi.waitFor(() => expect(事件.some((e) => e.kind === "tool_start")).toBe(true), { timeout: 20_000 })
      await expect(runtime.previewRewind(sessionId, { 倒数第几句: 1, 文: "慢慢跑" })).rejects.toThrow(/还在跑/)
      await expect(runtime.rewind(sessionId, { 倒数第几句: 1, 文: "慢慢跑" }, "both", [])).rejects.toThrow(/还在跑/)
    } finally {
      await runtime.abort(sessionId)
      await runtime.stop(sessionId)
    }
  })

  it("对不上就说对不上，不猜", { timeout: 60_000 }, async () => {
    const { runtime, sessionId, 说完 } = await 起一段("mismatch")
    try {
      await 说完("改两个文件")
      await expect(runtime.previewRewind(sessionId, { 倒数第几句: 1, 文: "不是这句" })).rejects.toThrow(/对不上/)
      await expect(runtime.previewRewind(sessionId, { 倒数第几句: 5, 文: "改两个文件" })).rejects.toThrow(/对不上/)
    } finally {
      await runtime.stop(sessionId)
    }
  })

  /**
   * 压缩之后回到压缩线之前那句（2026-09-27，与「上下文用量与压缩」交叉）。
   * 查实 pi：`navigateTree` 把叶子挪到那句的父条目，新分支的路径上**没有**那条 `compaction`，
   * `buildSessionContext()` 于是还原成那之前的原文（不是摘要）——对话能退，不必拒。这里证它真的退了、模型下一问读到的是原文。
   */
  it("压缩线之前那句也能回退：压缩标记跟着撤掉，下一问里是原文、不是摘要", { timeout: 60_000 }, async () => {
    const { runtime, sessionId, 说完, 读 } = await 起一段("compacted", { compaction: true })
    try {
      await 说完("改两个文件")
      await 说完("再改两个文件")
      runtime.compact(sessionId, undefined)
      await runtime.waitForIdle(sessionId)
      expect((await runtime.history(sessionId)).some((x) => x.kind === "compaction")).toBe(true)

      const r = await runtime.rewind(sessionId, { 倒数第几句: 1, 文: "再改两个文件" }, "both", [])
      expect(r.conversationError).toBeUndefined()
      expect(r.editorText).toBe("再改两个文件")
      expect(读("README.md")).toBe("原样\n改过\n")
      const 史 = await runtime.history(sessionId)
      expect(史.some((x) => x.kind === "compaction")).toBe(false)
      expect(史.flatMap((x) => (x.kind === "text" && x.who === "user" ? [x.text] : []))).toEqual(["改两个文件"])

      const 请求数 = server.requests.length
      await 说完("你好")
      const 这次 = JSON.stringify(server.requests.slice(请求数).map((q) => q.body.messages))
      expect(这次).toContain("改两个文件")
      expect(这次).not.toContain("假摘要")
    } finally {
      await runtime.stop(sessionId)
    }
  })

  it("续接之后：压缩过的前半截也在分支上，按倒数第几句仍对得上；存档跟着会话目录走，重启前那句照样退得回", { timeout: 60_000 }, async () => {
    const 一 = await 起一段("resumed", { compaction: true })
    await 一.说完("改两个文件")
    await 一.说完("再改两个文件")
    一.runtime.compact(一.sessionId, undefined)
    await 一.runtime.waitForIdle(一.sessionId)
    await 一.runtime.stop(一.sessionId)

    const { runtime, sessionId, 读 } = await 起一段("resumed", { resume: true, compaction: true })
    try {
      // 倒数第 2 句是第一句：续接后的分支从根数起，压缩线之前的那几句都在
      const 预览 = await runtime.previewRewind(sessionId, { 倒数第几句: 2, 文: "改两个文件" })
      expect(预览).toEqual({ ok: true, restore: ["README.md"], remove: ["out/图.txt"], keep: [], cannot: [] })
      const r = await runtime.rewind(sessionId, { 倒数第几句: 2, 文: "改两个文件" }, "both", [])
      expect(r.editorText).toBe("改两个文件")
      expect(读("README.md")).toBe("原样\n")
      expect((await runtime.history(sessionId)).filter((x) => x.kind === "text" && x.who === "user")).toEqual([])
    } finally {
      await runtime.stop(sessionId)
    }
  })

  it("存档开始之前的那几句：文件退不了（before_archive），只撤对话仍可以", { timeout: 60_000 }, async () => {
    const 一 = await 起一段("pre-archive", { checkpoints: false })
    await 一.说完("改两个文件")
    await 一.runtime.stop(一.sessionId)

    const { runtime, sessionId, 说完, 读 } = await 起一段("pre-archive", { resume: true })
    try {
      await 说完("再改两个文件")
      expect(await runtime.previewRewind(sessionId, { 倒数第几句: 2, 文: "改两个文件" })).toEqual({ ok: false, reason: "before_archive" })
      await expect(runtime.rewind(sessionId, { 倒数第几句: 2, 文: "改两个文件" }, "files", [])).rejects.toMatchObject({ reason: "before_archive" })
      // 存档开始之后那句照常
      expect(await runtime.previewRewind(sessionId, { 倒数第几句: 1, 文: "再改两个文件" })).toMatchObject({ ok: true, restore: ["README.md", "out/图.txt"] })
      const r = await runtime.rewind(sessionId, { 倒数第几句: 2, 文: "改两个文件" }, "conversation", [])
      expect(r.editorText).toBe("改两个文件")
      expect(读("README.md")).toBe("原样\n改过\n改过\n")
    } finally {
      await runtime.stop(sessionId)
    }
  })
})
