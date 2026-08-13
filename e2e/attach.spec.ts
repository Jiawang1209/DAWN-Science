/**
 * 输入卡左下角那颗 `＋`（2026-08-13）。**跑真实构建产物。**
 *
 * 作者给了一张 WorkBuddy 的截图：*「对话窗口里面要搞一个加号，就按照这个搞。」*
 *
 * ## 这份用例首先盯的是「没抄的那四样真的没出现」
 *
 * 截图里是六项。我们只做前两项，因为**只有前两项是真的**：
 * 图片与粘贴图片要多模态（协议与 provider 两侧都没有）；URL 要一个取网页的
 * 工具（agent 手上只有 `bash / edit / write`）；提示词片段我们根本没有。
 *
 * **摆一个点了没用的入口比没有更坏**（不变式 5）。这条与模型 pill 上
 * 「不出现倍率与活动徽标」是同一个判断，所以也照那条的写法钉住它。
 */
import { test, expect, 开一段临时会话, 等进了对话 } from "./fixtures.js"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { mkdirSync, rmSync, writeFileSync } from "node:fs"

const 目录 = join(tmpdir(), "dawn-attach-e2e")
const 甲 = join(目录, "甲.csv")
const 图片 = join(目录, "一张图.png")
const 乙 = join(目录, "乙.csv")

test.beforeAll(() => {
  rmSync(目录, { recursive: true, force: true })
  mkdirSync(目录, { recursive: true })
  writeFileSync(甲, "a,b\n1,2\n")
  writeFileSync(乙, "c,d\n3,4\n")
  /**
   * **一张真的 PNG**（1×1，硬编的字节）。
   * 造一个假的 `.png` 文本文件不行：主进程会读它、算 base64，
   * 而 pi 那一侧对不是图的东西有话说——**用例要走的是成功那条路**。
   */
  writeFileSync(
    图片,
    Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64",
    ),
  )
})
test.afterAll(() => rmSync(目录, { recursive: true, force: true }))

test.describe("挑文件", () => {
  test.use({ dawnOptions: { pickFiles: [甲, 乙] } })

  /**
   * **一颗按钮，点开是三个选项**（作者第三次说清的：*「其实是一个按钮，
   * 点击进去有几个选项，上传文件，上传图片，上传数据」*）。
   *
   * 我在这件事上来回改了两次——**每次都是照着自己的推断改的**，
   * 而不是照着他的话。留个记号在这儿。
   */
  test("**一颗按钮，点开是三个选项**", async ({ dawn }) => {
    const { page } = dawn
    await 开一段临时会话(page)
    await 等进了对话(page)

    const 框 = page.getByPlaceholder(/今天帮你做些什么/)
    await 框.fill("看看这两个")
    await page.locator(".composer-controls .attach-trigger").click()

    const 菜单 = page.getByRole("menu", { name: "添加内容" })
    await expect(菜单).toBeVisible()
    await expect(菜单.getByRole("menuitem")).toHaveCount(3)

    /**
     * **三项是竖着排的一列，不是挤成一行**（作者：*「＋ 的这个样式，
     * 很难看，应该是一列的」*）。
     *
     * 第一版我只给了定位——而 `.menu` 这个类**根本没有定义**，
     * 于是它既没有底色也没有阴影，三项还并排挤在一起。
     * 判据挑「后一项的顶边在前一项的底边之下」：那是「一列」的定义本身，
     * 而不是某个具体的像素数（那种数改一次样式就要跟着改一次）。
     */
    const 项 = await 菜单.getByRole("menuitem").all()
    const 盒们 = await Promise.all(项.map((x) => x.boundingBox()))
    for (let i = 1; i < 盒们.length; i++) {
      expect(盒们[i]!.y, "三项没有竖着排").toBeGreaterThanOrEqual(
        盒们[i - 1]!.y + 盒们[i - 1]!.height - 1,
      )
      // 左缘齐平——一列里错开一两像素一眼就看得出来
      expect(Math.round(盒们[i]!.x)).toBe(Math.round(盒们[0]!.x))
    }
    // 它是个浮层：得有底色，不然会和下面的输入卡糊在一起
    const 底 = await 菜单.evaluate((el) => getComputedStyle(el).backgroundColor)
    expect(底).not.toBe("rgba(0, 0, 0, 0)")
    await 菜单.getByRole("menuitem", { name: "上传文件", exact: true }).click()
    await expect(框).toHaveValue(/甲\.csv/)
    await expect(框).toHaveValue(/乙\.csv/)

    /**
     * **接在已经打的字后面，不覆盖它。**
     * 覆盖的话，人打了一半的话会凭空消失——本项目为「东西自己没了」
     * 已经报过好几次。
     */
    await expect(框).toHaveValue(/看看这两个/)
  })

  /** **空态那一屏也有它**：一个动作可以有两个入口，但走的是同一份实现 */
  test("**空态那一屏也给这颗按钮**", async ({ dawn }) => {
    const { page } = dawn
    const 框 = page.getByPlaceholder(/今天帮你做些什么/)
    await 框.fill("先挑个文件")
    await page.locator(".composer-controls .attach-trigger").click()
    await page.getByRole("menuitem", { name: "上传文件", exact: true }).click()
    await expect(框).toHaveValue(/甲\.csv/)
  })
})

