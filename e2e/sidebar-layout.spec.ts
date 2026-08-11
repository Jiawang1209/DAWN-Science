/**
 * 侧栏的形状（2026-08-11）。**跑真实构建产物。**
 *
 * 作者分两次说清了它：
 *   ①*「新建的项目，就在左侧的新建项目的下面，新建的会话，就在左侧的
 *   新建会话下面。然后新建完的项目，里面可以有多个会话。」*
 *   ②*「项目下也需要嵌套会话，因为一个项目下面可能会有多个会话。
 *   而会话，其实更倾向于，没有设置工作路径的、或者没有设置项目的临时会话。」*
 *
 * 于是上下两列**问的是两件事**：
 *   - 上面「会话」= **临时会话**，没有项目、自带一个独立目录
 *   - 下面「项目」= 你打开的文件夹，**展开就看见它自己的会话**
 */
import { test, expect } from "./fixtures.js"

test("**上面那一列是临时会话** —— 不属于任何项目", async ({ dawn }) => {
  const { page } = dawn
  await page.getByRole("button", { name: "新建会话", exact: true }).click()
  await expect(page.getByPlaceholder(/回车发送/)).toBeVisible({ timeout: 60_000 })

  // 它在上面那一列里
  await expect(page.locator(".session-list .sess")).toHaveCount(1)
  // **项目的会话数没有涨**：它不属于那个项目
  await expect(page.locator(".proj-item").first()).toContainText("0 个会话")
})

test("**项目下嵌套它自己的会话**", async ({ dawn }) => {
  const { page } = dawn
  const 项目 = page.locator(".proj-list .proj-item").first()
  await expect(项目).toContainText("0 个会话")

  // 在这个项目里开一段——入口就在它自己那一行上
  await 项目.getByRole("button", { name: /里开一段新对话/ }).click()
  await expect(page.getByPlaceholder(/回车发送/)).toBeVisible({ timeout: 60_000 })

  // 数字跟着涨（**它是真的从后端来的**），而且会话就嵌在这一行下面
  await expect(项目).toContainText("1 个会话", { timeout: 30_000 })
  await expect(项目.locator(".proj-session-list .sess")).toHaveCount(1)
  // 上面那一列还是空的：那里只放临时会话
  await expect(page.locator(".session-list .sess")).toHaveCount(0)
})

test("**顺序就是作者说的那个**：新建会话领着会话，新建项目领着项目", async ({ dawn }) => {
  const { page } = dawn
  const 顺序 = await page.locator(".sidebar").evaluate((el) => {
    // **只看顶层的那几块**：嵌套的会话列表是项目行内部的事
    const 点 = [...el.querySelectorAll(".side-action, :scope > .session-list, :scope > .proj-list")]
    return 点.map((x) =>
      x.classList.contains("side-action")
        ? "side-action"
        : x.classList.contains("session-list")
          ? "session-list"
          : "proj-list",
    )
  })
  expect(顺序).toEqual(["side-action", "session-list", "side-action", "proj-list"])
})

/**
 * **两颗按钮之间的距离 = 中间有几条会话**（2026-08-11）。
 *
 * 作者：*「初始状态下（没有任何新建会话和新建项目）的情况下，
 * 新建会话和新建项目是连着的，并且二者之间的间隙要基于个数来控制。
 * 如果有一个临时的会话，那么新建会话和新建项目中间会有一个临时会话。」*
 *
 * 所以这里量的是**像素**：空着的时候两行紧挨着（一行的高度以内），
 * 有一条会话时正好多出一条会话行的高度。
 */
test("**空着的时候两颗按钮是连着的**，加一条会话就正好多一行", async ({ dawn }) => {
  const { page } = dawn
  const 会话按钮 = page.getByRole("button", { name: "新建会话" })
  const 项目按钮 = page.getByRole("button", { name: "新建项目" })

  const 间距 = async () => {
    const a = (await 会话按钮.boundingBox())!
    const b = (await 项目按钮.boundingBox())!
    return b.y - (a.y + a.height)
  }

  // 空态：**连着**——中间连一句「还没有会话」的占位都没有
  const 空的时候 = await 间距()
  expect(空的时候).toBeLessThan(8)

  await 会话按钮.click()
  await expect(page.getByPlaceholder(/回车发送/)).toBeVisible({ timeout: 60_000 })
  await expect(page.locator(".session-list .sess")).toHaveCount(1)

  // 多了一条会话，就正好多出一行的高度
  const 一条行高 = (await page.locator(".session-list .sess-item").first().boundingBox())!.height
  const 有一条时 = await 间距()
  expect(有一条时 - 空的时候).toBeGreaterThan(一条行高 * 0.8)
  expect(有一条时 - 空的时候).toBeLessThan(一条行高 * 1.6)
})

test("**下拉框没了** —— 它装不下「一列项目，每个里面还有会话」", async ({ dawn }) => {
  const { page } = dawn
  await expect(page.getByLabel("当前项目")).toHaveCount(0)
})
