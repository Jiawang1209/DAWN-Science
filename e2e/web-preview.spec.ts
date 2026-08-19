/**
 * 网页预览那一格（批 1，2026-08-18）。
 *
 * ## 这一条为什么长得跟别的 e2e 都不一样
 *
 * 真正的网页是主进程里一个 `WebContentsView`，它**浮在整个 DOM 之上**。
 * spike 实测：**窗口自己的 `capturePage()` 截不到它**（那一栏是空白）。
 * 于是 Playwright 的 `page.locator(...)` **一个都命不中**，
 * 十张视觉基线也看不见它。
 *
 * **所以判据一律走 `app.evaluate` 进主进程去问那个 view。**
 * 拿 DOM 断言凑数的话，这一整块会「绿得毫无意义」——
 * 而那正是这个项目栽过三次的形状。
 */
import { test, expect, readRuns, 开一段临时会话, 在项目里开会话, 进坞 } from "./fixtures.js"
import { createServer, type Server } from "node:http"

/** 进坞里的「网页」那一格 */
const 进网页 = (page: import("@playwright/test").Page) => 进坞(page, "网页")

/** 主进程里那个 view 现在什么样。**没有就返回 undefined**——「还没建」是一个答案 */
async function 视图(app: import("@playwright/test").ElectronApplication) {
  return app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows().find((x) => x.webContents.getURL().includes("/dist/ui/"))
    const kid = w?.contentView.children.find(
      (c) => (c as unknown as { webContents?: unknown }).webContents !== undefined,
    ) as unknown as
      | { webContents: { getURL(): string; getTitle(): string }; getBounds(): { x: number; y: number; width: number; height: number }; getVisible(): boolean }
      | undefined
    if (!kid) return undefined
    return { url: kid.webContents.getURL(), title: kid.webContents.getTitle(), bounds: kid.getBounds(), visible: kid.getVisible() }
  })
}

let 服务: Server
let 地址: string

test.beforeAll(async () => {
  服务 = createServer((q, s) => {
    /**
     * **路径一律用 ASCII。**
     *
     * 第一版写的是 `/另一页`，而浏览器发出来的是**百分号编码**过的
     * `/%E5%8F%A6...`——这个 `===` 永远不成立，于是服务器回了首页，
     * 判据红得像「弹窗没接住」，其实弹窗接得好好的（诊断探针当场量到
     * URL 真的变了）。**非 ASCII 留给文件名去验**，见下面那个下载。
     */
    if (q.url === "/second") {
      s.setHeader("content-type", "text/html; charset=utf-8")
      s.end("<!doctype html><meta charset=utf-8><title>另一页</title><h1>弹窗落到这儿了</h1>")
      return
    }
    if (q.url === "/download.csv") {
      s.setHeader("content-type", "text/csv; charset=utf-8")
      /**
       * **HTTP 头只装得下 latin-1**，中文文件名要走 RFC 5987 的 `filename*`。
       * 直接写中文会让 node 抛 `Invalid character in header content`——
       * 这条判据当场撞到了，而它值得留着：**非 ASCII 的文件名是科研数据的常态**。
       */
      s.setHeader("content-disposition", "attachment; filename*=UTF-8''%E4%B8%8B%E8%BD%BD%E6%88%91.csv")
      s.end("a,b\n1,2\n")
      return
    }
    s.setHeader("content-type", "text/html; charset=utf-8")
    s.end("<!doctype html><meta charset=utf-8><title>本机页</title><h1>DAWN_网页预览_物证</h1>")
  })
  await new Promise<void>((ok) => 服务.listen(0, "127.0.0.1", () => ok()))
  地址 = `127.0.0.1:${(服务.address() as { port: number }).port}`
})
test.afterAll(() => 服务.close())

test("**地址栏输一个本机地址，那个页面真的加载了**", async ({ dawn }) => {
  const { app, page } = dawn
  await 开一段临时会话(page)
  await 进网页(page)

  // 还没开任何东西时**不该已经起了一个 web contents**（懒建）
  expect(await 视图(app), "没人开过网页，却已经起了一个视图").toBeUndefined()

  await page.getByRole("textbox", { name: "网址" }).fill(地址)
  await page.getByRole("textbox", { name: "网址" }).press("Enter")

  await expect.poll(async () => (await 视图(app))?.title, { timeout: 30_000 }).toBe("本机页")
  const v = await 视图(app)
  expect(v!.url).toContain(地址)
  expect(v!.visible, "加载完了却是藏着的").toBe(true)
})

