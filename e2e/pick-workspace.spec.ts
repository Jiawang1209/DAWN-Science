/**
 * **首页选完文件夹，立刻就进了那个项目**（2026-08-19）。**跑真实构建产物。**
 *
 * 作者：*「我在选择文件夹后，立刻进入项目，文件tree也转入。
 * 如果不选文件夹，那么就按照会话进行处理。」*
 *
 * ## 它修的是一段自相矛盾的中间态
 *
 * 此前选完文件夹，路径只记在**空态那一屏自己的 `useState`** 里：
 * chip 上写着新目录，**而文件树还指着旧地方**（树跟着 `projectId` 走）。
 * 那段时间里屏幕上有两句话，说的是两个地方。
 *
 * ## 为什么「树跟着走」非得真的进项目
 *
 * 本地列目录**必须给 projectId**——路径是相对工作区的，绝对路径会被守卫拒。
 * 所以这两件事在今天的架构里拆不开；想只切树不进项目，
 * 就得开一条读任意本地目录的口子，**那道守卫不值得为这件事拆掉**。
 *
 * ## 它仍然不建任何会话
 *
 * 「开口那一刻才建」那条决定管的是**任务/会话**。下面第三条盯的就是这个：
 * 选完文件夹侧栏上**一行都不该多**。
 */
import { mkdirSync, writeFileSync, rmSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { test, expect, 进坞 } from "./fixtures.js"

/**
 * **自己一个目录**：共用一个可写目录是「测试之间的暗管道」，
 * 而不许有暗管道是这套夹具的第一条纪律。
 *
 * 目录选择器是系统模态框，所以路径由夹具注入——**被替掉的只有
 * 「路径从哪来」这一步**，从按钮到后端到文件树整条都真走。
 */
const 目标 = join(tmpdir(), "dawn-e2e-选文件夹就进项目")
rmSync(目标, { recursive: true, force: true })
mkdirSync(join(目标, "数据"), { recursive: true })
writeFileSync(join(目标, "认得出的文件.md"), "# 就是这个目录\n")

test.use({ dawnOptions: { pickDirectory: 目标 } })

test("**选完文件夹，文件树立刻转到那个目录**", async ({ dawn }) => {
  const { page } = dawn

  // ① 选之前：树里没有那个目录的东西
  await 进坞(page, "文件")
  await expect(page.locator(".right-dock .file-tree")).toBeVisible()
  await expect(
    page.locator(".right-dock").getByRole("button", { name: /认得出的文件\.md/ }),
    "还没选文件夹，树里就已经有那个目录的东西了——这条用例证明不了任何事",
  ).toHaveCount(0)

  // ② 选
  await page.getByRole("button", { name: "选择工作目录" }).click()

  // ③ chip 上写着它了
  await expect(page.locator(".ws-chip-label")).toContainText("选文件夹就进项目")

  /**
   * ④ **树也转过去了**——这一条是整轮改动本身。
   *
   * 红的样子很好认：chip 变了而树没变，也就是作者报的那个中间态。
   */
  await expect(
    page.locator(".right-dock").getByRole("button", { name: /认得出的文件\.md/ }),
    "chip 变了，文件树还指着旧地方",
  ).toBeVisible({ timeout: 15_000 })
  await expect(page.locator(".right-dock").getByRole("button", { name: "数据", exact: true })).toBeVisible()
})

/**
 * **只认领文件夹，不建会话**（作者：*「如果不选文件夹，那么就按照会话进行处理」*
 * 的另一面：选了也只是归类，开口才建）。
 *
 * 侧栏那一列由**任务**分组而来，所以一个还没说过话的项目**根本不该出现**。
 * 少了这一条，「选错一个文件夹就在侧栏留下一行」这种回归不会有人发现。
 */
test("**选完文件夹，侧栏一行都不多**", async ({ dawn }) => {
  const { page } = dawn

  const 行数 = await page.locator(".sidebar .sess-item").count()
  await page.getByRole("button", { name: "选择工作目录" }).click()
  await expect(page.locator(".ws-chip-label")).toContainText("选文件夹就进项目")

  await expect(page.locator(".sidebar .sess-item"), "选个文件夹就凭空多了一行").toHaveCount(行数)
  await expect(
    page.locator(".side-section").filter({ hasText: "项目" }),
    "还没说过话，项目那一列就冒出来了",
  ).toHaveCount(0)
})

/**
 * **开口之后它才落进「项目」那一列**——这一条守的是另一头：
 * 上面那条要求「别急着出现」，而它不能变成「永远不出现」。
 */
test("**说了第一句话，它才归到项目那一列**", async ({ dawn }) => {
  const { page } = dawn

  await page.getByRole("button", { name: "选择工作目录" }).click()
  await expect(page.locator(".ws-chip-label")).toContainText("选文件夹就进项目")

  const box = page.getByPlaceholder(/今天帮你做些什么/)
  await box.fill("在这个目录里干活")
  await box.press("Enter")

  await expect(page.locator(".side-section").filter({ hasText: "项目" })).toBeVisible({
    timeout: 30_000,
  })
})
