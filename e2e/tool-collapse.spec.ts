/**
 * 工具调用整块可折叠（2026-08-10）。**跑真实构建产物。**
 *
 * 作者：*「dawn-science 回复的时候我会看到很多 Linux 的命令，
 * 这个在 codex 和 claude 里面，都是可以折叠的。」*
 *
 * ## 这份用例的重心是「报错的那条不许被折叠」
 *
 * 折叠是为了让对话读得下去。但**失败必须出声**（规格 7.5）——
 * 一个折叠起来的错误等于没报错，人要一条条点开才知道哪里出了问题，
 * 那正是把「出声」变成「藏着」。所以这里验的不是「能折叠」，
 * 而是**该折的折了、不该折的没折**。
 */
import { test, expect, 开一段临时会话 } from "./fixtures.js"

test.describe("成功的工具调用", () => {
  test.use({
    dawnOptions: {
      toolCall: { toolName: "write", args: { path: "结果.md", content: "# 写好了\n" } },
    },
  })

  test("**默认折叠，且折叠时看得见它做了什么**", async ({ dawn }) => {
    const { page } = dawn
    await 开一段临时会话(page)
    await page.getByPlaceholder(/今天帮你做些什么/).fill("写一个文件")
    await page.getByRole("button", { name: "发送", exact: true }).click()
    await expect(page.getByText(/假模型已应答/).last()).toBeVisible({ timeout: 30_000 })

    const tool = page.locator(".tool").first()
    await expect(tool).toBeVisible()
    // 折叠着：正文不在
    await expect(tool.locator(".tool-body")).toHaveCount(0)
    await expect(tool.locator(".tool-head")).toHaveAttribute("aria-expanded", "false")
    /**
     * **折叠不等于什么都不说。** 那一行里必须还看得见它做了什么——
     * 一排「write / 完成」而不知道写的是哪个文件，等于把信息藏没了。
     */
    await expect(tool.locator(".tool-peek")).toContainText("结果.md")
  })

  test("点一下就展开，再点收起 —— **整行都可点**，不是那个小三角", async ({ dawn }) => {
    const { page } = dawn
    await 开一段临时会话(page)
    await page.getByPlaceholder(/今天帮你做些什么/).fill("写一个文件")
    await page.getByRole("button", { name: "发送", exact: true }).click()
    await expect(page.getByText(/假模型已应答/).last()).toBeVisible({ timeout: 30_000 })

    const tool = page.locator(".tool").first()
    const head = tool.locator(".tool-head")
    // 点在整行的右半边——只有小三角可点的话这里点不动
    const box = (await head.boundingBox())!
    await page.mouse.click(box.x + box.width * 0.75, box.y + box.height / 2)

    await expect(tool.locator(".tool-body")).toBeVisible()
    await expect(head).toHaveAttribute("aria-expanded", "true")

    await head.click()
    await expect(tool.locator(".tool-body")).toHaveCount(0)
  })
})

/**
 * **「报错的默认展开」在单元测试里钉**（`tests/ui/tool-collapse.test.tsx`）。
 *
 * 它是一条纯规则——`status === "error"` ⇒ 默认展开——不需要真把一个工具跑挂。
 * 而在 e2e 里造一次真实失败要嘛依赖某个工具的具体报错行为，
 * 要嘛给假后端加一条只为测试存在的分支，两样都比规则本身脆。
 */
