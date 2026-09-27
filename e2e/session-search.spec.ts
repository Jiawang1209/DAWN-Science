/**
 * 会话全文搜索（2026-09-27，spec `2026-09-27-会话全文搜索-design.md` §9）。跑真实构建产物。
 *
 * 假模型两条路：默认回 `CANNED_REPLY`（「假模型已应答：DAWN 的整条链路是通的。」）；
 * 带「跑个 Cox」的一句走 mock 的「跑个 Cox」分支（`dev:mock` 里人搜的也是它）：先说一句，再调 bash 把 Cox 代码印出来。
 *
 * 等待条件挑**只有目标状态才有**的东西：结果卡 `.cs-card`、`[data-search-hit="true"]`——不等输入框、不等 `.turn` 条数
 * （超过预算的那几条本来就不在 DOM 里，数着数着就永远等不到）。
 *
 * 前五条是 spec §9 那五条；后面几条（2026-09-28）补的是计划没写、但会咬人的路：
 * 两个字的中文、归档了的点开即取消归档、别的项目里的那段、打字快时只留最后一次的结果。
 */
import type { Page } from "@playwright/test"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { mkdirSync, rmSync } from "node:fs"
import { test, expect, 开一段临时会话, 等进了对话 } from "./fixtures.js"
import { 默认转录预算 } from "../src/ui/transcript-budget.js"

const 框 = (page: Page) => page.getByPlaceholder(/今天帮你做些什么/)

async function 说(page: Page, 话: string) {
  await 框(page).fill(话)
  await 框(page).press("Enter")
  await expect(page.locator(".turns .turn").last()).toHaveClass(/agent/, { timeout: 30_000 })
}

async function 按内容搜(page: Page, 词: string) {
  const 开着 = await page.locator(".side-search-field").count()
  if (!开着) await page.getByRole("button", { name: "搜索", exact: true }).click()
  await page.getByRole("button", { name: "按内容", exact: true }).click()
  await page.locator(".side-search-field").fill(词)
  await expect(page.locator(".cs-card").first()).toBeVisible({ timeout: 15_000 })
}

/** 那一条真的在视野里（不只是在 DOM 里） */
async function 在视野里(page: Page, 选择器: string) {
  await expect
    .poll(
      async () =>
        page.locator(选择器).first().evaluate((el) => {
          const r = el.getBoundingClientRect()
          return r.bottom > 0 && r.top < window.innerHeight
        }),
      { timeout: 10_000 },
    )
    .toBe(true)
}

test("**搜到你说的与 agent 回的**：片段里有高亮，两颗切换看得见", async ({ dawn }) => {
  const { page } = dawn
  await 开一段临时会话(page)
  await 等进了对话(page)
  await 说(page, "帮我看看蓝鲸队列的生存曲线")

  await page.getByRole("button", { name: "搜索", exact: true }).click()
  for (const 名 of ["按名字", "按内容"]) {
    const 钮 = page.getByRole("button", { name: 名, exact: true })
    await expect(钮).toBeVisible()
    expect(await 钮.evaluate((el) => getComputedStyle(el).opacity)).toBe("1")
  }
  // 缺省是按名字：旧行为不变
  await expect(page.getByRole("button", { name: "按名字", exact: true })).toHaveAttribute("aria-pressed", "true")

  await 按内容搜(page, "蓝鲸队列")
  const 卡 = page.locator(".cs-card").first()
  await expect(卡.locator(".cs-where").first()).toHaveText("你：")
  await expect(卡.locator("mark.cs-mark").first()).toHaveText("蓝鲸队列")

  await page.locator(".side-search-field").fill("链路是通的")
  await expect(page.locator(".cs-card .cs-where").first()).toHaveText("agent：", { timeout: 15_000 })
})

test("**搜工具参数**：「跑个 Cox」之后搜 coxph → 点「命令里」→ 那一行展开、在视野里、带高亮", async ({ dawn }) => {
  const { page } = dawn
  await 开一段临时会话(page)
  await 等进了对话(page)
  await 说(page, "跑个 Cox 看看")
  await expect(page.locator(".tool")).toHaveCount(1, { timeout: 30_000 })

  // 切去别的地方再点结果：验的是「打开 + 跳」，不是「已经在那儿」
  await page.getByRole("button", { name: "新建任务" }).click()
  await 按内容搜(page, "coxph")
  await page.locator(".cs-hit", { hasText: "命令里：" }).first().click()

  const 行 = page.locator(".tool[data-item-id]").first()
  await expect(行).toHaveClass(/\bopen\b/, { timeout: 15_000 })
  await expect(行).toHaveAttribute("data-search-hit", "true")
  await 在视野里(page, '.tool[data-search-hit="true"]')
  expect(
    await page.evaluate(
      () => (CSS as unknown as { highlights: Map<string, Set<unknown>> }).highlights.get("dawn-search-hit")?.size ?? 0,
    ),
  ).toBeGreaterThan(0)
})

