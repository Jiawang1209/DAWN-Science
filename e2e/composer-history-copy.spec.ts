/**
 * ↑/↓ 翻自己说过的话；一键复制（2026-08-11，作者提）。**跑真实构建产物。**
 *
 * 作者：*「我现在对话，我能否使用箭头上和箭头下，翻阅历史记录，
 * 此外，我的对话能否在对话里面一键复制？类似于 codex。」*
 *
 * ## 为什么这两件都得在真产物上验
 *
 * - **翻历史**牵涉光标位置（只在最前/最后才翻），jsdom 里的
 *   `selectionStart` 与真浏览器不是一回事。
 * - **复制**在单测里是个假的 clipboard，验它等于验我自己写的桩。
 */
import { test, expect, 开一段临时会话 } from "./fixtures.js"

test("**↑ 翻回上一句，↓ 翻回没发出去的那半句**", async ({ dawn }) => {
  const { page } = dawn
  await 开一段临时会话(page)
  const 输入 = page.getByPlaceholder(/回车发送/)

  for (const 话 of ["第一句", "第二句"]) {
    await 输入.fill(话)
    await page.getByRole("button", { name: "发送", exact: true }).click()
    await expect(page.locator(".turns")).toContainText(话, { timeout: 30_000 })
  }

  // 手上先写半句——**翻历史不该把它弄丢**
  await 输入.fill("写了一半的")
  await 输入.press("ArrowUp")
  await expect(输入).toHaveValue("第二句")
  await 输入.press("ArrowUp")
  await expect(输入).toHaveValue("第一句")

  // 往回翻到底，回到自己写的那半句
  await 输入.press("ArrowDown")
  await expect(输入).toHaveValue("第二句")
  await 输入.press("ArrowDown")
  await expect(输入).toHaveValue("写了一半的")
})

test("**多行草稿里按 ↑ 是上移一行，不是换掉整段**", async ({ dawn }) => {
  const { page } = dawn
  await 开一段临时会话(page)
  const 输入 = page.getByPlaceholder(/回车发送/)
  await 输入.fill("说过的一句")
  await page.getByRole("button", { name: "发送", exact: true }).click()
  await expect(page.locator(".turns")).toContainText("说过的一句", { timeout: 30_000 })

  // 两行草稿，光标停在第二行末尾
  await 输入.fill("第一行\n第二行")
  await 输入.press("ArrowUp")
  /**
   * 光标不在最前，所以这一下**只是移动光标**——草稿一个字都不该变。
   * 照抄 shell 的话，这里会把人写了一半的两行直接换掉。
   */
  await expect(输入).toHaveValue("第一行\n第二行")
})

test("**一键复制**：复制的是原文，且看得见它复制成功了", async ({ dawn, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"])
  const { page } = dawn
  await 开一段临时会话(page)
  await page.getByPlaceholder(/回车发送/).fill("要被复制走的这句")
  await page.getByRole("button", { name: "发送", exact: true }).click()
  await expect(page.locator(".turns")).toContainText("要被复制走的这句", { timeout: 30_000 })

  const 那颗 = page.getByRole("button", { name: "复制我说的这段" }).first()
  // **常驻，不是悬停才出现**：`toBeVisible()` 对 opacity:0 仍然算可见，所以直接量
  expect(Number(await 那颗.evaluate((el) => getComputedStyle(el).opacity))).toBeGreaterThan(0.2)
  await 那颗.click()

  // 点了要有反馈——否则人会怀疑自己没点上，然后再点几次
  await expect(page.locator(".copy-btn").first()).toContainText("✓")

  const 剪贴板 = await page.evaluate(() => navigator.clipboard.readText())
  expect(剪贴板).toBe("要被复制走的这句")
})
