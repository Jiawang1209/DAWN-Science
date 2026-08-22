/**
 * 团队状态机（team-board，2026-08-22，学自 dsh-agent-teams）。
 * 这里压的是它最值钱的那层：依赖、领取、attempt 令牌、迟到的结果被拒、终态不可覆盖。
 */
import { describe, expect, it } from "vitest"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  建团队, 加成员, 加任务, 领取, 开始做, 结算, 转派, 取消任务, 挑就绪任务, 未满足的依赖, 死掉的依赖,
  发消息, 未送达的消息, 标记送达, 移除成员, 结束团队, 全部终态, 统计, 代入上游, 读团队, 写团队, 团队目录, 团队错误,
} from "../../src/team/state.js"
import { 团队上限 } from "../../src/team/types.js"

const 一支 = () => {
  const team = 建团队({ name: "审稿", goal: "审一篇稿", captainSessionId: "s1", now: 1000 })
  加成员(team, { name: "甲", agent: "data-scientist" })
  加成员(team, { name: "乙", agent: "statistician", role: "方法审查" })
  return team
}

describe("成员与任务的建立", () => {
  it("成员名要合规、不许重名、不许叫 captain、有上限", () => {
    const team = 建团队({ name: "x", goal: "g", captainSessionId: "s" })
    加成员(team, { name: "甲", agent: "a" })
    expect(() => 加成员(team, { name: "甲", agent: "a" })).toThrow(/已经有一个叫/)
    expect(() => 加成员(team, { name: "captain", agent: "a" })).toThrow(/队长的名字/)
    expect(() => 加成员(team, { name: "a b", agent: "a" })).toThrow(/不合规/)
    for (let i = 1; i < 团队上限.maxMembers; i++) 加成员(team, { name: `m${i}`, agent: "a" })
    expect(() => 加成员(team, { name: "溢出", agent: "a" })).toThrow(/最多/)
  })
  it("成员可以带自己的模型（provider + model 成对才记）；不带就不记——缺省跟队长", () => {
    const team = 建团队({ name: "x", goal: "g", captainSessionId: "s" })
    const a = 加成员(team, { name: "甲", agent: "a", provider: "deepseek", model: "deepseek-v4-deep" })
    expect([a.provider, a.model]).toEqual(["deepseek", "deepseek-v4-deep"])
    const b = 加成员(team, { name: "乙", agent: "a" })
    expect(b.provider).toBeUndefined()
    expect(b.model).toBeUndefined()
    const c = 加成员(team, { name: "丙", agent: "a", model: "只有一半" })
    expect(c.model).toBeUndefined()
  })
  it("任务 id 自动递增；依赖只能指向已建的任务；不能依赖自己；指派给不存在的人要报", () => {
    const team = 一支()
    const t1 = 加任务(team, { subject: "取数" })
    expect(t1.id).toBe("t1")
    const t2 = 加任务(team, { subject: "清洗", dependencies: ["t1"] })
    expect(t2.dependencies).toEqual(["t1"])
    expect(() => 加任务(team, { subject: "x", dependencies: ["t9"] })).toThrow(/不存在/)
    expect(() => 加任务(team, { id: "t5", subject: "x", dependencies: ["t5"] })).toThrow(/依赖自己/)
    expect(() => 加任务(team, { subject: "x", assignee: "丙" })).toThrow(/不存在的成员/)
    expect(() => 加任务(team, { id: "t1", subject: "x" })).toThrow(/已经有一个 id/)
  })
})

describe("依赖与领取", () => {
  it("依赖没全完成的不能领；完成了就绪；failed 的依赖下游永远等不到", () => {
    const team = 一支()
    加任务(team, { subject: "取数", assignee: "甲" })
    加任务(team, { subject: "分析", dependencies: ["t1"], assignee: "乙" })
    expect(挑就绪任务(team, "乙")).toBeUndefined()
    expect(() => 领取(team, "t2", "乙")).toThrow(/依赖还没完成/)
    const { attemptId } = 领取(team, "t1", "甲")
    结算(team, "t1", attemptId, { ok: false, output: "挂了" })
    expect(死掉的依赖(team, team.tasks[1]!)).toEqual(["t1"])
    expect(未满足的依赖(team, team.tasks[1]!)).toEqual(["t1"])
  })
  it("先领自己名下的，再领共享池的；一个成员同时只能持有一个未完成任务", () => {
    const team = 一支()
    加任务(team, { subject: "池子里的" })
    加任务(team, { subject: "甲的", assignee: "甲" })
    expect(挑就绪任务(team, "甲")!.id).toBe("t2")
    expect(挑就绪任务(team, "乙")!.id).toBe("t1")
    expect(() => 领取(team, "nope", "甲")).toThrow(/没有任务/)
  })
  it("指派给别人的任务，别人领不了；队长可以领任何就绪任务", () => {
    const team = 一支()
    加任务(team, { subject: "甲的", assignee: "甲" })
    expect(() => 领取(team, "t1", "乙")).toThrow(/不能领/)
    const r = 领取(team, "t1", "甲")
    expect(team.tasks[0]!.status).toBe("claimed")
    expect(team.tasks[0]!.attempt).toBe(1)
    expect(r.attemptId).toHaveLength(36)
    加任务(team, { subject: "池" })
    领取(team, "t2", "captain")
    expect(team.tasks[1]!.assignee).toBe("captain")
  })
  it("手上有没做完的活，不能再领第二个", () => {
    const team = 一支()
    加任务(team, { subject: "a" })
    加任务(team, { subject: "b" })
    领取(team, "t1", "甲")
    expect(() => 领取(team, "t2", "甲")).toThrow(/不能同时领两个/)
    expect(挑就绪任务(team, "甲")).toBeUndefined()
  })
})

