/**
 * 上下文用量与压缩（2026-09-27，spec `2026-09-27-上下文用量与压缩-design.md` §7）。**跑真实构建产物。**
 *
 * 假模型两支（准入规则 1，dev:mock 同一份）：pi 的摘要请求回 `假摘要`；带「塞满上下文」的一句报 12 万输入 token。
 * `compactKeepRecentTokens: 1`：pi 默认要保留最近 2 万 token，两三句话的对话「没有可压缩的」。
 *
 * **等待条件挑只有目标状态才有的东西**：压缩标记按 `data-status` 找，不按「压缩」两个字（仪表弹层与命令面板里也有这两个字）。
 *
 * 「正在压缩」那一态很短（假模型的摘要一来一回就完），等它可见是跟模型赛跑。
 * 改在触发之前挂一个 `MutationObserver`，记下「出现过 `data-status="running"` 的标记、写着什么」——
 * 作者 2026-09-27 要的是「一开始压就马上看得到」，判据是**它出现过**，不是它停留多久。
 */
import type { Locator, Page } from "@playwright/test"
import { resolve } from "node:path"
import { test, expect, CANNED_REPLY, 开一段临时会话, 等进了对话, 用某个agent开一段, 在项目里开会话, 进坞 } from "./fixtures.js"

const 主区 = (page: Page) => page.locator("main.main")
const 框 = (区: Locator) => 区.getByPlaceholder(/今天帮你做些什么/)
const 仪表 = (区: Locator) => 区.locator(".ctx-meter-trigger")
const 标记 = (区: Locator, status: string) => 区.locator(`.compaction-mark[data-status="${status}"]`)

async function 说(区: Locator, 话: string) {
  await 框(区).fill(话)
  await 框(区).press("Enter")
}
/** 说一句并等假模型答完（数回复条数，不数「任何一处出现暗号」——前面几轮早就出现过了） */
async function 说完(区: Locator, 话: string) {
  const 前 = await 区.getByText(CANNED_REPLY).count()
  await 说(区, 话)
  await expect(区.getByText(CANNED_REPLY)).toHaveCount(前 + 1, { timeout: 30_000 })
}

/** 触发压缩之前挂上：之后任何时刻出现过的 running 标记，文字都记进 `window.__压缩中见过` */
async function 盯正在压缩(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __压缩中见过: string[] }
    w.__压缩中见过 = []
    const 看 = () => {
      for (const el of document.querySelectorAll('.compaction-mark[data-status="running"]')) {
        w.__压缩中见过.push(el.textContent ?? "")
      }
    }
    new MutationObserver(看).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-status"] })
  })
}
const 见过的正在压缩 = (page: Page) => page.evaluate(() => (window as unknown as { __压缩中见过: string[] }).__压缩中见过)

/** 叫出命令面板并搜一个词（与 `palette.spec.ts` 同一个快捷键） */
async function 面板搜(page: Page, 词: string) {
  await page.keyboard.press("ControlOrMeta+k")
  const 面板 = page.getByRole("dialog", { name: "命令面板" })
  await expect(面板).toBeVisible()
  await page.getByRole("combobox", { name: "搜索命令" }).fill(词)
  return 面板
}

