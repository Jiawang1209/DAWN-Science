/**
 * 远程助理 · 微信（T2，2026-08-21）。**跑真实构建产物 + 假微信 + 假模型。**
 *
 * 作者：*「微信这边，其实不就是接入的微信龙虾吗？」*「侧边栏叫远程助理，联系人叫 DAWN-Science。」*
 * 设计：`docs/superpowers/specs/2026-08-21-远程助理-design.md`。
 *
 * 这份用例盯的是整条路：侧栏入口 → 扫码（含配对码）→ 卡变「已绑定」→
 * 微信里说一句 → 电脑上那段会话里出现 → 模型的回答回到微信 → token 失效卡变红。
 */
import { test, expect } from "./fixtures.js"

test.use({ dawnOptions: { fakeIlink: true } })

test("**扫码绑定 → 微信说话 → 回答回到微信 → 失效要出声**", async ({ dawn }) => {
  const { page, weixin } = dawn
  if (!weixin) throw new Error("夹具没起假微信")

  // ① 入口在「远端服务器」正下面，名字叫「远程助理」
  const 入口 = page.getByRole("button", { name: "远程助理", exact: true })
  await expect(入口).toBeVisible()
  await 入口.click()
  await expect(page.getByRole("heading", { name: "远程助理" })).toBeVisible()
  const 卡 = page.locator(".ra-card").first()
  await expect(卡.locator(".ra-state")).toHaveText("未绑定")
  await expect(卡).toContainText("DAWN-Science")

  // ② 扫码：二维码画出来了；每一态都出声
  await 卡.getByRole("button", { name: "扫码绑定" }).click()
  await expect(卡.locator(".ra-qr svg")).toBeVisible({ timeout: 10_000 })
  await expect(卡.locator(".ra-step")).toContainText("扫一扫")
  await weixin.推进扫码("scan")
  await expect(卡.locator(".ra-step")).toContainText("已扫", { timeout: 10_000 })
  await weixin.推进扫码("need_code")
  await expect(卡.locator(".ra-step")).toContainText("一串数字", { timeout: 10_000 })
  await page.getByLabel("手机上显示的配对码").fill("0000")
  await page.getByRole("button", { name: "提交配对码" }).click()
  await expect(卡.locator(".ra-step")).toContainText("不对", { timeout: 10_000 })
  await page.getByLabel("手机上显示的配对码").fill("1234")
  await page.getByRole("button", { name: "提交配对码" }).click()
  await weixin.推进扫码("confirm")
  await expect(卡.locator(".ra-state")).toHaveText("已绑定", { timeout: 20_000 })
  await expect(卡).toContainText("fakeuser@im.wechat")

  // ③ 微信里说一句：电脑上出现一段新会话，里面有这句；模型的回答回到微信
  await weixin.发来("你好，在忙什么")
  await expect(page.locator(".side-scroll .sess-item").first()).toBeVisible({ timeout: 30_000 })
  await page.locator(".side-scroll .sess-item .row").first().click()
  // 标题、气泡、悬停卡都带这句——只看对话区里那条用户气泡
  await expect(page.locator(".turn.user .text", { hasText: "你好，在忙什么" })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText(/假模型已应答/).last()).toBeVisible({ timeout: 30_000 })
  await expect
    .poll(async () => (await weixin.发出的()).length, { timeout: 30_000 })
    .toBeGreaterThan(0)
  const 发 = (await weixin.发出的()) as { to_user_id: string; item_list: { text_item: { text: string } }[] }[]
  expect(发.at(-1)!.to_user_id).toBe("fakeuser@im.wechat")
  expect(发.at(-1)!.item_list[0]!.text_item.text).toContain("假模型已应答")

  // ④ 别人发来的不回（只认扫码那个人）
  const 之前 = 发.length
  await weixin.发来("我是谁", { from: "stranger@im.wechat" })
  await page.waitForTimeout(2_500)
  expect((await weixin.发出的()).length).toBe(之前)

  // ⑤ token 失效：卡变红、说清要重新扫码（此刻在对话屏，点一下回到远程助理）
  await 入口.click()
  await expect(page.getByRole("heading", { name: "远程助理" })).toBeVisible()
  await weixin.让失效()
  await expect(卡.locator(".ra-state")).toHaveText("绑定失效", { timeout: 20_000 })
  await expect(卡).toContainText("重新扫码")
})

test("**斜杠命令**：/会话 /在哪 /帮助 有回音；解绑后卡回未绑定", async ({ dawn }) => {
  const { page, weixin } = dawn
  if (!weixin) throw new Error("夹具没起假微信")
  await page.getByRole("button", { name: "远程助理", exact: true }).click()
  const 卡 = page.locator(".ra-card").first()
  await 卡.getByRole("button", { name: "扫码绑定" }).click()
  await expect(卡.locator(".ra-qr svg")).toBeVisible({ timeout: 10_000 })
  await weixin.推进扫码("confirm")
  await expect(卡.locator(".ra-state")).toHaveText("已绑定", { timeout: 20_000 })

  await weixin.发来("/帮助")
  await expect.poll(async () => (await weixin.发出的()).length, { timeout: 20_000 }).toBe(1)
  const 文 = async () => ((await weixin.发出的()).at(-1) as { item_list: { text_item: { text: string } }[] }).item_list[0]!.text_item.text
  expect(await 文()).toContain("/用 N")
  await weixin.发来("/在哪")
  await expect.poll(async () => (await weixin.发出的()).length, { timeout: 20_000 }).toBe(2)
  expect(await 文()).toContain("还没绑会话")

  await 卡.getByRole("button", { name: "解绑微信" }).click()
  await expect(卡.locator(".ra-state")).toHaveText("未绑定", { timeout: 10_000 })
})
