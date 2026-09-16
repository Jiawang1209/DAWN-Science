/**
 * 贴底跟随：**丢掉一次 `mouseup` 之后，新内容照样要跟到底**（2026-09-08 作者报的）。
 *
 * 作者的话：*「有时候我鼠标不在 DAWN 了，分析的新内容竟然不往下弹，
 * 我需要点击之后才会弹到最新内容。」*
 *
 * ## 根因（量出来的，不是想出来的）
 *
 * `use-stick-to-bottom@1.1.6` 里有一个**模块级全局**：
 *
 * ```js
 * let mouseDown = false
 * document.addEventListener("mousedown", () => { mouseDown = true })
 * document.addEventListener("mouseup",   () => { mouseDown = false })
 * document.addEventListener("click",     () => { mouseDown = false })
 * ```
 *
 * 它只在 `mouseup` / `click` 上清。而**这两下是会丢的**：右键弹出系统菜单、
 * 按住拖到窗口外面松手、按着的时候切走应用、HTML5 拖拽（拖完根本不发 mouseup）。
 * 丢掉之后 `mouseDown` 永远是 true，只要转录里还有一个选区（点一下正文就有），
 * `isSelecting()` 就恒为真——而贴底动画每一帧都问它：
 *
 * ```js
 * if (isSelecting()) return next()   // 空转，一直不滚
 * ```
 *
 * 于是新内容长出来、视图不动；**下一次点击**把标志清掉，那个还在空转的动画
 * 立刻接着跑完——就是作者看到的「点一下才弹到最新」。
 *
 * 探针实测（修之前）：新内容到达后离底 **98px**，点一下之后 **1px**。
 */
import { expect } from "@playwright/test"
import { test, 开一段临时会话 } from "./fixtures.js"

/**
 * 真正在滚的是 `.turns > div`——`StickToBottom.Content` 自己造的那一层（`height:100%`），
 * 不是我们写了 `overflow:auto` 的 `.turns`。**量错元素会得到一组永远贴底的假数字**
 * （`.turns` 的 scrollHeight 恒等于 clientHeight）。
 */
const 滚的是 = ".turns > div"

async function 灌几轮(page: import("@playwright/test").Page, 句们: string[]): Promise<void> {
  const 框 = page.getByPlaceholder(/今天帮你做些什么/)
  for (const s of 句们) {
    await 框.fill(s)
    await 框.press("Enter")
    await page.locator(".turns").getByText(s, { exact: true }).waitFor({ timeout: 30_000 })
    await page.waitForTimeout(2_800)
  }
}

/** 离底还差多少像素。0 附近 = 贴着底 */
async function 离底(page: import("@playwright/test").Page): Promise<number> {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel) as HTMLElement
    return Math.round(el.scrollHeight - el.clientHeight - el.scrollTop)
  }, 滚的是)
}

