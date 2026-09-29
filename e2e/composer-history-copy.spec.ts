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
import { test, expect, CANNED_REPLY, 开一段临时会话, 在项目里开会话, 进坞 } from "./fixtures.js"

test("**↑ 翻回上一句，↓ 翻回没发出去的那半句**", async ({ dawn }) => {
  const { page } = dawn
  await 开一段临时会话(page)
  const 输入 = page.getByPlaceholder(/今天帮你做些什么/)

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
  const 输入 = page.getByPlaceholder(/今天帮你做些什么/)
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
  await page.getByPlaceholder(/今天帮你做些什么/).fill("要被复制走的这句")
  await page.getByRole("button", { name: "发送", exact: true }).click()
  await expect(page.locator(".turns")).toContainText("要被复制走的这句", { timeout: 30_000 })

  const 那颗 = page.getByRole("button", { name: "复制我说的这段" }).first()
  // **常驻，不是悬停才出现**：`toBeVisible()` 对 opacity:0 仍然算可见，所以直接量
  expect(Number(await 那颗.evaluate((el) => getComputedStyle(el).opacity))).toBeGreaterThan(0.2)
  await 那颗.click()

  // 点了要有反馈——否则人会怀疑自己没点上，然后再点几次
  await expect(page.locator(".copy-btn").first()).toContainText("已复制")

  const 剪贴板 = await page.evaluate(() => navigator.clipboard.readText())
  expect(剪贴板).toBe("要被复制走的这句")
})

/**
 * 改一句自己说过的话，再发出去（2026-08-11，作者提，仿 Codex）。
 *
 * 语义上有一条必须钉死：**它是「照这个再说一遍」，不是「把历史改掉」**。
 * 历史是事实层的一部分——你上一次确实那么说了，模型也确实照那句答了。
 * 就地改掉等于让记录说一件没发生的事。
 */
test("**修改 → 发送**：新说一句，原来那句留在原处", async ({ dawn }) => {
  const { page } = dawn
  await 开一段临时会话(page)
  await page.getByPlaceholder(/今天帮你做些什么/).fill("原来那句")
  await page.getByRole("button", { name: "发送", exact: true }).click()
  await expect(page.locator(".turns")).toContainText("原来那句", { timeout: 30_000 })

  await page.locator(".turn.user").first().getByRole("button", { name: "修改" }).click()
  const 改框 = page.getByLabel("修改这段话")
  await expect(改框).toHaveValue("原来那句")
  await 改框.fill("改过之后的那句")
  // **说清楚它会做什么**，而不是让人按下去才知道
  await expect(page.locator(".turn.editing")).toContainText("上面那句留在原处")
  await page.locator(".turn.editing").getByRole("button", { name: "发送" }).click()

  await expect(page.locator(".turns")).toContainText("改过之后的那句", { timeout: 30_000 })
  // 原来那句还在——**历史没有被改写**
  await expect(page.locator(".turns")).toContainText("原来那句")
})

test("**取消就是取消**：一个字都不发出去", async ({ dawn }) => {
  const { page } = dawn
  await 开一段临时会话(page)
  await page.getByPlaceholder(/今天帮你做些什么/).fill("只说这一句")
  await page.getByRole("button", { name: "发送", exact: true }).click()
  await expect(page.locator(".turns")).toContainText("只说这一句", { timeout: 30_000 })

  await page.locator(".turn.user").first().getByRole("button", { name: "修改" }).click()
  await page.getByLabel("修改这段话").fill("这句不该出现")
  await page.locator(".turn.editing").getByRole("button", { name: "不改了" }).click()

  await expect(page.locator(".turn.editing")).toHaveCount(0)
  await expect(page.locator(".turns")).not.toContainText("这句不该出现")
  await expect(page.locator(".turns")).toContainText("只说这一句")
})

test("**操作在这一段下面**，不是浮在右上角", async ({ dawn }) => {
  const { page } = dawn
  await 开一段临时会话(page)
  await page.getByPlaceholder(/今天帮你做些什么/).fill("量一下位置")
  await page.getByRole("button", { name: "发送", exact: true }).click()
  await expect(page.locator(".turns")).toContainText("量一下位置", { timeout: 30_000 })

  const 气泡 = await page.locator(".turn.user .bubble").first().boundingBox()
  const 操作 = await page.locator(".turn.user .turn-actions").first().boundingBox()
  // 断言的是**位置本身**：一句「在下面」的注释证明不了它真的在下面
  expect(操作!.y).toBeGreaterThanOrEqual(气泡!.y + 气泡!.height - 2)
})

/**
 * 自己那句的操作**靠右排在气泡下面，不撑宽气泡**（2026-09-29，作者批的；取代 2026-08-12 的「对齐气泡左缘」）。
 *
 * 旧做法让包裹层取「气泡 / 动作行」的大者，2026-09-27 动作行多了带字的「回到这句之前」之后，
 * 「好」一个字的气泡被撑到约 180px。现在气泡只按字定宽，动作行右缘与气泡齐、短气泡时可以比它更往左伸。
 */
