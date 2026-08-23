/**
 * 文件浏览与预览（②-A′ · F3/F4）。**跑真实构建产物。**
 *
 * 单元测试能证明 `readFileForPreview` 会回一个 base64。它证明不了
 * **那张图真的画在屏幕上**——中间还隔着协议、IPC、`data:` URI 与 CSP。
 * **CSP 尤其**：`img-src` 少写一个 `data:`，图就是一个空框，
 * 而所有单元测试照样全绿。
 */
import { test, expect, 进坞, 在项目里开会话 } from "./fixtures.js"
import { tmpdir } from "node:os"
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"

/** 1×1 的红点 png。**真图，不是占位串**——要验的就是它能被解码渲染 */
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
)

test("目录树能翻，图片直接显示在应用里", async ({ dawn }) => {
  const { page, workspace } = dawn

  mkdirSync(join(workspace, "out"), { recursive: true })
  writeFileSync(join(workspace, "out", "图.png"), PNG)
  writeFileSync(join(workspace, "out", "说明.md"), "# 分析结论\n\n这是正文。\n")

  await 进坞(page, "文件")

  // 根目录默认展开；点进 out
  /**
   * **目录名要 `exact`**（2026-08-18）：树行上那颗常驻的「⋯」
   * 带着 `aria-label="目录操作：out"`，而**按名字找是子串匹配**——
   * `/out/` 会一次命中两个。这是设计契约里那条
   * 「放行的那几个短词，用例里一律 exact」的又一例。
   */
  await page.getByRole("button", { name: "out", exact: true }).click()
  await page.getByRole("button", { name: /^图\.png/ }).click()

  const img = page.locator(".preview-img")
  await expect(img).toBeVisible()
  // **真的解码了**：加载失败的 <img> 也「可见」，但自然宽度是 0
  expect(await img.evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0)
})

test("markdown 走渲染，其它文本按原文", async ({ dawn }) => {
  const { page, workspace } = dawn
  writeFileSync(join(workspace, "说明.md"), "# 分析结论\n")
  writeFileSync(join(workspace, "跑.py"), "print('hi')\n")

  await 进坞(page, "文件")
  await page.getByRole("button", { name: /^说明\.md/ }).click()
  // 渲染过的 markdown 里有真的 <h1>，不是一行 `# 分析结论`
  await expect(page.locator(".file-preview h1")).toHaveText("分析结论")

  await page.getByRole("button", { name: /^跑\.py/ }).click()
  // **代码不该被当成 markdown 改写**
  await expect(page.locator(".preview-text")).toContainText("print('hi')")
})

test("**PDF 在应用里就能看**（②-A′ · F5），而且没有被 CSP 拦下", async ({ dawn }) => {
  const { page, workspace } = dawn
  /**
   * 一个最小的合法 PDF。**真文件，不是占位字节**——
   * Chromium 的阅读器拿到坏文件会给一片白，而那正是我们要区分的失败样子。
   */
  const PDF = [
    "%PDF-1.1",
    "1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj",
    "2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj",
    "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj",
    "trailer<</Root 1 0 R>>",
  ].join("\n")
  writeFileSync(join(workspace, "报告.pdf"), PDF)

  const 违规: string[] = []
  page.on("console", (m) => {
    if (/Content Security Policy|Refused to/i.test(m.text())) 违规.push(m.text())
  })

  await 进坞(page, "文件")
  await page.getByRole("button", { name: /^报告\.pdf/ }).click()

  const embed = page.locator(".preview-pdf")
  await expect(embed).toBeVisible()
  // **走的是 blob**：既不给渲染进程 file://，也不用会被 frame 拦掉的 data:
  expect(await embed.getAttribute("src")).toMatch(/^blob:/)
  await expect(page.locator(".preview-head .sub")).toContainText("application/pdf")

  /**
   * **这一条是这批改动的要害。** `object-src` 少写一个 `blob:`，
   * 上面的断言全部照样通过——`<embed>` 元素在、src 是 blob:、只是里面一片白。
   */
  expect(违规, `PDF 被 CSP 拦下了：\n${违规.join("\n")}`).toEqual([])
})

