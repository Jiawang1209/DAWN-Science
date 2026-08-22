/**
 * **在服务器上建的新对话里，模型选择器得列出能上服务器的 ACP 适配器**
 * （2026-08-21，作者在 `acp-terminal` 分支上试 T3 时报的）。**跑真实构建产物。**
 *
 * 作者：*「我在点击服务器连接的时候，肯定是要点击新对话的，那么这个页面
 * 现在就应该保持不变，然后在选择模型的时候，就应该显示出有 claude-code-acp 才对。」*
 *
 * ## T3 做了标记、做了拒绝，却没做门
 *
 * `remoteCapable`、后端的 `能上服务器` 把关、`远端能用的agentIds` 这条过滤——
 * 全都在，单测全绿。**但点服务器「新对话」直接拿第一个能上服务器的 agent
 * 建会话**（配置里第一个是 DeepSeek），而那段会话里的模型 pill 只列 API 模型。
 * 过滤的结果传给了一个 2026-08-12 起就没人读的参数。于是真适配器上量那天，
 * 作者在界面上**哪儿都找不到 claude-code-acp**。
 *
 * 这份用例钉的就是那扇门：看得见、点得动、点完还在同一台机器上。
 */
import { join, resolve } from "node:path"
import { readFileSync } from "node:fs"
import { test, expect, 等进了对话, 进设置 } from "./fixtures.js"

const 假ACP = resolve(import.meta.dirname, "..", "scripts", "fake-acp-agent.mjs")

/**
 * **ds-chat 排第一**：这正是作者的配置顺序，也正是「静默建成 DeepSeek」的前提。
 * `claude-acp` 标了能上服务器，`codex-acp` 没标——菜单里前者必须在、后者必须不在。
 */
const PROVIDERS = `agents:
  ds-chat:
    kind: native
    provider: deepseek
    model: deepseek-v4-flash
    capabilities: [chat, exec]
  claude-acp:
    kind: acp
    command: node
    args: ["${假ACP}"]
    capabilities: [chat, exec]
    remoteCapable: true
  codex-acp:
    kind: acp
    command: node
    args: ["${假ACP}"]
    capabilities: [chat, exec]
`

test.use({ dawnOptions: { providersYaml: PROVIDERS, fakeSsh: true } })

/**
 * 与作者机器上一模一样的起点：`claude-code-acp` 是 T3 之前接入的，**没有 `remoteCapable`**。
 * 预置名单知道它能上服务器，配置却没标——设置里必须说出来，而且一键能标上，
 * 不必像作者那天一样「移除再一键接入」。
 */
const 老配置 = `agents:
  ds-chat:
    kind: native
    provider: deepseek
    model: deepseek-v4-flash
    capabilities: [chat, exec]

  # 由 DAWN 在设置里添加
  claude-code-acp:
    kind: acp
    command: node
    args: ["${假ACP}"]
    capabilities: [chat, exec]
`

async function 展开远端(page: import("@playwright/test").Page) {
  const head = page.getByRole("button", { name: /远端服务器/ })
  await expect(head).toBeVisible()
  if ((await head.getAttribute("aria-expanded")) !== "true") await head.click()
}

async function 加一台(page: import("@playwright/test").Page, label: string) {
  await page.getByRole("button", { name: /添加服务器/ }).click()
  await page.locator("#conn-host").fill("fake.example")
  await page.locator("#conn-user").fill("dawn")
  await page.locator("#conn-label").fill(label)
  await page.locator("#conn-secret").fill("dawn")
  await page.getByRole("button", { name: "保存", exact: true }).click()
}

test("**服务器上的新对话：模型选择器里有 claude-acp、没有 codex-acp，点了就换成它**", async ({ dawn }) => {
  const { page } = dawn
  await 展开远端(page)
  await 加一台(page, "假机器")
  await page.locator(".remote-row").first().getByRole("button", { name: /新对话/ }).click()
  await expect(page.locator(".conv-remote")).toBeVisible({ timeout: 30_000 })

  // ① 页面不变，还是那段新对话；pill 上先是 DeepSeek（配置里第一个）
  const pill = page.locator(".composer .model-pill")
  await expect(pill.locator(".model-name")).toHaveText("deepseek-v4-flash")

  // ② 打开选择器：ACP 单独一组，能上服务器的在、不能的不在
  await pill.locator(".model-trigger").click()
  const 菜单 = page.getByRole("menu", { name: "切换模型" })
  await expect(菜单.locator(".model-group-head", { hasText: "ACP 适配器" })).toBeVisible()
  await expect(菜单.getByRole("menuitem", { name: /claude-acp/ }), "能上服务器的 ACP 没列出来").toBeVisible()
  await expect(菜单.getByRole("menuitem", { name: /codex-acp/ }), "手到不了服务器的 ACP 不该出现").toHaveCount(0)

  // ③ 点它：还在同一台机器上，头上标着 ACP；
  //    模型 pill 没了——ACP 会话不画它（2026-08-19 定的，`acp-agent.spec.ts` 守着）
  await 菜单.getByRole("menuitem", { name: /claude-acp/ }).click()
  await 等进了对话(page)
  await expect(page.locator(".conv-remote .conv-remote-host")).toHaveText("假机器")
  await expect(page.locator(".conv-head .kind")).toHaveText("ACP")
  await expect(page.locator(".composer-card .model-pill")).toHaveCount(0)

  // ④ **空会话被顶替，不是多出一条**：那台机器底下只有这一段
  await expect(page.locator(".side-server").locator("li")).toHaveCount(1)
})

test.describe("T3 之前接入的老条目", () => {
  test.use({ dawnOptions: { providersYaml: 老配置, fakeSsh: true } })

  test("**设置里说它没标，一键标上，远端会话就能选它**", async ({ dawn }) => {
    const { page } = dawn
    await 进设置(page, "ACP 适配器")

    // ① 已接入列表里每一条都写清手到不到得了服务器；老条目直接说出为什么
    const 行 = page.locator(".acp-row", { hasText: "claude-code-acp" })
    await expect(行.locator(".sub")).toContainText("还没有「能上服务器」这个标记")

    // ② 一键标上——不是删了重加
    await 行.getByRole("button", { name: "标为能上服务器" }).click()
    await expect(行.locator(".sub")).toContainText("手能到服务器")
    // **真写进了文件**，不只是内存里换了一下
    expect(readFileSync(join(dawn.dir, "providers.yaml"), "utf8")).toMatch(/claude-code-acp:[\s\S]*remoteCapable: true/)
    await expect(行.getByRole("button", { name: "改为只在本机" })).toBeVisible()

    // ③ 远端新对话里现在选得到它
    await page.getByRole("button", { name: "返回", exact: true }).click()
    await 展开远端(page)
    await 加一台(page, "假机器")
    await page.locator(".remote-row").first().getByRole("button", { name: /新对话/ }).click()
    await expect(page.locator(".conv-remote")).toBeVisible({ timeout: 30_000 })
    await page.locator(".composer .model-pill .model-trigger").click()
    await expect(
      page.getByRole("menu", { name: "切换模型" }).getByRole("menuitem", { name: /claude-code-acp/ }),
    ).toBeVisible()
  })
})