/**
 * **三项各自筛掉不同的东西**（2026-08-13，作者：*「点击进去有几个选项，
 * 上传文件，上传图片，上传数据，之类的」*）。
 *
 * 这条盯的是「菜单在、三项都在、点了真的走通」。
 * **类型过滤本身验不了**——那是系统对话框里的事，Playwright 够不着；
 * 夹具那个注入点绕过的正是这个对话框。所以这里不假装验它，
 * 只钉住「三个入口都真的通到插入路径上」。
 */
test.describe("三项都通", () => {
  test.use({ dawnOptions: { pickFiles: [甲] } })

  /**
   * **「上传图片」不在这一组里**（协议 4.12 之后）。
   * 它走的是附件那条路——图片要把**字节**送进模型，而不是把路径写进输入框。
   * 那条路由下面「图片真的送进模型」那一组盯着。
   */
  for (const 名 of ["上传文件", "上传数据"]) {
    test(`**「${名}」点下去，路径进了输入框**`, async ({ dawn }) => {
      const { page } = dawn
      const 框 = page.getByPlaceholder(/今天帮你做些什么/)
      await page.locator(".composer-controls .attach-trigger").click()
      await page.getByRole("menuitem", { name: 名, exact: true }).click()
      await expect(框).toHaveValue(/甲\.csv/)
      // 点完就收起——菜单不该赖着不走
      await expect(page.getByRole("menu", { name: "添加内容" })).toHaveCount(0)
    })
  }
})


/**
 * **图片是真的送进模型的**（协议 4.12，2026-08-13）。
 *
 * 作者：*「是否识别图片，那是 LLM 的事情，而不是我们工具的事情，
 * 别忘了我还有 kimi-2.7，这是带有图像识别的。」*
 *
 * ## 这一条盯的是「字节真的到了对面」，不是「界面上有个 chip」
 *
 * 上传图片与上传文件走的是**两条不同的路**，而这个区别是实打实的：
 * 一个 CSV 的路径正是 agent 要的（它会去读那个文件）；
 * 而一张图的路径对带视觉的模型毫无用处——它要的是字节。
 *
 * 假模型收到图片时会回一句「我收到了 N 张图」（`mock-inference-server.mjs`），
 * 那句话**只有请求里真的带了 `image_url` 片段才会出现**。
 * 断言它，就等于断言这一整条链路是通的：
 * 界面 → 协议 `images` → 主进程读盘 + base64 → pi 的 `prompt(text, {images})` → 请求体。
 */
