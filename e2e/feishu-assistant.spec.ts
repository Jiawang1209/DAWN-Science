/**
 * 远程助理 · 飞书(2026-08-25)。**跑真实构建产物 + 假飞书 + 假模型。**
 *
 * 设计:`docs/superpowers/specs/2026-08-25-飞书通道-design.md`。
 * 盯整条路:飞书卡扫码(设备流)→ 已绑定 → 假飞书说一句 → 电脑上那段会话里出现 →
 * 回答送回假飞书(附带 Reaction 收尾)→ 别人的话不回。
 */
import { test, expect, 进设置 } from "./fixtures.js"

test.use({ dawnOptions: { fakeFeishu: true } })

test("**设备流绑定 → 飞书说话 → 回答回到飞书 → 只认扫码人**", async ({ dawn }) => {
  const { page, feishu } = dawn
  if (!feishu) throw new Error("夹具没起假飞书")

  await 进设置(page, "远程助理")
  // h2 里还带着状态字(「飞书 未绑定」),按角色名找不精确——用 aria-labelledby 定位这张卡
  const 卡 = page.locator('section[aria-labelledby="ra-feishu"]')
  await expect(卡.locator(".ra-state")).toHaveText("未绑定")

  // ① 设备流:出码 → 确认 → 已绑定(会创建自建应用,这句在屏上)
  await expect(卡).toContainText("自建应用")
  await 卡.getByRole("button", { name: "添加飞书机器人" }).click()
  await expect(卡.locator(".ra-feishu-qr svg")).toBeVisible({ timeout: 10_000 })
  await feishu.确认扫码()
  await expect(卡.locator(".ra-state")).toHaveText("已绑定", { timeout: 20_000 })
  await expect(卡).toContainText("fake-open-id")

  // ② 飞书里说一句:电脑上那段会话里出现;回答送回假飞书;Reaction 走了 OnIt → DONE
  await feishu.发来("飞书里问一句")
  await expect(page.locator(".side-scroll .sess-item").first()).toBeVisible({ timeout: 30_000 })
  await page.locator(".side-scroll .sess-item .row").first().click()
  await expect(page.locator(".turn.user .text", { hasText: "飞书里问一句" })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText(/假模型已应答/).last()).toBeVisible({ timeout: 30_000 })
  await expect
    .poll(async () => JSON.stringify(await feishu.发出的()), { timeout: 30_000 })
    .toContain("假模型已应答")
  const 发 = await feishu.发出的()
  expect(发.some((x) => x.kind === "reaction" && x.emoji === "OnIt")).toBe(true)
  await expect
    .poll(async () => (await feishu.发出的()).some((x) => x.kind === "reaction" && x.emoji === "DONE"), { timeout: 15_000 })
    .toBe(true)

  // ③ 别人发来的不回(只认扫码那个人)
  const 之前 = (await feishu.发出的()).length
  await feishu.发来("我是谁", { openId: "stranger-open-id" })
  await page.waitForTimeout(2_500)
  expect((await feishu.发出的()).length).toBe(之前)

  // ④ 通知开关:关掉「任务跑完」,重进屏还是关的(feishu.notify 持久)
  // (步骤 ③ 点进了对话,先回设置的远程助理屏)
  await 进设置(page, "远程助理")
  const 开关 = 卡.locator(".ra-feishu-notify input[type=checkbox]").first()
  await 开关.uncheck()
  await 进设置(page, "插件")
  await 进设置(page, "远程助理")
  await expect(
    page.locator('section[aria-labelledby="ra-feishu"]').locator(".ra-feishu-notify input[type=checkbox]").first(),
  ).not.toBeChecked()
})
