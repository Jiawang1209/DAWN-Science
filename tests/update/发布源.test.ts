/**
 * 发布源：**真 GitHub 与假 feed 走同一个解析器**（规格 U6、准入规则 1）。
 * 两份解析必然各自漂移，那时「本地是好的」就不再意味着什么。
 */
import { describe, expect, it } from "vitest"
import { github发布源 } from "../../src/update/发布源.js"

/** 2026-09-06 从真 API 上取回来的形状（只留我们用到的字段） */
const 真形状 = {
  tag_name: "v0.0.2",
  html_url: "https://github.com/Jiawang1209/DAWN-Science/releases/tag/v0.0.2",
  published_at: "2026-09-05T12:00:00Z",
  draft: false,
  prerelease: false,
  assets: [
    {
      name: "DAWN-Science-0.0.2-mac-arm64.zip",
      size: 223_317_849,
      browser_download_url: "https://github.com/.../DAWN-Science-0.0.2-mac-arm64.zip",
    },
  ],
}

const 假fetch = (回: { status?: number; body?: unknown } | (() => never)) =>
  (async () => {
    if (typeof 回 === "function") 回()
    const { status = 200, body = 真形状 } = 回 as { status?: number; body?: unknown }
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
      text: async () => JSON.stringify(body),
    } as unknown as Response
  }) as unknown as typeof fetch

describe("github发布源", () => {
  it("认真实形状", async () => {
    const 一条 = await github发布源({ 端点: "https://x/y", fetch: 假fetch({}) }).查最新()
    expect(一条?.版本).toBe("v0.0.2")
    expect(一条?.页面).toContain("/releases/tag/v0.0.2")
    expect(一条?.资源[0]?.url).toContain("mac-arm64.zip")
    expect(一条?.资源[0]?.size).toBe(223_317_849)
  })
  it("404 = 还没发过，不是错误", async () => {
    expect(await github发布源({ 端点: "https://x/y", fetch: 假fetch({ status: 404 }) }).查最新()).toBeUndefined()
  })
  it("403（撞限额）要把状态码说出来", async () => {
    await expect(
      github发布源({ 端点: "https://x/y", fetch: 假fetch({ status: 403 }) }).查最新(),
    ).rejects.toThrow(/403/)
  })
  it("形状不对时说的是形状不对，不是「没有新版」", async () => {
    // 静默当成「没有新版」的话，端点改了、字段改名了，我们会永远安静
    await expect(
      github发布源({ 端点: "https://x/y", fetch: 假fetch({ body: { hello: 1 } }) }).查最新(),
    ).rejects.toThrow(/形状|字段/)
  })
  it("草稿与预发布不算——端点本来就排除了，这里再钉一道", async () => {
    const 源 = github发布源({
      端点: "https://x/y",
      fetch: 假fetch({ body: { ...真形状, prerelease: true } }),
    })
    expect(await 源.查最新()).toBeUndefined()
  })
  it("超时的原话里有秒数", async () => {
    const 炸 = (() => {
      const e = new Error("The operation was aborted")
      e.name = "TimeoutError"
      throw e
    }) as () => never
    await expect(
      github发布源({ 端点: "https://x/y", fetch: 假fetch(炸), 超时毫秒: 10_000 }).查最新(),
    ).rejects.toThrow(/超时 10 秒/)
  })
})