test("**超上界的 PDF 说清多大**，而不是硬塞进内存", async ({ dawn }) => {
  const { page, workspace } = dawn
  // **先造文件再打开文件视图**：目录树是打开那一刻读的一层，
  // 反过来写的话它根本不在树里（上一版就是这么超时的）
  writeFileSync(join(workspace, "小.bin"), Buffer.alloc(16))
  await 进坞(page, "文件")
  await page.getByRole("button", { name: /^小\.bin/ }).click()
  await expect(page.locator(".preview-other .caveat")).toContainText("不能在应用里预览")
})

test("**忽略掉的目录要出声**——不然人会以为它们不存在", async ({ dawn }) => {
  const { page, workspace } = dawn
  mkdirSync(join(workspace, "node_modules"), { recursive: true })

  await 进坞(page, "文件")
  await expect(page.locator(".tree-note").first()).toContainText("已忽略")
})

/**
 * **大图看不清：把预览挪到树旁边，而不是另开一屏**（作者 2026-08-19 报的）。
 *
 * > *「我点击一个图片，然后发现有的图片太大了，导致我回不到文件选择的地方了。」*
 * > 随后，看过我做的第一版之后：
 * > *「其实我们不能在主区放图啊，我们要放到旁边的文件区域的旁边，学习一下 codex。」*
 *
 * ## 先把量到的和报的分开
 *
 * 动手前用一次性探针在真实产物上量过：**树一直在**（`.file-tree` 可见、
 * 251px、可滚），「回不去」没复现；**但图被挤成 317×475**，看不清是真的。
 * 所以这一轮做的不是「修一个回不去的 bug」，是「给大图一个够宽的地方」。
 *
 * ## 走错过一版，两条判据同时指回来
 *
 * 第一版做成了主区那一整屏。作者当场否掉（上面那句），而 e2e 从另一头
 * 量到同一件事：**图从 317px 只变成 312px**——坞还占着 377px，等于白铺开。
 * 现在是坞里横着分两栏：**左树、右预览**（08-19 先照 Codex 做成左预览右树，
 * 08-20 作者改成左树右预览；两边理由见 `styles.css` 的 `.files-wide`）。
 *
 * ## 这条用例盯四件
 *
 * 1. 「加宽」**看得见**（不是悬停才出现——本项目为这个栽过两次，
 *    而 `toBeVisible()` 对 `opacity: 0` 仍然算可见，所以直接量）；
 * 2. 加宽之后**图真的变大了**（量 `getBoundingClientRect()`，不是「看起来大了」）；
 * 3. **左树、右预览**：树在预览的左边，不是上边——这是作者指定的那个形状；
 * 4. **对话还在**（这正是当初把文件从整屏搬进坞的全部理由，也是不做主区那一屏的理由）。
 */
