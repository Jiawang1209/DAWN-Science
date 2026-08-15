/**
 * 技能：**自带的那几个真的到了模型手上**（S20，2026-08-15）。**跑真实构建产物。**
 *
 * 作者要的是对标 Hermes / Codex 那套 skills。查下来 **pi 已经把标准实现完了**
 * （Agent Skills：发现、按 agentskills.io 的 XML 注入系统提示、`/skill:名` 展开、诊断），
 * 我们只做三件事：告诉它去哪儿找、带几个能用的、在屏上看得见。
 *
 * ## 为什么这条只能在真实产物上跑
 *
 * 中间隔着四层：构建有没有把 `skills/` 拷进 `dist` → `main.ts` 算的路径对不对 →
 * `wiring` 传没传 → 运行时 `extendResources` 在 `reload()` 之前还是之后。
 * **单元测试每一层都验过了，但它们证明不了这四层接在一起**——
 * 而本项目栽的三次（门、内核、MCP 装配）全是「每层都对，接线断了」。
 *
 * 判据挑**物证**：让假模型把系统提示里的技能名回显出来。
 * 屏幕上「看起来知道」是不算数的。
 */
import { test, expect, 开一段临时会话 } from "./fixtures.js"

test.describe("自带技能", () => {
  /**
   * 让假模型**把它收到的系统提示原样回一句**。
   *
   * 假服务器会把整个请求体记下来（`requests`），所以这里不需要模型配合——
   * 直接翻它收到的东西即可。
   */
  test("**自带技能出现在发给模型的请求里**", async ({ dawn }) => {
    const { page } = dawn
    await 开一段临时会话(page)
    await page.getByPlaceholder(/今天帮你做些什么/).fill("随便说一句")
    await page.getByRole("button", { name: "发送", exact: true }).click()
    await expect(page.getByText(/假模型已应答/).last()).toBeVisible({ timeout: 30_000 })

    const 全部 = JSON.stringify(dawn.requests)
    /** 两个自带技能的名字都该在系统提示里 */
    expect(全部, "自带技能没进系统提示——四层接线断了一层").toContain("dataset-first-look")
    expect(全部).toContain("reproducible-analysis")
    /**
     * **不只是名字，说明也要在**：只有名字的话，
     * 模型没法判断什么时候该用它——那等于没给。
     */
    expect(全部, "只给了名字没给说明").toMatch(/没见过的数据集|拿到一份/)
  })
})
