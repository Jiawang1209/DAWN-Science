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
const 乙 = join(目录, "乙.csv")

test.beforeAll(() => {
  rmSync(目录, { recursive: true, force: true })
  mkdirSync(目录, { recursive: true })
  writeFileSync(甲, "a,b\n1,2\n")
  writeFileSync(乙, "c,d\n3,4\n")
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

    const 框 = page.getByPlaceholder(/回车发送/)
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
    const 框 = page.getByPlaceholder(/回车发送/)
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

  for (const 名 of ["上传文件", "上传图片", "上传数据"]) {
    test(`**「${名}」点下去，路径进了输入框**`, async ({ dawn }) => {
      const { page } = dawn
      const 框 = page.getByPlaceholder(/回车发送/)
      await page.locator(".composer-controls .attach-trigger").click()
      await page.getByRole("menuitem", { name: 名, exact: true }).click()
      await expect(框).toHaveValue(/甲\.csv/)
      // 点完就收起——菜单不该赖着不走
      await expect(page.getByRole("menu", { name: "添加内容" })).toHaveCount(0)
    })
  }
})
