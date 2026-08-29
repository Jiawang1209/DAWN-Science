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

describe("解不开的凭证（2026-08-28 作者打包版抓的：未签名包更新后上一版的 key 全部解不开）", () => {
  it("**configured 只算解得开的，broken 列出解不开的**——此前文件里有键就算「已配置」，界面照亮、pi 却说 not configured", () => {
    const file = newFile()
    const a = new CredentialStore({ file, safeStorage: working })
    a.set("deepseek", "k1")
    a.set("kimi", "k2")
    a.set("ssh:conn-1", "pw")
    // 换一把钥匙：解密一律失败，模拟换了二进制之后的钥匙串
    // 新钥匙：自己加的解得开，上一把加的解不开（真实的钥匙串正是这样）
    const 换了钥匙: SafeStorageLike = {
      isEncryptionAvailable: () => true,
      encryptString: (p) => Buffer.from(`new:${p}`),
      decryptString: (b) => { const t = b.toString(); if (!t.startsWith("new:")) throw new Error("decrypt failed"); return t.slice(4) },
    }
    const b = new CredentialStore({ file, safeStorage: 换了钥匙, onInsecure: () => {} })
    b.warm()
    expect(b.configured()).toEqual([])
    expect(b.broken()).toEqual(["deepseek", "kimi"])   // ssh:… 不是模型服务，不进这份名单
    // 重新填一个之后它就从 broken 挪回 configured（写盘会清缓存）
    b.set("deepseek", "k1-new")
    expect(b.broken()).toEqual(["kimi"])
    expect(b.configured()).toEqual(["deepseek"])
  })

  it("**预热之前不解密**（审查 2026-08-29 抓的回归：解密就是进钥匙串，启动路径上不许）——按文件答、broken 空、verified false；预热后才是真答案", () => {
    const file = newFile()
    new CredentialStore({ file, safeStorage: working }).set("deepseek", "k1")
    let 解密次数 = 0
    const 数着的: SafeStorageLike = {
      ...working,
      decryptString: () => { 解密次数 += 1; throw new Error("decrypt failed") },
    }
    const s = new CredentialStore({ file, safeStorage: 数着的, onInsecure: () => {} })
    expect(s.verified()).toBe(false)
    expect(s.configured()).toEqual(["deepseek"])
    expect(s.broken()).toEqual([])
    expect(s.isEncrypted()).toBe(true)
    expect(解密次数).toBe(0)
    s.warm()
    expect(s.verified()).toBe(true)
    expect(s.configured()).toEqual([])
    expect(s.broken()).toEqual(["deepseek"])
    expect(解密次数).toBeGreaterThan(0)
    // 没有文件、或明文文件：不用钥匙串就核验得了
    expect(new CredentialStore({ file: newFile(), safeStorage: working }).verified()).toBe(true)
    const 明文 = newFile()
    new CredentialStore({ file: 明文, safeStorage: unavailable, onInsecure: () => {} }).set("a", "x")
    expect(new CredentialStore({ file: 明文, safeStorage: working }).verified()).toBe(true)
  })

  it("**一次解密失败不记成「解不开」**——钥匙串锁着 / 点了一次拒绝是一次性的；解得开的才记住；每个 id 只报一次", () => {
    const file = newFile()
    new CredentialStore({ file, safeStorage: working }).set("deepseek", "k1")
    let 失败 = true
    let 解密次数 = 0
    const 时好时坏: SafeStorageLike = {
      ...working,
      decryptString: (b) => { 解密次数 += 1; if (失败) throw new Error("locked"); return working.decryptString(b) },
    }
    const warnings: string[] = []
    const s = new CredentialStore({ file, safeStorage: 时好时坏, onInsecure: (m) => warnings.push(m) })
    s.warm()
    expect(s.broken()).toEqual(["deepseek"])
    expect(s.broken()).toEqual(["deepseek"])
    expect(warnings.filter((w) => w.includes("无法解密"))).toHaveLength(1)
    失败 = false
    expect(s.configured()).toEqual(["deepseek"])
    expect(s.broken()).toEqual([])
    const n = 解密次数
    s.configured()
    expect(解密次数).toBe(n) // 解得开的记住了，不再进钥匙串
  })

  it("**存储方式切换时其它凭证搬过去，不是丢掉**——解不开的才丢，丢了要点名（此前重填一个模型 key，SSH 口令就一声不吭地没了）", () => {
    const file = newFile()
    const a = new CredentialStore({ file, safeStorage: working })
    a.set("deepseek", "k1")
    a.set("ssh:srv", "pw")
    // 明文 → 加密：所有条目都读得出，全搬
    const 转加密 = new CredentialStore({ file, safeStorage: working })
    const 明文库 = newFile()
    const p = new CredentialStore({ file: 明文库, safeStorage: unavailable, onInsecure: () => {} })
    p.set("deepseek", "k1")
    p.set("ssh:srv", "pw")
    const warnings: string[] = []
    const q = new CredentialStore({ file: 明文库, safeStorage: working, onInsecure: (m) => warnings.push(m) })
    q.set("kimi", "k2")
    expect(q.get("ssh:srv")).toBe("pw")
    expect(q.get("deepseek")).toBe("k1")
    expect(JSON.parse(readFileSync(明文库, "utf8")).encrypted).toBe(true)
    expect(warnings.filter((w) => w.includes("丢弃"))).toHaveLength(0)
    // 加密 → 明文（keyring 掉了）：密文解不开，只能丢，但要点名
    void 转加密
    const w2: string[] = []
    const r = new CredentialStore({ file, safeStorage: unavailable, onInsecure: (m) => w2.push(m) })
    r.set("kimi", "k2")
    expect(r.get("kimi")).toBe("k2")
    expect(w2.join("\n")).toMatch(/丢弃.*deepseek/)
    expect(w2.join("\n")).toMatch(/ssh:srv/)
  })
})
