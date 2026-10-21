import { test, expect, 进设置 } from "./fixtures.js"
import { writeFile } from "node:fs/promises"
import { join } from "node:path"

test("内核设置只有两组路径，手填保存和清空可回写，最窄栏无裁切", async ({ dawn }, info) => {
  const { page, app } = dawn
  // 保存只做路径存在性检查；这个标记文件不作为程序执行。
  const path = join(dawn.dir, "interpreter-qa-marker")
  await writeFile(path, "QA path marker; never executed\n")
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setSize(1400, 900))
  await 进设置(page, "内核")
  const python = page.getByRole("group", { name: "Python 解释器", exact: true })
  const r = page.getByRole("group", { name: "R 解释器", exact: true })
  await expect(python.getByRole("textbox")).toHaveCount(1)
  await expect(r.getByRole("textbox")).toHaveCount(1)
  await expect(page.getByRole("button", { name: "手动填写路径", exact: true })).toHaveCount(0)
  const save = python.getByRole("button", { name: "保存", exact: true })
  await expect(save).toBeDisabled()
  await python.getByRole("textbox").fill(path)
  await expect(python).toContainText("尚未保存")
  await save.click()
  await expect(python).toContainText("已配置")
  await expect(save).toBeDisabled()
  await expect.poll(() => page.evaluate(async () => (await (window as any).dawn.invoke("getInterpreters", {})).data.python)).toBe(path)
  await page.screenshot({ path: info.outputPath("kernel-wide-saved.png") })
  await python.getByRole("textbox").fill("")
  await save.click()
  await expect(python).toContainText("还没配置")
  await expect(save).toBeDisabled()
  await expect.poll(() => page.evaluate(async () => (await (window as any).dawn.invoke("getInterpreters", {})).data.python)).toBeUndefined()
  await page.getByRole("button", { name: "收回", exact: true }).click()
  const sash = page.getByRole("separator", { name: "调整面板宽度", exact: true })
  await sash.focus()
  const min = Number(await sash.getAttribute("aria-valuemin"))
  for (let width = Number(await sash.getAttribute("aria-valuenow")); width > min; width -= 16) {
    await sash.press("ArrowRight")
    await expect(sash).toHaveAttribute("aria-valuenow", String(Math.max(min, width - 16)))
  }
  for (const group of [python, r]) {
    await expect(group.getByRole("textbox")).toBeVisible()
    await expect(group.getByRole("button", { name: "保存", exact: true })).toBeVisible()
    expect(await group.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
  }
  await page.screenshot({ path: info.outputPath("kernel-narrow-light.png") })
  await page.evaluate(() => { document.documentElement.classList.remove("dawn-light"); document.documentElement.classList.add("dawn-dark") })
  await page.screenshot({ path: info.outputPath("kernel-narrow-dark.png") })
})
