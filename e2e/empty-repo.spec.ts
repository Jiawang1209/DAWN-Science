/**
 * **`git init` 了、但还没有第一次 commit 的工作区**（2026-08-20，作者报的）。
 *
 * > *「我点击终端之后，关闭终端，但是再点击新开一个的时候，无法新开新的终端。」*
 * > *「我把文件夹做 git 仓库的时候，审阅是没有工作的。」*
 *
 * 两句话是**同一个洞**：那时 `HEAD` 是悬空引用，`git diff HEAD` 与
 * `rev-parse HEAD` 都以 128 失败——审阅整格报错；**建任何会话都要拍
 * git 基线**，所以连终端都开不出来。直路的探针（好好的仓库）当时全绿，
 * 真相在 app 日志里：`createTerminalSession 失败: … rev-parse HEAD`。
 *
 * 修法：`可比对的基线`——HEAD 解析不出（且确实是仓库）就退到**空树**，
 * 「所有文件都是新加的」正是一个没有提交的仓库的事实。
 */
import { execFileSync } from "node:child_process"
import { writeFileSync } from "node:fs"
import { join } from "node:path"
import { test, expect, 开一段临时会话, 进坞 } from "./fixtures.js"

test("**git init 未 commit：终端开得出，审阅列得出「新加」**", async ({ dawn }) => {
  const { page, workspace } = dawn

  // 把工作区变成一个**没有任何 commit** 的仓库——作者的现场
  execFileSync("git", ["init", "-q", "-b", "main"], { cwd: workspace })
  writeFileSync(join(workspace, "刚写的.csv"), "a,b\n1,2\n")

  await 开一段临时会话(page)

  // ① 终端开得出来（此前 createTerminalSession 在 rev-parse HEAD 上炸）
  await page.getByRole("button", { name: "终端", exact: true }).click()
  await expect(page.locator(".dock-tab"), "空仓库里连终端都开不出").toHaveCount(1, {
    timeout: 15_000,
  })
  // 关掉再新开——作者报的那个动作序列
  await page.getByRole("button", { name: "关闭终端 1" }).click()
  await page.getByRole("button", { name: "＋ 新开一个" }).click()
  await expect(page.locator(".dock-tab"), "关掉之后新开不出").toHaveCount(1, { timeout: 15_000 })

  // ② 审阅工作：文件算「新加」，不是一格报错
  await 进坞(page, "审阅")
  await expect(
    page.locator(".right-dock").getByText(/刚写的\.csv/),
    "空仓库的审阅还是不工作",
  ).toBeVisible({ timeout: 15_000 })
})
