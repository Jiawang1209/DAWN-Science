/**
 * 应用内更新（规格 `2026-09-06-应用内更新-design.md`）走真实产物一遍。
 *
 * **假的只有两处**：发布源（一台本地 http，回 GitHub 那个形状）与「换包」那一下
 * （e2e 里不能真去换开发者机器上的 `.app`）。**下载是真下的**——
 * 进度、大小核对、落盘都要真的发生。
 */
import { expect } from "@playwright/test"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { test } from "./fixtures.js"

test.use({ dawnOptions: { fakeUpdate: { version: "9.9.9", packageBytes: 256 * 1024 } } })

test("侧栏长出「有新版本」，点开能下、下完能装", async ({ dawn }) => {
  const { page } = dawn

  const 行 = page.locator(".update-row")
  await 行.waitFor({ timeout: 30_000 })
  // **看得见**：`toBeVisible()` 对 opacity:0 仍然算可见，所以直接量（这个项目栽过两次）
  expect(await 行.evaluate((el) => getComputedStyle(el).opacity)).not.toBe("0")
  await expect(行).toContainText("9.9.9")

  await 行.click()
  await expect(page.locator(".update-card")).toContainText("你在")

  await page.getByRole("button", { name: "更新到 9.9.9" }).click()
  // 下完之后才有这颗；**不自动重启**（规格 U4）
  await page.getByRole("button", { name: "重启并更新" }).waitFor({ timeout: 60_000 })

  await page.getByRole("button", { name: "重启并更新" }).click()
  await expect
    .poll(async () => 找标记(dawn.dir), { timeout: 20_000, message: "换包那一步没走到" })
    .not.toBe(undefined)
})

test("说了「这一版不再提醒」之后那一行就没了，重开也不回来", async ({ dawn }) => {
  const { page } = dawn
  await page.locator(".update-row").waitFor({ timeout: 30_000 })
  await page.locator(".update-row").click()
  await page.getByRole("button", { name: "这一版不再提醒" }).click()
  await expect(page.locator(".update-row")).toHaveCount(0)

  // **重开一次**：忽略这件事必须落在盘上，只记在内存里的话下次启动它又冒出来
  const 新页 = await dawn.重开()
  await 新页.waitForTimeout(8_000)
  await expect(新页.locator(".update-row")).toHaveCount(0)
})

/** 假安装器换包时写的那个标记文件。userData 的隔离位置见 fixtures 里那句 `--user-data-dir` */
function 找标记(dir: string): string | undefined {
  const f = join(dir, "electron-user-data", "update", "假装换包了.json")
  return existsSync(f) ? readFileSync(f, "utf8") : undefined
}
