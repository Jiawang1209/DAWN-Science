/**
 * 回退这一轮（2026-09-27，spec `2026-09-27-回退这一轮-design.md` §6）。**跑真实构建产物。**
 *
 * 假模型走 mock 的「改两个文件」分支（`dev:mock` 里人点的也是它）：带这四个字的一句 → 一条 bash
 * `mkdir -p out && printf 'x\n' >> out/图.txt && printf '改过\n' >> README.md`。夹具的工作区自带 `README.md`（「# e2e 工作区」）。
 * 第一条用例把 `out/` 写进 `.gitignore` 并 git init——**git 看不见的文件也要退得回去**，那是这个功能存在的理由之一。
 *
 * 等「整轮说完」挑只有那一刻才有的东西：假模型的暗号 `假模型已应答` 出现第 N 次。
 * 判「文件真的退了」直接读夹具工作区里的文件，不信界面上那句通知。
 *
 * ## 两处长得一样
 *
 * 主区与坞里是同一个 `ConversationView`：每一处都先圈定范围——主区 `main.main`、坞里 `aside.right-dock`。
 * 「改两个文件」是「再改两个文件」的子串，按 hasText 找那句时要么 `.first()`、要么用只有一句的场面。
 */
import type { Locator, Page } from "@playwright/test"
import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { test, expect, CANNED_REPLY, 在项目里开会话, 等进了对话, 进坞 } from "./fixtures.js"

const 原样 = "# e2e 工作区\n"
const 主区 = (page: Page) => page.locator("main.main")
const 坞 = (page: Page) => page.locator("aside.right-dock")
const 框 = (区: Locator) => 区.getByPlaceholder(/今天帮你做些什么/)

async function 开会话(page: Page) {
  await 在项目里开会话(page)
  await 等进了对话(page)
}

/** 在这一处说一句，等假模型第 N 次说完（「改两个文件」那轮：先说一句、跑 bash、拿到结果之后才吐暗号） */
async function 说(区: Locator, 话: string, 第几次应答: number) {
  await 框(区).fill(话)
  await 框(区).press("Enter")
  await expect(区.getByText(CANNED_REPLY)).toHaveCount(第几次应答, { timeout: 30_000 })
}
const 这句的回退 = (区: Locator, 话: string) =>
  区.locator(".turn.user", { hasText: 话 }).getByRole("button", { name: "回到这句之前", exact: true })
/** 回退确认框：页面上别的 dialog（命令面板）关着，但仍按标题圈定，不靠「只有一个」 */
const 对话框 = (page: Page) => page.getByRole("dialog").filter({ hasText: /回到「.*」之前？/ })

test.describe("git 仓库、out/ 被忽略", () => {
  test.use({ dawnOptions: { gitInit: true } })

  test("两句之后回到第二句之前：文件与对话一起退，那句回到输入框，out/ 里的也退了", async ({ dawn }) => {
    const { page, workspace } = dawn
    writeFileSync(join(workspace, ".gitignore"), "out/\n")
    await 开会话(page)
    await 说(主区(page), "改两个文件", 1)
    await 说(主区(page), "再改两个文件", 2)
    expect(readFileSync(join(workspace, "out/图.txt"), "utf8")).toBe("x\nx\n")
    expect(readFileSync(join(workspace, "README.md"), "utf8")).toBe(`${原样}改过\n改过\n`)

    await 这句的回退(主区(page), "再改两个文件").click()
    await expect(对话框(page)).toContainText("回到「再改两个文件」之前？")
    await expect(对话框(page)).toContainText("README.md")
    await expect(对话框(page)).toContainText("out/图.txt")
    await 对话框(page).getByRole("button", { name: "文件和对话一起回退", exact: true }).click()

    await expect(主区(page).getByText(/已回到「再改两个文件」之前/)).toBeVisible({ timeout: 10_000 })
    /** 盘上真的退了：读工作区，不信通知 */
    expect(readFileSync(join(workspace, "out/图.txt"), "utf8")).toBe("x\n")
    expect(readFileSync(join(workspace, "README.md"), "utf8")).toBe(`${原样}改过\n`)
    /** 对话撤掉了：那句与它之后的回话都不在转录里，第一句还在 */
    await expect(主区(page).locator(".turn.user", { hasText: "再改两个文件" })).toHaveCount(0)
    await expect(主区(page).locator(".turn.user")).toHaveCount(1)
    await expect(主区(page).getByText(CANNED_REPLY)).toHaveCount(1)
    await expect(框(主区(page))).toHaveValue("再改两个文件")
  })
})

