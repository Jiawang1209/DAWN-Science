/**
 * **内容再长，App 也不许把整份文档撑高**（2026-08-15 作者报的）。**跑真实产物。**
 *
 * 作者三次描述这个现象，最后一次给出了条件：连着服务器、正在等响应、
 * **鼠标不在对话区**往下拉，就会拉出「App 页面之外的大片空白」。
 *
 * 我照那三条搭过三次都没复现。**真正的条件是第四条：内容够长**——
 * 假模型的回复只有几百像素，根本溢不出来；而那台服务器吐了几千行。
 * 远端与等待都只是「内容变长」的原因，不是原因本身。
 *
 * 作者机器上量到的形状（DevTools，实况）：
 *
 * ```
 * div.turns-inner   高 7548   （对话内容）
 * div.              高 472    overflow:auto   ← 这一层在滚，是好的
 * div.turns         高 520    overflow:auto
 * div.body          高 752    内容高 7625     ← 从这里开始逃
 * div.app-shell     高 822    内容高 7671   overflow:visible ← 100vh 却不裁
 * html                        可滚 7671      ← 于是整份文档能往下拉
 * ```
 *
 * **判据挑「文档高不许超过窗口高」**：这是这类 bug 唯一稳定的表述——
 * 至于是谁溢出的，会随布局变，而「外壳不许撑破窗口」不会变。
 */
import { test, expect, 开一段临时会话 } from "./fixtures.js"

test("**对话很长时，整份文档仍然不高于窗口**", async ({ dawn }) => {
  const { page } = dawn
  await 开一段临时会话(page)

  /**
   * 把内容堆到几千像素。**用户自己的发言也会进转录**，所以一段超长文本
   * 就够了——不需要模型配合，也不需要连远端。
   */
  const 一大段 = Array.from({ length: 400 }, (_, i) => `第 ${i} 行：这是一段用来把对话撑长的文字。`).join("\n")
  await page.getByPlaceholder(/今天帮你做些什么/).fill(一大段)
  await page.getByRole("button", { name: "发送", exact: true }).click()
  await expect(page.getByText(/假模型已应答/).last()).toBeVisible({ timeout: 30_000 })

  const 量 = await page.evaluate(() => ({
    视高: window.innerHeight,
    文档高: document.documentElement.scrollHeight,
    shell高: (document.querySelector(".app-shell") as HTMLElement | null)?.scrollHeight ?? -1,
    对话内容高: (document.querySelector(".turns-inner") as HTMLElement | null)?.scrollHeight ?? -1,
  }))

  /** 先确认这条用例**真的把内容堆长了**，否则它什么都没测到 */
  expect(量.对话内容高, "内容没堆起来，这条用例是空转的").toBeGreaterThan(量.视高)

  expect(量.文档高, `整份文档被撑高了（${量.文档高} > ${量.视高}）——往下拉会看到 App 外面的空白`)
    .toBeLessThanOrEqual(量.视高)
  expect(量.shell高, "外壳被内容撑破了").toBeLessThanOrEqual(量.视高)
})
