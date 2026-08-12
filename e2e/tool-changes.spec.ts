/**
 * 变更 pane（①-B″ · U4 补验）。**跑真实构建产物。**
 *
 * ## 这条 e2e 是一笔明写在案的欠账
 *
 * U4 落地时历史条目里自己标注过：
 *
 * > *面板的**渲染逻辑**有 12 条单元测试覆盖，**但「真跑一次工具调用、
 * > 文件名出现在面板上」还没有在真实构建产物上验过**——假后端目前不触发工具调用。*
 *
 * 现在补上。走的是完整链路：假模型吐一个 `write` 调用 → pi 真的执行它 →
 * 工具包装器拍 git 快照 → 账本记进那条 Run → IPC → 面板。
 * **中间没有一处是假的，只有模型是确定的。**
 *
 * ## 为什么是两条，不是一条
 *
 * 溯源探针有两种结局，**它们在界面上必须说不同的话**：
 *   - 拿得到事实 → 列出文件名
 *   - 拿不到（非 git 仓库、快照失败）→ 「无法确定改了什么」
 *
 * 把后者显示成「没有改动文件」就是把「不知道」说成「没改」，
 * 那是不变式 5 明令禁止的编造。这条区别此前只有单元测试守着，
 * **单元测试证明不了它在真实产物上也成立**。
 */
import { test, expect, readRuns, 在项目里开会话 } from "./fixtures.js"

/** 中文文件名是刻意的：R3 撞出过 git 把非 ASCII 路径写成八进制转义的缺陷 */
const 产出文件 = "分析结果.md"

test.describe("拿得到 git 事实时", () => {
  test.use({
    dawnOptions: {
      gitInit: true,
      toolCall: { toolName: "write", args: { path: 产出文件, content: "# 假模型写的\n" } },
    },
  })

  test("工具改的文件，名字真的出现在变更 pane 上", async ({ dawn }) => {
    const { page, dbPath } = dawn
    await expect(page.locator(".app-shell")).toBeVisible()
    await 在项目里开会话(page)
    await page.getByPlaceholder(/回车发送/).fill("写一个文件")
    await page.getByRole("button", { name: "发送", exact: true }).click()
    // 工具跑完之后模型才回这句 —— 它到了就说明整轮收工了
    await expect(page.getByText(/假模型已应答/).last()).toBeVisible()

    await page.getByRole("button", { name: "项目概览" }).click()
    const panel = page.locator(".panel", { hasText: "变更" })
    // **是哪次工具调用改的** —— 计划里 U4 的原话，只给匿名序号等于没标
    await expect(panel).toContainText("write")
    await expect(panel).toContainText(产出文件)

    // 界面说发生了，账本上也得有。`tool_call:<工具名>`，不是裸 `tool_call`
    const runs = await readRuns(dbPath)
    expect(runs.map((r) => r.request_type)).toContain("tool_call:write")
  })
})

test.describe("拿不到 git 事实时", () => {
  // **不 git init**：探针 `begin()` 直接返回 undefined，那条 Run 上没有文件事实
  test.use({
    dawnOptions: {
      toolCall: { toolName: "write", args: { path: 产出文件, content: "# 假模型写的\n" } },
    },
  })

  test("**说「无法确定」，不说「没有改动文件」** —— 不知道不等于没改", async ({ dawn }) => {
    const { page } = dawn
    await expect(page.locator(".app-shell")).toBeVisible()
    await 在项目里开会话(page)
    await page.getByPlaceholder(/回车发送/).fill("写一个文件")
    await page.getByRole("button", { name: "发送", exact: true }).click()
    await expect(page.getByText(/假模型已应答/).last()).toBeVisible()

    await page.getByRole("button", { name: "项目概览" }).click()
    const panel = page.locator(".panel", { hasText: "变更" })
    await expect(panel).toContainText("write")
    await expect(panel).toContainText("无法确定改了什么")
    // 这一条才是重点：**两种情况的措辞不得相同**
    await expect(panel).not.toContainText("没有改动文件")
  })
})
