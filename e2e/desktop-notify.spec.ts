/**
 * 桌面通知（2026-09-27，spec `2026-09-27-桌面通知-design.md` §6、§8）。**跑真实构建产物。**
 *
 * 系统通知 Playwright 看不见：夹具开着 `DAWN_FAKE_NOTIFY=1`，主进程的假出口把每一条记进 `globalThis.__dawn桌面通知`，
 * 这里用 `读桌面通知` / `点桌面通知` 读、点——点走的是与真通知 click **同一个** `点了`（src/electron/main.ts）。
 * dev:mock 用的是同一份假的（准入规则 1）。
 *
 * ## 前台
 *
 * e2e 的窗口永远藏着（`DAWN_HIDE_WINDOW`）= 永远「不在前台」，所以缺省每一轮都会弹。要演「人正看着」就 `设前台(app, true)`，
 * 用完 `设前台(app, undefined)` 交还。
 *
 * ## 负断言要等够，也要证明管线活着
 *
 * 「不弹」的那几条：等过静候窗口（1 秒）再多等 2 秒才判；判完**在同一条用例里**再让它弹一次——
 * 否则一条永远不弹的坏管线也能让「不弹」绿着。
 *
 * ## 计划七条之外（2026-09-28 统筹补的）
 *
 * 前台但人看的是别的段 → 弹（§0 第 2 条）；「做完了」正文只看这一轮（§8）；子 agent 那一轮只报主区一条；
 * `/compact` 与回退都不弹；定时只报一条「定时…」、它那段的权限卡照弹（§8 第 2 条）；点坞里那段的通知 → 打开坞的「对话」格；
 * 点另一个项目里那段的通知 → 换项目并切过去。
 */
import type { Locator, Page } from "@playwright/test"
import { mkdirSync } from "node:fs"
import { join } from "node:path"
import {
  test,
  expect,
  CANNED_REPLY,
  开一段临时会话,
  在项目里开会话,
  等进了对话,
  进设置,
  进坞,
  读桌面通知,
  点桌面通知,
  桌面角标,
  设前台,
} from "./fixtures.js"

const 主区 = (page: Page) => page.locator("main.main")
const 坞 = (page: Page) => page.locator("aside.right-dock")
const 框 = (区: Locator) => 区.getByPlaceholder(/今天帮你做些什么/)
async function 说(区: Locator, 话: string) {
  await 框(区).fill(话)
  await 框(区).press("Enter")
}
const 静候之后再等 = 3_000
/** 走人会走的那条路另开一段：「新建任务」→ 空态那张卡上说一句（开口才建）。等只有新那段才有的标题 */
async function 新开一段(page: Page, 首句: string) {
  await page.getByRole("button", { name: "新建任务" }).click()
  await expect(page.locator(".conv-title")).toHaveCount(0)
  await 说(page.locator("body"), 首句)
  await 等进了对话(page)
  await expect(page.locator(".conv-title")).toContainText(首句, { timeout: 30_000 })
}
type 种类 = "done" | "error" | "permission" | "schedule" | "test"
const 几条 = async (app: Parameters<typeof 读桌面通知>[0], kind: 种类) => (await 读桌面通知(app)).filter((n) => n.kind === kind).length

test("**做完了**：窗口不在前台 → 弹一条，标题带会话名、正文是回复开头；Dock 角标 1", async ({ dawn }) => {
  const { page, app } = dawn
  await 开一段临时会话(page, "通知一")
  await 等进了对话(page)
  // 首句那一轮本身就会弹一条；等它落定再说下一句——否则下一句在静候窗口里到，它被作废与否全看快慢
  await expect.poll(() => 几条(app, "done"), { timeout: 30_000 }).toBe(1)
  await 说(主区(page), "你好")
  await expect(主区(page).getByText(CANNED_REPLY)).toHaveCount(2, { timeout: 30_000 })
  await expect.poll(async () => (await 读桌面通知(app)).filter((n) => n.kind === "done"), { timeout: 15_000 }).toHaveLength(2)
  const n = (await 读桌面通知(app)).filter((x) => x.kind === "done")[1]
  expect(n!.title).toContain("通知一")
  expect(n!.body).toContain(CANNED_REPLY.slice(0, 10))
  expect(n!.sessionId).toBeTruthy()
  expect(await 桌面角标(app), "同一段弹两次，角标数的是段不是条").toBe(1)
})

