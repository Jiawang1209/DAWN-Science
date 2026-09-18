/**
 * 设置先当一条栏（2026-09-16，规格 `2026-09-16-设置右栏-design.md`）。
 *
 * 作者：*「我们点击设置的时候，其实设置页面整体就弹出来了，其实我想要的是
 * 初始是类似于点击面板后的效果，然后也有一个按钮，可以展开。」*
 *
 * 九条判据各自对着一件会悄悄坏掉的事。
 */
import { test, expect, 开一段临时会话 } from "./fixtures.js"
import { RIGHT_DOCK_DEFAULT } from "../src/ui/state/right-dock.js"

/** 侧栏那颗「设置」。**精确匹配**——「设置」是别处按钮文案的子串（那条踩过） */
const 设置键 = (page: import("@playwright/test").Page) =>
  page.getByRole("button", { name: "设置", exact: true })

/**
 * 等这一块**真的画完**再量。
 *
 * 好几块的内容要等 IPC 回来才出现（用量、模型服务、MCP…）。
 * `toHaveText(标题)` 只证明标题换了，证明不了内容到了——此刻量到的是一只
 * 还没长出内容的盒子，它当然不横向溢出。
 *
 * 判据是「静下来」而不是「等某个具体元素」：每一块的内容各不相同，
 * 挨个写等待条件就是十四份会各自漂移的知识。这里盯**后代数 + 内容高**，
 * 连着两拍一样就算画完；上限 2 秒，超时不抛——真没画出来的那几块由调用点
 * 的「空盒子」断言当场点名，比在这儿超时更说得清是哪一块。
 */
async function 等这一块画完(page: import("@playwright/test").Page): Promise<void> {
  let 上一拍 = ""
  for (let i = 0; i < 20; i++) {
    const 这一拍 = await page.evaluate(() => {
      const 盒 = document.querySelector(".settings-column .dock-body")
      return 盒 ? `${盒.querySelectorAll("*").length}/${Math.round(盒.scrollHeight)}` : ""
    })
    if (这一拍 !== "" && 这一拍 === 上一拍) return
    上一拍 = 这一拍
    await page.waitForTimeout(100)
  }
}

/**
 * **等这一栏滑到位，再量任何几何。**
 *
 * `.body` 那条网格带着 `transition: grid-template-columns`（`styles.css` 的
 * `.app-shell .body`），点开那一瞬这一栏是从 0 长出来的。**过渡中间那一帧量到的
 * 不是这一栏的样子**：栏还窄的时候，行里的内容按 min-content 把行撑出去，
 * 于是同一张快照里的行宽彼此不等。
 *
 * 这不是推测，是 2026-09-18 整套 e2e 抓到的：下面那条「`›` 落在同一条右边缘」
 * 报出 `箭头右缘不齐：1266 / 1285 / 1293`——**三个数全都越过了 1280 的视口右缘**，
 * 只有行被撑出去才会这样；滑到位之后它们落在同一条边上。同一份 CSS 紧接着再跑两次
 * 又都是绿的，也就是说**这条判据本身会飘**，而飘的方向是「悄悄变绿」。
 *
 * 那条溢出判据在写的时候也撞过同一件事——不轮询的头两次跑，整栏分别量到 75px 和 76px，
 * 两次都是过渡中间那一帧。所以这里轮询到默认宽度为止，而不是等一个写死的时长。
 *
 * 窗口先放宽到 1400：`.body` 那条网格是 `侧栏 | minmax(420px, 1fr) | minmax(0, 坞宽)`，
 * **第三列的下界是 0**，1280 的默认窗口里这一栏会被夹到 380 以下，
 * 那时轮询「等于 `RIGHT_DOCK_DEFAULT`」永远等不到。
 * `setSize` 是主进程的事，渲染进程要过一拍才看得见，所以先等视口真的宽了再往下走。
 */
async function 等这一栏滑到位(
  app: import("@playwright/test").ElectronApplication,
  page: import("@playwright/test").Page,
): Promise<void> {
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(1400, 900))
  await page.waitForFunction(() => window.innerWidth >= 1380)
  await expect
    .poll(
      () =>
        page.evaluate(() =>
          Math.round((document.querySelector(".settings-column") as HTMLElement).getBoundingClientRect().width),
        ),
      { message: "量错了宽度，下面所有结论都不作数" },
    )
    .toBe(RIGHT_DOCK_DEFAULT)
}

test("**点设置 → 右边出现一条栏，而对话还在**", async ({ dawn }) => {
  const { page } = dawn
  await 开一段临时会话(page, "先说一句")
  await 设置键(page).click()
  await expect(page.locator(".settings-column")).toBeVisible()
  // 对话没有被顶掉——这是整件事的全部意义
  await expect(page.locator(".turns")).toBeVisible()
  // 还没挑，停在名单上
  await expect(page.locator(".settings-column-list")).toBeVisible()
})

