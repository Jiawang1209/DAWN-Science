/**
 * 工具调用的**真实链路**（Task 3.1 · R5 验收）。
 *
 * 单元测试证明的是「给了 ToolItem，界面画得对」。它证明不了
 * **「真的会有 ToolItem 送到界面」**——而后者正是本项目已经栽过五次的地方：
 * 内部模型完整、用户可见的那一端没人接。
 *
 * 这里跑的是真东西：真的 `ModelRuntime`、真的 pi agent loop、真的工具执行、
 * 真的 `SessionTranscripts`。**只有模型回复是确定的**——由本地假推理服务器给出。
 *
 * 同时它兑现了 `scripts/mock-inference-server.mjs` 文件头写下的那条纪律：
 * **该模块同时供 `dev:mock` 与测试使用**。两套 mock 会各自漂移，
 * 那时「本地是好的」就不再意味着什么（Hermes 明确写下的理由）。
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { NativeRuntime } from "../../src/runtime/native.js"
import { SessionTranscripts } from "../../src/workbench/events.js"
import type { TranscriptItem } from "../../src/protocol/index.js"
// @ts-expect-error -- .mjs 脚本，无类型声明；它同时服务于 npm run dev:mock
import { startMockInferenceServer, mockModelsJson } from "../../scripts/mock-inference-server.mjs"

const TOOL_NAME = "bash"
const MARKER = "DAWN-TOOL-CHAIN-OK"

let server: { url: string; requests: unknown[]; close: () => Promise<void> }
let dir: string
let workspace: string
let modelsPath: string
/** 只在第一次模型调用时要求工具——否则 pi 会拿到工具结果后再问，无限循环 */
let modelCalls = 0

beforeAll(async () => {
  server = await startMockInferenceServer({
    toolCall: () =>
      modelCalls++ === 0 ? { toolName: TOOL_NAME, args: { command: `echo ${MARKER}` } } : undefined,
  })
  dir = mkdtempSync(join(tmpdir(), "dawn-toolchain-"))
  workspace = join(dir, "workspace")
  mkdirSync(workspace, { recursive: true })
  writeFileSync(join(workspace, "README.md"), "# 用于工具链路测试的工作区\n")
  modelsPath = join(dir, "models.json")
  writeFileSync(modelsPath, JSON.stringify(mockModelsJson(server.url), null, 2))
})

afterAll(async () => {
  await server?.close()
})

const toolItems = (items: TranscriptItem[]) => items.filter((i) => i.type === "tool")

describe("R5 · 工具调用真的会走到 transcript", () => {
  it("假模型发起一次工具调用 → 真的被执行 → 以 ToolItem 出现在快照里", { timeout: 60_000 }, async () => {
      const runtime = new NativeRuntime({ modelsPath })
      const transcripts = new SessionTranscripts({ terminalMaxChars: 10_000 })
      const sessionId = "s-toolchain"

      transcripts.track(sessionId, "native")
      runtime.attach(sessionId, (e) => transcripts.ingest(sessionId, e))

      await runtime.start({
        sessionId,
        workspace,
        sessionDir: join(dir, "session"),
        native: { provider: "deepseek", model: "deepseek-v4-flash" },
      })

      transcripts.userTurn(sessionId, "跑一下那条命令")
      runtime.write(sessionId, "跑一下那条命令")
      await runtime.waitForIdle(sessionId)

      // ⓪ **先证明这条测试不是空转通过的。** 模型必须真的被调用过两次：
      //    第一次拿到工具调用，第二次拿到工具结果之后的收尾回复。
      //    没有这一条，一个什么都不做的实现也可能让下面的断言「碰巧」不被执行到。
      expect(server.requests.length).toBeGreaterThanOrEqual(2)

      const snapshot = transcripts.subscribe(sessionId)
      const tools = toolItems(snapshot.items)

      // ① 工具调用必须到达 transcript。到不了 = 界面上永远看不见 agent 在干什么
      expect(tools.length).toBeGreaterThan(0)

      const call = tools[0]!
      expect(call.type).toBe("tool")
      if (call.type !== "tool") throw new Error("类型收窄失败")

      // ② 名字要对得上模型点的那个
      expect(call.name).toBe(TOOL_NAME)

      // ③ **必须走到终态。** 卡在 running 等于界面上一个永远转不完的圈——
      //    Hermes：重试要有界且以真实恢复动作收尾，never an infinite spinner
      expect(call.status).not.toBe("running")

      // ④ 有结果正文。没有正文的成功和没有原因的失败都是静默
      expect(typeof call.result).toBe("string")
      expect((call.result ?? "").length).toBeGreaterThan(0)

      // ⑤ 真的执行了：命令的输出应当出现在结果里
      if (call.status === "ok") expect(call.result).toContain(MARKER)

    await runtime.stop(sessionId)
    transcripts.dispose()
  })
})