test.describe("贴底跟随", () => {
  test.use({ dawnOptions: { firstChunkDelayMs: 2_500 } })

  test("丢了一次 mouseup，新内容照样跟到底", async ({ dawn }) => {
    const { app, page } = dawn
    await 开一段临时会话(page, "开始")
    // 把窗口调小，让转录区真的溢出——不溢出就没有「跟不跟随」这回事
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(900, 560))
    await page.waitForTimeout(400)
    await 灌几轮(page, ["第一句话", "第二句话", "第三句话"])

    // 基线：什么都不做时本来就跟随
    await 灌几轮(page, ["基线这一句"])
    expect(await 离底(page)).toBeLessThan(20)

    // 发一句，让它开始流式；**选区要在发送之后建**——
    // 把焦点放进输入框会把文档选区一起清掉
    await page.evaluate(() => (document.querySelector("textarea.composer-field") as HTMLTextAreaElement).focus())
    await page.keyboard.insertText("丢了 mouseup 这一句")
    await page.keyboard.press("Enter")
    await page.waitForTimeout(300)

    // 造出那个状态：转录里有选区 + 一次没有配对 mouseup 的 mousedown
    const 造好了 = await page.evaluate((sel) => {
      const 滚 = document.querySelector(sel) as HTMLElement
      const 段 = 滚.querySelector(".turn")
      if (!段) return false
      const r = document.createRange()
      r.selectNodeContents(段)
      const s = window.getSelection()
      s?.removeAllRanges()
      s?.addRange(r)
      document.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }))
      return Boolean(s && 滚.contains(s.getRangeAt(0).commonAncestorContainer))
    }, 滚的是)
    expect(造好了).toBe(true)

    // 鼠标此后再动一下（人把鼠标挪回 DAWN、或者只是路过）——那时 buttons 是 0，
    // 「按着」这个状态已经是假的了
    await page.mouse.move(450, 300)
    await page.waitForTimeout(5_000)

    // **新内容必须已经跟到底**，不需要谁去点一下
    expect(await 离底(page)).toBeLessThan(20)
  })

  test("人真的按着鼠标在划词时，不许把视线抢走", async ({ dawn }) => {
    const { app, page } = dawn
    await 开一段临时会话(page, "开始")
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(900, 560))
    await page.waitForTimeout(400)
    await 灌几轮(page, ["第一句话", "第二句话", "第三句话"])

    await page.evaluate(() => (document.querySelector("textarea.composer-field") as HTMLTextAreaElement).focus())
    await page.keyboard.insertText("划词期间这一句")
    await page.keyboard.press("Enter")
    await page.waitForTimeout(300)

    // 在转录中间**真的**按下去（不抬起）：这就是人在划词
    const 盒 = await page.locator(滚的是).boundingBox()
    if (!盒) throw new Error("找不到滚动容器")
    await page.mouse.move(盒.x + 60, 盒.y + 应在视口内(盒.height))
    await page.mouse.down()
    const 选在转录里 = await page.evaluate((sel) => {
      const 滚 = document.querySelector(sel) as HTMLElement
      const s = window.getSelection()
      return Boolean(s?.rangeCount && 滚.contains(s.getRangeAt(0).commonAncestorContainer))
    }, 滚的是)
    expect(选在转录里).toBe(true)

    await page.waitForTimeout(5_000)
    // 手还按着 → **不许**把他正看的地方拽走
    expect(await 离底(page)).toBeGreaterThan(20)

    await page.mouse.up()
    await page.waitForTimeout(1_500)
    // 松手之后再补上
    expect(await 离底(page)).toBeLessThan(20)
  })
})

/** 点在滚动区中间偏上：太靠边会落到 padding 上，选不中任何文字 */
function 应在视口内(高: number): number {
  return Math.max(10, Math.round(高 / 2))
}

/**
 * 跟随撒手之后的出路(2026-09-08，规格 `2026-09-08-回到底部浮标-design.md`)。
 *
 * 作者：*「分析的内容不更新，需要我手动往下挪动。」* 丢掉的 `mouseup` 那条已经修了，
 * 这三条盯的是剩下那一半：**撒手之后有没有一个看得见的出路**。
 */
