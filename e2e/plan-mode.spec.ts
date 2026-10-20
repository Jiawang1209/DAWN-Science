/**
 * 生成方案（原名「先出方案」，2026-09-28 改名；2026-09-27，spec `2026-09-27-先出方案-design.md` §5）。**跑真实构建产物。**
 *
 * 假模型走 mock 的「先出方案」分支（`dev:mock` 里人按的也是它）：请求的工具表里有 `propose_plan`（= 在方案期）→ 交一份五节齐全的方案；
 * 方案期说「偷跑」→ 调 `write`（门要拦下）；不在方案期、说「照批准的方案做」→ 写方案里的第一项产物。
 *
 * ## 两处长得一样
 *
 * 「生成方案」同时是添加内容菜单中的开关、带子文案、斜杠菜单项与 ⌘K 标题。
 * 先在主区或坞里打开「添加内容」，再找 body portal 中当前可见的 menuitemcheckbox。
 * 主区与坞共享 ConversationView；开关状态用 aria-checked，关闭菜单后由 plan-band 显示方案期。
 *
 * ## D3（2026-09-28 定案）两条的分工
 *
 * - **agent 这一轮改了批准过的方案 → 恢复并出声**：门拦得住 `write` / `edit` / 提到 plans 的 bash，
 *   所以这里用一句**门看不见**的 bash（通配 `analysis/p*`、变量 `$f`，不提 plans、不提文件名）演「漏过门的写法」，证第二道（轮基线）接住了它。
 * - **人两轮之间改了 → 留着、卡片写「你改过」**：用例直接往磁盘写，再说一句话让这一轮收尾时核对。
 */
import { appendFileSync, existsSync, readdirSync, readFileSync } from "node:fs"
import { join, resolve } from "node:path"
import type { Locator, Page } from "@playwright/test"
import { test, expect, 在项目里开会话, 等进了对话, 用某个agent开一段, 进坞 } from "./fixtures.js"

const 主区 = (page: Page) => page.locator("main.main")
const 坞 = (page: Page) => page.locator("aside.right-dock")
const 框 = (区: Locator) => 区.getByPlaceholder(/输入问题/)
const 卡 = (区: Locator) => 区.locator(".plan-card")
const 停止 = (区: Locator) => 区.getByRole("button", { name: "停止", exact: true })

/** 菜单挂在 body portal；打开入口仍必须属于指定会话。 */
async function 开方案菜单(page: Page, 区: Locator) {
  const 入口 = 区.getByRole("button", { name: "添加内容", exact: true })
  if (await 入口.getAttribute("aria-expanded") !== "true") await 入口.click()
  await expect(入口).toHaveAttribute("aria-expanded", "true")
  const 菜单 = page.getByRole("menu", { name: "添加内容", exact: true })
  await expect(菜单).toHaveCount(1)
  await expect(菜单).toBeVisible()
  return 菜单
}

async function 关方案菜单(page: Page, 区: Locator) {
  await 区.getByRole("button", { name: "添加内容", exact: true }).click()
  await expect(page.getByRole("menu", { name: "添加内容", exact: true })).toHaveCount(0)
}

async function 核对方案状态(page: Page, 区: Locator, 开启: boolean) {
  const 菜单 = await 开方案菜单(page, 区)
  await expect(菜单.getByRole("menuitemcheckbox", { name: "生成方案", exact: true })).toHaveAttribute("aria-checked", String(开启))
  await 关方案菜单(page, 区)
  if (开启) await expect(区.locator(".plan-band")).toContainText("只看不改")
  else await expect(区.locator(".plan-band")).toHaveCount(0)
}

async function 切换方案(page: Page, 区: Locator, 开启: boolean) {
  const 菜单 = await 开方案菜单(page, 区)
  const 开关 = 菜单.getByRole("menuitemcheckbox", { name: "生成方案", exact: true })
  await expect(开关).toBeEnabled()
  await expect(开关).toHaveAttribute("aria-checked", String(!开启))
  await 开关.click()
  await expect(菜单).toHaveCount(0)
  await 核对方案状态(page, 区, 开启)
}

