import { test, expect, 在项目里开会话, 等进了对话 } from "./fixtures.js"

// This checks the actual Electron -> runtime -> inference request, not model reasoning.
// The shared mock returns fixed responses and cannot prove reduced real-model tool use.
test("执行意图指引进入真实推理请求，咨询仍可正常回答且工具没有被移除", async ({ dawn }) => {
 const { page, requests } = dawn
 await 在项目里开会话(page); await 等进了对话(page)
 const main = page.locator("main.main")
 const input = main.getByPlaceholder(/今天帮你做些什么/)
 await input.fill("请解释 PCA 和 PCoA 的区别，先讨论，不运行代码")
 await input.press("Enter")
 await expect(main.locator(".turn.agent").last()).toContainText("假模型已应答", { timeout: 30000 })
 type Body = { messages?: { role: string; content?: unknown }[]; tools?: { function?: { name?: string; description?: string } }[] }
 const calls = (requests as { body: Body }[]).map((r) => r.body)
 const request = calls.findLast((r) => r.messages?.some((m) => m.role === "user" && JSON.stringify(m.content).includes("PCA 和 PCoA")))!
 expect(request).toBeDefined()
 const system = request.messages!.filter((m) => m.role === "system").map((m) => JSON.stringify(m.content)).join("\n")
 expect(system).toContain("不要自动运行代码")
 expect(system).toContain("明确要求计算")
 expect(system).toContain("已授权任务")
 expect(system).toContain("ask_user_question")
 expect(system).toContain("生成脚本不等于授权运行脚本")
 const tool = request.tools?.find((t) => t.function?.name === "run_code")
 expect(tool?.function?.description).toContain("咨询或讨论方案不调用本工具")
 expect(request.tools?.some((t) => t.function?.name === "ask_user_question")).toBe(true)
 await expect(main.locator(".question-card")).toHaveCount(0)
 console.log("[intent-check] 实际推理请求中的执行意图规则、工具说明与工具可用性断言全部通过")
})
