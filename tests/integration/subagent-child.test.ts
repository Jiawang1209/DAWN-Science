/**
 * 子 agent 进程的真链路（①-B″ · S1 第三片）。
 *
 * **这条跑的是构建产物**：`dist/electron/subagent-child.js`，
 * 由 `process.execPath` + `ELECTRON_RUN_AS_NODE=1` 起起来（Spike F 的结论），
 * 模型换成本仓库那个假推理服务器。
 *
 * 中间没有一处是假的，只有模型是确定的——这正是 `dev:mock` 的同一条纪律。
 *
 * ## 为什么值得单开一条
 *
 * `child-task.test.ts` 用假会话验的是边界行为，**证明不了子进程真能起来**。
 * 而这一片最可能坏的地方恰恰不在逻辑里：bundle 的 external 漏一个、
 * ESM 在 `ELECTRON_RUN_AS_NODE` 下不认、pi 在子进程里初始化失败——
 * 三样单元测试一个都碰不到，表现却都是「每个子 agent 都起不来」。
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { execFileSync, spawn } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { createRequire } from "node:module"
// @ts-expect-error -- .mjs 脚本无类型声明；它同时服务于 dev:mock 与 e2e
import { startMockInferenceServer, mockModelsJson, CANNED_REPLY } from "../../scripts/mock-inference-server.mjs"
import { CHILD_ENTRY, RUN_AS_NODE, type SubagentChildSpec } from "../../src/subagent/protocol.js"

const ROOT = resolve(import.meta.dirname, "../..")
const CHILD = join(ROOT, "dist", "electron", CHILD_ENTRY)
const electronPath = createRequire(import.meta.url)("electron") as string

/** 没构建就先构建。**不跳过**——静默跳过的集成测试等于没有 */
beforeAll(() => {
  if (!existsSync(CHILD)) {
    execFileSync("npm", ["run", "build:electron"], { cwd: ROOT, stdio: "pipe" })
  }
  expect(existsSync(CHILD), `${CHILD} 不存在，build:electron 没有产出子侧入口`).toBe(true)
}, 180_000)

let server: { url: string; close: () => Promise<void> }
let dir: string

beforeAll(async () => {
  server = await startMockInferenceServer()
  dir = mkdtempSync(join(tmpdir(), "dawn-child-"))
})

afterAll(async () => {
  await server?.close()
  if (dir) rmSync(dir, { recursive: true, force: true })
})

function specFor(over: Partial<SubagentChildSpec> = {}): SubagentChildSpec {
  const cwd = join(dir, "workspace")
  mkdirSync(cwd, { recursive: true })
  const modelsPath = join(dir, "models.json")
  writeFileSync(modelsPath, JSON.stringify(mockModelsJson(server.url), null, 2))
  return {
    agent: "scout",
    task: "说句话",
    systemPrompt: "你是踏勘员。",
    provider: "deepseek",
    model: "deepseek-v4-flash",
    cwd,
    agentDir: join(dir, `pi-${Math.round(performance.now() * 1000)}`),
    modelsPath,
    credentials: { deepseek: "mock-key-not-a-real-secret" },
    ...over,
  }
}

/** 起一个真的子进程，把规格从 stdin 递进去，收 stdout */
function runChild(spec: SubagentChildSpec): Promise<{ code: number | null; out: string; err: string }> {
  return new Promise((res) => {
    const child = spawn(electronPath, [CHILD], {
      env: { ...process.env, [RUN_AS_NODE]: "1" },
      stdio: ["pipe", "pipe", "pipe"],
    })
    let out = ""
    let err = ""
    child.stdout.setEncoding("utf8")
    child.stderr.setEncoding("utf8")
    child.stdout.on("data", (d: string) => (out += d))
    child.stderr.on("data", (d: string) => (err += d))
    child.on("close", (code) => res({ code, out, err }))
    child.stdin.on("error", () => {})
    child.stdin.end(JSON.stringify(spec))
  })
}

const lastDone = (out: string) =>
  out
    .split("\n")
    .filter((l) => l.trim().startsWith("{"))
    .map((l) => JSON.parse(l) as { type: string; ok: boolean; output?: string; error?: string })
    .findLast((v) => v.type === "done")

describe("真的起一个子 agent 进程", () => {
  it("**跑通整条**：构建产物 + Electron 当 node + 假模型 → 一条 done", async () => {
    const r = await runChild(specFor())
    const done = lastDone(r.out)
    expect(done, `没拿到 done。stdout=${r.out} stderr=${r.err}`).toBeDefined()
    expect(done!.ok, done!.error).toBe(true)
    // 假模型的暗号。它到了就说明**请求真的打出去过**，不是本地编的
    expect(done!.output).toContain(CANNED_REPLY.slice(0, 8))
  }, 120_000)

  it("退出码永远是 0 —— 成败由 done 行表达", async () => {
    const r = await runChild(specFor())
    expect(r.code).toBe(0)
  }, 120_000)

  it("**模型不存在时说清楚**，不退化到随便挑一个", async () => {
    const r = await runChild(specFor({ model: "并不存在的模型" }))
    const done = lastDone(r.out)
    expect(done?.ok).toBe(false)
    expect(done?.error).toContain("并不存在的模型")
    // 要列出有哪些可选，否则用户无从下手
    expect(done?.error).toContain("deepseek-v4")
  }, 120_000)

  it("规格不是 JSON —— 照样给一条 done，不是静静地死掉", async () => {
    const child = spawn(electronPath, [CHILD], {
      env: { ...process.env, [RUN_AS_NODE]: "1" },
      stdio: ["pipe", "pipe", "pipe"],
    })
    let out = ""
    child.stdout.setEncoding("utf8")
    child.stdout.on("data", (d: string) => (out += d))
    const code = await new Promise<number | null>((res) => {
      child.on("close", res)
      child.stdin.on("error", () => {})
      child.stdin.end("这不是 JSON")
    })
    expect(code).toBe(0)
    expect(lastDone(out)?.ok).toBe(false)
    expect(lastDone(out)?.error).toContain("读不懂")
  }, 120_000)
})
