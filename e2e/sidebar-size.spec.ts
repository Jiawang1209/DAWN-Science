/**
 * 侧栏能折叠、能拖宽（2026-08-13）。**跑真实构建产物。**
 *
 * 作者：*「我们把左侧边栏，做一个折叠，点击可以进入折叠状态」*、
 * *「做侧边栏其实可以挪动，往左挪动，可以看到更少的信息，
 * 往右挪动，可以看到更多的信息」*。
 *
 * ## 这份用例盯的三件
 *
 * 1. **折叠之后那颗按钮还在。** 这是本项目最容易犯的那一类错
 *    （*「看不见的能力等于不存在」*，2026-08-10 一天犯了两次）：
 *    把开关放进侧栏里，收起来之后它自己也没了，人再也点不回来。
 *    所以它坐在顶栏——**两个状态下同一个位置**。
 * 2. **拖真的改宽度，而且夹得住界。** 拖出界能压到 0 宽的话，
 *    它与「折叠」长得一模一样，而那时把手也跟着没了。
 * 3. **记得住。** 重开之后还是人上次拖到的宽度、上次选的折叠状态。
 *
 * ## 为什么用计算样式而不是 `toBeVisible()`
 *
 * `toBeVisible()` 对宽度为 0 的元素**判定不稳**，而对 `opacity: 0`
 * 干脆算可见——CLAUDE.md 里那条踩过的坑。这里直接量盒子。
 */
import { test, expect, 开一段临时会话 } from "./fixtures.js"

const 量宽 = (page: import("@playwright/test").Page) =>
  page.locator(".sidebar").evaluate((el) => Math.round(el.getBoundingClientRect().width))

/**
 * **量宽度一律用 `poll`，不用一次读数**（2026-08-13 踩的）。
 *
 * 列宽上挂着 `transition: grid-template-columns .25s ease-out`
 * （实测 WorkBuddy 的收合也是 .25s ease-out）。按完键立刻读到的是
 * **动画中间的某一帧**——第一版这里读到 269，而它最终会停在 312。
 * 症状是「本地重跑有时绿有时红」，也就是最坏的那一种。
 *
 * `poll` 等的是**它停在哪儿**，而那才是人看见的东西。
 */
const 等宽 = (page: import("@playwright/test").Page) =>
  expect.poll(() => 量宽(page), { timeout: 10_000 })

test("**折叠之后，那颗开关还在原地**", async ({ dawn }) => {
  const { page } = dawn

  const 收起 = page.getByRole("button", { name: "收起侧边栏" })
  await expect(收起).toBeVisible()
  const 原宽 = await 量宽(page)
  expect(原宽).toBeGreaterThan(100)

  const 位置 = await 收起.boundingBox()
  await 收起.click()

  // 侧栏收到 0
  await expect.poll(() => 量宽(page), { timeout: 5_000 }).toBe(0)

  /**
   * **换了标签，没换位置。** 一颗按钮管两态；
   * 两颗（一颗在侧栏里、一颗在别处）就是「一个动作两个家」。
   */
  const 展开 = page.getByRole("button", { name: "展开侧边栏" })
  await expect(展开).toBeVisible()
  const 新位置 = await 展开.boundingBox()
  expect(Math.round(新位置!.x)).toBe(Math.round(位置!.x))

  await 展开.click()
  await expect.poll(() => 量宽(page), { timeout: 5_000 }).toBeGreaterThan(100)
})

test("**往右拖变宽，往左拖变窄**", async ({ dawn }) => {
  const { page } = dawn
  const sash = page.locator(".side-sash")
  await expect(sash).toHaveCount(1)

  const 起宽 = await 量宽(page)
  const box = (await sash.boundingBox())!

  // 往右 60
  await page.mouse.move(box.x + box.width / 2, box.y + 200)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + 60, box.y + 200, { steps: 10 })
  await page.mouse.up()
  await 等宽(page).toBe(起宽 + 60)
  const 宽了 = 起宽 + 60

  // 往左 80（默认 224 起：+60 − 80 = 204，仍在 `SIDEBAR_MIN` 200 之上；此前是 −120，那是默认 264 时的数）
  const box2 = (await sash.boundingBox())!
  await page.mouse.move(box2.x + box2.width / 2, box2.y + 200)
  await page.mouse.down()
  await page.mouse.move(box2.x + box2.width / 2 - 80, box2.y + 200, { steps: 10 })
  await page.mouse.up()
  await 等宽(page).toBe(宽了 - 80)
})