test("**它的位置跟着坞走** —— 拖宽之后那块网页也得跟着宽", async ({ dawn }) => {
  const { app, page } = dawn
  await 开一段临时会话(page)
  await 进网页(page)
  await page.getByRole("textbox", { name: "网址" }).fill(地址)
  await page.getByRole("textbox", { name: "网址" }).press("Enter")
  await expect.poll(async () => (await 视图(app))?.title, { timeout: 30_000 }).toBe("本机页")

  const 窄 = (await 视图(app))!.bounds.width
  // 坞的宽度是持久化的状态，直接改它比拖那条缝稳
  await page.evaluate(() => localStorage.setItem("dawn.global.right-dock-width", "620"))
  await page.reload()
  await 进网页(page)
  await expect.poll(async () => (await 视图(app))?.bounds.width ?? 0, { timeout: 30_000 }).toBeGreaterThan(窄 + 100)
})

test("**有浮层挡着就藏起来** —— 它的 z-index 对命令面板无效", async ({ dawn }) => {
  const { app, page } = dawn
  await 开一段临时会话(page)
  await 进网页(page)
  await page.getByRole("textbox", { name: "网址" }).fill(地址)
  await page.getByRole("textbox", { name: "网址" }).press("Enter")
  await expect.poll(async () => (await 视图(app))?.visible, { timeout: 30_000 }).toBe(true)

  /**
   * 命令面板是 HTML，而那个 view 浮在所有 HTML 之上——**不藏的话，
   * 人按下 ⌘K 会看到面板被一块网页盖掉一半**。
   */
  await page.keyboard.press(process.platform === "darwin" ? "Meta+k" : "Control+k")
  await expect.poll(async () => (await 视图(app))?.visible, { timeout: 15_000 }).toBe(false)

  await page.keyboard.press("Escape")
  await expect.poll(async () => (await 视图(app))?.visible, { timeout: 15_000 }).toBe(true)
})

/**
 * **批 3 起：外网也开得了**（作者定的第二期「其次是任意网站」）。
 *
 * 这一条**替换了批 1 那条「外网被拦下」**——不是删掉判据，是那个行为
 * 按作者定的分期变了。判据也跟着从「拦住了吗」变成「**真的放行了吗**」。
 *
 * **不打外网**：判据是「那个 view 被建出来并且开始导航了」。
 * 批 3 之前，一个外网地址在门那儿就被拒了，`保证有()` 根本不会被调到，
 * **一个 view 都不会有**——所以「有 view」这件事本身就是判据。
 */
test("**外网现在开得了** —— 门放行了，view 真的建出来了", async ({ dawn }) => {
  const { app, page } = dawn
  await 开一段临时会话(page)
  await 进网页(page)
  expect(await 视图(app), "还没开任何东西就有了 view").toBeUndefined()

  await page.getByRole("textbox", { name: "网址" }).fill("https://example.com/")
  await page.getByRole("textbox", { name: "网址" }).press("Enter")

  await expect.poll(async () => (await 视图(app)) !== undefined, { timeout: 30_000 }).toBe(true)
  // 门那句「不是本机」不该再出现——它已经不是判据了
  await expect(page.getByText(/不是本机/)).toHaveCount(0)
})

test("**工作目录外的 `file:` 仍然拦下** —— 放开的只有 http(s)", async ({ dawn }) => {
  const { page } = dawn
  await 开一段临时会话(page)
  await 进网页(page)

  await page.getByRole("textbox", { name: "网址" }).fill("file:///etc/passwd")
  await page.getByRole("textbox", { name: "网址" }).press("Enter")

  /**
   * **说得出为什么**，不是静默跳回去。
   *
   * ## 这里为什么盯 `.webview-error` 而不是「页面上有没有『工作目录』这四个字」
   *
   * 上一版写的是 `getByText(/工作目录/)`，而 composer 上那颗按钮叫
   * **「选择工作目录」**——同一个正则一次命中两个元素。后果是这条用例
   * **抖，而且抖的方向最坏**：
   *
   *   - 守卫**没生效**（错误提示不出现）→ 只匹配到那颗按钮 → 一次轮询就绿；
   *   - 守卫**生效了**（提示出现）→ 两个元素 → strict mode violation → 红。
   *
   * **它在功能坏掉时通过，在功能正常时才可能失败。** 2026-08-19 在
   * 干净的 main 上连跑三次：红、绿、红——它一直是这样，只是从前
   * 每次都恰好在提示渲染之前完成了第一次轮询。
   *
   * 这正是本仓库那条「两处长得一样的东西，等于没有判据」的第四次现形，
   * 而按名字/文本找东西**是子串匹配**这一条也在设计契约里写着。
   * 所以改成挑**只有目标状态才有**的东西：那句提示自己的类名。
   */
  const 提示 = page.locator(".webview-error")
  await expect(提示).toBeVisible({ timeout: 15_000 })
  await expect(提示).toContainText("工作目录外面")
})