test("**正看着那段就不弹**；交还前台之后同一段再说一句 → 弹（证明管线是活的）", async ({ dawn }) => {
  const { page, app } = dawn
  await 开一段临时会话(page, "通知二")
  await 等进了对话(page)
  await expect.poll(() => 几条(app, "done"), { timeout: 30_000 }).toBe(1)
  await 设前台(app, true)
  await 说(主区(page), "你好")
  await expect(主区(page).getByText(CANNED_REPLY)).toHaveCount(2, { timeout: 30_000 })
  await page.waitForTimeout(静候之后再等)
  expect(await 几条(app, "done"), "人正看着这段，不该弹").toBe(1)

  await 设前台(app, undefined)
  await 说(主区(page), "再来一句")
  await expect.poll(() => 几条(app, "done"), { timeout: 30_000 }).toBe(2)
})

test("**前台、但人在看另一段** → 那段做完照弹（§0 第 2 条）", async ({ dawn }) => {
  const { page, app } = dawn
  await 开一段临时会话(page, "通知前台甲")
  await 等进了对话(page)
  // 首句那一轮先收完（它不在前台，会弹一条）——之后才开始数
  await expect.poll(() => 几条(app, "done"), { timeout: 30_000 }).toBe(1)
  await 设前台(app, true)
  // 「慢慢跑」= 先说一句、再 sleep 20：留出切走的时间
  await 说(主区(page), "慢慢跑")
  await expect(主区(page).locator(".turns")).toContainText("我先跑一段慢的。", { timeout: 30_000 })

  await 新开一段(page, "通知前台乙")
  // 乙自己那一轮：前台 + 在屏上 → 不弹；甲那一轮跑完 → 弹（它不在屏上）
  await expect.poll(() => 几条(app, "done"), { timeout: 60_000 }).toBe(2)
  const 甲那条 = (await 读桌面通知(app)).filter((n) => n.kind === "done")[1]!
  expect(甲那条.title).toContain("通知前台甲")
  await page.waitForTimeout(静候之后再等)
  expect(await 几条(app, "done"), "乙就在屏上、窗口在前台，乙那一轮不该弹").toBe(2)
  await 设前台(app, undefined)
})

test("**「做完了」的正文只看这一轮**：第二轮换了回复，正文跟着换，不拿上一轮的顶", async ({ dawn }) => {
  const { page, app } = dawn
  await 开一段临时会话(page, "通知正文")
  await 等进了对话(page)
  await expect.poll(() => 几条(app, "done"), { timeout: 30_000 }).toBe(1)
  expect((await 读桌面通知(app)).find((n) => n.kind === "done")!.body).toContain(CANNED_REPLY.slice(0, 10))

  await 说(主区(page), "长回复")
  await expect.poll(() => 几条(app, "done"), { timeout: 30_000 }).toBe(2)
  const 第二条 = (await 读桌面通知(app)).filter((n) => n.kind === "done")[1]!
  expect(第二条.body).toContain("第 1 节")
  expect(第二条.body, "正文不该是上一轮的回复").not.toContain(CANNED_REPLY.slice(0, 10))
  expect(第二条.body.length, "正文截到 120 字上下").toBeLessThanOrEqual(130)
})

