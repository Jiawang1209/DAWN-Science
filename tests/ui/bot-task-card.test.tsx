import { expect, it, vi } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { BotTaskCard } from "../../src/ui/bot-task-card.js"
it("routes view stop and supplements to the exact task and retains failed supplement", async () => {
  const onView = vi.fn(), onStop = vi.fn(async () => {}), onMessage = vi.fn(async () => { throw Error("离线") })
  render(<BotTaskCard name="统计助手" role="统计" subject="检查模型" status="in_progress" onView={onView} onStop={onStop} onMessage={onMessage} />)
  fireEvent.click(screen.getByRole("button", { name: "打开任务：检查模型" }))
  expect(onView).toHaveBeenCalledOnce()
  fireEvent.click(screen.getByRole("button", { name: "停止" }))
  expect(onStop).toHaveBeenCalledOnce()
  await waitFor(() => expect((screen.getByRole("button", { name: "停止" }) as HTMLButtonElement).disabled).toBe(false))
  fireEvent.click(screen.getByRole("button", { name: "补充要求" }))
  fireEvent.change(screen.getByLabelText("补充要求"), { target: { value: "检查残差" } })
  fireEvent.click(screen.getByRole("button", { name: "提交补充" }))
  await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("离线"))
  expect((screen.getByLabelText("补充要求") as HTMLTextAreaElement).value).toBe("检查残差")
})

it("pending member questions remain visible with the correct navigation entry", () => {
  render(<BotTaskCard name="数据助手" role="数据" subject="检查" status="in_progress" attention="question" onView={vi.fn()} onStop={vi.fn(async () => {})} onMessage={vi.fn(async () => {})} />)
  expect(screen.getByText("待回答")).toBeTruthy()
  expect(screen.getByRole("button", { name: "打开任务：检查" })).toBeTruthy()
})

it("verified artifacts use compact filenames and open the exact backend path", () => {
  const onOpenFile = vi.fn()
  render(<BotTaskCard name="统计助手" role="统计" subject="检查模型" status="completed"
    artifacts={["/workspace/scripts/model.py", "/workspace/results/model.csv"]} onOpenFile={onOpenFile}
    onView={vi.fn()} onStop={vi.fn(async () => {})} onMessage={vi.fn(async () => {})} />)
  const file = screen.getByRole("button", { name: "查看产物：model.py" })
  expect(file.textContent).toBe("model.py")
  fireEvent.click(file)
  expect(onOpenFile).toHaveBeenCalledWith("/workspace/scripts/model.py")
})
