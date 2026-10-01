import { test, expect, 开一段临时会话 } from "./fixtures.js"

const 思考 = "第一段首行\n第一段续行\n\n第二段首行\n第二段续行\n\n第三段首行（未完）"

test.describe("思考按段落显示摘要", () => {
  test.use({ dawnOptions: { thinking: 思考 } })

  test("完成后显示末段首行、保留秒数与可展开的原文", async ({ dawn }) => {
    const { page } = dawn
    await 开一段临时会话(page)
    await page.getByPlaceholder(/今天帮你做些什么/).fill("请开始思考")
    await page.getByRole("button", { name: "发送", exact: true }).click()
    await expect(page.getByText(/假模型已应答/).last()).toBeVisible({ timeout: 30_000 })

    const 块 = page.locator(".thought").first()
    await expect(块.locator(".thought-label")).toHaveText("想了")
    await expect(块.locator(".thought-secs")).toHaveText(/^\d+s$/)
    await expect(块.locator(".thought-preview")).toHaveText("第三段首行（未完）")
    await 块.locator(".thought-head").click()
    await expect(块.locator(".thought-body")).toHaveText(思考)
  })

  test("扫光遵守系统减弱动效偏好", async ({ dawn }) => {
    const { page } = dawn
    await 开一段临时会话(page)
    const 读取动画 = () => page.locator(".turns").evaluate((turns) => {
      const preview = document.createElement("span")
      preview.className = "thought-preview sweeping"
      preview.textContent = "测试摘要"
      turns.appendChild(preview)
      const animation = getComputedStyle(preview).animationName
      preview.remove()
      return animation
    })

    expect(await 读取动画()).toBe("thought-preview-sweep")
    await page.emulateMedia({ reducedMotion: "reduce" })
    expect(await 读取动画()).toBe("none")
  })
})
