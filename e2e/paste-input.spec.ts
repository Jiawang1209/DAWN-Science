/**
 * 外部文件附件（2026-08-25，学自 dsh-paste-input，解读见 ccb_hive_code_learn/dsh-paste-input-解读.md）：
 * 粘贴 / 拖拽的外部文件先只在内存排队（chip），发送那一刻落盘进
 * `<工作区>/.dawn/attachments/…` 并以 `@相对路径` 进消息；×掉 chip = 磁盘无痕。
 */
import { existsSync, readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { test, expect, 在项目里开会话, 进坞 } from "./fixtures.js"

/** 往 composer 里“粘”一个非图片文件（合成 ClipboardEvent；CSP 挡 data: fetch，从字节拼） */
const 粘一个文件 = (page: import("@playwright/test").Page, 名: string, 内容: string) =>
  page.evaluate(({ 名, 内容 }) => {
    const dt = new DataTransfer()
    dt.items.add(new File([new TextEncoder().encode(内容)], 名, { type: "text/csv" }))
    document.querySelector(".composer-box textarea")!.dispatchEvent(
      new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }),
    )
  }, { 名, 内容 })

test("**粘贴外部文件 → chip → 发送落盘 → @ 引用进消息**；磁盘上批次带 owner marker", async ({ dawn }) => {
  const { page, workspace } = dawn
  await 在项目里开会话(page)
  await 粘一个文件(page, "实验 数据.csv", "a,b\n1,2\n")
  // chip 出现：名字已消毒展示原名，大小在旁
  const chip = page.locator(".attached-file")
  await expect(chip).toHaveCount(1)
  await expect(chip).toContainText("实验 数据.csv")
  // 发送前磁盘上什么都没有（发送才落盘）
  expect(existsSync(join(workspace, ".dawn", "attachments"))).toBe(false)
  await page.locator(".composer-box textarea").fill("看看这份数据")
  await page.getByRole("button", { name: "发送", exact: true }).click()
  await expect(page.getByText(/假模型已应答/).last()).toBeVisible({ timeout: 30_000 })
  // 消息里带着 @ 引用（消毒后的名字，无空白）
  await expect(page.locator(".turn").first()).toContainText(/@\.dawn\/attachments\/.+实验_数据\.csv/)
  // 磁盘：批次目录 + marker + 文件内容
  const 根 = join(workspace, ".dawn", "attachments")
  expect(existsSync(根)).toBe(true)
  const 会话目录 = join(根, readdirSync(根)[0]!)
  const 批次 = join(会话目录, readdirSync(会话目录)[0]!)
  const marker = JSON.parse(readFileSync(join(批次, ".dawn-attachments.json"), "utf8"))
  expect(marker.owner).toBe("dawn-paste-input")
  expect(readFileSync(join(批次, "实验_数据.csv"), "utf8")).toBe("a,b\n1,2\n")
  // chip 已清空
  await expect(page.locator(".attached-file")).toHaveCount(0)
})

test("**×掉 chip = 磁盘无痕**；上传键的黑色实心跟着熄灭", async ({ dawn }) => {
  const { page, workspace } = dawn
  await 在项目里开会话(page)
  const 色 = () => page.locator(".composer-footer .attach-trigger").evaluate((el) => getComputedStyle(el).color)
  const 淡 = await 色()
  await 粘一个文件(page, "误拖.txt", "算了")
  await expect(page.locator(".attached-file")).toHaveCount(1)
  expect(await 色()).not.toBe(淡)
  await page.getByRole("button", { name: "移除附件 误拖.txt" }).click()
  await expect(page.locator(".attached-file")).toHaveCount(0)
  expect(await 色()).toBe(淡)
  // 从头到尾没碰过磁盘
  expect(existsSync(join(workspace, ".dawn", "attachments"))).toBe(false)
})

test("**拖拽外部文件也进队列**；概览里能看到用量并两步清理", async ({ dawn }) => {
  const { page, workspace } = dawn
  await 在项目里开会话(page)
  // 合成整页 drop（真实拖拽 Playwright 造不出系统级 DataTransfer 文件）
  await page.evaluate(() => {
    const dt = new DataTransfer()
    dt.items.add(new File([new TextEncoder().encode("x1")], "拖来.txt", { type: "text/plain" }))
    document.dispatchEvent(new DragEvent("drop", { dataTransfer: dt, bubbles: true, cancelable: true }))
  })
  await expect(page.locator(".attached-file")).toHaveCount(1)
  await page.locator(".composer-box textarea").fill("收好")
  await page.getByRole("button", { name: "发送", exact: true }).click()
  await expect(page.getByText(/假模型已应答/).last()).toBeVisible({ timeout: 30_000 })
  expect(existsSync(join(workspace, ".dawn", "attachments"))).toBe(true)
  // 概览：用量一行 + 两步清理
  await 进坞(page, "概览")
  const 格 = page.locator(".panel", { hasText: "外部附件" })
  await expect(格).toContainText(/1 批 · 1 个文件/)
  await 格.getByRole("button", { name: "清理本会话附件" }).click()
  await 格.getByRole("button", { name: "再点一次：确认清理" }).click()
  await expect(格).toContainText("还没有落盘的外部附件")
  // 磁盘上批次真的没了（marker 批次目录清空）
  const 根 = join(workspace, ".dawn", "attachments")
  const 会话目录 = join(根, readdirSync(根)[0]!)
  expect(readdirSync(会话目录)).toHaveLength(0)
})

test("**光标不在输入框也能粘**（页面级监听）", async ({ dawn }) => {
  const { page } = dawn
  await 在项目里开会话(page)
  // 焦点故意放在 body 上，往 document 粘
  await page.evaluate(() => {
    ;(document.activeElement as HTMLElement | null)?.blur()
    const dt = new DataTransfer()
    dt.items.add(new File([new TextEncoder().encode("x")], "游离粘贴.txt", { type: "text/plain" }))
    document.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }))
  })
  await expect(page.locator(".attached-file")).toHaveCount(1)
})
