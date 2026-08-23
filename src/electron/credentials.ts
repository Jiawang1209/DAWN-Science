/**
 * 凭证库（作者反馈后新增）。
 *
 * **凭证由 app 自己管，不由用户手写进配置文件。** 这是作者在首次启动桌面版时
 * 指出的——桌面应用不该因为一个要手写的文件缺了变量就起不来。
 *
 * 落点是 BACKLOG 里早已登记的那条：「凭证移出 process.env → OS keychain +
 * 按 endpoint 定向注入，预估归属 ①-B」。Electron 外壳到位，正是现在。
 *
 * **加密由 OS 提供**（macOS Keychain / Windows DPAPI / Linux libsecret），
 * 经 Electron 的 `safeStorage`。本文件不发明任何加密。
 *
 * `safeStorage` 不可用时（某些 Linux 桌面环境缺 keyring）**明确降级并出声**，
 * 而不是偷偷明文存盘让人以为是加密的。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"

/** 只依赖 safeStorage 的这三个方法，便于测试时注入替身 */
export interface SafeStorageLike {
  isEncryptionAvailable(): boolean
  encryptString(plain: string): Buffer
  decryptString(encrypted: Buffer): string
}

interface StoredFile {
  /** 记录写入时用的是加密还是明文，读的时候才知道怎么解 */
  encrypted: boolean
  /** endpointId → base64(密文) 或 明文 */
  entries: Record<string, string>
}

export interface CredentialStoreOptions {
  file: string
  safeStorage: SafeStorageLike
  /** 降级为明文时的告警出口。默认打到 stderr */
  onInsecure?: (message: string) => void
}

export class CredentialStore {
  private readonly file: string
  private readonly safe: SafeStorageLike
  private readonly onInsecure: (message: string) => void
  private cache: StoredFile | undefined

  constructor(opts: CredentialStoreOptions) {
    this.file = opts.file
    this.safe = opts.safeStorage
    this.onInsecure =
      opts.onInsecure ?? ((m) => console.error(`[credentials] ${m}`))
  }

  private read(): StoredFile {
    if (this.cache) return this.cache
    if (!existsSync(this.file)) {
      this.cache = { encrypted: false, entries: {} }
      return this.cache
    }
    try {
      this.cache = JSON.parse(readFileSync(this.file, "utf8")) as StoredFile
    } catch {
      // 文件损坏：视为空而不是崩掉——凭证丢了可以重填，app 起不来则什么都做不了。
      // 但要出声，否则用户会以为自己填过的 key 莫名失效
      this.onInsecure(`凭证文件无法解析，已按空处理：${this.file}`)
      this.cache = { encrypted: false, entries: {} }
    }
    return this.cache
  }

  private write(data: StoredFile): void {
    mkdirSync(dirname(this.file), { recursive: true })
    // 0600：即便是密文，也不该让同机其它用户读到
    writeFileSync(this.file, JSON.stringify(data, null, 2), { mode: 0o600 })
    this.cache = data
  }

  /** 本次会以加密还是明文存盘。UI 据此提示用户。 */
  isEncrypted(): boolean {
    return this.safe.isEncryptionAvailable()
  }

  get(endpointId: string): string | undefined {
    const data = this.read()
    const raw = data.entries[endpointId]
    if (raw === undefined) return undefined
    if (!data.encrypted) return raw
    try {
      return this.safe.decryptString(Buffer.from(raw, "base64"))
    } catch {
      // 换了机器、或 keychain 项被删：解不开就是没有，不要返回乱码去当 key 用
      this.onInsecure(`endpoint "${endpointId}" 的凭证无法解密，需要重新填写`)
      return undefined
    }
  }

  set(endpointId: string, secret: string): void {
    const encrypted = this.safe.isEncryptionAvailable()
    if (!encrypted) {
      this.onInsecure(
        `系统未提供安全存储（缺少 keychain / libsecret），凭证将以明文存于 ${this.file}`,
      )
    }
    const data = this.read()
    // 加密状态变了就整份重写，避免同一文件里混着两种编码
    const entries = data.encrypted === encrypted ? { ...data.entries } : {}
    entries[endpointId] = encrypted
      ? this.safe.encryptString(secret).toString("base64")
      : secret
    this.write({ encrypted, entries })
  }

  delete(endpointId: string): void {
    const data = this.read()
    const entries = { ...data.entries }
    delete entries[endpointId]
    this.write({ ...data, entries })
  }

  /**
   * 已配置凭证的 provider 列表。**只返回 id，不返回值。**
   * 钥匙串里还住着别的秘密（`ssh:<连接>` 的密码、`weixin:botToken`）——它们不是模型服务，
   * 列出去会在「模型服务」里冒出一排「ssh:conn-… 没有模型」（2026-08-23 作者截图抓的）
   */
  configured(): string[] {
    return Object.keys(this.read().entries).filter((k) => !/^(ssh|weixin):/.test(k))
  }
}

/** 默认位置：用户数据目录下的 credentials.json */
export function defaultCredentialFile(userDataDir: string): string {
  return join(userDataDir, "credentials.json")
}