/**
 * **夹得住界。** 一路往左拖到窗口外，侧栏不该被压没——
 * 压到 0 就与「折叠」重了，而那时把手也跟着不见了，人拖不回来。
 */
test("**一路往左拖，也停在下界上**", async ({ dawn }) => {
  const { page } = dawn
  const sash = page.locator(".side-sash")
  const box = (await sash.boundingBox())!

  await page.mouse.move(box.x + box.width / 2, box.y + 200)
  await page.mouse.down()
  await page.mouse.move(0, box.y + 200, { steps: 12 })
  await page.mouse.up()

  // `SIDEBAR_MIN` = 200
  await 等宽(page).toBe(200)
})

/**
 * **键盘也调得动。**
 *
 * 拖是鼠标独占的动作。只给拖的话，这个能力对键盘用户等于不存在——
 * 与「悬停才出现的删除键」是同一条毛病，只是换了一种手。
 */
test("**方向键也能调宽度**", async ({ dawn }) => {
  const { page } = dawn
  const sash = page.locator(".side-sash")
  const 起宽 = await 量宽(page)

  await sash.focus()
  await sash.press("ArrowRight")
  await sash.press("ArrowRight")
  await 等宽(page).toBe(起宽 + 32)

  await sash.press("ArrowLeft")
  await 等宽(page).toBe(起宽 + 16)

  // 它对读屏说得出自己现在多宽
  await expect(sash).toHaveAttribute("aria-valuenow", String(起宽 + 16))
})

test("**重开之后，宽度与折叠都还是上次那样**", async ({ dawn }) => {
  const { page, 重开 } = dawn

  const sash = page.locator(".side-sash")
  await sash.focus()
  const 起宽 = await 量宽(page)
  await sash.press("ArrowRight")
  await sash.press("ArrowRight")
  await sash.press("ArrowRight")
  // **等它停稳再记**：动画中间那一帧记下来的话，重开之后必然对不上
  await 等宽(page).toBe(起宽 + 48)
  const 拖到的 = 起宽 + 48

  const p2 = await 重开()
  await expect
    .poll(() => p2.locator(".sidebar").evaluate((el) => Math.round(el.getBoundingClientRect().width)), {
      timeout: 30_000,
    })
    .toBe(拖到的)

  // 折叠状态同样记得住
  await p2.getByRole("button", { name: "收起侧边栏" }).click()
  await expect
    .poll(() => p2.locator(".sidebar").evaluate((el) => Math.round(el.getBoundingClientRect().width)), {
      timeout: 5_000,
    })
    .toBe(0)

  const p3 = await 重开()
  await expect(p3.getByRole("button", { name: "展开侧边栏" })).toBeVisible({ timeout: 30_000 })
})

/**
 * 顶栏三样的顺序与搜索（2026-08-13，作者要的）。
 *
 * *「左上角的 logo 和 折叠按钮，换一下位置，先是 logo，再是折叠按钮，
 * 此外帮我增加一个搜索功能，放一个搜索按钮，搜索按钮放在折叠按钮旁边。」*
 */
test("**顺序是：标志 → 折叠 → 搜索**", async ({ dawn }) => {
  const { page } = dawn
  const 标志 = (await page.getByRole("button", { name: "DAWN Science" }).boundingBox())!
  const 折叠 = (await page.getByRole("button", { name: "收起侧边栏" }).boundingBox())!
  const 搜索 = (await page.getByRole("button", { name: "搜索", exact: true }).boundingBox())!

  expect(标志.x).toBeLessThan(折叠.x)
  expect(折叠.x).toBeLessThan(搜索.x)
  // 搜索紧挨着折叠：中间不该再塞别的东西
  expect(搜索.x - (折叠.x + 折叠.width)).toBeLessThan(16)
})

/**
 * **搜索真的筛得动，而且搜不到时会出声。**
 *
 * 一片空白与「一条对话都还没有」长得一模一样——
 * CLAUDE.md：*「两处长得一样的东西，等于没有判据。」*
 */