test("**点通知回到那段**：在别的段上点 → 主区切回去；人在前台看到了 → 角标清零", async ({ dawn }) => {
  const { page, app } = dawn
  await 开一段临时会话(page, "通知三甲")
  await 等进了对话(page)
  await expect.poll(() => 几条(app, "done"), { timeout: 30_000 }).toBe(1)
  const 第几条 = (await 读桌面通知(app)).findIndex((n) => n.kind === "done")

  await 新开一段(page, "通知三乙")
  // 乙那一轮也弹了（窗口不在前台）：两段都没看
  await expect.poll(() => 几条(app, "done"), { timeout: 30_000 }).toBe(2)
  expect(await 桌面角标(app)).toBe(2)

  // 回到前台：屏上的乙算看见了
  await 设前台(app, true)
  await expect.poll(() => 桌面角标(app), { timeout: 10_000 }).toBe(1)
  await 点桌面通知(app, 第几条)
  await expect(page.locator(".conv-title")).toContainText("通知三甲", { timeout: 10_000 })
  await expect.poll(() => 桌面角标(app), { timeout: 10_000 }).toBe(0)
  await 设前台(app, undefined)
})

test("**点另一个项目里那段的通知** → 换到那个项目、主区切到那段", async ({ dawn }) => {
  const { page, app, dir } = dawn
  const 甲 = join(dir, "通知项目甲")
  const 乙 = join(dir, "通知项目乙")
  for (const d of [甲, 乙]) mkdirSync(d, { recursive: true })
  await page.evaluate(async (paths) => {
    const w = window as unknown as { dawn: { invoke: (op: string, req: unknown) => Promise<{ data?: unknown }> } }
    const p = (await w.dawn.invoke("getProviders", {})) as { data?: { agents?: { agentId: string }[] } }
    const agentId = p.data?.agents?.[0]?.agentId
    for (const workspace of paths) await w.dawn.invoke("createTask", { agentId, workspace })
  }, [甲, 乙])
  await page.reload()
  const 项目 = (名: string) => page.locator(".proj-list .proj-item", { hasText: 名 })
  await expect(项目("通知项目甲")).toHaveCount(1, { timeout: 30_000 })
  await expect(项目("通知项目乙")).toHaveCount(1)

  const 进 = async (名: string) => {
    if ((await 项目(名).getAttribute("class"))?.includes("current") !== true) await 项目(名).locator(".row").first().click()
    await 项目(名).locator(".proj-session-list .sess-item .row").first().click()
    await 等进了对话(page)
  }
  await 进("通知项目甲")
  await 说(主区(page), "甲项目里的一句")
  await expect.poll(() => 几条(app, "done"), { timeout: 30_000 }).toBe(1)
  const 第几条 = (await 读桌面通知(app)).findIndex((n) => n.kind === "done")

  await 进("通知项目乙")
  await expect(项目("通知项目乙")).toHaveClass(/\bcurrent\b/)
  await expect(page.locator(".conv-title")).not.toContainText("甲项目里的一句")

  await 点桌面通知(app, 第几条)
  await expect(项目("通知项目甲")).toHaveClass(/\bcurrent\b/, { timeout: 10_000 })
  await expect(page.locator(".conv-title")).toContainText("甲项目里的一句", { timeout: 10_000 })
})

test("**点坞里那段的通知** → 坞打开到「对话」格，主区不动", async ({ dawn }) => {
  const { page, app } = dawn
  await 在项目里开会话(page)
  await 等进了对话(page)
  const 主区标题 = (await page.locator(".conv-title").textContent()) ?? ""
  await 进坞(page, "对话")
  await 坞(page).getByRole("button", { name: "另开一段", exact: true }).click()
  await 坞(page).locator(".side-chat-head").waitFor({ timeout: 30_000 })
  await 说(坞(page), "坞里说的一句")
  await expect(坞(page).locator(".turns")).toContainText(CANNED_REPLY, { timeout: 30_000 })
  await expect.poll(() => 几条(app, "done"), { timeout: 15_000 }).toBe(1)
  const 第几条 = (await 读桌面通知(app)).findIndex((n) => n.kind === "done")

  // 收起坞：点通知要能把它重新打开，而且停在「对话」格
  const 颗 = page.getByRole("button", { name: /^面板/ })
  await 颗.click()
  await expect(颗).toHaveAttribute("aria-expanded", "false")

  await 点桌面通知(app, 第几条)
  await expect(颗).toHaveAttribute("aria-expanded", "true", { timeout: 10_000 })
  await expect(page.getByRole("tab", { name: "对话", exact: true })).toHaveAttribute("aria-selected", "true")
  await expect(坞(page).locator(".side-chat-head")).toBeVisible()
  await expect(坞(page).locator(".turns")).toContainText("坞里说的一句")
  await expect(page.locator(".conv-title")).toHaveText(主区标题)
})

