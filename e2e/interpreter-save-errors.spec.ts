import { join, resolve } from "node:path"
import { test, expect, 进设置 } from "./fixtures.js"

test("保存失效路径在原输入位置报错，修正后消失；不新增诊断步骤或重复底栏提示", async ({ dawn }) => {
  const { page, workspace } = dawn
  await 进设置(page, "内核")
  await expect(page.getByText("当前配置诊断", { exact: true })).toHaveCount(0)
  await expect(page.getByRole("button", { name: "检查当前配置", exact: true })).toHaveCount(0)
  const py = page.locator("#interp-python")
  const r = page.locator("#interp-r")
  const save = page.locator(".set-row").filter({ has: py }).getByRole("button", { name: "保存", exact: true })
  await py.fill(join(workspace, "not-installed", "python"))
  await save.click()
  const error = page.getByRole("alert").filter({ hasText: "解释器路径有问题，请修改后保存。" })
  await expect(error).toBeVisible()
  await expect(py).toHaveAttribute("aria-invalid", "true")
  await expect(r).not.toHaveAttribute("aria-invalid", "true")
  const details = page.locator("details").filter({ has: page.getByText("错误详情", { exact: true }) })
  await expect(details).not.toHaveAttribute("open", "")
  await details.locator("summary").click()
  await expect(details).toContainText("不存在")
  await expect(page.locator(".statusbar")).not.toContainText("不存在")

  const valid = resolve("e2e/fixtures/py-with-kernel/python3")
  await py.fill(valid)
  await expect(error).toHaveCount(0)
  await save.click()
  await expect(save).toBeDisabled()
  await expect(error).toHaveCount(0)
  const saved = await page.evaluate(() => window.dawn!.invoke("getInterpreters", {}))
  expect(saved).toMatchObject({ ok: true, data: { python: valid } })
  await expect(page.getByRole("button", { name: "检测本机解释器", exact: true })).toHaveCount(2)
})

test("窄设置保持原布局；正常状态无额外报错或状态内容", async ({ dawn }) => {
  const { page } = dawn
  await 进设置(page, "内核")
  await page.getByRole("button", { name: "收回", exact: true }).click()
  const panel = page.locator(".settings-column")
  await expect(panel).toBeVisible()
  await expect(panel.getByRole("textbox")).toHaveCount(2)
  await expect(panel.getByRole("alert")).toHaveCount(0)
  await expect.poll(() => panel.evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1)
})
