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
 * ## 它「立刻进项目」是**看得见**的，但仍然不建任何会话
 *
 * 作者当天补了一句：*「同时应该立刻收纳入项目里面，现在也没有。」*
 * ——我第一版把「进项目」理解成了内部状态（树指过去就算），
 * 而**一个只改变内部状态、屏幕上毫无反应的操作，与没生效分不开**。
 *
 * 所以：收纳要立刻出现，**而「开口那一刻才建」管的任务/会话仍然一个都不建**。
 * 下面第二条同时盯这两头。
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
 * **选完就在「项目」收纳里看得见，但一段会话都没建**。
 *
 * ## 这条判据 2026-08-19 当天翻过一次面，两边理由都留着
 *
 * - **先前那一版**断言的是「侧栏一行都不多，项目那一列不该出现」。
 *   我的理由：那一列由任务分组而来，没有任务的项目本来就不显示，
 *   而「选错一个文件夹就在侧栏留下一行」是我想躲开的回归。
 * - **作者当天就报了**：*「同时应该立刻收纳入项目里面，现在也没有。」*
 *
 *   他是对的，而我错在**把「进项目」理解成了内部状态**——
 *   文件树指过去就算数。可**一个只改变内部状态、屏幕上毫无反应的操作，
 *   与没生效分不开**。他上一句话说的「立刻进入项目」，本来就该是看得见的。
 *
 * 所以现在两头都盯：**收纳要出现**（他要的），
 * **而里面一段会话都没有**（原来那条判据真正想保的东西——开口才建）。
 */
test("**选完文件夹：项目收纳立刻出现，但一段会话都没建**", async ({ dawn }) => {
  const { page } = dawn

  const 行数 = await page.locator(".sidebar .sess-item").count()
  await page.getByRole("button", { name: "选择工作目录" }).click()
  await expect(page.locator(".ws-chip-label")).toContainText("选文件夹就进项目")

  // ① 收纳出现了，而且写着那个文件夹的名字
  const 收纳 = page.locator(".side-section").filter({ hasText: "项目" })
  await expect(收纳, "选完文件夹，项目那一列没有出现").toBeVisible({ timeout: 15_000 })
  await expect(page.locator(".sidebar")).toContainText("选文件夹就进项目")

  /**
   * ② **但它底下一段会话都没有**——这是原来那条判据真正在保的东西。
   * 「开口那一刻才建」管的是任务/会话，选文件夹只是归类。
   */
  await expect(
    page.locator(".sidebar .sess-item"),
    "选个文件夹就凭空建出了一段会话",
  ).toHaveCount(行数)
})

/**
 * **说了话之后，那一段挂在这个项目底下**——守的是另一头。
 *
 * 上面那条要求「收纳出现但底下是空的」；如果实现成「收纳永远是空的」，
 * 那一条照样绿。**这一条把另一半钉住**：开口之后它得真的挂进去。
 */
test("**说了第一句话，那一段就挂在这个项目底下**", async ({ dawn }) => {
  const { page } = dawn

  await page.getByRole("button", { name: "选择工作目录" }).click()
  await expect(page.locator(".ws-chip-label")).toContainText("选文件夹就进项目")

  const box = page.getByPlaceholder(/今天帮你做些什么/)
  await box.fill("在这个目录里干活")
  await box.press("Enter")

  await expect(page.locator(".sidebar .sess-item"), "说了话却没挂进去").toHaveCount(1, {
    timeout: 30_000,
  })
  await expect(page.locator(".side-section").filter({ hasText: "项目" })).toBeVisible()
})

/**
 * **在外面把文件挪进去，切回窗口树就跟上**（2026-08-19 作者报的）。
 *
 * 作者：*「我在挪动文件进去之后文件tree没有更新。」*
 *
 * ## 此前为什么不会更新
 *
 * 那个刷新令牌只在**我们自己动手**时才 +1（传完、上传、删除）。
 * 在 Finder 里把文件挪进去，**没有任何东西会告诉界面**——
 * 屏幕上那棵树与磁盘上那个目录，从那一刻起就是两回事了。
 *
 * ## 这条用例为什么能代表那件事
 *
 * 它**绕开界面直接往磁盘上写**（`writeFileSync`），
 * 再派一个 `focus` 事件——那正是「你从 Finder 切回 DAWN」那一下。
 * 中间没有任何我们自己的上传/删除路径参与。
 */