test.describe("回到底部浮标", () => {
  test.use({ dawnOptions: { firstChunkDelayMs: 2_500 } })

  test("**贴着底时一个像素都不画**", async ({ dawn }) => {
    const { app, page } = dawn
    await 开一段临时会话(page, "开始")
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(900, 560))
    await 灌几轮(page, ["第一句话", "第二句话", "第三句话"])
    expect(await 离底(page)).toBeLessThan(20)
    // 跟随好好的时候不该有任何东西挡着——这条是防它变成常驻遮挡物的闸
    await expect(page.locator(".stick-pill")).toHaveCount(0)
  })

  test("**往上翻 → 浮标出现 → 点它 → 回到底且跟随恢复**", async ({ dawn }) => {
    const { app, page } = dawn
    await 开一段临时会话(page, "开始")
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(900, 560))
    await 灌几轮(page, ["第一句话", "第二句话", "第三句话"])

    // 自己往上翻——库的行为是「撒手」，这是对的；要验的是撒手之后有没有出路
    await page.evaluate((sel) => {
      const el = document.querySelector(sel) as HTMLElement
      el.scrollTop = 0
      el.dispatchEvent(new Event("scroll"))
    }, 滚的是)
    await expect(page.locator(".stick-pill")).toHaveCount(1, { timeout: 10_000 })
    // **它自己会说自己是干嘛的**（2026-09-09 换成带字药丸之后）：
    // 上一版是一颗光秃秃的圆点，而设计契约禁原生 title，于是悬停什么都不出
    await expect(page.getByRole("button", { name: "回到底部", exact: true })).toBeVisible()

    await page.locator(".stick-pill").click()
    await expect.poll(async () => 离底(page), { timeout: 10_000 }).toBeLessThan(20)
    // 回到底了，浮标就该消失
    await expect(page.locator(".stick-pill")).toHaveCount(0, { timeout: 10_000 })

    // **跟随真的恢复了**：再灌一轮，不用手动碰它
    await 灌几轮(page, ["恢复之后这一句"])
    expect(await 离底(page)).toBeLessThan(20)
  })

  test("**翻上去之后新内容到达 → 浮标带上字**", async ({ dawn }) => {
    const { app, page } = dawn
    await 开一段临时会话(page, "开始")
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(900, 560))
    await 灌几轮(page, ["第一句话", "第二句话", "第三句话"])

    await page.evaluate((sel) => {
      const el = document.querySelector(sel) as HTMLElement
      el.scrollTop = 0
      el.dispatchEvent(new Event("scroll"))
    }, 滚的是)
    await expect(page.locator(".stick-pill")).toHaveCount(1, { timeout: 10_000 })
    // 刚翻上去说的是「回到底部」，不是「有新内容」——两个状态说的话必须不一样
    await expect(page.getByRole("button", { name: "回到底部", exact: true })).toBeVisible()
    await expect(page.locator(".stick-pill.has-new")).toHaveCount(0)

    // 底下真的长出东西
    await 灌几轮(page, ["翻上去之后来的这一句"])
    await expect(page.locator(".stick-pill.has-new")).toHaveCount(1, { timeout: 15_000 })
    await expect(page.getByRole("button", { name: "有新内容", exact: true })).toBeVisible()
  })
})

/**
 * 对话区只许有一层能滚的容器（2026-09-16）。
 *
 * 作者 2026-08-14 报、2026-09-16 再报的同一条：
 * *「整个对话的容器好像是两层的容器……你看『回到底部』现在位于哪里了？」*
 * 截图里那颗浮标浮在半空中，离 `.turns` 的底 183px（逐像素量的）。
 *
 * ## 根因（量出来的）
 *
 * `Thinking()` 里那颗 `<span class="sr-only">正在思考</span>` 是
 * `position: absolute` 而**四个偏移量一个都不写** → 落在静态位置上。
 * 静态位置在**包含块**的坐标系里算，**不吃中间那层滚动容器的 scrollTop**；
 * 而 `.tool` / `.tool-head`（`.btn`）/ `.turn-body` / `.turns-inner`
 * **没有一个是定位的**，包含块一路逃到 `.turns`（09-08 为浮标加的 `position: relative`）。
 *
 * 正在跑的那一行长在转录末尾，于是这颗 1×1 的隐藏 span 把 `.turns` 的滚动区
 * **撑出去 4117px**（探针实测）。`.turns` 当时还带着 `overflow: auto`，
 * 于是它成了真能滚的第二层：滚轮只要没落在里层就去滚它，
 * 把同样绝对定位的浮标一起拽上去，底下露出大片空白。
 *
 * 09-08 之前 `.turns` 还不是定位祖先，那时包含块是**文档**——
 * 白出来的是整个 App 页面，正是作者最早那句话的形状。**同一个 bug，两个受害者。**
 *
 * 这条用例盯的是修完之后的不变式：**外层永远滚不动，浮标永远贴着外层的底。**
 */
