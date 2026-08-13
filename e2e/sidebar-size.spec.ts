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
import { test, expect } from "./fixtures.js"

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

  // 往左 120
  const box2 = (await sash.boundingBox())!
  await page.mouse.move(box2.x + box2.width / 2, box2.y + 200)
  await page.mouse.down()
  await page.mouse.move(box2.x + box2.width / 2 - 120, box2.y + 200, { steps: 10 })
  await page.mouse.up()
  await 等宽(page).toBe(宽了 - 120)
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
