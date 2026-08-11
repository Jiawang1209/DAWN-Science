/**
 * 成本栏：**说得出话，而且说的是实话**（2026-08-09）。
 *
 * ## 这条 e2e 存在，是因为这条线断过而没人发现
 *
 * 数据库六列、协议 `CostSchema`、界面三态——全都写好了，
 * **只有 `run-recorder.ts` 里一个 `cost` 字都没有**。
 * 于是成本栏在任何情况下都显示「尚未记录」，而单元测试全绿：
 * 每一层单独看都是对的，**没有一条测试走完整条线**。
 *
 * 所以这里跑真实构建产物，从说一句话一直看到面板上的字。
 */
import { resolve } from "node:path"
import { test, expect, 在项目里开会话 } from "./fixtures.js"

test("native 会话：如实说「不可见」并给出原因，而不是停在「尚未记录」", async ({ dawn }) => {
  const { page } = dawn
  await expect(page.getByRole("button", { name: /新建会话/ })).toBeEnabled()
  await 在项目里开会话(page)
  await expect(page.getByPlaceholder(/回车发送/)).toBeVisible()
  await page.getByPlaceholder(/回车发送/).fill("你好")
  await page.keyboard.press("Enter")
  await expect(page.locator(".turn.agent")).toHaveCount(1, { timeout: 30_000 })

  await page.getByRole("button", { name: "项目概览" }).click()
  const cost = page.locator(".panel", { has: page.getByText("成本", { exact: true }) })

  // ① **不再是「尚未记录」**——我们记了这一轮，只是记不到钱
  await expect(cost.getByText("尚未记录")).toHaveCount(0, { timeout: 15_000 })
  // ② 说清楚为什么拿不到
  await expect(cost.getByText("不可见")).toBeVisible()
  await expect(cost.getByText(/只报 token，不报金额/)).toBeVisible()
  // ③ **页面上不出现金额**——`CostSchema` 的 strict 就是为了挡住这个，
  //    显示 $0 会让人以为免费
  await expect(cost.getByText(/\$/)).toHaveCount(0)
})

/**
 * claude 是三个运行时里**唯一报金额**的（`result.total_cost_usd`）。
 * 假 CLI 吐的形状取自实测，金额 0.001。
 */
const FAKE = resolve(import.meta.dirname, "fixtures/claude")
const PROVIDERS = `agents:
  claude:
    kind: cli
    command: "${FAKE}"
    args: []
    capabilities: [chat, exec]
`

test.describe("claude 会话：金额是真数", () => {
  test.use({ dawnOptions: { providersYaml: PROVIDERS, gitInit: true } })

  test("成本栏显示 CLI 自己报的金额，不是我们乘出来的估算", async ({ page: _p, dawn }) => {
    const { page } = dawn
    await expect(page.locator(".app-shell")).toBeVisible()
    await expect(page.getByRole("button", { name: /新建会话/ })).toBeEnabled()
    await page.keyboard.press("Meta+k")
    await page.getByRole("option", { name: "新建会话：claude" }).click()
    await expect(page.getByPlaceholder(/回车发送/)).toBeVisible({ timeout: 30_000 })

    await page.getByPlaceholder(/回车发送/).fill("你好")
    await page.getByRole("button", { name: "发送", exact: true }).click()
    await expect(page.locator(".turn.agent")).not.toHaveCount(0, { timeout: 30_000 })

    await page.getByRole("button", { name: "项目概览" }).click()
    const cost = page.locator(".panel", { has: page.getByText("成本", { exact: true }) })
    // 假 CLI 报的是 0.001 —— **面板上的数必须就是它**
    await expect(cost.getByText(/\$0\.001/)).toBeVisible({ timeout: 15_000 })
    await expect(cost.getByText("尚未记录")).toHaveCount(0)
  })
})
