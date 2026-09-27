/**
 * 先出方案（2026-09-27，spec `2026-09-27-先出方案-design.md` §5）。**跑真实构建产物。**
 *
 * 假模型走 mock 的「先出方案」分支（`dev:mock` 里人按的也是它）：请求的工具表里有 `propose_plan`（= 在方案期）→ 交一份五节齐全的方案；
 * 方案期说「偷跑」→ 调 `write`（门要拦下）；不在方案期、说「照批准的方案做」→ 写方案里的第一项产物。
 *
 * ## 两处长得一样
 *
 * 「先出方案」这四个字同时是：输入卡上那颗开关的名字、带子文案的一部分、斜杠菜单那一项、⌘K 两条标题的一部分。
 * 开关一律 `getByRole("button", { name: "先出方案", exact: true })`，并先圈定在主区（`main.main`）或坞（`aside.right-dock`）里——
 * 主区与坞里是同一个 `ConversationView`，不圈就是两个。
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
const 框 = (区: Locator) => 区.getByPlaceholder(/今天帮你做些什么/)
const 开关 = (区: Locator) => 区.getByRole("button", { name: "先出方案", exact: true })
const 卡 = (区: Locator) => 区.locator(".plan-card")
const 停止 = (区: Locator) => 区.getByRole("button", { name: "停止", exact: true })

async function 说(区: Locator, 话: string) {
  await 框(区).fill(话)
  await 框(区).press("Enter")
}

async function 进方案期并交方案(page: Page) {
  await 在项目里开会话(page)
  await 等进了对话(page)
  await 开关(主区(page)).click()
  await expect(开关(主区(page))).toHaveAttribute("aria-pressed", "true")
  await expect(主区(page).locator(".plan-band")).toContainText("只看不改")
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
    await expect(开关(主区(page))).toHaveAttribute("aria-pressed", "false")
    await expect(主区(page).locator(".plan-band")).toHaveCount(0)
    await expect(主区(page).locator(".turn.user").last()).toContainText("照批准的方案做")
    /** 假模型照方案写了第一项产物 → 对照 1 / 2 */
    await expect(卡(主区(page)).locator(".plan-compare-sum")).toContainText("计划的产物 2 项 · 已生成 1 · 计划外 0", { timeout: 30_000 })
    await expect.poll(() => existsSync(join(workspace, "results", "tables", "mock_summary.csv")), { timeout: 30_000 }).toBe(true)
    await expect(卡(主区(page)).getByRole("button", { name: "打开方案文件", exact: true })).toBeVisible()
  })

  test("**方案期「偷跑」**：那次 write 被门拦下，磁盘上没有那个文件，理由说「先出方案」", async ({ dawn }) => {
    const { page, workspace } = dawn
    await 在项目里开会话(page)
    await 等进了对话(page)
    await 开关(主区(page)).click()
    await expect(开关(主区(page))).toHaveAttribute("aria-pressed", "true")
    await 说(主区(page), "偷跑一下")
    const 行 = 主区(page).locator(".tool").filter({ hasText: "write" }).first()
    await expect(行).toHaveAttribute("data-status", "error", { timeout: 30_000 })
    // 失败的那条自己会展开（2026-09-15 起）——不再去点，点了反而收起
    await expect(行.locator(".tool-head")).toHaveAttribute("aria-expanded", "true")
    await expect(行.locator(".tool-result")).toContainText("先出方案")
    expect(existsSync(join(workspace, "results", "tables", "偷跑.csv"))).toBe(false)
    /** 拦下之后仍在方案期——开关不因为一次拒绝而掉 */
    await expect(开关(主区(page))).toHaveAttribute("aria-pressed", "true")
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
    await expect(开关(主区(page))).toHaveAttribute("aria-pressed", "false")
  })

  test("**`/plan 问题`**：不把 /plan 送给模型、开关打开、问题照发、方案卡出来", async ({ dawn }) => {
    const { page, requests } = dawn
    await 在项目里开会话(page)
    await 等进了对话(page)
    await 说(主区(page), "/plan 分析一下吸烟和肺功能")
    await expect(开关(主区(page))).toHaveAttribute("aria-pressed", "true")
    await expect(卡(主区(page)).first()).toContainText("等你看", { timeout: 30_000 })
    await expect(主区(page).locator(".turn.user").first()).toHaveText(/分析一下吸烟和肺功能/)
    await expect(主区(page).locator(".turn.user").first()).not.toContainText("/plan")
    expect(JSON.stringify(requests)).not.toContain("/plan 分析")
  })

  test("三颗按钮与开关常驻看得见（opacity 1）", async ({ dawn }) => {
    const { page } = dawn
    await 进方案期并交方案(page)
    for (const 名 of ["照这个做", "改一改", "不做了"]) {
      const 钮 = 卡(主区(page)).getByRole("button", { name: 名, exact: true })
      expect(await 钮.evaluate((el) => getComputedStyle(el).opacity), 名).toBe("1")
    }
    expect(await 开关(主区(page)).evaluate((el) => getComputedStyle(el).opacity)).toBe("1")
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
   * 坞窄：开关只留图标（`.plan-toggle-word` 由容器查询藏掉），名字在 `aria-label` 上。
   * 要证的是**不撑破**——开关在输入卡里、方案卡与带子不出横向滚动。
   */
  test("**开关只留图标、方案卡与带子不撑破坞**", async ({ dawn }) => {
    const { page } = dawn
    await 在项目里开会话(page)
    await 等进了对话(page)
    await 进坞(page, "对话")
    await 坞(page).getByRole("button", { name: "另开一段", exact: true }).click()
    await 坞(page).locator(".side-chat-head").waitFor({ timeout: 30_000 })
    await 框(坞(page)).waitFor({ timeout: 30_000 })

    await 开关(坞(page)).click()
    await expect(开关(坞(page))).toHaveAttribute("aria-pressed", "true")
    await expect(坞(page).locator(".plan-toggle-word")).toBeHidden()
    await expect(坞(page).locator(".plan-band")).toBeVisible()
    await 说(坞(page), "分析一下吸烟和肺功能")
    await expect(卡(坞(page)).first()).toContainText("等你看", { timeout: 30_000 })
    /** 主区那段没动：方案期是这一段会话的事 */
    await expect(开关(主区(page))).toHaveAttribute("aria-pressed", "false")

    const 量 = await 坞(page).evaluate((dock) => {
      const 撑破: string[] = []
      for (const sel of [".plan-card", ".plan-band", ".composer-card", ".plan-card-actions"]) {
        for (const el of dock.querySelectorAll<HTMLElement>(sel)) {
          if (el.scrollWidth > el.clientWidth + 1) 撑破.push(`${sel} ${el.scrollWidth}>${el.clientWidth}`)
        }
      }
      const 坞框 = dock.getBoundingClientRect()
      const 卡框 = dock.querySelector(".composer-card")!.getBoundingClientRect()
      const 钮框 = dock.querySelector(".plan-toggle")!.getBoundingClientRect()
      for (const el of dock.querySelectorAll<HTMLElement>(".plan-card, .plan-card-actions button")) {
        const r = el.getBoundingClientRect()
        if (r.left < 坞框.left - 1 || r.right > 坞框.right + 1) 撑破.push(`${el.className} 出了坞 ${r.left}-${r.right} / ${坞框.left}-${坞框.right}`)
      }
      if (钮框.left < 卡框.left - 1 || 钮框.right > 卡框.right + 1) 撑破.push(`开关出了输入卡 ${钮框.left}-${钮框.right} / ${卡框.left}-${卡框.right}`)
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

  test("**ACP 会话**：开关灰着，旁边一行字说原因（不是悬停提示）", async ({ dawn }) => {
    const { page } = dawn
    await 用某个agent开一段(page, /claude-acp/)
    await 等进了对话(page)
    await expect(page.locator(".conv-head .kind")).toHaveText("ACP")
    await expect(开关(主区(page))).toBeDisabled()
    const 原因 = 主区(page).locator(".plan-toggle-why")
    await expect(原因).toHaveText("这个 agent 不归 DAWN 管工具，先出方案用不了")
    expect(await 原因.evaluate((el) => getComputedStyle(el).opacity)).toBe("1")
  })
})
