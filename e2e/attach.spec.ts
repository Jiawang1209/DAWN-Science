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

  test("**只有「从磁盘挑…」与「整个目录…」两项**", async ({ dawn }) => {
    const { page } = dawn
    await 开一段临时会话(page)
    await 等进了对话(page)

    await page.locator(".composer-controls .attach-trigger").click()
    const 菜单 = page.getByRole("menu", { name: "添加附件" })
    await expect(菜单).toBeVisible()

    await expect(菜单.getByRole("menuitem", { name: /从磁盘挑…/ })).toBeVisible()
    await expect(菜单.getByRole("menuitem", { name: /整个目录…/ })).toBeVisible()

    /**
     * **没抄的那四样一个都不许冒出来。**
     * 它们看起来能点，点下去只能得到一句「我做不到」——
     * 那比这个入口不存在更坏。
     */
    const 文本 = (await 菜单.textContent()) ?? ""
    expect(文本).not.toMatch(/图片|粘贴|URL|片段/)
  })

  test("**挑完之后，路径真的进了输入框**", async ({ dawn }) => {
    const { page } = dawn
    await 开一段临时会话(page)
    await 等进了对话(page)

    const 框 = page.getByPlaceholder(/回车发送/)
    await 框.fill("看看这两个")

    await page.locator(".composer-controls .attach-trigger").click()
    await page.getByRole("menuitem", { name: /从磁盘挑…/ }).click()

    /**
     * **接在已经打的字后面，不覆盖它。**
     * 覆盖的话，人打了一半的话会凭空消失——本项目为「东西自己没了」
     * 已经报过好几次。
     */
    await expect(框).toHaveValue(/看看这两个/)
    await expect(框).toHaveValue(/甲\.csv/)
    await expect(框).toHaveValue(/乙\.csv/)

    // 点完就收起来——菜单不该赖着不走
    await expect(page.getByRole("menu", { name: "添加附件" })).toHaveCount(0)
  })
})
