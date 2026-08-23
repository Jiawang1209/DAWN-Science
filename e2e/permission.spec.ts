/**
 * 工具权限，在真实产物上看得见、按得动（2026-08-13；2026-08-23 起唯一入口是输入卡上那颗「权限」，设置里那一格删了）。
 *
 * 判据（30 条）与接线（3 条）都有了，**而按本项目自己的规矩，
 * 在这一屏上看不见之前它等于不存在**。
 *
 * 这条还顺带盯着一件容易被做丢的事：**这一屏不许自称沙箱**。
 * 沙箱是操作系统层的强制隔离，我们这是自己代码里的一道工具门——
 * 叫错名字会让人在「全放行」那一档下做出错误判断。
 */
import { test, expect, 在项目里开会话 } from "./fixtures.js"
import { existsSync, writeFileSync } from "node:fs"
import { join } from "node:path"

/** 空态屏上那颗：改的是默认 */
async function 空态那颗(page: import("@playwright/test").Page) {
  await expect(page.locator(".app-shell")).toBeVisible()
  return page.locator(".perm-pill-trigger").first()
}

test("输入卡上有「权限」那颗，三档都在，且说清了各自意味着什么", async ({ dawn }) => {
  const { page } = dawn
  const 扳机 = await 空态那颗(page)
  await expect(扳机).toBeVisible()
  await 扳机.click()
  const 菜单 = page.getByRole("menu", { name: "工具权限" })
  await expect(菜单.getByRole("menuitemradio", { name: /^完全访问/ })).toBeVisible()
  await expect(菜单.getByRole("menuitemradio", { name: /^请求批准/ })).toBeVisible()
  await expect(菜单.getByRole("menuitemradio", { name: /^自动拦截/ })).toBeVisible()
  // **拒绝理由要说得出去哪儿写**——不然模型只会原地打转
  await expect(菜单.getByText(/原始数据/).first()).toBeVisible()
})

test("**默认是全放行** —— 不在毫无预兆的情况下让人开始撞墙", async ({ dawn }) => {
  const { page } = dawn
  const 扳机 = await 空态那颗(page)
  await expect(扳机).toHaveText(/^完全访问/)
  await 扳机.click()
  await expect(page.getByRole("menuitemradio", { name: /^完全访问/ })).toHaveAttribute("aria-checked", "true")
})

test("空态屏上换一档，进会话再回来还是那一档 —— 存下去了，不是只在界面上动了动", async ({ dawn }) => {
  const { page } = dawn
  const 扳机 = await 空态那颗(page)
  await 扳机.click()
  await page.getByRole("menuitemradio", { name: /^自动拦截/ }).click()
  await expect(扳机).toHaveText(/^自动拦截/)

  // 新开的会话跟着默认走
  await 在项目里开会话(page)
  await expect(page.locator(".composer-footer .perm-pill-trigger"), "新会话没有跟上改过的默认").toHaveText(/^自动拦截/)
  // 真存下去了：后端读出来也是这一档
  const 默认档 = await page.evaluate(async () => {
    const w = window as unknown as { dawn: { invoke: (op: string, req: unknown) => Promise<{ data?: { mode?: string } }> } }
    return (await w.dawn.invoke("getPermissionMode", {})).data?.mode
  })
  expect(默认档, "改完的档位没有存下来").toBe("deny-risky")
  // 设置里不该再有「工具权限」那一格——它只有一个入口
  await page.getByRole("button", { name: "设置", exact: true }).click()
  await expect(page.getByRole("button", { name: "工具权限" })).toHaveCount(0)
})

/**
 * **名字不许比能力大。**
 *
 * 这道门只管内置的工具与没过目的 MCP，管不到子 agent 与绕过工具的路子。菜单底下必须写着这句话——
 * 不写的话，「拦下危险操作」会被读成「什么都拦得住」。
 */
