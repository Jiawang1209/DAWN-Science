/**
 * 新建任务（T2/T3）。**跑真实构建产物。**
 *
 * 作者：*「我也要 workbuddy 的新建任务……如果在任务里面不设置任何工作目录的话，
 * 那么其实就是我们的普通对话。」*
 *
 * 所以这条盯的是**那句话本身**：点一下，不问路径，直接能聊。
 */
import { test, expect } from "./fixtures.js"

test("**点「新建任务」就能聊** —— 不问工作路径", async ({ dawn }) => {
  const { page } = dawn

  await page.getByRole("button", { name: "新建任务" }).click()

  // 建完就进对话——**不该让人再点一次才进得去**
  await expect(page.getByPlaceholder(/回车发送/)).toBeVisible({ timeout: 30_000 })

  await page.getByPlaceholder(/回车发送/).fill("你好")
  await page.getByRole("button", { name: "发送", exact: true }).click()
  await expect(page.locator(".turns")).toContainText("假模型已应答", { timeout: 30_000 })
  // 写权那条路也要通——它此前在四个地方各写了一遍，漏一个就是「点了没反应」
  await expect(page.getByText(/写入被拒/)).toHaveCount(0)
})

/**
 * **一次点击，侧栏只多一行**（T3-a，2026-08-12）。
 *
 * 作者打开分支之后报的：*「我看 workbuddy 新建任务之后，直接就是干净的
 * 对话窗口，也没有做任何的归类。我感觉我们目前还没有实现这个功能。」*
 *
 * 截图量出来的实情比那句话更糟：点**一次**「新建任务」，侧栏冒出**两行**——
 * 任务表列一次，旧的「对话」列又把同一段会话列了一遍。
 * 上一批为了不一次改红几十条选择器，把新旧两套并排放着，代价就是这个。
 *
 * 所以这条盯的是**计数**，不是「有没有那一行」：
 * 「多了一行」与「多了两行」在截图上很容易看成同一件事，在断言里不会。
 */
test("**点一次「新建任务」，侧栏只多一行**", async ({ dawn }) => {
  const { page } = dawn
  await page.getByRole("button", { name: "新建任务" }).click()
  await expect(page.getByPlaceholder(/回车发送/)).toBeVisible({ timeout: 30_000 })

  // 侧栏里所有的对话行，加起来只有一条
  await expect(page.locator(".sidebar .sess-item")).toHaveCount(1)

  /**
   * **它归在「会话」那一栏。**
   *
   * 作者定的：*「如果……不选择文件夹，直接对话，那么就属于是一个会话，
   * 那么就会归类到左边侧边栏的会话里面。」*
   */
  await expect(page.locator(".side-section").filter({ hasText: "会话" })).toBeVisible()

  /**
   * **「项目」那一栏此刻整块不出现。**
   * 一个写着 `(0)` 的标题占一行、什么都没说——而且它会让人以为自己漏建了什么。
   */
  await expect(page.locator(".side-section").filter({ hasText: "项目" })).toHaveCount(0)

  /**
   * **没设路径 = 普通对话，那一格什么都不写。**
   *
   * 服务端确实给了它一个目录（agent 要能读写），但那是实现细节——
   * 摆出来只会让人看见一个自己从没选过的路径，
   * 而那正是此前「临时会话」让人困惑的地方。
   */
  await expect(page.locator(".task-ws")).toHaveCount(0)
})

/**
 * **入口只有一个**（T3-a）。
 *
 * 「新建会话」「新建项目」两颗一起下线了——它们与「新建任务」是同一件事的
 * 三种说法，而三个入口意味着**三条各自演化的路**：
 * 本项目已经因为「同一个动作两个入口」出过一次事（agent pill 那次）。
 */
test("**侧栏上只剩一个新建入口**", async ({ dawn }) => {
  const { page } = dawn
  await expect(page.getByRole("button", { name: "新建任务" })).toBeVisible()
  await expect(page.getByRole("button", { name: "新建会话" })).toHaveCount(0)
  await expect(page.getByRole("button", { name: "新建项目" })).toHaveCount(0)
})
