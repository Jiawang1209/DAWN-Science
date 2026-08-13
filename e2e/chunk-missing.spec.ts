/**
 * **代码块的高亮分片取不到时，不许塌掉整屏**（2026-08-13）。**跑真实构建产物。**
 *
 * 作者两次撞见同一个崩溃：
 * `Failed to fetch dynamically imported module: …/highlighted-body-….js`。
 *
 * ## 它为什么会发生，以及为什么这不是「开发时才有的问题」
 *
 * `streamdown` 把代码块的语法高亮做成**懒加载分片**。而 Vite 的产物是内容哈希——
 * **一次重新构建就会换掉文件名并删掉旧的**。开着的那个窗口手里还是旧的 index，
 * 它去要旧名字，于是 404。
 *
 * 开发时是我反复 `npm run build` 造成的；**但在真实世界里，
 * 应用更新之后窗口没关，是同一件事**。
 *
 * ## 这条用例照真实场景造：把分片从磁盘上拿走
 *
 * 不是 mock 一个 import 失败——**那验的是我们对失败的想象**。
 * 直接删文件，让浏览器真的取不到。
 *
 * ## 它证明什么、不证明什么（2026-08-13 实测后写下的）
 *
 * **证明**：分片没了的时候，这一屏照常显示、内容一个字不少。
 *
 * **不证明**：`markdown.tsx` 里那道 `渲染兜底` 起了作用。
 * 实测下来它**一次都没开火**（诊断打出来是 0），代码块照常渲染了——
 * 也就是说 `streamdown` 在这种情况下自己会降级，压根没有异常冒出来。
 *
 * **所以这条用例曾经是假绿的**：我把兜底摘掉重跑，它照样通过。
 * 留着它是因为上面那条「不许塌屏」的性质本身值得钉住；
 * 但**它不能被当成「兜底有效」的证据**——那道兜底针对的是
 * 别的会抛的失败路径，而作者撞见的那次崩溃，我在当前构建上复现不出来。
 */
import { test, expect, 开一段临时会话, 等进了对话 } from "./fixtures.js"
import { readdirSync, renameSync } from "node:fs"
import { join, resolve } from "node:path"

const ASSETS = resolve(import.meta.dirname, "..", "dist", "ui", "assets")

/** 把高亮分片挪走，返回一个「放回去」的函数——**一定要放回去**，别的用例还要用 */
function 藏起高亮分片(): () => void {
  const 名字 = readdirSync(ASSETS).filter((f) => f.startsWith("highlighted-body-"))
  const 藏 = 名字.map((f) => [join(ASSETS, f), join(ASSETS, `${f}.hidden`)] as const)
  for (const [从, 到] of 藏) renameSync(从, 到)
  return () => {
    for (const [从, 到] of 藏) {
      try {
        renameSync(到, 从)
      } catch {
        /* 已经放回去了 */
      }
    }
  }
}

test("**分片取不到时，这一屏照常显示，内容一个字不少**", async ({ dawn }) => {
  const { page } = dawn
  await 开一段临时会话(page)
  await 等进了对话(page)

  const 放回去 = 藏起高亮分片()
  try {
    // 让假模型回一段**带围栏代码块**的 markdown（那是唯一会去要那个分片的东西）
    await page.getByPlaceholder(/今天帮你做些什么/).fill("给我一段 markdown")
    await page.getByRole("button", { name: "发送", exact: true }).click()

    /**
     * ① **整屏没塌。** 这是这条用例的全部要点——
     * 一个代码块高亮不了，与「整个界面没了」差着好几个量级。
     */
    await expect(page.locator(".turns")).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText("界面崩溃了")).toHaveCount(0)

    /** ② **内容一个字都不少**——丢的只该是配色 */
    await expect(page.locator(".turns")).toContainText(/一级标题/, { timeout: 30_000 })
  } finally {
    放回去()
  }
})