test("**名单 → 点一项 → 换成那一项；返回键回名单**", async ({ dawn }) => {
  const { page } = dawn
  await 开一段临时会话(page, "先说一句")
  await 设置键(page).click()
  await page.locator(".settings-column-list").getByRole("button", { name: "外观", exact: true }).click()
  await expect(page.locator(".settings-column-list")).toHaveCount(0)
  await expect(page.locator(".settings-column .dock-title")).toHaveText("外观")
  await page.locator(".settings-column-back").click()
  await expect(page.locator(".settings-column-list")).toBeVisible()
})

test("**⤢ 展开 → 整页，选中项不变；⤡ 收起 → 回栏，仍是同一项**", async ({ dawn }) => {
  const { page } = dawn
  await 开一段临时会话(page, "先说一句")
  await 设置键(page).click()
  await page.locator(".settings-column-list").getByRole("button", { name: "内核", exact: true }).click()

  await page.getByRole("button", { name: "展开", exact: true }).click()
  await expect(page.locator(".settings-shell")).toBeVisible()
  await expect(page.locator(".settings-column")).toHaveCount(0)
  await expect(page.locator(".settings-nav-item.current")).toHaveText(/内核/)

  // 「收回」而不是「收起」：后者是「收起面板」「收起添加模型服务」的子串（`design-contract` 抓的）
  await page.getByRole("button", { name: "收回", exact: true }).click()
  await expect(page.locator(".settings-column")).toBeVisible()
  await expect(page.locator(".settings-column .dock-title")).toHaveText("内核")
})

/**
 * Task 5 那两条 CSS 缺陷的判据（2026-09-16）。它们在 Task 5 那一轮**没有任何测试能证明**——
 * 组件还没人渲染。接线之后它们就能量了，所以在这里补上，别留成「看着还行」。
 */
test("**窄栏的头部不比坞的头高**——`h2` 的浏览器默认外距要被清掉", async ({ dawn }) => {
  const { page } = dawn
  await 开一段临时会话(page, "先说一句")
  await 设置键(page).click()
  await expect(page.locator(".settings-column")).toBeVisible()
  const 外距 = await page.evaluate(() => {
    const t = document.querySelector(".settings-column .dock-title") as HTMLElement
    const cs = getComputedStyle(t)
    return [cs.marginTop, cs.marginBottom]
  })
  // 全局没有标题重置（`*{box-sizing}` 而已），不写 `margin: 0` 就是 UA 的 0.83em ≈ 21.6px
  expect(外距).toEqual(["0px", "0px"])

  /**
   * **上面那条断的是「因」，这一条断「果」。**（Task 5 审查提的）
   * 只断外距的话，将来有人改了 `.dock-head` 的内距、或者让标题变得比工具行还高，
   * 两个头就又不一样高了，而那条断言照样是绿的。
   *
   * 直接比「窄栏的头」和「坞的头」量不了——那条不变式保证它们永远不会同屏。
   * 退而求其次、且与字号无关的判据：**标题不许是头里最高的那个孩子**
   * （实测 20.15 vs 工具行 28.59），因为头高就是由最高的那个定的。
   */
  const 谁更高 = await page.evaluate(() => {
    const 头 = document.querySelector(".settings-column .dock-head") as HTMLElement
    const 标题 = 头.querySelector(".dock-title") as HTMLElement
    const 工具 = 头.querySelector(".settings-column-tools") as HTMLElement
    return { 标题: 标题.getBoundingClientRect().height, 工具: 工具.getBoundingClientRect().height }
  })
  expect(谁更高.标题).toBeLessThanOrEqual(谁更高.工具)
})