test("**出错了**：「演一次失败」→ 弹「出错了」，正文带模型调用失败；这一轮不再另弹「做完了」", async ({ dawn }) => {
  const { page, app } = dawn
  await 开一段临时会话(page, "通知四")
  await 等进了对话(page)
  // 首句那一轮的「做完了」先收完，下面才好判「失败那一轮没另弹」
  await expect.poll(() => 几条(app, "done"), { timeout: 30_000 }).toBe(1)
  await 说(主区(page), "演一次失败")
  await expect(主区(page).getByText(/模型调用失败/).first()).toBeVisible({ timeout: 30_000 })
  await expect.poll(async () => (await 读桌面通知(app)).filter((n) => n.kind === "error").length, { timeout: 15_000 }).toBe(1)
  const [n] = (await 读桌面通知(app)).filter((x) => x.kind === "error")
  expect(n!.title).toContain("通知四")
  expect(n!.body).toContain("模型调用失败")
  await page.waitForTimeout(静候之后再等)
  expect(await 几条(app, "done"), "失败的一轮只报一次").toBe(1)
})

test("**等你点头**：「请求批准」档下「演一次权限」→ 卡弹出来的同时弹一条；人回来答掉 → 角标清零", async ({ dawn }) => {
  const { page, app } = dawn
  await 开一段临时会话(page, "通知五")
  await 等进了对话(page)
  await expect.poll(() => 几条(app, "done"), { timeout: 30_000 }).toBe(1)
  const 扳机 = page.locator(".composer-footer .perm-pill-trigger")
  await 扳机.click()
  await page.getByRole("menuitemradio", { name: /^请求批准/ }).click()
  await expect(扳机).toHaveText(/^请求批准/)
  await 说(主区(page), "演一次权限")
  const 卡 = page.locator(".perm-card")
  await expect(卡).toBeVisible({ timeout: 30_000 })
  await expect.poll(async () => (await 读桌面通知(app)).filter((n) => n.kind === "permission").length, { timeout: 10_000 }).toBe(1)
  const [n] = (await 读桌面通知(app)).filter((x) => x.kind === "permission")
  expect(n!.title).toContain("通知五")
  expect(n!.body).toContain("curl")
  expect(await 桌面角标(app)).toBe(1)

  await 设前台(app, true)
  await 卡.getByRole("button", { name: "拒绝", exact: true }).click()
  await expect(卡).toHaveCount(0)
  await expect.poll(() => 桌面角标(app), { timeout: 10_000 }).toBe(0)
  await 设前台(app, undefined)
})

test("**子 agent 那一轮只报一条**：主区那一轮收尾时一条「做完了」，子进程自己不弹", async ({ dawn }) => {
  const { page, app } = dawn
  await 在项目里开会话(page)
  await 等进了对话(page)
  await 说(主区(page), "派子agent看看这个仓库")
  const chip = 主区(page).locator(".chip-group .chip").first()
  await expect(chip).toHaveAttribute("data-status", "ok", { timeout: 60_000 })
  await expect(主区(page).getByRole("button", { name: "停止", exact: true })).toHaveCount(0, { timeout: 60_000 })
  await expect.poll(() => 几条(app, "done"), { timeout: 15_000 }).toBe(1)
  await page.waitForTimeout(静候之后再等)
  const 全部 = await 读桌面通知(app)
  expect(全部.map((n) => n.kind), "子 agent 不另弹").toEqual(["done"])
})

