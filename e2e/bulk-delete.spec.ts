/**
 * 批量删除（2026-08-12）。**跑真实构建产物。**
 *
 * 作者：*「现在会话越来越多了，能否给我来一个批量处理的选项，
 * 我可以批量删除。」*
 *
 * ## 这份用例盯的三件
 *
 * 1. **入口找得到**：它在「会话」那一列的标题上，常驻。
 *    本项目已经因为「悬停才出现的入口」被报过两次「没有这个功能」。
 * 2. **数字是真的**：确认框上写着要删几段。*「删掉 2 段对话」*比
 *    *「删掉选中的」*可判断得多——按下之前就该知道自己要删掉几个。
 * 3. **删完真的少了那么多，而且没多删**。选两条删两条，第三条要还在。
 */
import Database from "better-sqlite3"
import { test, expect, 开一段临时会话 } from "./fixtures.js"

/** 开一段并说一句，好让它在侧栏上有个认得出的名字 */
async function 开一段(page: import("@playwright/test").Page, 话: string, 第几个: number) {
  await 开一段临时会话(page)
  await expect(page.locator(".sidebar .sess-item")).toHaveCount(第几个)
  const box = page.getByPlaceholder(/回车发送/)
  await expect(box).toHaveValue("")
  await box.fill(话)
  await box.press("Enter")
  await expect(page.locator(".session-list .sess .name").filter({ hasText: 话 })).toBeVisible()
}

test("**选两条，删两条，第三条还在**", async ({ dawn }) => {
  const { page } = dawn
  await 开一段(page, "留着的", 1)
  await 开一段(page, "要删的甲", 2)
  await 开一段(page, "要删的乙", 3)

  // ① 入口常驻在分区标题上
  const 选择 = page.getByRole("button", { name: "多选" })
  await expect(选择).toBeVisible()
  await 选择.click()

  // ② 勾两条
  await page.getByRole("checkbox", { name: /要删的甲/ }).check()
  await page.getByRole("checkbox", { name: /要删的乙/ }).check()
  await expect(page.locator(".side-bulk-count")).toHaveText("已选 2")

  // ③ 确认框摆真数字，并把「不会发生什么」说在前面
  await page.locator(".side-bulkbar").getByRole("button", { name: "删除" }).click()
  await expect(page.locator(".confirm")).toContainText("删除这 2 段对话")
  await expect(page.locator(".confirm-safety")).toContainText("账本不动")
  await page.locator(".confirm").getByRole("button", { name: /删除 2 段/ }).click()

  // ④ **少了正好两条，且留下的是那一条**
  await expect(page.locator(".sidebar .sess-item")).toHaveCount(1, { timeout: 30_000 })
  await expect(page.locator(".session-list .sess .name")).toHaveText("留着的")

  // ⑤ 删完自动收摊：勾选框不该还挂在那儿
  await expect(page.locator(".sess-check")).toHaveCount(0)
})

test("**全选是全选，再点一次是全不选**", async ({ dawn }) => {
  const { page } = dawn
  await 开一段(page, "甲", 1)
  await 开一段(page, "乙", 2)

  await page.getByRole("button", { name: "多选" }).click()
  await page.getByRole("button", { name: "全选" }).click()
  await expect(page.locator(".side-bulk-count")).toHaveText("已选 2")
  await page.getByRole("button", { name: "全不选" }).click()
  await expect(page.locator(".side-bulk-count")).toHaveText("已选 0")

  /**
   * **一条都没选时删不动**。
   * 一颗按得下去、按了什么都不发生的按钮，与坏掉的没有区别。
   */
  const 删 = page.locator(".side-bulkbar").getByRole("button", { name: "删除" })
  await expect(删).toBeDisabled()
})

test("**「完成」退出选择模式，什么都不删**", async ({ dawn }) => {
  const { page } = dawn
  await 开一段(page, "不该被删的", 1)

  await page.getByRole("button", { name: "多选" }).click()
  await page.getByRole("checkbox", { name: /不该被删的/ }).check()
  await page.getByRole("button", { name: "完成" }).click()

  await expect(page.locator(".sess-check")).toHaveCount(0)
  await expect(page.locator(".sidebar .sess-item")).toHaveCount(1)
})

/**
 * **界面不认识那段会话，也要删得掉**（2026-08-12）。
 *
 * 作者：*「我看现在还有一些历史遗留的对话，我建议全都删除掉，
 * 因为我现在无法删除。」*
 *
 * 根因不在数据，在界面：它手上只有「当前项目 + 临时」两拨会话摘要，
 * 而迁移过来的任务指向别的项目——**查不到摘要，那一行就退化成纯文字，
 * 没有 `⋯`、也进不了批量**。删除因此需要只认 `taskId`（协议 4.9）。
 *
 * 这条用例造的正是那种行：一个**指向根本不存在的会话**的任务。
 * 它比迁移数据更极端，而**极端的那一头能删，中间的就都能删**。
 */
test("**指向不存在会话的任务，照样删得掉**", async ({ dawn }) => {
  const { page } = dawn

  await page.evaluate(async () => {
    const w = window as unknown as {
      dawn: { invoke: (op: string, req: unknown) => Promise<unknown> }
    }
    const p = (await w.dawn.invoke("getProviders", {})) as { data?: { agents?: { agentId: string }[] } }
    await w.dawn.invoke("createTask", { agentId: p.data?.agents?.[0]?.agentId })
  })
  await page.reload()
  await expect(page.locator(".sidebar .sess-item")).toHaveCount(1, { timeout: 30_000 })

  /**
   * 把那条**会话记录**从库里抹掉，任务留着——**「历史遗留」的真实形状**。
   *
   * 不走 `deleteSession`：它现在会连着把任务一起删（2026-08-12 补的），
   * 那样造不出孤儿。直接动库是这里唯一造得出这个形状的办法，
   * 而这个形状是作者**真的遇到了**的。
   */
  const db = new Database(dawn.dbPath)
  db.prepare("DELETE FROM sessions").run()
  db.close()
  await page.reload()

  /**
   * 这一行还在，**而且它有删除键**。
   * 上一版这里是一行纯文字——点不了、勾不了、永远留在列表里。
   */
  const 行 = page.locator(".sidebar .sess-item")
  await expect(行).toHaveCount(1, { timeout: 30_000 })
  await 行.getByRole("button", { name: /删除会话/ }).click()
  await page.locator(".confirm").getByRole("button", { name: /删除 1 段/ }).click()

  await expect(page.locator(".sidebar .sess-item")).toHaveCount(0, { timeout: 30_000 })
})