describe("attempt 令牌：迟到的结果被拒", () => {
  it("结算要出示当前令牌；转派之后旧令牌作废，旧成员的结果被拒，新成员的被收", () => {
    const team = 一支()
    加任务(team, { subject: "a" })
    const 旧 = 领取(team, "t1", "甲").attemptId
    开始做(team, "t1", 旧)
    expect(team.tasks[0]!.status).toBe("in_progress")
    // 队长转派给乙
    转派(team, "t1", "乙")
    expect(team.tasks[0]!.status).toBe("pending")
    expect(team.tasks[0]!.attemptId).toBeUndefined()
    const 新 = 领取(team, "t1", "乙").attemptId
    expect(team.tasks[0]!.attempt).toBe(2)
    // 甲迟到了
    expect(() => 结算(team, "t1", 旧, { ok: true, output: "甲做完了" })).toThrow(/令牌对不上/)
    expect(team.tasks[0]!.status).toBe("claimed")
    结算(team, "t1", 新, { ok: true, output: "乙做完了" })
    expect(team.tasks[0]!.output).toBe("乙做完了")
    // 终态不可覆盖——哪怕拿着对的令牌
    expect(() => 结算(team, "t1", 新, { ok: false, output: "再改" })).toThrow(/终态/)
    expect(() => 转派(team, "t1", "甲")).toThrow(/终态/)
  })
  it("队长接管 = 转派给 captain；取消 = cancelled 且令牌作废", () => {
    const team = 一支()
    加任务(team, { subject: "a" })
    const 旧 = 领取(team, "t1", "甲").attemptId
    转派(team, "t1", "captain")
    expect(team.tasks[0]!.assignee).toBe("captain")
    const 令 = 领取(team, "t1", "captain").attemptId
    expect(() => 结算(team, "t1", 旧, { ok: true, output: "x" })).toThrow(/令牌/)
    结算(team, "t1", 令, { ok: true, output: "队长做的" })
    加任务(team, { subject: "b" })
    const 令2 = 领取(team, "t2", "甲").attemptId
    取消任务(team, "t2")
    expect(() => 结算(team, "t2", 令2, { ok: true, output: "x" })).toThrow(/终态/)
  })
  it("移除成员：它手上的活回到共享池并作废令牌；它名下没领的也回池", () => {
    const team = 一支()
    加任务(team, { subject: "a", assignee: "甲" })
    加任务(team, { subject: "b", assignee: "甲" })
    const 旧 = 领取(team, "t1", "甲").attemptId
    移除成员(team, "甲")
    expect(team.tasks[0]!.status).toBe("pending")
    expect(team.tasks[0]!.assignee).toBeUndefined()
    expect(team.tasks[1]!.assignee).toBeUndefined()
    expect(() => 结算(team, "t1", 旧, { ok: true, output: "x" })).toThrow(/令牌/)
    expect(挑就绪任务(team, "乙")!.id).toBe("t1")
  })
})

describe("消息、上游代入、结束、落盘", () => {
  it("消息只能发给在队的人；未送达的能按收件人取；标记送达后不再出现", () => {
    const team = 一支()
    expect(() => 发消息(team, { from: "captain", to: "丙", content: "x" })).toThrow(/没有叫/)
    expect(() => 发消息(team, { from: "丙", to: "甲", content: "x" })).toThrow(/不是这支团队/)
    expect(() => 发消息(team, { from: "甲", to: "乙", content: "  " })).toThrow(/空的/)
    const m = 发消息(team, { from: "甲", to: "乙", content: "字段叫 age 不是 Age" })
    expect(未送达的消息(team, "乙").map((x) => x.id)).toEqual([m.id])
    标记送达(team, [m.id])
    expect(未送达的消息(team, "乙")).toEqual([])
  })
  it("代入上游：{t1} 换成 t1 的输出；没完成的留原样并出声", () => {
    const team = 一支()
    加任务(team, { subject: "a" })
    加任务(team, { subject: "b" })
    const 令 = 领取(team, "t1", "甲").attemptId
    结算(team, "t1", 令, { ok: true, output: "上游结论" })
    const r = 代入上游(team, "基于 {t1} 做 {t2}，另外 {不存在}")
    expect(r.text).toBe("基于 上游结论 做 {t2}，另外 {不存在}")
    expect(r.missing).toEqual(["t2"])
  })
  it("结束团队：开放任务全 cancelled、成员 removed、记 finishedAt；统计与全部终态", () => {
    const team = 一支()
    加任务(team, { subject: "a" })
    加任务(team, { subject: "b" })
    const 令 = 领取(team, "t1", "甲").attemptId
    结算(team, "t1", 令, { ok: true, output: "x" })
    expect(全部终态(team)).toBe(false)
    结束团队(team, 5000)
    expect(全部终态(team)).toBe(true)
    expect(统计(team)).toMatchObject({ completed: 1, cancelled: 1 })
    expect(team.finishedAt).toBe(5000)
    expect(team.members.every((m) => m.status === "removed")).toBe(true)
  })
  it("落盘是原子的，读回来一模一样；目录里没有就是 undefined", () => {
    const root = mkdtempSync(join(tmpdir(), "dawn-team-"))
    const dir = 团队目录(root, "team-1")
    expect(读团队(dir)).toBeUndefined()
    const team = 一支()
    加任务(team, { subject: "a" })
    写团队(dir, team)
    expect(读团队(dir)).toEqual(team)
  })
  it("团队错误是自己的类，工具层据此把它当「模型的错」回给模型而不是崩", () => {
    const team = 一支()
    try {
      领取(team, "nope", "甲")
    } catch (e) {
      expect(e).toBeInstanceOf(团队错误)
    }
  })
})