test("**大图：坞拉宽之后，预览挪到树旁边并且真的变大**", async ({ dawn }) => {
  const { app, page, workspace } = dawn

  /**
   * **先把窗口开大。** 这不是为了让用例好过——三列并排本来就要地方：
   * 侧栏 264 + 对话那一列承诺的 420 + 坞。夹具默认那个 1280 的窗口，
   * 坞最宽只能到 596，减掉树那 220，预览反而不比摞着的时候宽。
   *
   * **这条约束是真的，不是测试环境的怪癖**，所以它写在这儿而不是被绕开：
   * 窗口不够宽时「加宽」那颗按钮就不该出现（`坞的上界` 管这件事），
   * 而下面这条用例验的是「窗口够宽时它确实有用」。
   */
  await app.evaluate(async ({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.setSize(1600, 900)
  })
  await page.waitForFunction(() => window.innerWidth >= 1560)

  /**
   * 2400×3600 的灰度 PNG。**尺寸才是要害，不是字节数**——
   * 挤扁一张图的是版面宽度，与文件多大无关。
   * 现造而不是塞一个二进制进仓库：这几行比一个说不清来历的 fixture 好读。
   */
  const { deflateSync } = await import("node:zlib")
  const 造大图 = (W: number, H: number) => {
    const crcTable: number[] = []
    for (let n = 0; n < 256; n++) {
      let c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      crcTable[n] = c >>> 0
    }
    const crc32 = (buf: Buffer) => {
      let crc = 0xffffffff
      for (const b of buf) crc = crcTable[(crc ^ b) & 0xff]! ^ (crc >>> 8)
      return (crc ^ 0xffffffff) >>> 0
    }
    const chunk = (type: string, data: Buffer) => {
      const len = Buffer.alloc(4)
      len.writeUInt32BE(data.length)
      const td = Buffer.concat([Buffer.from(type, "ascii"), data])
      const crc = Buffer.alloc(4)
      crc.writeUInt32BE(crc32(td))
      return Buffer.concat([len, td, crc])
    }
    const raw = Buffer.alloc((W + 1) * H)
    for (let y = 0; y < H; y++) {
      raw[y * (W + 1)] = 0
      for (let x = 0; x < W; x++) raw[y * (W + 1) + 1 + x] = (x ^ y) & 0xff
    }
    const ihdr = Buffer.alloc(13)
    ihdr.writeUInt32BE(W, 0)
    ihdr.writeUInt32BE(H, 4)
    ihdr[8] = 8
    ihdr[9] = 0
    return Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      chunk("IHDR", ihdr),
      chunk("IDAT", deflateSync(raw)),
      chunk("IEND", Buffer.alloc(0)),
    ])
  }
  writeFileSync(join(workspace, "大图.png"), 造大图(2400, 3600))

  await 进坞(page, "文件")

  // ① 入口看得见。**`toBeVisible` 对 opacity:0 仍然算可见，所以直接量**
  const 加宽 = page.getByRole("button", { name: "加宽" })
  await expect(加宽).toBeVisible()
  expect(await 加宽.evaluate((el) => getComputedStyle(el).opacity)).toBe("1")

  await page.getByRole("button", { name: /^大图\.png/ }).click()
  const img = page.locator(".preview-img")
  await expect(img).toBeVisible()
  const 窄的时候 = (await img.boundingBox())!
  // 这就是作者看到的那张图：坞默认 380px，图被挤到三百出头
  expect(窄的时候.width).toBeLessThan(400)

  // ② 加宽
  await 加宽.click()
  await expect(page.locator(".files-wide")).toBeVisible()

  // 坞现在跟着网格那一列走，列宽有 0.25s 过渡——等它到位再量（2026-08-21）
  await expect
    .poll(async () => (await img.boundingBox())!.width, { message: "加宽之后没变大" })
    .toBeGreaterThan(窄的时候.width * 1.3)
  const 宽的时候 = (await img.boundingBox())!

  /**
   * ③ **左树、右预览**——作者 2026-08-20 指定的形状，不是「反正两栏就行」。
   *
   * **这条判据翻过一次面**：08-19 那版断言的是「树靠右」（Codex 截图的形状，
   * 我的理由是导航靠窗口边）；次日作者说换过来——他常用的文件管理器全是
   * 左树右内容，手习惯往左找。两边理由都留在 `styles.css` 里。
   */
  const 树 = (await page.locator(".file-tree").boundingBox())!
  const 预览 = (await page.locator(".file-preview").boundingBox())!
  expect(树.x, "树跑到预览右边了——作者要的是左树右预览").toBeLessThan(预览.x)
  // 而且是**并排**，不是上下摞（摞着的话两者 y 会差一整栏）
  expect(Math.abs(树.y - 预览.y)).toBeLessThan(4)

  /**
   * ④ **对话还在。** 这是当初把文件从整屏搬进坞的全部理由，
   * 也是这一轮不做主区那一屏的理由——加宽只是挤窄对话，不是顶掉它。
   */
  await expect(page.getByPlaceholder(/今天帮你做些什么/)).toBeVisible()

  // 加宽之后那颗按钮就该消失：按下去什么都不变的按钮比没有更让人怀疑自己点错了
  await expect(page.getByRole("button", { name: "加宽" })).toHaveCount(0)
})

