/** 父侧只读资源目录。子进程只拿到工具，不拿存储目录或全量正文。 */
import { createHash } from "node:crypto"
import { readFileSync, realpathSync, statSync } from "node:fs"
import { basename, isAbsolute, join, relative, sep } from "node:path"
import { loadSkillsFromDir } from "@earendil-works/pi-coding-agent"
import { parseEntryBranches, stripEntryId, type MemoryStore } from "../memory/store.js"
import { 读调用策略, type 调用档 } from "../skills/invocation.js"

export const RESOURCE_TOOLS = ["resource_search", "resource_read"] as const
export type ResourceMethod = typeof RESOURCE_TOOLS[number]
export interface ResourceHost { call(name: string, params: unknown): Promise<string> }
export interface ResourceHostOptions {
  workspace?: string | undefined
  roots: {path: string; scope: "project" | "global" | "builtin"}[]
  builtinMode?: ((name: string) => 调用档 | undefined) | undefined
  memory?: {store: Pick<MemoryStore, "entries">; enabled: boolean; branch?: string | undefined} | undefined
  /** 返回拒绝理由。目录发现、实际文件读取及记忆查询都经过父侧权限门。 */
  authorize?: ((tool: string, params: Record<string, unknown>) => string | undefined) | undefined
}
type Kind = "skill" | "memory"
interface Resource {
  id: string; kind: Kind; name: string; description: string; source: string
  skill?: {baseDir: string; filePath: string; builtin: boolean}
  content?: string
  searchText?: string
}
const idFor = (kind: Kind, key: string) => `${kind}:${createHash("sha256").update(key).digest("hex").slice(0, 20)}`
const chars = (s: string, n: number) => Array.from(s).slice(0, n).join("")
const within = (base: string, path: string) => { const p = relative(base, path); return p === "" || (!isAbsolute(p) && p !== ".." && !p.startsWith(`..${sep}`)) }
const MAX_FILE_BYTES = 256 * 1024

function argsFor(value: unknown, allowed: string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("资源参数必须是对象")
  const args = value as Record<string, unknown>
  for (const key of Object.keys(args)) if (!allowed.includes(key)) throw new Error(`不支持的资源参数：${key}`)
  return args
}
function numberArg(args: Record<string, unknown>, key: string, fallback: number, max: number): number {
  const value = args[key] ?? fallback
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < (key === "offset" ? 0 : 1) || value > max) throw new Error(`${key} 必须是允许范围内的整数（最大 ${max}）`)
  return value
}

