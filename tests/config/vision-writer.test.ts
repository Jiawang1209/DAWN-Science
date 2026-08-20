/**
 * 写视觉服务那一段（2026-08-20）。设计定案见
 * `specs/2026-08-20-视觉服务-design.md`。
 *
 * 重心与 writer.test.ts 一致：**写的过程不许弄坏别人的东西**，
 * 以及**密钥永远不出现在文件里**。
 */
import { afterEach, describe, expect, it } from "vitest"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { setVision } from "../../src/config/writer.js"

const dirs: string[] = []
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

const 原始 = `agents:
  ds-chat:
    kind: native
    provider: deepseek
    model: deepseek-v4-flash
    capabilities: [chat, exec]
`

function 一份(内容 = 原始): string {
  const dir = mkdtempSync(join(tmpdir(), "dawn-vision-writer-"))
  dirs.push(dir)
  const f = join(dir, "providers.yaml")
  writeFileSync(f, 内容, "utf8")
  return f
}

describe("setVision", () => {
  it("写进去、读得回来，agents 一个字不动", () => {
    const f = 一份()
    const r = setVision(f, { enabled: true, baseUrl: "https://v.example/v1", model: "qwen-vl" })
    expect(r.vision).toEqual({ enabled: true, api: "openai-completions", baseUrl: "https://v.example/v1", model: "qwen-vl" })
    expect(r.agents["ds-chat"]).toBeDefined()
    // 原有内容原样还在
    expect(readFileSync(f, "utf8")).toContain("deepseek-v4-flash")
  })

  it("**整段重写**：再写一次不会留下上一次的残余", () => {
    const f = 一份()
    setVision(f, { enabled: true, baseUrl: "https://old.example/v1", model: "m1" })
    const r = setVision(f, { enabled: false, model: "m2" })
    expect(r.vision).toEqual({ enabled: false, api: "openai-completions", model: "m2" })
    const 文 = readFileSync(f, "utf8")
    expect(文).not.toContain("old.example")
    expect((文.match(/^vision:/gm) ?? []).length).toBe(1)
  })

  it("**密钥不经过这里**：无论传什么，文件里不会有 apiKey 字样", () => {
    const f = 一份()
    setVision(f, { enabled: true, baseUrl: "https://v.example/v1", model: "m" })
    expect(readFileSync(f, "utf8")).not.toMatch(/apiKey|api_key|secret/i)
  })

  it("找不到文件要响亮失败", () => {
    expect(() => setVision("/不存在/providers.yaml", { enabled: true })).toThrow(/找不到配置文件/)
  })
})
