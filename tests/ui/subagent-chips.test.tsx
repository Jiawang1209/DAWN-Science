/**
 * 子 agent 的 chip 组（①-B″ · S1 界面）。
 *
 * 形态来自计划 §6 记下的 Codex 桌面版组件 `subagent-activity-chip-group`：
 *
 * > **chip 组，不是树、也不是日志。** 一行紧凑的状态芯片，点开才展开细节。
 *
 * 它回答的是「N 个并发子 agent 怎么显示才不淹掉对话」。
 * 所以这份测试盯的主要是**克制**：默认一行、任务文本不铺开、
 * 失败原因不省略。
 */
import { describe, expect, it } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { SubagentChips } from "../../src/ui/views.js"
import type { TranscriptItem } from "../../src/protocol/index.js"

type Item = Extract<TranscriptItem, { type: "subagents" }>

const item = (agents: Item["agents"]): Item => ({ type: "subagents", id: "sub:c1", agents })

const RUNNING = { index: 0, agent: "scout", task: "踏勘代码库", status: "running" as const }
const OK = { index: 1, agent: "planner", task: "做计划", status: "ok" as const }
const ERR = {
  index: 2,
  agent: "worker",
  task: "干活",
  status: "error" as const,
  error: "子进程以退出码 3 结束",
}

describe("默认是一行紧凑的芯片", () => {
  it("每个子 agent 一个芯片，显示名字与状态", () => {
    render(<SubagentChips item={item([RUNNING, OK, ERR])} />)
    expect(screen.getAllByRole("button", { name: /scout|planner|worker/ })).toHaveLength(3)
    expect(screen.getByText(/scout/)).toBeDefined()
  })

  it("**默认不展开任务全文** —— 展开了就成了日志，正是要避开的那种", () => {
    render(<SubagentChips item={item([RUNNING])} />)
    expect(screen.queryByText("踏勘代码库")).toBeNull()
  })

  it("状态用 data 属性标出来，样式与断言都靠它", () => {
    const { container } = render(<SubagentChips item={item([RUNNING, OK, ERR])} />)
    const states = [...container.querySelectorAll("[data-status]")].map((n) =>
      n.getAttribute("data-status"),
    )
    expect(states).toEqual(["running", "ok", "error"])
  })

  it("**有几个在跑要能一眼看出来** —— 「2/3」这类概览", () => {
    render(<SubagentChips item={item([RUNNING, OK, ERR])} />)
    // 第一版这里写的是 `/3/`，撞上了失败原因里的「退出码 3」——
    // **一个匹配得太宽的断言，等于没断言它想断的那件事**
    expect(screen.getByText("子 agent 2/3")).toBeDefined()
  })

  it("**失败也算「跑完了」** —— 概览数的是「还在跑几个」，不是「成功几个」", () => {
    render(<SubagentChips item={item([RUNNING, ERR])} />)
    expect(screen.getByText("子 agent 1/2")).toBeDefined()
  })
})

describe("点开才展开细节", () => {
  it("点一个芯片，露出它的任务文本", () => {
    render(<SubagentChips item={item([RUNNING])} />)
    fireEvent.click(screen.getByRole("button", { name: /scout/ }))
    expect(screen.getByText("踏勘代码库")).toBeDefined()
  })

  it("再点一次收起来", () => {
    render(<SubagentChips item={item([RUNNING])} />)
    const chip = screen.getByRole("button", { name: /scout/ })
    fireEvent.click(chip)
    fireEvent.click(chip)
    expect(screen.queryByText("踏勘代码库")).toBeNull()
  })

  it("**aria-expanded 要跟着变** —— 屏幕阅读器靠它知道这是可展开的", () => {
    render(<SubagentChips item={item([RUNNING])} />)
    const chip = screen.getByRole("button", { name: /scout/ })
    expect(chip.getAttribute("aria-expanded")).toBe("false")
    fireEvent.click(chip)
    expect(chip.getAttribute("aria-expanded")).toBe("true")
  })
})

describe("失败必须出声（规格 7.5）", () => {
  it("**失败原因不折叠、不省略** —— 它是唯一的线索", () => {
    render(<SubagentChips item={item([ERR])} />)
    // 不用点开就看得见
    expect(screen.getByText(/退出码 3/)).toBeDefined()
  })

  it("失败了却没给原因，也要说出「没给原因」这件事", () => {
    render(<SubagentChips item={item([{ ...ERR, error: undefined }])} />)
    expect(screen.getByText(/没有给出原因/)).toBeDefined()
  })
})

describe("空表不渲染任何东西", () => {
  it("一个子 agent 都没有时是空的 —— 不留一个空壳占着位置", () => {
    const { container } = render(<SubagentChips item={item([])} />)
    expect(container.textContent).toBe("")
  })
})
