/**
 * 工具权限，在真实产物上看得见、按得动（2026-08-13）。
 *
 * 判据（30 条）与接线（3 条）都有了，**而按本项目自己的规矩，
 * 在这一屏上看不见之前它等于不存在**。
 *
 * 这条还顺带盯着一件容易被做丢的事：**这一屏不许自称沙箱**。
 * 沙箱是操作系统层的强制隔离，我们这是自己代码里的一道工具门——
 * 叫错名字会让人在「全放行」那一档下做出错误判断。
 */
import { test, expect, 进设置 } from "./fixtures.js"

test("设置里有「工具权限」，两档都在，且说清了各自意味着什么", async ({ dawn }) => {
  const { page } = dawn
  await expect(page.locator(".app-shell")).toBeVisible()
  await 进设置(page, "工具权限")

  await expect(page.getByText("全放行")).toBeVisible()
  await expect(page.getByText("拦下危险操作")).toBeVisible()
  // **拒绝理由要说得出去哪儿写**——不然模型只会原地打转
  await expect(page.getByText(/data\/raw/)).toBeVisible()
})

test("**默认是全放行** —— 不在毫无预兆的情况下让人开始撞墙", async ({ dawn }) => {
  const { page } = dawn
  await expect(page.locator(".app-shell")).toBeVisible()
  await 进设置(page, "工具权限")

  const 全放行 = page.locator(".perm-choice", { hasText: "全放行" }).locator("input")
  await expect(全放行).toBeChecked()
})

test("换一档，重进设置还是那一档 —— 存下去了，不是只在界面上动了动", async ({ dawn }) => {
  const { page } = dawn
  await expect(page.locator(".app-shell")).toBeVisible()
  await 进设置(page, "工具权限")

  await page.locator(".perm-choice", { hasText: "拦下危险操作" }).locator("input").check()
  await expect(
    page.locator(".perm-choice", { hasText: "拦下危险操作" }).locator("input"),
  ).toBeChecked()

  // 走一圈再回来：**没存下去的话这里会退回全放行**
  await page.getByRole("button", { name: "外观" }).click()
  await page.getByRole("button", { name: "工具权限" }).click()
  await expect(
    page.locator(".perm-choice", { hasText: "拦下危险操作" }).locator("input"),
    "改完的档位没有存下来",
  ).toBeChecked()
})

/**
 * **名字不许比能力大。**
 *
 * 这道门只管内置的四个工具，管不到子 agent 与 MCP 带进来的，
 * 也拦不住绕过工具的路子。这一屏上必须写着这句话——
 * 不写的话，「拦下危险操作」会被读成「什么都拦得住」。
 */
test("**这一屏不自称沙箱**，并写明了它管不到哪儿", async ({ dawn }) => {
  const { page } = dawn
  await expect(page.locator(".app-shell")).toBeVisible()
  await 进设置(page, "工具权限")

  /**
   * **定位到那句话本身，不是「页面上含 MCP 三个字」**（2026-08-13 当场撞到）：
   * 侧栏上还有一颗「MCP 服务器」按钮，`getByText(/MCP/)` 一下子匹配到两个，
   * Playwright 严格模式直接报错。**定位器松，就迟早会被别处的一句话撞上。**
   */
  const 边界说明 = page.locator(".settings-body .caveat")
  await expect(边界说明).toContainText("不是沙箱")
  await expect(边界说明, "管不到 MCP 这件事必须写在这一屏上").toContainText("MCP")
})
