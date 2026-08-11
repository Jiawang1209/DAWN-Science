/**
 * 「已经跑了多久」（②-B · R2）。**跑真实构建产物。**
 *
 * 作者：*「可以，不设默认超时，但把『已经跑了多久』显示出来，中止交给你按。」*
 *
 * ## 为什么这条非得在真实产物上验
 *
 * 这两句是**成对的**。不设默认超时，意味着**「还在跑」与「卡死了」
 * 在界面上长得一模一样**——远端一条 `bwa index` 跑二十分钟是正常的。
 * 唯一能把两者分开的信息就是这个数；没有它，人要按的那个「停止」
 * 就成了一次没有依据的赌。
 *
 * 而单元测试证明不了它**在动**：`useTick` 的定时器、
 * 「跑完就停表」这两件事都只在真产物里才成立。这份用例故意跑一条
 * `sleep 4`——**慢是有意的**，那是唯一能同时看到「运行中」与「已结束」两态的方式。
 */
import { test, expect, 开一段临时会话 } from "./fixtures.js"

test.describe("工具调用的秒表", () => {
  test.use({
    dawnOptions: {
      // 4 秒：显示门槛是 1 秒，留出三秒的观察窗口，不至于擦边
      toolCall: { toolName: "bash", args: { command: "sleep 4" } },
    },
  })

  test("**跑的时候在走，跑完了停表**", async ({ dawn }) => {
    const { page } = dawn
    await 开一段临时会话(page)
    await page.getByPlaceholder(/回车发送/).fill("跑一条慢命令")
    await page.getByRole("button", { name: "发送", exact: true }).click()

    const tool = page.locator(".tool").first()
    await expect(tool).toBeVisible({ timeout: 30_000 })

    // 运行中：**折叠着也看得见**——一条在跑的命令正是不该点开才知道的那种
    const 秒表 = tool.locator(".tool-elapsed")
    await expect(秒表).toContainText("已跑", { timeout: 15_000 })
    await expect(tool.locator(".tool-head")).toHaveAttribute("aria-expanded", "false")

    // 它真的在走：等一会儿之后读数变大（**不是一个画上去的静止的数**）
    const 第一次 = (await 秒表.textContent())!
    await expect(async () => {
      expect(await 秒表.textContent()).not.toBe(第一次)
    }).toPass({ timeout: 5_000 })

    // 跑完之后停表：不再是「已跑」，而是一个定住的耗时
    await expect(page.getByText(/假模型已应答/)).toBeVisible({ timeout: 30_000 })
    await expect(秒表).not.toContainText("已跑")
    await expect(秒表).toContainText("秒")

    /**
     * **停了就是停了。** 这一条盯的是「跑完还在跳」这种错——
     * 那会让一条早就结束的命令看起来永远在跑。
     */
    const 定住的 = (await 秒表.textContent())!
    await page.waitForTimeout(2_000)
    expect(await 秒表.textContent()).toBe(定住的)
  })
})
