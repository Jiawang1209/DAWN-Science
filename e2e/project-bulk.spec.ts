/**
 * 项目那一列的批量删除，以及项目行的两行排布（2026-08-13）。
 * **跑真实构建产物。**
 *
 * 作者：*「项目里面没有批量删除项目的选项，可以模仿一下会话的批量管理」*、
 * *「项目里面，路径可以在项目名称换行展示，现在展示的不好看」*。
 *
 * ## 「模仿会话的批量管理」不等于「照抄一份」
 *
 * 两列共用**同一个选择模式**（`views.tsx` 里那个 `多选中`）。
 * 各记各的集合会让两条批量条同时在屏上，那时「全选」「删除」各有两颗——
 * 而按名字找东西是子串匹配，读屏、Playwright、人脑都一样。
 * 所以这里有一条专门盯它：**进项目多选，会话那边就得退出去。**
 */
import type { Page } from "@playwright/test"
import { test, expect } from "./fixtures.js"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { mkdirSync, rmSync } from "node:fs"

const 甲 = join(tmpdir(), "dawn-proj-bulk-甲")
const 乙 = join(tmpdir(), "dawn-proj-bulk-乙")

test.beforeAll(() => {
  for (const d of [甲, 乙]) {
    rmSync(d, { recursive: true, force: true })
    mkdirSync(d, { recursive: true })
  }
})
test.afterAll(() => {
  for (const d of [甲, 乙]) rmSync(d, { recursive: true, force: true })
})

/**
 * 造几个带路径的任务。**走应用自己那条 IPC**，与 `fixtures.ts` 里
 * `在项目里开会话` 同一条——不另开后门，后门验过的东西不等于真实那条路验过。
 */
async function 造项目(page: Page, 路径们: string[]): Promise<void> {
  await page.evaluate(async (paths) => {
    const w = window as unknown as {
      dawn: { invoke: (op: string, req: unknown) => Promise<{ data?: unknown }> }
    }
    const p = (await w.dawn.invoke("getProviders", {})) as {
      data?: { agents?: { agentId: string }[] }
    }
    const agentId = p.data?.agents?.[0]?.agentId
    for (const workspace of paths) await w.dawn.invoke("createTask", { agentId, workspace })
  }, 路径们)
  await page.reload()
  await expect(page.locator(".proj-list .proj-item")).toHaveCount(new Set(路径们).size, { timeout: 30_000 })
}

/** 造一段**没有路径**的对话，好让「会话」那一栏也在场 */
async function 造散会话(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const w = window as unknown as {
      dawn: { invoke: (op: string, req: unknown) => Promise<{ data?: unknown }> }
    }
    const p = (await w.dawn.invoke("getProviders", {})) as {
      data?: { agents?: { agentId: string }[] }
    }
    await w.dawn.invoke("createTask", { agentId: p.data?.agents?.[0]?.agentId })
  })
  await page.reload()
  await expect(page.locator(".session-list .sess-item")).toHaveCount(1, { timeout: 30_000 })
}

test("**选一个，删一个，另一个还在**", async ({ dawn }) => {
  const { page } = dawn
  await 造项目(page, [甲, 乙])

  /**
   * ① 入口常驻在「项目」那条分区标题上。
   *
   * **屏幕上写的是「多选」，与会话那颗一模一样**（作者定的：
   * *「项目里面应该不是批量，应该和会话一样，应该是多选」*）——
   * 两处是同一件事，就该同一个名字。
   *
   * 所以这里按 `aria-label` 找：那才是「机器与读屏用的名字」，
   * 拿人看的字去区分两个元素，是把代价付错了地方。
   */
  const 入口 = page.getByRole("button", { name: "多选项目", exact: true })
  await expect(入口).toHaveText("多选")
  await expect(入口).toBeVisible()
  await 入口.click()

  // ② 勾一个
  await page.getByRole("checkbox", { name: /选择项目：dawn-proj-bulk-甲/ }).check()
  await expect(page.locator(".side-bulkbar .side-bulk-count")).toHaveText("已选 1")

  // ③ 确认框摆真数字。**删的是会话，不是项目**（2026-08-23 作者定的：与服务器收纳同一套——机器那列删会话不动机器）
  await page.locator(".side-bulkbar").getByRole("button", { name: "删除" }).click()
  await expect(page.locator(".confirm")).toContainText("删除这 1 段对话")
  await page.locator(".confirm").getByRole("button", { name: /删除 1 段/ }).click()

  // ④ 甲名下没有会话了，收纳里自然少一条（收纳按会话分组），留下的是另一个
  await expect(page.locator(".proj-list .proj-item")).toHaveCount(1, { timeout: 30_000 })
  await expect(page.locator(".proj-list .sess .name")).toContainText("dawn-proj-bulk-乙")

  // ⑤ 删完自动收摊
  await expect(page.locator(".side-bulkbar")).toHaveCount(0)
})

