/**
 * 起得来。
 *
 * **这条最基础的用例对应本项目最严重的一个缺陷**：
 * `providers.yaml` 不存在时 `loadRegistry` 抛 ENOENT，而默认路径曾是
 * `process.cwd()`——打包后的桌面应用 cwd 是任意目录。
 * **全新安装必然撞上，结果是「装好了，打不开」。**
 *
 * 夹具刻意把 `DAWN_CONFIG` 指向一个**不存在的**文件，
 * 所以每次跑这条用例都在真的走那条路径。
 */
import { test, expect } from "./fixtures.js"

test("全新配置目录能起来，且落在对话首页", async ({ dawn }) => {
  const { page } = dawn

  // 品牌名出现 = React 根真的挂上了。
  // 2026-08-08 有过一次「窗口开着但 React 根已死」，终端里一个字都没有
  await expect(page.locator(".brand")).toHaveText("DAWN Science")

  // **对话是首页。** 不是统计面板——初版把「偶尔查的东西」做成了打开就看的东西
  await expect(page.locator(".conversation")).toBeVisible()

  // 侧栏常驻
  await expect(page.locator(".sidebar")).toBeVisible()
})

test("默认工作区自动就绪，不要求先选文件夹", async ({ dawn }) => {
  const { page } = dawn
  // 「＋ 新建会话」可点 = 已经有项目了。
  // 此前没有项目时它是禁用的，旁边写「先打开一个项目文件夹」——
  // 那是一句描述，不是一条出路
  const newSession = page.getByRole("button", { name: "新建任务" })
  await expect(newSession).toBeEnabled()
  await expect(page.getByText("先打开一个项目文件夹")).toHaveCount(0)
})

test("配置文件被自动写出，且是一份带注释的模板", async ({ dawn }) => {
  const { readFileSync } = await import("node:fs")
  const { join } = await import("node:path")
  const text = readFileSync(join(dawn.dir, "providers.yaml"), "utf8")
  expect(text).toContain("#")
  expect(text).toContain("agents:")
})

test("没有全屏遮罩挡着 —— 连上之后就该让人干活", async ({ dawn }) => {
  const { page } = dawn
  await expect(page.locator(".conversation")).toBeVisible()
  // 全屏启动画面只留给**真正不可用**的后端（Hermes 的原则）
  await expect(page.locator(".boot-overlay")).toHaveCount(0)
})
