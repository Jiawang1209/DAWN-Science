/**
 * 侧栏折叠：**内容被裁掉，不是被压扁**（2026-08-15 作者报的）。**跑真实构建产物。**
 *
 * 作者：*「折叠的动画效果太差了，很明显看到里面文字是挤压了。」*
 *
 * 根因是折叠动的是**网格列宽**（`--dawn-sidebar-w` → `0px`），
 * 而里面的内容跟着列宽走——于是那 0.25 秒里，每一行文字都在被压窄、重排。
 * 好的收合是**内容保持原宽、整体滑出去被裁掉**。
 *
 * ## 判据挑「动画中途内容还有多宽」
 *
 * 这是「被裁」与「被压」唯一分得开的地方：
 *   · 被裁：内容宽度不变，只是露出来的部分越来越少
 *   · 被压：内容宽度跟着容器一起缩
 *
 * 只看最终态是分不出来的——两种做法收完都是看不见。
 */
import { test, expect, 开一段临时会话 } from "./fixtures.js"

test("**收起的过程中，里面的内容不被压窄**", async ({ dawn }) => {
  const { page } = dawn
  await 开一段临时会话(page)
  await page.getByPlaceholder(/今天帮你做些什么/).fill("量一下折叠的动画")
  await page.getByRole("button", { name: "发送", exact: true }).click()
  await expect(page.getByText(/假模型已应答/).last()).toBeVisible({ timeout: 30_000 })

  const 一行 = page.locator(".session-list li .row").first()
  const 宽 = async () => Math.round((await 一行.boundingBox())!.width)

  const 收起前 = await 宽()
  expect(收起前, "侧栏本来就是空的，这条用例测不到东西").toBeGreaterThan(100)

  await page.getByRole("button", { name: "收起侧边栏" }).click()
  /**
   * **动画途中量一次**（那条 transition 是 0.25s）。
   * 120ms 落在中间：这时侧栏已经窄了一半，而内容宽度应当纹丝不动。
   */
  await page.waitForTimeout(120)
  const 收起中 = await 宽()

  expect(收起中, `内容在被压窄（${收起前} → ${收起中}），应当是被裁掉`).toBe(收起前)
})

/**
 * **展开的那一下允许挤**（2026-08-15 改的）。
 *
 * 原来这条要求两个方向都不挤，做法是把固定宽度钉在 `.sidebar > *` 的**常态**上。
 * **那把日常用坏了**：侧栏一有竖向滚动条，内容盒比列窄十几像素，
 * 子元素仍按整列宽度铺，右边被裁——作者当天就报了「内容被覆盖」。
 *
 * **动画是锦上添花，日常渲染是本分。** 所以宽度只在收合期间钉，
 * 展开时那个类已经摘掉，会挤一下——这条用例因此改成**只守收起方向**。
 * 留着它是为了记住这个取舍，不是为了少测一半。
 */
test.skip("**展开的过程中同样不被压**（已按取舍放弃：见上）", async ({ dawn }) => {
  const { page } = dawn
  await 开一段临时会话(page)
  await page.getByPlaceholder(/今天帮你做些什么/).fill("量一下展开的动画")
  await page.getByRole("button", { name: "发送", exact: true }).click()
  await expect(page.getByText(/假模型已应答/).last()).toBeVisible({ timeout: 30_000 })

  const 一行 = page.locator(".session-list li .row").first()
  const 展开时 = Math.round((await 一行.boundingBox())!.width)

  await page.getByRole("button", { name: "收起侧边栏" }).click()
  await page.waitForTimeout(400) // 收完
  await page.getByRole("button", { name: "展开侧边栏" }).click()
  await page.waitForTimeout(120)

  const 展开中 = Math.round((await 一行.boundingBox())!.width)
  expect(展开中, `展开途中内容被压窄了（${展开时} → ${展开中}）`).toBe(展开时)
})

/** **收完就是收完**：还看得见一条的话，那条动画就白做了 */
test("收完之后侧栏一点都不占地方", async ({ dawn }) => {
  const { page } = dawn
  await page.getByRole("button", { name: "收起侧边栏" }).click()
  await page.waitForTimeout(400)
  const 宽 = (await page.locator(".sidebar").boundingBox())?.width ?? 0
  expect(Math.round(宽), "收完还剩一条").toBeLessThanOrEqual(1)
})


/**
 * **侧栏有滚动条时，每一行都完整看得见**（2026-08-15 当天的回归）。
 *
 * 我为了让收合动画不挤压，把固定宽度钉在了 `.sidebar > *` 的**常态**上。
 * 侧栏一有竖向滚动条，内容盒就比列窄十几个像素，而子元素仍按整列宽度铺——
 * 右边那截被 `overflow-x: hidden` 裁掉。作者：*「侧边栏把里面的内容都给覆盖了。」*
 *
 * **判据挑「内容宽不许超过可视宽」**：这是「被裁」唯一稳定的表述，
 * 而且它与「动画怎么做」无关——不管以后换成什么技法，这条都得成立。
 */
test("**侧栏有滚动条时，内容不许被横向裁掉**", async ({ dawn }) => {
  const { page, app } = dawn

  /**
   * **把窗口调矮**，让侧栏一定有竖向滚动条。
   * 堆会话也能逼出来，但那要十几段——**测试的代价该花在判据上，不是造数据上**。
   */
  await app.evaluate(async ({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.setSize(1100, 420)
  })

  for (let i = 0; i < 3; i++) {
    await 开一段临时会话(page)
    await page.getByPlaceholder(/今天帮你做些什么/).fill(`第 ${i} 段对话，标题要够长才看得出被裁没有`)
    await page.getByRole("button", { name: "发送", exact: true }).click()
    await expect(page.getByText(/假模型已应答/).last()).toBeVisible({ timeout: 30_000 })
  }

  const 量 = await page.evaluate(() => {
    const s = document.querySelector(".sidebar") as HTMLElement
    return {
      有竖向滚动条: s.scrollHeight > s.clientHeight,
      可视宽: s.clientWidth,
      内容宽: s.scrollWidth,
      最宽的孩子: Math.max(...[...s.children].map((c) => (c as HTMLElement).offsetWidth)),
    }
  })

  /** 先确认这条用例**真的把滚动条逼出来了**，否则它什么都没测到 */
  expect(量.有竖向滚动条, "没堆出滚动条，这条用例是空转的").toBe(true)
  expect(量.内容宽, `内容比可视区宽（${量.内容宽} > ${量.可视宽}），右边会被裁掉`).toBeLessThanOrEqual(
    量.可视宽,
  )
  expect(量.最宽的孩子, "有子元素比侧栏可视区还宽").toBeLessThanOrEqual(量.可视宽)
})