/** 主区、窄坞都能打开同一菜单；优化与方案相邻，菜单在窗口内，输入卡不横向滚。 */
async function 量开关位置(page: Page, 区: Locator): Promise<string[]> {
  const 菜单 = await 开方案菜单(page, 区)
  const 开关 = 菜单.getByRole("menuitemcheckbox", { name: "生成方案", exact: true })
  await expect(开关).toBeVisible()
  await expect(菜单.getByRole("menuitem", { name: "优化输入", exact: true })).toBeVisible()
  const 错 = await 菜单.evaluate((menu) => {
    const errors: string[] = []
    const r = menu.getBoundingClientRect()
    if (r.left < 0 || r.top < 0 || r.right > innerWidth + 1 || r.bottom > innerHeight + 1) errors.push("添加内容菜单出了窗口")
    if (menu.scrollWidth > menu.clientWidth + 1) errors.push("添加内容菜单横向滚动")
    const items = Array.from(menu.querySelectorAll<HTMLElement>('[role="menuitem"], [role="menuitemcheckbox"]'))
    const plan = items.findIndex(el => el.getAttribute("aria-label") === "生成方案")
    if (plan < 1 || items[plan - 1]?.getAttribute("aria-label") !== "优化输入") errors.push("方案前面不是优化输入")
    for (const el of items) {
      const item = el.getBoundingClientRect()
      if (item.left < r.left - 1 || item.right > r.right + 1 || item.width < 20) errors.push("菜单项出界或被压扁")
    }
    return errors
  })
  错.push(...await 区.locator(".composer-card").evaluate((card) => {
    const errors: string[] = []
    if (card.scrollWidth > card.clientWidth + 1) errors.push("输入卡横向滚动")
    const bounds = card.getBoundingClientRect()
    for (const el of card.querySelectorAll<HTMLElement>('.attach-trigger, .perm-pill, .ctx-meter')) {
      const r = el.getBoundingClientRect()
      if (r.left < bounds.left - 1 || r.right > bounds.right + 1 || r.width < 20) errors.push(`${el.className} 出卡或被压扁`)
    }
    return errors
  }))
  await 关方案菜单(page, 区)
  return 错
}

async function 说(区: Locator, 话: string) {
  await 框(区).fill(话)
  await 框(区).press("Enter")
}

async function 进方案期并交方案(page: Page) {
  await 在项目里开会话(page)
  await 等进了对话(page)
  await 切换方案(page, 主区(page), true)
  await 说(主区(page), "分析一下吸烟和肺功能")
  await expect(卡(主区(page)).first()).toContainText("等你看", { timeout: 30_000 })
}

/** 批准并等执行那一轮**收完尾**（对照到了「已生成 1」、停止键没了）——之后的改动才算「两轮之间」 */
async function 批准并等执行完(page: Page, workspace: string): Promise<string> {
  await 卡(主区(page)).getByRole("button", { name: "照这个做", exact: true }).click()
  await expect(卡(主区(page))).toContainText("已批准", { timeout: 10_000 })
  await expect(卡(主区(page)).locator(".plan-compare-sum")).toContainText("已生成 1", { timeout: 30_000 })
  await expect(停止(主区(page))).toHaveCount(0, { timeout: 30_000 })
  await expect(主区(page).locator(".waiting")).toHaveCount(0, { timeout: 30_000 })
  const 存 = readdirSync(join(workspace, "analysis", "plans"))
  expect(存).toHaveLength(1)
  return join("analysis", "plans", 存[0]!)
}