test("**一句话不是地址** —— 说它不像地址，不去把它当域名解析", async ({ dawn }) => {
  const { app, page } = dawn
  await 开一段临时会话(page)
  await 进网页(page)

  await page.getByRole("textbox", { name: "网址" }).fill("这不是一个地址")
  await page.getByRole("textbox", { name: "网址" }).press("Enter")

  await expect(page.getByText(/不像一个地址/)).toBeVisible({ timeout: 15_000 })
  expect(await 视图(app), "把一句话当域名去解析了").toBeUndefined()
})

test("**切到别的房客要藏起来，切回来还是那一页**（没被销毁）", async ({ dawn }) => {
  const { app, page } = dawn
  await 开一段临时会话(page)
  await 进网页(page)
  await page.getByRole("textbox", { name: "网址" }).fill(地址)
  await page.getByRole("textbox", { name: "网址" }).press("Enter")
  await expect.poll(async () => (await 视图(app))?.title, { timeout: 30_000 }).toBe("本机页")

  await 进坞(page, "审阅")
  // **不藏的话它会继续盖在「审阅」上面**，那看起来就像审阅那一格坏了
  await expect.poll(async () => (await 视图(app))?.visible, { timeout: 15_000 }).toBe(false)

  await 进坞(page, "网页")
  await expect.poll(async () => (await 视图(app))?.visible, { timeout: 15_000 }).toBe(true)
  // 还是那一页——**切走不该把它销毁**，不然回来是一片空白
  expect((await 视图(app))!.title).toBe("本机页")
})

/**
 * ── 放开任意网站之后，守卫全在这一段（批 3）────────────────────────
 *
 * 门那一层已经不看主机名了。**真正的边界是这个渲染进程被允许接触什么**，
 * 所以下面三条才是这一批真正的判据。
 *
 * **驱动那个页面只能靠 `executeJavaScript`**：Playwright 够不着它
 * （它不是 DOM、不是 window）。
 */
async function 在页面里跑(app: import("@playwright/test").ElectronApplication, js: string) {
  return app.evaluate(async ({ BrowserWindow }, 代码) => {
    const w = BrowserWindow.getAllWindows().find((x) => x.webContents.getURL().includes("/dist/ui/"))
    const k = w?.contentView.children.find(
      (c) => (c as unknown as { webContents?: unknown }).webContents !== undefined,
    ) as unknown as { webContents: { executeJavaScript(s: string, gesture?: boolean): Promise<unknown> } } | undefined
    /**
     * **`userGesture: true` 不是可选的**：没有它，`window.open` 会被
     * 弹窗拦截器直接挡掉，`setWindowOpenHandler` 一次都不会被调到——
     * 判据于是红得像功能坏了，其实是探针少了一个参数（当场踩的）。
     */
    return k?.webContents.executeJavaScript(代码, true)
  }, js)
}

async function 开一页(page: import("@playwright/test").Page, 到: string) {
  await 进网页(page)
  await page.getByRole("textbox", { name: "网址" }).fill(到)
  await page.getByRole("textbox", { name: "网址" }).press("Enter")
}

test("**页面自己开新窗口时，就在这一栏里走** —— 不新开 Electron 窗口", async ({ dawn }) => {
  const { app, page } = dawn
  await 开一段临时会话(page)
  await 开一页(page, 地址)
  await expect.poll(async () => (await 视图(app))?.title, { timeout: 30_000 }).toBe("本机页")

  const 窗口数 = () => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)
  const 前 = await 窗口数()
  await 在页面里跑(app, `window.open("/second", "_blank")`)

  // **在同一栏里导航过去**：批 1 时这里是一律 deny，那会让人点了没反应
  await expect.poll(async () => (await 视图(app))?.title, { timeout: 30_000 }).toBe("另一页")
  expect(await 窗口数(), "页面弹出了一个 Electron 窗口").toBe(前)
})

