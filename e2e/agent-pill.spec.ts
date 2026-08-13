/**
 * 输入卡右下角那颗 pill（①-B″ · U0 建，**2026-08-12 换主语**）。
 * **跑真实构建产物。**
 *
 * 单元测试能证明「pill 在 `.composer` 的 DOM 里」。它证明不了**它真的在右下角**——
 * 那是几何，不是结构。这里量坐标。
 *
 * ## 换掉的是什么
 *
 * 那颗 pill 原来是 **agent 选择器**（挑哪家服务/CLI）。作者 2026-08-12 要求
 * 把这一行收成**一颗**（实测 WorkBuddy 就是 `◐ Hy3 ⌃` 一颗），
 * 于是留在这里的是**模型 pill**——它同时管「哪家」与「哪个模型」，
 * 因为那本来就是同一个问题。
 *
 * 「用别的 agent 开一段新对话」搬去了**初始画面**（挑 LLM 发生在开口之前），
 * 以及命令面板。**几何这件事一个字没变**：靠右、靠下、菜单向上弹。
 */
import { test, expect, 开一段临时会话 } from "./fixtures.js"

async function startSession(page: import("@playwright/test").Page) {
  await 开一段临时会话(page)
  await expect(page.getByPlaceholder(/今天帮你做些什么/)).toBeVisible()
}

test("模型 pill 在输入卡里，且**几何上确实靠右靠下**", async ({ dawn }) => {
  const { page } = dawn
  await startSession(page)

  const pill = page.locator(".composer .model-pill")
  await expect(pill).toBeVisible()

  const p = (await pill.boundingBox())!
  /**
   * **参照系是那张卡，不是外面那条带子。**
   *
   * 2026-08-09 输入区变成了一张有宽度上限（768px）的卡，`.composer` 退化成
   * 一条通栏的容器——拿它当参照，量到的是「卡到窗口边缘还有多远」，
   * 与「控件贴不贴右」无关。**断言的意图没变，参照系跟着搬。**
   */
  const area = (await page.locator(".composer-box").boundingBox())!
  const text = (await page.locator(".composer textarea").boundingBox())!
  const row = (await page.locator(".composer .composer-controls").boundingBox())!
  const send = (await page.locator(".composer button[type=submit]").boundingBox())!

  // 靠右：**控件行**贴着输入卡的右缘。
  // 最右的是发送按钮而不是 pill —— Hermes 的 controls.tsx 就是这个顺序
  // （`ml-auto` 的那一行里，pill 在前、发送在后），照搬
  expect(area.x + area.width - (row.x + row.width)).toBeLessThan(24)
  expect(send.x).toBeGreaterThan(p.x)
  // 靠下：整行都在输入框下方
  expect(p.y).toBeGreaterThanOrEqual(text.y + text.height)
})

/**
 * **服务名在菜单的分组标题上**（2026-08-12 换的位置）。
 *
 * 2026-08-11：原来断言 pill 上写着 `DeepSeek` 而不是 `ds-chat`
 * （`providers.yaml` 里的一个键）——作者：*「不如直接叫 DeepSeek。」*
 *
 * 两颗并成一颗之后，pill 上写的是**模型名**（前面一个小圆标记），
 * 而「哪家」退到菜单的分组标题上。**意图一个字没变**：
 * 界面上出现的是这家服务的名字，不是我们内部那个键。
 *
 * **这条只有跑真链路才算数**：`DeepSeek` 来自 pi 的 provider 表，
 * 不是我们手打的对照表——单元测试里我可以喂任何字符串然后断言它渲染了。
 */
test("用**服务名**称呼它，不是配置里那个键", async ({ dawn }) => {
  const { page } = dawn
  await startSession(page)
  await page.locator(".model-pill .model-trigger").click()
  const 菜单 = page.getByRole("menu", { name: "切换模型" })
  await expect(菜单.locator(".model-group-head")).toContainText("DeepSeek")
  await expect(菜单).not.toContainText("ds-chat")
})

/**
 * **「点了以为换模型、结果新开了对话」这条不会再发生了**（2026-08-12）。
 *
 * 上一版这里断言 agent pill 的菜单**明说**「新建会话」——
 * 那是在用文案消歧义，因为两颗形状一样的 pill 挨着，语义却不同。
 *
 * 现在 composer 上**只剩一颗**，那种误按从形状上就不可能了。
 * 所以这条改成守住结构本身：**这一行里没有第二个可点开的 pill**。
 */
test("**输入卡这一行只有一颗 pill** —— 误按从形状上就不可能", async ({ dawn }) => {
  const { page } = dawn
  await startSession(page)
  await expect(page.locator(".composer-controls .pill")).toHaveCount(1)
  await page.locator(".model-pill .model-trigger").click()
  await expect(page.getByRole("menu", { name: "切换模型" })).toBeVisible()
  await expect(page.getByRole("menu", { name: "新建会话" })).toHaveCount(0)
})

test("菜单向上弹 —— pill 贴着窗口底部，向下会被切掉", async ({ dawn }) => {
  const { page } = dawn
  await startSession(page)
  const pillBox = (await page.locator(".composer .model-pill").boundingBox())!
  await page.locator(".model-pill .model-trigger").click()
  const menu = (await page.getByRole("menu", { name: "切换模型" }).boundingBox())!
  expect(menu.y + menu.height).toBeLessThanOrEqual(pillBox.y + 1)
})

test("侧栏那份真的没了", async ({ dawn }) => {
  await expect(dawn.page.locator(".agent-pick")).toHaveCount(0)
})

/**
 * **首页那颗挑 LLM 的 pill 底下也要有「配置自定义模型」**（2026-08-13，
 * 作者：*「新建任务页面对话框里面选择 LLM 的地方，也要加一个配置自定义模型，
 * 然后点击进去一下子也可以跳转到自定义模型配置的地方去。」*）。
 *
 * 对话里那颗 `ModelPill` 早就有这一条了，**而空态这颗没有**——
 * 于是「我想加一家」这件事在首页上唯一的出路是自己想到去翻设置。
 * **同一个需求在两个屏上不该有两种答案。**
 */
test("**首页挑 LLM 那里，能直接跳到配模型**", async ({ dawn }) => {
  const { page } = dawn

  // 空态那颗 pill：只有配了不止一家时才画（一家时没什么可挑的）
  const pill = page.locator(".composer-controls .agent-pill")
  if ((await pill.count()) === 0) test.skip(true, "这套夹具只配了一家 agent，没有这颗 pill")

  await pill.locator("button").first().click()
  const 去配 = page.getByRole("menuitem", { name: /配置自定义模型/ })
  await expect(去配).toBeVisible()
  await 去配.click()

  // 真的到了设置的模型服务那一块
  await expect(page.getByText(/模型服务/).first()).toBeVisible({ timeout: 30_000 })
  // 点完就收起——菜单不该赖着不走
  await expect(page.getByRole("menuitem", { name: /配置自定义模型/ })).toHaveCount(0)
})