test.describe("压缩", () => {
  test.use({ dawnOptions: { compactKeepRecentTokens: 1 } })

  test("**/compact 不弹**；再说一句照弹（管线活着）", async ({ dawn }) => {
    const { page, app } = dawn
    await 开一段临时会话(page, "通知压缩")
    await 等进了对话(page)
    await expect.poll(() => 几条(app, "done"), { timeout: 30_000 }).toBe(1)
    await 说(主区(page), "第二句")
    await expect.poll(() => 几条(app, "done"), { timeout: 30_000 }).toBe(2)

    await 说(主区(page), "/compact 保留暗号")
    await expect(主区(page).locator('.compaction-mark[data-status="done"]')).toBeVisible({ timeout: 30_000 })
    await page.waitForTimeout(静候之后再等)
    expect((await 读桌面通知(app)).map((n) => n.kind), "压缩不是一轮，不该弹").toEqual(["done", "done"])

    await 说(主区(page), "第三句")
    await expect.poll(() => 几条(app, "done"), { timeout: 30_000 }).toBe(3)
  })
})

test.describe("回退", () => {
  test.use({ dawnOptions: { gitInit: true } })

  test("**回退这一轮不弹**；再说一句照弹（管线活着）", async ({ dawn }) => {
    const { page, app } = dawn
    await 在项目里开会话(page)
    await 等进了对话(page)
    await 说(主区(page), "改两个文件")
    await expect.poll(() => 几条(app, "done"), { timeout: 30_000 }).toBe(1)
    await 说(主区(page), "再改两个文件")
    await expect.poll(() => 几条(app, "done"), { timeout: 30_000 }).toBe(2)

    await 主区(page).locator(".turn.user", { hasText: "再改两个文件" }).getByRole("button", { name: "回到这句之前", exact: true }).click()
    const 对话框 = page.getByRole("dialog").filter({ hasText: /回到「.*」之前？/ })
    await 对话框.getByRole("button", { name: "文件和对话一起回退", exact: true }).click()
    await expect(主区(page).getByText(/已回到「再改两个文件」之前/)).toBeVisible({ timeout: 10_000 })
    await page.waitForTimeout(静候之后再等)
    expect((await 读桌面通知(app)).map((n) => n.kind), "回退不是一轮，不该弹").toEqual(["done", "done"])

    await 说(主区(page), "你好")
    await expect.poll(() => 几条(app, "done"), { timeout: 30_000 }).toBe(3)
  })
})

/** 走应用自己那条 IPC 建一条定时、立即跑一次（界面那条路 `schedule.spec.ts` 盯着）。表单里没有「请求批准」档，协议有 */
async function 立即跑一条定时(page: Page, 名: string, 说明: string, permission: "allow-all" | "ask-risky" | "deny-risky", workspace: string) {
  return page.evaluate(
    async ({ 名, 说明, permission, workspace }) => {
      const w = window as unknown as { dawn: { invoke: (op: string, req: unknown) => Promise<{ data?: { id?: string }; error?: unknown }> } }
      const p = (await w.dawn.invoke("getProviders", {})) as { data?: { agents?: { agentId: string }[] } }
      const agentId = p.data?.agents?.[0]?.agentId
      const 建 = await w.dawn.invoke("createSchedule", {
        name: 名,
        prompt: 说明,
        schedule: { kind: "daily", time: "09:00", timeZone: "Asia/Shanghai" },
        agentId,
        workspace,
        permission,
      })
      if (!建.data?.id) return JSON.stringify(建)
      const 跑 = await w.dawn.invoke("runScheduleNow", { id: 建.data.id })
      return 跑.data ? "ok" : JSON.stringify(跑)
    },
    { 名, 说明, permission, workspace },
  )
}

