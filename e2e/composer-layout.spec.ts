import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { test, expect, 在项目里开会话, 进坞, 进设置, CANNED_REPLY } from "./fixtures.js"
import type { Locator } from "@playwright/test"

const shots = "tmp/composer-layout/e2e"

async function checkFit(root: Locator) {
  const errors = await root.locator(".composer-card").evaluate(card => {
    const bounds = card.getBoundingClientRect()
    return Array.from(card.querySelectorAll(".composer-environment, .composer-field, .composer-footer, .composer-controls, .perm-pill, .model-trigger, .agent-pill > .btn, .send-btn, .attach-trigger, .dock-toggle, .ctx-meter-trigger"))
      .filter(el => {
        const rect = el.getBoundingClientRect()
        return rect.width > 0 && (rect.left < bounds.left - 1 || rect.right > bounds.right + 1 || rect.width < 15)
      }).map(el => el.className)
  })
  expect(errors).toEqual([])
  const orderErrors = await root.locator(".composer-footer").evaluate(footer => {
    const groups = [
      [".attach-trigger", ".dock-toggle", ".perm-pill-trigger"],
      [".ctx-meter-trigger", ".model-trigger, .agent-pill > .btn", ".config-pill .sess-config-trigger", ".send-btn"],
    ]
    return groups.flatMap(selectors => {
      const bounds = selectors.flatMap(selector => {
        const element = footer.querySelector(selector)
        return element ? [element.getBoundingClientRect()] : []
      })
      return bounds.slice(1).filter((rect, index) => rect.left < bounds[index]!.right - 1)
        .map(rect => rect.x)
    })
  })
  expect(orderErrors).toEqual([])
  for (const group of [".composer-tools", ".composer-controls"]) {
    const alignment = await root.locator(`.composer-footer ${group}`).evaluate(footer => {
      const selectors = [".attach-trigger", ".dock-toggle", ".perm-pill-trigger", ".ctx-meter-trigger", ".model-trigger", ".agent-pill > .btn", ".send-btn"]
      return selectors.flatMap(selector => {
        const el = footer.querySelector(selector)
        if (!el) return []
        const rect = el.getBoundingClientRect()
        return [rect.y + rect.height / 2]
      })
    })
    expect(Math.max(...alignment) - Math.min(...alignment)).toBeLessThanOrEqual(1)
  }
}

test("首页添加菜单支持键盘，方案状态可见，草稿不丢失", async ({ dawn }) => {
  const { page } = dawn
  mkdirSync(shots, { recursive: true })
  const root = page.locator("main.main")
  const input = root.getByPlaceholder(/输入问题/)
  await input.fill("请先检查数据，再提出分析方案")
  const add = root.getByRole("button", { name: "添加内容", exact: true })
  await add.focus()
  await add.press("ArrowDown")
  await expect(page.getByRole("menuitem", { name: "上传文件", exact: true })).toBeFocused()
  await page.keyboard.press("End")
  await expect(page.getByRole("menuitemcheckbox", { name: "先出方案", exact: true })).toBeFocused()
  await page.keyboard.press("Home")
  await expect(page.getByRole("menuitem", { name: "上传文件", exact: true })).toBeFocused()
  await page.keyboard.press("Escape")
  await expect(add).toBeFocused()
  await expect(input).toHaveValue("请先检查数据，再提出分析方案")
  await add.click()
  await page.getByRole("menuitem", { name: "优化输入", exact: true }).hover()
  await expect(page.getByRole("menu", { name: "选档位", exact: true })).toBeVisible()
  await page.getByRole("menuitemradio", { name: /基础/ }).click()
  await expect(page.getByRole("menu", { name: "添加内容", exact: true })).toHaveCount(0)
  await expect(input).not.toHaveValue("请先检查数据，再提出分析方案")
  await add.click()
  await expect(page.getByRole("menuitem", { name: "撤回上次优化", exact: true })).toHaveCount(0)
  await page.getByRole("menuitem", { name: "优化输入", exact: true }).click()
  await page.screenshot({ path: `${shots}/optimization-submenu-with-undo.png`, animations: "disabled" })
  const primary = (await page.getByRole("menu", { name: "添加内容", exact: true }).boundingBox())!
  const secondary = (await page.getByRole("menu", { name: "选档位", exact: true }).boundingBox())!
  await page.screenshot({ path: `${shots}/optimization-cascade-detail.png`, animations: "disabled", scale: "css", clip: {
    x: primary.x - 8, y: primary.y - 8, width: secondary.x + secondary.width - primary.x + 16,
    height: Math.max(primary.y + primary.height, secondary.y + secondary.height) - primary.y + 16,
  } })
  await page.getByRole("menuitem", { name: "撤回上次优化", exact: true }).click()
  await expect(input).toHaveValue("请先检查数据，再提出分析方案")
  await add.click()
  const mainMenu = page.getByRole("menu", { name: "添加内容", exact: true })
  const beforeHeight = await mainMenu.evaluate(el => (el as HTMLElement).offsetHeight)
  const modes = page.getByRole("menuitem", { name: "优化输入", exact: true })
  await modes.hover()
  await expect(page.getByRole("menu", { name: "选档位", exact: true })).toBeVisible()
  await page.getByRole("menuitemcheckbox", { name: "先出方案", exact: true }).hover()
  await expect(page.getByRole("menu", { name: "选档位", exact: true })).toHaveCount(0)
  await modes.press("ArrowRight")
  const submenu = page.getByRole("menu", { name: "选档位", exact: true })
  await expect(submenu).toBeVisible()
  const primaryBounds = (await mainMenu.boundingBox())!
  const secondaryBounds = (await submenu.boundingBox())!
  expect(secondaryBounds.x).toBeGreaterThanOrEqual(primaryBounds.x + primaryBounds.width)
  expect(await mainMenu.evaluate(el => (el as HTMLElement).offsetHeight)).toBe(beforeHeight)
  await page.screenshot({ path: `${shots}/optimization-right-submenu.png`, animations: "disabled" })
  await page.keyboard.press("ArrowLeft")
  await expect(submenu).toHaveCount(0)
  await expect(modes).toBeFocused()
  await expect(mainMenu).toBeVisible()
  await page.getByRole("menuitemcheckbox", { name: "先出方案", exact: true }).click()
  await expect(root.locator(".plan-band")).toContainText("只看不改")
  await add.click()
  await expect(page.getByRole("menuitemcheckbox", { name: "先出方案", exact: true })).toHaveAttribute("aria-checked", "true")
  await page.screenshot({ path: `${shots}/home-menu-light.png`, animations: "disabled" })
  await page.getByRole("menuitemcheckbox", { name: "先出方案", exact: true }).click()
  await expect(root.locator(".plan-band")).toHaveCount(0)
  await checkFit(root)
})

