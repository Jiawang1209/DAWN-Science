/**
 * **消息里的外链去系统浏览器，不在应用里新开一个裸窗口**（批 0，2026-08-18）。
 *
 * ## 这一条修的是一个已经存在的洞
 *
 * `markdown.tsx` 把链接渲染成 `<a target="_blank">`，注释写着
 * *「外链在桌面应用里点开应当去系统浏览器」*——**而代码没做这件事**：
 * 主进程里没有 `setWindowOpenHandler`，Electron 的默认动作是 `allow`。
 * 探针量到的现状是**窗口数 1 → 2**：多出来一个装着那个网站的 Electron 窗口，
 * **没有地址栏、没有后退**，人看不出自己在哪儿。
 *
 * ## 为什么判据是「窗口数不变」而不是「浏览器开了」
 *
 * 真的去开浏览器，每跑一次 e2e 就往人脸上弹十几个标签页——
 * 那与 `show: false` 是同一个理由（会让人少跑测试）。
 * 所以夹具给了 `DAWN_NO_EXTERNAL`，主进程那时只记账不打开。
 * **这里验的是「没有在应用里开窗口」**，那正是这条修的东西。
 */
import { test, expect, 开一段临时会话 } from "./fixtures.js"

test.use({
  dawnOptions: {
    toolCall: {
      toolName: "bash",
      args: { command: "echo hi" },
      say: "去看这个 [本机页面](http://127.0.0.1:59999/) 吧",
    },
  },
})

test("**点消息里的外链，不会多出一个 Electron 窗口**", async ({ dawn }) => {
  const { app, page } = dawn
  await 开一段临时会话(page)
  await page.getByPlaceholder(/今天帮你做些什么/).fill("给我个链接")
  await page.getByRole("button", { name: "发送", exact: true }).click()

  const 链 = page.locator("a[href^='http']").first()
  await expect(链).toBeVisible({ timeout: 30_000 })

  const 数窗口 = () => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)
  const 前 = await 数窗口()
  await 链.click()
  /**
   * **等一会儿再数**。`setWindowOpenHandler` 是同步拒绝的，而修之前那条路
   * 要新建一个窗口并加载页面——**不等的话，坏的那一版也会「暂时还只有一个窗口」**，
   * 判据于是永远绿。（2026-08-18 探针踩过同型的错：在工具还 running 时就读账本。）
   */
  await page.waitForTimeout(2500)
  expect(await 数窗口(), "点一个外链之后多出了 Electron 窗口").toBe(前)

  // **主窗口自己也没有被导航走**——那会把整个应用换成一个网页，而且回不来
  const 主 = await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().map((w) => w.webContents.getURL()),
  )
  expect(主.every((u) => u.includes("/dist/ui/")), `窗口们跑到别处去了：${主.join(" | ")}`).toBe(true)
})
