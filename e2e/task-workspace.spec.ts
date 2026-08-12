/**
 * 在对话里设工作目录（T3-b）。**跑真实构建产物。**
 *
 * 作者：*「我们可以在任务的对话框里面，设置工作路径。然后，如果在任务里面
 * 不设置任何工作目录的话，那么其实就是我们的普通对话。」*
 * 归类那条：*「选择文件夹之后，就属于是一个项目管理，那么就会归类到
 * 左边侧边栏的项目里面。」*
 *
 * ## 为什么这条非得在真实产物上跑
 *
 * 「设了工作目录」这件事有**三层**，而单元测试只够得着前两层：
 *
 *   1. 任务上记了一个字段
 *   2. 侧栏从「会话」栏挪到「项目」栏
 *   3. **agent 的手真的伸到那个目录里去了**
 *
 * 第三层才是要害。本地工具的 cwd 是建会话那一刻焊死的
 * （`createBashToolDefinition(cwd, …)` 收字符串，不是 getter），
 * 所以只改字段的话前两层全绿、第三层是错的——
 * **界面说在 A、实际在 B，然后有人说一句「把这里的文件都删了」。**
 *
 * 所以这里让 agent 真的往 cwd 里写一个文件，再去磁盘上看它落在哪。
 */
import { existsSync, mkdirSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test, expect, 开一段临时会话 } from "./fixtures.js"

/**
 * **路径要在夹具起来之前就定下来**：它得通过环境变量喂给主进程
 * （原生目录选择器是系统模态框，Playwright 驱动不了）。
 * 所以不能用 `mkdtempSync` 现造一个——那时进程已经起来了。
 */
/**
 * **两条路各用各的目录**（2026-08-12）。
 *
 * 第一版两个 describe 共用一个常量，于是它们通过磁盘互相影响——
 * 单独跑必绿、一起跑红一条。**测试之间不许有暗管道**是这套夹具的第一条纪律
 * （见 `fixtures.ts` 头注），而共用一个可写目录正是一条。
 */
const 目标 = join(tmpdir(), "dawn-ws-e2e-设完再改")
const 目标2 = join(tmpdir(), "dawn-ws-e2e-一开始就选")

test("**没设的时候，入口就在输入卡下面那一行**", async ({ dawn }) => {
  const { page } = dawn
  await 开一段临时会话(page)

  /**
   * **入口在输入卡下面那一行**（2026-08-12 挪的，作者截图指的就是这里）。
   *
   * 实测 WorkBuddy 的 `wb-input-footer` 里是一颗 `选择工作空间 ⌄` chip。
   * 我上一版把它放在对话标题栏右上角——那是我自己想的位置，从没量过。
   *
   * **常驻，不做悬停才出现**（本项目为此被报过两次「没有这个功能」）。
   */
  const chip = page.locator(".composer-footer").getByRole("button", { name: /选择工作目录/ })
  await expect(chip).toBeVisible()
})

