/**
 * `@` 引用工作区文件（2026-08-23，学自 dsh-at-file）。
 *
 * 占位符从 2026-08-19 起就写着「@引用工作区文件」——**这条用例盯着那句承诺真的兑现**：
 * 打 `@` 弹路径菜单、挑一条写进草稿、引用栏里有它、发出去模型真的收到 `<workspace-reference>`。
 */
import { test, expect, 在项目里开会话, 进设置 } from "./fixtures.js"
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"

test.describe("对话里", () => {
  test.use({ dawnOptions: { gitInit: true } })

  test("**打 `@` 弹菜单；挑一条；引用栏里有它；发出去模型收到 workspace-reference**", async ({ dawn }) => {
    const { page, workspace, requests } = dawn
    mkdirSync(join(workspace, "data/raw"), { recursive: true })
    writeFileSync(join(workspace, "data/raw/cities.csv"), "a,b\n1,2\n")
    writeFileSync(join(workspace, "notes.md"), "# 笔记\n")
    await 在项目里开会话(page)

    const 框 = page.getByPlaceholder(/今天帮你做些什么/)
    await 框.fill("看看 @")
    const 菜单 = page.getByRole("listbox", { name: "引用工作区文件" })
    await expect(菜单).toBeVisible()
    // 浏览模式：根下的东西，目录在前
    await expect(菜单.getByRole("option").first()).toContainText("data")
    await expect(菜单.getByRole("option", { name: /notes\.md/ })).toBeVisible()

    // 打几个字按名找：`cit` 命中深处的 cities.csv，主标题是文件名、下面一行父目录
    await 框.fill("看看 @cit")
    const 命中 = 菜单.getByRole("option", { name: /cities\.csv/ })
    await expect(命中).toBeVisible()
    await expect(命中).toContainText("data/raw")
    await 命中.click()
    await expect(框).toHaveValue("看看 @data/raw/cities.csv ")
    // 引用栏从草稿 parse 出来
    const 栏 = page.getByRole("list", { name: "引用的文件" })
    await expect(栏).toContainText("data/raw/cities.csv")

    await 框.press("Enter")
    await expect(page.getByText("假模型已应答").last()).toBeVisible({ timeout: 30_000 })
    // 模型收到的：原文 + 一条引用；**不带文件内容**
    const 收到 = JSON.stringify(requests)
    expect(收到).toContain('<workspace-reference path=\\"data/raw/cities.csv\\" kind=\\"file\\" />')
    expect(收到).not.toContain("a,b\\n1,2")
    // 屏幕上那一轮仍是人写的原文
    await expect(page.locator(".turn.user").last()).not.toContainText("workspace-reference")
  })

  test("**→ 钻进目录，菜单不关；回车引用目录是 `@路径/`；× 抠掉；不存在的 `@alice` 什么都不发生**", async ({ dawn }) => {
    const { page, workspace, requests } = dawn
    mkdirSync(join(workspace, "results/figs"), { recursive: true })
    writeFileSync(join(workspace, "results/figs/a.png"), "")
    await 在项目里开会话(page)
    const 框 = page.getByPlaceholder(/今天帮你做些什么/)
    const 菜单 = page.getByRole("listbox", { name: "引用工作区文件" })

    await 框.fill("@res")
    await expect(菜单.getByRole("option", { name: /^results/ })).toBeVisible()
    await 框.press("ArrowRight")
    await expect(框).toHaveValue("@results/")
    await expect(菜单.getByRole("option", { name: /figs/ })).toBeVisible()
    await 框.press("Enter")
    await expect(框).toHaveValue("@results/figs/ ")
    await expect(page.getByRole("list", { name: "引用的文件" })).toContainText("results/figs")

    await page.getByRole("button", { name: "不引用 results/figs" }).click()
    await expect(框).toHaveValue("")

    // 光标还在 `@alice` 后面：菜单开着（没有对上的）；Esc 关掉；接着写，发出去什么都不附
    await 框.fill("问问 @alice")
    await expect(菜单).toBeVisible()
    await 框.press("Escape")
    await expect(菜单).toHaveCount(0)
    await 框.type(" 这事")
    await expect(菜单).toHaveCount(0)
    await 框.press("Enter")
    await expect(page.getByText("假模型已应答").last()).toBeVisible({ timeout: 30_000 })
    expect(JSON.stringify(requests)).not.toContain("workspace-reference")
  })
})

/** 空态屏那张输入卡也得兑现同一句承诺（夹具已认领了 workspace，所以这里有源） */
test("空态屏：`@` 同样弹菜单、能挑", async ({ dawn }) => {
  const { page, workspace } = dawn
  writeFileSync(join(workspace, "plan.md"), "# 计划\n")
  const 框 = page.getByPlaceholder(/今天帮你做些什么/)
  await 框.fill("@pla")
  const 菜单 = page.getByRole("listbox", { name: "引用工作区文件" })
  await 菜单.getByRole("option", { name: /plan\.md/ }).click()
  await expect(框).toHaveValue("@plan.md ")
  await expect(page.getByRole("list", { name: "引用的文件" })).toContainText("plan.md")
})

