/**
 * 导出落到哪（2026-08-27，fix-notebook，作者定的）：
 * 项目会话 → 项目根目录下的 `docs/`；普通会话 → 下载路径（`codex-polish.spec.ts` ④ 已经验了那一半）。
 */
import { test, expect, CANNED_REPLY, 在项目里开会话 } from "./fixtures.js"
import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

test.use({ dawnOptions: { gitInit: true } })

async function 说(page: import("@playwright/test").Page, 话: string): Promise<void> {
  await page.getByPlaceholder(/今天帮你做些什么/).fill(话)
  await page.keyboard.press("Enter")
  await expect(page.locator(".turns").getByText(话, { exact: true })).toBeVisible()
  await expect(page.locator(".turns .turn.agent").last()).toContainText(CANNED_REPLY, { timeout: 30_000 })
}

test("项目会话「导出对话」→ 文件落在 <项目>/docs/，不在下载目录", async ({ dawn }) => {
  const { page, dir, workspace } = dawn
  await 在项目里开会话(page)
  await 说(page, "项目里的一句")
  const 头 = page.locator(".conv-head")
  await 头.getByRole("button", { name: "导出对话" }).click()
  const 提示 = 头.locator(".export-toast")
  await expect(提示).toContainText("已导出 1 轮")
  await expect(提示).toContainText(join(workspace, "docs"))

  const docs = join(workspace, "docs")
  await expect.poll(() => existsSync(docs) && readdirSync(docs).some((f) => f.endsWith(".md"))).toBe(true)
  const 文件 = readdirSync(docs).find((f) => f.endsWith(".md"))!
  expect(readFileSync(join(docs, 文件), "utf8")).toContain("项目里的一句")
  const 下载 = join(dir, "downloads")
  expect(existsSync(下载) ? readdirSync(下载) : []).toEqual([])
})