/**
 * **树与预览之间那条缝能拖**（2026-08-21，作者：*「面板中的文件和预览之间，应该可以挪动，现在没办法挪动」*）。
 *
 * 两种摆法各一条缝：窄坞上下摆，缝横着、拖的是树的高；宽坞左右摆，缝竖着、拖的是树的宽。
 * 拖完的数要记住——重开之后还是那个数，不然每次打开都得再拖一遍。
 */
test("**树 ↔ 预览的缝：窄坞上下拖、宽坞左右拖，都记得住**", async ({ dawn }) => {
  const { app, page } = dawn
  await 进坞(page, "文件")
  const 树 = page.locator(".file-tree")
  await expect(树).toBeVisible()
  const 缝 = page.locator(".file-tree-box .side-sash")
  const 拖 = async (dx: number, dy: number) => {
    await 缝.hover()
    const b = (await 缝.boundingBox())!
    await page.mouse.down()
    await page.mouse.move(b.x + b.width / 2 + dx, b.y + b.height / 2 + dy, { steps: 8 })
    await page.mouse.up()
  }

  // ① 窄坞：缝横着，往下拖树变高
  await expect(缝).toHaveAttribute("aria-orientation", "horizontal")
  const 起高 = (await 树.boundingBox())!.height
  await 拖(0, 80)
  await expect.poll(async () => (await 树.boundingBox())!.height).toBeGreaterThan(起高 + 60)
  const 拖后高 = (await 树.boundingBox())!.height

  // ② 宽坞：缝竖着，往右拖树变宽
  await app.evaluate(async ({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.setSize(1600, 900)
  })
  await page.waitForFunction(() => window.innerWidth >= 1560)
  await page.getByRole("button", { name: "加宽" }).click()
  await expect(page.locator(".files-wide")).toBeVisible()
  await expect(缝).toHaveAttribute("aria-orientation", "vertical")
  const 起宽 = (await 树.boundingBox())!.width
  await 拖(100, 0)
  await expect.poll(async () => (await 树.boundingBox())!.width).toBeGreaterThan(起宽 + 80)
  const 拖后宽 = (await 树.boundingBox())!.width

  // ②′ 「收窄」是加宽的反向：回到默认宽，回到上下摆（作者：*「有加宽选项，怎么能没有恢复选项呢」*）
  await page.getByRole("button", { name: "收窄" }).click()
  await expect(page.locator(".files-wide")).toHaveCount(0)
  await expect(page.getByRole("button", { name: "加宽" })).toBeVisible()
  await page.getByRole("button", { name: "加宽" }).click()
  await expect(page.locator(".files-wide")).toBeVisible()

  // ③ 重开之后两个数都还在
  await page.reload()
  await 进坞(page, "文件")
  await expect(page.locator(".files-wide")).toBeVisible()
  await expect.poll(async () => Math.round((await 树.boundingBox())!.width)).toBe(Math.round(拖后宽))
  const 存的高 = await page.evaluate(() => localStorage.getItem("dawn.global.file-tree-height"))
  expect(Math.abs(Number(存的高) - 拖后高)).toBeLessThan(3)
})

/**
 * **树的记忆**（2026-08-21，学自 DSH-better-sidebar 的会话级状态）：展开过的目录、选中的文件，
 * 切到别的项目再切回来照样在。此前树靠 key 重挂，一切换全塌——而「agent 在改你的文件，
 * 你切个会话再切回来」是最常见的动作。
 */
test("**切走再切回来，树还展开着、文件还选着**", async ({ dawn }) => {
  const { page, workspace } = dawn
  mkdirSync(join(workspace, "深", "更深"), { recursive: true })
  writeFileSync(join(workspace, "深", "更深", "目标.md"), "# 目标\n")
  const 乙 = join(tmpdir(), `dawn-tree-memory-乙-${process.pid}`)
  mkdirSync(乙, { recursive: true })
  writeFileSync(join(乙, "别的.md"), "# 别的\n")

  // 在项目甲（夹具的 workspace）里开会话，打开文件面板，展开两层、选中目标
  await 在项目里开会话(page)
  await 进坞(page, "文件")
  const 树 = page.locator(".file-tree")
  await 树.getByRole("button", { name: /^深$/ }).click()
  await 树.getByRole("button", { name: /^更深$/ }).click()
  await 树.getByRole("button", { name: /^目标\.md/ }).click()
  await expect(page.locator(".file-preview")).toContainText("目标", { timeout: 30_000 })

  // 切到项目乙：树换成乙的，目标不在
  await page.evaluate(async (ws) => {
    const w = window as unknown as { dawn: { invoke: (op: string, req: unknown) => Promise<{ data?: { agents?: { agentId: string }[] } }> } }
    const p = await w.dawn.invoke("getProviders", {})
    await w.dawn.invoke("createTask", { agentId: p.data?.agents?.[0]?.agentId, workspace: ws })
  }, 乙)
  await expect(page.locator(".proj-list .proj-item")).toHaveCount(2, { timeout: 30_000 })
  // 项目名单 5 s 一拉；等它知道乙这个项目再点（点了靠它找 projectId）
  await page.waitForTimeout(5_500)
  // 2026-08-23 起文件夹各自展开（甲不再被乙顶收起），所以会话要在乙那一格里点，不能 `.first()`
  const 乙格 = page.locator(".proj-list .proj-item", { hasText: "dawn-tree-memory-乙" })
  await 乙格.locator(".proj-head .row").click()
  await 乙格.locator(".proj-session-list .sess-item .row").first().click()
  await expect(树.getByRole("button", { name: /^别的\.md/ })).toBeVisible({ timeout: 30_000 })
  await expect(树.getByRole("button", { name: /^目标\.md/ })).toHaveCount(0)

  // 切回甲：两层还展开着、目标还选着、预览还是它
  const 甲格 = page.locator(".proj-list .proj-item", { hasText: "workspace" })
  await 甲格.locator(".proj-session-list .sess-item .row").first().click()
  await expect(树.getByRole("button", { name: /^目标\.md/ }), "切回来树塌了").toBeVisible({ timeout: 30_000 })
  await expect(树.locator(".tree-row.active", { hasText: "目标.md" })).toHaveCount(1)
  await expect(page.locator(".file-preview")).toContainText("目标")
})

/**
 * **按名字搜**（dock-polish ③，2026-08-21）。三件事：深处的文件搜得到并且点了就开；
 * 默认忽略的目录不进去**而且说了**；查询变了旧结果不留。
 */
test("**按名字搜得到深处的文件，忽略掉的目录要出声**", async ({ dawn }) => {
  const { page, workspace } = dawn
  mkdirSync(join(workspace, "src", "ui", "state"), { recursive: true })
  writeFileSync(join(workspace, "src", "ui", "state", "right-dock.ts"), "export const x = 1\n")
  mkdirSync(join(workspace, "node_modules", "dock-lib"), { recursive: true })
  writeFileSync(join(workspace, "node_modules", "dock-lib", "dock.js"), "// 不该被搜到\n")

  await 进坞(page, "文件")
  const 面板 = page.locator(".right-dock .files-view")
  await 面板.getByRole("button", { name: "搜文件名", exact: true }).click()
  const 框 = 面板.getByPlaceholder("输文件名的一部分，Esc 退出搜索")
  await expect(框).toBeVisible()
  await 框.fill("dock")

  const 结果 = 面板.locator(".files-search-results")
  await expect(结果.getByRole("button", { name: /^right-dock\.ts/ })).toBeVisible()
  // node_modules 里那个不在单子上，而且说了跳过了它
  await expect(结果).not.toContainText("dock.js")
  await expect(结果.locator(".files-search-note")).toContainText("没进 1 个默认忽略的目录")

  // 点了就开
  await 结果.getByRole("button", { name: /^right-dock\.ts/ }).click()
  await expect(page.locator(".file-preview")).toContainText("export const x = 1")

  // 换个搜不到的词：旧结果不留，说清看了几条
  await 框.fill("不存在的名字")
  await expect(结果).toContainText("没有名字里带「不存在的名字」的")
  await expect(结果.getByRole("button", { name: /^right-dock\.ts/ })).toHaveCount(0)

  // Esc 退出：树回来了
  await 框.press("Escape")
  await expect(面板.getByRole("button", { name: "src", exact: true })).toBeVisible()
})

test("**命中到上限就停，并且说停在哪**", async ({ dawn }) => {
  const { page, workspace } = dawn
  mkdirSync(join(workspace, "多"), { recursive: true })
  for (let i = 0; i < 230; i++) writeFileSync(join(workspace, "多", `hit-${String(i).padStart(3, "0")}.txt`), "")

  await 进坞(page, "文件")
  const 面板 = page.locator(".right-dock .files-view")
  await 面板.getByRole("button", { name: "搜文件名", exact: true }).click()
  await 面板.getByPlaceholder("输文件名的一部分，Esc 退出搜索").fill("hit-")
  const 结果 = 面板.locator(".files-search-results")
  await expect(结果.locator(".files-search-note")).toContainText("只列了前 200 条就停了")
  await expect(结果.locator(".search-hit")).toHaveCount(200)
})

/**
 * **行菜单**（dock-polish ⑤）：复制相对 / 绝对路径、`@路径` 插进输入框。
 * 「⋯」与右键两个入口都验——右键是看不见的能力，「⋯」才是人找得到的那个。
 */
test("**树行的菜单：复制路径、插进输入框**", async ({ dawn }) => {
  const { page, workspace } = dawn
  mkdirSync(join(workspace, "data"), { recursive: true })
  writeFileSync(join(workspace, "data", "样本.csv"), "a,b\n1,2\n")
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"])

  await 在项目里开会话(page)
  await 进坞(page, "文件")
  const 面板 = page.locator(".right-dock .files-view")
  await 面板.getByRole("button", { name: "data", exact: true }).click()
  await expect(面板.getByRole("button", { name: /^样本\.csv/ })).toBeVisible()

  // ① 「⋯」→ 复制相对路径
  await 面板.getByRole("button", { name: "文件操作：样本.csv" }).click()
  await page.getByRole("menu").getByRole("menuitem", { name: "复制相对路径" }).click()
  await expect(面板.locator(".files-row-note")).toContainText("已复制相对路径：data/样本.csv")
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("data/样本.csv")

  // ② 右键 → 复制绝对路径（工作区 + 相对）
  await 面板.getByRole("button", { name: /^样本\.csv/ }).click({ button: "right" })
  await page.getByRole("menu").getByRole("menuitem", { name: "复制绝对路径" }).click()
  const 绝对 = await page.evaluate(() => navigator.clipboard.readText())
  expect(绝对.endsWith("/data/样本.csv")).toBe(true)
  expect(绝对.startsWith("/")).toBe(true)

  // ③ 目录也有；插进输入框 → 草稿末尾多了 `@data `
  await 面板.getByRole("button", { name: "目录操作：data" }).click()
  await page.getByRole("menu").getByRole("menuitem", { name: "插进输入框" }).click()
  await expect(page.getByPlaceholder(/今天帮你做些什么/)).toHaveValue("@data ")
  await 面板.getByRole("button", { name: "文件操作：样本.csv" }).click()
  await page.getByRole("menu").getByRole("menuitem", { name: "插进输入框" }).click()
  await expect(page.getByPlaceholder(/今天帮你做些什么/)).toHaveValue("@data @data/样本.csv ")
})

/**
 * **悬停卡与不换行**（2026-08-21 作者要的两条）：
 * ① 鼠标停在文件 / 文件夹上弹出信息卡（照左侧栏那张），开在坞的**左边**、不出屏；
 * ② 树拖得再窄，行上「时间 · 大小」也是一行，不折成两行把行撑高。
 */
test("**悬停文件弹信息卡；拖窄了时间戳也不折行**", async ({ dawn }) => {
  const { page, workspace } = dawn
  mkdirSync(join(workspace, "数据"), { recursive: true })
  writeFileSync(join(workspace, "数据", "一个名字很长很长很长很长的样本文件.csv"), "a,b\n1,2\n")

  await 进坞(page, "文件")
  const 面板 = page.locator(".right-dock .files-view")
  await 面板.getByRole("button", { name: "数据", exact: true }).click()
  const 行 = 面板.getByRole("button", { name: /^一个名字很长/ })
  await expect(行).toBeVisible()

  // ① 文件：卡上有所在目录、修改时间、大小；卡整个在坞的左边
  await 行.hover()
  const 卡 = page.locator(".sess-hover-card")
  await expect(卡).toBeVisible({ timeout: 5_000 })
  await expect(卡).toContainText("一个名字很长很长很长很长的样本文件.csv")
  await expect(卡.locator(".sess-hover-details li")).toHaveCount(3)
  await expect(卡).toContainText("数据")
  await expect(卡).toContainText(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}/)
  await expect(卡).toContainText("8 字节")
  const 卡框 = (await 卡.boundingBox())!
  const 坞框 = (await page.locator(".right-dock").boundingBox())!
  expect(卡框.x + 卡框.width).toBeLessThanOrEqual(坞框.x + 1)
  expect(卡框.x).toBeGreaterThanOrEqual(0)

  // 文件夹也弹：只有所在目录那一行
  await 面板.getByRole("button", { name: "数据", exact: true }).hover()
  await expect(卡.locator(".sess-hover-details li")).toHaveCount(1, { timeout: 5_000 })

  // ② 拖窄树（坞是窄的，缝横着——先加宽成两栏再把树拖窄）
  await 面板.getByRole("button", { name: "加宽" }).click()
  const 缝 = 面板.getByRole("separator", { name: "调整文件树宽度" })
  const 缝框 = (await 缝.boundingBox())!
  await page.mouse.move(缝框.x + 缝框.width / 2, 缝框.y + 缝框.height / 2)
  await page.mouse.down()
  await page.mouse.move(缝框.x - 200, 缝框.y + 缝框.height / 2, { steps: 6 })
  await page.mouse.up()
  const 高 = await 行.evaluate((el) => el.getBoundingClientRect().height)
  const 行高 = await 行.evaluate((el) => parseFloat(getComputedStyle(el).minHeight))
  expect(高, "时间 · 大小折成两行把行撑高了").toBeLessThanOrEqual(行高 + 1)
  const 副 = 行.locator(".sub")
  expect(await 副.evaluate((el) => getComputedStyle(el).whiteSpace)).toBe("nowrap")
})

