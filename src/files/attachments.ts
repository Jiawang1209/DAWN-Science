/**
 * 外部文件附件（2026-08-25，学自 dsh-paste-input——`ccb_hive_code_learn/dsh-paste-input-解读.md`）。
 *
 * **世界观与 `@` 引用一致：文件进工作区、路径给模型**。粘贴 / 拖拽进来的外部文件
 * 先只在内存里排队（chip），**发送那一刻**才写进
 * `<工作区>/.dawn/attachments/<会话目录>/<批次>/`，随后以 `@相对路径` 进消息。
 * ×掉 chip = 磁盘无痕（学它的「发送才落盘」）。
 *
 * **owner marker 才有资格谈清理**（学它的第二个门道）：每个批次目录里写一份
 * `.dawn-attachments.json` 清单；用量与清理**只认带自家 marker 的目录**，
 * 别人放进来的东西一律不碰、必须活过清理。
 *
 * 不抄的：HTTP 批次协议与 Host/Origin 栅栏（那是 WebUI 远端宿主的必需品；
 * 这里是 Electron 主进程直接落盘，一条窄 IPC 就够）、staging 目录
 * （批次目录名含 UUID 不会撞车，写完才返回，途中抛错就整目录删掉——同样到不了「半截可见」）。
 */
import { createHash, randomUUID } from "node:crypto"
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs"
import { copyFileSync } from "node:fs"
import { basename, dirname, extname, join, relative, resolve, sep } from "node:path"

export const 附件根名 = ".dawn/attachments"
const MARKER = ".dawn-attachments.json"
const OWNER = "dawn-paste-input"

/** 限额照抄 dsh-paste-input 的常量表（它在真实 WebUI 上磨过）；超了**当场出声**，不静默截断 */
export const 附件限额 = Object.freeze({
  单文件字节: 1024 ** 3,
  批次字节: 2 * 1024 ** 3,
  文件数: 10_000,
})

export interface 要存的文件 {
  名: string
  /** 二选一：磁盘上已有（拖拽给了真实路径）就复制；只有字节（剪贴板截图类）就写盘 */
  源路径?: string | undefined
  字节?: Uint8Array | undefined
}

export interface 存的结果 {
  批次目录: string
  /** 相对工作区的路径（正斜杠），发消息时拼 `@` 用 */
  相对路径们: string[]
}

/** 会话目录名：slug + 摘要（学它的 `sessionDirectoryName`——slug 给人认，摘要防撞） */
export function 会话目录名(sessionId: string): string {
  const slug = sessionId.replace(/[^A-Za-z0-9._-]+/g, "-").slice(0, 48) || "session"
  const digest = createHash("sha256").update(sessionId).digest("hex").slice(0, 12)
  return `${slug}-${digest}`
}

