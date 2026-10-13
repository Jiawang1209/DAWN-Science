import { expect, it } from "vitest"
import { mkdtempSync, rmSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { 团队调度器 } from "../../src/team/scheduler.js"
import { createTeamTools } from "../../src/team/tools.js"
it("队长按 botId 组队并冻结专业指令，不要求伪造子 agent", async () => {
  const dir = mkdtempSync(join(tmpdir(), "dawn-bot-tools-")); let current: string | undefined
  try {
    const scheduler = new 团队调度器({ sessionDir: dir, 定义: () => [], 跑: { childOf: () => { throw new Error("unused") }, context: { cwd: dir, provider: "p", model: "m" } }, onChange: () => {} })
    const tools = createTeamTools({ sessionId: "main", 已知模型: async () => [{provider: "p", model: "m"}], 调度器: scheduler, 定义: () => [], 当前: { get: () => current, set: id => { current = id } }, resolveBot: (id: string) => id === "stat" ? { id, name: "统计助手", role: "统计", instructions: "先诊断再建模", enabled: true, model: { provider: "p", model: "m" } } : undefined } as Parameters<typeof createTeamTools>[0])
    const result = await tools.find(t => t.name === "team_create")!.execute("call", { name: "科研", goal: "分析", members: [{ name: "统计", botId: "stat" }] } as never)
    expect(result.isError).toBeFalsy()
    expect(current).toBeDefined()
    expect(scheduler.读(current!).members[0]).toMatchObject({ botId: "stat", botInstructions: expect.stringContaining("先诊断再建模"), provider: "p", model: "m" })
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
