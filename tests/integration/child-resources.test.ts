import { afterAll, beforeAll, expect, it } from "vitest"
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { createRequire } from "node:module"
import { SubagentExecutor } from "../../src/subagent/executor.js"
import { createResourceHost } from "../../src/subagent/resources.js"
import { MemoryStore, serializeEntries } from "../../src/memory/store.js"
import { 跑一轮 } from "../../src/team/runner.js"
// @ts-expect-error 共享推理服务器为 mjs
import { startMockInferenceServer, mockModelsJson } from "../../scripts/mock-inference-server.mjs"

const root = resolve(import.meta.dirname, "../.."), child = join(root, "dist/electron/subagent-child.js")
const electron = createRequire(import.meta.url)("electron") as string
let server: Awaited<ReturnType<typeof startMockInferenceServer>>, dir: string
beforeAll(async () => {
  if (!existsSync(child)) execFileSync("npm", ["run", "build:electron"], {cwd: root, stdio: "pipe"})
  server = await startMockInferenceServer(); dir = mkdtempSync(join(tmpdir(), "dawn-built-resources-"))
}, 180_000)
afterAll(async () => {await server?.close(); if (dir) rmSync(dir, {recursive: true, force: true})})
function setup(name: string) {
  const workspace = join(dir, name); mkdirSync(workspace)
  const skills = join(workspace, "skills"), skill = join(skills, "resource-fixture"); mkdirSync(skill, {recursive: true})
  writeFileSync(join(skill, "SKILL.md"), "---\nname: resource-fixture\ndescription: 资源测试技能\n---\nSKILL_BODY_PRIVATE：参数必须集中")
  const memories = join(workspace, "memories"); mkdirSync(memories)
  writeFileSync(join(memories, "MEMORY.md"), serializeEntries(["固定参数 MEMORY_BODY_PRIVATE：随机种子=42"]))
  const modelsPath = join(workspace, "models.json"); writeFileSync(modelsPath, JSON.stringify(mockModelsJson(server.url)))
  const context = {provider: "deepseek", model: "deepseek-flash", cwd: workspace, modelsPath, credentials: {deepseek: "offline-key"}, agentDirOf: (i: number) => join(workspace, `agent-${i}`),
    resources: () => createResourceHost({workspace, roots: [{path: skills, scope: "project"}], memory: {store: new MemoryStore(memories), enabled: true}})}
  const childOf = () => ({command: electron, args: [child], env: {ELECTRON_RUN_AS_NODE: "1"}})
  const definition = {name: "reader", description: "reader", systemPrompt: "读取所需技能与记忆。", filePath: "/fixture/reader.md", tools: ["read"]}
  return {workspace, memories, context, childOf, definition}
}
it("真实构建子进程按需查技能和记忆，正文只在工具结果出现，续问刷新资源", async () => {
  const s = setup("single"), events: {type: string; event?: {kind: string; toolName?: string; text?: string}}[] = []
  const ex = new SubagentExecutor({context: s.context, childOf: s.childOf, onProgress: p => events.push(p)})
  const start = server.requests.length
  const result = await ex.run({mode: "single", agent: "reader", task: "子资源验收：按需读取"}, [s.definition])
  expect(result.results[0]?.ok, result.results[0]?.error).toBe(true)
  expect(events.filter(p => p.type === "event" && p.event?.kind === "tool_start").map(p => p.event!.toolName)).toEqual(["resource_search", "resource_read", "resource_search", "resource_read"])
  const requests = server.requests.slice(start)
  expect(JSON.stringify(requests[0].body.messages)).not.toMatch(/SKILL_BODY_PRIVATE|MEMORY_BODY_PRIVATE/)
  expect(JSON.stringify(requests.at(-1).body.messages)).toContain("SKILL_BODY_PRIVATE")
  expect(JSON.stringify(requests.at(-1).body.messages)).toContain("MEMORY_BODY_PRIVATE")
  const names = requests[0].body.tools.map((t: {function: {name: string}}) => t.function.name)
  expect(names).toContain("resource_search"); expect(names).not.toContain("bash"); expect(names).not.toContain("subagent")
  writeFileSync(join(s.memories, "MEMORY.md"), serializeEntries(["固定参数 REFRESHED_MEMORY：随机种子=17"]))
  const next = server.requests.length
  expect((await ex.续问(0, "reader", "子资源验收：重新检查", [s.definition])).ok).toBe(true)
  const toolReplies = server.requests.slice(next).at(-1).body.messages.filter((m: {role: string}) => m.role === "tool").slice(-4)
  expect(JSON.stringify(toolReplies)).toContain("REFRESHED_MEMORY")
}, 120_000)
it("旧 Team 的真实子入口也能查询资源，成员工具保持可用", async () => {
  const s = setup("team"), start = server.requests.length
  const result = await 跑一轮({definition: s.definition, memberName: "甲", teamId: "fixture", prompt: "子资源验收：团队", systemPrompt: "按需查资源", sessionDir: join(s.workspace, "session"), agentDir: join(s.workspace, "agent"), resume: false},
    {context: s.context, childOf: s.childOf, onCall: async () => "团队状态", timeoutMs: 30_000})
  expect(result.ok, result.error).toBe(true)
  const requests = server.requests.slice(start)
  expect(JSON.stringify(requests.at(-1).body.messages)).toContain("MEMORY_BODY_PRIVATE")
  const names = requests[0].body.tools.map((t: {function: {name: string}}) => t.function.name)
  expect(names).toEqual(expect.arrayContaining(["resource_search", "resource_read", "team_send", "team_status"]))
}, 120_000)
