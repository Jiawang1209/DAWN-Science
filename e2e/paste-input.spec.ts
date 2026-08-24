/**
 * 外部文件附件（2026-08-25，学自 dsh-paste-input，解读见 ccb_hive_code_learn/dsh-paste-input-解读.md）：
 * 粘贴 / 拖拽的外部文件先只在内存排队（chip），发送那一刻落盘进
 * `<工作区>/.dawn/attachments/…` 并以 `@相对路径` 进消息；×掉 chip = 磁盘无痕。
 */
import { existsSync, readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { test, expect, 在项目里开会话, 进坞 } from "./fixtures.js"

/** 往 composer 里“粘”一个非图片文件（合成 ClipboardEvent；CSP 挡 data: fetch，从字节拼） */
const 粘一个文件 = (page: import("@playwright/test").Page, 名: string, 内容: string) =>
  page.evaluate(({ 名, 内容 }) => {
    const dt = new DataTransfer()
    dt.items.add(new File([new TextEncoder().encode(内容)], 名, { type: "text/csv" }))
    document.querySelector(".composer-box textarea")!.dispatchEvent(
      new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }),
    )
  }, { 名, 内容 })

test("**粘贴外部文件 = 替你敲一个 @**：草稿出 @令牌、引用栏出 chip；发送落盘、令牌换写成真实路径", async ({ dawn }) => {
  const { page, workspace } = dawn
  await 在项目里开会话(page)
  await 粘一个文件(page, "实验 数据.csv", "a,b\n1,2\n")
  // 草稿里是 @令牌（空白已换 _），引用栏出 chip（作者给的图就是这个形状）
  await expect(page.locator(".composer-box textarea")).toHaveValue("@实验_数据.csv ")
  // 插完不算「正在打的 @」：菜单不弹、chip 进栏（2026-08-25 作者截图抓的）
  await expect(page.getByRole("listbox", { name: "引用工作区文件" })).toHaveCount(0)
  await expect(page.locator(".at-rail-row")).toHaveCount(1)
  await expect(page.locator(".at-rail-row")).toContainText("实验_数据.csv")
  // 发送前磁盘上什么都没有（发送才落盘）
  expect(existsSync(join(workspace, ".dawn", "attachments"))).toBe(false)
  const 框 = page.locator(".composer-box textarea")
  await 框.fill((await 框.inputValue()) + " 看看这份数据")
  await page.getByRole("button", { name: "发送", exact: true }).click()
  await expect(page.getByText(/假模型已应答/).last()).toBeVisible({ timeout: 30_000 })
  // 消息里令牌已换写成落盘后的真实路径
  await expect(page.locator(".turn").first()).toContainText(/@\.dawn\/attachments\/.+实验_数据\.csv/)
  const 根 = join(workspace, ".dawn", "attachments")
  const 会话目录 = join(根, readdirSync(根)[0]!)
  const 批次 = join(会话目录, readdirSync(会话目录)[0]!)
  const marker = JSON.parse(readFileSync(join(批次, ".dawn-attachments.json"), "utf8"))
  expect(marker.owner).toBe("dawn-paste-input")
  expect(readFileSync(join(批次, "实验_数据.csv"), "utf8")).toBe("a,b\n1,2\n")
})

test("**引用栏 ×掉 = 磁盘无痕**；上传键的黑色实心跟着熄灭", async ({ dawn }) => {
  const { page, workspace } = dawn
  await 在项目里开会话(page)
  const 色 = () => page.locator(".composer-footer .attach-trigger").evaluate((el) => getComputedStyle(el).color)
  const 淡 = await 色()
  await 粘一个文件(page, "误拖.txt", "算了")
  await expect(page.locator(".at-rail-row")).toHaveCount(1)
  expect(await 色()).not.toBe(淡)
  await page.getByRole("button", { name: "不引用 误拖.txt" }).click()
  await expect(page.locator(".at-rail-row")).toHaveCount(0)
  expect(await 色()).toBe(淡)
  expect(existsSync(join(workspace, ".dawn", "attachments"))).toBe(false)
})

