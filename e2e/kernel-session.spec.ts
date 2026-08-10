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
 */
import { test, expect } from "./fixtures.js"
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
    await expect(page.getByRole("button", { name: /新建会话/ })).toBeEnabled()
    await page.getByRole("button", { name: /新建会话/ }).click()
    await expect(page.getByPlaceholder(/回车发送/)).toBeVisible({ timeout: 60_000 })

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

  })
})
