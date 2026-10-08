import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { expect, it, vi } from "vitest"
import { QuestionCard } from "../../src/ui/question-card.js"
const record = { requestId: "c1", state: "pending" as const, questions: [
 { id: "q1", question: "范围？", options: [{ label: "全部", description: "保留所有样本" }] },
 { id: "q2", question: "指标？", multi_select: true, options: [{ label: "多样性" }, { label: "丰度" }] },
 { id: "q3", question: "备注？" },
] }
it("左右导航只浏览题目，右侧只有跳过与下一题；浏览未答题不算跳过", () => {
 const answer = vi.fn()
 const { container } = render(<QuestionCard sessionId="nav" record={record} onAnswer={answer} />)
 expect(container.querySelector(".question-primary-actions")?.textContent).toBe("跳过下一题")
 fireEvent.click(screen.getByRole("button", { name: "后一题" }))
 expect(screen.getByRole("heading").textContent).toBe("指标？")
 fireEvent.click(screen.getByRole("button", { name: "上一题" }))
 expect(screen.getByRole("heading").textContent).toBe("范围？")
 expect(answer).not.toHaveBeenCalled()
 expect((screen.getByRole("button", { name: "下一题" }) as HTMLButtonElement).disabled).toBe(true)
})
it("逐题选择与自由输入、明确跳过后整批提交", async () => {
 const answer = vi.fn().mockResolvedValue(undefined)
 render(<QuestionCard sessionId="ui1" record={record} onAnswer={answer} />)
 fireEvent.click(screen.getByRole("radio", { name: /全部/ }))
 fireEvent.click(screen.getByRole("button", { name: "下一题" }))
 fireEvent.click(screen.getByRole("checkbox", { name: "多样性" }))
 fireEvent.change(screen.getByRole("textbox", { name: "输入你的答案" }), { target: { value: "加上均匀度" } })
 fireEvent.click(screen.getByRole("button", { name: "下一题" }))
 fireEvent.click(screen.getByRole("button", { name: "跳过" }))
 await waitFor(() => expect(answer).toHaveBeenCalledWith({ answers: [
 { id: "q1", selected: ["全部"] }, { id: "q2", selected: ["多样性"], custom: "加上均匀度" }, { id: "q3", selected: [] },
 ] }))
})
it("未回答不能前进，提交失败保持答案可重试，收起不是取消", async () => {
 const answer = vi.fn().mockRejectedValueOnce(new Error("连接断开")).mockResolvedValue(undefined)
 render(<QuestionCard sessionId="ui2" record={{ ...record, questions: [record.questions[0]!] }} onAnswer={answer} />)
 expect((screen.getByRole("button", { name: "提交答案" }) as HTMLButtonElement).disabled).toBe(true)
 fireEvent.click(screen.getByRole("button", { name: "收起提问" }))
 expect(answer).not.toHaveBeenCalled()
 fireEvent.click(screen.getByRole("button", { name: "展开提问" }))
 fireEvent.change(screen.getByRole("textbox", { name: "输入你的答案" }), { target: { value: "仅健康组" } })
 fireEvent.click(screen.getByRole("button", { name: "提交答案" }))
 await screen.findByText("连接断开")
 expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("仅健康组")
 fireEvent.click(screen.getByRole("button", { name: "提交答案" }))
 await waitFor(() => expect(answer).toHaveBeenCalledTimes(2))
})
it("会话重挂载保留草稿，另一会话不继承；组词与修饰回车不提交", async () => {
 const one = { ...record, requestId: "draft", questions: [record.questions[0]!] }
 const answer = vi.fn().mockResolvedValue(undefined)
 const first = render(<QuestionCard sessionId="draftA" record={one} onAnswer={answer} />)
 fireEvent.change(screen.getByRole("textbox"), { target: { value: "自定义范围" } })
 fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter", isComposing: true })
 fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter", ctrlKey: true })
 expect(answer).not.toHaveBeenCalled()
 first.unmount()
 const second = render(<QuestionCard sessionId="draftB" record={one} onAnswer={answer} />)
 expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("")
 second.unmount()
 render(<QuestionCard sessionId="draftA" record={one} onAnswer={answer} />)
 expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("自定义范围")
 fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" })
 await waitFor(() => expect(answer).toHaveBeenCalledTimes(1))
})