test.describe("先出方案 · 假模型", () => {
  test.use({ dawnOptions: { gitInit: true } })

  test("**开关 → 方案卡 → 照这个做**：文件真存进 analysis/plans、开关关了、执行话进转录、对照 1 / 2", async ({ dawn }) => {
    const { page, workspace } = dawn
    await 进方案期并交方案(page)
    /** 方案卡就是 propose_plan 的样子——没有一条 propose_plan 的工具行 */
    await expect(主区(page).locator(".tool").filter({ hasText: "propose_plan" })).toHaveCount(0)
    await expect(卡(主区(page))).toContainText("results/tables/mock_summary.csv")

    await 卡(主区(page)).getByRole("button", { name: "照这个做", exact: true }).click()
    await expect(卡(主区(page))).toContainText("已批准", { timeout: 10_000 })
    const 存 = readdirSync(join(workspace, "analysis", "plans"))
    expect(存).toHaveLength(1)
    expect(readFileSync(join(workspace, "analysis", "plans", 存[0]!), "utf8")).toContain("status: approved")
    /** D5：批了就是开始干活，开关自动关、带子没了 */
    await 核对方案状态(page, 主区(page), false)
    await expect(主区(page).locator(".plan-band")).toHaveCount(0)
    await expect(主区(page).locator(".turn.user").last()).toContainText("照批准的方案做")
    /** 假模型照方案写了第一项产物 → 对照 1 / 2 */
    await expect(卡(主区(page)).locator(".plan-compare-sum")).toContainText("计划的产物 2 项 · 已生成 1 · 计划外 0", { timeout: 30_000 })
    await expect.poll(() => existsSync(join(workspace, "results", "tables", "mock_summary.csv")), { timeout: 30_000 }).toBe(true)
    await expect(卡(主区(page)).getByRole("button", { name: "打开方案文件", exact: true })).toBeVisible()
  })

  test("**方案期「偷跑」**：那次 write 被门拦下，磁盘上没有那个文件，理由说「生成方案」", async ({ dawn }) => {
    const { page, workspace } = dawn
    await 在项目里开会话(page)
    await 等进了对话(page)
    await 切换方案(page, 主区(page), true)
    await 说(主区(page), "偷跑一下")
    const 行 = 主区(page).locator(".tool").filter({ hasText: "write" }).first()
    await expect(行).toHaveAttribute("data-status", "error", { timeout: 30_000 })
    // 失败的那条自己会展开（2026-09-15 起）——不再去点，点了反而收起
    await expect(行.locator(".tool-head")).toHaveAttribute("aria-expanded", "true")
    await expect(行.locator(".tool-result")).toContainText("生成方案")
    expect(existsSync(join(workspace, "results", "tables", "偷跑.csv"))).toBe(false)
    /** 拦下之后仍在方案期——开关不因为一次拒绝而掉 */
    await 核对方案状态(page, 主区(page), true)
  })

  test("**改一改**：批的是改过的正文，文件里是改过的，执行那句说以文件为准", async ({ dawn }) => {
    const { page, workspace } = dawn
    await 进方案期并交方案(page)
    await 卡(主区(page)).getByRole("button", { name: "改一改", exact: true }).click()
    const 原文 = 卡(主区(page)).getByRole("textbox", { name: "方案原文" })
    await 原文.fill((await 原文.inputValue()).replace("分组箱线图。", "分组小提琴图。"))
    await 卡(主区(page)).getByRole("button", { name: "照改过的做", exact: true }).click()
    await expect(卡(主区(page))).toContainText("已批准", { timeout: 10_000 })
    await expect(卡(主区(page))).toContainText("批的是改过的")
    const 存 = readdirSync(join(workspace, "analysis", "plans"))
    const 文 = readFileSync(join(workspace, "analysis", "plans", 存[0]!), "utf8")
    expect(文).toContain("分组小提琴图。")
    expect(文).toContain("edited_by_user: true")
    await expect(主区(page).locator(".turn.user").last()).toContainText("以文件为准")
  })

  test("**不做了**：什么都不存，开关关了，卡片写「没采用」", async ({ dawn }) => {
    const { page, workspace } = dawn
    await 进方案期并交方案(page)
    await 卡(主区(page)).getByRole("button", { name: "不做了", exact: true }).click()
    await expect(卡(主区(page))).toContainText("没采用", { timeout: 10_000 })
    expect(existsSync(join(workspace, "analysis", "plans"))).toBe(false)
    await 核对方案状态(page, 主区(page), false)
  })

  test("**`/plan 问题`**：不把 /plan 送给模型、开关打开、问题照发、方案卡出来", async ({ dawn }) => {
    const { page, requests } = dawn
    await 在项目里开会话(page)
    await 等进了对话(page)
    await 说(主区(page), "/plan 分析一下吸烟和肺功能")
    await 核对方案状态(page, 主区(page), true)
    await expect(卡(主区(page)).first()).toContainText("等你看", { timeout: 30_000 })
    await expect(主区(page).locator(".turn.user").first()).toHaveText(/分析一下吸烟和肺功能/)
    await expect(主区(page).locator(".turn.user").first()).not.toContainText("/plan")
    expect(JSON.stringify(requests)).not.toContain("/plan 分析")
  })

  test("方案菜单可操作，三颗方案按钮常驻看得见（opacity 1）", async ({ dawn }) => {
    const { page } = dawn
    await 在项目里开会话(page)
    await 等进了对话(page)
    /** 添加内容菜单中紧跟优化输入，展开后可操作、不出窗口。 */
    expect(await 量开关位置(page, 主区(page))).toEqual([])
    await 切换方案(page, 主区(page), true)
    await 说(主区(page), "分析一下吸烟和肺功能")
    await expect(卡(主区(page)).first()).toContainText("等你看", { timeout: 30_000 })
    for (const 名 of ["照这个做", "改一改", "不做了"]) {
      const 钮 = 卡(主区(page)).getByRole("button", { name: 名, exact: true })
      expect(await 钮.evaluate((el) => getComputedStyle(el).opacity), 名).toBe("1")
    }
    const 菜单 = await 开方案菜单(page, 主区(page))
    const 开关 = 菜单.getByRole("menuitemcheckbox", { name: "生成方案", exact: true })
    await expect(开关).toBeEnabled()
    expect(await 开关.evaluate((el) => getComputedStyle(el).opacity)).toBe("1")
    await 关方案菜单(page, 主区(page))
  })

  test("**人在两轮之间改了方案文件**：留着、卡片写「你改过」", async ({ dawn }) => {
    const { page, workspace } = dawn
    await 进方案期并交方案(page)
    const 相对 = await 批准并等执行完(page, workspace)
    await expect(卡(主区(page)).locator(".tag", { hasText: "你改过" })).toHaveCount(0)

    appendFileSync(join(workspace, 相对), "\n人补的一句：再加一张散点图。\n")
    /** 下一轮收尾时核对——没有工具调用的一轮也核（`收轮核对` 的第二步） */
    await 说(主区(page), "你好")
    await expect(卡(主区(page)).locator(".tag", { hasText: "你改过" })).toBeVisible({ timeout: 30_000 })
    expect(readFileSync(join(workspace, 相对), "utf8")).toContain("人补的一句")
    await expect(主区(page).locator(".turns")).not.toContainText("已从存档恢复")
  })
})

