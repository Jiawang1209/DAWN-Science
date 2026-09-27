/**
 * 方案簿（先出方案，2026-09-27，spec `2026-09-27-先出方案-design.md` §4.4）：一段会话的方案期阶段与每一版方案。
 *
 * **落盘在会话目录的 `plans.json`**：重启续接之后，开关状态、卡片状态、已批准文件的保护都还在——
 * 只放内存的话，重启一次「已批准的方案不许改」就悄悄失效了，而那种失效没有任何东西会报警。
 * 读坏了**不拦会话**（方案簿是增益、不是准入条件），当空簿开，`读坏了` 给运行时出声。
 *
 * 簿里每一版比协议里的 `方案` 多两样（2026-09-28，D3 第二道）：批准时的 `sha256` 与存档位置 `存档`。
 * 它们只给运行时核对用，**不进事件**（`公开()` 摘掉）——界面要的只是「文件和批准时一不一样」（`fileChanged`）。
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { dirname, join, posix } from "node:path"
import type { 方案 } from "../protocol/plan.js"
import { 方案目录 } from "../policy/science-layout.js"
import type { 已批准存档 } from "../policy/plan-mode.js"
import { 单引号 } from "../remote/ssh.js"
import type { RemoteLike } from "./types.js"

/** 方案簿在会话目录里的文件名。运行时读写它、全文搜索只读它（`pi-record.ts` 的 `读方案们`） */
export const 方案簿文件名 = "plans.json"

/**
 * 簿里记的一版：协议里的 `方案` + 批准时的指纹与存档（只有本机会话批准的才有）
 * + `离枝`（2026-09-28）：批准过、但交它的那次 `propose_plan` 已经不在当前对话分支上（回退到它之前了）。见 `只留`。
 */
export type 方案记录 = 方案 & { sha256?: string; 存档?: string; 离枝?: true }

interface 簿内容 {
  阶段: "off" | "planning"
  方案们: 方案记录[]
}

/** 给事件、给 `history()` 的那一份：摘掉只给运行时用的几样 */
export function 公开(p: 方案记录): 方案 {
  const { sha256: _指纹, 存档: _存档, 离枝: _离枝, ...rest } = p
  return { ...rest }
}

export class 方案簿 {
  private 内: 簿内容 = { 阶段: "off", 方案们: [] }
  /** 读 `plans.json` 失败的原因（有就说一声）。没读坏 = undefined */
  readonly 读坏了: string | undefined