test("**十四行的 `›` 落在同一条右边缘**——有没有计数都一样", async ({ dawn }) => {
  const { app, page } = dawn
  await 开一段临时会话(page, "先说一句")
  await 设置键(page).click()
  await expect(page.locator(".settings-column-list")).toBeVisible()
  await 等这一栏滑到位(app, page)
  const 右缘们 = await page.evaluate(() =>
    [...document.querySelectorAll(".settings-column-list .settings-column-arrow")].map((e) =>
      Math.round(e.getBoundingClientRect().right),
    ),
  )
  expect(右缘们.length).toBeGreaterThanOrEqual(14)
  /**
   * **防空转**（Task 5 审查提的）：这一条要证的是「有计数的行和没计数的行，箭头一样齐」。
   * 哪天夹具让十四行全都没有计数，它会绿得毫无意义——**抓不住的判据比没有更坏**。
   * 所以先证这一屏上两种行都在。
   */
  const 有计数几行 = await page.locator(".settings-column-list .side-count").count()
  /**
   * **这个数由用例数出来，不再写在注释里**（2026-09-17）。
   *
   * 「几项没有计数」这条分支已经写错过三次（七 → 九到十 → 又一次七），
   * 每一次都是照抄上一处而不是去数。**注释里的数字没有人验，断言里的有**——
   * 所以把它从一句话改成一条判据，第四次写错在结构上就不可能了。
   *
   * 实测：十四项里**四项**带计数（技能 / 子 agent / 插件 / MCP），
   * 于是**十项**没有。记忆那项是 `记忆待确认数 || undefined`，
   * 夹具里待确认是 0，所以它退成「没有计数」的那一类。
   */
  expect(有计数几行, "一行计数都没有，这条判据就退化成空转了").toBeGreaterThan(0)
  expect(
    有计数几行,
    "带计数的行数变了：要么 `设置分区` 增删了 `count`，要么夹具里记忆有了待确认项。两种都该有人看一眼",
  ).toBe(4)
  expect(
    右缘们.length - 有计数几行,
    "不带计数的行数变了——这一条要证的正是「这十项的箭头跟那四项一样齐」",
  ).toBe(10)
  // 把箭头推到右边的原本是 `.side-count` 的 `margin-left: auto`，所以少了那条规则，
  // 没计数的那十行箭头会贴着标题——同一份名单看起来像两种控件
  expect(new Set(右缘们).size, `箭头右缘不齐：${[...new Set(右缘们)].join(" / ")}`).toBe(1)
})

test("**坞开着 → 开设置 → 坞让位 → 关掉设置 → 坞自己回来**", async ({ dawn }) => {
  const { page } = dawn
  await 开一段临时会话(page, "先说一句")
  await page.getByRole("button", { name: "面板", exact: true }).click()
  await expect(page.locator(".right-dock")).toBeVisible()

  await 设置键(page).click()
  await expect(page.locator(".settings-column")).toBeVisible()
  await expect(page.locator(".right-dock")).toHaveCount(0)

  await page.locator(".settings-column .dock-close").click()
  await expect(page.locator(".settings-column")).toHaveCount(0)
  await expect(page.locator(".right-dock")).toBeVisible()
})

test("**设置栏开着时点「面板」，设置让开、面板真的出来**", async ({ dawn }) => {
  const { page } = dawn
  await 开一段临时会话(page, "先说一句")
  await 设置键(page).click()
  await expect(page.locator(".settings-column")).toBeVisible()
  // 反方向的互斥（2026-09-16 审查抓的）：缺了它这一下就是「点了没反应」——
  // 状态里坞开了，而屏幕上还是设置栏
  await page.getByRole("button", { name: "面板", exact: true }).click()
  await expect(page.locator(".right-dock")).toBeVisible()
  await expect(page.locator(".settings-column")).toHaveCount(0)
})

test("**来时右边空的，走时右边就空的**", async ({ dawn }) => {
  const { page } = dawn
  await 开一段临时会话(page, "先说一句")
  await expect(page.locator(".right-dock")).toHaveCount(0)
  await 设置键(page).click()
  await page.locator(".settings-column .dock-close").click()
  // 不是「关掉设置就给你开个面板」
  await expect(page.locator(".right-dock")).toHaveCount(0)
  await expect(page.locator(".settings-column")).toHaveCount(0)
})

/**
 * **窄栏里不许横向溢出**（Task 7，规格里那句「先量，再改」的自动化形式）。
 *
 * 这不是一条设计偏好，是一条**量得出来的结论**：横向溢出的症状是右半截内容
 * 跑到看不见的地方，而屏幕上没有任何东西说这件事发生了——与 2026-08-19
 * 坞越界那次一模一样。
 *
 * `RIGHT_DOCK_DEFAULT` 是右栏的默认宽度。人可以拖到 `RIGHT_DOCK_MAX`，
 * 但**第一眼看到的是默认那一档**，所以判据钉在这儿（下面先断言它真的是这个宽度，
 * 免得窗口一窄被 `右坞可用最大宽` 夹小之后，这条判据在一个更宽或更窄的栏里空转）。
 *
 * ## 为什么不只量 `.dock-body` 那一只盒子
 *
 * 计划原文量的是 `.settings-column .dock-body` 的 `scrollWidth - clientWidth`，
 * 它答的是「这一栏此刻横着滚不滚」。但**一个子元素自己带 `overflow-x: auto/scroll`
 * 时，它把自己那份溢出吃进肚子里，外面这只盒子照样是 0**——而那恰恰是这一条
 * 要防的东西：计划里写明不许拿 `overflow-x: auto` 把「装不下」改写成
 * 「你自己去找」（与规格 7.5「失败必须出声」正面冲突）。
 * 所以第二把尺子走一遍所有后代，专挑 `overflow-x` 是 `auto`/`scroll`
 * 且真的滚起来了的那些。**这也让「用内层滚动条蒙混过关」这条路在结构上关死**。
 *
 * `overflow: hidden` + `text-overflow: ellipsis` **不算**：省略号在屏幕上
 * 说了「这儿被截了」，它是出声的。`.settings-column .dock-title` 自己就是这么写的。
 *
 * ## 怎么保证量的不是一只空盒子
 *
 * 好几块的内容要等 IPC 回来才画。没画完就量，盒子当然不溢出——**那是一条假绿**。
 * 所以每进一块先等 DOM 静下来（后代数 + 内容高连着两拍不变），
 * 再把「这一块画出了几个元素」一并量回来：空的那几块由底下单独一条断言当场点名，
 * 而不是写在注释里让人相信。
 */