test.describe("先出方案 · agent 这一轮改了批准过的方案", () => {
  /**
   * 门看不见的写法：通配 + 变量，不提 `plans`、不提文件名——`碰已批准` 放行，第二道（轮基线）要接住。
   * `when` 按话分：执行那一轮（「照批准的方案做」）照旧走 mock 的方案分支。
   */
  test.use({
    dawnOptions: {
      gitInit: true,
      toolCall: {
        toolName: "bash",
        args: { command: 'for f in analysis/p*/*.md; do echo "agent 偷改" >> "$f"; done' },
        when: "顺手整理一下",
        say: "我顺手整理一下。",
      },
    },
  })

  test("**恢复并出声**：文件回到批准时的样子，转录里一句「已从存档恢复」，卡片不写「你改过」", async ({ dawn }) => {
    const { page, workspace } = dawn
    await 进方案期并交方案(page)
    const 相对 = await 批准并等执行完(page, workspace)
    const 批准时 = readFileSync(join(workspace, 相对), "utf8")

    await 说(主区(page), "顺手整理一下")
    const 行 = 主区(page).locator(".tool").filter({ hasText: "bash" }).last()
    /** 这一条门确实放行了——不然证的就是第一道，不是第二道 */
    await expect(行).toHaveAttribute("data-status", "ok", { timeout: 30_000 })
    await expect(主区(page).locator(".turns")).toContainText("批准过的方案被改动过，已从存档恢复", { timeout: 30_000 })
    await expect.poll(() => readFileSync(join(workspace, 相对), "utf8"), { timeout: 10_000 }).toBe(批准时)
    await expect(卡(主区(page)).locator(".tag", { hasText: "你改过" })).toHaveCount(0)
  })
})

