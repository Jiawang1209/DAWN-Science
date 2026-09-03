/**
 * 远程内核（2026-09-03）。**跑真实构建产物，对着那台假服务器，内核是本机真起的 ipykernel。**
 *
 * 假的只有「另一端是谁」：起内核、写 connection.json、五条隧道、attach、停内核走的全是真代码
 * （`fake-ssh-kernel.ts` 认 `DAWN_FAKE_SSH_PYTHON`，用它 spawn 一台真 ipykernel）。
 *
 * 机器相关：要 `dawn-spike` kernelspec 指的那条 python（与 `notebook.spec.ts` 同一口径），没有就跳过。
 * **describe 名字里刻意不含「内核会话」「解释器路径」**：`test:e2e:only` 用这两个词把机器相关的
 * spec 排除在外，本文件与 `notebook.spec.ts` 一样靠 `test.skip` 自己把关。
 */
import { existsSync, readFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { test, expect, 进坞 } from "./fixtures.js"

const KERNEL = "dawn-spike"
const KERNEL_JSON = join(homedir(), "Library", "Jupyter", "kernels", KERNEL, "kernel.json")
const 有 = existsSync(KERNEL_JSON)
/** 解释器路径照 kernelspec 里 `argv[0]` 来——那才是这台机器上真能起 ipykernel 的 python */
const PY = 有 ? ((JSON.parse(readFileSync(KERNEL_JSON, "utf8")) as { argv?: string[] }).argv?.[0] ?? "") : ""

test.use({
  dawnOptions: {
    fakeSsh: true,
    fakeSshPython: PY,
    realKernels: true,
    /**
     * **`perTurn`，不是默认的 `once`**（与 `remote-connections.spec.ts` 的「断线重连」同一条理由）：
     * 第二条用例要在断开重连之后再跑一次代码，而 `once` 只调第一轮——
     * 不加的话第二句根本不会调 `run_code`，内核也就不会起新的一台，
     * 「起了新的一台」那条断言就变成在验一个没发生过的动作。
     */
    toolCall: {
      toolName: "run_code",
      args: { language: "python", code: "x = 40 + 2\nprint(x)" },
      say: "我在服务器上算。",
      perTurn: true,
    },
  },
})

/** 加一台假服务器，并在它上面开一段对话。三条用例的共同起点 */
async function 加一台并开对话(page: import("@playwright/test").Page) {
  // **2026-08-14 改名**：「远端连接」→「远端服务器」；默认收起，先掀开
  const head = page.getByRole("button", { name: /远端服务器/ })
  await expect(head).toBeVisible()
  if ((await head.getAttribute("aria-expanded")) !== "true") await head.click()
  await page.getByRole("button", { name: /添加服务器/ }).click()
  await page.locator("#conn-host").fill("fake.example")
  await page.locator("#conn-user").fill("dawn")
  await page.locator("#conn-label").fill("假机器")
  // 假服务器认的口令写死为 `dawn`（见 src/remote/fake-ssh.ts）
  await page.locator("#conn-secret").fill("dawn")
  await page.getByRole("button", { name: "保存", exact: true }).click()
  await page.locator(".remote-row").first().getByRole("button", { name: /新对话/ }).click()
  await expect(page.locator(".conv-remote")).toBeVisible({ timeout: 30_000 })
}

/**
 * 在笔记本格那一屏选中唯一的 python 候选。
 *
 * **用 `click()` 而不是 `check()`**：`check()` 点完还要回头确认那颗 radio 真的 checked 了，
 * 而这一屏的命根子恰恰是「选完这一格就换了样子」——未配从两门变成一门，
 * 整块 `.nb-remote-setup` 换成正常面板，Python 那个选择器**当场被拆掉**。
 * 于是 `check()` 永远等不到它变 checked（症状：`click action done` 之后超时）。
 * 选中了没有由下一条断言负责说——那才是这件事该被看见的地方。
 */
async function 选中唯一的python(page: import("@playwright/test").Page) {
  await expect(page.locator(".ip-python .ip-path", { hasText: PY })).toBeVisible({ timeout: 20_000 })
  await page.locator(".ip-python").getByRole("radio").first().click()
}

test.describe("远程内核 · 真内核 + 假 SSH", () => {
  test.skip(!有, `本机没有 ${KERNEL} kernelspec`)

  test("没配 → 笔记本格列出唯一候选 → 选 → agent 的 run_code 在「服务器」上算出 42，胶囊带服务器名", async ({ dawn }) => {
    const { page } = dawn
    await 加一台并开对话(page)
    await 进坞(page, "笔记本")

    // 定案 1：没配就探测（挂上自动探一次）；假服务器上只有一条真 python，列出来
    await expect(page.getByText(/假机器 上还没选解释器/)).toBeVisible()
    await 选中唯一的python(page)

    // 选完这一格就是正常的笔记本面板了——**输入框回来了**（选择器那一屏是不画输入框的）
    await expect(page.getByRole("textbox", { name: "要跑的代码" })).toBeVisible()

    await page.getByPlaceholder(/今天帮你做些什么/).fill("算一下")
    await page.getByRole("button", { name: "发送", exact: true }).click()

    // 内核**在那台服务器上**真起了一台，算出 42
    const cells = page.locator(".nb-cell")
    await expect(cells).toHaveCount(1, { timeout: 90_000 })
    await expect(cells.first().locator(".kout-text")).toContainText("42", { timeout: 60_000 })
    // 胶囊带服务器名：「Python · 空闲」在一台不是本机的机器上是句含糊话
    await expect(page.locator(".nb-pill-label")).toContainText("Python · 假机器")
    // 转录里说了在哪起的
    await expect(page.getByText(/正在起 Python 内核|内核已在/).first()).toBeVisible()
  })

  test("断开服务器 → 转录说变量没了、胶囊退出；再连上再跑会起新的一台", async ({ dawn }) => {
    const { page } = dawn
    await 加一台并开对话(page)
    await 进坞(page, "笔记本")
    await 选中唯一的python(page)
    await page.getByPlaceholder(/今天帮你做些什么/).fill("算一下")
    await page.getByRole("button", { name: "发送", exact: true }).click()
    await expect(page.locator(".nb-pill-label")).toContainText("Python · 假机器", { timeout: 90_000 })

    const row = page.locator(".remote-row").first()
    await row.getByRole("button", { name: "断开" }).click()
    /**
     * **转录里那句话是 `内核变化出声` 写的，不是运行时自己那条**（2026-09-04 跑出来的）。
     *
     * `KernelRuntime.收远端` 确实 `emit` 了一条「与 假机器 断开了，Python 内核里的变量已经不在了…」，
     * 但普通对话挂的内核走的是 `挂载.ts`，而 `wiring.ts` 的 `转发` **只放 `kernel_output` 过去**——
     * `notice` 到不了转录。到得了转录的是 `exited{reason:"disconnected"}` 转成的这一句。
     * 照运行时那条字面去等，等的是一句在这条路上永远不会出现的话。
     *
     * 「变量没了」这件事**没有因此丢**：它由笔记本格顶上那条提示说，下面一条断言就是它。
     * 两条一起才是这条用例要的那件事——转录说清了为什么，笔记本说清了后果。
     */
    await expect(page.getByText(/Python 内核退出了：与服务器断开/)).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText(/上面 cell 里的变量已经不在了/)).toBeVisible({ timeout: 15_000 })
    // 状态词("exited") = 「已退出」
    await expect(page.locator(".nb-pill-label")).toContainText("退出")

    await row.getByRole("button", { name: "连接", exact: true }).click()
    await expect(row).toHaveAttribute("data-state", "ready", { timeout: 15_000 })

    await page.getByPlaceholder(/今天帮你做些什么/).fill("再算")
    await page.getByRole("button", { name: "发送", exact: true }).click()
    // 起了**新的一台**：还是那台服务器上的 Python，而且不再是退出态
    await expect(page.locator(".nb-pill-label")).toContainText("Python · 假机器 · ", { timeout: 90_000 })
    await expect(page.locator(".nb-pill-label")).not.toContainText("退出")
    await expect(page.locator(".nb-cell").nth(1).locator(".kout-text")).toContainText("42", { timeout: 60_000 })
  })

  test("设置里那台服务器的对话框有两格，探测后能选，回显", async ({ dawn }) => {
    const { page } = dawn
    await 加一台并开对话(page)
    await page.locator(".remote-row").first().getByRole("button", { name: "编辑" }).click()
    // 对话框里**不自动探**（那是编辑连接信息的地方），得按一颗
    await page.getByRole("button", { name: /检测 假机器 上的解释器/ }).first().click()
    await page.locator(".ip-python").getByRole("radio").first().check({ timeout: 20_000 })
    // 存下去再回来：选中那一行写的就是刚才那条路径
    await expect(page.locator(".ip-python .ip-item.active .ip-path")).toHaveText(PY)
  })
})
