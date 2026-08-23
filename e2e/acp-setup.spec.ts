/**
 * **从界面把一个 ACP 适配器接进来**（2026-08-19）。**跑真实构建产物。**
 *
 * 作者：*「你现在要在选择模型的地方加上我们之前开发 ACP 的东西，
 * 否则岂不是白开发了。」*
 *
 * ## 缺的是哪一块
 *
 * ACP 那一整套 2026-08-16 就做完了——runtime、权限卡、模型旁边那个 ACP 标记，
 * `acp-agent.spec.ts` 有一整份用例盯着它们。**但默认配置里一个 acp agent
 * 都没有，界面上也没有任何地方能加**：只能自己打开 `providers.yaml` 手写一段。
 * 于是那些代码对使用者而言**等于不存在**——这与 kimi 那次是同一件事
 * （*「让人打开一个 yaml 手写一段，本身就是这个应用没做完」*）。
 *
 * ## 所以这份用例盯的不是 ACP，是**那条从没走通过的路**
 *
 * `acp-agent.spec.ts` 是拿一份**预先写好的 `providers.yaml`** 起的。
 * 这里反过来：**配置里一个 acp 都没有**，全靠界面加进去，
 * 然后真的用它聊一段。中间隔着协议、config writer、内存里那份 registry
 * 的原地更新、以及模型选择器的重取——**每一环都能单独坏掉而单测全绿**。
 */
import { resolve } from "node:path"
import { test, expect, 进设置, 打开agent菜单, 等进了对话 } from "./fixtures.js"

/** 那个假适配器。**真跑一个进程**，只是另一头不联网、不登录 */
const 假ACP = resolve(import.meta.dirname, "..", "scripts", "fake-acp-agent.mjs")

/**
 * **配置里刻意一个 acp 都没有。** 这正是作者遇到的那个起点——
 * 预先写一个进去的话，这份用例就退化成 `acp-agent.spec.ts` 的重复。
 *
 * 两个 native：删除那条要验「最后一个不给删」之外的正常路径，
 * 而只有一个 agent 时连加进来的那个都删不掉。
 */
const PROVIDERS = `agents:
  ds-chat:
    kind: native
    provider: deepseek
    model: deepseek-v4-flash
    capabilities: [chat, exec]

  ds-pro:
    kind: native
    provider: deepseek
    model: deepseek-v4-pro
    capabilities: [chat, exec]
`

test.use({ dawnOptions: { providersYaml: PROVIDERS } })

/** 走「自定义一条命令」那条路把假适配器接进来 */
async function 接一个(page: import("@playwright/test").Page, id: string) {
  await page.getByRole("button", { name: "＋ 自定义一条命令" }).click()
  await page.getByLabel("适配器名字").fill(id)
  await page.getByLabel("适配器命令").fill("node")
  await page.getByLabel("适配器参数").fill(假ACP)
  await page.getByRole("button", { name: "接入这个适配器" }).click()
}

test("**加一个 ACP 适配器，然后真的用它聊一段**", async ({ dawn }) => {
  const { page } = dawn

  await 进设置(page, "ACP 适配器")

  /**
   * ① **空态说清楚它是空的。** 一片留白与「这一屏还没加载完」分不开，
   * 而这一屏存在的全部理由就是告诉人「这里可以加」。
   */
  await expect(page.getByText("还没有接入任何 ACP 适配器。")).toBeVisible()

  /**
   * ② **两个预置看得见，而且写明了它到底会去跑什么。**
   * 「Codex」告诉你这是什么，那串包名告诉你它会启动谁——
   * 后者是判断「这条命令我信不信」的依据。
   */
  await expect(page.getByText("@agentclientprotocol/codex-acp")).toBeVisible()
  await expect(page.getByText("@zed-industries/claude-code-acp")).toBeVisible()
  // **前提写在旁边**，不是等人点下去看一串 ENOENT
  await expect(page.getByText(/需要 Node/)).toBeVisible()

  // ③ 自定义那条路：指向我们自己那个假适配器
  await 接一个(page, "my-acp")
  await expect(page.locator(".acp-row .name")).toHaveText("my-acp")

  /**
   * ④ **立刻出现在模型选择器里，带着 ACP 标记。**
   *
   * 「立刻」是要害：只写文件不更新内存里那份 registry 的话，
   * 界面会说「已添加」而选择器要等重启才有它——
   * **那是一句半真的话**，正是 kimi 那次作者撞上的东西。
   */
  await page.getByRole("button", { name: "返回", exact: true }).click()
  await 打开agent菜单(page)
  const 那一项 = page.getByRole("menuitem", { name: /my-acp/ })
  await expect(那一项, "加完了，但模型选择器里没有它").toBeVisible({ timeout: 30_000 })
  await 那一项.click()
  await 等进了对话(page)
  await expect(page.locator(".conv-head .kind"), "接进来了但没被认成 ACP").toHaveText("ACP")

  /**
   * ⑤ **真的能聊。**
   *
   * 这一步才是「白开发了」与「能用了」的分界：前面四条全绿而这一条红，
   * 意味着我们只是把一行字写进了 yaml。
   */
  await page.getByPlaceholder(/今天帮你做些什么/).fill("在吗")
  await page.getByRole("button", { name: "发送", exact: true }).click()
  await expect(page.getByText(/假 ACP agent 已应答/).last()).toBeVisible({ timeout: 60_000 })
})

/**
 * **加得进去就得删得掉。**
 *
 * 「只能加不能删」意味着加错一次之后人又得回去打开那个 yaml，
 * 而「不必打开那个 yaml」正是这一整条路存在的理由。
 */
test("**接错了能删掉**，删完选择器里也没有了", async ({ dawn }) => {
  const { page } = dawn

  await 进设置(page, "ACP 适配器")
  await 接一个(page, "打错了")
  // id 不合法要**当场说**，不是加进去一个用不了的
  await expect(page.getByText(/agent 名字只能用小写字母/)).toBeVisible({ timeout: 15_000 })

  await 接一个(page, "typo-acp")
  await expect(page.locator(".acp-row .name")).toHaveText("typo-acp")

  /**
   * **删除键常驻，不是悬停才出现。**
   * `toBeVisible()` 对 `opacity: 0` 仍然算可见——所以直接量。
   */
  const 删 = page.getByRole("button", { name: "移除这个适配器" })
  await expect(删).toBeVisible()
  expect(await 删.evaluate((el) => getComputedStyle(el).opacity)).toBe("1")

  await 删.click()
  await expect(page.getByText("还没有接入任何 ACP 适配器。")).toBeVisible()

  // 选择器里也真的没了——**只从界面上消失不算删掉**
  await page.getByRole("button", { name: "返回", exact: true }).click()
  await 打开agent菜单(page)
  await expect(page.getByRole("menuitem", { name: /typo-acp/ })).toHaveCount(0)
})
