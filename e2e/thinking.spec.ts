/**
 * 「它在想什么」那一块（2026-08-12，形态学自 Hermes）。**跑真实产物。**
 *
 * 作者：*「我看 hermes 在回复的时候还会有思考，还会有一个方块写 0 1 2 3 s……
 * 此外会有一个 Thought briefly，然后是可以点击进行扩展的。」*
 *
 * 它要回答的其实是更早那句：*「否则我以为会话可能死掉了。」*
 * 一段长思考在此前的界面上什么都不显示——**与卡死长得一模一样**。
 */
import { test, expect, 开一段临时会话 } from "./fixtures.js"

test.describe("思考", () => {
  test.use({
    dawnOptions: { thinking: "用户问我是什么模型。系统提示词里写着当前模型，照它答。" },
  })

  test("**收起时只有一行，点开才是内容**", async ({ dawn }) => {
    const { page } = dawn
    await 开一段临时会话(page)
    await page.getByPlaceholder(/回车发送/).fill("你是什么模型？")
    await page.getByRole("button", { name: "发送", exact: true }).click()
    await expect(page.getByText(/假模型已应答/)).toBeVisible({ timeout: 30_000 })

    const 块 = page.locator(".thought")
    await expect(块).toBeVisible()

    /**
     * **默认收起。** 思考往往比答案长得多，摊开会把答案挤到屏幕外——
     * 而人要看的是答案。
     */
    await expect(块.locator(".thought-body")).toHaveCount(0)
    // 那个方块里是秒数
    await expect(块.locator(".thought-secs")).toHaveText(/^\d+s$/)

    await 块.locator(".thought-head").click()
    await expect(块.locator(".thought-body")).toContainText("用户问我是什么模型")
  })

  test("**思考不混进回答里** —— 那是它对自己说的话，不是对我说的", async ({ dawn }) => {
    const { page } = dawn
    await 开一段临时会话(page)
    await page.getByPlaceholder(/回车发送/).fill("你是什么模型？")
    await page.getByRole("button", { name: "发送", exact: true }).click()
    await expect(page.getByText(/假模型已应答/)).toBeVisible({ timeout: 30_000 })

    /**
     * 气泡里是回答，思考在气泡**外面**。
     * 混进去等于把草稿当答案念出来——而人分不出哪句是哪句。
     */
    const 气泡 = page.locator(".turn.agent .bubble").first()
    await expect(气泡).not.toContainText("用户问我是什么模型")
    await expect(气泡).toContainText("假模型已应答")
  })
})