test("**每一块在默认宽度下都不横向溢出**", async ({ dawn }) => {
  const { app, page } = dawn
  await 开一段临时会话(page, "先说一句")
  await 设置键(page).click()
  await expect(page.locator(".settings-column-list")).toBeVisible()
  /** 放宽窗口 + 等这一栏滑到默认那一档。理由写在 `等这一栏滑到位` 上，两条判据共用一份 */
  await 等这一栏滑到位(app, page)

  /**
   * **名单从屏幕上读，不写死条数。** 「工作目录」只在有默认工作区时才在场，
   * 于是这里可能是十三项也可能是十四项——写死一个数，哪天少了一块也照样绿。
   */
  const 名字们 = await page.locator(".settings-column-list .settings-nav-item .name").allTextContents()
  expect(名字们.length, "一块都没读到，这条用例就是空转").toBeGreaterThanOrEqual(13)

  const 挤的: string[] = []
  const 空的: string[] = []
  const 量表: string[] = []
  for (const 名 of 名字们) {
    await page.locator(".settings-column-list").getByRole("button", { name: 名, exact: true }).click()
    await expect(page.locator(".settings-column .dock-title")).toHaveText(名)
    await 等这一块画完(page)
    const 量 = await page.evaluate(() => {
      const 盒 = document.querySelector(".settings-column .dock-body") as HTMLElement
      /** 长相描述，用来在失败信息里指名道姓。SVG 的 `className` 不是字符串，所以要挑一下 */
      const 描述 = (el: Element): string => {
        const c = typeof el.className === "string" ? el.className.trim() : ""
        return el.tagName.toLowerCase() + (c ? `.${c.split(/\s+/).join(".")}` : "")
      }
      const 溢 = 盒.scrollWidth - 盒.clientWidth
      // 内容区的右边界：`clientWidth` 不含滚动条，所以撑出去的东西比它右
      const 右界 = 盒.getBoundingClientRect().left + 盒.clientLeft + 盒.clientWidth
      const 后代 = [...盒.querySelectorAll<HTMLElement>("*")]
      return {
        溢,
        元素数: 后代.length,
        内容高: Math.round(盒.scrollHeight),
        // 谁撑出去的：失败信息里直接给出选择器，不必再开一次 app 用 DevTools 找
        撑出去的: 后代
          .filter((el) => el.getBoundingClientRect().right > 右界 + 1)
          .slice(0, 3)
          .map((el) => `${描述(el)}（右缘超出 ${Math.round(el.getBoundingClientRect().right - 右界)}px）`),
        // 自己把溢出吃掉的内层滚动条——外面那只盒子看不见它
        藏起来的: 后代
          .filter((el) => {
            const ox = getComputedStyle(el).overflowX
            return (ox === "auto" || ox === "scroll") && el.scrollWidth - el.clientWidth > 1
          })
          .slice(0, 3)
          .map((el) => `${描述(el)}（自己横着滚了 ${el.scrollWidth - el.clientWidth}px）`),
      }
    })
    量表.push(`${名}：溢出 ${量.溢}px · 元素 ${量.元素数} · 内容高 ${量.内容高}px`)
    if (量.元素数 === 0) 空的.push(名)
    if (量.溢 > 1) 挤的.push(`${名}：横着多出 ${量.溢}px${量.撑出去的.length ? ` ← ${量.撑出去的.join("、")}` : ""}`)
    for (const 藏 of 量.藏起来的) 挤的.push(`${名}：${藏}——内层滚动条不是答案（规格 7.5）`)
    await page.locator(".settings-column-back").click()
    await expect(page.locator(".settings-column-list")).toBeVisible()
  }

  expect(空的, `这几块进去什么都没画，量到的是一只空盒子，不是这一块的真实宽度\n${量表.join("\n")}`).toEqual([])
  expect(
    挤的,
    `这几块在 ${RIGHT_DOCK_DEFAULT}px 下装不下——改 CSS，别拿「人可以拖宽」当答案\n${量表.join("\n")}`,
  ).toEqual([])
})
