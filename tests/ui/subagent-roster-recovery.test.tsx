import { act, render, screen, waitFor } from "@testing-library/react"
import { expect, it } from "vitest"
import { SubagentsView, type SkillLoad } from "../../src/ui/skills.js"

const roster: SkillLoad = {
  agents: [{ name: "stat-consultant", description: "统计顾问", filePath: "/builtin/stat-consultant.md", from: "builtin", disabled: false, mutable: false }],
  problems: [], dir: "", dirs: { builtin: "/builtin" },
}

it("缺失项目报错后切换作用域，子 Agent 名册可恢复且清除旧错误", async () => {
  const failed = async (): Promise<SkillLoad> => { throw new Error("没有这个项目：removed-project") }
  const view = render(<SubagentsView load={failed} />)
  await screen.findByText("没有这个项目：removed-project")
  view.rerender(<SubagentsView load={async () => roster} />)
  await screen.findByText("stat-consultant")
  expect(screen.queryByText("读不到子 agent")).toBeNull()
})

it("切换作用域时清空旧名册，不显示上一个项目的定义", async () => {
  const view = render(<SubagentsView load={async () => roster} />)
  await screen.findByText("stat-consultant")
  let resolve!: (value: SkillLoad) => void
  view.rerender(<SubagentsView load={() => new Promise<SkillLoad>(r => { resolve = r })} />)
  expect(screen.queryByText("stat-consultant")).toBeNull()
  await act(async () => { resolve({ ...roster, agents: [] }) })
  await waitFor(() => expect(screen.queryByText("正在读子 agent")).toBeNull())
})