  constructor(private readonly 文件: string | undefined) {
    if (!文件) return
    try {
      const 原 = JSON.parse(readFileSync(文件, "utf8")) as Partial<簿内容>
      this.内 = { 阶段: 原.阶段 === "planning" ? "planning" : "off", 方案们: Array.isArray(原.方案们) ? 原.方案们 : [] }
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") {
        this.读坏了 = `方案记录（${文件}）读不出来，这段会话的方案从空的开始：${e instanceof Error ? e.message : String(e)}`
      }
    }
  }

  get 阶段(): "off" | "planning" {
    return this.内.阶段
  }
  设阶段(v: "off" | "planning"): void {
    this.内.阶段 = v
    this.存()
  }
  找(planId: string): 方案 | undefined {
    const p = this.内.方案们.find((x) => x.planId === planId)
    return p ? 公开(p) : undefined
  }
  /** 门要保护的那几份。**离枝的不算**（2026-09-28）：对话里已经没有它，那份文件就是你项目里的一份普通文件 */
  已批准路径(): string[] {
    return this.内.方案们.flatMap((p) => (p.status === "approved" && !p.离枝 && p.savedPath ? [p.savedPath] : []))
  }
  /** 批准时记下了指纹与存档的那几版（本机会话才有）：D3 第二道核对它们。**离枝的不拍底、不恢复、不记「你改过」** */
  已批准存档(): (已批准存档 & { planId: string })[] {
    return this.内.方案们.flatMap((p) =>
      p.status === "approved" && !p.离枝 && p.savedPath && p.sha256 && p.存档 ? [{ planId: p.planId, 相对: p.savedPath, sha256: p.sha256, 存档: p.存档 }] : [],
    )
  }

  /**
   * 收一版。之前还在等的那版标「已被取代」——**只有最新那版能答**。
   * 版本号 = 已有的最大版本 + 1（不是条数 + 1：回退会摘掉簿里的几版，见 `只留`）。
   */
  收(planId: string, title: string, markdown: string): { 新: 方案; 被取代: 方案[] } {
    const 被取代: 方案[] = []
    for (const p of this.内.方案们) {
      if (p.status === "proposed") {
        p.status = "superseded"
        被取代.push(公开(p))
      }
    }
    const 最大 = this.内.方案们.reduce((m, p) => Math.max(m, p.version), 0)
    const 新: 方案记录 = { planId, version: 最大 + 1, title, markdown, status: "proposed" }
    this.内.方案们.push(新)
    this.存()
    return { 新: 公开(新), 被取代 }
  }

  /** 这一版此刻能不能答。不能就抛，**说清是哪一种不能**（后端据字眼分码） */
  可答(planId: string): 方案 {
    const p = this.内.方案们.find((x) => x.planId === planId)
    if (!p) throw new Error(`没有这一版方案：${planId}`)
    if (p.status === "approved") throw new Error("这一版方案已经批过了")
    if (p.status === "superseded") throw new Error("这一版方案已经不是最新的了，看最新那一版")
    if (p.status === "discarded") throw new Error("这一版方案已经说过不做了")
    return 公开(p)
  }

  批准(planId: string, o: { 正文: string; savedPath: string; 时刻: number; 改过: boolean; sha256?: string; 存档?: string }): 方案 {
    this.可答(planId)
    const p = this.内.方案们.find((x) => x.planId === planId)!
    p.status = "approved"
    p.markdown = o.正文
    p.savedPath = o.savedPath
    p.approvedAt = o.时刻
    if (o.改过) p.edited = true
    if (o.sha256 && o.存档) {
      p.sha256 = o.sha256
      p.存档 = o.存档
    }
    this.存()
    return 公开(p)
  }

  作废(planId: string): 方案 {
    this.可答(planId)
    const p = this.内.方案们.find((x) => x.planId === planId)!
    p.status = "discarded"
    this.存()
    return 公开(p)
  }

  /**
   * 记「工作区里那份和批准时不一样了」（2026-09-28，卡片上说「你改过」）。**变了才记、才回**——没变回 undefined，调用方据此决定发不发事件。
   */
  设文件改过(planId: string, 改过: boolean): 方案 | undefined {
    const p = this.内.方案们.find((x) => x.planId === planId)
    // 离枝的没有卡片（转录里没有它）：不记、不回，调用方也就不发事件
    if (!p || p.离枝 || Boolean(p.fileChanged) === 改过) return undefined
    if (改过) p.fileChanged = true
    else delete p.fileChanged
    this.存()
    return 公开(p)
  }

  /**
   * 回退之后（2026-09-28）：对话里已经没有那次 `propose_plan` 的几版**摘掉**——卡片跟着转录一起没了，
   * 留在簿里的话它还「能答」（一张看不见的卡能被批）、版本号也接不上。
   * **批准过的不摘、记成「离枝」**（2026-09-28 交叉审查定案）：批准是人的动作，回退对话不撤销它，文件留在项目里；
   * 但卡片已经不在转录里——此前它照旧被 D3 拍底、恢复、记「你改过」，收尾时一个 `plan` 事件把卡片**追加到转录末尾**
   * （重载又消失），恢复的通知说的是一份看不见的方案。离枝之后：门不保护、D3 不管、不发卡片事件——那份文件是你的一份普通文件。
   * 它的 propose_plan 回到分支上（目前没有这条路，防御）就摘掉标记。
   * 摘完之后分支上最新那一版若是「已被取代」（取代它的那版刚被摘掉 / 离枝），它又是最新的了——**回到「等你看」**，回给调用方发事件。
   */
  只留(还在的调用: ReadonlySet<string>): { 摘: number; 离枝?: number; 复原?: 方案 } {
    const 前 = this.内.方案们.length
    this.内.方案们 = this.内.方案们.filter((p) => p.status === "approved" || 还在的调用.has(p.planId))
    const 摘 = 前 - this.内.方案们.length
    let 离枝 = 0
    let 标记变了 = false
    for (const p of this.内.方案们) {
      if (p.status !== "approved") continue
      const 在 = 还在的调用.has(p.planId)
      if (!在 && !p.离枝) {
        p.离枝 = true
        离枝++
      } else if (在 && p.离枝) {
        delete p.离枝
        标记变了 = true
      }
    }
    if (摘 === 0 && 离枝 === 0 && !标记变了) return { 摘 }
    const 最新 = this.内.方案们.reduce<方案记录 | undefined>((m, p) => (p.离枝 ? m : !m || p.version > m.version ? p : m), undefined)
    let 复原: 方案 | undefined
    if (最新?.status === "superseded") {
      最新.status = "proposed"
      复原 = 公开(最新)
    }
    this.存()
    return { 摘, ...(离枝 ? { 离枝 } : {}), ...(复原 ? { 复原 } : {}) }
  }

  private 存(): void {
    if (!this.文件) return
    mkdirSync(dirname(this.文件), { recursive: true })
    writeFileSync(this.文件, JSON.stringify(this.内, null, 2))
  }
}