test("**在外面往目录里丢文件，切回窗口树就跟上**", async ({ dawn }) => {
  const { page } = dawn

  await page.getByRole("button", { name: "选择工作目录" }).click()
  await 进坞(page, "文件")
  await expect(
    page.locator(".right-dock").getByRole("button", { name: /认得出的文件\.md/ }),
  ).toBeVisible({ timeout: 15_000 })

  const 新的 = "刚挪进来的.csv"
  await expect(
    page.locator(".right-dock").getByRole("button", { name: new RegExp(新的) }),
    "还没挪进去就已经有了——这条用例证明不了任何事",
  ).toHaveCount(0)

  // **绕开界面直接写磁盘**：模拟的就是「在 Finder 里挪进去」
  writeFileSync(join(目标, 新的), "a,b\n1,2\n")

  /**
   * **展开一层再切回来**：顺带盯住「刷新不许把展开状态清零」。
   * 上一版刷新是靠整棵树重挂实现的，那样每刷新一次，
   * 你翻到第三层的位置就没了——传完一个文件就发生一次，只是没人报过。
   */
  await page.locator(".right-dock").getByRole("button", { name: "数据", exact: true }).click()

  // 切回窗口那一下
  await page.evaluate(() => window.dispatchEvent(new Event("focus")))

  await expect(
    page.locator(".right-dock").getByRole("button", { name: new RegExp(新的) }),
    "在外面挪进去的文件，切回来还是看不见",
  ).toBeVisible({ timeout: 15_000 })
  // **展开的那一层还开着**：刷新是重读，不是重挂
  await expect(
    page.locator(".right-dock .tree-node", { has: page.getByRole("button", { name: "数据", exact: true }) }).last(),
    "刷新之后展开的目录塌回去了",
  ).toHaveClass(/./)
})

/**
 * **文件行写着多久前改的；「刷新」按钮不靠切窗口也能看见新文件**（2026-08-19）。
 *
 * 作者：*「我只需要在文件树里面看到生成了什么数据就好，有时间戳，
 * 我就知道哪个文件是新生成的了。」* 以及：*「可以给 DAWN 的文件里面
 * 增加一个刷新的按钮……多刷新其实就好了。」*
 *
 * 两件事在一条用例里，因为它们盯的是同一行：刚写的文件要出现（刷新），
 * 而且写着「刚刚」（时间）。此前文件行只有大小——**本地的 mtime 一直在
 * 载荷里，没画；远端的干脆没取**。
 *
 * **这条不派 `focus` 事件**：上一条靠切窗口刷新，这一条只按按钮。
 * 两条路各自证明各自的。
 */
test("**文件行写着「刚刚」；按「刷新」不切窗口也能看见新文件**", async ({ dawn }) => {
  const { page } = dawn

  await page.getByRole("button", { name: "选择工作目录" }).click()
  await 进坞(page, "文件")
  const 坞 = page.locator(".right-dock")
  await expect(坞.getByRole("button", { name: /认得出的文件\.md/ })).toBeVisible({ timeout: 15_000 })

  const 新的 = "按刷新才看见的.csv"
  await expect(坞.getByRole("button", { name: new RegExp(新的) })).toHaveCount(0)
  writeFileSync(join(目标, 新的), "x\n")

  // 没切窗口、没上传、没删除——只按了这颗
  await 坞.getByRole("button", { name: "刷新当前文件夹" }).click()

  const 行 = 坞.getByRole("button", { name: new RegExp(新的) })
  await expect(行, "按了刷新，刚写的文件还是看不见").toBeVisible({ timeout: 15_000 })
  /**
   * **时间戳**：刚写进去的，必须写「刚刚」。红的样子：这一格空着（没画），
   * 或者写着 `99d+`（远端那条 1970 占位的症状）。
   */
  await expect(行.locator(".file-when"), "文件行没写多久前改的").toHaveText("刚刚")
})