test("项目目录、文件选择、方案提交、普通发送与亮暗主题", async ({ dawn }) => {
  const { page, app, workspace } = dawn
  mkdirSync(shots, { recursive: true })
  await 在项目里开会话(page)
  const root = page.locator("main.main")
  const input = root.getByPlaceholder(/输入问题/)
  await expect(root.locator(".composer-environment")).toContainText("workspace")
  await root.getByRole("button", { name: `工作目录：${workspace}`, exact: true }).click()
  await expect(page.getByRole("dialog", { name: "工作目录" })).not.toContainText(workspace)
  await page.keyboard.press("Escape")
  writeFileSync(join(workspace, "samples.csv"), "sample,value\nA,12\nB,18\n")
  await app.evaluate(({ dialog }, file) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] }) }, join(workspace, "samples.csv"))
  const add = root.getByRole("button", { name: "添加内容", exact: true })
  await add.click()
  await page.getByRole("menuitem", { name: "上传数据", exact: true }).click()
  await expect(input).toHaveValue("@samples.csv")
  await expect(page.getByRole("menu")).toHaveCount(0)
  await add.click()
  await page.getByRole("menuitemcheckbox", { name: "先出方案", exact: true }).click()
  await expect(root.locator(".plan-band")).toContainText("只看不改")
  await input.fill("分析一下数据")
  await input.press("Enter")
  await expect(root.locator(".plan-card")).toContainText("等你看")
  await add.click()
  await page.getByRole("menuitemcheckbox", { name: "先出方案", exact: true }).click()
  await expect(root.locator(".plan-band")).toHaveCount(0)
  await input.fill("你好")
  await root.getByRole("button", { name: "发送", exact: true }).click()
  await expect(root.locator(".turns")).toContainText(CANNED_REPLY)
  await expect(root.locator(".composer-controls > .ctx-meter")).toBeVisible()
  await expect(root.locator(".composer-session-usage .ctx-meter")).toHaveCount(0)
  await root.getByRole("button", { name: /^上下文 / }).click()
  await expect(root.getByRole("button", { name: "现在压缩", exact: true })).toBeVisible()
  await page.keyboard.press("Escape")
  await input.focus()
  await input.fill("继续检查样本数据")
  await checkFit(root)
  await page.screenshot({ path: `${shots}/session-light.png`, animations: "disabled" })
  await 进设置(page, "外观")
  await page.getByRole("radio", { name: "暗色", exact: true }).click()
  await page.getByRole("button", { name: "返回", exact: true }).click()
  await expect(page.locator("html.dawn-dark")).toHaveCount(1)
  await add.click()
  await page.screenshot({ path: `${shots}/session-menu-dark.png`, animations: "disabled" })
  await page.keyboard.press("Escape")
  await expect(input).toHaveValue("继续检查样本数据")
})