test("**拖拽外部文件也进 @**；概览里能看到用量并两步清理", async ({ dawn }) => {
  const { page, workspace } = dawn
  await 在项目里开会话(page)
  await page.evaluate(() => {
    const dt = new DataTransfer()
    dt.items.add(new File([new TextEncoder().encode("x1")], "拖来.txt", { type: "text/plain" }))
    document.dispatchEvent(new DragEvent("drop", { dataTransfer: dt, bubbles: true, cancelable: true }))
  })
  await expect(page.locator(".at-rail-row")).toHaveCount(1)
  const 框 = page.locator(".composer-box textarea")
  await 框.fill((await 框.inputValue()) + " 收好")
  await page.getByRole("button", { name: "发送", exact: true }).click()
  await expect(page.getByText(/假模型已应答/).last()).toBeVisible({ timeout: 30_000 })
  expect(existsSync(join(workspace, ".dawn", "attachments"))).toBe(true)
  await 进坞(page, "概览")
  const 格 = page.locator(".panel", { hasText: "外部附件" })
  await expect(格).toContainText(/1 批 · 1 个文件/)
  await 格.getByRole("button", { name: "清理本会话附件" }).click()
  await 格.getByRole("button", { name: "再点一次：确认清理" }).click()
  await expect(格).toContainText("还没有落盘的外部附件")
  const 根 = join(workspace, ".dawn", "attachments")
  const 会话目录 = join(根, readdirSync(根)[0]!)
  expect(readdirSync(会话目录)).toHaveLength(0)
})

test("**光标不在输入框也能粘**（页面级监听），照样进 @", async ({ dawn }) => {
  const { page } = dawn
  await 在项目里开会话(page)
  await page.evaluate(() => {
    ;(document.activeElement as HTMLElement | null)?.blur()
    const dt = new DataTransfer()
    dt.items.add(new File([new TextEncoder().encode("x")], "游离粘贴.txt", { type: "text/plain" }))
    document.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }))
  })
  await expect(page.locator(".at-rail-row")).toHaveCount(1)
  await expect(page.locator(".composer-box textarea")).toHaveValue("@游离粘贴.txt ")
})

test("**Finder 式复制（只有 file:// uri-list）**：草稿出 @、发送后换写真实路径", async ({ dawn }) => {
  const { page, workspace } = dawn
  const { writeFileSync } = await import("node:fs")
  const 源 = join(workspace, "AGENTS.md")
  writeFileSync(源, "# 规则\n照做\n")
  await 在项目里开会话(page)
  await page.evaluate((p) => {
    ;(document.activeElement as HTMLElement | null)?.blur()
    const dt = new DataTransfer()
    dt.setData("text/uri-list", `file://${encodeURI(p)}`)
    dt.setData("text/plain", "AGENTS.md")
    document.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }))
  }, 源)
  await expect(page.locator(".at-rail-row")).toHaveCount(1)
  await expect(page.locator(".composer-box textarea")).toHaveValue("@AGENTS.md ")
  const 框 = page.locator(".composer-box textarea")
  await 框.fill((await 框.inputValue()) + " 读一下规则")
  await page.getByRole("button", { name: "发送", exact: true }).click()
  await expect(page.getByText(/假模型已应答/).last()).toBeVisible({ timeout: 30_000 })
  await expect(page.locator(".turn").first()).toContainText(/@\.dawn\/attachments\/.+AGENTS\.md/)
  const 根 = join(workspace, ".dawn", "attachments")
  const 会话目录 = join(根, readdirSync(根)[0]!)
  const 批次 = join(会话目录, readdirSync(会话目录)[0]!)
  expect(readFileSync(join(批次, "AGENTS.md"), "utf8")).toContain("照做")
})

