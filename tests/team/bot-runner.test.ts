import { expect, it } from "vitest"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { 团队调度器 } from "../../src/team/scheduler.js"
import { 建团队, 加成员, 加任务, 写团队 } from "../../src/team/state.js"
it("Bot 成员走注入执行器，保留依赖与结算令牌", async () => {
  const dir = mkdtempSync(join(tmpdir(), "dawn-bot-scheduler-"))
  const calls: string[] = []
  const scheduler = new 团队调度器({ sessionDir: dir, 定义: () => [],
    跑: { childOf: () => { throw new Error("Bot 不应启动旧子进程") }, context: { cwd: dir, provider: "p", model: "m" } },
    onChange: () => {},
    memberRunner: async (req: { member: { name: string }; prompt: string; onSession: (id: string) => void }) => {
      calls.push(req.member.name); req.onSession("native-" + req.member.name)
      return { ok: true, output: "真实结果 " + req.member.name }
    },
  } as ConstructorParameters<typeof 团队调度器>[0])
  try {
    const team = 建团队({ name: "Bot Team", goal: "分析", captainSessionId: "main" })
    const a = 加成员(team, { name: "统计", agent: "bot-a" }); Object.assign(a, { botId: "a" })
    const b = 加成员(team, { name: "绘图", agent: "bot-b" }); Object.assign(b, { botId: "b" })
    加任务(team, { id: "t1", subject: "建模", assignee: "统计" })
    加任务(team, { id: "t2", subject: "画图", assignee: "绘图", dependencies: ["t1"] })
    写团队(scheduler.dir(team.id), team)
    await scheduler.踢一下(team.id)
    for (let i = 0; i < 100 && scheduler.读(team.id).tasks.some(t => t.status !== "completed"); i++) await new Promise(r => setTimeout(r, 5))
    expect(calls).toEqual(["统计", "绘图"])
    expect(scheduler.读(team.id).tasks.map(t => t.status)).toEqual(["completed", "completed"])
    expect(scheduler.读(team.id).members[0]).toMatchObject({ sessionId: "native-统计", botId: "a" })
  } finally { rmSync(dir,{recursive:true,force:true}) }
})