test("主侧对话输入区在窄栏可操作且不横向溢出", async ({ dawn }) => {
  const { page, app } = dawn
  mkdirSync(shots, { recursive: true })
  await 在项目里开会话(page)
  await 进坞(page, "对话")
  const side = page.locator("aside.right-dock")
  await side.getByRole("button", { name: "另开一段", exact: true }).click()
  await side.getByPlaceholder(/输入问题/).fill("侧边草稿")
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setSize(1180, 850))
  for (const width of [480, 280]) {
    // 复用已有宽度拖动手柄，真实触发布局。
    const sash = page.getByRole("separator", { name: "调整面板宽度" })
    await sash.focus()
    if (width === 280) for (let step = 0; step < 13; step++) await sash.press("ArrowRight")
    await expect(sash).toHaveAttribute("aria-valuenow", String(width))
    await checkFit(page.locator("main.main"))
    await checkFit(side)
    await side.getByRole("button", { name: "添加内容", exact: true }).click()
    await page.getByRole("menuitem", { name: "优化输入", exact: true }).click()
    const menu = page.getByRole("menu", { name: "添加内容" })
    const bounds = (await menu.boundingBox())!
    const flyout = (await page.getByRole("menu", { name: "选档位", exact: true }).boundingBox())!
    expect(await page.getByRole("menuitem", { name: "上传文件", exact: true }).evaluate(el => {
      const rect = el.getBoundingClientRect()
      return el.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2))
    })).toBe(true)
    expect(bounds.x).toBeGreaterThanOrEqual(0)
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(await page.evaluate(() => innerWidth))
    expect(flyout.x).toBeGreaterThanOrEqual(bounds.x + bounds.width)
    expect(flyout.x + flyout.width).toBeLessThanOrEqual(await page.evaluate(() => innerWidth))
    await page.screenshot({ path: `${shots}/side-${width}.png`, animations: "disabled" })
    await page.keyboard.press("Escape")
    await expect(page.getByRole("menu", { name: "选档位", exact: true })).toHaveCount(0)
    await page.keyboard.press("Escape")
    await expect(page.getByRole("menu", { name: "添加内容", exact: true })).toHaveCount(0)
    await expect(side.getByPlaceholder(/输入问题/)).toHaveValue("侧边草稿")
    await side.locator(".model-trigger").click()
    await expect(side.locator(".model-menu")).toBeVisible()
    await page.keyboard.press("Escape")
    await side.getByRole("button", { name: /^上下文 / }).click()
    const context = side.getByRole("dialog", { name: "上下文", exact: true })
    const popup = (await context.boundingBox())!
    const card = (await side.locator(".composer-card").boundingBox())!
    expect(popup.x).toBeGreaterThanOrEqual(card.x - 1)
    expect(popup.x + popup.width).toBeLessThanOrEqual(card.x + card.width + 1)
    await page.screenshot({ path: `${shots}/side-context-${width}.png`, animations: "disabled" })
    await page.keyboard.press("Escape")
    await side.locator(".composer textarea").focus()
    await expect(context).toHaveCount(0)
    await side.locator(".perm-pill-trigger").click()
    const permissions = side.getByRole("menu", { name: "工具权限", exact: true })
    const permissionBox = (await permissions.boundingBox())!
    expect(permissionBox.x).toBeGreaterThanOrEqual(card.x - 1)
    expect(permissionBox.x + permissionBox.width).toBeLessThanOrEqual(card.x + card.width + 1)
    await expect(permissions.getByRole("menuitemradio", { name: /完全访问权限/ })).toBeVisible()
    await page.keyboard.press("Escape")
    await page.screenshot({ path: `${shots}/side-toolbar-${width}.png`, animations: "disabled" })
  }
})