test("**空态也收**：粘一个文件 → @ 进草稿 → 第一句话建会话后落盘、令牌换写", async ({ dawn }) => {
  const { page } = dawn
  await expect(page.locator(".composer-box textarea")).toBeVisible()
  await page.evaluate(() => {
    ;(document.activeElement as HTMLElement | null)?.blur()
    const dt = new DataTransfer()
    dt.items.add(new File([new TextEncoder().encode("开场附件")], "开场.txt", { type: "text/plain" }))
    document.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }))
  })
  await expect(page.locator(".at-rail-row")).toHaveCount(1)
  const 框 = page.locator(".composer-box textarea")
  await expect(框).toHaveValue("@开场.txt ")
  await 框.fill((await 框.inputValue()) + " 带着它开一段")
  await page.getByRole("button", { name: "发送", exact: true }).click()
  await expect(page.getByText(/假模型已应答/).last()).toBeVisible({ timeout: 30_000 })
  await expect(page.locator(".turn").first()).toContainText(/@\.dawn\/attachments\/.+开场\.txt/)
})

test("**粘贴的图能点开看大图**（学 Codex）：点缩略图开层、Esc 关", async ({ dawn }) => {
  const { page } = dawn
  await 在项目里开会话(page)
  await page.locator(".composer-box textarea").focus()
  await page.evaluate(() => {
    const b64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
    const dt = new DataTransfer()
    dt.items.add(new File([bytes], "一像素.png", { type: "image/png" }))
    document.querySelector(".composer-box textarea")!.dispatchEvent(
      new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }),
    )
  })
  // 字节来的图当场带预览（不是标题）
  const 缩 = page.locator(".attached-thumb")
  await expect(缩).toHaveCount(1)
  await page.getByRole("button", { name: "看大图：一像素.png" }).click()
  const 层 = page.getByRole("dialog", { name: "一像素.png" })
  await expect(层).toBeVisible()
  await expect(层.locator("img")).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(层).toHaveCount(0)
})

test("**@ 在输入框里带灰底**（学 Codex）：手敲与粘贴同一份高亮；镜像层与输入框逐像素同框", async ({ dawn }) => {
  const { page } = dawn
  await 在项目里开会话(page)
  const 框 = page.locator(".composer-box textarea")
  await 框.fill("看看 @data/raw/a.csv 和 @AGENTS.md")
  await expect(page.locator(".composer-hl .hl-ref")).toHaveCount(2)
  await expect(page.locator(".composer-hl .hl-ref").first()).toHaveText("@data/raw/a.csv")
  // 镜像层与 textarea 必须同位同大——错一像素高亮就飘（选择器那回踩过：涂色错一行）
  const 对齐 = await page.evaluate(() => {
    const t = document.querySelector(".composer-input-wrap textarea")!.getBoundingClientRect()
    const h = document.querySelector(".composer-hl")!.getBoundingClientRect()
    return { dx: Math.abs(t.x - h.x), dy: Math.abs(t.y - h.y), dw: Math.abs(t.width - h.width), dh: Math.abs(t.height - h.height) }
  })
  expect(Math.max(对齐.dx, 对齐.dy, 对齐.dw, 对齐.dh)).toBeLessThanOrEqual(1)
  // 粘贴插入的令牌也走同一份高亮
  await 粘一个文件(page, "补一份.txt", "x")
  await expect(page.locator(".composer-hl .hl-ref")).toHaveCount(3)
})

test("**空态的高亮也不飘**：英雄区的 text-align 摸不进镜像层", async ({ dawn }) => {
  const { page } = dawn
  await expect(page.locator(".composer-box textarea")).toBeVisible()
  await page.evaluate(() => {
    ;(document.activeElement as HTMLElement | null)?.blur()
    const dt = new DataTransfer()
    dt.items.add(new File([new TextEncoder().encode("x")], "tmp.txt", { type: "text/plain" }))
    document.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }))
  })
  await expect(page.locator(".composer-hl .hl-ref")).toHaveCount(1)
  const m = await page.evaluate(() => {
    const t = document.querySelector(".composer-input-wrap textarea")!.getBoundingClientRect()
    const r = document.querySelector(".composer-hl .hl-ref")!.getBoundingClientRect()
    return { 差: Math.abs(r.x - t.x - 8) } // 8 = composer-field 的内距
  })
  expect(m.差, "灰底没贴着行首——镜像层的对齐又飘了").toBeLessThanOrEqual(2)
})
