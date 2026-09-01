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
  /**
   * 加密→明文切换那一刻解不开的密文，原样留着（endpointId → base64 密文）。
   * 2026-09-01 审查抓的：钥匙串锁着 / 点了一次「拒绝」是一次性的，读路径早就按「一次失败不算坏」处理，
   * 写路径却把解不开的整个丢掉——重填一个模型 key，SSH 口令、飞书密钥就永久没了。留着，钥匙串回来照样解。
   * 只在 `encrypted: false` 的文件里出现；下次整份回到加密时收回 `entries`。
   */
  undecrypted?: Record<string, string>
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
    this.解得开的.clear()
    this.已报过解不开.clear()
    this.分类结果 = undefined
    mkdirSync(dirname(this.file), { recursive: true })
    // 0600：即便是密文，也不该让同机其它用户读到
    writeFileSync(this.file, JSON.stringify(data, null, 2), { mode: 0o600 })
    this.cache = data
  }

  /**
   * 本次会以加密还是明文存盘。UI 据此提示用户。
   *
   * **不在启动路径上碰钥匙串**（2026-08-28 全新机器演练抓的）：`safeStorage.isEncryptionAvailable()` 在 macOS 上
   * 是主线程同步进钥匙串，未签名的 700 MB 包每次都要被 securityd 重新核一遍身份——实测 1–5 秒，冷机 10–60 秒，
   * 期间主进程整个卡死、窗口一片空白。此前 `listCredentials` 每次都调它，而它正是界面启动的第一批请求。
   * 现在：问过一次就记住；没问过时，有存盘文件就按文件里记的答，什么都没有就答「不知道」——
   * 第一次真去问钥匙串是在人按「保存」的那一刻（那是人主动的动作，等一下说得过去）。
   */
  private 加密可用?: boolean
  isEncrypted(): boolean | undefined {
    if (this.加密可用 !== undefined) return this.加密可用
    if (existsSync(this.file)) return this.read().encrypted
    return undefined
  }
  /** 主动问一次钥匙串并记住——放在首帧之后的空档里做，别等到人按「保存」那一下再卡几十秒（2026-08-28） */
  warm(): boolean {
    return this.问钥匙串()
  }
  private 问钥匙串(): boolean {
    if (this.加密可用 === undefined) {
      try {
        this.加密可用 = this.safe.isEncryptionAvailable()
      } catch (e) {
        // 某些 Linux/libsecret 组合下这一句直接抛（2026-09-01 审查抓的）。不接住的话 `加密可用` 永远是 undefined：
        // `verified()` 永远 false、解不开的 key 照样算「已配置」；`hasCredential` 里那次裸调更是把异常砸进 pi，
        // 第一句话就失败且看不出为什么。记成不可用，出声一次
        this.加密可用 = false
        this.onInsecure(`问不到系统安全存储（${e instanceof Error ? e.message : String(e)}），按不可用处理：凭证将以明文存于 ${this.file}`)
      }
    }
    return this.加密可用
  }

  get(endpointId: string): string | undefined {
    const data = this.read()
    const raw = data.entries[endpointId]
    if (raw !== undefined) return data.encrypted ? this.解密(endpointId, raw) : raw
    const cipher = data.undecrypted?.[endpointId]
    return cipher === undefined ? undefined : this.解密(endpointId, cipher)
  }

  private 解密(endpointId: string, cipher: string): string | undefined {
    try {
      const plain = this.safe.decryptString(Buffer.from(cipher, "base64"))
      this.解得开的.add(endpointId)
      return plain
    } catch {
      // 换了机器、或 keychain 项被删：解不开就是没有，不要返回乱码去当 key 用。
      // 每个 id 只报一次——listCredentials 每次刷新都会来问，不然 startup.log 全是这一句
      if (!this.已报过解不开.has(endpointId)) {
        this.已报过解不开.add(endpointId)
        this.onInsecure(`endpoint "${endpointId}" 的凭证无法解密，需要重新填写`)
      }
      return undefined
    }
  }

  set(endpointId: string, secret: string): void {
    const encrypted = this.问钥匙串()
    if (!encrypted) {
      this.onInsecure(
        `系统未提供安全存储（缺少 keychain / libsecret），凭证将以明文存于 ${this.file}`,
      )
    }
    const data = this.read()
    const 编码 = (plain: string) => (encrypted ? this.safe.encryptString(plain).toString("base64") : plain)
    let entries: Record<string, string>
    let undecrypted: Record<string, string> | undefined
    if (data.encrypted === encrypted) {
      entries = { ...data.entries }
      // 拷一份，别拿缓存对象直接 delete（2026-09-01 终审抓的）：`read()` 是有缓存的，下面那句 `delete undecrypted[id]`
      // 会在 `writeFileSync` 之前就改掉内存——写盘一抛（EPERM/ENOSPC），那条密文内存里先没了，下一次成功的写盘把它从盘上也抹掉
      undecrypted = data.undecrypted ? { ...data.undecrypted } : undefined
    } else if (encrypted) {
      /**
       * 明文→加密：整份重写，避免同一文件里混着两种编码。明文条目加密；上次留下的密文本来就是这种编码，原样收回——
       * 解不解得开由 `broken()` 说，跟换了二进制之后的旧密文一个待遇。
       */
      entries = { ...data.undecrypted }
      for (const id of Object.keys(data.entries)) if (id !== endpointId) entries[id] = 编码(data.entries[id]!)
    } else {
      /**
       * 加密→明文：解得开的搬成明文，**解不开的密文原样留在 `undecrypted`，一条都不丢**（2026-09-01）。
       * 此前解不开就丢：钥匙串只是暂时锁着，一次 `set` 就把 SSH 口令、飞书密钥永久抹掉了，一分钟后钥匙串好了也回不来。
       */
      entries = {}
      const 留着的: Record<string, string> = { ...data.undecrypted }
      for (const id of Object.keys(data.entries)) {
        if (id === endpointId) continue
        const plain = this.get(id)
        if (plain === undefined) 留着的[id] = data.entries[id]!
        else entries[id] = plain
      }
      if (Object.keys(留着的).length) {
        undecrypted = 留着的
        this.onInsecure(`存储方式切换（加密→明文），这些凭证现在解不开，密文原样保留、钥匙串恢复后自动可用：${Object.keys(留着的).join("、")}`)
      }
    }
    delete undecrypted?.[endpointId]
    entries[endpointId] = 编码(secret)
    this.write({ encrypted, entries, ...(undecrypted && Object.keys(undecrypted).length ? { undecrypted } : {}) })
  }

  delete(endpointId: string): void {
    const data = this.read()
    const entries = { ...data.entries }
    delete entries[endpointId]
    const undecrypted = { ...data.undecrypted }
    delete undecrypted[endpointId]
    // 逐字段重组，不 `...data`（2026-09-01 终审抓的）：铺开 `data` 会把原来的 `undecrypted` 整张表又带回去，
    // 删的正好是它唯一的一条时后面那个条件展开是空的、原表就活了下来——那行「解不开、需要重新填写」怎么点「移除」都删不掉
    this.write({ encrypted: data.encrypted, entries, ...(Object.keys(undecrypted).length ? { undecrypted } : {}) })
  }

  /**
   * 已配置凭证的 provider 列表。**只返回 id，不返回值。**
   *
   * 钥匙串里还住着一堆**不是模型服务**的秘密，它们都带 `<域>:` 前缀:
   * `ssh:<连接>` · `weixin:botToken` · `feishu:appSecret` · `vision:apiKey` ·
   * `mcp:<服务器>:<变量>`。这些若冒进设置的「模型服务」列表(2026-08-23 作者截图抓的),
   * 不但显示成「xxx 没有模型」,点「移除」还会**真删掉飞书密钥 / MCP 密钥 / 视觉 key**
   * (审查 debug F1:2026-08-23 只补了 ssh/weixin,08-25 新增的三类没跟上)。
   *
   * **provider id 一定不含冒号**(pi 的 provider 名是 `deepseek`/`openai` 这类),
   * 所以判据反过来更稳:**带 `:` 前缀的一律不是模型服务**——将来再加带前缀的秘密自动排除,
   * 不用记得回这里补名单。
   */
  configured(): string[] {
    return this.verified() ? this.分类().ok : this.模型服务ids()
  }

  /**
   * **文件里有、但解不开的**（2026-08-28 作者打包版抓的）：未签名的 app 每换一个二进制，macOS 钥匙串就不认
   * 上一版建的那把钥匙，上一版存的 key 全部解不开——而此前 `configured()` 只看文件里有没有这个键，
   * 界面照样显示「已配置」、向导不亮、一开口 pi 报 `Provider is not configured`。解不开的必须单独列出来，
   * 让界面说「需要重新填写」。签名之后这个问题消失，签名之前它每次更新都会来。
   *
   * **没核验之前答空**——核验要解密，解密要进钥匙串，见 `verified()`。
   */
  broken(): string[] {
    return this.verified() ? this.分类().bad : []
  }

  /**
   * `configured()` / `broken()` 的答案是不是核验过的。**核验 = 逐条解密，解密 = 进钥匙串**——
   * 而钥匙串不能在启动路径上碰（见 `isEncrypted`）。所以在 `warm()` 之前，有加密文件时
   * `configured()` 按文件里有没有键答（可能把解不开的也算上）、`broken()` 答空、这里答 false；
   * 界面看到 false 就过几秒再问一次。没有文件、或文件是明文的，不用钥匙串就能核验。
   *
   * 审查（2026-08-29）抓的：第一版把解密放进了 `configured()`，`listCredentials` 一到就进钥匙串——
   * 前一条提交刚把它从启动路径挪出去，这一条又塞了回来，每个更新过的用户首屏又要空白几十秒。
   */
  verified(): boolean {
    if (!existsSync(this.file)) return true
    const data = this.read()
    // 明文文件里留着的密文也要解密才知道好坏，一样不能在启动路径上碰
    if (!data.encrypted && !Object.keys(data.undecrypted ?? {}).length) return true
    return this.加密可用 !== undefined
  }

  private 模型服务ids(): string[] {
    const data = this.read()
    return [...Object.keys(data.entries), ...Object.keys(data.undecrypted ?? {})].filter((k) => !k.includes(":"))
  }

  /**
   * **只记解得开的，失败不记**：钥匙串锁着、用户点了一次「拒绝」、securityd 超时，都是一次性的——
   * 记成「解不开」会让向导叫人重填其实好好的 key。成功的记住是因为 listCredentials 每次刷新都来问。
   */
  private 解得开的 = new Set<string>()
  private 已报过解不开 = new Set<string>()
  private 解得开(id: string): boolean {
    return this.解得开的.has(id) || this.get(id) !== undefined
  }

  /**
   * 解得开 / 解不开一次分完，`configured()` 与 `broken()` 共用。此前两个各自过一遍全表，`listCredentials` 一到，
   * 每个解不开的 id 被主线程同步解两次——而界面每 3 秒问一次、解不开正是最慢的那种（2026-09-01 审查抓的）。
   * 结果只活到本轮同步调用结束（下一个微任务就清），所以失败仍然不跨轮记住。
   */
  private 分类结果: { ok: string[]; bad: string[] } | undefined
  private 分类(): { ok: string[]; bad: string[] } {
    if (this.分类结果) return this.分类结果
    const ok: string[] = []
    const bad: string[] = []
    for (const id of this.模型服务ids()) (this.解得开(id) ? ok : bad).push(id)
    this.分类结果 = { ok, bad }
    queueMicrotask(() => { this.分类结果 = undefined })
    return this.分类结果
  }
}

/** 默认位置：用户数据目录下的 credentials.json */
export function defaultCredentialFile(userDataDir: string): string {
  return join(userDataDir, "credentials.json")
}
