/**
 * 子 agent 看得见（2026-09-27，spec `2026-09-27-子agent看得见-design.md` §5）。**跑真实构建产物。**
 *
 * 靠假模型的三支（`scripts/mock-inference-server.mjs`，dev:mock 同一份）：主区说「派子agent…」→ 调 subagent 交给自带的 data-auditor；
 * 子进程收到「子任务…」→ 先说「我先读一下 README。」再 read；「子任务慢…」→ bash sleep 15。**中间只有模型是假的**：
 * 子进程、会话文件、中枢、坞格全是真的。
 *
 * 等待条件一律挑只有目标状态才有的东西（CLAUDE.md「两处长得一样的东西」）：chip 的 `data-status`、坞格的 `.subagent-result`、
 * 标签的 `aria-selected`——不等「假模型已应答」这种主区与坞格都会有的句子。
 */
import { writeFileSync } from "node:fs"
import { join } from "node:path"
import type { Locator, Page } from "@playwright/test"
import { test, expect, CANNED_REPLY, 在项目里开会话, 开一段临时会话, 进坞 } from "./fixtures.js"

const 发 = async (page: Page, 话: string) => {
  await page.getByPlaceholder(/输入问题/).fill(话)
  await page.getByRole("button", { name: "发送", exact: true }).click()
}
const 主区 = (page: Page) => page.locator("main.main")
const 坞 = (page: Page) => page.locator("aside.right-dock")
const 透明 = (l: Locator) => l.evaluate((el) => getComputedStyle(el).opacity)

/** 主区派一个、等它跑完、等主 agent 那一轮也收口（**只有收口之后才有**的：输入框旁的「发送」重新可点） */
async function 派一个跑完(page: Page) {
  await 发(page, "派子agent看看这个仓库")
  const chip = 主区(page).locator(".chip-group .chip").first()
  await expect(chip).toHaveAttribute("data-status", "ok", { timeout: 60_000 })
  await expect(主区(page).getByRole("button", { name: "停止", exact: true })).toHaveCount(0, { timeout: 60_000 })
  return chip
}

