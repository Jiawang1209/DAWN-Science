/** `/` 菜单的纯逻辑：子 agent 的两条路（2026-08-23 作者：「我现在好像没有把 agent 当作 skill 去做呢？」） */
import { describe, expect, it } from "vitest"
import { 斜杠选完, 筛斜杠 } from "../../src/ui/slash-menu.js"

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