test("**权限一律拒** —— 不摆一个假的授权流程", async ({ dawn }) => {
  const { app, page } = dawn
  await 开一段临时会话(page)
  await 开一页(page, 地址)
  await expect.poll(async () => (await 视图(app))?.title, { timeout: 30_000 }).toBe("本机页")

  /**
   * 「问一句人」需要一条主进程↔界面的往返，而那条今天还不存在
   * （`Settings.tsx` 权限那一节如实写着同一件事）。
   * **不存在的能力不该看起来存在**——所以是干脆地拒。
   */
  expect(await 在页面里跑(app, `Notification.requestPermission()`)).toBe("denied")
})

test("**下载落到设置里那个下载目录**，不另起一套", async ({ dawn }) => {
  const { app, page, dir } = dawn
  const { existsSync, readdirSync } = await import("node:fs")
  await 开一段临时会话(page)
  await 开一页(page, 地址)
  await expect.poll(async () => (await 视图(app))?.title, { timeout: 30_000 }).toBe("本机页")

  await 在页面里跑(app, `location.href = "/download.csv"`)

  // 夹具把下载目录指到隔离目录里（`DAWN_DOWNLOADS`），落点就该在那儿
  const 下载目录 = `${dir}/downloads`
  await expect
    .poll(() => (existsSync(下载目录) ? readdirSync(下载目录) : []), { timeout: 30_000 })
    .toContain("下载我.csv")
})

/**
 * **下载落一条 Run**（批 4，2026-08-18，作者选的乙）。
 *
 * 看网页不记（那不改变任何东西），**下载记**——它是数据进入这个项目的入口，
 * 而那个 URL 在别的任何地方都不出现。
 *
 * **这个 URL 是观察不是转述**：请求是我们自己发的。
 * `agent的浏览器` 那份 spec 里「URL 验不了」那条禁令拦的是模型自述，
 * 在这里不成立——两者的区别正是这条判据存在的理由。
 */
test("**下载在账本上留得下：URL、落点、字节数**", async ({ dawn }) => {
  const { app, page, dbPath } = dawn
  // **要在项目里**：Run 挂在项目的活会话上，临时会话没有项目就不记
  await 在项目里开会话(page)
  await 开一页(page, 地址)
  await expect.poll(async () => (await 视图(app))?.title, { timeout: 30_000 }).toBe("本机页")

  await 在页面里跑(app, `location.href = "/download.csv"`)

  const 那条 = async () =>
    (await readRuns(dbPath)).map((r) => String(r.request_type)).find((t) => t.startsWith("web_download:"))
  await expect.poll(那条, { timeout: 30_000 }).toBeDefined()

  const t = (await 那条())!
  expect(t, "账本上没写它从哪儿来").toContain("/download.csv")
  expect(t, "账本上没写它落到哪儿").toContain("下载我.csv")
  // **字节数也要在**：一个 0 字节的「成功」是要看得出来的
  expect(t).toMatch(/\(\d+B\)/)
})

test("**没有项目就不记，也不报错** —— 不硬挂，把 A 的账算到 B 头上比不记更坏", async ({ dawn }) => {
  const { app, page, dbPath } = dawn
  await 开一段临时会话(page) // 临时会话不属于任何项目
  await 开一页(page, 地址)
  await expect.poll(async () => (await 视图(app))?.title, { timeout: 30_000 }).toBe("本机页")

  await 在页面里跑(app, `location.href = "/download.csv"`)
  const { existsSync, readdirSync } = await import("node:fs")
  // 文件照样下下来——**不记账不等于不干活**
  await expect
    .poll(() => (existsSync(`${dawn.dir}/downloads`) ? readdirSync(`${dawn.dir}/downloads`) : []), { timeout: 30_000 })
    .toContain("下载我.csv")

  expect(
    (await readRuns(dbPath)).map((r) => String(r.request_type)).filter((t) => t.startsWith("web_download:")),
    "没有项目却硬挂了一条账",
  ).toEqual([])
})