test.describe("子 agent 看得见", () => {
  test.use({ dawnOptions: { gitInit: true } })

  test("点 chip → 坞里那一格有它的过程与交回的结果；主转录里没有那条 read", async ({ dawn }) => {
    const { page, workspace } = dawn
    writeFileSync(join(workspace, "README.md"), "# 一个测试仓库\n")
    await 在项目里开会话(page)
    const chip = await 派一个跑完(page)
    await chip.click()

    await expect(page.getByRole("tab", { name: "子 agent", exact: true })).toHaveAttribute("aria-selected", "true")
    const 格 = page.locator(".subagent-pane")
    await expect(格).toContainText("我先读一下 README。")
    await expect(格.locator(".tool-head").filter({ hasText: "README.md" })).toHaveCount(1)
    await expect(格.locator(".subagent-result")).toContainText(CANNED_REPLY)
    // 克制：主转录里只有 chip，没有子 agent 的那条 read（主区那条 subagent 工具行的参数里也有「README.md」——把它排开）
    await expect(主区(page).locator(".turns .tool-head").filter({ hasText: "README.md" }).filter({ hasNotText: "subagent" })).toHaveCount(0)
    await expect(主区(page).locator(".turns")).not.toContainText("我先读一下 README。")
  })

  test("在跑时 chip 上有那一句、坞里那条 bash 在跑；跑完那一句消失", async ({ dawn }) => {
    const { page } = dawn
    await 在项目里开会话(page)
    await 发(page, "派子agent慢慢看")

    const chip = 主区(page).locator(".chip-group .chip").first()
    await expect(chip.locator(".chip-activity")).toContainText("sleep 15", { timeout: 60_000 })
    expect(await 透明(chip.locator(".chip-activity")), "那一句常驻，不是悬停才出现").toBe("1")
    await chip.click()
    const 格 = page.locator(".subagent-pane")
    await expect(格).toHaveAttribute("data-status", "running")
    await expect(格.locator(".tool-head").filter({ hasText: "sleep 15" })).toHaveCount(1)
    await expect(chip).toHaveAttribute("data-status", "ok", { timeout: 60_000 })
    await expect(chip.locator(".chip-activity")).toHaveCount(0)
    await expect(格).toHaveAttribute("data-status", "ok")
  })

  test("接着问：格里多一问一答，主转录一条不多、那一问那一答都不在主区", async ({ dawn }) => {
    const { page, workspace } = dawn
    writeFileSync(join(workspace, "README.md"), "# 一个测试仓库\n")
    await 在项目里开会话(page)
    const chip = await 派一个跑完(page)
    const 主区轮数 = await 主区(page).locator(".turns .turn").count()
    const 主区罐头 = await 主区(page).locator(".turns").getByText(CANNED_REPLY).count()

    await chip.click()
    const 格 = page.locator(".subagent-pane")
    await expect(格.locator(".subagent-result")).toBeVisible()
    const 格里罐头 = await 格.locator(".subagent-turns").getByText(CANNED_REPLY).count()
    await expect(格).toContainText("它的回答不会回到主对话")
    await 格.getByRole("textbox", { name: "接着问它" }).fill("再说一句")
    await 格.getByRole("button", { name: "接着问", exact: true }).click()
    await expect(格.locator(".subagent-message.user").filter({ hasText: "再说一句" })).toHaveCount(1, { timeout: 30_000 })
    // 续上的那一轮答完：格里多一句罐头回复、「在答」态退掉、输入框回来
    await expect(格.locator(".subagent-turns").getByText(CANNED_REPLY)).toHaveCount(格里罐头 + 1, { timeout: 60_000 })
    await expect(格).not.toHaveAttribute("data-asking", "1", { timeout: 60_000 })
    await expect(格.getByRole("textbox", { name: "接着问它" })).toBeVisible()

    expect(await 主区(page).locator(".turns .turn").count(), "答复不回主 agent：主转录一条都不该多").toBe(主区轮数)
    await expect(主区(page).locator(".turns")).not.toContainText("再说一句")
    await expect(主区(page).locator(".turns").getByText(CANNED_REPLY)).toHaveCount(主区罐头)
  })

  test("关掉再开：chip 组还在，点开过程从盘上读回来、没有在跑的样子", async ({ dawn }) => {
    await 开一段临时会话(dawn.page)
    await 发(dawn.page, "派子agent看看")
    await expect(dawn.page.locator(".chip-group .chip").first()).toHaveAttribute("data-status", "ok", { timeout: 60_000 })
    await expect(dawn.page.getByRole("button", { name: "停止", exact: true })).toHaveCount(0, { timeout: 60_000 })

    const page = await dawn.重开()
    const 那一条 = page.locator(".session-list .sess-item").first()
    await expect(那一条).toBeVisible({ timeout: 30_000 })
    await 那一条.locator(".row").first().click()

    const chip = 主区(page).locator(".chip-group .chip").first()
    await expect(chip).toHaveAttribute("data-status", "ok", { timeout: 30_000 })
    await expect(chip.locator(".chip-activity")).toHaveCount(0)
    await chip.click()
    const 格 = page.locator(".subagent-pane")
    // 临时会话的工作目录里未必有 README——read 成败都是一条 read 行，验的是「过程读回来了」
    const 读取 = 格.locator('.tool[data-tool-name="read"]')
    await expect(读取).toHaveCount(1, { timeout: 30_000 })
    await expect(读取.locator(".tool-head")).toContainText("读取文件")
    if (await 读取.locator(".tool-head").getAttribute("aria-expanded") !== "true") await 读取.locator(".tool-head").click()
    await expect(读取.locator(".tool-input")).toContainText("README.md")
    await expect(格).toContainText("我先读一下 README。")
    await expect(格).toHaveAttribute("data-status", "ok")
    await expect(格.locator(".subagent-title")).not.toContainText("运行中")
    await expect(格.locator(".subagent-result")).toContainText(CANNED_REPLY)
  })

  test("看得见：chip、「接着问」、回清单都不是悬停才出现的；坞标签与更多菜单完整可达", async ({ dawn }) => {
    const { page, workspace } = dawn
    writeFileSync(join(workspace, "README.md"), "# 一个测试仓库\n")
    await 在项目里开会话(page)
    const chip = await 派一个跑完(page)
    expect(await 透明(chip)).toBe("1")
    await chip.click()
    const 格 = page.locator(".subagent-pane")
    const 按钮 = 格.getByRole("button", { name: "接着问", exact: true })
    await expect(按钮).toBeVisible()
    // 草稿空时它是禁用的（0.45，那是「还不能按」不是「藏起来」）；写一句之后量
    await 格.getByRole("textbox", { name: "接着问它" }).fill("再说一句")
    await expect(按钮).toBeEnabled()
    expect(await 透明(按钮)).toBe("1")
    expect(await 透明(格.getByRole("button", { name: "回到清单", exact: true }))).toBe("1")

    // 回清单：这段对话派过的那一个在清单里，点它又回到它
    await 格.getByRole("button", { name: "回到清单", exact: true }).click()
    const 清单项 = page.locator(".subagent-list .subagent-pick")
    await expect(清单项).toHaveCount(1)
    await 清单项.first().click()
    await expect(page.locator(".subagent-pane .subagent-result")).toBeVisible()

    // 2026-10-11：按实际宽度收纳标签；当前子agent仍可见，其他入口从更多到达。
    const 条 = 坞(page).locator(".dock-tabs-row")
    const 格们 = 条.getByRole("tab")
    const visibleNames = await 格们.evaluateAll(els => els.map(el => el.getAttribute("aria-label")))
    expect(visibleNames.length).toBeGreaterThan(0)
    await expect(条.getByRole("tab", { name: "子 agent", exact: true })).toHaveAttribute("aria-selected", "true")
    const 条框 = (await 条.boundingBox())!
    for (let i = 0; i < visibleNames.length; i++) {
      const 框 = (await 格们.nth(i).boundingBox())!
      expect(框.x, `「${visibleNames[i]}」左缘在标签条外`).toBeGreaterThanOrEqual(条框.x - 0.5)
      expect(框.x + 框.width, `「${visibleNames[i]}」右缘在标签条外`).toBeLessThanOrEqual(条框.x + 条框.width + 0.5)
    }
    expect(await 条.evaluate(el => el.scrollWidth - el.clientWidth), "默认宽度下标签条不该需要横滚").toBeLessThanOrEqual(0)
    const more = 坞(page).getByRole("button", { name: "更多面板", exact: true })
    await more.click()
    const menu = 坞(page).getByRole("menu", { name: "更多面板", exact: true })
    const hiddenNames = await menu.getByRole("menuitem").allTextContents()
    expect([...visibleNames, ...hiddenNames].sort()).toEqual(["文件", "产物", "笔记本", "路线", "审阅", "概览", "网页", "子 agent", "团队", "对话", "Bot"].sort())
    await menu.press("Escape")
    await expect(menu).toHaveCount(0)
    await expect(more).toBeFocused()
    // 同一个入口能到实际面板，再返回原子agent，读回内容不丢。
    await 进坞(page, "对话")
    await expect(坞(page).getByRole("tab", { name: "对话", exact: true })).toHaveAttribute("aria-selected", "true")
    await 进坞(page, "子 agent")
    await expect(清单项).toHaveCount(1)
    await 清单项.first().click()
    await expect(格.locator(".subagent-result")).toContainText(CANNED_REPLY)

  })
})