/**
 * **窗口不大时的三条**（2026-08-21 作者截图给的）：
 * ① 顶行的放大镜 / 刷新 / 加宽（或收窄）在窄坞里也看得见、点得到——此前被裁在右边外面；
 * ② 行上先缩时间戳再缩文件名；
 * ③ 预览头：文件名不逐字竖排，按钮不折成竖条。
 */
test("**窄坞：顶行按钮都在、先缩时间戳、预览头不竖排**", async ({ dawn }) => {
  const { page, workspace } = dawn
  writeFileSync(join(workspace, "AGENTS.md"), "# 产物落位\n\n正文。\n")
  await page.setViewportSize({ width: 1200, height: 760 })

  await 进坞(page, "文件")
  const 面板 = page.locator(".right-dock .files-view")

  // ① 三颗都在面板的可视范围里
  // 第三颗是「加宽」还是「收窄」取决于此刻坞的宽度（顶到窗口上限时两颗都不给，那是设计）
  const 宽窄 = (await 面板.getByRole("button", { name: "收窄", exact: true }).count()) > 0 ? "收窄" : (await 面板.getByRole("button", { name: "加宽", exact: true }).count()) > 0 ? "加宽" : undefined
  for (const 名 of ["搜文件名", "刷新当前文件夹", ...(宽窄 ? [宽窄] : [])]) {
    const b = 面板.getByRole("button", { name: 名, exact: true })
    await expect(b).toBeVisible()
    const 框 = (await b.boundingBox())!
    const 盒 = (await 面板.boundingBox())!
    expect(框.x + 框.width, `${名} 被裁在面板外面`).toBeLessThanOrEqual(盒.x + 盒.width + 1)
  }

  // ② 文件行：名字与时间戳谁先缩——把树拖到很窄之后，名字仍有宽度、时间戳先没
  const 行 = 面板.getByRole("button", { name: /^AGENTS\.md/ })
  await expect(行).toBeVisible()
  // 把整个坞拖窄（坞自己那条缝往右推），树跟着窄——不管此刻是一栏还是两栏都成立
  const 缝 = page.getByRole("separator", { name: "调整面板宽度" })
  const 缝框 = (await 缝.boundingBox())!
  await page.mouse.move(缝框.x + 缝框.width / 2, 缝框.y + 缝框.height / 2)
  await page.mouse.down()
  await page.mouse.move(缝框.x + 400, 缝框.y + 缝框.height / 2, { steps: 8 })
  await page.mouse.up()
  const 名宽 = await 行.locator(".name").evaluate((el) => el.getBoundingClientRect().width)
  const 副宽 = await 行.locator(".sub").evaluate((el) => el.getBoundingClientRect().width)
  const 副内容宽 = await 行.locator(".sub").evaluate((el) => el.scrollWidth)
  expect(副宽, "时间戳该先缩").toBeLessThan(副内容宽)
  expect(名宽).toBeGreaterThan(40)

  // ③ 预览头
  await 行.click()
  const 头 = page.locator(".preview-head")
  await expect(头.locator(".name")).toHaveText("AGENTS.md")
  const 名高 = await 头.locator(".name").evaluate((el) => el.getBoundingClientRect().height)
  const 一行 = await 头.locator(".name").evaluate((el) => parseFloat(getComputedStyle(el).lineHeight))
  expect(名高, "文件名竖排了").toBeLessThanOrEqual(一行 + 1)
  const 删 = 头.getByRole("button", { name: "移到废纸篓" })
  const 删高 = (await 删.boundingBox())!.height
  expect(删高, "按钮折成竖条了").toBeLessThan(40)
})