/** 存档文件的正文：一段 YAML 头 + 方案原文。头里记的是「谁、什么时候、批的哪一版、改没改过」——预注册要的就是这几件 */
export function 方案存档正文(o: {
  title: string
  version: number
  正文: string
  改过: boolean
  时刻: Date
  sessionId: string
  模型: string
}): string {
  return [
    "---",
    `title: ${JSON.stringify(o.title)}`,
    `version: ${o.version}`,
    `approved_at: ${o.时刻.toISOString()}`,
    `session: ${o.sessionId}`,
    `model: ${JSON.stringify(o.模型)}`,
    `edited_by_user: ${o.改过}`,
    "status: approved",
    "---",
    "",
    o.正文.trim(),
    "",
  ].join("\n")
}

/**
 * 写进 `<工作区>/analysis/plans/<名>`，回相对路径。**从不覆盖**：重名加 `-2`、`-3`…
 * 本机用 `wx` 打开；远端先用 noclobber 原子地占一个空文件（`set -C && : > p`，shell 以 `O_EXCL` 建），占到了再写内容——
 * 2026-09-28 审查：原先「`test -e` 再写」不是原子的，两次批准挤在一起会写到同一个名字上。占位失败时再 `test -e`：
 * 在 → 是重名，换下一个；不在 → 是别的原因（没权限……），原样抛。占到了却写不进去 → 把空占位删掉再抛。
 * 远端会话走那台机器的执行器——方案是分析的一部分，与 agent 写的脚本放在同一个项目里。
 */
export async function 写方案文件(o: { workspace: string; 远端?: RemoteLike | undefined; 名: string; 正文: string }): Promise<string> {
  const 第 = (i: number) => (i === 1 ? o.名 : o.名.replace(/\.md$/, `-${i}.md`))
  if (!o.远端) {
    const 目录 = join(o.workspace, 方案目录)
    mkdirSync(目录, { recursive: true })
    for (let i = 1; i < 100; i++) {
      try {
        writeFileSync(join(目录, 第(i)), o.正文, { flag: "wx" })
        return `${方案目录}/${第(i)}`
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e
      }
    }
    throw new Error("同名的方案文件已经有 99 份了，换个标题再批")
  }
  const 远端 = o.远端
  const 目录 = posix.join(o.workspace, 方案目录)
  const 建 = await 远端.exec(`mkdir -p ${单引号(目录)}`)
  if (建.code !== 0) throw new Error(`在服务器上建 ${目录} 失败：${建.stderr.trim() || `退出码 ${建.code}`}`)
  for (let i = 1; i < 100; i++) {
    const p = posix.join(目录, 第(i))
    const 占 = await 远端.exec(`set -C && : > ${单引号(p)}`)
    if (占.code !== 0) {
      if ((await 远端.exec(`test -e ${单引号(p)}`)).code === 0) continue
      throw new Error(`在服务器上建 ${p} 失败：${占.stderr.trim() || `退出码 ${占.code}`}`)
    }
    try {
      await 远端.writeFile(p, o.正文)
    } catch (e) {
      await 远端.exec(`rm -f ${单引号(p)}`).catch(() => {})
      throw e
    }
    return `${方案目录}/${第(i)}`
  }
  throw new Error("同名的方案文件已经有 99 份了，换个标题再批")
}

/** 删掉 `写方案文件` 写下的那份（批准后面的步骤失败时收拾用）。本机 `rm`，远端 `rm -f`。**永不 reject** */
export async function 删方案文件(o: { workspace: string; 远端?: RemoteLike | undefined; 相对: string }): Promise<void> {
  try {
    if (!o.远端) rmSync(join(o.workspace, o.相对), { force: true })
    else await o.远端.exec(`rm -f ${单引号(posix.join(o.workspace, o.相对))}`)
  } catch {
    // 收拾不了也不盖住原来那个错误
  }
}
