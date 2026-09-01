import { afterEach, describe, expect, it } from "vitest"
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync, statSync } from "node:fs"
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

  it("**一次解密失败不记成「解不开」**——钥匙串锁着 / 点了一次拒绝是一次性的；解得开的才记住；每个 id 只报一次", async () => {
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
    await Promise.resolve() // 下一轮（同一轮同步调用共用一份核验结果，见 F3）
    失败 = false
    expect(s.configured()).toEqual(["deepseek"])
    expect(s.broken()).toEqual([])
    const n = 解密次数
    s.configured()
    expect(解密次数).toBe(n) // 解得开的记住了，不再进钥匙串
  })

  it("**存储方式切换时其它凭证搬过去，不是丢掉**——解不开的密文留着并点名（此前重填一个模型 key，SSH 口令就一声不吭地没了；2026-09-01 起连「点名后丢掉」也不许，见下一组）", () => {
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
    // 加密 → 明文（keyring 掉了）：密文解不开，原样留着，但要点名
    void 转加密
    const w2: string[] = []
    const r = new CredentialStore({ file, safeStorage: unavailable, onInsecure: (m) => w2.push(m) })
    r.set("kimi", "k2")
    expect(r.get("kimi")).toBe("k2")
    expect(w2.join("\n")).toMatch(/保留.*deepseek/)
    expect(w2.join("\n")).toMatch(/ssh:srv/)
    expect(w2.join("\n")).not.toMatch(/丢弃/)
  })
})

describe("审查 2026-09-01：钥匙串一次性掉线 · 预热出错 · 核验只解一遍", () => {
  /** 钥匙串暂时锁着：问它说不可用，解也解不开——过一会儿就好了 */
  function 暂时锁着的(): SafeStorageLike & { 恢复(): void } {
    let 锁着 = true
    return {
      isEncryptionAvailable: () => !锁着,
      encryptString: (p) => { if (锁着) throw new Error("locked"); return working.encryptString(p) },
      decryptString: (b) => { if (锁着) throw new Error("locked"); return working.decryptString(b) },
      恢复: () => { 锁着 = false },
    }
  }

  it("F1 **钥匙串暂时掉线时 set 不许把其它凭证永久丢掉**——密文原样留着，钥匙串回来了照样解得开；读路径说「一次失败不算坏」，写路径不能反着来", async () => {
    const file = newFile()
    const a = new CredentialStore({ file, safeStorage: working })
    a.set("deepseek", "k1")
    a.set("ssh:srv", "pw")
    a.set("feishu:appSecret", "sec")
    const 钥匙串 = 暂时锁着的()
    const warnings: string[] = []
    const b = new CredentialStore({ file, safeStorage: 钥匙串, onInsecure: (m) => warnings.push(m) })
    b.set("kimi", "k2")               // 钥匙串锁着：新 key 只能明文存
    expect(b.get("kimi")).toBe("k2")
    expect(warnings.join("\n")).toMatch(/deepseek/)   // 解不开的要点名，但不是「丢弃」
    expect(warnings.join("\n")).toMatch(/ssh:srv/)
    // 密文不能进明文表（旧密文当明文用等于把乱码当 key），但也不能没了
    const disk = JSON.parse(readFileSync(file, "utf8")) as { encrypted: boolean; entries: Record<string, string> }
    expect(disk.encrypted).toBe(false)
    expect(Object.keys(disk.entries)).toEqual(["kimi"])
    expect(JSON.stringify(disk)).toContain(Buffer.from("enc:pw").toString("base64"))
    // 解不开的模型 key 在 broken 里、不在 configured 里，界面才能说「需要重新填写」
    b.warm()
    expect(b.configured()).toEqual(["kimi"])
    expect(b.broken()).toEqual(["deepseek"])
    // 钥匙串回来（下一轮）：不用重填，全都还在
    await Promise.resolve()
    钥匙串.恢复()
    expect(b.get("ssh:srv")).toBe("pw")
    expect(b.get("feishu:appSecret")).toBe("sec")
    expect(b.get("deepseek")).toBe("k1")
    expect(b.configured()).toEqual(["kimi", "deepseek"])
    expect(b.broken()).toEqual([])
    // 重启 app 再看一遍：留在盘上的密文跨实例也解得开
    const c = new CredentialStore({ file, safeStorage: working })
    expect(c.get("ssh:srv")).toBe("pw")
    expect(c.get("kimi")).toBe("k2")
    // 钥匙串好了之后再存一次：整份回到加密，留着的密文一起收回 entries，文件里不再有明文
    c.set("openai", "k3")
    const disk2 = JSON.parse(readFileSync(file, "utf8")) as { encrypted: boolean; entries: Record<string, string> }
    expect(disk2.encrypted).toBe(true)
    expect(Object.keys(disk2.entries).sort()).toEqual(["deepseek", "feishu:appSecret", "kimi", "openai", "ssh:srv"])
    expect(readFileSync(file, "utf8")).not.toContain("k2")
    expect(new CredentialStore({ file, safeStorage: working }).get("ssh:srv")).toBe("pw")
  })

  it("F2 **isEncryptionAvailable 抛错时 warm 不许抛**（某些 Linux/libsecret 会抛）——记成不可用、出声一次；否则 verified 永远 false、hasCredential 把异常直接砸进 pi", () => {
    const file = newFile()
    new CredentialStore({ file, safeStorage: working }).set("deepseek", "k1")
    let 问了 = 0
    const 会抛的: SafeStorageLike = {
      ...working,
      isEncryptionAvailable: () => { 问了 += 1; throw new Error("org.freedesktop.secrets not available") },
    }
    const warnings: string[] = []
    const s = new CredentialStore({ file, safeStorage: 会抛的, onInsecure: (m) => warnings.push(m) })
    expect(s.verified()).toBe(false)
    expect(s.warm()).toBe(false)
    expect(s.verified()).toBe(true)
    expect(s.isEncrypted()).toBe(false)
    expect(warnings.filter((w) => w.includes("secrets not available"))).toHaveLength(1)
    // 记住了：再 warm 不再去问、不再报
    expect(s.warm()).toBe(false)
    expect(问了).toBe(1)
    expect(warnings.filter((w) => w.includes("secrets not available"))).toHaveLength(1)
  })

  it("F3 **一轮 listCredentials 只解一遍**——configured()+broken() 背靠背各自解一遍，解不开的每 3 秒被同步解两次、正是最慢的那种场景；失败仍然不跨轮记住", async () => {
    const file = newFile()
    new CredentialStore({ file, safeStorage: working }).set("deepseek", "k1")
    let 失败 = true
    let 解密次数 = 0
    const 时好时坏: SafeStorageLike = {
      ...working,
      decryptString: (b) => { 解密次数 += 1; if (失败) throw new Error("locked"); return working.decryptString(b) },
    }
    const s = new CredentialStore({ file, safeStorage: 时好时坏, onInsecure: () => {} })
    s.warm()
    expect(s.configured()).toEqual([])
    expect(s.broken()).toEqual(["deepseek"])
    expect(解密次数).toBe(1)
    // 下一轮（另一次 IPC）：失败没被记住，再解一遍——钥匙串好了就立刻是好的
    await Promise.resolve()
    失败 = false
    expect(s.configured()).toEqual(["deepseek"])
    expect(s.broken()).toEqual([])
    expect(解密次数).toBe(2)
  })
})