test("**动作行靠右、不撑宽气泡**：一个字的气泡比它下面那行窄", async ({ dawn }) => {
  const { page } = dawn
  await 开一段临时会话(page)
  await page.getByPlaceholder(/今天帮你做些什么/).fill("好")
  await page.getByRole("button", { name: "发送", exact: true }).click()
  await expect(page.locator(".turn.user .turn-actions").first()).toBeVisible({ timeout: 30_000 })

  const 气泡 = (await page.locator(".turn.user .bubble").first().boundingBox())!
  const 行 = (await page.locator(".turn.user .turn-actions").first().boundingBox())!
  const 最后一颗 = (await page.locator(".turn.user .turn-actions .btn").last().boundingBox())!

  // **气泡不被撑宽**：动作行（至少两颗图标）比「好」一个字宽，气泡却不跟着变宽
  expect(气泡.width, `气泡 ${气泡.width}px 不该被动作行 ${行.width}px 撑宽`).toBeLessThan(行.width)
  // **右缘对齐**：容差 2px 给边框与图标内边距
  expect(Math.abs(最后一颗.x + 最后一颗.width - (气泡.x + 气泡.width))).toBeLessThanOrEqual(2)

  // 顺带钉住「两颗一样大」：一个 ⧉ 一个 ✎，大小不一样会像是两种东西。
  // 只数图标那两颗：2026-09-27 起后面还有一颗带字的「回到这句之前」，它本来就不是图标的尺寸
  const 两颗 = page.locator(".turn.user .turn-actions .btn-icon")
  await expect(两颗).toHaveCount(2)
  const a = (await 两颗.nth(0).boundingBox())!
  const b = (await 两颗.nth(1).boundingBox())!
  expect(Math.abs(a.width - b.width)).toBeLessThanOrEqual(1)
  expect(Math.abs(a.height - b.height)).toBeLessThanOrEqual(1)
})

/**
 * **短问句不该被折行**（2026-08-12，作者报的那一屏）。
 *
 * 作者截图里「你是什么模型？」被折成了两行：*「你是什么模 / 型？」*。
 * 中文没有词边界，一旦容器窄一点就会从任意一个字中间断开——**很难看，
 * 而且读起来要停顿一下**。
 *
 * 根因是我上一版给气泡套的那层包裹用了 `fit-content`：
 * 它在 flex 列里按可用宽度收缩。这条钉住的就是「它不许再收缩回去」。
 */
test("**七个字的问题占一行**，不被从中间折断", async ({ dawn }) => {
  const { page } = dawn
  await 开一段临时会话(page)
  await page.getByPlaceholder(/今天帮你做些什么/).fill("你是什么模型？")
  await page.getByRole("button", { name: "发送", exact: true }).click()
  await expect(page.locator(".turns")).toContainText("你是什么模型？", { timeout: 30_000 })

  /**
   * 量**行数**，不是量宽度：宽度多少算够跟字号绑在一起，会随主题漂移；
   * 而「它占了几行」是这条要求本身。
   */
  const 行数 = await page.locator(".turn.user .text").first().evaluate((el) => {
    const 行高 = parseFloat(getComputedStyle(el).lineHeight)
    return Math.round(el.scrollHeight / 行高)
  })
  expect(行数).toBe(1)
})

/**
 * **「回到这句之前」在窄处不撑破**（2026-09-27，回退这一轮）。动作行里多了一颗带字的按钮：坞里的对话格只有几百像素宽、
 * 气泡上限又是它的 82%——上下文仪表在坞里被顶出去过一次，这条量盒子：按钮整颗在对话区里，转录不横向溢出。
 */
test("**坞里那段的「回到这句之前」**：整颗看得见，不把对话区撑出横向滚动", async ({ dawn }) => {
  const { page } = dawn
  const 坞 = page.locator("aside.right-dock")
  await 在项目里开会话(page)
  await 进坞(page, "对话")
  await 坞.getByRole("button", { name: "另开一段", exact: true }).click()
  await 坞.locator(".side-chat-head").waitFor({ timeout: 30_000 })
  const 框 = 坞.getByPlaceholder(/今天帮你做些什么/)
  await 框.fill("短")
  await 框.press("Enter")
  await expect(坞.getByText(CANNED_REPLY)).toHaveCount(1, { timeout: 30_000 })

  const 钮 = 坞.locator(".turn.user").getByRole("button", { name: "回到这句之前", exact: true })
  await expect(钮).toBeEnabled()
  expect(Number(await 钮.evaluate((el) => getComputedStyle(el).opacity))).toBe(1)
  const 盒 = (await 钮.boundingBox())!
  const 区 = (await 坞.locator(".turns").boundingBox())!
  expect(盒.x).toBeGreaterThanOrEqual(区.x)
  expect(盒.x + 盒.width).toBeLessThanOrEqual(区.x + 区.width)
  expect(await 坞.locator(".turns").evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)
})