/**
 * **两列的选择模式不许同时开着。**
 *
 * 同时开着的话，屏幕上有两颗「全选」、两颗「删除」——
 * CLAUDE.md：*「两处长得一样的东西，等于没有判据。」*
 */
test("**进项目多选，会话那边就退出去**", async ({ dawn }) => {
  const { page } = dawn
  await 造项目(page, [甲])
  await 造散会话(page)

  await page.getByRole("button", { name: "多选会话", exact: true }).click()
  await expect(page.locator(".side-bulkbar")).toHaveCount(1)

  await page.getByRole("button", { name: "多选项目", exact: true }).click()
  // **仍然只有一条**：项目那边开了，会话那边关了
  await expect(page.locator(".side-bulkbar")).toHaveCount(1)
  await expect(page.getByRole("button", { name: "多选会话", exact: true })).toBeVisible()
  // 而且勾选框只长在项目那一列：项目头一颗；散的那一段一颗都不长
  await expect(page.getByRole("checkbox", { name: /选择项目/ })).toHaveCount(1)
  await expect(page.locator(".session-list .sess-check")).toHaveCount(0)
})

/**
 * **项目里的会话能逐段勾**（2026-08-21，作者报的：*「项目里面的会话，没有办法多选」*）。
 *
 * 此前项目那一列的多选只认「整个项目」：集合里装的是路径，底下的会话行不长勾选框。
 * 现在集合里装的是会话：项目头那颗是「它名下全部」（勾了一部分就半勾），
 * 全选了的项目整个移除，只选了几段的只删那几段、项目留着。
 */
test("**一个项目三段会话，勾两段删两段，项目还在**", async ({ dawn }) => {
  const { page } = dawn
  await 造项目(page, [甲, 甲, 甲])
  // 三段同路径合成一个项目
  await expect(page.locator(".proj-list .proj-item")).toHaveCount(1)
  await page.locator(".proj-list .proj-item .row").first().click()
  await expect(page.locator(".proj-session-list .sess-item")).toHaveCount(3)

  await page.getByRole("button", { name: "多选项目", exact: true }).click()
  const 行勾 = page.locator(".proj-session-list .sess-check")
  await expect(行勾, "项目底下的会话行没长出勾选框").toHaveCount(3)
  await 行勾.nth(0).check()
  await 行勾.nth(1).check()
  await expect(page.locator(".side-bulkbar .side-bulk-count")).toHaveText("已选 2")
  // 项目头那颗半勾：勾了一部分，既不是全选也不是没选
  const 头勾 = page.getByRole("checkbox", { name: /选择项目：dawn-proj-bulk-甲/ })
  expect(await 头勾.evaluate((el) => (el as HTMLInputElement).indeterminate)).toBe(true)

  await page.locator(".side-bulkbar").getByRole("button", { name: "删除" }).click()
  // 确认框说的是「删对话」，不是「移除项目」——按实际发生的事起标题
  await expect(page.locator(".confirm")).toContainText("删除这 2 段对话")
  // 2026-08-23 起与服务器收纳共用同一个「删 N 段对话」确认框
  await page.locator(".confirm").getByRole("button", { name: /删除 2 段/ }).click()

  await expect(page.locator(".proj-list .proj-item")).toHaveCount(1, { timeout: 30_000 })
  // 项目还展开着（删之前人点开的），底下剩一段
  await expect(page.locator(".proj-session-list .sess-item")).toHaveCount(1)
  await expect(page.locator(".side-bulkbar")).toHaveCount(0)
})

