/**
 * 建议队列(2026-08-25,学自 dsh-memory-evolve review.js `enqueueSuggestion`)。
 *
 * 模型对注入轨只能**提议**:`memory_propose` 落到这里,用户在记忆屏
 * 采纳/归档/拒绝后才动真文件。JSONL 一行一条,原子写。
 *
 * **同轨同内容(空白归一、互含)去重记 hits**——反复浮现的事实攒出频次,
 * 用户确认时有权重可看。这是「确认制不淹死人」的关键一招。
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs"
import { randomUUID } from "node:crypto"
import { dirname } from "node:path"
import { scanThreat, withLock, type 记忆轨 } from "./store.js"

export interface 建议条 {
  id: string
  time: string
  target: 记忆轨
  content: string
  reason: string
  hits: number
  lastSeen: string
  /** key 建议提出时所在的项目工作区(采纳时写回它;缺失则采纳时要求指定) */
  workspace?: string
  /** key 建议的分支范围(采纳时透传给盖戳) */
  branches?: string[]
}

const 归一 = (s: string) => String(s ?? "").replace(/\s+/g, " ").trim()

export class SuggestionQueue {
  constructor(private readonly file: string) {}

  private readAll(): 建议条[] {
    let text: string
    try {
      text = readFileSync(this.file, "utf8")
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return []
      throw e
    }
    // **逐行解析,坏行跳过**(审查 debug C6):文件是纯文本 JSONL,人手编辑/外部工具截断后
    // 若整体 JSON.parse 抛,会让 memory_propose、待确认区、采纳全部不可用且无恢复路径。
    // 一行损坏不该拖垮整个队列——跳过它,其余照读(store 侧对同类损坏有 drift guard,队列侧此前一条没有)。
    const 出: 建议条[] = []
    for (const l of text.split("\n")) {
      if (!l.trim()) continue
      try {
        出.push(JSON.parse(l) as 建议条)
      } catch {
        /* 坏行跳过 */
      }
    }
    return 出
  }

  private writeAll(entries: 建议条[]): void {
    mkdirSync(dirname(this.file), { recursive: true })
    const tmp = `${this.file}.tmp.${process.pid}`
    writeFileSync(tmp, entries.map((e) => JSON.stringify(e)).join("\n") + (entries.length > 0 ? "\n" : ""))
    renameSync(tmp, this.file)
  }

  list(): 建议条[] {
    return this.readAll()
  }

  /**
   * 入队。同轨且内容归一后相等/互含 → 不新增,原条 hits+1(理由取新的)。
   * 威胁内容在队列口就拒——脏东西不许排队等着骗确认。
   */
  propose(
    target: 记忆轨,
    content: string,
    reason: string,
    opts?: { workspace?: string; branches?: string[] },
  ): { ok: boolean; message: string; hits?: number } {
    const 正 = String(content ?? "").trim()
    if (!正) return { ok: false, message: "记忆:提议内容为空" }
    const 险 = scanThreat(正)
    if (险) return { ok: false, message: 险 }
    const now = new Date().toISOString()
    return withLock(dirname(this.file), () => {
      const entries = this.readAll()
      const n = 归一(正)
      // **只按完全相等去重**(审查 debug C5):旧实现用「互相包含」,把「用 uv 管环境,禁 conda,
      // 数据只读」这类更丰富的新建议当成旧短句「用 uv 管环境」的重复,只 hits+1、内容整段丢弃。
      const 旧 = entries.find((e) => e.target === target && 归一(e.content) === n)
      if (旧) {
        旧.hits += 1
        旧.lastSeen = now
        if (reason) 旧.reason = reason
        this.writeAll(entries)
        return { ok: true, message: `同样的建议已在队列里(第 ${旧.hits} 次提出),等用户确认`, hits: 旧.hits }
      }
      entries.push({
        id: randomUUID(),
        time: now,
        target,
        content: 正,
        reason: String(reason ?? "").trim(),
        hits: 1,
        lastSeen: now,
        ...(opts?.workspace ? { workspace: opts.workspace } : {}),
        ...(opts?.branches && opts.branches.length > 0 ? { branches: opts.branches } : {}),
      })
      this.writeAll(entries)
      return { ok: true, message: "已进待确认队列,用户采纳后写入(下一段会话生效)", hits: 1 }
    })
  }

  /** 按 id 取出并出队(采纳/归档/拒绝的第一步);没有回 undefined,队列不动。 */
  take(id: string): 建议条 | undefined {
    return withLock(dirname(this.file), () => {
      const entries = this.readAll()
      const i = entries.findIndex((e) => e.id === id)
      if (i === -1) return undefined
      const [出] = entries.splice(i, 1)
      this.writeAll(entries)
      return 出
    })
  }

  /** 放回一条(采纳失败时不丢建议)。 */
  putBack(entry: 建议条): void {
    withLock(dirname(this.file), () => {
      const entries = this.readAll()
      entries.push(entry)
      this.writeAll(entries)
    })
  }
}
