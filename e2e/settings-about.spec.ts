import { test, expect } from "./fixtures.js"

test.use({ dawnOptions: { fakeUpdate: { version: "0.0.1" } } })

test("关于页宽窄排版、主题色检查、失败恢复及自动检查可用", async ({ dawn }, info) => {
  const { page, app } = dawn
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setSize(1400, 900))
  await page.getByRole("button", { name: "设置", exact: true }).click()
  await page.locator(".settings-column-list").getByRole("button", { name: "关于", exact: true }).click()
  const pane = page.locator(".about-pane")
  await expect(pane.getByRole("heading", { name: "DAWN Science", exact: true })).toBeVisible()
  await expect(pane.getByRole("status")).toHaveText("已是最新")
  const check = pane.getByRole("button", { name: "检查更新", exact: true })
  await check.click()
  await expect(pane.getByRole("status")).toHaveText("已是最新")
  await pane.getByRole("checkbox").click()
  await expect(pane.getByRole("checkbox")).not.toBeChecked()
  await expect.poll(() => page.evaluate(async () => {
    const r = await (window as any).dawn.invoke("getUpdateState", {})
    return r.data.自动检查
  })).toBe(false)
  await pane.getByRole("checkbox").click()
  await expect(pane.getByRole("checkbox")).toBeChecked()
  const sash = page.getByRole("separator", { name: "调整面板宽度", exact: true })
  await sash.focus()
  const min = Number(await sash.getAttribute("aria-valuemin"))
  for (let width = Number(await sash.getAttribute("aria-valuenow")); width > min; width -= 16) {
    await sash.press("ArrowRight")
    await expect(sash).toHaveAttribute("aria-valuenow", String(Math.max(min, width - 16)))
  }
  await expect.poll(() => pane.evaluate(e => e.scrollWidth <= e.clientWidth)).toBe(true)
  await page.screenshot({ path: info.outputPath("about-narrow-light.png") })
  await fetch(new URL("/__fake/fail", dawn.发布源!.url), { method: "POST", body: JSON.stringify({ status: 503 }) })
  await check.click()
  await expect(pane.getByRole("status")).toContainText("503")
  await expect(check).toBeEnabled()
  await page.screenshot({ path: info.outputPath("about-failed.png") })
  await check.click()
  await expect(pane.getByRole("status")).toHaveText("已是最新")
  await page.getByRole("button", { name: "展开", exact: true }).click()
  await page.locator(".settings-nav").getByRole("button", { name: "外观", exact: true }).click()
  await page.getByRole("radio", { name: "蓝", exact: true }).click()
  await page.locator(".settings-nav").getByRole("button", { name: "关于", exact: true }).click()
  await expect.poll(() => check.evaluate(e => {
    const sample = document.createElement("span")
    sample.style.backgroundColor = "var(--dawn-accent-solid)"
    document.body.append(sample)
    const matches = getComputedStyle(e).backgroundColor === getComputedStyle(sample).backgroundColor
    sample.remove()
    return matches
  })).toBe(true)
  await expect.poll(() => pane.evaluate(e => e.scrollWidth <= e.clientWidth)).toBe(true)
  await page.screenshot({ path: info.outputPath("about-wide-blue.png") })
  await page.evaluate(() => { document.documentElement.classList.remove("dawn-light"); document.documentElement.classList.add("dawn-dark") })
  await page.screenshot({ path: info.outputPath("about-wide-dark.png") })
  dawn.发布源!.设版本("9.9.9")
  await check.click()
  await expect(pane.getByRole("status")).toHaveText("9.9.9 已发布")
  await expect(pane.getByRole("button", { name: "查看发布说明", exact: true })).toBeVisible()
})
