import { afterEach, describe, expect, it } from "vitest"
import { mkdtempSync, readFileSync, rmSync, writeFileSync, statSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { CredentialStore, type SafeStorageLike } from "../../src/electron/credentials.js"

const dirs: string[] = []
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

function newFile(): string {
  const d = mkdtempSync(join(tmpdir(), "dawn-cred-"))
  dirs.push(d)
  return join(d, "credentials.json")
}

/** 可用的安全存储替身：用可逆变换代替真加密，只为验证「存的不是明文」 */
const working: SafeStorageLike = {
  isEncryptionAvailable: () => true,
  encryptString: (p) => Buffer.from(`enc:${p}`),
  decryptString: (b) => b.toString().replace(/^enc:/, ""),
}

/** 系统没有 keychain 的情况 */
const unavailable: SafeStorageLike = {
  isEncryptionAvailable: () => false,
  encryptString: () => {
    throw new Error("不该被调用")
  },
  decryptString: () => {
    throw new Error("不该被调用")
  },
}

describe("凭证库 · 基本读写", () => {
  it("存进去能取出来", () => {
    const s = new CredentialStore({ file: newFile(), safeStorage: working })
    s.set("deepseek", "sk-abc")
    expect(s.get("deepseek")).toBe("sk-abc")
  })

  it("没存过的返回 undefined", () => {
    expect(new CredentialStore({ file: newFile(), safeStorage: working }).get("nope")).toBeUndefined()
  })

  it("跨实例可读 —— 重启 app 后凭证还在", () => {
    const file = newFile()
    new CredentialStore({ file, safeStorage: working }).set("ds", "sk-1")
    expect(new CredentialStore({ file, safeStorage: working }).get("ds")).toBe("sk-1")
  })

  it("删除后取不到", () => {
    const s = new CredentialStore({ file: newFile(), safeStorage: working })
    s.set("ds", "sk-1")
    s.delete("ds")
    expect(s.get("ds")).toBeUndefined()
  })

  it("configured 只返回 id，不泄露值", () => {
    const s = new CredentialStore({ file: newFile(), safeStorage: working })
    s.set("ds", "sk-secret")
    expect(s.configured()).toEqual(["ds"])
    // 钥匙串里带 `<域>:` 前缀的秘密都不算 provider（审查 debug F1：曾漏 feishu/vision/mcp，
    // 冒进「模型服务」列表还能被误删）——凡带冒号一律排除
    s.set("ssh:conn-1", "pw")
    s.set("weixin:botToken", "tok")
    s.set("feishu:appSecret", "sec")
    s.set("vision:apiKey", "vk")
    s.set("mcp:context7:API_KEY", "mk")
    expect(s.configured()).toEqual(["ds"])
    expect(s.get("ssh:conn-1")).toBe("pw")
    expect(s.get("feishu:appSecret")).toBe("sec")
    expect(JSON.stringify(s.configured())).not.toContain("sk-secret")
  })
})

describe("凭证库 · 落盘不是明文", () => {
  it("安全存储可用时，文件里读不到原始 key", () => {
    const file = newFile()
    new CredentialStore({ file, safeStorage: working }).set("ds", "sk-super-secret")
    expect(readFileSync(file, "utf8")).not.toContain("sk-super-secret")
  })

  it("文件权限为 0600 —— 同机其它用户不该读到", () => {
    const file = newFile()
    new CredentialStore({ file, safeStorage: working }).set("ds", "sk-1")
    expect(statSync(file).mode & 0o777).toBe(0o600)
  })
})

describe("凭证库 · 安全存储不可用时明确降级", () => {
  it("出声告警，而不是偷偷明文存盘", () => {
    const warnings: string[] = []
    const s = new CredentialStore({
      file: newFile(),
      safeStorage: unavailable,
      onInsecure: (m) => warnings.push(m),
    })
    s.set("ds", "sk-1")
    expect(warnings.join(" ")).toMatch(/明文/)
  })

  it("降级后仍然可用 —— 能存能取", () => {
    const s = new CredentialStore({ file: newFile(), safeStorage: unavailable, onInsecure: () => {} })
    s.set("ds", "sk-1")
    expect(s.get("ds")).toBe("sk-1")
  })

  it("isEncrypted 如实反映当前状态，供 UI 提示用户——但没存过、没问过之前是「不知道」，不去碰钥匙串（2026-08-28：问它会卡主线程）", () => {
    const a = new CredentialStore({ file: newFile(), safeStorage: working })
    expect(a.isEncrypted()).toBeUndefined()
    a.set("ds", "k")
    expect(a.isEncrypted()).toBe(true)
    const b = new CredentialStore({ file: newFile(), safeStorage: unavailable })
    b.set("ds", "k")
    expect(b.isEncrypted()).toBe(false)
  })
})

describe("凭证库 · 坏数据", () => {
  it("文件损坏时按空处理但出声 —— 凭证可重填，app 起不来则什么都做不了", () => {
    const file = newFile()
    writeFileSync(file, "{ 这不是 json")
    const warnings: string[] = []
    const s = new CredentialStore({ file, safeStorage: working, onInsecure: (m) => warnings.push(m) })
    expect(s.get("ds")).toBeUndefined()
    expect(warnings.join(" ")).toMatch(/无法解析/)
  })

  it("解不开的密文视为没有，绝不返回乱码去当 key 用", () => {
    const file = newFile()
    writeFileSync(file, JSON.stringify({ encrypted: true, entries: { ds: "!!!not-base64!!!" } }))
    const broken: SafeStorageLike = {
      ...working,
      decryptString: () => {
        throw new Error("解密失败")
      },
    }
    const warnings: string[] = []
    const s = new CredentialStore({ file, safeStorage: broken, onInsecure: (m) => warnings.push(m) })
    expect(s.get("ds")).toBeUndefined()
    expect(warnings.join(" ")).toMatch(/重新填写/)
  })

  it("加密状态变化时整份重写，不让两种编码混在同一文件里", () => {
    const file = newFile()
    new CredentialStore({ file, safeStorage: working }).set("a", "sk-a")
    // 换成不可用（模拟系统 keyring 掉了）
    const s2 = new CredentialStore({ file, safeStorage: unavailable, onInsecure: () => {} })
    s2.set("b", "sk-b")
    const data = JSON.parse(readFileSync(file, "utf8")) as { encrypted: boolean; entries: Record<string, string> }
    expect(data.encrypted).toBe(false)
    expect(Object.keys(data.entries)).toEqual(["b"]) // 旧密文没被当成明文留下来
  })
})