test.describe("对话区只许有一层能滚的容器", () => {
  /**
   * `Thinking()` 渲染出来的那一段，**逐字照抄**（`views.tsx` 的 `function Thinking`）。
   *
   * 为什么要注进去而不是等真的出现：`.thinking` 只在「还在跑 / 还在说」那一瞬存在，
   * 假模型答得太快，密集采样 150 次一次都没抓到。而这条要验的是**布局机理**
   * （绝对定位元素的包含块跑到哪儿去了），标记一模一样就够。
   */
  const 正在跑的工具行 =
    '<div class="tool"><button class="btn btn-ghost btn-inline tool-head">' +
    '<span class="tool-status">run_code</span>' +
    '<span class="thinking" role="status"><span class="sr-only">正在思考</span>' +
    '<span class="dot"></span><span class="dot"></span><span class="dot"></span></span>' +
    "</button></div>"

  test("**转录末尾正在跑的那一行，撑不出第二条滚动条**", async ({ dawn }) => {
    const { app, page } = dawn
    await 开一段临时会话(page, "开始")
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(1000, 700))
    await page.waitForTimeout(400)

    // 一段够长的转录：静态位置逃逸要长转录才看得出来（末尾离 .turns 顶好几千像素）
    const 框 = page.getByPlaceholder(/今天帮你做些什么/)
    await 框.fill(Array.from({ length: 300 }, (_, i) => `第 ${i} 行：把转录撑高一点点。`).join("\n"))
    await 框.press("Enter")
    await page.locator(".turns").getByText("第 299 行：把转录撑高一点点。").waitFor({ timeout: 30_000 })
    await page.waitForTimeout(1_500)

    const 量 = await page.evaluate((标记) => {
      const turns = document.querySelector(".turns") as HTMLElement
      const 之前 = turns.scrollHeight - turns.clientHeight
      const 行 = document.createElement("div")
      行.innerHTML = 标记
      const 节点 = 行.firstElementChild!
      ;(document.querySelector(".turns-inner") as HTMLElement).appendChild(节点)
      const 之后 = turns.scrollHeight - turns.clientHeight
      const sr = 节点.querySelector(".sr-only") as HTMLElement
      // 推一下：`clip` 之下这一下必须毫无作用
      turns.scrollTop = 500
      const 推完 = Math.round(turns.scrollTop)
      const 结 = { 之前, 之后, 推完, overflowY: getComputedStyle(turns).overflowY, srTop: Math.round(sr.getBoundingClientRect().top) }
      节点.remove()
      return 结
    }, 正在跑的工具行)

    // 这一行不许把外层的滚动区撑出去一个像素
    expect(量.之前, "基线：什么都没注入时外层就不该有溢出").toBe(0)
    expect(量.之后, "「正在思考」那颗 .sr-only 把外层撑出去了——它得钉住一个角").toBe(0)
    // 外层根本不是滚动容器，推也推不动
    expect(量.overflowY).toBe("clip")
    expect(量.推完, "外层被滚动过，浮标会跟着被拽上去").toBe(0)
  })

  test("**浮标永远贴着对话区的底，不许浮在半空中**", async ({ dawn }) => {
    const { app, page } = dawn
    await 开一段临时会话(page, "开始")
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(1000, 700))
    await page.waitForTimeout(400)
    await 灌几轮(page, ["第一句话", "第二句话", "第三句话"])

    // 翻上去把浮标叫出来
    await page.evaluate((sel) => {
      const el = document.querySelector(sel) as HTMLElement
      el.scrollTop = 0
      el.dispatchEvent(new Event("scroll"))
    }, 滚的是)
    await expect(page.locator(".stick-pill")).toHaveCount(1, { timeout: 10_000 })

    const 差 = await page.evaluate((标记) => {
      const 量一次 = () => {
        const turns = document.querySelector(".turns") as HTMLElement
        const 药 = document.querySelector(".stick-pill") as HTMLElement
        return Math.round(turns.getBoundingClientRect().bottom - 药.getBoundingClientRect().bottom)
      }
      const 干净 = 量一次()
      // 末尾挂一行正在跑的，再推外层——作者截图里的那个状态
      const 行 = document.createElement("div")
      行.innerHTML = 标记
      const 节点 = 行.firstElementChild!
      ;(document.querySelector(".turns-inner") as HTMLElement).appendChild(节点)
      ;(document.querySelector(".turns") as HTMLElement).scrollTop = 500
      const 挨过推 = 量一次()
      节点.remove()
      return { 干净, 挨过推 }
    }, 正在跑的工具行)

    // `bottom: var(--dawn-space-3)` = 12px。截图里这个数是 183。
    expect(差.干净).toBe(12)
    expect(差.挨过推, "外层被滚下去之后浮标跟着跑了——这正是作者截图里的样子").toBe(12)
  })
})