test.describe("设完之后", () => {
  /**
   * **让假模型真的调一次 bash。**
   *
   * 这条命令用的是**相对路径**——它落在哪，全看 bash 的 cwd 是什么。
   * 那正是这份用例唯一要问的事。
   */
  test.use({
    dawnOptions: {
      toolCall: { toolName: "bash", args: { command: "printf hi > dawn-cwd-proof.txt" } },
      pickDirectory: 目标,
    },
  })

  test.beforeAll(() => {
    rmSync(目标, { recursive: true, force: true })
    mkdirSync(目标, { recursive: true })
  })
  test.afterAll(() => {
    rmSync(目标, { recursive: true, force: true })
  })

  test("**归到项目栏，而且 agent 的手真的挪过去了**", async ({ dawn }) => {
    const { page } = dawn
    await 开一段临时会话(page)
    /**
     * **先等对话真的起来再点**（2026-08-12）。
     *
     * 空态与对话里各有一颗一模一样的 chip，而建任务那一刻界面会从前者切到后者。
     * 不等的话，点中的是**空态那颗**——它只改这一屏的本地状态，
     * 界面一切换就没了。症状是「点了，什么都没变」，
     * 而单独跑必绿：时序窗口小。
     */
    await expect(page.locator(".conv-title")).toBeVisible({ timeout: 30_000 })
    await expect(page.locator(".composer-footer")).toBeVisible()

    /**
     * **点用户真正点的那颗按钮。**
     *
     * 目录选择器是系统模态框，所以路径由 `DAWN_PICK_DIRECTORY` 注入
     * （夹具的 `pickDirectory` 选项）——**被替掉的只有「路径从哪来」这一步**，
     * 从按钮到后端到刷新的整条接线都是真走的。
     * 绕过界面直接打 IPC 验的是后端，而**接线才是本项目翻过车的地方**。
     */
    await page.locator(".composer-footer").getByRole("button", { name: /选择工作目录/ }).click()

    /**
     * ① **对话里留了一行。**
     *
     * 这一条不能省：设完之后这段对话会自己从「会话」栏跳到「项目」栏——
     * **看得见的东西自己动了，就必须出声**，否则人会以为它丢了。
     */
    await expect(page.locator(".turns")).toContainText("已归入项目", { timeout: 30_000 })

    // ② chip 上写着它现在在哪，不再是「选择工作目录」
    await expect(page.locator(".composer-footer .ws-chip-label").first()).not.toHaveText(
      /选择工作目录/,
    )

    // ③ 侧栏：从「会话」栏挪到了「项目」栏
    await expect(page.locator(".proj-list .proj-item")).toHaveCount(1, { timeout: 30_000 })
    const 分区 = await page
      .locator(".sidebar .side-section")
      .allTextContents()
    expect(分区.some((t) => t.startsWith("项目"))).toBe(true)
    expect(分区.some((t) => t.startsWith("会话"))).toBe(false)

    /**
     * ④ **要害那一层：让它真的写一个文件，看落在哪。**
     *
     * 假模型会照着提示调 bash（夹具里配的那条路），
     * 而 bash 的 cwd 就是我们要验的东西。
     */
    await page.getByPlaceholder(/回车发送/).fill("跑一条命令")
    await page.getByRole("button", { name: "发送", exact: true }).click()
    await expect(page.getByText(/假模型已应答/).last()).toBeVisible({ timeout: 30_000 })

    await expect
      .poll(() => existsSync(join(目标, "dawn-cwd-proof.txt")), { timeout: 30_000 })
      .toBe(true)
  })
})

/**
 * **在开口之前就把归类定下来**（2026-08-12）。
 *
 * 作者：*「默认的 App 的面板，也应该和新建任务一样，带有一个选择工作目录，
 * 因为只有选择了，才归类为项目，如果不选择目录，那么就是会话。」*
 *
 * 这条与上面那条是**两条不同的路**：那条是「先聊起来，需要换地方再换」
 * （建完再设，要搬运行时）；这条是**一开始就选对，什么都不用搬**。
 * 两条都得通——作者两次都明确要过。
 */
test.describe("空态就选好目录", () => {
  test.use({ dawnOptions: { pickDirectory: 目标2 } })

  test.beforeAll(() => {
    rmSync(目标2, { recursive: true, force: true })
    mkdirSync(目标2, { recursive: true })
  })
  test.afterAll(() => {
    rmSync(目标2, { recursive: true, force: true })
  })

  test("**选了目录再开口 → 直接进「项目」栏**", async ({ dawn }) => {
    const { page } = dawn
    // 空态自己就是一张输入卡，下面挂着同一颗 chip
    const chip = page.locator(".composer-footer").getByRole("button", { name: /选择工作目录/ })
    await expect(chip).toBeVisible()
    await chip.click()
    // 选完之后 chip 上写的是路径，不再是「选择工作目录」
    await expect(page.locator(".composer-footer .ws-chip-label").first()).not.toHaveText(
      /选择工作目录/,
    )

    await page.getByPlaceholder(/回车发送/).fill("从空态直接开始")
    await page.getByRole("button", { name: "发送", exact: true }).click()

    // 那句话真的发了出去
    await expect(page.locator(".turns").getByText("从空态直接开始")).toBeVisible({ timeout: 30_000 })

    /**
     * **归到「项目」栏，而不是「会话」栏。**
     * 这一条是作者那句话的全部内容：选了目录 = 项目，没选 = 会话。
     */
    await expect(page.locator(".proj-list .proj-item")).toHaveCount(1, { timeout: 30_000 })
    const 分区 = await page.locator(".sidebar .side-section").allTextContents()
    expect(分区.some((t) => t.startsWith("项目"))).toBe(true)
    expect(分区.some((t) => t.startsWith("会话"))).toBe(false)
  })
})