export function createResourceHost(opts: ResourceHostOptions): ResourceHost {
  const entries = new Map<string, Resource>()
  const loaded = new Set<Kind>()
  const warnings: string[] = []
  const skillBoundaries: {file: string; directory?: string}[] = []
  const authorize = (tool: string, args: Record<string, unknown>) => {
    const reason = opts.authorize?.(tool, args)
    if (reason) throw new Error(reason)
  }
  const textFile = (path: string): string => {
    authorize("read", {path})
    const stat = statSync(path)
    if (!stat.isFile()) throw new Error("资源不是普通文本文件")
    if (stat.size > MAX_FILE_BYTES) throw new Error(`资源超过 ${MAX_FILE_BYTES} 字节上限，请缩小参考文件`)
    const buffer = readFileSync(path)
    if (buffer.length > MAX_FILE_BYTES) throw new Error("资源读取期间增大，超过字节上限")
    const text = new TextDecoder("utf-8", {fatal: true}).decode(buffer)
    if (text.includes("\0")) throw new Error("二进制资源不支持文本读取")
    return text
  }
  const load = (kind: Kind) => {
    if (loaded.has(kind)) return
    const pending: Resource[] = []
    if (kind === "skill") {
      const seen = new Set<string>()
      // 去重先于开关过滤：关掉项目版本不能露出全局/自带的同名版本。
      for (const root of opts.roots) {
        if (root.scope === "project" && !opts.workspace) continue
        authorize("read", {path: root.path})
        const result = loadSkillsFromDir({dir: root.path, source: "dawn-child-resource"})
        for (const diagnostic of result.diagnostics) warnings.push(String(diagnostic.message))
        for (const skill of result.skills) {
          const shadowed = seen.has(skill.name)
          seen.add(skill.name)
          try {
            skillBoundaries.push({file: realpathSync(skill.filePath), ...(basename(skill.filePath) === "SKILL.md" ? {directory: realpathSync(skill.baseDir)} : {})})
            if (shadowed) continue
            const mode = (root.scope === "builtin" ? opts.builtinMode?.(skill.name) : undefined) ?? 读调用策略(textFile(skill.filePath))
            if (mode !== "model") continue
            pending.push({id: idFor("skill", skill.filePath), kind, name: skill.name, description: chars(skill.description, 240), searchText: skill.description, source: skill.filePath,
              skill: {baseDir: skill.baseDir, filePath: skill.filePath, builtin: root.scope === "builtin"}})
          } catch (error) {
            warnings.push(`${skill.name}：${error instanceof Error ? error.message : String(error)}（${skill.filePath}）`)
          }
        }
      }
    } else if (opts.memory?.enabled) {
      authorize("memory_list", {})
      for (const target of ["user", "memory", ...(opts.workspace ? ["key" as const] : [])] as const) {
        const rows = opts.memory.store.entries(target, target === "key" ? {workspace: opts.workspace!} : undefined)
        for (const [index, content] of rows.entries()) {
          if (target === "key") {
            const branches = parseEntryBranches(content)
            if (branches && (!opts.memory.branch || !branches.includes(opts.memory.branch))) continue
          }
          const source = target === "key" ? `${opts.workspace}/.dawn/memory/KEY.md` : `${target === "user" ? "USER" : "MEMORY"}.md（全局）`
          const text = stripEntryId(content)
          pending.push({id: idFor("memory", `${source}:${index}:${content}`), kind, name: `${target} · ${index + 1}`, description: chars(text, 160), source, content: text})
        }
      }
    }
    for (const entry of pending) entries.set(entry.id, entry)
    loaded.add(kind)
  }
  return {async call(name, value) {
    if (name === "resource_search") {
      const args = argsFor(value, ["kind", "query", "offset", "limit"])
      const kind = args.kind ?? "all"
      if (kind !== "all" && kind !== "skill" && kind !== "memory") throw new Error("kind 必须为 all / skill / memory")
      if (args.query !== undefined && (typeof args.query !== "string" || args.query.length > 500)) throw new Error("query 必须是最多 500 字符的文本")
      const offset = numberArg(args, "offset", 0, Number.MAX_SAFE_INTEGER), limit = numberArg(args, "limit", 5, 20)
      if (kind !== "memory") load("skill")
      if (kind !== "skill") load("memory")
      const query = String(args.query ?? "").toLowerCase()
      const found = [...entries.values()].filter(e => (kind === "all" || e.kind === kind) && `${e.name}\n${e.searchText ?? e.description}\n${e.content ?? ""}`.toLowerCase().includes(query))
      const page = found.slice(offset, offset + limit)
      const nextOffset = offset + page.length < found.length ? offset + page.length : undefined
      return JSON.stringify({available: kind !== "memory" || !!opts.memory?.enabled, ...(kind === "memory" && !opts.memory?.enabled ? {reason: "记忆读取未启用"} : {}),
        items: page.map(({id, kind, name, description, source}) => ({id, kind, name, description, source})), total: found.length, offset, truncated: nextOffset !== undefined,
        ...(nextOffset !== undefined ? {nextOffset} : {}), ...(warnings.length ? {warnings: warnings.slice(0, 5).map(w => chars(w, 500)), warningsTotal: warnings.length,
          warningsTruncated: warnings.length > 5 || warnings.some(w => Array.from(w).length > 500)} : {})})
    }
    if (name !== "resource_read") throw new Error(`只读资源不支持方法：${name}`)
    const args = argsFor(value, ["id", "path", "offset", "limit"])
    if (typeof args.id !== "string") throw new Error("id 必须来自 resource_search 返回的资源目录")
    const entry = entries.get(args.id)
    if (!entry) throw new Error("未知或不可见的资源 ID；请先 resource_search")
    const offset = numberArg(args, "offset", 0, Number.MAX_SAFE_INTEGER), limit = numberArg(args, "limit", 3000, 4000)
    let content: string, source = entry.source
    if (entry.skill) {
      const base = realpathSync(entry.skill.baseDir)
      const ownFile = realpathSync(entry.skill.filePath)
      const path = args.path ?? relative(base, ownFile)
      if (typeof path !== "string" || !path || isAbsolute(path)) throw new Error("技能参考路径必须是目录内的相对路径")
      const candidate = join(base, path)
      if (!within(base, candidate)) throw new Error("技能参考路径越界")
      source = realpathSync(candidate)
      if (!within(base, source)) throw new Error("技能参考符号链接越界")
      if (skillBoundaries.some(boundary => boundary.file !== ownFile && (source === boundary.file || (boundary.directory && boundary.directory !== base && within(boundary.directory, source))))) {
        throw new Error("不能借参考路径读取其他技能；请分别检索该技能，可见范围仍受开关控制")
      }
      const definition = textFile(entry.skill.filePath)
      if (((entry.skill.builtin ? opts.builtinMode?.(entry.name) : undefined) ?? 读调用策略(definition)) !== "model") throw new Error("技能已停用或仅供手动调用，不可见")
      content = source === realpathSync(entry.skill.filePath) ? definition : textFile(source)
    } else {
      if (args.path !== undefined) throw new Error("记忆资源不接受 path 参数")
      authorize("memory_list", {})
      content = entry.content!
    }
    const points = Array.from(content), part = points.slice(offset, offset + limit)
    const nextOffset = offset + part.length < points.length ? offset + part.length : undefined
    return JSON.stringify({id: entry.id, kind: entry.kind, name: entry.name, source, content: part.join(""), offset, totalChars: points.length, truncated: nextOffset !== undefined,
      ...(nextOffset !== undefined ? {nextOffset} : {})})
  }}
}
