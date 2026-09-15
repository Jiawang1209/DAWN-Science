/**
 * 连续的工具调用折成一行（2026-09-15）。**跑真实构建产物。**
 *
 * 作者：*「这些内容，我们能否也进行一个折叠呢？」*——一次查服务器连着 9 条 bash，每条各自折叠了仍占大半屏。
 * 失败怎么出声是作者选的：**只在汇总行里红字写「N 条失败」**，点开才看是哪条。
 *
 * 用一条「第一次成功、之后失败」的命令连调三次：一组里既有成功也有失败，两件事一次验完。
 */
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test, expect, 开一段临时会话, 等进了对话 } from "./fixtures.js"

/** 绝对路径：三次调用的工作目录不必相同 */
const 标记 = join(tmpdir(), `dawn-e2e-group-${process.pid}-${Date.now()}`)

test.describe("连续三条命令", () => {
  test.use({
    dawnOptions: {
      toolCall: {
        toolName: "bash",
        // 第一次建标记并成功；之后标记已在，退出码 3
        args: { command: `test -f ${标记} && exit 3; touch ${标记}; echo 第一次` },
        repeat: 3,
      },
    },
  })

  test("**折成一行，失败数红字写在汇总里；点开是逐条**", async ({ dawn }) => {
    const { page } = dawn
    await 开一段临时会话(page, "查三次")
    await 等进了对话(page)

    const 组 = page.locator(".tool-group")
    await expect(组).toHaveCount(1, { timeout: 60_000 })
    const 头 = 组.locator(".tool-group-head")
    await expect(头).toContainText("运行了 3 条命令", { timeout: 60_000 })
    await expect(头).toHaveAttribute("aria-expanded", "false")

    // 失败数出声，且是红的（与单条失败同一个颜色）
    const 失败 = 头.locator(".tool-group-failed")
    await expect(失败).toContainText("2 条失败")
    const [红, 危险] = await 失败.evaluate((el) => {
      const 探 = document.createElement("span")
      探.style.color = "var(--dawn-danger)"
      document.body.appendChild(探)
      const d = getComputedStyle(探).color
      探.remove()
      return [getComputedStyle(el).color, d]
    })
    expect(红).toBe(危险)

    // 收着的时候，组里一条都不画——整组只占一行
    await expect(组.locator(".tool")).toHaveCount(0)
    await expect(page.locator(".turns .tool")).toHaveCount(0)

    await 头.click()
    await expect(头).toHaveAttribute("aria-expanded", "true")
    await expect(组.locator(".tool")).toHaveCount(3)
    await expect(组.locator(".tool.error")).toHaveCount(2)
    // 点开组看到的是逐条一行：失败的那两条也收着（不是三段报错一起摊开）
    await expect(组.locator(".tool-body")).toHaveCount(0)

    await 头.click()
    await expect(组.locator(".tool")).toHaveCount(0)
  })
})