test.describe("坞里那段对话派的子 agent：长长的一句不撑破坞", () => {
  test.use({
    dawnOptions: {
      gitInit: true,
      /**
       * 子进程那一问含「子任务慢」→ 一条很长的 bash（比 mock 里那支 `sleep 15` 长得多），chip 上那一句被截到 120 字。
       * 排在 mock 自带那几支前面（`opts.toolCall` 先判）；主区 / 坞里那一句是「派子agent慢…」，不含「子任务慢」，不会被它截走。
       */
      toolCall: {
        toolName: "bash",
        args: { command: `sleep 15 && echo ${"很长的一段参数".repeat(30)}` },
        when: "子任务慢",
        say: "我先跑一段长命令。",
      },
    },
  })

  test("chip 那一句很长：坞不出横向滚动，chip 不越过坞的右缘", async ({ dawn }) => {
    const { page } = dawn
    await 在项目里开会话(page)
    await 进坞(page, "对话")
    await 坞(page).getByRole("button", { name: "另开一段", exact: true }).click()
    await 坞(page).locator(".side-chat-head").waitFor({ timeout: 30_000 })
    const 框 = 坞(page).getByPlaceholder(/输入问题/)
    await 框.fill("派子agent慢慢看")
    await 框.press("Enter")

    const chip = 坞(page).locator(".chip-group .chip").first()
    const 那一句 = chip.locator(".chip-activity")
    await expect(那一句).toContainText("很长的一段参数", { timeout: 60_000 })
    // 截在 120 字（活动一句的上界）
    expect(((await 那一句.textContent()) ?? "").length).toBeLessThanOrEqual(120)

    const 坞框 = (await 坞(page).boundingBox())!
    const chip框 = (await chip.boundingBox())!
    expect(chip框.x + chip框.width, "chip 越过了坞的右缘").toBeLessThanOrEqual(坞框.x + 坞框.width + 0.5)
    const 横溢 = await 坞(page).evaluate((aside) =>
      [aside, ...aside.querySelectorAll<HTMLElement>(".dock-body, .turns, .turns-inner")]
        .map((el) => ({ cls: el.className, 多: el.scrollWidth - el.clientWidth }))
        .filter((x) => x.多 > 0),
    )
    expect(横溢, "坞里有容器横向溢出").toEqual([])
    // 没点 chip：坞仍停在「对话」那一格
    await expect(page.getByRole("tab", { name: "对话", exact: true })).toHaveAttribute("aria-selected", "true")
  })
})
