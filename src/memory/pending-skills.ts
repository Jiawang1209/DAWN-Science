/**
 * 待装技能(2026-08-25,学自 dsh-memory-evolve skills.js):AI 用 `skill_propose`
 * 写完整 SKILL.md → 落 `<memoriesDir>/pending-skills/<名>/SKILL.md` 待确认;
 * 用户在记忆屏批准 = **目录移入技能库**(接现有技能管理三档),拒绝 = 删。
 *
 * 校验(dsh 同款):kebab-case 名(顺带排除路径穿越)、frontmatter 必须有
 * name + description 且 name 与目录名一致、体积上限。与技能库/待装区重名都拒。
 */
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"

const 技能名文法 = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const 体积上限 = 65536

export function isSkillName(name: string): boolean {
  return 技能名文法.test(name)
}

/** 解析 SKILL.md 的 frontmatter(CRLF 兼容——dsh issue #17 踩过)。不规范回 undefined。 */
export function parseFrontmatter(text: string): { name: string; description: string } | undefined {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text)
  if (!m) return undefined
  const fields: Record<string, string> = {}
  for (const line of m[1]!.split("\n")) {
    const f = /^([a-zA-Z0-9_-]+):\s*(.*)$/.exec(line.replace(/\r+$/, ""))
    if (!f) continue
    let v = f[2]!.trim()
    const quoted = (v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))
    if (quoted) v = v.slice(1, -1)
    // 裸标量含 ": " 或行内注释在严格 YAML 里非法——这里接受的技能到了 pi 那边也要能解析
    else if (v.includes(": ") || v.includes(" #")) return undefined
    fields[f[1]!] = v
  }
  if (!fields.name || !fields.description) return undefined
  return { name: fields.name, description: fields.description }
}

export interface 技能结果 {
  ok: boolean
  message: string
}

export class 待装技能 {
  /**
   * @param pendingDir 待确认目录(`<memoriesDir>/pending-skills`)
   * @param 技能库 取技能库根目录(批准的落点;注入函数便于测试与将来改址)
   */
  constructor(
    private readonly pendingDir: string,
    private readonly 技能库: () => string,
  ) {}

  list(): { name: string; description: string; content: string }[] {
    let names: string[]
    try {
      names = readdirSync(this.pendingDir, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => e.name)
    } catch {
      return []
    }
    const 出: { name: string; description: string; content: string }[] = []
    for (const n of names) {
      try {
        const content = readFileSync(join(this.pendingDir, n, "SKILL.md"), "utf8")
        const p = parseFrontmatter(content)
        if (p && p.name === n) 出.push({ name: n, description: p.description, content })
      } catch {
        // 读不出/不规范的跳过——list 是给人看的,坏目录不炸整页
      }
    }
    return 出.sort((a, b) => a.name.localeCompare(b.name))
  }

  propose(name: string, body: string): 技能结果 {
    const n = String(name ?? "").trim()
    if (!isSkillName(n)) return { ok: false, message: `技能名「${n}」不合规:全小写 kebab-case(如 otu-network)` }
    if (typeof body !== "string" || body.length === 0) return { ok: false, message: "技能正文为空" }
    if (body.length > 体积上限) return { ok: false, message: `技能太大(${body.length} 字节,上限 ${体积上限})` }
    const p = parseFrontmatter(body)
    if (!p) return { ok: false, message: "SKILL.md 格式不对:开头要有 frontmatter(--- 包住的 name + description)" }
    if (p.name !== n) return { ok: false, message: `frontmatter 的 name(${p.name})与技能名(${n})对不上` }
    if (existsSync(join(this.技能库(), n, "SKILL.md"))) {
      return { ok: false, message: `技能库里已有「${n}」——改进已有技能请让用户在技能屏操作` }
    }
    if (existsSync(join(this.pendingDir, n, "SKILL.md"))) {
      return { ok: false, message: `「${n}」已在待确认队列里,等用户处理` }
    }
    const dir = join(this.pendingDir, n)
    mkdirSync(dir, { recursive: true })
    const path = join(dir, "SKILL.md")
    const tmp = `${path}.tmp.${process.pid}`
    writeFileSync(tmp, body)
    renameSync(tmp, path)
    return { ok: true, message: `技能「${n}」已进待确认队列,用户批准后装进技能库` }
  }

  /** 批准 = 目录移入技能库(EXDEV 跨盘回退 copy+rm——dsh 在 Windows 踩过)。 */
  approve(name: string): 技能结果 {
    if (!isSkillName(name)) return { ok: false, message: `技能名「${name}」不合规` }
    const from = join(this.pendingDir, name)
    if (!existsSync(join(from, "SKILL.md"))) return { ok: false, message: `待确认队列里没有「${name}」` }
    const to = join(this.技能库(), name)
    if (existsSync(join(to, "SKILL.md"))) return { ok: false, message: `技能库里已有同名「${name}」,不覆盖` }
    mkdirSync(this.技能库(), { recursive: true })
    try {
      renameSync(from, to)
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "EXDEV") {
        cpSync(from, to, { recursive: true })
        rmSync(from, { recursive: true, force: true })
      } else {
        throw e
      }
    }
    return { ok: true, message: `技能「${name}」已装进技能库(下一段会话可用)` }
  }

  reject(name: string): 技能结果 {
    if (!isSkillName(name)) return { ok: false, message: `技能名「${name}」不合规` }
    const dir = join(this.pendingDir, name)
    if (!existsSync(join(dir, "SKILL.md"))) return { ok: false, message: `待确认队列里没有「${name}」` }
    rmSync(dir, { recursive: true, force: true })
    return { ok: true, message: `已拒绝「${name}」` }
  }
}
