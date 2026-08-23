/**
 * `@` 引用工作区文件（2026-08-23，学自 dsh-at-file）。
 *
 * 占位符从 2026-08-19 起就写着「@引用工作区文件」——**这条用例盯着那句承诺真的兑现**：
 * 打 `@` 弹路径菜单、挑一条写进草稿、引用栏里有它、发出去模型真的收到 `<workspace-reference>`。
 */
import { test, expect, 在项目里开会话 } from "./fixtures.js"
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"

test.describe("对话里", () => {
  test.use({ dawnOptions: { gitInit: true } })

  test("**打 `@` 弹菜单；挑一条；引用栏里有它；发出去模型收到 workspace-reference**", async ({ dawn }) => {
    const { page, workspace, requests } = dawn
    mkdirSync(join(workspace, "data/raw"), { recursive: true })
    writeFileSync(join(workspace, "data/raw/cities.csv"), "a,b\n1,2\n")
    writeFileSync(join(workspace, "notes.md"), "# 笔记\n")
    await 在项目里开会话(page)

    const 框 = page.getByPlaceholder(/今天帮你做些什么/)
    await 框.fill("看看 @")
    const 菜单 = page.getByRole("listbox", { name: "引用工作区文件" })
    await expect(菜单).toBeVisible()
    // 浏览模式：根下的东西，目录在前
    await expect(菜单.getByRole("option").first()).toContainText("data")
    await expect(菜单.getByRole("option", { name: /notes\.md/ })).toBeVisible()

    // 打几个字按名找：`cit` 命中深处的 cities.csv，主标题是文件名、下面一行父目录
    await 框.fill("看看 @cit")
    const 命中 = 菜单.getByRole("option", { name: /cities\.csv/ })
    await expect(命中).toBeVisible()
    await expect(命中).toContainText("data/raw")
    await 命中.click()
    await expect(框).toHaveValue("看看 @data/raw/cities.csv ")
    // 引用栏从草稿 parse 出来
    const 栏 = page.getByRole("list", { name: "引用的文件" })
    await expect(栏).toContainText("data/raw/cities.csv")

    await 框.press("Enter")
    await expect(page.getByText("假模型已应答").last()).toBeVisible({ timeout: 30_000 })
    // 模型收到的：原文 + 一条引用；**不带文件内容**
    const 收到 = JSON.stringify(requests)
    expect(收到).toContain('<workspace-reference path=\\"data/raw/cities.csv\\" kind=\\"file\\" />')
    expect(收到).not.toContain("a,b\\n1,2")
    // 屏幕上那一轮仍是人写的原文
    await expect(page.locator(".turn.user").last()).not.toContainText("workspace-reference")
  })

  test("**→ 钻进目录，菜单不关；回车引用目录是 `@路径/`；× 抠掉；不存在的 `@alice` 什么都不发生**", async ({ dawn }) => {
    const { page, workspace, requests } = dawn
    mkdirSync(join(workspace, "results/figs"), { recursive: true })
    writeFileSync(join(workspace, "results/figs/a.png"), "")
    await 在项目里开会话(page)
    const 框 = page.getByPlaceholder(/今天帮你做些什么/)
    const 菜单 = page.getByRole("listbox", { name: "引用工作区文件" })

    await 框.fill("@res")
    await expect(菜单.getByRole("option", { name: /^results/ })).toBeVisible()
    await 框.press("ArrowRight")
    await expect(框).toHaveValue("@results/")
    await expect(菜单.getByRole("option", { name: /figs/ })).toBeVisible()
    await 框.press("Enter")
    await expect(框).toHaveValue("@results/figs/ ")
    await expect(page.getByRole("list", { name: "引用的文件" })).toContainText("results/figs")

    await page.getByRole("button", { name: "不引用 results/figs" }).click()
    await expect(框).toHaveValue("")

    // 光标还在 `@alice` 后面：菜单开着（没有对上的）；Esc 关掉；接着写，发出去什么都不附
    await 框.fill("问问 @alice")
    await expect(菜单).toBeVisible()
    await 框.press("Escape")
    await expect(菜单).toHaveCount(0)
    await 框.type(" 这事")
    await expect(菜单).toHaveCount(0)
    await 框.press("Enter")
    await expect(page.getByText("假模型已应答").last()).toBeVisible({ timeout: 30_000 })
    expect(JSON.stringify(requests)).not.toContain("workspace-reference")
  })
})

/** 空态屏那张输入卡也得兑现同一句承诺（夹具已认领了 workspace，所以这里有源） */
test("空态屏：`@` 同样弹菜单、能挑", async ({ dawn }) => {
  const { page, workspace } = dawn
  writeFileSync(join(workspace, "plan.md"), "# 计划\n")
  const 框 = page.getByPlaceholder(/今天帮你做些什么/)
  await 框.fill("@pla")
  const 菜单 = page.getByRole("listbox", { name: "引用工作区文件" })
  await 菜单.getByRole("option", { name: /plan\.md/ }).click()
  await expect(框).toHaveValue("@plan.md ")
  await expect(page.getByRole("list", { name: "引用的文件" })).toContainText("plan.md")
})