test.describe("内置对话", () => {
  test.use({ dawnOptions: { compactKeepRecentTokens: 1 } })

  test("**仪表常驻**：说过一句之后写着比例（不是悬停才出现）；悬停看得到真数与自动压缩线，移开就收，点一下钉住", async ({ dawn }) => {
    const { page } = dawn
    await 开一段临时会话(page)
    await 等进了对话(page)
    await 说完(主区(page), "你好")
    const 钮 = 仪表(主区(page))
    await expect(钮).toBeVisible()
    // `toBeVisible()` 对 opacity: 0 仍然算可见——直接量
    expect(await 钮.evaluate((el) => getComputedStyle(el).opacity)).toBe("1")
    await expect(钮).toHaveText(/上下文 <1%/)
    // 作者 2026-09-27：悬停就看得到用量
    await 钮.hover()
    const 层 = 主区(page).locator(".ctx-meter-pop")
    await expect(层).toContainText("20 / 128k tokens")
    await expect(层).toContainText("到 111.6k tokens 会自动压缩")
    // 移开就收；点一下钉住
    await page.mouse.move(0, 0)
    await expect(层).toHaveCount(0)
    await 钮.click()
    await page.mouse.move(0, 0)
    await expect(层).toBeVisible()
  })

  test("**/compact**：不当一句话发；先出「正在压缩」，再收成压完的标记，写「你让压的」，点开看得到假模型写的摘要；仪表说刚压过，再说一句回来", async ({ dawn }) => {
    const { page } = dawn
    await 开一段临时会话(page)
    await 等进了对话(page)
    await 说完(主区(page), "第一句")
    await 说完(主区(page), "第二句")
    await 盯正在压缩(page)
    await 说(主区(page), "/compact 保留暗号")
    const 条 = 标记(主区(page), "done")
    await expect(条).toBeVisible({ timeout: 30_000 })
    // 一开始压就有一条「正在压缩上下文…」（作者 2026-09-27），之后同一条收成「已压缩」——不是两条
    expect((await 见过的正在压缩(page)).some((x) => x.includes("正在压缩上下文…"))).toBe(true)
    await expect(主区(page).locator(".compaction-mark")).toHaveCount(1)
    await expect(条).toContainText("已压缩上下文")
    await expect(条).toContainText("你让压的")
    await expect(主区(page).locator(".turns")).not.toContainText("/compact 保留暗号")
    await 条.getByRole("button", { name: "这次的摘要" }).click()
    await expect(条.locator(".compaction-summary")).toContainText("假摘要：用户在试压缩")
    await expect(仪表(主区(page))).toHaveText(/已压缩/)
    await 说完(主区(page), "第三句")
    await expect(仪表(主区(page))).toHaveText(/上下文 <1%/)
  })

  test("**⌘K「压缩上下文」**：内置对话里可用，按下去同样出一条「你让压的」标记", async ({ dawn }) => {
    const { page } = dawn
    await 开一段临时会话(page)
    await 等进了对话(page)
    await 说完(主区(page), "第一句")
    await 说完(主区(page), "第二句")
    const 面板 = await 面板搜(page, "压缩上下文")
    const 项 = 面板.getByRole("option", { name: /压缩上下文/ })
    await expect(项).toHaveAttribute("aria-disabled", "false")
    await 项.click()
    const 条 = 标记(主区(page), "done")
    await expect(条).toBeVisible({ timeout: 30_000 })
    await expect(条).toContainText("你让压的")
  })

  test("**自动压缩出声**：「塞满上下文」那一轮收尾时 pi 自己压——标记写「自动：快到上限了」，不是失败", async ({ dawn }) => {
    const { page } = dawn
    await 开一段临时会话(page)
    await 等进了对话(page)
    await 说完(主区(page), "你好")
    await 盯正在压缩(page)
    await 说完(主区(page), "塞满上下文")
    const 条 = 标记(主区(page), "done")
    await expect(条).toBeVisible({ timeout: 60_000 })
    await expect(条).toContainText("自动：快到上限了")
    await expect(标记(主区(page), "failed")).toHaveCount(0)
    // 自动的那次也要先说「正在压缩」，且写明起因
    expect((await 见过的正在压缩(page)).some((x) => x.includes("正在压缩上下文…") && x.includes("自动：快到上限了"))).toBe(true)
  })

  test("**`/` 菜单里有「压缩上下文」**，选中写 `/compact `、不替人发", async ({ dawn }) => {
    const { page } = dawn
    await 开一段临时会话(page)
    await 等进了对话(page)
    await 框(主区(page)).fill("/comp")
    const 菜单 = 主区(page).locator(".slash-menu")
    await expect(菜单).toContainText("压缩上下文")
    await 菜单.getByRole("option", { name: /压缩上下文/ }).click()
    await expect(框(主区(page))).toHaveValue("/compact ")
  })
})