test("**定时跑一次只报一条**「定时『X』跑完了」，不另弹「做完了」", async ({ dawn }) => {
  const { page, app, workspace } = dawn
  await expect(page.locator(".app-shell")).toBeVisible()
  expect(await 立即跑一条定时(page, "通知早报", "看看昨晚的数据", "deny-risky", workspace)).toBe("ok")
  await expect.poll(() => 几条(app, "schedule"), { timeout: 30_000 }).toBe(1)
  const n = (await 读桌面通知(app)).find((x) => x.kind === "schedule")!
  expect(n.title).toContain("通知早报")
  expect(n.title).toContain("跑完了")
  expect(n.body).toContain(CANNED_REPLY.slice(0, 10))
  expect(n.sessionId).toBeTruthy()
  await page.waitForTimeout(静候之后再等)
  expect((await 读桌面通知(app)).map((x) => x.kind), "一次运行只报调度器那一条").toEqual(["schedule"])
})

test("**定时那段的权限卡照弹**（§8 第 2 条）；点它回到那段、答掉之后调度器那一条照常，仍不另弹「做完了」", async ({ dawn }) => {
  const { page, app, workspace } = dawn
  await expect(page.locator(".app-shell")).toBeVisible()
  expect(await 立即跑一条定时(page, "通知夜巡", "演一次权限", "ask-risky", workspace)).toBe("ok")
  await expect.poll(() => 几条(app, "permission"), { timeout: 30_000 }).toBe(1)
  const 第几条 = (await 读桌面通知(app)).findIndex((n) => n.kind === "permission")
  const n = (await 读桌面通知(app))[第几条]!
  expect(n.title).toContain("通知夜巡")
  expect(n.body).toContain("curl")

  await 点桌面通知(app, 第几条)
  await expect(page.locator(".conv-title")).toContainText("通知夜巡", { timeout: 10_000 })
  const 卡 = page.locator(".perm-card")
  await expect(卡).toBeVisible({ timeout: 10_000 })
  await 卡.getByRole("button", { name: "拒绝", exact: true }).click()
  await expect(卡).toHaveCount(0)

  await expect.poll(() => 几条(app, "schedule"), { timeout: 30_000 }).toBe(1)
  await page.waitForTimeout(静候之后再等)
  expect((await 读桌面通知(app)).map((x) => x.kind)).toEqual(["permission", "schedule"])
})

test("**设置里关掉「一轮做完」**：存进后端、重开还关着", async ({ dawn }) => {
  const { page } = dawn
  await expect(page.locator(".app-shell")).toBeVisible()
  await 进设置(page, "桌面通知")
  const 做完 = page.getByRole("checkbox", { name: "一轮做完" })
  await expect(做完).toBeChecked()
  await 做完.click()
  await expect(做完).not.toBeChecked()
  const 存的 = await page.evaluate(async () => {
    const w = window as unknown as { dawn: { invoke: (op: string, req: unknown) => Promise<{ data?: { done?: boolean } }> } }
    return (await w.dawn.invoke("desktopGetNotify", {})).data?.done
  })
  expect(存的, "改完的开关没存下来").toBe(false)

  const p2 = await dawn.重开()
  await expect(p2.locator(".app-shell")).toBeVisible()
  await 进设置(p2, "桌面通知")
  await expect(p2.getByRole("checkbox", { name: "一轮做完" })).not.toBeChecked()
})

test("**发一条试试**：假出口记下一条 test；屏上说已发出", async ({ dawn }) => {
  const { page, app } = dawn
  await expect(page.locator(".app-shell")).toBeVisible()
  await 进设置(page, "桌面通知")
  await page.getByRole("button", { name: "发一条试试", exact: true }).click()
  await expect(page.getByRole("status").filter({ hasText: "已发出" })).toBeVisible()
  expect((await 读桌面通知(app)).map((n) => n.kind)).toContain("test")
})
