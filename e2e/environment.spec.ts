/**
 * 机器环境快照，在真实产物上看得见（②-B · R5，2026-08-13）。
 *
 * **这条是 R5 的收口。** 前几批做的是类型、探测、账本，
 * 而按本项目自己的规矩——*「看不见的能力等于不存在」*——
 * 在这里绿之前，那些对用户来说都还不存在。
 *
 * 它同时也是唯一能证明**整条链接上了**的用例：探测 → 入库 → 冻结 →
 * 推给记账 → 协议 → 面板。中间任何一段断掉，这里就是「没有快照」。
 * 单元测试对每一段都有，而**每一段都对、装没装上没人知道**，
 * 是这个项目栽过好几次的形状。
 */
import { test, expect, 开一段临时会话 } from "./fixtures.js"

/**
 * **标题里不能出现「内核会话」四个字**（2026-08-13 踩到的）：
 * `test:e2e:only` 带着 `--grep-invert "内核会话|解释器路径"`（那是给需要真内核的
 * 用例留的口子），于是这条一写出来就被整个滤掉了，而汇总里只是少一行——
 * **看起来全绿，实际它一次都没跑过。**
 */
test("普通对话也有环境 —— 机器本身就是环境", async ({ dawn }) => {
  const { page } = dawn
  await expect(page.locator(".app-shell")).toBeVisible()
  await 开一段临时会话(page)

  await page.getByRole("button", { name: "项目概览" }).click()

  /**
   * **按标题定位**，不按「面板里含这两个字」——子串匹配迟早被别处的一句话撞上
   * （`context-usage.spec.ts` 上栽过一次）。
   */
  const panel = page.locator(".panel", { has: page.getByText("环境", { exact: true }) })
  await expect(panel).toBeVisible()

  /**
   * **判据是「说得出这是哪台机器」，不是「有个环境面板」。**
   *
   * 停在「没有快照」正是 R5 之前的样子：那时非内核会话一律回
   * 「这个会话还没有环境快照」。所以这一条必须先否掉那句话。
   */
  await expect(panel.getByText("没有快照")).toHaveCount(0)
  await expect(panel.getByText("机器")).toBeVisible()
  await expect(panel.getByText("本机")).toBeVisible()

  /**
   * **真的探到了这台机器**：指纹是内容指纹，画的是前 12 位十六进制。
   * 它在这里出现，意味着这份快照是算出来的，不是一个占位。
   */
  await expect(panel.locator(".env-mono")).toHaveText(/^[0-9a-f]{12}$/)
})

test("**机器那一支不画解释器** —— 两种快照不共用一个形状", async ({ dawn }) => {
  const { page } = dawn
  await expect(page.locator(".app-shell")).toBeVisible()
  await 开一段临时会话(page)
  await page.getByRole("button", { name: "项目概览" }).click()

  const panel = page.locator(".panel", { has: page.getByText("环境", { exact: true }) })
  await expect(panel).toBeVisible()
  /**
   * 一台机器上装着三个 conda 环境，机器还是那台机器——
   * 「解释器」这一行在机器快照里画出来，说明两支被合成了一个形状，
   * 而那正是计划 §3.4 禁止的。
   */
  await expect(panel.getByText("解释器")).toHaveCount(0)
  await expect(panel.locator(".env-packages")).toHaveCount(0)
})
