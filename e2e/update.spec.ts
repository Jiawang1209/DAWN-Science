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
import { test, 进设置 } from "./fixtures.js"

test.use({ dawnOptions: { fakeUpdate: { version: "9.9.9", packageBytes: 256 * 1024 } } })

test("侧栏长出「有新版本」，点开能下、下完能装", async ({ dawn }) => {
  const { page } = dawn

  const 行 = page.locator(".update-row")
  await 行.waitFor({ timeout: 30_000 })
  // **看得见**：`toBeVisible()` 对 opacity:0 仍然算可见，所以直接量（这个项目栽过两次）
  expect(await 行.evaluate((el) => getComputedStyle(el).opacity)).not.toBe("0")
  await expect(行).toContainText("9.9.9")

  // 更新入口与设置保持同一行高，下载图形不能用 SVG 默认大尺寸撑开侧栏。
  const 设置 = page.locator(".sidebar").getByRole("button", { name: "设置", exact: true })
  const 设置框 = await 设置.boundingBox()
  const 更新框 = await page.locator(".update-actions").boundingBox()
  const 下载框 = await page.locator(".update-download-icon").boundingBox()
  const 图形框 = await page.locator(".update-download-icon svg").boundingBox()
  expect(设置框).not.toBeNull()
  expect(更新框!.height).toBeLessThanOrEqual(设置框!.height + 1)
  expect(下载框!.height).toBeLessThanOrEqual(设置框!.height)
  expect(图形框!.width).toBe(14)
  expect(图形框!.height).toBe(14)

  // 与外观的主题色实时同步，浅色背景时前景也自动切换。
  await 进设置(page, "外观")
  const 下载按钮 = page.locator(".update-download-icon")
  const 读按钮色 = () => 下载按钮.evaluate((el) => {
    const 样本 = document.createElement("span")
    样本.style.backgroundColor = "var(--dawn-accent-solid)"
    document.body.append(样本)
    const 跟随主题 = getComputedStyle(el).backgroundColor === getComputedStyle(样本).backgroundColor
    样本.remove()
    return { 跟随主题, foreground: getComputedStyle(el).color, icon: getComputedStyle(el.querySelector("svg")!).color }
  })
  await page.getByRole("radio", { name: "蓝", exact: true }).click()
  await expect.poll(读按钮色).toEqual({ 跟随主题: true, foreground: "rgb(255, 255, 255)", icon: "rgb(255, 255, 255)" })
  const 色值 = page.getByLabel("颜色值，可输入 HEX 或 RGB")
  await 色值.fill("#ffd240")
  await 色值.press("Enter")
  await expect.poll(读按钮色).toEqual({ 跟随主题: true, foreground: "rgb(13, 13, 13)", icon: "rgb(13, 13, 13)" })

  await page.getByRole("button", { name: "下载新版本 9.9.9" }).click()
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