test("**预算之外也跳得到**：第一句带暗号、再说满一屏，搜 → 点 → 第一句出现且在视野里", async ({ dawn }) => {
  const { page } = dawn
  await 开一段临时会话(page)
  await 等进了对话(page)
  await 说(page, "鲸落回归的第一句")
  for (let i = 1; i <= Math.floor(默认转录预算 / 2) + 1; i++) await 说(page, `垫话${i}`)
  await expect(page.locator(".turns").getByText("鲸落回归的第一句", { exact: true })).toHaveCount(0)

  await 按内容搜(page, "鲸落回归")
  await page.locator(".cs-hit").first().click()
  await expect(page.locator('.turns [data-search-hit="true"]')).toContainText("鲸落回归的第一句", { timeout: 15_000 })
  await 在视野里(page, '.turns [data-search-hit="true"]')
})

test("**关掉再打开仍搜得到、点得过去**（读的是 pi 的记录，不是内存）", async ({ dawn }) => {
  await 开一段临时会话(dawn.page)
  await 等进了对话(dawn.page)
  await 说(dawn.page, "重启之前的抹香鲸")

  const page = await dawn.重开()
  await 按内容搜(page, "抹香鲸")
  await page.locator(".cs-hit").first().click()
  await expect(page.locator('.turns [data-search-hit="true"]')).toContainText("重启之前的抹香鲸", { timeout: 30_000 })
})

test("**命令面板直达按内容**；Esc 关掉回到按名字", async ({ dawn }) => {
  const { page } = dawn
  await 开一段临时会话(page)
  await 等进了对话(page)
  await page.keyboard.press(process.platform === "darwin" ? "Meta+k" : "Control+k")
  await page.getByRole("combobox", { name: "搜索命令" }).fill("搜索对话内容")
  await page.keyboard.press("Enter")
  await expect(page.getByRole("button", { name: "按内容", exact: true })).toHaveAttribute("aria-pressed", "true")
  await expect(page.locator(".side-search-field")).toHaveAttribute("placeholder", /跑过的代码/)
  await page.locator(".side-search-field").press("Escape")
  await expect(page.locator(".side-search-field")).toHaveCount(0)
  await page.getByRole("button", { name: "搜索", exact: true }).click()
  await expect(page.getByRole("button", { name: "按名字", exact: true })).toHaveAttribute("aria-pressed", "true")
})

test("**两个字的中文也搜**：搜「回归」命中 agent 那句「我跑一个 Cox 回归。」", async ({ dawn }) => {
  const { page } = dawn
  await 开一段临时会话(page)
  await 等进了对话(page)
  await 说(page, "跑个 Cox 看看")
  await expect(page.locator(".tool")).toHaveCount(1, { timeout: 30_000 })

  await 按内容搜(page, "回归")
  const 处 = page.locator(".cs-hit", { hasText: "agent：" }).first()
  await expect(处.locator("mark.cs-mark").first()).toHaveText("回归")
  // 一个字不搜，而且说出来
  await page.locator(".side-search-field").fill("回")
  await expect(page.locator(".side-empty")).toHaveText("至少两个字")
  await expect(page.locator(".cs-card")).toHaveCount(0)
})

test("**归档了的也搜得到**：卡上标「已归档」，点开 = 取消归档并跳过去", async ({ dawn }) => {
  const { page } = dawn
  await 开一段临时会话(page, "收起来的座头鲸")
  await 开一段临时会话(page, "留着的那段")
  await page.locator(".sess-item").filter({ hasText: "收起来的座头鲸" }).locator(".row-more").click()
  await page.getByRole("menuitem", { name: "收进归档" }).click()
  await expect(page.locator(".side-action").filter({ hasText: "已归档" })).toBeVisible()

  await 按内容搜(page, "座头鲸")
  const 卡 = page.locator(".cs-card").filter({ hasText: "收起来的座头鲸" })
  await expect(卡.locator(".cs-badge")).toHaveText("已归档")
  await expect(卡).toContainText("打开会取消归档")
  await 卡.locator(".cs-hit").first().click()

  await expect(page.locator(".conv-title")).toContainText("收起来的座头鲸", { timeout: 15_000 })
  await expect(page.locator('.turns [data-search-hit="true"]')).toContainText("收起来的座头鲸", { timeout: 15_000 })
  // 放回去了：侧栏「已归档」那一行随之消失（只有它一段）。
  // 按 `.side-action` 找：结果卡的标题行也是按钮、名字里也带「已归档」（那张卡是搜的那一刻的样子）
  await expect(page.locator(".side-action").filter({ hasText: "已归档" })).toHaveCount(0)
  // 按内容时三列让位；关掉搜索框，那一段回到侧栏
  await page.locator(".side-search-field").press("Escape")
  await expect(page.locator(".sess-item").filter({ hasText: "收起来的座头鲸" })).toHaveCount(1)
})

