/**
 * 从界面建一个内核会话，执行代码，看见**结构化输出**（②-A · K4）。
 *
 * ## 这条是 K4 的收口判据
 *
 * 前面几条分别验过传输、翻译、runtime——**但没有一条走完整条线**。
 * 而这个项目反复栽的正是这个：每一层单独看都对，接线断了却没人知道
 * （三个面板那次、成本那次）。
 *
 * 它用**本机真实的内核**，因此是机器相关的：拿不到就跳过。
 *
 * ## 为什么它单独跑（`npm run test:e2e:kernel`）
 *
 * 2026-08-10 实测：**它跑完之后，同一个 Playwright worker 里的下一条 spec
 * 会在 `firstWindow` 上挂 90 秒以上**。逐条排除过机器忙、进程累积、
 * 原生模块加载——都不是；而跑完它之后**手动**启动应用只要 1.0 秒。
 * 根因未确定（记在变更历史里）。
 *
 * **隔离不是降级**：它照样跑、照样必须绿，`npm run test:e2e` 里是
 * 「先跑其余的，再跑它」。这么做的理由只有一个——
 * **红着的全量套件会教人忽略红色**，而那比一个待查的 bug 更贵。
 */
import { test, expect, readRuns, 开一段临时会话, 等进了对话 } from "./fixtures.js"
import { existsSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

const KERNEL = "dawn-spike"
const 有 = existsSync(join(homedir(), "Library", "Jupyter", "kernels", KERNEL))

const PROVIDERS = `agents:
  py:
    kind: kernel
    command: ${KERNEL}
    capabilities: [exec]
`

test.describe("内核会话", () => {
  test.use({ dawnOptions: { providersYaml: PROVIDERS, realKernels: true } })

  test.skip(!有, `本机没有 ${KERNEL} kernelspec`)

  test("执行一段代码 → **结构化输出**出现在对话里", async ({ dawn }) => {
    const { page } = dawn
    await expect(page.locator(".app-shell")).toBeVisible()
    await expect(page.getByRole("button", { name: "新建任务" })).toBeEnabled()
    await 开一段临时会话(page)
    await 等进了对话(page)

    // ① 普通输出
    await page.getByPlaceholder(/回车发送/).fill("print('E2E_KERNEL_OK', 40 + 2)")
    await page.getByRole("button", { name: "发送", exact: true }).click()
    // 取最后一条：对话里会累积多条输出，`.kout-text` 会命中不止一个
    await expect(page.locator(".kout-text").last()).toContainText("E2E_KERNEL_OK 42", {
      timeout: 60_000,
    })

    // ② **报错是 error 条目，不是一段红字文本**
    await page.getByPlaceholder(/回车发送/).fill("raise ValueError('e2e boom')")
    await page.getByRole("button", { name: "发送", exact: true }).click()
    await expect(page.locator(".kout-error .kout-ename")).toContainText("ValueError", {
      timeout: 60_000,
    })

    // ③ **判据：同一个活会话** —— 前面定义的变量后面读得到
    await page.getByPlaceholder(/回车发送/).fill("e2e_v = 7")
    await page.getByRole("button", { name: "发送", exact: true }).click()
    await page.getByPlaceholder(/回车发送/).fill("print('V =', e2e_v)")
    await page.getByRole("button", { name: "发送", exact: true }).click()
    await expect(page.locator(".kout-text").last()).toContainText("V = 7", { timeout: 60_000 })

    /**
     * ④ **变量面板看得见它**（S14）。
     *
     * 这是 ②-A 判据的最后一句：*「人能看见 agent 在这个会话里造出了什么。」*
     * 前面那个 `e2e_v = 7` 是在 Console 里定义的——**它必须出现在面板上**，
     * 否则「人和 agent 共用同一个活会话」就只剩半句。
     */
    await page.getByRole("button", { name: "项目概览" }).click()
    const panel = page.locator(".panel", { has: page.getByText("变量", { exact: true }) })
    await expect(panel).toBeVisible()
    // 定位到**名字**那一格：变量名也可能出现在别人的预览里
    await expect(panel.locator(".var .name", { hasText: "e2e_v" })).toBeVisible({ timeout: 60_000 })
    await expect(panel.locator(".var", { hasText: "e2e_v" })).toContainText("int")

    /**
     * ⑤ **环境快照看得见**（②-B · S17）。
     *
     * 判据是那句*「这个结果是在什么环境跑出来的」*。**光有版本号不算答案**——
     * 本机五个 kernelspec 里三个是 conda 环境，只说「Python 3.11」
     * 完全分不出是哪一个。所以这里同时验解释器**路径**。
     */
    const env = page.locator(".panel", { has: page.getByText("环境", { exact: true }) })
    await expect(env).toBeVisible()
    await expect(env.locator(".env-facts")).toContainText(/3\.\d+/, { timeout: 60_000 })
    // **路径**：它才回答「哪个环境」
    await expect(env.locator(".env-path").first()).toContainText("/")
    // 包清单不是空的——一个能跑 ipykernel 的环境不可能一个包都没有
    await env.locator(".env-packages summary").click()
    await expect(env.locator(".env-pkg-list .name", { hasText: "ipykernel" })).toBeVisible()

  })
})

/**
 * ── R 走完同一条链（欠账 1，2026-08-10 补）─────────────────────────
 *
 * ②-A 收口时明写在案：**R 只验到通道层**——`interrupt` / iopub /
 * `execute_reply` 都用真 `ir` 内核验过，但 `KernelRuntime` → 界面
 * 这条 e2e 只跑了 Python。
 *
 * **风险在接缝不在协议**：路线图押的是「一次实现，通吃多语言」，
 * 那句话要么被测试盯着，要么迟早变成「只有 Python 能用」。
 */
const R_KERNEL = "ir"
const 有R = existsSync(join(homedir(), "Library", "Jupyter", "kernels", R_KERNEL))

/**
 * **账本要如实**（②-B 前置 · 2026-08-11）。**跑真实构建产物。**
 *
 * 内核会话与 native 一样走 `beginTurn`，所以每段代码都有 Run——
 * 但收口时 `idle` 分支无条件写 `completed / hasError: false`，
 * 于是**一段跑挂了的代码，账本上是「完成、无错」**。
 * 那不是漏记，是**记了一件没发生的事**：账本本该是事实层（不变式 5）。
 *
 * 单元测试已经钉过这条（含变异验证），这里验的是**整条线**：
 * 界面上敲一段会炸的代码 → 内核 iopub 上那条 `error` → 记账员 → 库里那一行。
 */
test.describe("内核执行的账本", () => {
  test.use({ dawnOptions: { providersYaml: PROVIDERS, realKernels: true } })
  test.skip(!有, `本机没有 ${KERNEL} kernelspec`)

  test("**跑挂的代码在账本上是 failed，且带着原因**", async ({ dawn }) => {
    const { page, dbPath } = dawn
    await 开一段临时会话(page)
    const box = page.getByPlaceholder(/回车发送/)
    await expect(box).toBeVisible({ timeout: 60_000 })

    await box.fill("这行故意写错()")
    await box.press("Enter")
    // 界面上先看见报错，说明这一轮真的跑完了
    await expect(page.locator(".turns")).toContainText(/Error|错误/, { timeout: 60_000 })

    await expect
      .poll(
        async () => {
          const rows = await readRuns(dbPath)
          /**
           * **`kernel_execute` 也算。** 这个 spec 的内核是按 kernelspec 名字配的
           * （`command: dawn-spike`），配置里没有 `language`——那时我们**不猜**语言，
           * 记的是中性的 `kernel_execute`。写死 `execute_python` 的话，
           * 一个 R 会话的账本会指着一门它没用过的语言。
           */
          const 执行 = rows.filter((r) => /^(execute_|kernel_execute)/.test(String(r["request_type"])))
          return 执行.map((r) => `${String(r["status"])}|${String(r["has_error"])}`)
        },
        { timeout: 30_000 },
      )
      .toContain("failed|1")

    const rows = await readRuns(dbPath)
    const 那条 = rows.find((r) => r["status"] === "failed")!
    // **失败必须带原因**（规格 7.5）——「失败了但不说为什么」等于没记
    expect(String(那条["terminal_reason"] ?? "")).not.toBe("")
    // **账本上分得出「跑了一段代码」和「说了一句话」**
    expect(String(那条["request_type"])).toMatch(/^(execute_|kernel_execute)/)
  })

  test("**跑得通的代码是 completed** —— 不能一律记成失败", async ({ dawn }) => {
    const { page, dbPath } = dawn
    await 开一段临时会话(page)
    const box = page.getByPlaceholder(/回车发送/)
    await expect(box).toBeVisible({ timeout: 60_000 })

    await box.fill("print(40 + 2)")
    await box.press("Enter")
    await expect(page.locator(".turns")).toContainText("42", { timeout: 60_000 })

    await expect
      .poll(
        async () => {
          const rows = await readRuns(dbPath)
          return rows
            .filter((r) => /^(execute_|kernel_execute)/.test(String(r["request_type"])))
            .map((r) => String(r["status"]))
        },
        { timeout: 30_000 },
      )
      .toContain("completed")
  })
})

test.describe("R 内核会话", () => {
  test.use({
    dawnOptions: {
      providersYaml: `agents:\n  r:\n    kind: kernel\n    command: ${R_KERNEL}\n    capabilities: [exec]\n`,
      realKernels: true,
    },
  })

  test.skip(!有R, `本机没有 ${R_KERNEL} kernelspec`)

  test("**同一条代码路径**：执行、报错、活会话、变量面板", async ({ dawn }) => {
    const { page } = dawn
    await expect(page.locator(".app-shell")).toBeVisible()
    await expect(page.getByRole("button", { name: "新建任务" })).toBeEnabled()
    await 开一段临时会话(page)
    await 等进了对话(page)

    const 发 = async (code: string) => {
      await page.getByPlaceholder(/回车发送/).fill(code)
      await page.getByRole("button", { name: "发送", exact: true }).click()
    }

    await 发('cat("E2E_R_OK", 40 + 2, "\\n")')
    await expect(page.locator(".kout-text").last()).toContainText("E2E_R_OK 42", { timeout: 60_000 })

    // **报错是 error 条目**，不是一段红字文本
    await 发('stop("r e2e boom")')
    await expect(page.locator(".kout-error .kout-ename")).toBeVisible({ timeout: 60_000 })

    // **判据：同一个活会话** —— 前面定义的变量后面读得到
    await 发("e2e_r <- 7")
    await 发('cat("V =", e2e_r, "\\n")')
    await expect(page.locator(".kout-text").last()).toContainText("V = 7", { timeout: 60_000 })

    // **变量面板对 R 也有** —— 它走的是与 Python 不同的编码，所以必须单独验
    await page.getByRole("button", { name: "项目概览" }).click()
    const panel = page.locator(".panel", { has: page.getByText("变量", { exact: true }) })
    await expect(panel.locator(".var .name", { hasText: "e2e_r" })).toBeVisible({ timeout: 60_000 })
    await expect(panel.locator(".var", { hasText: "e2e_r" })).toContainText("numeric")
  })
})

/**
 * ── 由「设置里填的解释器路径」起内核（2026-08-10，作者定的机制）──────
 *
 * *「我不是要求你扫描整个电脑，而是直接提供一个 R 解释器和 Python 解释器的
 * 路径即可。**只有配置了，我们才能调用**。」*
 *
 * 所以这条测试的顺序就是用户的顺序：
 *   **一开始不能用 → 去设置里填 → 就能用了。**
 * 少了第一步，「只有配置了才能调用」就没被验证过——
 * 而那正是这条机制与「扫描出一个默认」的全部区别。
 */
const PY_PATH = join(process.cwd(), ".venv-kernel", "bin", "python")
const 有PY = existsSync(PY_PATH)

test.describe("由配置的解释器路径起内核", () => {
  test.use({
    dawnOptions: {
      providersYaml: "agents:\n  py:\n    kind: kernel\n    language: python\n    capabilities: [exec]\n",
      realKernels: true,
    },
  })

  test.skip(!有PY, "本机没有 .venv-kernel")

  test("**没配就明说没配，配完就能跑**", async ({ dawn }) => {
    const { page } = dawn
    await expect(page.locator(".app-shell")).toBeVisible()
    await expect(page.getByRole("button", { name: "新建任务" })).toBeEnabled()

    /**
     * ① **还没配** —— 建会话要响亮失败并指向设置，不是悄悄用一个猜出来的解释器。
     *
     * **这里不能用 `开一段临时会话`**（2026-08-12）：那个夹具的前提是
     * 「建得出来」，而这一条要验的**恰恰是建不出来**。
     * 用它的话，失败会以「夹具超时」的形式出现，而不是界面上那句话。
     */
    await page.getByRole("button", { name: "新建任务" }).click()
    const 输入 = page.getByPlaceholder(/回车发送/)
    await 输入.fill("跑一下")
    await 输入.press("Enter")
    await expect(page.getByText(/还没有配置 Python 解释器路径/)).toBeVisible({ timeout: 30_000 })

    // ② 去设置里填
    await page.getByRole("button", { name: "设置", exact: true }).click()
    const box = page.getByRole("textbox", { name: "Python 解释器" })
    await expect(box).toBeVisible()
    await expect(box).toHaveAttribute("placeholder", "还没配置")
    await box.fill(PY_PATH)
    await page.getByRole("button", { name: "保存" }).first().click()

    // **回显是必须的**：看不见自己配了什么等于没配
    await expect(box).toHaveValue(PY_PATH)

    // ③ 配完就能跑，而且跑的就是那个解释器
    await 开一段临时会话(page)
    await 等进了对话(page)
    await page.getByPlaceholder(/回车发送/).fill("import sys; print('EXE', sys.executable)")
    await page.getByRole("button", { name: "发送", exact: true }).click()
    await expect(page.locator(".kout-text").last()).toContainText(PY_PATH, { timeout: 60_000 })
  })
})