/** 文件名消毒（学它的 `safeSegment`）：控制字符、Windows 禁字、`..`、空名，全换掉 */
export function 安全文件名(名: string): string {
  // **空白也换**：存下来的名字要能进 `@` 令牌（识别到空白就断，见 mentions.ts）
  let n = 名.normalize("NFC").replace(/[/\\<>:"|?*\u0000-\u001f]/g, "_").replace(/\s+/g, "_")
  if (n === "" || n === "." || n === "..") n = "_"
  return n
}

function 撞名让位(目录: string, 名: string, 占了: Set<string>): string {
  let 候 = 名
  let i = 1
  while (占了.has(候)) {
    const 尾 = extname(名)
    候 = `${basename(名, 尾)}~${i++}${尾}`
  }
  占了.add(候)
  return 候
}

function 必须在里面(根: string, 目标: string): void {
  const rel = relative(根, 目标)
  if (rel === "" || rel === ".." || rel.startsWith(`..${sep}`)) {
    throw new Error(`附件路径越界：${目标}`)
  }
}

/**
 * 发送那一刻把排队的文件写进工作区。**写一半抛错就整个批次目录删掉**——
 * 正式目录里永远不出现半截批次（与它 staging→rename 达成同一件事的更短路径）。
 */
export function 存附件(工作区: string, sessionId: string, 文件们: readonly 要存的文件[]): 存的结果 {
  if (文件们.length === 0) throw new Error("没有要存的文件")
  if (文件们.length > 附件限额.文件数) throw new Error(`一次最多 ${附件限额.文件数} 个文件`)
  let 总 = 0
  for (const f of 文件们) {
    if (!f.字节 && !f.源路径) throw new Error(`「${f.名}」既没有路径也没有字节`)
    const 大小 = f.字节 ? f.字节.byteLength : statSync(f.源路径!).size
    if (大小 > 附件限额.单文件字节) throw new Error(`「${f.名}」超过单文件上限 1 GiB`)
    总 += 大小
    if (总 > 附件限额.批次字节) throw new Error("这一批合计超过 2 GiB")
  }
  const 根 = resolve(工作区, 附件根名)
  const 批次名 = `${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`
  const 批次目录 = join(根, 会话目录名(sessionId), 批次名)
  必须在里面(根, 批次目录)
  mkdirSync(批次目录, { recursive: true })
  const 占了 = new Set<string>([MARKER])
  const 相对路径们: string[] = []
  const 清单文件: { 名: string; 原名: string; 字节: number }[] = []
  try {
    let 总字节 = 0
    for (const f of 文件们) {
      const 名 = 撞名让位(批次目录, 安全文件名(f.名), 占了)
      const 目标 = join(批次目录, 名)
      必须在里面(批次目录, 目标)
      if (f.字节) writeFileSync(目标, f.字节, { flag: "wx" })
      else if (f.源路径) copyFileSync(f.源路径, 目标)
      else throw new Error(`「${f.名}」既没有路径也没有字节`)
      const 大小 = statSync(目标).size
      总字节 += 大小
      清单文件.push({ 名, 原名: f.名, 字节: 大小 })
      相对路径们.push(relative(resolve(工作区), 目标).split(sep).join("/"))
    }
    writeFileSync(
      join(批次目录, MARKER),
      `${JSON.stringify({ owner: OWNER, version: 1, sessionId, createdAt: new Date().toISOString(), 总字节, files: 清单文件 }, null, 2)}\n`,
      { flag: "wx" },
    )
  } catch (e) {
    rmSync(批次目录, { recursive: true, force: true })
    throw e
  }
  return { 批次目录, 相对路径们 }
}

interface 一批 {
  目录: string
  字节: number
  文件数: number
}

/** 只认自家 marker（owner + version）；认不出的目录**不算数也不许删** */
function 自家批次(会话目录: string, sessionId?: string): 一批[] {
  let entries
  try {
    entries = readdirSync(会话目录, { withFileTypes: true })
  } catch {
    return []
  }
  const 出: 一批[] = []
  for (const e of entries) {
    if (!e.isDirectory()) continue
    const 目录 = join(会话目录, e.name)
    try {
      const m = JSON.parse(readFileSync(join(目录, MARKER), "utf8")) as {
        owner?: string
        version?: number
        sessionId?: string
        总字节?: number
        files?: unknown[]
      }
      if (m.owner !== OWNER || m.version !== 1) continue
      if (sessionId !== undefined && m.sessionId !== sessionId) continue
      出.push({ 目录, 字节: typeof m.总字节 === "number" ? m.总字节 : 0, 文件数: Array.isArray(m.files) ? m.files.length : 0 })
    } catch {
      // 不是我们的东西：不算、不删
    }
  }
  return 出
}

export interface 附件用量 {
  批次: number
  文件: number
  字节: number
}

export function 附件用量of(工作区: string, sessionId: string): 附件用量 {
  const 批 = 自家批次(join(resolve(工作区), 附件根名, 会话目录名(sessionId)), sessionId)
  return { 批次: 批.length, 文件: 批.reduce((n, b) => n + b.文件数, 0), 字节: 批.reduce((n, b) => n + b.字节, 0) }
}

/** 清理这段会话的全部附件批次。返回删了多少——**说得出数才算删了** */
export function 清附件(工作区: string, sessionId: string): 附件用量 {
  const 会话目录 = join(resolve(工作区), 附件根名, 会话目录名(sessionId))
  const 批 = 自家批次(会话目录, sessionId)
  for (const b of 批) {
    必须在里面(会话目录, b.目录)
    rmSync(b.目录, { recursive: true, force: true })
  }
  return { 批次: 批.length, 文件: 批.reduce((n, b) => n + b.文件数, 0), 字节: 批.reduce((n, b) => n + b.字节, 0) }
}