/**
 * 第二档（学 dsh-at-file）：粘贴进来的 `@` 不算；文件名过滤规则。
 */
test.describe("第二档", () => {
  test.use({ dawnOptions: { gitInit: true } })

  test("**粘贴进来的 `@data/raw/a.csv` 真实存在也不算**：不开菜单、不进栏、模型收不到；设置里关掉之后就算", async ({ dawn }) => {
    const { page, workspace, requests } = dawn
    mkdirSync(join(workspace, "data/raw"), { recursive: true })
    writeFileSync(join(workspace, "data/raw/a.csv"), "x")
    await 在项目里开会话(page)
    const 框 = page.getByPlaceholder(/今天帮你做些什么/)
    /** 造一次真的 paste 事件；回「我们这一侧拦没拦」——拦了 = 接管（护住 `@`），没拦 = 交给浏览器照常粘 */
    const 粘 = async (文: string) => {
      await 框.focus()
      return page.evaluate((文) => {
        const dt = new DataTransfer()
        dt.setData("text/plain", 文)
        const el = document.querySelector(".composer-field") as HTMLTextAreaElement
        const ev = new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true })
        el.dispatchEvent(ev)
        return ev.defaultPrevented
      }, 文)
    }
    expect(await 粘("看看 @data/raw/a.csv"), "带 @ 的粘贴该被接管").toBe(true)
    // 屏幕上一字不差（零宽标记看不见）
    await expect(框).toHaveValue(/看看 @.?data\/raw\/a\.csv/)
    await expect(page.getByRole("listbox", { name: "引用工作区文件" })).toHaveCount(0)
    await expect(page.getByRole("list", { name: "引用的文件" })).toHaveCount(0)
    await 框.press("Enter")
    await expect(page.getByText("假模型已应答").last()).toBeVisible({ timeout: 30_000 })
    const 收到 = JSON.stringify(requests)
    expect(收到).not.toContain("workspace-reference")
    // 标记不许漏给模型
    expect(收到).not.toContain("\\u2060")
    await expect(page.locator(".turn.user").last()).toContainText("看看 @data/raw/a.csv")

    // 关掉这一档：粘进来的就和打的一样
    await 进设置(page, "文件引用")
    await page.getByLabel(/^开$/).click()
    await expect(page.getByLabel(/^关$/)).toBeChecked({ checked: false })
    await page.getByRole("button", { name: "返回", exact: true }).click()
    // 合成的 paste 事件不真的往框里写字，所以这里只看「没拦」——没拦就是浏览器照常粘、和打的一样
    expect(await 粘("再看 @data/raw/a.csv"), "关掉之后粘贴不该再被接管").toBe(false)
  })

  test("**过滤规则**：全局加一条精确、工作区加一条正则，菜单里就不列它们；坏正则存不进去", async ({ dawn }) => {
    const { page, workspace } = dawn
    writeFileSync(join(workspace, "Thumbs.db"), "")
    writeFileSync(join(workspace, "scratch.tmp"), "")
    writeFileSync(join(workspace, "keep.csv"), "")
    await 在项目里开会话(page)
    await 进设置(page, "文件引用")

    const 全局 = page.getByRole("form", { name: "加一条全局规则" })
    await 全局.getByLabel("规则").fill("thumbs.db")
    await 全局.getByRole("button", { name: "加一条全局规则" }).click()
    await expect(page.getByRole("list", { name: "全局过滤规则" })).toContainText("thumbs.db")

    const 工作区 = page.getByRole("form", { name: "加一条工作区规则" })
    await 工作区.getByLabel("匹配方式").selectOption("regex")
    await 工作区.getByLabel("规则").fill("(")
    await expect(工作区.getByRole("button", { name: "加一条工作区规则" })).toBeDisabled()
    await expect(工作区.locator(".caveat")).toBeVisible()
    await 工作区.getByLabel("规则").fill("\\.tmp$")
    await 工作区.getByRole("button", { name: "加一条工作区规则" }).click()
    const 表 = page.getByRole("list", { name: "这个工作区的规则" })
    await expect(表).toContainText("\\.tmp$")
    // 继承来的全局那条也摆在这一栏里
    await expect(表).toContainText("thumbs.db")

    await page.getByRole("button", { name: "返回", exact: true }).click()
    const 框 = page.getByPlaceholder(/今天帮你做些什么/)
    await 框.fill("@")
    const 菜单 = page.getByRole("listbox", { name: "引用工作区文件" })
    await expect(菜单.getByRole("option", { name: /keep\.csv/ })).toBeVisible()
    await expect(菜单.getByRole("option", { name: /Thumbs\.db/ })).toHaveCount(0)
    await expect(菜单.getByRole("option", { name: /scratch\.tmp/ })).toHaveCount(0)
  })
})