describe("终审 2026-09-01：删「解不开」的那一行 · 写盘失败不许先改缓存", () => {
  /** 明文文件里留着一条解不开的密文——正是 dcdb559 之后界面上那行「解不开、需要重新填写」 */
  function 留着一条解不开的(): string {
    const file = newFile()
    writeFileSync(file, JSON.stringify({ encrypted: false, entries: { ok: "x" }, undecrypted: { deepseek: "Q0lQSEVS" } }))
    return file
  }
  /** 钥匙串说可用但解不开任何旧密文：换过二进制之后就是这样 */
  const 解不开的钥匙串: SafeStorageLike = {
    ...working,
    decryptString: () => { throw new Error("decrypt failed") },
  }

  it("G1 **delete 掉 undecrypted 里唯一的一条，文件里的 undecrypted 要真的没了**——此前 `...data` 把原来的整张表又铺了回去，那行「需要重新填写」怎么点「移除」都还在", () => {
    const file = 留着一条解不开的()
    const s = new CredentialStore({ file, safeStorage: 解不开的钥匙串, onInsecure: () => {} })
    s.delete("deepseek")
    const disk = JSON.parse(readFileSync(file, "utf8")) as { entries: Record<string, string>; undecrypted?: Record<string, string> }
    expect(disk.undecrypted).toBeUndefined()
    expect(Object.keys(disk.entries)).toEqual(["ok"])
    // 同一个实例：预热之后 broken 也不再列它
    s.warm()
    expect(s.broken()).toEqual([])
    expect(s.get("deepseek")).toBeUndefined()
    // 重启 app 再看：跨实例也真的没了
    const 重启 = new CredentialStore({ file, safeStorage: 解不开的钥匙串, onInsecure: () => {} })
    重启.warm()
    expect(重启.broken()).toEqual([])
    expect(重启.configured()).toEqual(["ok"])
  })

  it("G2 **set 写盘失败时不许已经改掉了内存里的 undecrypted**——`read()` 是有缓存的，同模式分支直接拿缓存对象来 delete，写盘一抛（EPERM/ENOSPC），那条密文在内存里先没了，下一次成功的写盘就把它从盘上也抹掉", () => {
    const file = 留着一条解不开的()
    const s = new CredentialStore({ file, safeStorage: unavailable, onInsecure: () => {} })
    expect(s.verified()).toBe(false) // 有解不开的密文在，得等预热
    // 把文件锁成只读：writeFileSync 真的抛 EACCES，不是替身（锁目录没用——改已有文件的内容不看目录权限）
    chmodSync(file, 0o400)
    try {
      expect(() => s.set("deepseek", "k-new")).toThrow()
    } finally {
      chmodSync(file, 0o600)
    }
    // 写盘失败之后再存一个别的：deepseek 那条密文必须还在盘上
    s.set("kimi", "k2")
    const disk = JSON.parse(readFileSync(file, "utf8")) as { entries: Record<string, string>; undecrypted?: Record<string, string> }
    expect(disk.undecrypted).toEqual({ deepseek: "Q0lQSEVS" })
    expect(Object.keys(disk.entries).sort()).toEqual(["kimi", "ok"])
  })
})