test.describe("窄附栏", () => {
  /**
   * 2026-09-27 视觉基线抓的：坞里那张卡（对话格 380 宽）附栏五样都不缩，整句「上下文 <1%」把权限那颗顶出卡外，只剩「●完」。
   * 判据量盒子，不看像素：权限那颗整颗在卡里；仪表只写数、读屏名字仍是全句；主区（坞开着）照样写全句不挤掉工作目录。
   */
  test("**坞里的输入卡**：仪表只留环 + 数（名字仍是「上下文 …」），权限那颗整颗在卡里", async ({ dawn }) => {
    const { page } = dawn
    const 坞 = page.locator("aside.right-dock")
    await 在项目里开会话(page)
    await 说完(主区(page), "请说一句话")
    await 进坞(page, "对话")
    await 坞.getByRole("button", { name: "另开一段", exact: true }).click()
    await 坞.locator(".side-chat-head").waitFor({ timeout: 30_000 })
    await 说完(坞, "你好")
    const 钮 = 仪表(坞)
    await expect(钮).toHaveAccessibleName(/^上下文 <1%$/)
    // 「上下文」三个字还在 DOM 里，只是不画——量它自己，不信 toBeVisible（opacity 那类坑）
    await expect(钮.locator(".ctx-meter-word")).toBeHidden()
    expect(await 钮.evaluate((el) => (el as HTMLElement).innerText.trim())).toBe("<1%")
    const 卡 = await 坞.locator(".composer-card").boundingBox()
    const 权限 = await 坞.locator(".composer-footer .perm-pill").boundingBox()
    expect(卡 && 权限).toBeTruthy()
    expect(权限!.x).toBeGreaterThanOrEqual(卡!.x)
    expect(权限!.x + 权限!.width).toBeLessThanOrEqual(卡!.x + 卡!.width)
    // 附栏自己也不溢出（任何一样被顶出去都会让 scrollWidth 大过 clientWidth）
    expect(await 坞.locator(".composer-footer").evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)
  })

  test("**主区（坞关着）写全句**：「上下文 <1%」整句看得见", async ({ dawn }) => {
    const { page } = dawn
    await 开一段临时会话(page)
    await 等进了对话(page)
    await 说完(主区(page), "你好")
    const 钮 = 仪表(主区(page))
    await expect(钮.locator(".ctx-meter-word")).toBeVisible()
    // 环、字、数各是一个弹性项，innerText 在项之间断行——按空白归一再比
    expect(await 钮.evaluate((el) => (el as HTMLElement).innerText.replace(/\s+/g, " ").trim())).toBe("上下文 <1%")
  })
})

const 假ACP = resolve(import.meta.dirname, "..", "scripts", "fake-acp-agent.mjs")
const PROVIDERS = `agents:
  ds-chat:
    kind: native
    provider: deepseek
    model: deepseek-flash
    capabilities: [chat, exec]
  claude-acp:
    kind: acp
    command: node
    args: ["${假ACP}"]
    capabilities: [chat, exec]
`

test.describe("外部 agent", () => {
  test.use({ dawnOptions: { providersYaml: PROVIDERS, gitInit: true } })

  test("**ACP 会话的仪表写「读不到」**，弹层说为什么、没有「现在压缩」；`/` 菜单里没有那一条；⌘K 那条列着但灰着、说为什么", async ({ dawn }) => {
    const { page } = dawn
    await 用某个agent开一段(page, /claude-acp/)
    await 等进了对话(page)
    const 钮 = 仪表(主区(page))
    await expect(钮).toHaveText(/上下文 读不到/)
    await 钮.click()
    await expect(主区(page).locator(".ctx-meter-pop")).toContainText("外部 agent")
    await expect(主区(page).getByRole("button", { name: "现在压缩" })).toHaveCount(0)
    await page.keyboard.press("Escape")
    await 框(主区(page)).fill("/comp")
    await expect(主区(page).locator(".slash-menu")).not.toContainText("压缩上下文")
    await 框(主区(page)).fill("")
    // ⌘K：不可用照样列出，写明是哪一种不可用
    const 面板 = await 面板搜(page, "压缩上下文")
    const 项 = 面板.getByRole("option", { name: /压缩上下文/ })
    await expect(项).toHaveAttribute("aria-disabled", "true")
    await expect(项).toContainText("外部 agent 自己管上下文，DAWN 压不了")
    await page.keyboard.press("Escape")
    await expect(面板).toBeHidden()
  })

  test("**ACP 会话里 `/compact` 原样发给 agent**（它自己认这个命令），不出压缩标记", async ({ dawn }) => {
    const { page } = dawn
    await 用某个agent开一段(page, /claude-acp/)
    await 等进了对话(page)
    await 说(主区(page), "/compact 保留暗号")
    // 假 ACP 会复述它收到的话——这句出现，说明那一句真的发给了 agent
    await expect(主区(page).getByText(/你说的是：\/compact 保留暗号/).last()).toBeVisible({ timeout: 30_000 })
    await expect(主区(page).locator(".compaction-mark")).toHaveCount(0)
  })
})
