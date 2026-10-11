import { test, expect, 开一段临时会话, 进设置 } from "./fixtures.js"

test("对话字号按一根轴缩放，并在重载后保留", async ({ dawn }) => {
  const { page } = dawn
  await 开一段临时会话(page, "检查字号缩放")

  const 读取样式 = () => page.locator(".turns").evaluate((turns) => {
    const 根 = getComputedStyle(document.documentElement)
    const 对话 = getComputedStyle(turns)
    const 容器 = document.createElement("div")
    容器.className = "md"
    容器.innerHTML = "<h1>一级</h1><h2>二级</h2><h3>三级</h3>"
    turns.appendChild(容器)
    const 像素 = (value: string) => Math.round(Number.parseFloat(value) * 10) / 10
    const 标题 = [...容器.querySelectorAll("h1,h2,h3")].map((el) => 像素(getComputedStyle(el).fontSize))
    容器.remove()
    return {
      根字号: 根.getPropertyValue("--dawn-chat-size").trim(),
      正文: 像素(对话.fontSize),
      行高: 对话.lineHeight,
      标题,
      头像: 像素(getComputedStyle(document.querySelector(".who-avatar")!).width),
      操作图标: 像素(getComputedStyle(document.querySelector(".turn-actions .btn-icon")!).width),
    }
  })

  expect(await 读取样式()).toEqual({
    根字号: "17px",
    正文: 17,
    行高: "29.75px",
    标题: [23.8, 20.4, 17.9],
    头像: 34,
    操作图标: 31.7,
  })

  await 进设置(page, "外观")
  const slider = page.getByRole("slider", { name: "对话字号" })
  await expect(slider).toHaveValue("17")
  await slider.focus()
  await slider.press("ArrowRight")
  await expect(slider).toHaveValue("18")
  await page.getByRole("button", { name: "设置", exact: true }).click()
  await expect(page.locator(".turns")).toBeVisible()
  expect(await 读取样式()).toEqual({
    根字号: "18px",
    正文: 18,
    行高: "31.5px",
    标题: [25.2, 21.6, 18.9],
    头像: 36,
    操作图标: 33.6,
  })

  await page.reload()
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--dawn-chat-size").trim())).toBe("18px")
  await 进设置(page, "外观")
  await expect(page.getByRole("slider", { name: "对话字号" })).toHaveValue("18")
})