test("**菜单不自称沙箱**，并写明了硬拒清单任何档都拒", async ({ dawn }) => {
  const { page } = dawn
  const 扳机 = await 空态那颗(page)
  await 扳机.click()
  const 边界说明 = page.locator(".perm-pill-note")
  await expect(边界说明).toContainText("不是沙箱")
  await expect(边界说明).toContainText("任何档都拒")
})

/**
 * **问一句**（2026-08-23，学自 NanmiCoder/dsh-auto-mode 的 ask）：危险操作弹一张卡，点「允许这一次」才做；拒绝就把理由回给模型。
 * 假模型每轮都要 `rm` 一个会话之前就有的文件。
 */
test.describe("问一句", () => {
  test.use({ dawnOptions: { gitInit: true, toolCall: { toolName: "bash", args: { command: "rm old.txt" }, perTurn: true, say: "我去删掉它。" } } })

  test("**卡弹出来；允许 → 真删了；拒绝 → 没删、模型拿到理由**", async ({ dawn }) => {
    const { page, workspace } = dawn
    await expect(page.locator(".app-shell")).toBeVisible()
    writeFileSync(join(workspace, "old.txt"), "之前就有")
    await 在项目里开会话(page)
    // 会话里那颗：只改这一段
    const 扳机 = page.locator(".composer-footer .perm-pill-trigger")
    await expect(扳机).toHaveText(/^完全访问/)
    await 扳机.click()
    await page.getByRole("menuitemradio", { name: /^请求批准/ }).click()
    await expect(扳机).toHaveText(/^请求批准/)
    await page.getByPlaceholder(/今天帮你做些什么/).fill("删掉 old.txt")
    await page.keyboard.press("Enter")
    // 卡：标题里有命令，两个按钮
    const 卡 = page.locator(".perm-card")
    await expect(卡).toBeVisible({ timeout: 30_000 })
    await expect(卡).toContainText("rm old.txt")
    await expect(卡).toContainText("之前就有的文件")
    await 卡.getByRole("button", { name: "允许这一次", exact: true }).click()
    await expect(卡).toHaveCount(0)
    await expect.poll(() => existsSync(join(workspace, "old.txt")), { timeout: 30_000 }).toBe(false)
    const 工具 = page.locator(".tool").filter({ hasText: "bash" }).first()
    await expect(工具).toHaveAttribute("data-status", "ok", { timeout: 30_000 })

    // 第二轮：再建一个，这次拒绝
    writeFileSync(join(workspace, "old.txt"), "又有了")
    await expect(page.getByText("我去删掉它。").first()).toBeVisible()
    await page.getByPlaceholder(/今天帮你做些什么/).fill("再删一次")
    await page.keyboard.press("Enter")
    await expect(卡).toBeVisible({ timeout: 30_000 })
    await 卡.getByRole("button", { name: "拒绝", exact: true }).click()
    await expect(卡).toHaveCount(0)
    const 工具2 = page.locator(".tool").filter({ hasText: "bash" }).nth(1)
    await expect(工具2).toHaveAttribute("data-status", "error", { timeout: 30_000 })
    await 工具2.locator(".tool-head").click()
    await expect(工具2.locator(".tool-result")).toContainText("人拒绝了")
    expect(existsSync(join(workspace, "old.txt"))).toBe(true)
  })
})

test.describe("硬拒", () => {
  test.use({ dawnOptions: { gitInit: true, toolCall: { toolName: "bash", args: { command: "sudo rm -rf /var/log" }, once: true } } })

  test("**全放行档也拒 sudo**，不弹卡", async ({ dawn }) => {
    const { page } = dawn
    await 在项目里开会话(page)
    await page.getByPlaceholder(/今天帮你做些什么/).fill("清日志")
    await page.keyboard.press("Enter")
    const 工具 = page.locator(".tool").filter({ hasText: "bash" }).first()
    await expect(工具).toHaveAttribute("data-status", "error", { timeout: 30_000 })
    await 工具.locator(".tool-head").click()
    await expect(工具.locator(".tool-result")).toContainText("提权")
    await expect(page.locator(".perm-card")).toHaveCount(0)
  })
})
