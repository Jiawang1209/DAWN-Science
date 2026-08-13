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
  await expect(page.locator(".proj-list .proj-item")).toHaveCount(路径们.length, { timeout: 30_000 })
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

  // ① 入口常驻在「项目」那条分区标题上，且**不叫「多选」**
  const 入口 = page.getByRole("button", { name: "批量", exact: true })
  await expect(入口).toBeVisible()
  await 入口.click()

  // ② 勾一个
  await page.getByRole("checkbox", { name: /选择项目：dawn-proj-bulk-甲/ }).check()
  await expect(page.locator(".side-bulkbar .side-bulk-count")).toHaveText("已选 1")

  // ③ 确认框摆真数字，并把「不会发生什么」说在前面
  await page.locator(".side-bulkbar").getByRole("button", { name: "删除" }).click()
  await expect(page.locator(".confirm")).toContainText("移除这 1 个项目")
  await expect(page.locator(".confirm-safety")).toContainText("文件夹一个都不会被删除")
  await page.locator(".confirm").getByRole("button", { name: /移除 1 个/ }).click()

  // ④ 少了正好一个，且留下的是另一个
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

  await page.getByRole("button", { name: "多选", exact: true }).click()
  await expect(page.locator(".side-bulkbar")).toHaveCount(1)

  await page.getByRole("button", { name: "批量", exact: true }).click()
  // **仍然只有一条**：项目那边开了，会话那边关了
  await expect(page.locator(".side-bulkbar")).toHaveCount(1)
  await expect(page.getByRole("button", { name: "多选", exact: true })).toBeVisible()
  // 而且勾选框只长在项目行上
  await expect(page.getByRole("checkbox", { name: /选择项目/ })).toHaveCount(1)
  await expect(page.getByRole("checkbox", { name: /选择会话/ })).toHaveCount(0)
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

  await page.getByRole("button", { name: "多选", exact: true }).click()
  // 会话那一栏的行确实长出了勾选框——**说明这一轮多选真的开着**
  await expect(page.locator(".session-list .sess-check")).toHaveCount(1)
  await expect(page.locator(".proj-session-list .sess-check")).toHaveCount(0)
})

/**
 * **路径在名字下面另起一行**（作者：*「现在展示的不好看」*）。
 *
 * 判据是两个盒子的顶边不同——同一行的话它们的 y 相等。
 * 会话行仍然是单行（实测 WorkBuddy 是 `240×31`），所以那一列不能跟着变。
 */
test("**项目行两行：名字在上，路径在下**", async ({ dawn }) => {
  const { page } = dawn
  await 造项目(page, [甲])

  const 名 = page.locator(".proj-list .sess > .name").first()
  const 路径 = page.locator(".proj-list .sess > .sub").first()
  await expect(路径).toBeVisible()

  const a = (await 名.boundingBox())!
  const b = (await 路径.boundingBox())!
  // 路径整个落在名字下面，没有任何重叠
  expect(b.y).toBeGreaterThanOrEqual(a.y + a.height - 1)
  // 而且它们左缘齐平——错开一两像素在一列里一眼就看得出来
  expect(Math.round(b.x)).toBe(Math.round(a.x))
})

/**
 * **别的项目里的会话，也点得进去**（2026-08-13，作者报的：
 * *「为什么有的会话，可以点击进去，有的会话不能点击进去呢？」*）。
 *
 * 不是随机的：`sessions` 里**只有当前打开那个项目的会话**，
 * 而 `onPickTask` 上一版只从会话摘要取 projectId——别的项目里的那些
 * 摘要根本不在手上，于是项目不切、`session` 查不到、主区回落成初始画面。
 * **看起来就是「点了没反应」。**
 *
 * 判据挑的是 `.conv-title`：它只有对话那一屏有。
 * 挑输入框不行——初始画面也有一模一样的占位符（本项目 2026-08-12 栽过）。
 */
test("**点开另一个项目里的会话，真的进得去**", async ({ dawn }) => {
  const { page } = dawn
  await 造项目(page, [甲, 乙])

  // 展开第一个项目，进它底下那一段——这一步把「当前项目」钉在甲上
  const 甲行 = page.locator(".proj-list .proj-item").first()
  await 甲行.locator(".row").first().click()
  await 甲行.locator(".proj-session-list .sess-item .row").first().click()
  await expect(page.locator(".conv-title")).toBeVisible({ timeout: 30_000 })

  // 现在去点**另一个项目**里的那一段
  const 乙行 = page.locator(".proj-list .proj-item").nth(1)
  await 乙行.locator(".row").first().click()
  await 乙行.locator(".proj-session-list .sess-item .row").first().click()

  // **进得去**，而不是回落到初始画面
  await expect(page.locator(".conv-title")).toBeVisible({ timeout: 30_000 })
  await expect(page.locator(".welcome-title")).toHaveCount(0)
})
