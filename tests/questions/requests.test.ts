import { afterEach, expect, it } from "vitest"
import { mkdtempSync, rmSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { QuestionRequests } from "../../src/questions/requests.js"
const dirs: string[] = []
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })))
const setup = () => { const dir = mkdtempSync(join(tmpdir(), "dawn-question-")); dirs.push(dir); return { dir, book: new QuestionRequests("s1", dir, () => {}) } }
const questions = [{ id: "scope", question: "分析范围？", options: [{ label: "全部" }, { label: "部分" }] }]
const answer = { answers: [{ id: "scope", selected: ["全部"] }] }
it("答案先落盘才解除等待；跨会话与伪造选项被拒，同答案重试幂等", async () => {
 const { book, dir } = setup(); const wait = book.ask("c1", questions)
 expect(book.get("c1")?.state).toBe("pending")
 expect(() => book.answer("s2", "c1", answer)).toThrow()
 expect(() => book.answer("s1", "c1", { answers: [{ id: "scope", selected: ["假的"] }] })).toThrow()
 book.answer("s1", "c1", answer)
 expect(JSON.parse(readFileSync(join(dir, "questions.json"), "utf8"))[0].state).toBe("answered")
 expect(await wait).toMatchObject({ state: "answered", answer })
 expect(() => book.answer("s1", "c1", answer)).not.toThrow()
 expect(() => book.answer("s1", "c1", { answers: [{ id: "scope", selected: ["部分"] }] })).toThrow()
})
it("停止结算一次；旧按钮不能回答；恢复遗留等待为中断", async () => {
 const { book, dir } = setup(); const abort = new AbortController(); const wait = book.ask("c2", questions, abort.signal)
 abort.abort(); expect((await wait).state).toBe("interrupted")
 expect(() => book.answer("s1", "c2", answer)).toThrow()
 void book.ask("c3", questions)
 const restored = new QuestionRequests("s1", dir, () => {})
 expect(restored.get("c3")?.state).toBe("interrupted")
 book.interrupt()
})
it("取消提问与中止回合不同；预先中止不会创建可答请求", async () => {
 const { book } = setup(); const wait = book.ask("c4", questions); book.answer("s1", "c4")
 expect((await wait).state).toBe("cancelled")
 const abort = new AbortController(); abort.abort()
 expect((await book.ask("c5", questions, abort.signal)).state).toBe("interrupted")
})
it("回答写盘失败仍可重试，不提前解除等待", async () => {
 const { book, dir } = setup(); const wait = book.ask("disk", questions)
 // Make the temporary destination a directory to force a real filesystem failure.
 const { mkdirSync } = await import("node:fs")
 mkdirSync(join(dir, "questions.json.tmp"))
 expect(() => book.answer("s1", "disk", answer)).toThrow()
 expect(book.get("disk")?.state).toBe("pending")
 rmSync(join(dir, "questions.json.tmp"), { recursive: true })
 book.answer("s1", "disk", answer)
 expect((await wait).state).toBe("answered")
})