test.describe("先出方案 · 坞里的对话", () => {
  test.use({ dawnOptions: { gitInit: true } })

  /**
   * 坞窄：添加内容菜单中的方案开关仍有完整名称、可以操作。
   * 菜单不能出窗口；方案卡、带子与操作不能横向撑破坞。
   */
  test("**坞里方案菜单可操作、主侧隔离、方案卡与带子不撑破坞**", async ({ dawn }) => {
    const { page } = dawn
    await 在项目里开会话(page)
    await 等进了对话(page)
    await 进坞(page, "对话")
    await 坞(page).getByRole("button", { name: "另开一段", exact: true }).click()
    await 坞(page).locator(".side-chat-head").waitFor({ timeout: 30_000 })
    await 框(坞(page)).waitFor({ timeout: 30_000 })

    /** 坞里的入口打开独立菜单，方案紧跟优化输入，菜单留在窗口内。 */
    expect(await 量开关位置(page, 坞(page))).toEqual([])
    await 切换方案(page, 坞(page), true)
    expect(await 量开关位置(page, 坞(page))).toEqual([])
    await expect(坞(page).locator(".plan-band")).toBeVisible()
    await 说(坞(page), "分析一下吸烟和肺功能")
    await expect(卡(坞(page)).first()).toContainText("等你看", { timeout: 30_000 })
    /** 主区那段没动：方案期是这一段会话的事 */
    await 核对方案状态(page, 主区(page), false)

    const 量 = await 坞(page).evaluate((dock) => {
      const 撑破: string[] = []
      for (const sel of [".plan-card", ".plan-band", ".composer-card", ".plan-card-actions"]) {
        for (const el of dock.querySelectorAll<HTMLElement>(sel)) {
          if (el.scrollWidth > el.clientWidth + 1) 撑破.push(`${sel} ${el.scrollWidth}>${el.clientWidth}`)
        }
      }
      const 坞框 = dock.getBoundingClientRect()
      for (const el of dock.querySelectorAll<HTMLElement>(".plan-card, .plan-card-actions button")) {
        const r = el.getBoundingClientRect()
        if (r.left < 坞框.left - 1 || r.right > 坞框.right + 1) 撑破.push(`${el.className} 出了坞 ${r.left}-${r.right} / ${坞框.left}-${坞框.right}`)
      }
      return 撑破
    })
    expect(量).toEqual([])
  })
})

const 假ACP = resolve(import.meta.dirname, "..", "scripts", "fake-acp-agent.mjs")

test.describe("先出方案 · 不支持的会话", () => {
  test.use({
    dawnOptions: {
      gitInit: true,
      // 与 e2e/acp-agent.spec.ts 同一份假 ACP agent 的装配
      providersYaml: `agents:
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
`,
    },
  })

  test("**ACP 会话**：菜单开关禁用，同一项直接显示原因", async ({ dawn }) => {
    const { page } = dawn
    await 用某个agent开一段(page, /claude-acp/)
    await 等进了对话(page)
    await expect(page.locator(".conv-head .kind")).toHaveText("ACP")
    const 菜单 = await 开方案菜单(page, 主区(page))
    const 开关 = 菜单.getByRole("menuitemcheckbox", { name: "生成方案", exact: true })
    await expect(开关).toBeDisabled()
    await expect(开关).toHaveAttribute("aria-checked", "false")
    await expect(开关).toContainText("这个 agent 不归 DAWN 管工具，生成方案用不了")
    await expect(开关.locator(".composer-menu-reason")).toBeVisible()
    await 关方案菜单(page, 主区(page))
    /** 原因与禁用项同在菜单里，不把菜单或输入卡撑出窗口。 */
    expect(await 量开关位置(page, 主区(page))).toEqual([])
  })
})