test("**项目头那颗勾选框 = 它名下全部**，删的仍是会话；多选时点项目那一行只展开收起", async ({ dawn }) => {
  const { page } = dawn
  await 造项目(page, [甲, 甲, 乙])
  await page.getByRole("button", { name: "多选项目", exact: true }).click()
  // 与机器那一行同一套：多选时点行不选组，只展开/收起
  const 甲行 = page.locator(".proj-list .proj-item").filter({ hasText: "dawn-proj-bulk-甲" }).locator(".row").first()
  await 甲行.click()
  await expect(page.locator(".side-bulkbar .side-bulk-count")).toHaveText("已选 0")
  await expect(page.locator(".proj-session-list .sess-item")).toHaveCount(2)
  await 甲行.click()
  await page.getByRole("checkbox", { name: /选择项目：dawn-proj-bulk-甲/ }).check()
  await expect(page.locator(".side-bulkbar .side-bulk-count")).toHaveText("已选 2")
  await page.locator(".side-bulkbar").getByRole("button", { name: "删除" }).click()
  await expect(page.locator(".confirm")).toContainText("删除这 2 段对话")
  await page.locator(".confirm").getByRole("button", { name: /删除 2 段/ }).click()
  await expect(page.locator(".proj-list .proj-item")).toHaveCount(1, { timeout: 30_000 })
  await expect(page.locator(".proj-list .sess .name")).toContainText("dawn-proj-bulk-乙")
})

/**
 * **项目底下那些会话行，在会话多选时不长勾选框。**
 *
 * 它们此前长——勾得上，按下删除却删不掉：`可批量的` 只有「会话」栏里那些，
 * 删除那一步 `filter` 一过就把它们悄悄丢了。
 * **能勾、勾得上、按下、然后它还在**，这就是静默截断（规格 7.5）。
 */
test("**项目底下的会话行不参与「会话」多选**", async ({ dawn }) => {
  const { page } = dawn
  await 造项目(page, [甲])
  /**
   * **还得有一段散的**：「会话」那一栏一条都没有时整块不出现，
   * 连同那颗「多选」——第一版忘了这件事，用例卡在等一颗不存在的按钮上，
   * 报错长得跟「按钮坏了」一模一样。
   */
  await 造散会话(page)

  // 展开那个项目，让它底下那一行露出来
  await page.locator(".proj-list .proj-item .row").first().click()
  await expect(page.locator(".proj-session-list .sess-item")).toHaveCount(1)

  await page.getByRole("button", { name: "多选会话", exact: true }).click()
  // 会话那一栏的行确实长出了勾选框——**说明这一轮多选真的开着**
  await expect(page.locator(".session-list .sess-check")).toHaveCount(1)
  await expect(page.locator(".proj-session-list .sess-check")).toHaveCount(0)
})

/**
 * **项目行只留名字，路径与对话数在悬停卡上**（2026-08-21，作者给了 Codex 那张图：
 * *「他其实只展示了 title，然后剩余的细节都放入到了鼠标的滑动边框里面」*）。
 *
 * 08-13 那版把全路径常驻第二行（*「同名文件夹到处都是」*）。那个理由没变，
 * 答案换了地方：悬停就看得到，不再占一行。
 */
test("**项目行一行：名字在行上，路径与对话数在悬停卡上**", async ({ dawn }) => {
  const { page } = dawn
  await 造项目(page, [甲])

  const 行 = page.locator(".proj-list .proj-item .row").first()
  await expect(行.locator(".sess > .sub")).toHaveCount(0)
  // 单行：行高不超过会话行那种单行的高度（实测 WorkBuddy 是 31）
  const 高 = (await 行.boundingBox())!.height
  expect(高).toBeLessThan(40)

  await 行.hover()
  const 卡 = page.locator(".sess-hover-card")
  await expect(卡).toHaveCount(1, { timeout: 3_000 })
  await expect(卡.locator(".sess-hover-title")).toHaveText("dawn-proj-bulk-甲")
  // 细节行：文件夹图标 + 全路径；对话图标 + 对话数
  await expect(卡.locator(".sess-hover-details li").nth(0)).toContainText("dawn-proj-bulk-甲")
  await expect(卡.locator(".sess-hover-details li").nth(0).locator("svg")).toBeVisible()
  await expect(卡.locator(".sess-hover-details li").nth(1)).toContainText("1 段对话")
})
