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
  await page.getByPlaceholder(/回车发送/).fill("原来那句")
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
  await page.getByPlaceholder(/回车发送/).fill("只说这一句")
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
  await page.getByPlaceholder(/回车发送/).fill("量一下位置")
  await page.getByRole("button", { name: "发送", exact: true }).click()
  await expect(page.locator(".turns")).toContainText("量一下位置", { timeout: 30_000 })

  const 气泡 = await page.locator(".turn.user .bubble").first().boundingBox()
  const 操作 = await page.locator(".turn.user .turn-actions").first().boundingBox()
  // 断言的是**位置本身**：一句「在下面」的注释证明不了它真的在下面
  expect(操作!.y).toBeGreaterThanOrEqual(气泡!.y + 气泡!.height - 2)
})

/**
 * 操作图标**对齐自己那颗气泡的左缘**（2026-08-12，作者选的）。
 *
 * 不是「靠到对话区最左」——那样图标会离自己那句话很远，
 * 眼睛要跨过一整行空白才找得到它属于谁。
 */
test("**图标对齐气泡左缘**", async ({ dawn }) => {
  const { page } = dawn
  await 开一段临时会话(page)
  await page.getByPlaceholder(/回车发送/).fill("量一下对齐")
  await page.getByRole("button", { name: "发送", exact: true }).click()
  await expect(page.locator(".turns")).toContainText("量一下对齐", { timeout: 30_000 })

  const 气泡 = (await page.locator(".turn.user .bubble").first().boundingBox())!
  const 第一颗 = (await page.locator(".turn.user .turn-actions .btn").first().boundingBox())!

  // **左缘对齐**：容差 2px 给边框与图标内边距
  expect(Math.abs(第一颗.x - 气泡.x)).toBeLessThanOrEqual(2)

  // 顺带钉住「两颗一样大」：一个 ⧉ 一个 ✎，大小不一样会像是两种东西
  const 两颗 = page.locator(".turn.user .turn-actions .btn")
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
  await page.getByPlaceholder(/回车发送/).fill("你是什么模型？")
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
