/**
 * 设置里的内核列表（②-A · K2）。**跑真实构建产物。**
 *
 * 作者 2026-08-10：*「我觉得有必要在 app 的设置里面，让用户配置一下
 * R 和 Python 的路径，否则很盲目。」*
 *
 * 实测印证：本机五个 kernelspec 里三个是 conda 环境
 * （`d2l` / `datascience` / `python_learn`），**光看名字分不出哪个是哪个**。
 * 挑错的后果不是报错，是**跑在了另一个环境里而不自知**。
 *
 * 所以这条测试盯的不是「有没有列表」，而是**列表里有没有那一行路径**。
 */
import { test, expect } from "./fixtures.js"

test("设置里列出本机内核，**且每一条都带解释器路径**", async ({ dawn }) => {
  const { page } = dawn
  await expect(page.locator(".app-shell")).toBeVisible()
  // 精确匹配：页面上还有两个「去设置」，模糊匹配会撞上 strict 冲突
  await page.getByRole("button", { name: "设置", exact: true }).click()

  // 2026-08-10 设置改成 Section > Row > Control，节的类名从 `.panel` 换成 `.set-section`
  const panel = page.locator(".set-section", { has: page.getByText("内核", { exact: true }) })
  await expect(panel).toBeVisible()

  /**
   * **先把折叠展开。** 2026-08-10 解释器路径成为主角之后，
   * 「本机注册过的内核」降级成了一段参考资料，收进了 `<details>`——
   * 行还在，只是隐藏的。这条用例要验的是「每一条都带路径」，
   * 而不是「它默认展开着」，所以展开它，不是放宽断言。
   */
  const 折叠 = panel.locator("details")
  if (await 折叠.count()) await 折叠.first().locator("summary").click()

  const rows = panel.locator(".kernel")
  const n = await rows.count()
  if (n === 0) {
    // 没有内核也要说人话，而不是一片空白
    await expect(panel.getByText(/没有注册任何 Jupyter 内核/)).toBeVisible()
    return
  }

  // **每一条都要有路径**——这一行是整个面板存在的理由
  for (let i = 0; i < n; i++) {
    const exe = rows.nth(i).locator(".kernel-exe")
    await expect(exe).toBeVisible()
    await expect(exe).not.toHaveText("")
  }
  // 「重新扫描」要在：人可能刚在别处装了一个
  await expect(panel.getByRole("button", { name: "重新扫描" })).toBeEnabled()
})