test.describe("非 git 工作区", () => {
  test("只回退文件：回到第一句之前——新建的挪进 .dawn/trash，对话两句都在", async ({ dawn }) => {
    const { page, workspace } = dawn
    await 开会话(page)
    await 说(主区(page), "改两个文件", 1)
    await 说(主区(page), "再改两个文件", 2)
    // 「改两个文件」是「再改两个文件」的子串：第一句在前
    await 这句的回退(主区(page), "改两个文件").first().click()
    await expect(对话框(page)).toContainText("回到「改两个文件」之前？")
    await 对话框(page).getByRole("button", { name: "只回退文件", exact: true }).click()
    await expect(主区(page).getByText(/已回到「改两个文件」之前/)).toBeVisible({ timeout: 10_000 })
    expect(readFileSync(join(workspace, "README.md"), "utf8")).toBe(原样)
    expect(existsSync(join(workspace, "out/图.txt"))).toBe(false)
    expect(readdirSync(join(workspace, ".dawn/trash")).some((d) => d.startsWith("rewind-"))).toBe(true)
    await expect(主区(page).locator(".turn.user")).toHaveCount(2)
    /** 只回退文件：输入框不动 */
    await expect(框(主区(page))).toHaveValue("")
  })

  test("你后来改过的不动：确认框列在「不动」，回退之后还是你改的样子", async ({ dawn }) => {
    const { page, workspace } = dawn
    await 开会话(page)
    await 说(主区(page), "改两个文件", 1)
    writeFileSync(join(workspace, "README.md"), "我自己改的\n")
    await 这句的回退(主区(page), "改两个文件").click()
    await expect(对话框(page)).toContainText("你后来改过")
    await 对话框(page).getByRole("button", { name: "只回退文件", exact: true }).click()
    await expect(主区(page).getByText(/README\.md 你后来改过，没动/)).toBeVisible({ timeout: 10_000 })
    expect(readFileSync(join(workspace, "README.md"), "utf8")).toBe("我自己改的\n")
    expect(existsSync(join(workspace, "out/图.txt"))).toBe(false)
  })

  test("按钮常驻、带字：不悬停 opacity 也是 1", async ({ dawn }) => {
    const { page } = dawn
    await 开会话(page)
    await 说(主区(page), "你好", 1)
    // 鼠标挪到别处：量的是「没悬停」时的样子
    await page.mouse.move(0, 0)
    const 钮 = 这句的回退(主区(page), "你好")
    await expect(钮).toBeVisible()
    await expect(钮).toBeEnabled()
    await expect(钮).toHaveText("回到这句之前")
    expect(await 钮.evaluate((el) => getComputedStyle(el).opacity)).toBe("1")
  })

  test("在跑时灰着，理由读得到；停下之后能点", async ({ dawn }) => {
    const { page } = dawn
    await 开会话(page)
    await 框(主区(page)).fill("慢慢跑")
    await 框(主区(page)).press("Enter")
    await expect(主区(page).locator(".turns")).toContainText("我先跑一段慢的。", { timeout: 30_000 })
    await expect(主区(page).locator(".tool").first()).toHaveAttribute("data-status", "running", { timeout: 30_000 })
    const 钮 = 这句的回退(主区(page), "慢慢跑")
    await expect(钮).toBeDisabled()
    /** 灰着也不藏：看得见，opacity 不是 0 */
    await expect(钮).toBeVisible()
    await expect(钮).toHaveAttribute("aria-description", "agent 还在跑，停下之后才能回退")
    await 主区(page).getByRole("button", { name: "停止", exact: true }).click()
    await expect(主区(page).getByRole("button", { name: "停止", exact: true })).toHaveCount(0, { timeout: 10_000 })
    await expect(钮).toBeEnabled({ timeout: 10_000 })
  })

  test("命令面板「回到上一句之前」：与点按钮落到同一处——确认框、文件退回、那句回到输入框", async ({ dawn }) => {
    const { page, workspace } = dawn
    await 开会话(page)
    await 说(主区(page), "改两个文件", 1)
    expect(existsSync(join(workspace, "out/图.txt"))).toBe(true)
    await page.keyboard.press("ControlOrMeta+k")
    const 面板 = page.getByRole("dialog", { name: "命令面板" })
    await expect(面板).toBeVisible()
    await page.getByRole("combobox", { name: "搜索命令" }).fill("回到上一句之前")
    await page.keyboard.press("Enter")
    await expect(对话框(page)).toContainText("回到「改两个文件」之前？")
    await 对话框(page).getByRole("button", { name: "文件和对话一起回退", exact: true }).click()
    await expect(主区(page).getByText(/已回到「改两个文件」之前/)).toBeVisible({ timeout: 10_000 })
    expect(readFileSync(join(workspace, "README.md"), "utf8")).toBe(原样)
    expect(existsSync(join(workspace, "out/图.txt"))).toBe(false)
    await expect(主区(page).locator(".turn.user")).toHaveCount(0)
    await expect(框(主区(page))).toHaveValue("改两个文件")
  })

  /**
   * 坞里那段（侧边对话）也能回退：按 `sessionId` 绑，原文回到**坞里**的输入框，主区不受影响。
   * 按钮在窄处撑不撑破归 `composer-history-copy.spec.ts`，这里不重复。
   */
  test("坞里那段：一起回退之后文件回来、那句回到坞里的输入框", async ({ dawn }) => {
    const { page, workspace } = dawn
    await 开会话(page)
    await 进坞(page, "对话")
    await 坞(page).getByRole("button", { name: "另开一段", exact: true }).click()
    await 坞(page).locator(".side-chat-head").waitFor({ timeout: 30_000 })
    await 说(坞(page), "改两个文件", 1)
    expect(readFileSync(join(workspace, "README.md"), "utf8")).toBe(`${原样}改过\n`)

    await 这句的回退(坞(page), "改两个文件").click()
    await expect(对话框(page)).toContainText("回到「改两个文件」之前？")
    await 对话框(page).getByRole("button", { name: "文件和对话一起回退", exact: true }).click()
    await expect(坞(page).getByText(/已回到「改两个文件」之前/)).toBeVisible({ timeout: 10_000 })
    expect(readFileSync(join(workspace, "README.md"), "utf8")).toBe(原样)
    expect(existsSync(join(workspace, "out/图.txt"))).toBe(false)
    await expect(坞(page).locator(".turn.user")).toHaveCount(0)
    await expect(框(坞(page))).toHaveValue("改两个文件")
    await expect(框(主区(page))).toHaveValue("")
  })
})
