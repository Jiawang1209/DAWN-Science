/**
 * 调整方向（2026-09-25，学自 Codex；spec `2026-09-25-调整方向-design.md` §5）。**跑真实构建产物。**
 *
 * 假模型走 mock 的「慢慢跑」分支（`dev:mock` 里人按的也是它）：带这三个字的一句 → 先说「我先跑一段慢的。」
 * 再调一条 `sleep 20` 的 bash。**20 秒远长于下面每一个断言窗口（10 秒）**——「那一步已中断」在 10 秒内出现，
 * 就只可能是被停下的，不是自己跑完的（`waiting.spec.ts` 里变异测试逼出来的那条纪律）。
 *
 * ## 两处长得一样
 *
 * 主区与坞里是同一个 `ConversationView`：每一处都先圈定范围——主区 `main.main`、坞里 `aside.right-dock`。
 *
 * ## 不把 `sleep 20` 留在身后
 *
 * 用例结束时还有「慢慢跑」在跑的（调整方向的那句自己也带「慢慢跑」、到坞里问时主区那一步），**收尾时按「停止」并等它停稳**：
 * 不停的话那条 bash 会一直跑满 20 秒，关应用时还挂着一个子进程（Task 6 审查点过）。
 */
import type { Locator, Page } from "@playwright/test"
import { existsSync, readFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { test, expect, CANNED_REPLY, 开一段临时会话, 在项目里开会话, 等进了对话, 进坞, 进设置 } from "./fixtures.js"

const 主区 = (page: Page) => page.locator("main.main")
const 坞 = (page: Page) => page.locator("aside.right-dock")
const 框 = (区: Locator) => 区.getByPlaceholder(/今天帮你做些什么/)
const 待发条 = (区: Locator) => 区.locator(".queued-strip")
const 一条 = (区: Locator, 话: string) => 待发条(区).locator(".queued-one").filter({ hasText: 话 })

async function 说(区: Locator, 话: string, 键 = "Enter") {
  await 框(区).fill(话)
  await 框(区).press(键)
}

/** 说「慢慢跑一下」，等假模型开口、那条 sleep 20 真在跑 */
async function 忙起来(区: Locator) {
  await 说(区, "慢慢跑一下")
  await expect(区.locator(".turns")).toContainText("我先跑一段慢的。", { timeout: 30_000 })
  await expect(区.locator(".tool").first()).toHaveAttribute("data-status", "running", { timeout: 30_000 })
}

/** 收尾：按这一处的「停止」，等那一步标已中断、这一处回到能发送（框里可能有退回来的字，所以等的是「停止」不见了） */
async function 停下(区: Locator) {
  await 区.getByRole("button", { name: "停止", exact: true }).click()
  await expect(区.getByRole("button", { name: "停止", exact: true })).toHaveCount(0, { timeout: 10_000 })
  await expect(区.locator(".tool[data-status='running']")).toHaveCount(0)
}

test.describe("调整方向 · 假模型", () => {
  test("**待发条上点「调整方向」**：那一步已中断、那句进转录、新的一轮开始、其余那条仍排队中", async ({ dawn }) => {
    const { page } = dawn
    await 开一段临时会话(page)
    await 忙起来(主区(page))
    await 说(主区(page), "别打了，改成只打偶数，慢慢跑")
    await 说(主区(page), "顺便画个图")
    await expect(待发条(主区(page)).locator(".queued-one")).toHaveCount(2)

    await 一条(主区(page), "改成只打偶数").getByRole("button", { name: "调整方向", exact: true }).click()

    const 第一步 = 主区(page).locator(".tool").first()
    await expect(第一步).toHaveAttribute("data-interrupted", "true", { timeout: 10_000 })
    await expect(第一步.locator(".tool-status")).toHaveText("已中断")
    const 用户话 = 主区(page).locator(".turn.user")
    await expect(用户话).toHaveCount(2)
    await expect(用户话.nth(1)).toContainText("改成只打偶数")
    /** 新的一轮开始了：假模型又开口、又跑一段（第二条工具行在跑） */
    await expect(主区(page).locator(".tool")).toHaveCount(2, { timeout: 10_000 })
    await expect(主区(page).locator(".tool").nth(1)).toHaveAttribute("data-status", "running")
    /** 其余那条不动：仍排着，没有退回输入框（与「停止」不同） */
    await expect(待发条(主区(page)).locator(".queued-one")).toHaveCount(1)
    await expect(一条(主区(page), "顺便画个图")).toContainText("排队中")
    await expect(框(主区(page))).toHaveValue("")
    /** 新的一轮那句也带「慢慢跑」，第二条 sleep 20 还在跑：停掉；排着的那条按停止的规矩回到输入框 */
    await 停下(主区(page))
    await expect(框(主区(page))).toHaveValue("顺便画个图")
  })

  test("**忙着时 Cmd/Ctrl+回车 = 直接调整方向**：不上待发条，那一步已中断，这句开新一轮", async ({ dawn }) => {
    const { page } = dawn
    await 开一段临时会话(page)
    await 忙起来(主区(page))
    await 说(主区(page), "直接换个做法", "ControlOrMeta+Enter")

    await expect(主区(page).locator(".tool").first()).toHaveAttribute("data-interrupted", "true", { timeout: 10_000 })
    await expect(主区(page).locator(".turn.user").nth(1)).toContainText("直接换个做法")
    await expect(主区(page).locator(".turns")).toContainText(CANNED_REPLY, { timeout: 10_000 })
    await expect(待发条(主区(page))).toHaveCount(0)
  })

  test("**到坞里问**：坞打开到「对话」、新那段第一句是这句；主区标题不变、待发单少一条、仍在跑", async ({ dawn }) => {
    const { page } = dawn
    await 在项目里开会话(page)
    await 忙起来(主区(page))
    const 标题 = await 主区(page).locator(".conv-title").innerText()
    await 说(主区(page), "旁边问一句：这个目录多大")
    await 一条(主区(page), "旁边问一句").getByRole("button", { name: "到坞里问", exact: true }).click()

    await 坞(page).locator(".side-chat-head").waitFor({ timeout: 30_000 })
    await expect(坞(page).locator(".turn.user").first()).toContainText("旁边问一句：这个目录多大", { timeout: 30_000 })
    await expect(坞(page).locator(".turns")).toContainText(CANNED_REPLY, { timeout: 30_000 })
    await expect(待发条(主区(page))).toHaveCount(0)
    await expect(主区(page).locator(".conv-title")).toHaveText(标题)
    await expect(主区(page).locator(".turns")).not.toContainText("旁边问一句")
    await expect(主区(page).getByRole("button", { name: "停止", exact: true })).toBeVisible()
    await 停下(主区(page))
  })

  test("三颗按钮常驻看得见（opacity 1）；坞里那段的待发条没有「到坞里问」；旧的「插队」不见了", async ({ dawn }) => {
    const { page } = dawn
    await 在项目里开会话(page)
    await 忙起来(主区(page))
    await 框(主区(page)).fill("打了字")
    await expect(主区(page).getByText("回车排到这一轮后面 · Cmd/Ctrl+回车调整方向")).toBeVisible()
    await 框(主区(page)).press("Enter")
    for (const 名 of ["调整方向", "到坞里问", "取回"]) {
      const 键 = 待发条(主区(page)).getByRole("button", { name: 名, exact: true })
      await expect(键).toBeVisible()
      expect(await 键.evaluate((el) => getComputedStyle(el).opacity)).toBe("1")
    }
    await expect(待发条(主区(page))).not.toContainText("插队")

    await 进坞(page, "对话")
    await 坞(page).getByRole("button", { name: "另开一段", exact: true }).click()
    await 坞(page).locator(".side-chat-head").waitFor({ timeout: 30_000 })
    await 框(坞(page)).waitFor({ timeout: 30_000 })
    await 忙起来(坞(page))
    await 说(坞(page), "坞里排一句")
    await expect(待发条(坞(page))).toContainText("坞里排一句")
    await expect(待发条(坞(page)).getByRole("button", { name: "调整方向", exact: true })).toBeVisible()
    await expect(待发条(坞(page)).getByRole("button", { name: "取回", exact: true })).toBeVisible()
    await expect(待发条(坞(page)).getByRole("button", { name: "到坞里问", exact: true })).toHaveCount(0)
    await 停下(坞(page))
    await 停下(主区(page))
  })
})

/**
 * **停止真停内核**（spec §4.1 的 bug）。要一台真内核（`dawn-spike` kernelspec），拿不到就跳过并说清为什么——
 * 与 `notebook.spec.ts` 同一个把关。describe 名字里不含「内核会话」「解释器路径」（`test:e2e:only` 用它们排除机器相关的 spec）。
 */
const KERNEL = "dawn-spike"
const KERNEL_JSON = join(homedir(), "Library", "Jupyter", "kernels", KERNEL, "kernel.json")
const 有 = existsSync(KERNEL_JSON)
function 解释器路径(): string {
  const spec = JSON.parse(readFileSync(KERNEL_JSON, "utf8")) as { argv?: string[] }
  const p = spec.argv?.[0]
  if (!p) throw new Error(`${KERNEL_JSON} 里没有 argv[0]`)
  return p
}

test.describe("停止 · 真内核", () => {
  test.use({
    dawnOptions: {
      realKernels: true,
      toolCall: {
        toolName: "run_code",
        args: { language: "python", code: 'import time\nprint("开始了", flush=True)\ntime.sleep(30)' },
        say: "我跑一段。",
      },
    },
  })
  test.skip(!有, `本机没有 ${KERNEL} kernelspec`)

  test("**按停止时内核真的停了**：run_code 在跑 sleep(30)，停止后 10 秒内内核回到空闲、那格标已中断", async ({ dawn }) => {
    const { page } = dawn
    const PY = 解释器路径()
    await 进设置(page, "内核")
    const 解释器框 = page.getByRole("textbox", { name: "Python 解释器" })
    await 解释器框.fill(PY)
    await page.getByRole("button", { name: "保存" }).first().click()
    await expect(解释器框).toHaveValue(PY)

    await page.getByRole("button", { name: "新建任务" }).click()
    await 开一段临时会话(page)
    await 等进了对话(page)
    await 说(主区(page), "跑一段")

    await 进坞(page, "笔记本")
    const 胶囊 = page.locator(".nb-pill")
    await expect(胶囊).toContainText("运行中", { timeout: 90_000 })
    await expect(page.locator(".nb-cell").first().locator(".kout-text")).toContainText("开始了", { timeout: 60_000 })

    await 主区(page).getByRole("button", { name: "停止", exact: true }).click()
    /** 修之前：pi 等着工具返回、工具等着内核跑完——胶囊要「运行中」整整 30 秒，停止键按下去这一轮也停不下来 */
    await expect(胶囊).toContainText("空闲", { timeout: 10_000 })
    await expect(page.locator(".nb-cell").first()).toContainText("（已中断）")
    await expect(主区(page).locator(".tool").first().locator(".tool-status")).toHaveText("已中断")
    await expect(主区(page).getByRole("button", { name: "发送", exact: true })).toBeVisible()
  })
})
