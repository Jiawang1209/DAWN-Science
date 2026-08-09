/**
 * 工具输出的双份处理（①-B″ · R2）。
 *
 * **这是修一个正在生效的缺陷，不是加功能。**
 *
 * ```ts
 * // src/runtime/native.ts:244（修复前）
 * text: content.map(c => c.text ?? "").join("").slice(0, RESULT_PREVIEW_CHARS)  // 2000
 * ```
 *
 * runtime 层硬砍 2000 字符，**不出声、不留路径**。它违反规格 7.5，
 * 而且与 Task 3.1 自相矛盾——**界面层认真做了「还有 N 行」的出声，
 * 而更早的 runtime 层已经把内容砍掉了**。界面折叠里那个「全文」本身就是残缺品。
 *
 * ## 双份的含义
 *
 * ```
 * 完整输出  →  写盘，用户可取回
 * 摘要      →  头尾各一半，进事件流
 * 字节数    →  真数，供界面说「还有多少」
 * ```
 *
 * 学自 wisp 的 `budget_tool_result`。**模型侧的上下文预算不归我们管**——
 * 那是 pi 的职责，我们不越界重做一套。
 */
import { describe, expect, it } from "vitest"
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { budgetToolResult, TOOL_OUTPUT_BUDGET } from "../src/runtime/tool-output.js"

const dir = () => mkdtempSync(join(tmpdir(), "dawn-toolout-"))

describe("短输出原样通过", () => {
  it("不截断、不写盘、不留路径", () => {
    const d = dir()
    const r = budgetToolResult("很短", { sessionDir: d, toolName: "bash" })
    expect(r.text).toBe("很短")
    expect(r.truncated).toBe(false)
    expect(r.fullOutputPath).toBeUndefined()
    expect(existsSync(join(d, "tool-output"))).toBe(false)
    rmSync(d, { recursive: true, force: true })
  })

  it("**字节数永远是真数**，哪怕没截断 —— 界面靠它说话", () => {
    const d = dir()
    const text = "中文三个字"
    const r = budgetToolResult(text, { sessionDir: d, toolName: "read" })
    expect(r.bytes).toBe(Buffer.byteLength(text, "utf8"))
    // 中文一字三字节：字节数不等于字符数，用错了「还有 N」就是错的
    expect(r.bytes).toBeGreaterThan(text.length)
    rmSync(d, { recursive: true, force: true })
  })
})

describe("长输出：截断 + 写盘 + 出声", () => {
  const long = () => "行".repeat(TOOL_OUTPUT_BUDGET)

  it("截断后显著变短", () => {
    const d = dir()
    const r = budgetToolResult(long(), { sessionDir: d, toolName: "bash" })
    expect(r.truncated).toBe(true)
    expect(Buffer.byteLength(r.text, "utf8")).toBeLessThanOrEqual(TOOL_OUTPUT_BUDGET * 1.2)
    rmSync(d, { recursive: true, force: true })
  })

  it("**全文写盘且内容完整** —— 用户要能拿回被砍掉的部分", () => {
    const d = dir()
    const text = long()
    const r = budgetToolResult(text, { sessionDir: d, toolName: "bash" })
    expect(r.fullOutputPath).toBeDefined()
    expect(readFileSync(r.fullOutputPath!, "utf8")).toBe(text)
    rmSync(d, { recursive: true, force: true })
  })

  it("保留**头和尾**，不是只留头 —— 错误信息经常在最后一行", () => {
    const d = dir()
    const text = `开头标记\n${"填充".repeat(TOOL_OUTPUT_BUDGET)}\n结尾标记`
    const r = budgetToolResult(text, { sessionDir: d, toolName: "bash" })
    expect(r.text).toContain("开头标记")
    expect(r.text).toContain("结尾标记")
    rmSync(d, { recursive: true, force: true })
  })

  it("省略标记要**可执行**：说清省了多少、去哪拿、怎么拿", () => {
    const d = dir()
    const r = budgetToolResult(long(), { sessionDir: d, toolName: "bash" })
    // wisp 的标记直接把路径和用法写进去，而不只说「已截断」
    expect(r.text).toMatch(/省略|omitted/)
    expect(r.text).toContain(r.fullOutputPath!)
    rmSync(d, { recursive: true, force: true })
  })

  it("字节数是**原始**大小，不是截断后的", () => {
    const d = dir()
    const text = long()
    const r = budgetToolResult(text, { sessionDir: d, toolName: "bash" })
    expect(r.bytes).toBe(Buffer.byteLength(text, "utf8"))
    expect(r.bytes).toBeGreaterThan(Buffer.byteLength(r.text, "utf8"))
    rmSync(d, { recursive: true, force: true })
  })

  it("文件名带工具名，路径分隔符被清理 —— MCP 工具名可能含斜杠", () => {
    const d = dir()
    const r = budgetToolResult(long(), { sessionDir: d, toolName: "mcp/fs/read" })
    expect(r.fullOutputPath).toBeDefined()
    expect(r.fullOutputPath).not.toContain("mcp/fs/read")
    expect(r.fullOutputPath).toContain("mcp_fs_read")
    rmSync(d, { recursive: true, force: true })
  })
})

describe("写盘失败不能连累主流程", () => {
  it("目录不可写时仍返回摘要，只是没有路径", () => {
    // 指向一个不存在且不可创建的位置
    const r = budgetToolResult("长".repeat(TOOL_OUTPUT_BUDGET), {
      sessionDir: "/proc/不可能存在的路径/x",
      toolName: "bash",
    })
    expect(r.truncated).toBe(true)
    expect(r.fullOutputPath).toBeUndefined()
    // 拿不到全文时更要说清楚，而不是假装什么都没发生
    expect(r.text).toMatch(/省略/)
  })
})

describe("空输出", () => {
  it("空字符串不写盘也不报错", () => {
    const d = dir()
    const r = budgetToolResult("", { sessionDir: d, toolName: "bash" })
    expect(r.text).toBe("")
    expect(r.truncated).toBe(false)
    expect(r.bytes).toBe(0)
    rmSync(d, { recursive: true, force: true })
  })
})