/**
 * **坞不许伸出窗口**（2026-08-21 作者截图：窗口没最大化时，网格那一列被压窄了，
 * 坞却仍是 `width: 720px`，「加宽 / 搜索 / 刷新」全在屏幕右边看不见的地方）。
 * 坞现在占满那一列——列多宽它多宽，按钮跟着变。缝也贴坞的真实边。
 */
test("**坞宽过了窗口能给的：坞被压进窗口里，按钮都看得见，缝在坞的真实边上**", async ({ dawn }) => {
  const { page } = dawn
  await 进坞(page, "文件")
  // 先在宽窗口里把坞拉到最宽
  await page.setViewportSize({ width: 1600, height: 800 })
  const 面板 = page.locator(".right-dock .files-view")
  await 面板.getByRole("button", { name: "加宽", exact: true }).click()
  const 坞 = page.locator(".right-dock")
  // 列宽有 0.25s 的过渡，等它到位
  await expect.poll(async () => (await 坞.boundingBox())!.width).toBeGreaterThan(600)

  // 再把窗口缩小：坞必须整个在窗口里
  await page.setViewportSize({ width: 1000, height: 700 })
  await expect
    .poll(async () => {
      const b = (await 坞.boundingBox())!
      return Math.round(b.x + b.width)
    })
    .toBeLessThanOrEqual(1000)
  for (const 名 of ["搜文件名", "刷新当前文件夹"]) {
    const 框 = (await 面板.getByRole("button", { name: 名, exact: true }).boundingBox())!
    expect(框.x + 框.width, `${名} 在窗口外面`).toBeLessThanOrEqual(1000)
  }
  // 缝贴着坞此刻的左缘（不是按 720 算出来的位置）
  const 缝框 = (await page.getByRole("separator", { name: "调整面板宽度" }).boundingBox())!
  const 坞框 = (await 坞.boundingBox())!
  expect(Math.abs(缝框.x + 缝框.width / 2 - 坞框.x)).toBeLessThanOrEqual(3)
})