test.describe("图片真的送进模型", () => {
  test.use({ dawnOptions: { pickFiles: [图片] } })

  test("**附一张图发出去，模型那边收到了**", async ({ dawn }) => {
    const { page } = dawn
    await 开一段临时会话(page)
    await 等进了对话(page)

    await page.locator(".composer-controls .attach-trigger").click()
    await page.getByRole("menuitem", { name: "上传图片", exact: true }).click()

    /**
     * ① **发出去之前看得见，而且看见的是图本身**（2026-08-13，作者给了
     * 一张 Codex 的截图）。
     *
     * 一行文件名回答不了「我挑对了吗」——同一个目录里七张
     * `截图 …11.02.31.png` 长得一模一样。**缩略图是唯一能一眼确认的东西。**
     *
     * 缩略图由主进程给（缩到 320px 再回），所以它是**后到的**：
     * 用例等它，而不是假设它同步就位。
     */
    const chip = page.locator(".attached-one")
    await expect(chip).toHaveCount(1)
    const 图 = chip.locator(".attached-thumb")
    await expect(图).toBeVisible({ timeout: 10_000 })
    await expect(图).toHaveAttribute("src", /^data:image\//)

    await page.getByPlaceholder(/今天帮你做些什么/).fill("看看这张")
    await page.getByRole("button", { name: "发送", exact: true }).click()

    // ② **字节真的到了对面。** 这句话只有请求里带了 image_url 才会出现
    await expect(page.locator(".turns").getByText(/我收到了 1 张图/)).toBeVisible({
      timeout: 30_000,
    })

    // ③ 发完就清空——留着的话下一句会把同一张图再送一遍
    await expect(page.locator(".attached-one")).toHaveCount(0)
  })

  test("**挑错了能单独摘掉**", async ({ dawn }) => {
    const { page } = dawn
    await 开一段临时会话(page)
    await 等进了对话(page)

    await page.locator(".composer-controls .attach-trigger").click()
    await page.getByRole("menuitem", { name: "上传图片", exact: true }).click()
    await expect(page.locator(".attached-one")).toHaveCount(1)

    await page.getByRole("button", { name: /不发这张/ }).click()
    await expect(page.locator(".attached-one")).toHaveCount(0)
  })
})

/**
 * **占位符承诺的两件事，必须真的会发生**（2026-08-13，作者定的那句话）。
 *
 * 提示写着「@引用工作区文件，/调用技能与指令」。
 * **一句会撒谎的提示比没有提示坏得多**——人照着敲一个 `@`，什么都不发生，
 * 此后他就再也不信这个输入框说的任何话了。
 *
 * 作者还说了*「每个对话框都要有这个提示的功能奥」*，
 * 所以两屏都验：只在一屏上兑现的承诺，换一屏就成了谎。
 */
test.describe("提示不说谎", () => {
  test.use({ dawnOptions: { pickFiles: [甲] } })

  for (const [屏, 进去] of [
    ["首页", async () => {}],
    ["对话", async (page: import("@playwright/test").Page) => {
      await 开一段临时会话(page)
      await 等进了对话(page)
    }],
  ] as const) {
    test(`**${屏}：那句提示在，而且 @ 与 / 都真的有反应**`, async ({ dawn }) => {
      const { page } = dawn
      await 进去(page)

      const 框 = page.getByPlaceholder(/今天帮你做些什么/)
      await expect(框).toBeVisible()

      // `/` 打开命令面板 —— 技能与指令都在那儿
      await 框.press("/")
      await expect(page.getByRole("dialog", { name: /命令面板/ })).toBeVisible()
      await page.keyboard.press("Escape")
      // **别把那个 `/` 留在框里**：拦下来了就不该再落字
      await expect(框).toHaveValue("")

      // `@` 开文件浏览器，挑完把路径写进来
      await 框.press("@")
      await expect(框).toHaveValue(/甲\.csv/, { timeout: 10_000 })
    })
  }
})

/**
 * **粘贴板里的图也送得进去**（协议 4.13，2026-08-13，作者：
 * *「能否类似于 codex、hermes，或者 workbuddy 一样，可以直接复制粘贴图片」*）。
 *
 * ## 为什么它不能复用「路径」那条路
 *
 * **剪贴板里的截图不是磁盘上的一个文件**——它没有路径。
 * 硬给它编一个临时路径写到盘上，等于为了迁就形状去制造垃圾文件。
 * 所以协议里那一项是判别式联合：`path` 一支给挑出来的，`bytes` 一支给粘进来的。
 *
 * 这里用 `DataTransfer` 造一次真的 paste 事件——**走的是浏览器真实的那条路**，
 * 不是直接调组件的回调。
 */
test("**粘一张图进输入框，模型那边收到了**", async ({ dawn }) => {
  const { page } = dawn
  await 开一段临时会话(page)
  await 等进了对话(page)

  const 框 = page.getByPlaceholder(/今天帮你做些什么/)
  await 框.click()

  // 造一次真的粘贴：1×1 的 PNG
  await page.evaluate(() => {
    const b64 =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
    const bin = atob(b64)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    const file = new File([bytes], "屏幕截图.png", { type: "image/png" })
    const dt = new DataTransfer()
    dt.items.add(file)
    const el = document.querySelector(".composer-field") as HTMLTextAreaElement
    el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true }))
  })

  /**
   * ① 粘完看得见，**而且立刻就是图本身**。
   *
   * 粘贴这一支的预览**不用问主进程**——字节已经在手上了。
   * 所以它与「从磁盘挑」那条不同：这里不该有等待窗口。
   */
  await expect(page.locator(".attached-one")).toHaveCount(1, { timeout: 10_000 })
  await expect(page.locator(".attached-thumb")).toHaveAttribute("src", /^data:image\//)

  await 框.fill("看看这张粘的")
  await page.getByRole("button", { name: "发送", exact: true }).click()

  // ② **字节真的到了对面**
  await expect(page.locator(".turns").getByText(/我收到了 1 张图/)).toBeVisible({
    timeout: 30_000,
  })
})

/**
 * **粘文字仍然是粘文字。**
 *
 * 这一条比上面那条更容易被写坏：为了接住图片而无脑 `preventDefault`，
 * 会把最常用的那个动作整个弄坏，而且没人会想到去怪「图片附件」这个功能。
 */
test("**粘一段文字，照常进输入框**", async ({ dawn }) => {
  const { page } = dawn
  await 开一段临时会话(page)
  await 等进了对话(page)

  const 框 = page.getByPlaceholder(/今天帮你做些什么/)
  await 框.click()

  /**
   * **判据是「我们没有拦」，不是「字出现在框里」。**
   *
   * 合成的 `ClipboardEvent` 不会触发浏览器真正的默认插入动作——
   * 拿「框里有没有字」当判据，这条用例测的就成了 Playwright 的合成事件，
   * 而不是我们的代码。（第一版就是这么写的，红了。）
   *
   * `defaultPrevented` 才是我们这一侧唯一的决定：拦了，文字粘贴就坏了。
   */
  const 拦了 = await page.evaluate(() => {
    const dt = new DataTransfer()
    dt.setData("text/plain", "粘进来的一段话")
    const ev = new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true })
    const el = document.querySelector(".composer-field") as HTMLTextAreaElement
    el.dispatchEvent(ev)
    return ev.defaultPrevented
  })
  expect(拦了, "文字粘贴被拦下了——最常用的那个动作会坏掉").toBe(false)
  await expect(page.locator(".attached-one")).toHaveCount(0)
})
