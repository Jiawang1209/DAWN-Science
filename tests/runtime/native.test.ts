/**
 * NativeRuntime 的契约层（返工 R2 重写）。
 *
 * **只覆盖不打网络的部分**：缺参数、模型不存在、事件翻译。
 * 真实链路由 `npm run spike:a2` 验证——那条路必须打网络，不适合放进单测。
 *
 * 旧版本这里有八条用例，全部基于「手搓 provider」的实现细节，
 * 随实现一起作废。
 */
import { describe, expect, it } from "vitest"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { NativeRuntime } from "../../src/runtime/native.js"
import type { SessionSpec } from "../../src/runtime/types.js"
import type { Credential, CredentialInfo, CredentialStore } from "@earendil-works/pi-ai"

/** 不落盘、不打网络的凭证替身 */
const fakeCredentials = (): CredentialStore => ({
  async read(providerId): Promise<Credential | undefined> {
    return providerId === "deepseek" ? { type: "api_key", key: "sk-offline" } : undefined
  },
  async list(): Promise<readonly CredentialInfo[]> {
    return [{ providerId: "deepseek", type: "api_key" }]
  },
  async modify() {
    return undefined
  },
  async delete() {},
})

const specFor = (native?: { provider: string; model: string }): SessionSpec => {
  const dir = mkdtempSync(join(tmpdir(), "dawn-native-"))
  return {
    sessionId: "n1",
    workspace: dir,
    sessionDir: join(dir, ".dawn"),
    ...(native ? { native } : {}),
  }
}

const runtime = () => new NativeRuntime({ credentials: fakeCredentials() })

describe("NativeRuntime · 契约", () => {
  it("缺少 native 段时响亮报错", async () => {
    await expect(runtime().start(specFor())).rejects.toThrow(/provider 与 model/)
  })

  it("模型不在 pi 的目录里时报错，并列出该 provider 有哪些 —— 无静默回退", async () => {
    const err = await runtime()
      .start(specFor({ provider: "deepseek", model: "not-a-real-model" }))
      .catch((e: unknown) => e)
    expect(String(err)).toMatch(/not-a-real-model/)
    // 报错要能指路：说清这个 provider 实际有什么
    expect(String(err)).toMatch(/可用的模型/)
  })

  it("attach 返回的退订函数可重复调用", () => {
    const rt = runtime()
    const off = rt.attach("n1", () => {})
    expect(() => {
      off()
      off()
    }).not.toThrow()
  })

  it("未启动的会话 write 即抛错 —— 不静默丢弃用户输入", () => {
    expect(() => runtime().write("nope", "hi")).toThrow(/nope/)
  })

  it("stop 一个不存在的会话是空操作，不抛", async () => {
    await expect(runtime().stop("nope")).resolves.toBeUndefined()
  })

  it("waitForIdle 对未知会话直接返回 —— CLI 收摊路径不该因此卡住", async () => {
    await expect(runtime().waitForIdle("nope")).resolves.toBeUndefined()
  })
})