test("**搜索筛掉不匹配的，且搜不到时说出来**", async ({ dawn }) => {
  const { page } = dawn
  await 开一段临时会话(page, "甲测试会话")
  await 开一段临时会话(page, "乙另一段")
  await expect(page.locator(".session-list .sess-item")).toHaveCount(2)

  await page.getByRole("button", { name: "搜索", exact: true }).click()
  const 框 = page.getByPlaceholder(/搜索项目与会话/)
  await expect(框).toBeVisible()

  await 框.fill("甲测试")
  await expect(page.locator(".session-list .sess-item")).toHaveCount(1)
  await expect(page.locator(".session-list .sess .name")).toContainText("甲测试会话")

  // 搜不到：**说出来**，而不是一片空白
  await 框.fill("这个词一定搜不到")
  await expect(page.locator(".session-list .sess-item")).toHaveCount(0)
  await expect(page.locator(".side-empty")).toContainText("没有匹配")

  // Esc 关掉它，列表原样回来
  await 框.press("Escape")
  await expect(框).toHaveCount(0)
  await expect(page.locator(".session-list .sess-item")).toHaveCount(2)
})

/**
 * **侧栏收着的时候按搜索，要先把侧栏打开。**
 *
 * 输入框长在侧栏里；不打开的话按下去屏幕上什么都不会发生——
 * 那就是本项目已经报过三次的「点了没反应」。
 */
test("**收着的时候点搜索，侧栏会自己打开**", async ({ dawn }) => {
  const { page } = dawn
  await page.getByRole("button", { name: "收起侧边栏" }).click()
  await 等宽(page).toBe(0)

  await page.getByRole("button", { name: "搜索", exact: true }).click()
  await 等宽(page).toBeGreaterThan(100)
  await expect(page.getByPlaceholder(/搜索项目与会话/)).toBeVisible()
})

/**
 * **两列都按自己的条数占位**（2026-08-13，作者：*「项目和对话的收纳，
 * 这个要基于各自的收纳的个数，而不应该有那么多的 gap」*）。
 *
 * `.proj-list` 此前是 `flex: 1 1 auto`——**项目那一列吃掉所有剩余空间**，
 * 于是只有两个项目时，「会话」那一栏被顶到侧栏很下面，
 * 中间隔着一大块什么都不表达的空白。
 *
 * 判据是「项目列的高度 ≈ 它里面那几行的高度之和」，
 * 而不是某个具体像素——后者改一次行高就要跟着改一次。
 */
test("**项目那一列的高度由条数决定，不吃掉剩余空间**", async ({ dawn }) => {
  const { page } = dawn
  await page.evaluate(async () => {
    const w = window as unknown as {
      dawn: { invoke: (op: string, req: unknown) => Promise<{ data?: unknown }> }
    }
    const p = (await w.dawn.invoke("getProviders", {})) as {
      data?: { agents?: { agentId: string }[] }
    }
    const agentId = p.data?.agents?.[0]?.agentId
    await w.dawn.invoke("createTask", { agentId, workspace: "/tmp/dawn-gap-甲" })
    await w.dawn.invoke("createTask", { agentId }) // 一段没路径的，好让「会话」栏也在
  })
  await page.reload()
  await expect(page.locator(".proj-list .proj-item")).toHaveCount(1, { timeout: 30_000 })

  const 列 = (await page.locator(".proj-list").boundingBox())!
  const 行 = await page.locator(".proj-list > .proj-item").all()
  const 行高 = (await Promise.all(行.map((x) => x.boundingBox()))).reduce(
    (n, b) => n + (b?.height ?? 0),
    0,
  )
  // 留 8px 余量给内距；**撑满时这个差值会是几百**
  expect(列.height - 行高).toBeLessThan(8)

  /**
   * 而且「会话」那条标题**紧跟在项目列后面**，不是被顶到屏幕底部。
   * 这一条才是作者真正看见的那件事。
   */
  const 分区 = await page.locator(".sidebar .side-section").all()
  const 会话头 = (await 分区[分区.length - 1]!.boundingBox())!
  expect(会话头.y - (列.y + 列.height)).toBeLessThan(40)
})
