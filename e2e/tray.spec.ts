import { test, expect, 在项目里开会话 } from "./fixtures.js"

test.use({ dawnOptions: { env: { DAWN_TEST_TRAY: "1" } } })
test("关闭主窗口保留会话和窗口，应用退出仍可正常收摊", async ({ dawn }) => {
  const { app, page } = dawn
  await 在项目里开会话(page)
  const 框 = page.getByPlaceholder(/今天帮你做些什么/)
  await 框.fill("托盘草稿")
  const state = await app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0]!
    win.close()
    return { destroyed: win.isDestroyed(), visible: win.isVisible(), windows: BrowserWindow.getAllWindows().length }
  })
  expect(state).toEqual({ destroyed: false, visible: false, windows: 1 })
  await expect(框).toHaveValue("托盘草稿")
  // 单向托盘事件使用与侧栏相同的新建入口，不创建虚假的空会话。
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]!.webContents.send("dawn:tray-new-task")
  })
  await expect(page.getByRole("heading", { name: "开始一段对话" })).toBeVisible()
})
