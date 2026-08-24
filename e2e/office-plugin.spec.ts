/**
 * Office 插件（2026-08-25，学自 dsh-office；规格 specs/2026-08-25-office插件-design.md）：
 * ① 设置 → 插件那张卡真实存在（四族 14 工具、按族开关、改动持久）；
 * ② 假模型点名调 xlsx_write，**磁盘上长出真 xlsx**——工具装配全链路的物证。
 */
import { existsSync } from "node:fs"
import { join } from "node:path"
import { test, expect, 在项目里开会话, 进设置 } from "./fixtures.js"

test("**插件卡**：Office 文档四族齐全；关一族要持久、写明下一段生效", async ({ dawn }) => {
  const { page } = dawn
  await 在项目里开会话(page)
  await 进设置(page, "插件")
  const 卡 = page.locator(".plugin-card")
  await expect(卡).toHaveCount(1)
  await expect(卡).toContainText("Office 文档")
  await expect(卡).toContainText("14 个工具")
  // 与「模型服务」同一副形制：整行可点展开
  await 卡.getByRole("button", { name: /配置它/ }).click()
  for (const 名 of ["电子表格", "PDF", "演示文稿", "Word 文档"]) await expect(卡).toContainText(名)
  // 工具名如实列出
  await expect(卡).toContainText("xlsx_recalc")
  await expect(卡).toContainText("pptx_edit")
  // 关掉演示文稿那一族 → 重进设置还是关的
  await page.getByRole("checkbox", { name: "启用 演示文稿 工具" }).uncheck()
  await page.getByRole("button", { name: "返回" }).click()
  await 进设置(page, "插件")
  // 卡默认收起（与模型服务一致）——先展开再看
  await page.getByRole("button", { name: /配置它/ }).click()
  await expect(page.getByRole("checkbox", { name: "启用 演示文稿 工具" })).not.toBeChecked()
  // 「下一段生效」写在头上——不许静默
  await expect(page.locator(".skills-head")).toContainText("下一段新会话生效")
})

test.describe("模型真的拿到了工具", () => {
  test.use({
    dawnOptions: {
      toolCall: {
        toolName: "xlsx_write",
        args: { file_path: "物证.xlsx", data: [["名", "值"], ["e2e", 1]] },
        say: "我来写一份表格。",
      },
    },
  })
  test("**假模型点名调 xlsx_write，工作区长出真 xlsx**", async ({ dawn }) => {
    const { page, workspace } = dawn
    await 在项目里开会话(page)
    await page.getByPlaceholder(/今天帮你做些什么/).fill("写个表")
    await page.getByRole("button", { name: "发送", exact: true }).click()
    await expect(page.getByText(/假模型已应答/).last()).toBeVisible({ timeout: 30_000 })
    expect(existsSync(join(workspace, "物证.xlsx"))).toBe(true)
  })
})
