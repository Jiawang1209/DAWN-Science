/**
 * 窗口重新获得焦点时重取账本（①-B″ · U4 追加项的一半）。**跑真实构建产物。**
 *
 * ## 这条守的是什么
 *
 * 产出栏的数字**不是存下来的，是 `getRun` 每次调用现算的**。
 * 所以「作者切到编辑器改了几个文件，再切回 DAWN」这个场景里，
 * **屏幕上那份 diff 已经是旧的了**——而且它长得和新的一模一样，
 * 没有任何东西会说它过期了。**这种过期最难被发现，因为它不出错。**
 *
 * 这里把整个环走一遍：真实构建产物 + 真 git 仓库 + 从**应用外面**改文件。
 *
 * ## 一处如实标注
 *
 * 触发用的是在页面里派发 `focus` 事件，**不是操作系统层面真的切窗口**——
 * 后者在无头环境里不可靠。所以这条证明的是「focus 事件到了，那条链会重取」，
 * 证明不了「macOS 一定会在切回来时派发这个事件」。
 * 后半截由浏览器/Electron 的标准行为担保，不由本测试担保。
 */
import { writeFileSync } from "node:fs"
import { join } from "node:path"
import { test, expect, 在项目里开会话 } from "./fixtures.js"

test.use({ dawnOptions: { gitInit: true } })

test("从应用外面改了文件，切回来就看得见", async ({ dawn }) => {
  const { page, workspace } = dawn
  await expect(page.locator(".app-shell")).toBeVisible()
  await 在项目里开会话(page)
  await page.getByPlaceholder(/回车发送/).fill("你好")
  await page.getByRole("button", { name: "发送", exact: true }).click()
  await expect(page.getByText(/假模型已应答/).last()).toBeVisible()

  await page.getByRole("button", { name: "项目概览" }).click()
  const 产出 = page.locator(".panel", { hasText: "产出" })
  // 起点：仓库干净。**先断言这一句**，否则后面那句可能一开始就成立
  await expect(产出).toContainText("未改动任何文件")

  // 作者切到编辑器，改了一个文件。DAWN 此刻一无所知
  writeFileSync(join(workspace, "作者手改的.py"), "print('hi')\n")
  await expect(产出).toContainText("未改动任何文件")

  // 切回 DAWN
  await page.evaluate(() => window.dispatchEvent(new Event("focus")))
  await expect(产出).toContainText("作者手改的.py")
})
