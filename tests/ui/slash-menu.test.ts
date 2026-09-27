/** `/` 菜单的纯逻辑：子 agent 的两条路（2026-08-23 作者：「我现在好像没有把 agent 当作 skill 去做呢？」） */
import { describe, expect, it } from "vitest"
import { 斜杠选完, 筛斜杠, 按能压滤 } from "../../src/ui/slash-menu.js"

const 项 = [
  { kind: "skill" as const, name: "writing-skills", description: "写技能" },
  { kind: "subagent" as const, name: "bayesian-modeler", title: "贝叶斯建模员", description: "先验怎么定" },
]

describe("斜杠选完", () => {
  it("技能永远是 /skill:名；子 agent 缺省派出去", () => {
    expect(斜杠选完(项[0]!, "/wri")).toBe("/skill:writing-skills ")
    expect(斜杠选完(项[1]!, "/贝")).toBe("用子 agent「bayesian-modeler」来做：")
  })
  it("**打的是 /skill: 时，子 agent 也写成 /skill:名**——一份两用在这份菜单里露出来", () => {
    expect(斜杠选完(项[1]!, "/skill:bay")).toBe("/skill:bayesian-modeler ")
    expect(斜杠选完(项[1]!, "/SKILL:bay")).toBe("/skill:bayesian-modeler ")
  })
  it("/skill:名 能筛到子 agent", () => {
    expect(筛斜杠(项, "/skill:bayes").map((x) => x.name)).toEqual(["bayesian-modeler"])
  })
})

describe("/compact（2026-09-27）", () => {
  const 压 = { kind: "command" as const, name: "compact", title: "压缩上下文", description: "把早先的对话换成一段摘要" }
  it("选中写 `/compact `，不替人发", () => {
    expect(斜杠选完(压, "/com")).toBe("/compact ")
  })
  it("按名字筛得到", () => {
    expect(筛斜杠([压], "/comp")).toEqual([压])
  })
})

describe("按能压滤（2026-09-27）", () => {
  const 压 = { kind: "command" as const, name: "compact", title: "压缩上下文", description: "把早先的对话换成一段摘要" }
  const 别的 = { kind: "command" as const, name: "other", title: "别的指令", description: "与压缩无关" }
  const 技能 = { kind: "skill" as const, name: "bayesian-modeler", description: "贝叶斯" }
  it("能压：原样全列", () => {
    expect(按能压滤([压, 别的, 技能], true)).toEqual([压, 别的, 技能])
  })
  it("不能压：只拿掉 compact，别的指令照列", () => {
    expect(按能压滤([压, 别的, 技能], false)).toEqual([别的, 技能])
  })
})
