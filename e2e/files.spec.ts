/**
 * 文件浏览与预览（②-A′ · F3/F4）。**跑真实构建产物。**
 *
 * 单元测试能证明 `readFileForPreview` 会回一个 base64。它证明不了
 * **那张图真的画在屏幕上**——中间还隔着协议、IPC、`data:` URI 与 CSP。
 * **CSP 尤其**：`img-src` 少写一个 `data:`，图就是一个空框，
 * 而所有单元测试照样全绿。
 */
import { test, expect, 进坞 } from "./fixtures.js"
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
  await page.getByRole("button", { name: /图\.png/ }).click()

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
  await page.getByRole("button", { name: /说明\.md/ }).click()
  // 渲染过的 markdown 里有真的 <h1>，不是一行 `# 分析结论`
  await expect(page.locator(".file-preview h1")).toHaveText("分析结论")

  await page.getByRole("button", { name: /跑\.py/ }).click()
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
  await page.getByRole("button", { name: /报告\.pdf/ }).click()

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
  await page.getByRole("button", { name: /小\.bin/ }).click()
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

  await page.getByRole("button", { name: /大图\.png/ }).click()
  const img = page.locator(".preview-img")
  await expect(img).toBeVisible()
  const 窄的时候 = (await img.boundingBox())!
  // 这就是作者看到的那张图：坞默认 380px，图被挤到三百出头
  expect(窄的时候.width).toBeLessThan(400)

  // ② 加宽
  await 加宽.click()
  await expect(page.locator(".files-wide")).toBeVisible()

  const 宽的时候 = (await img.boundingBox())!
  expect(
    宽的时候.width,
    `加宽之后没变大：${Math.round(窄的时候.width)}px → ${Math.round(宽的时候.width)}px`,
  ).toBeGreaterThan(窄的时候.width * 1.3)

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

  // ③ 重开之后两个数都还在
  await page.reload()
  await 进坞(page, "文件")
  await expect(page.locator(".files-wide")).toBeVisible()
  await expect.poll(async () => Math.round((await 树.boundingBox())!.width)).toBe(Math.round(拖后宽))
  const 存的高 = await page.evaluate(() => localStorage.getItem("dawn.global.file-tree-height"))
  expect(Math.abs(Number(存的高) - 拖后高)).toBeLessThan(3)
})
