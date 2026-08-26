/**
 * 笔记本（坞里那格，2026-08-26）。**跑真实构建产物。**
 *
 * ## 它证明的两件事
 *
 * 1. **同一台内核**：agent 用 `run_code` 定义的 `x`，人在笔记本输入框里接着用——
 *    `print(x * 2)` 能算出 84，说明两条路走的是同一段对话的同一台内核，
 *    不是各起一台。
 * 2. **下一条消息带前缀**：人在内核里跑过的东西，模型要知道——但转录里那条
 *    用户 turn 只显示人敲的那句「继续」。「模型看的」与「转录看的」分开，
 *    这里从假服务器收到的请求体上直接读。
 *
 * ## 机器相关
 *
 * 用例 1 要一台**真内核**（`dawn-spike` kernelspec），拿不到就跳过并说清为什么。
 * 用例 2 不需要内核。
 *
 * **describe 名字里刻意不含「内核会话」或「解释器路径」**：`test:e2e:only`
 * 用这两个词把机器相关的 spec 排除在外，本文件靠 `test.skip` 自己把关。
 */
import { existsSync, readFileSync } from "node:fs"
import { homedir } from "node:os"
import { join, resolve } from "node:path"
import { test, expect, 开一段临时会话, 等进了对话, 进设置, 进坞, 用某个agent开一段 } from "./fixtures.js"

const KERNEL = "dawn-spike"
const KERNEL_JSON = join(homedir(), "Library", "Jupyter", "kernels", KERNEL, "kernel.json")
const 有 = existsSync(KERNEL_JSON)

/** 解释器路径照 kernelspec 里 `argv[0]` 来——那才是这台机器上真能起 ipykernel 的 python */
function 解释器路径(): string {
  const spec = JSON.parse(readFileSync(KERNEL_JSON, "utf8")) as { argv?: string[] }
  const p = spec.argv?.[0]
  if (!p) throw new Error(`${KERNEL_JSON} 里没有 argv[0]`)
  return p
}

/** 请求体里 message 的 content 可能是字符串也可能是分段数组，统一取文本 */
function 文本(c: unknown): string {
  if (typeof c === "string") return c
  if (Array.isArray(c)) return c.map((x) => (x as { text?: string })?.text ?? "").join("")
  return ""
}

test.describe("笔记本 · 真内核链路", () => {
  test.use({
    dawnOptions: {
      realKernels: true,
      toolCall: {
        toolName: "run_code",
        args: { language: "python", code: "x = 40 + 2\nprint(x)" },
        say: "我算一下。",
      },
    },
  })

  test.skip(!有, `本机没有 ${KERNEL} kernelspec`)

  test("agent 跑的与人敲的落在同一台内核；下一条消息给模型带前缀、转录只显示人敲的", async ({ dawn }) => {
    const { page } = dawn
    await expect(page.locator(".app-shell")).toBeVisible()
    await expect(page.getByRole("button", { name: "新建任务" })).toBeEnabled()

    // ① 对话懒起内核要先配解释器——走设置那一格，与「由配置的解释器路径起内核」同一条路
    const PY = 解释器路径()
    await 进设置(page, "内核")
    const 解释器框 = page.getByRole("textbox", { name: "Python 解释器" })
    await 解释器框.fill(PY)
    await page.getByRole("button", { name: "保存" }).first().click()
    await expect(解释器框).toHaveValue(PY)

    // ② native 对话里让假模型发 run_code
    await page.getByRole("button", { name: "新建任务" }).click()
    await 开一段临时会话(page)
    await 等进了对话(page)
    const 输入 = page.getByPlaceholder(/今天帮你做些什么/)
    await 输入.fill("算一下")
    await page.getByRole("button", { name: "发送", exact: true }).click()

    // ③ 笔记本里出现一条 cell，输出 42
    await 进坞(page, "笔记本")
    const cells = page.locator(".nb-cell")
    await expect(cells).toHaveCount(1, { timeout: 90_000 })
    await expect(cells.first().locator(".kout-text")).toContainText("42", { timeout: 60_000 })

    // ④ 人在输入框里接着用 x —— **同一台内核的判据**
    const 代码框 = page.getByRole("textbox", { name: "要跑的代码" })
    await 代码框.fill("print(x * 2)")
    await 代码框.press(process.platform === "darwin" ? "Meta+Enter" : "Control+Enter")
    await expect(cells).toHaveCount(2, { timeout: 60_000 })
    await expect(cells.nth(1).locator(".nb-code")).toContainText("print(x * 2)")
    await expect(cells.nth(1).locator(".kout-text")).toContainText("84", { timeout: 60_000 })

    // ⑤ 再对模型说一句——请求体里那条 user message 带前缀，转录里只显示「继续」
    const 之前 = dawn.requests.length
    await 输入.fill("继续")
    await page.getByRole("button", { name: "发送", exact: true }).click()
    await expect(page.getByText(/假模型已应答/).last()).toBeVisible({ timeout: 30_000 })
    expect(dawn.requests.length).toBeGreaterThan(之前)

    const 最后请求 = dawn.requests.at(-1) as { body?: { messages?: Array<{ role?: string; content?: unknown }> } }
    const 最后user = [...(最后请求.body?.messages ?? [])].reverse().find((m) => m.role === "user")
    const 模型看的 = 文本(最后user?.content)
    expect(模型看的.startsWith("[用户在 Python 内核里跑了]"), `模型看的：${模型看的}`).toBe(true)
    expect(模型看的).toContain("print(x * 2)")
    expect(模型看的).toContain("继续")

    const 用户turns = page.locator(".turn.user")
    const 最后turn = 用户turns.last()
    await expect(最后turn).toContainText("继续")
    await expect(最后turn).not.toContainText("内核里跑了")
    await expect(最后turn).not.toContainText("print(x * 2)")
  })
})

/** 假 CLI 的文件名必须是 `claude`（理由见 `cli-agent.spec.ts`） */
const FAKE = resolve(import.meta.dirname, "fixtures/claude")

const CLI_PROVIDERS = `agents:
  ds-chat:
    kind: native
    provider: deepseek
    model: deepseek-v4-flash
    capabilities: [chat, exec]
  claude:
    kind: cli
    command: "${FAKE}"
    args: []
    models: [opus, sonnet, haiku]
    capabilities: [chat, exec]
`

test.describe("笔记本 · 非 native 会话", () => {
  test.use({ dawnOptions: { providersYaml: CLI_PROVIDERS, gitInit: true } })

  test("cli 会话打开笔记本 → 明说没有内核，不画输入框", async ({ dawn }) => {
    const { page } = dawn
    await 用某个agent开一段(page, /claude/)
    await 等进了对话(page)
    await 进坞(page, "笔记本")
    await expect(page.getByText("这种会话没有内核，笔记本不可用")).toBeVisible()
    await expect(page.getByRole("textbox", { name: "要跑的代码" })).toHaveCount(0)
  })
})
