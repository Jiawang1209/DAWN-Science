/**
 * **上一条还在回时又发一条：插队与排队**（2026-08-15）。**跑真实构建产物。**
 *
 * 作者三次报同一句 `Agent is already processing.`，第一版的修法是**拦住**。
 * 他看过 Hermes 之后要的是另一种：*「对话框依旧能传上去，但是却不执行新的内容，
 * 而是等上一条结束，再执行新的内容。」*
 *
 * 两条路都是 pi 原生的（`AgentSession.prompt` 的 `streamingBehavior`）：
 *   回车         → `steer`，插队（当前轮跑完工具、下次调模型之前送进去）
 *   Cmd/Ctrl+回车 → `followUp`，排队（这一轮彻底完了才送）
 *
 * ## 这条为什么非得在真实产物上跑
 *
 * 要证的是「**没有报错，而且那句话真的进去了**」。单元测试能断言我们把
 * `behavior` 传了下去，**证明不了 pi 收不收**——而 pi 在流式中收到没有
 * `streamingBehavior` 的 prompt 会直接抛错，那正是这个 bug 的原样。
 * 中间还隔着运行时那段「排队时不能走原来的收尾」（走了的话 `idle` 会提前发，
 * 界面以为这一轮完了）。这几层的接缝只有真跑一次才看得见。
 */
import { test, expect, 开一段临时会话 } from "./fixtures.js"

test.use({
  dawnOptions: {
    toolCall: {
      // **拖住这一轮**：不拖的话断言就变成了跟模型赛跑
      toolName: "bash",
      args: { command: "sleep 5" },
      /** 让假模型先说一句再调工具——作者报的那一幕是「它已经开口了、还在往下干」 */
      say: "我先看看这里有什么。",
    },
  },
})

/** 把话打进去、按键，返回按下的那一刻 */
async function 打一句(page: import("@playwright/test").Page, 话: string, 键: string) {
  const 框 = page.getByPlaceholder(/今天帮你做些什么/)
  await 框.fill(话)
  await 框.press(键)
}

test("**正在回的时候，回车插队：传得上去、不报错**", async ({ dawn }) => {
  const { page } = dawn
  await 开一段临时会话(page)

  await 打一句(page, "看一下这个目录", "Enter")
  await expect(page.getByText("我先看看这里有什么。")).toBeVisible({ timeout: 30_000 })

  /** **忙着且框里有字：那颗按钮说的是「插队」，不是「停止」** */
  await 打一句(page, "顺便说说文件大小", "Enter")

  /** **传上去了**：转录里两条用户发言都在 */
  await expect(page.locator(".turn.user")).toHaveCount(2)
  await expect(page.getByText("顺便说说文件大小")).toBeVisible()

  /**
   * **不许再出现那句报错。** 这是整条修复的落点——
   * 在此之前，第二条会被 pi 拒收并回 `Agent is already processing`。
   */
  await expect(page.getByText(/already processing/i)).toHaveCount(0)

  /** 这一轮跑完之后要能正常收尾（`idle` 没被提前发掉） */
  await expect(page.getByRole("button", { name: "发送", exact: true })).toBeVisible({
    timeout: 60_000,
  })
})

test("**Cmd+回车是排队**，同样传得上去、不报错", async ({ dawn }) => {
  const { page } = dawn
  await 开一段临时会话(page)

  await 打一句(page, "看一下这个目录", "Enter")
  await expect(page.getByText("我先看看这里有什么。")).toBeVisible({ timeout: 30_000 })

  await 打一句(page, "排到后面这一句", "ControlOrMeta+Enter")

  await expect(page.locator(".turn.user")).toHaveCount(2)
  await expect(page.getByText(/already processing/i)).toHaveCount(0)
  await expect(page.getByRole("button", { name: "发送", exact: true })).toBeVisible({
    timeout: 60_000,
  })
})

/**
 * **两条路都要看得见**（「看不见的能力等于不存在」）。
 * 只写在无障碍标签里不算——这个项目为此栽过两次。
 */
test("忙着且框里有字时，屏幕上明写着这两条怎么用", async ({ dawn }) => {
  const { page } = dawn
  await 开一段临时会话(page)

  await 打一句(page, "看一下这个目录", "Enter")
  await expect(page.getByText("我先看看这里有什么。")).toBeVisible({ timeout: 30_000 })

  /** 空着的时候不提示——那时这颗按钮是「停止」，说插队是错的 */
  await expect(page.getByText(/回车插队/)).toHaveCount(0)
  await expect(page.getByRole("button", { name: "停止" })).toBeVisible()

  await page.getByPlaceholder(/今天帮你做些什么/).fill("打了字")
  await expect(page.getByText(/回车插队/)).toBeVisible()
  await expect(page.getByRole("button", { name: "插队" })).toBeVisible()
})
