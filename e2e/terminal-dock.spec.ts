/**
 * 底部终端 dock（2026-08-11）。**跑真实构建产物。**
 *
 * 作者：*「终端，我们要学习 Claude app、Codex app，要点击之后，界面下方
 * 单独出现一个地方，可以专门用于开启一个新的终端，并且这个终端的路径，
 * 应该是项目文件夹的路径。」*
 *
 * ## 三件事，缺一件这个功能就没意义
 *
 *   1. **它在下方，不抢主区**——对话还在，终端在下面同时看得见
 *   2. **能再开一个**，且开出来的是真进程
 *   3. **路径是项目文件夹**——这条只有真跑一次才知道，
 *      因为 cwd 是 pty 运行时从会话的工作区取的，界面上看不出来
 */
import { test, expect } from "./fixtures.js"
import { existsSync } from "node:fs"
import { join } from "node:path"

test("**掀开就有终端，而且对话还在**", async ({ dawn }) => {
  const { page } = dawn

  // 先开一段对话，待会儿要验它没被顶掉
  await page.getByRole("button", { name: "新建会话" }).click()
  await expect(page.getByPlaceholder(/回车发送/)).toBeVisible({ timeout: 60_000 })

  await page.getByRole("button", { name: "终端", exact: true }).click()

  const dock = page.locator(".dock")
  await expect(dock).toBeVisible()
  // **对话没被顶掉**：这正是它与旧终端会话最根本的区别
  await expect(page.getByPlaceholder(/回车发送/)).toBeVisible()
  // 掀开就该有一个能用的终端，不该是个还要再点一次的空盒子
  await expect(dock.locator(".term-host")).toBeVisible({ timeout: 60_000 })
})

test("**路径是项目文件夹** —— 摆在上面，也真的在那里", async ({ dawn }) => {
  const { page, workspace } = dawn
  await page.getByRole("button", { name: "终端", exact: true }).click()
  const dock = page.locator(".dock")
  await expect(dock.locator(".term-host")).toBeVisible({ timeout: 60_000 })

  // ① 摆出来了：不摆的话「它到底在哪个目录」只能靠 pwd 猜
  await expect(dock.locator(".dock-cwd")).toContainText(workspace)

  /**
   * ② **真的在那里**——让它在自己的 cwd 里留下一个文件。
   *
   * 界面上那行字是我们自己写的，证明不了 cwd。
   * 而**读屏幕也不行**：xterm 画在 canvas 上，`.term-host` 的 DOM 文本是空的
   * （第一版就是这么写的，收到的是一串空格）。
   * **进程留下的副作用才是唯一算数的证据。**
   */
  await dock.locator(".term-host").click()
  await page.keyboard.type("printf hi > proof.txt\n")
  await expect
    .poll(() => existsSync(join(workspace, "proof.txt")), { timeout: 30_000 })
    .toBe(true)
})

test("再开一个，两个都在标签里", async ({ dawn }) => {
  const { page } = dawn
  await page.getByRole("button", { name: "终端", exact: true }).click()
  const dock = page.locator(".dock")
  await expect(dock.locator(".dock-tab")).toHaveCount(1, { timeout: 60_000 })

  await dock.getByRole("button", { name: /新终端/ }).click()
  await expect(dock.locator(".dock-tab")).toHaveCount(2, { timeout: 60_000 })
})

test("**终端不混进会话列表** —— 它有自己的地方了", async ({ dawn }) => {
  const { page } = dawn
  await page.getByRole("button", { name: "终端", exact: true }).click()
  await expect(page.locator(".dock .term-host")).toBeVisible({ timeout: 60_000 })
  // 会话列表里一条都不该多出来。**数 `.sess` 不数 `li`**——
  // 空列表里那一条 `li` 装的是「还没有会话」那句话
  // 上面那一列一条都不该多出来（**它空着的时候连占位那一行都没有**，2026-08-11）
  await expect(page.locator(".session-list .sess")).toHaveCount(0)
  await expect(page.locator(".proj-session-list .sess")).toHaveCount(0)
})

test("**终端不在侧栏，在对话这一侧**", async ({ dawn }) => {
  const { page } = dawn
  /**
   * 作者：*「这个终端的感觉差点意思，应该在对话框的这边，
   * 侧边栏这边不能有终端。」*
   *
   * 所以这条量两件事：侧栏里没有终端入口、也没有终端本身；
   * 而 dock 挂在主区里（`.main` 之内），不再横跨整个窗口压着侧栏。
   */
  await expect(page.locator(".sidebar").getByRole("button", { name: "终端" })).toHaveCount(0)

  await page.getByRole("button", { name: "终端" }).click()
  await expect(page.locator(".main .dock")).toBeVisible({ timeout: 60_000 })
  await expect(page.locator(".sidebar .dock")).toHaveCount(0)

  // 它的左边缘对齐主区，而不是窗口
  const dock = (await page.locator(".dock").boundingBox())!
  const main = (await page.locator(".main").boundingBox())!
  expect(Math.abs(dock.x - main.x)).toBeLessThan(2)
})

test("收起之后 dock 就没了", async ({ dawn }) => {
  const { page } = dawn
  await page.getByRole("button", { name: "终端", exact: true }).click()
  await expect(page.locator(".dock")).toBeVisible()
  await page.locator(".dock").getByRole("button", { name: "收起终端" }).click()
  await expect(page.locator(".dock")).toHaveCount(0)
})
