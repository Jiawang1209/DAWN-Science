/**
 * **上一条还在回时又发一条：排队、插队与待发条**（2026-08-15；2026-09-23 改）。**跑真实构建产物。**
 *
 * 作者三次报同一句 `Agent is already processing.`，第一版的修法是**拦住**。
 * 他看过 Hermes 之后要的是另一种：*「对话框依旧能传上去，但是却不执行新的内容，
 * 而是等上一条结束，再执行新的内容。」*
 *
 * 09-23 照 Codex 改（spec `2026-09-23-待发消息-design.md`）：
 *   回车         → `followUp`，排队（这一轮彻底完了才送）
 *   Cmd/Ctrl+回车 → `steer`，插队（当前轮跑完工具、下次调模型之前送进去）
 * 排着的话挂在输入框上方的**待发条**上，能「取回」、能改「插队」；
 * **真送到模型那一刻才进转录**——此前写的一刻就进，位置落在 agent 这一轮中间，看着像已经送到了。
 *
 * ## 这条为什么非得在真实产物上跑
 *
 * 要证的是「**没有报错，而且那句话真的进去了**」。单元测试能断言我们把
 * `behavior` 传了下去，**证明不了 pi 收不收**，也证明不了 pi 的 `queue_update`
 * 真的按我们以为的样子报（待发条消失、转录出现，全靠它）。
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

/** 开一段、说第一句，等假模型开口——此后 `sleep 5` 拖住这一轮 */
async function 让它忙起来(page: import("@playwright/test").Page) {
  await 开一段临时会话(page)
  await 打一句(page, "看一下这个目录", "Enter")
  await expect(page.getByText("我先看看这里有什么。")).toBeVisible({ timeout: 30_000 })
}

const 待发条 = (page: import("@playwright/test").Page) => page.locator(".queued-strip")
const 收尾了 = (page: import("@playwright/test").Page) =>
  expect(page.getByRole("button", { name: "发送", exact: true })).toBeVisible({ timeout: 60_000 })

test("**正在回的时候，回车是排队**：挂在待发条上、此刻不进转录；这一轮完了才送进去", async ({ dawn }) => {
  const { page } = dawn
  await 让它忙起来(page)

  await 打一句(page, "顺便说说文件大小", "Enter")

  /** 挂上去了，标着「排队中」 */
  await expect(待发条(page)).toContainText("顺便说说文件大小")
  await expect(待发条(page)).toContainText("排队中")
  /** **还没送到，转录里就只有第一句**——此前这里立刻是两条，位置在 agent 这一轮中间 */
  await expect(page.locator(".turn.user")).toHaveCount(1)

  await expect(page.getByText(/already processing/i)).toHaveCount(0)

  /** 送到了：待发条消失，转录里出现第二句 */
  await expect(待发条(page)).toHaveCount(0, { timeout: 60_000 })
  await expect(page.locator(".turn.user")).toHaveCount(2)
  await expect(page.locator(".turn.user").nth(1)).toContainText("顺便说说文件大小")
  await 收尾了(page)
})

test("**Cmd+回车是插队**：标着「插队中」，工具跑完就送进去", async ({ dawn }) => {
  const { page } = dawn
  await 让它忙起来(page)

  await 打一句(page, "插到前面这一句", "ControlOrMeta+Enter")
  await expect(待发条(page)).toContainText("插队中")

  await expect(page.locator(".turn.user")).toHaveCount(2, { timeout: 60_000 })
  await expect(page.getByText(/already processing/i)).toHaveCount(0)
  await 收尾了(page)
})

test("**取回**：从待发条拿下来、字回到输入框，这句话不会被送出去", async ({ dawn }) => {
  const { page } = dawn
  await 让它忙起来(page)

  await 打一句(page, "我想改一下这句", "Enter")
  await expect(待发条(page)).toContainText("我想改一下这句")

  await 待发条(page).getByRole("button", { name: "取回" }).click()
  await expect(待发条(page)).toHaveCount(0)
  await expect(page.getByPlaceholder(/今天帮你做些什么/)).toHaveValue("我想改一下这句")

  /** 这一轮收尾之后，转录里始终只有第一句 */
  await 收尾了(page)
  await expect(page.locator(".turn.user")).toHaveCount(1)
})

test("**排队的改插队**：点「插队」，标签变「插队中」，最终照样送到", async ({ dawn }) => {
  const { page } = dawn
  await 让它忙起来(page)

  await 打一句(page, "这句要早点进去", "Enter")
  await expect(待发条(page)).toContainText("排队中")
  await 待发条(page).getByRole("button", { name: "插队" }).click()
  await expect(待发条(page)).toContainText("插队中")
  /** 插队中的那条没有「插队」那颗了——它已经在插队 */
  await expect(待发条(page).getByRole("button", { name: "插队" })).toHaveCount(0)

  await expect(page.locator(".turn.user")).toHaveCount(2, { timeout: 60_000 })
  await 收尾了(page)
})

test("**有待发时按停止**：排着的话回到输入框，停下之后不会自己冒出来", async ({ dawn }) => {
  const { page } = dawn
  await 让它忙起来(page)

  await 打一句(page, "停了之后我再决定", "Enter")
  await expect(待发条(page)).toContainText("停了之后我再决定")

  /** 框里已经空了（发出去了），这颗就是「停止」 */
  await page.getByRole("button", { name: "停止" }).click()
  await expect(待发条(page)).toHaveCount(0)
  await expect(page.getByPlaceholder(/今天帮你做些什么/)).toHaveValue("停了之后我再决定")
  await 收尾了(page)
  await expect(page.locator(".turn.user")).toHaveCount(1)
})

/**
 * **两条路都要看得见**（「看不见的能力等于不存在」）。
 * 只写在无障碍标签里不算——这个项目为此栽过两次。
 */
test("忙着且框里有字时，屏幕上明写着这两条怎么用；待发条上的按钮常驻可见", async ({ dawn }) => {
  const { page } = dawn
  await 让它忙起来(page)

  /** 空着的时候不提示——那时这颗按钮是「停止」 */
  await expect(page.getByText(/回车排到这一轮后面/)).toHaveCount(0)
  await expect(page.getByRole("button", { name: "停止" })).toBeVisible()

  await page.getByPlaceholder(/今天帮你做些什么/).fill("打了字")
  await expect(page.getByText(/回车排到这一轮后面/)).toBeVisible()
  await expect(page.getByRole("button", { name: "排到后面" })).toBeVisible()

  await page.getByPlaceholder(/今天帮你做些什么/).press("Enter")
  /** `toBeVisible()` 对 opacity: 0 仍算可见——要量 */
  for (const 名 of ["插队", "取回"]) {
    const 键 = 待发条(page).getByRole("button", { name: 名 })
    await expect(键).toBeVisible()
    expect(await 键.evaluate((el) => getComputedStyle(el).opacity)).toBe("1")
  }
})
