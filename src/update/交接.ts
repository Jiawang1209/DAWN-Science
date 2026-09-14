/**
 * key 交接（规格 U5）：**换一版之后不用重填 API key 与服务器口令**。
 *
 * ## 为什么要有这个东西
 *
 * macOS 钥匙串的 ACL 认二进制。未签名的包每换一版就是另一个二进制，
 * **上一版加密的东西新版一条都解不开**——`rehearse:update` 演练的正是这一幕。
 * 签名能让它消失；不签名就只能由**还活着的旧版**把明文交给新版。
 *
 * ## 这一层加密不是保密
 *
 * 密钥是从**机器 id + 一撮盐**派生的，能读这台机器上这个用户文件的人就能解开它。
 * 它买的只是「这份东西不在磁盘上摊着」。所以：
 * **只在换包那一刻写、新版首启立刻删、写与读都记一行**。
 *
 * ## 接不上就不接
 *
 * 机器 id 取不到、文件坏了、换了机器——任何一条不成立都**退回今天的行为**
 * （新版提示重新填写），但必须出声。**不许假装接上了**：那会让人以为 key 还在，
 * 而第一句话才发现不在。
 */
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto"

export interface 交接箱选项 {
  /** `userData/handoff.json` */
  文件: string
  /** `userData/.handoff-salt`。没有就现生成一撮 */
  盐文件: string
  /** 这台机器的 id（mac 的 IOPlatformUUID / Windows MachineGuid / Linux machine-id） */
  机器id: () => string | undefined
  出声?: (话: string) => void
}

interface 盘上的 {
  v: 1
  从: string
  到: string
  写于: string
  iv: string
  tag: string
  data: string
}

export class 交接箱 {
  private readonly 出声: (话: string) => void
  constructor(private readonly o: 交接箱选项) {
    this.出声 = o.出声 ?? ((m) => console.error(`[更新交接] ${m}`))
  }

  /** @returns 写成了没有。**false 不是异常**，是「这次不交接」，调用方照旧继续换包 */
  写({ 条目, 从, 到 }: { 条目: Record<string, string>; 从: string; 到: string }): boolean {
    const 钥匙 = this.钥匙()
    if (!钥匙) return false
    try {
      const iv = randomBytes(12)
      const c = createCipheriv("aes-256-gcm", 钥匙, iv)
      const 密 = Buffer.concat([c.update(JSON.stringify(条目), "utf8"), c.final()])
      const 盘: 盘上的 = {
        v: 1,
        从,
        到,
        写于: new Date().toISOString(),
        iv: iv.toString("base64"),
        tag: c.getAuthTag().toString("base64"),
        data: 密.toString("base64"),
      }
      mkdirSync(dirname(this.o.文件), { recursive: true })
      // **先 0600 再写**：先写后 chmod 中间有一个谁都能读的窗口
      writeFileSync(this.o.文件, JSON.stringify(盘, null, 2), { mode: 0o600 })
      chmodSync(this.o.文件, 0o600)
      this.出声(`已把 ${Object.keys(条目).length} 条凭证交给下一版（${从} → ${到}）`)
      return true
    } catch (e) {
      this.出声(`交接文件写不出来，这次更新之后要重新填 key：${e instanceof Error ? e.message : String(e)}`)
      return false
    }
  }

  /** @returns 解出来的明文条目；`undefined` = 没有 / 解不开（**两种都要照「没有」办**） */
  读(): Record<string, string> | undefined {
    if (!existsSync(this.o.文件)) return undefined
    const 钥匙 = this.钥匙()
    if (!钥匙) return undefined
    try {
      const 盘 = JSON.parse(readFileSync(this.o.文件, "utf8")) as 盘上的
      const d = createDecipheriv("aes-256-gcm", 钥匙, Buffer.from(盘.iv, "base64"))
      d.setAuthTag(Buffer.from(盘.tag, "base64"))
      const 明 = Buffer.concat([d.update(Buffer.from(盘.data, "base64")), d.final()]).toString("utf8")
      const o = JSON.parse(明) as Record<string, string>
      this.出声(`接到上一版（${盘.从}）交来的 ${Object.keys(o).length} 条凭证`)
      return o
    } catch (e) {
      // GCM 的 tag 对不上就是解不开（换了机器、文件被改过）——**不返回半截东西**
      this.出声(`handoff.json 解不开，这一版要重新填 key：${e instanceof Error ? e.message : String(e)}`)
      return undefined
    }
  }

  /** 用完就删。**成功与失败两条路都要走到这里** */
  清(): void {
    try {
      rmSync(this.o.文件, { force: true })
    } catch (e) {
      this.出声(`交接文件删不掉（它还在盘上）：${e instanceof Error ? e.message : String(e)}`)
    }
  }

  private 钥匙(): Buffer | undefined {
    const id = this.o.机器id()
    if (!id) {
      this.出声("取不到这台机器的 id，这次不交接凭证（更新之后需要重新填 key）")
      return undefined
    }
    return Buffer.from(hkdfSync("sha256", Buffer.from(id, "utf8"), this.盐(), Buffer.from("dawn-handoff"), 32))
  }

  private 盐(): Buffer {
    try {
      if (existsSync(this.o.盐文件)) return Buffer.from(readFileSync(this.o.盐文件, "utf8").trim(), "base64")
    } catch {
      // 读不出来就重新生成一撮：**代价是这一次接不上**（tag 对不上），而不是解出乱码
    }
    const 盐 = randomBytes(32)
    try {
      mkdirSync(dirname(this.o.盐文件), { recursive: true })
      writeFileSync(this.o.盐文件, 盐.toString("base64"), { mode: 0o600 })
    } catch (e) {
      this.出声(`盐写不下去：${e instanceof Error ? e.message : String(e)}`)
    }
    return 盐
  }
}