test.describe("别的项目里的那段", () => {
  const 甲 = join(tmpdir(), "dawn-search-proj-甲")
  const 乙 = join(tmpdir(), "dawn-search-proj-乙")
  test.beforeAll(() => {
    for (const d of [甲, 乙]) {
      rmSync(d, { recursive: true, force: true })
      mkdirSync(d, { recursive: true })
    }
  })
  test.afterAll(() => {
    for (const d of [甲, 乙]) rmSync(d, { recursive: true, force: true })
  })

  test("**点到别的项目里的一处**：先切项目、再打开、再跳过去", async ({ dawn }) => {
    const { page } = dawn
    // 走应用自己那条 IPC 造两个项目（与 `project-bulk.spec.ts` 同一条）
    await page.evaluate(
      async (paths) => {
        const w = window as unknown as { dawn: { invoke: (op: string, req: unknown) => Promise<{ data?: unknown }> } }
        const p = (await w.dawn.invoke("getProviders", {})) as { data?: { agents?: { agentId: string }[] } }
        const agentId = p.data?.agents?.[0]?.agentId
        for (const workspace of paths) await w.dawn.invoke("createTask", { agentId, workspace })
      },
      [甲, 乙],
    )
    await page.reload()
    const 项目们 = page.locator(".proj-list .proj-item")
    await expect(项目们).toHaveCount(2, { timeout: 30_000 })

    const 甲项 = 项目们.filter({ hasText: "dawn-search-proj-甲" })
    const 乙项 = 项目们.filter({ hasText: "dawn-search-proj-乙" })
    await 甲项.locator(".row").first().click()
    await 甲项.locator(".proj-session-list .sess-item .row").first().click()
    await 等进了对话(page)
    await 说(page, "甲项目里的虎鲸")

    // 换到乙项目的那段：主区与侧栏都在乙
    await 乙项.locator(".row").first().click()
    await 乙项.locator(".proj-session-list .sess-item .row").first().click()
    await 等进了对话(page)
    await expect(page.locator(".turns").getByText("甲项目里的虎鲸", { exact: true })).toHaveCount(0)

    await 按内容搜(page, "虎鲸")
    const 卡 = page.locator(".cs-card").first()
    await expect(卡.locator(".cs-place")).toContainText("dawn-search-proj-甲")
    await 卡.locator(".cs-hit").first().click()
    await expect(page.locator('.turns [data-search-hit="true"]')).toContainText("甲项目里的虎鲸", { timeout: 15_000 })
    await 在视野里(page, '.turns [data-search-hit="true"]')
  })
})

test("**打字快时只留最后一次的结果**：先搜一个词、紧接着换词，屏上只有后一个词的高亮", async ({ dawn }) => {
  const { page } = dawn
  await 开一段临时会话(page)
  await 等进了对话(page)
  await 说(page, "独角鲸的样本量")

  await page.getByRole("button", { name: "搜索", exact: true }).click()
  await page.getByRole("button", { name: "按内容", exact: true }).click()
  const 搜 = page.locator(".side-search-field")
  // 一个字一个字敲：中间每一步都可能发出一次请求（停顿过了的那几步），迟到的都该丢掉
  await 搜.pressSequentially("独角鲸", { delay: 120 })
  await page.waitForTimeout(300) // 让「独角鲸」那一次真的发出去
  await 搜.fill("")
  await 搜.pressSequentially("链路是通的", { delay: 40 })

  await expect(page.locator(".cs-card").first()).toBeVisible({ timeout: 15_000 })
  const 标 = page.locator(".cs-results mark.cs-mark")
  await expect(标.first()).toHaveText("链路是通的")
  // 稳住之后再看一眼：没有一处高亮的是前一个词（迟到的那次没把结果换回去）
  await page.waitForTimeout(600)
  const 全部 = await 标.allTextContents()
  expect(全部.length).toBeGreaterThan(0)
  // 只比高亮：卡片标题取自第一句（「独角鲸的样本量」），整张卡里出现「独角鲸」是对的
  expect(全部.every((x) => x === "链路是通的")).toBe(true)
})