test("终端跟随强调色，上下文平时透明悬停有反馈，菜单跟随主题色", async ({ dawn }) => {
  const { page } = dawn
  mkdirSync(shots, { recursive: true })
  await 在项目里开会话(page)
  await page.getByPlaceholder(/输入问题/).fill("上下文配色检查")
  await page.getByPlaceholder(/输入问题/).press("Enter")
  await expect(page.locator(".turns")).toContainText(CANNED_REPLY)
  const environment = page.locator(".composer-environment")
  const inputBackground = await page.locator(".composer-box").evaluate(el => getComputedStyle(el).backgroundColor)
  await expect(environment).toHaveCSS("background-color", inputBackground)
  await expect(environment).toHaveCSS("border-bottom-width", "0px")
  expect(await page.locator(".composer-footer").evaluate(el => getComputedStyle(el).backgroundColor)).not.toBe(inputBackground)
  for (const theme of ["亮色", "暗色"]) {
    await 进设置(page, "外观")
    await page.getByRole("radio", { name: theme, exact: true }).click()
    const color = page.getByRole("textbox", { name: "颜色值，可输入 HEX 或 RGB", exact: true })
    await color.fill("#7564b1")
    await color.press("Enter")
    await page.getByRole("button", { name: "返回", exact: true }).click()
    await page.getByPlaceholder(/输入问题/).fill("检查数据")
    const colors = await page.locator(".composer-box").evaluate(el => {
      const probe = document.createElement("span")
      probe.style.color = "var(--dawn-accent)"
      probe.style.backgroundColor = "var(--dawn-accent-soft)"
      el.appendChild(probe)
      const style = getComputedStyle(probe)
      const result = { accent: style.color, background: style.backgroundColor, hover: "" }
      probe.style.backgroundColor = "var(--dawn-control-hover)"
      result.hover = getComputedStyle(probe).backgroundColor
      probe.remove()
      return result
    })
    const terminal = page.locator(".composer-tools .dock-toggle")
    await expect(terminal.locator("svg")).toHaveCSS("color", colors.accent)
    await expect(page.locator(".composer-tools .attach-trigger svg")).toHaveCSS("color", colors.accent)
    const meter = page.locator(".composer-controls .ctx-meter-trigger")
    await expect(meter).toHaveCSS("color", colors.accent)
    await expect(meter).toHaveCSS("font-size", "14px")
    await expect(meter).toHaveCSS("font-weight", "600")
    await expect(meter).toHaveCSS("background-color", "rgba(0, 0, 0, 0)")
    await meter.hover()
    await expect(meter).toHaveCSS("background-color", colors.hover)
    await meter.click()
    await expect(page.getByRole("dialog", { name: "上下文", exact: true })).toBeVisible()
    await expect(meter).toHaveCSS("background-color", colors.hover)
    await page.mouse.move(0, 0)
    await expect(meter).toHaveCSS("background-color", "rgba(0, 0, 0, 0)")
    await page.screenshot({ path: `${shots}/toolbar-accent-${theme}.png`, animations: "disabled", scale: "css" })
    await page.keyboard.press("Escape")
    await page.getByRole("button", { name: "添加内容", exact: true }).click()
    const upload = page.getByRole("menuitem", { name: "上传文件", exact: true })
    await upload.hover()
    await expect(upload).toHaveCSS("background-color", colors.background)
    await expect(upload.locator("svg")).toHaveCSS("color", colors.accent)
    const optimize = page.getByRole("menuitem", { name: "优化输入", exact: true })
    await optimize.hover()
    const expert = page.getByRole("menuitemradio", { name: /专家/ })
    await expert.hover()
    await expect(expert).toHaveCSS("background-color", colors.background)
    await expect(expert).toHaveCSS("color", colors.accent)
    await expect(optimize).toHaveCSS("background-color", colors.background)
    await page.screenshot({ path: `${shots}/accent-hover-${theme}.png`, animations: "disabled", scale: "css" })
    await page.keyboard.press("Escape")
    await page.keyboard.press("Escape")
    await page.locator(".composer-environment .ws-chip").click()
    const directories = page.getByRole("dialog", { name: "工作目录", exact: true })
    await expect(directories).toBeVisible()
    await expect.poll(async () => Math.round((await directories.boundingBox())!.width)).toBe(420)
    const search = directories.getByRole("searchbox")
    await expect(search).toBeFocused()
    await expect(search).toHaveCSS("outline-style", "none")
    const rows = directories.locator(".btn-menu-row")
    for (const row of await rows.all()) {
      expect((await row.boundingBox())!.height).toBeGreaterThanOrEqual(48)
      await expect(row).toHaveCSS("font-size", "16px")
      await expect(row.locator("svg").first()).toHaveCSS("color", colors.accent)
    }
    const selectedDirectory = directories.locator('[aria-checked="true"]')
    await expect(selectedDirectory).toHaveCSS("background-color", colors.background)
    await directories.locator(".workspace-menu-browse").hover()
    await expect(directories.locator(".workspace-menu-browse")).toHaveCSS("background-color", colors.background)
    await expect(directories.locator(".workspace-menu-browse")).toHaveCSS("color", colors.accent)
    await directories.screenshot({ path: `${shots}/workspace-roomy-${theme}.png`, animations: "disabled", scale: "css" })
    await page.keyboard.press("Escape")
  }
})
