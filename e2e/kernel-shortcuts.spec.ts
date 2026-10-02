import { mkdirSync } from "node:fs"
import { join } from "node:path"
import { test, expect, 在项目里开会话 } from "./fixtures.js"

for (const [token, languages] of [["R", "R"], ["Py", "python"], ["RPython", "R,python"]]) {
  test(`@${token} 可从菜单选择，发送指令但不当文件`, async ({ dawn }) => {
    const { page } = dawn
    await 在项目里开会话(page)
    const input = page.getByPlaceholder(/今天帮你做些什么/)
    await input.fill(`@${token}`)
    const option = page.getByRole("listbox", { name: "引用工作区文件" }).getByRole("option", { name: new RegExp(`^@${token} `) })
    await expect(option).toBeVisible()
    await option.click()
    await expect(input).toHaveValue(`@${token} `)
    await expect(page.locator(".at-rail-row")).toContainText(`@${token}`)
    await input.fill(`@${token} 算一下 1+1`)
    await page.getByRole("button", { name: "发送", exact: true }).click()
    await expect(page.getByText("假模型已应答").last()).toBeVisible()
    const request = JSON.stringify(dawn.requests)
    expect(request).toContain(`run-code-request languages=\\"${languages}\\"`)
    expect(request).not.toContain(`workspace-reference path=\\"${token}\\"`)
    await expect(page.locator(".turn.user").last()).not.toContainText("run-code-request")
  })
}

test("空态也能选择内核入口，键盘选择和删除有效", async ({ dawn }) => {
  const { page } = dawn
  const input = page.getByPlaceholder(/今天帮你做些什么/)
  await input.fill("@Py")
  await expect(page.getByRole("option", { name: /^@Py / })).toBeVisible()
  await input.press("Enter")
  await expect(input).toHaveValue("@Py ")
  await page.getByRole("button", { name: "不使用 @Py", exact: true }).click()
  await expect(input).toHaveValue("")
})

test.describe("指定语言真正在工具入口检查", () => {
  test.use({ dawnOptions: { toolCall: { toolName: "run_code", args: { language: "python", code: "print(2)" }, say: "试着运行" } } })
  test("@R 拒绝模型误调用 Python", async ({ dawn }) => {
    const { page } = dawn
    await 在项目里开会话(page)
    await page.getByPlaceholder(/今天帮你做些什么/).fill("@R 算一下")
    await page.getByRole("button", { name: "发送", exact: true }).click()
    await expect(page.getByText("假模型已应答").last()).toBeVisible()
    await expect(page.locator(".turns")).toContainText("本次消息指定使用 R")
    expect(JSON.stringify(dawn.requests)).toContain("本次消息指定使用 R")
  })
})


test("内核入口与同名目录分别删除，不混淆", async ({ dawn }) => {
  const { page, workspace } = dawn
  mkdirSync(join(workspace, "R"))
  await 在项目里开会话(page)
  const input = page.getByPlaceholder(/今天帮你做些什么/)
  await input.fill("@R @R/ ")
  await expect(page.locator(".at-rail-row")).toHaveCount(2)
  await page.getByRole("button", { name: "不使用 @R", exact: true }).click()
  await expect(input).toHaveValue("@R/ ")
  await expect(page.locator(".at-rail-row")).toHaveCount(1)
  await page.getByRole("button", { name: "不引用 R", exact: true }).click()
  await expect(input).toHaveValue("")
})
