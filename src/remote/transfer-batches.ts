import { UserFacingError } from "../errors.js"
/** Host-owned directory jobs. UI lifetime never owns file streams. */
import { randomUUID } from "node:crypto"
import { mkdir, lstat, readdir, realpath } from "node:fs/promises"
import { mkdirSync, readdirSync, readFileSync, writeFileSync, renameSync } from "node:fs"
import { basename, dirname, isAbsolute, join, posix, resolve, sep } from "node:path"
import { z } from "zod"
import type { RemoteExecutor } from "./ssh.js"
import { missingFile } from "./transfer-io.js"
import { TransferBatchSchema, TransferEntrySchema, type TransferBatch, type TransferEntry, type TransferStart } from "./transfer-types.js"
interface Job { batch: TransferBatch; entries: TransferEntry[]; serverKey: string; scanned: boolean }
interface Connection { remote: RemoteExecutor; key: string; label: string }
interface Options { connection: (id: string) => Connection; persistDir?: string; uploaded?: (id: string, path: string, size: number, error?: string) => void }
const stored = z.object({ batch: TransferBatchSchema, entries: z.array(TransferEntrySchema), serverKey: z.string(), scanned: z.boolean() }).strict()
const running = (s: string) => s === "scanning" || s === "running"
const message = (e: unknown) => e instanceof Error ? e.message : String(e)
const valid = (s: string) => { if (!s || /[\x00-\x1f\x7f]/.test(s)) throw new UserFacingError("路径包含空值或控制字符"); return s }
const childName = (s: string) => { valid(s); if (s === "." || s === ".." || /[/\\]/.test(s)) throw new UserFacingError("目录包含异常文件名"); return s }
const counts = () => ({ files: 0, completedFiles: 0, directories: 0, completed: 0, failed: 0, conflict: 0, skipped: 0, cancelled: 0 })
const BIG = 8 * 1024 * 1024
export class TransferBatches {
  private jobs = new Map<string, Job>()
  private controllers = new Map<string, AbortController>()
  private pending = new Map<string, Promise<void>>()
  private active = new Map<string, { small: number; big: number }>()
  private reserved = new Set<string>()
  private disposed = false
  private savedAt = new Map<string, number>()
  constructor(private readonly opts: Options) {
    if (!opts.persistDir) return
    mkdirSync(opts.persistDir, { recursive: true, mode: 0o700 })
    for (const name of readdirSync(opts.persistDir).filter(p => p.endsWith(".json"))) {
      try {
        const job = stored.parse(JSON.parse(readFileSync(join(opts.persistDir, name), "utf8")))
        if (`${job.batch.id}.json` !== name) throw new UserFacingError("任务文件身份不符")
        if (running(job.batch.state)) {
          job.batch.state = "interrupted"
          for (const entry of job.entries) if (entry.state === "queued" || entry.state === "running") entry.state = "interrupted"
        }
        this.jobs.set(job.batch.id, job)
      } catch (error) { console.error(`[传输] 无法读取任务 ${name}: ${message(error)}`) }
    }
  }
  private save(job: Job) {
    if (!this.opts.persistDir) return
    const now = Date.now()
    if (running(job.batch.state) && this.savedAt.has(job.batch.id) && now - this.savedAt.get(job.batch.id)! < 250) return
    this.savedAt.set(job.batch.id, now)
    const path = join(this.opts.persistDir, `${job.batch.id}.json`)
    writeFileSync(`${path}.tmp`, JSON.stringify(job), { mode: 0o600 })
    renameSync(`${path}.tmp`, path)
  }
  private finalSave(job: Job) {
    try { this.save(job) } catch (error) {
      job.batch.error = `传输记录保存失败：${message(error)}`
      job.batch.state = "failed"
      console.error(job.batch.error)
    }
  }
  private summarize(job: Job): TransferBatch {
    const result = counts(); let total = 0; let transferred = 0
    for (const entry of job.entries) {
      if (entry.kind === "file") { result.files++; total += entry.size; transferred += entry.transferred; if (entry.state === "completed") result.completedFiles++ }
      if (entry.kind === "directory") result.directories++
      if (["completed", "failed", "conflict", "skipped", "cancelled"].includes(entry.state)) result[entry.state as keyof typeof result]++
    }
    job.batch.counts = result; job.batch.total = total; job.batch.transferred = transferred
    return structuredClone(job.batch)
  }
  list(): TransferBatch[] { return [...this.jobs.values()].reverse().map(job => this.summarize(job)) }
  hasActive(): boolean { return this.controllers.size > 0 }
  get(id: string, offset = 0, limit = 100, filter: "all" | "attention" = "all") {
    const job = this.job(id)
    const entries = filter === "attention" ? job.entries.filter(e => ["failed", "conflict", "cancelled", "interrupted"].includes(e.state)) : job.entries
    return { batch: this.summarize(job), entries: structuredClone(entries.slice(offset, offset + limit)), entryCount: entries.length }
  }
  private job(id: string) { const job = this.jobs.get(id); if (!job) throw new UserFacingError("没有这次目录传输"); return job }
  private connection(job: Job) {
    const connection = this.opts.connection(job.batch.connectionId)
    if (connection.key !== job.serverKey) throw new UserFacingError("服务器配置已改变，请重新创建传输")
    return connection.remote
  }
  startFiles(input: { connectionId: string; sources: string[]; targetParent: string }): TransferBatch {
    if (!input.sources.length || input.sources.length > 10000) throw new UserFacingError("请选择 1 至 10000 个文件")
    const sources = [...new Set(input.sources.map(path => { valid(path); if (!isAbsolute(path)) throw new UserFacingError("传输路径必须是绝对路径"); return resolve(path) }))]
    return this.start({ connectionId: input.connectionId, direction: "upload", source: sources[0]!, sources, targetParent: input.targetParent })
  }
  start(input: TransferStart): TransferBatch {
    if (this.disposed) throw new UserFacingError("传输服务已关闭")
    valid(input.source); valid(input.targetParent)
    if (!(input.direction === "upload" ? isAbsolute(input.source) && posix.isAbsolute(input.targetParent) : posix.isAbsolute(input.source) && isAbsolute(input.targetParent))) throw new UserFacingError("传输路径必须是绝对路径")
    if (input.source === "/" || /^[A-Za-z]:[\\/]?$/.test(input.source)) throw new UserFacingError("请选择具体文件夹，不传输文件系统根目录")
    const connection = this.opts.connection(input.connectionId)
    const job: Job = { serverKey: connection.key, scanned: false, entries: [], batch: {
      ...input, id: `batch-${randomUUID()}`, server: connection.label, createdAt: new Date().toISOString(),
      target: "", state: "scanning", total: 0, transferred: 0, counts: counts(),
    } }
    this.jobs.set(job.batch.id, job); this.launch(job)
    return this.summarize(job)
  }
  private launch(job: Job, decision?: { entryId: string; action: "overwrite" | "keepBoth" }) {
    const controller = new AbortController(); this.controllers.set(job.batch.id, controller)
    try { this.save(job) } catch (error) { this.controllers.delete(job.batch.id); job.batch.state = "failed"; job.batch.error = message(error); throw error }
    const task = this.run(job, controller.signal, decision).catch(error => {
      job.batch.state = controller.signal.aborted ? this.disposed ? "interrupted" : "cancelled" : "failed"
      job.batch.error = message(error)
      for (const entry of job.entries) if (entry.state === "queued" || entry.state === "running") entry.state = controller.signal.aborted ? this.disposed ? "interrupted" : "cancelled" : "failed"
    }).finally(() => { this.controllers.delete(job.batch.id); this.summarize(job); this.finalSave(job) })
    this.pending.set(job.batch.id, task)
    void task.finally(() => this.pending.delete(job.batch.id))
  }
  cancel(id: string) {
    this.job(id)
    this.controllers.get(id)?.abort(new Error("已取消目录传输"))
  }
  retry(id: string) {
    const job = this.job(id)
    if (running(job.batch.state) || this.controllers.has(id)) throw new UserFacingError("传输仍在运行")
    this.connection(job)
    const retryable = job.entries.filter(e => ["failed", "interrupted", "cancelled"].includes(e.state))
    if (job.scanned && retryable.length === 0) throw new UserFacingError("没有可重试的失败文件")
    for (const entry of retryable) { entry.state = "queued"; entry.transferred = 0; delete entry.error }
    if (!job.scanned) job.entries = []
    job.batch.state = job.scanned ? "running" : "scanning"; delete job.batch.error
    this.launch(job)
  }
  resolveConflict(id: string, entryId: string, action: "overwrite" | "keepBoth" | "skip") {
    const job = this.job(id)
    if (this.controllers.has(id)) throw new UserFacingError("请等待本批次传输结束后处理冲突")
    const entry = job.entries.find(e => e.id === entryId)
    if (!entry || entry.state !== "conflict") throw new UserFacingError("没有这个冲突项")
    if (action === "skip") { entry.state = "skipped"; entry.error = "已保留目标文件"; this.finish(job); this.save(job); return }
    // Decision only exists for this explicit invocation; it is never restored as automatic permission.
    entry.state = "queued"; entry.transferred = 0; delete entry.error
    job.batch.state = "running"; this.launch(job, { entryId: entry.id, action })
  }
  async dispose() { this.disposed = true; for (const ac of this.controllers.values()) ac.abort(new Error("应用退出，传输已中断")); await Promise.allSettled([...this.pending.values()]) }
  private async scan(job: Job, remote: RemoteExecutor, signal: AbortSignal) {
    const upload = job.batch.direction === "upload"
    if (job.batch.sources) {
      for (const source of job.batch.sources) {
        signal.throwIfAborted()
        const info = await lstat(source)
        if (!info.isFile()) throw new UserFacingError("请选择普通文件；文件夹请使用上传文件夹，符号链接不上传")
        job.entries.push({ id: randomUUID(), source: await realpath(source), path: childName(basename(source)), kind: "file", size: info.size, sourceMtime: info.mtimeMs, transferred: 0, state: "queued" })
      }
      job.scanned = true; return
    }
    const root = upload ? resolve(job.batch.source) : posix.resolve(job.batch.source)
    const info = upload ? await lstat(root).then(s => ({ kind: s.isDirectory() ? "directory" : "other" })) : await remote.lstat(root)
    if (info.kind !== "directory") throw new UserFacingError("传输源必须是普通目录，不能是符号链接")
    job.batch.source = upload ? await realpath(root) : await remote.realpath(root)
    const add = (path: string, kind: TransferEntry["kind"], size: number, mtime?: number) => {
      if (job.entries.length >= 10000) throw new UserFacingError("目录超过 10000 个条目，请拆分传输")
      job.entries.push({ id: randomUUID(), path, kind, size, transferred: 0, state: kind === "other" ? "skipped" : "queued", ...(mtime === undefined ? {} : { sourceMtime: mtime }), ...(kind === "other" ? { error: "符号链接或特殊文件未传输" } : {}) })
    }
    const walk = async (rel: string, depth: number) => {
      signal.throwIfAborted(); if (depth > 64) throw new UserFacingError("目录层级超过 64，请拆分传输")
      const path = upload ? join(job.batch.source, rel) : posix.join(job.batch.source, rel)
      const names = upload ? await readdir(path) : (await remote.readdir(path)).map(e => e.name)
      for (const name of names) {
        signal.throwIfAborted(); childName(name)
        const relative = rel ? `${rel}/${name}` : name
        const absolute = upload ? join(job.batch.source, relative) : posix.join(job.batch.source, relative)
        const info = upload ? await lstat(absolute).then(s => ({ kind: s.isDirectory() ? "directory" as const : s.isFile() ? "file" as const : "other" as const, size: s.size, mtime: s.mtimeMs })) : await remote.lstat(absolute)
        add(relative, info.kind, info.kind === "file" ? info.size : 0, info.mtime)
        if (info.kind === "directory") await walk(relative, depth + 1)
      }
    }
    await walk("", 0); signal.throwIfAborted(); job.scanned = true
  }
  private async exists(path: string, upload: boolean, remote: RemoteExecutor) {
    try { return upload ? await remote.lstat(path) : await lstat(path).then(s => ({ kind: s.isDirectory() ? "directory" : s.isFile() ? "file" : "other", size: s.size })) }
    catch (error) { if (missingFile(error)) return undefined; throw error }
  }
  private async destination(job: Job, remote: RemoteExecutor, signal: AbortSignal) {
    const upload = job.batch.direction === "upload"
    let parent = job.batch.targetParent
    if (!upload) { await mkdir(parent, { recursive: true }); parent = await realpath(parent) }
    else parent = await remote.realpath(parent)
    if (job.batch.sources) {
      if ((await remote.lstat(parent)).kind !== "directory") throw new UserFacingError("上传目标必须是目录")
      job.batch.target = parent; this.save(job); return
    }
    const name = childName(upload ? basename(job.batch.source) : posix.basename(job.batch.source))
    for (let i = 0; i < 1000; i++) {
      signal.throwIfAborted()
      const path = upload ? posix.join(parent, `${name}${i ? ` (${i})` : ""}`) : join(parent, `${name}${i ? ` (${i})` : ""}`)
      const key = `${upload ? job.batch.connectionId : "local"}:${path}`
      if (this.reserved.has(key)) continue
      this.reserved.add(key)
      try {
        if (await this.exists(path, upload, remote)) continue
        if (upload) await remote.mkdir(path); else await mkdir(path)
        job.batch.target = path; this.save(job); return
      } finally { this.reserved.delete(key) }
    }
    throw new UserFacingError("目标目录同名过多，请选择其他位置")
  }
  /** Revalidate every existing path segment: never write through a newly introduced link. */
  private async safeTarget(job: Job, path: string, remote: RemoteExecutor) {
    const upload = job.batch.direction === "upload"; const root = job.batch.target
    const rel = upload ? posix.relative(root, path) : path.slice(root.length + 1).split(sep).join("/")
    if (path !== root && (rel === ".." || rel.startsWith("../") || (upload ? !path.startsWith(root === "/" ? "/" : `${root}/`) : !path.startsWith(`${root}${sep}`)))) throw new UserFacingError("目标越出传输根目录")
    const segments = path === root ? [] : rel.split("/")
    let current = root
    for (let i = 0; i <= segments.length; i++) {
      const info = await this.exists(current, upload, remote)
      if (info?.kind === "other") throw new UserFacingError(`目标存在符号链接或特殊文件：${current}`)
      if (info) {
        const canonical = upload ? await remote.realpath(current) : await realpath(current)
        if (canonical !== current) throw new UserFacingError(`目标路径已改变：${current}`)
        if (i < segments.length && info.kind !== "directory") throw new UserFacingError(`目标不是目录：${current}`)
      } else if (i < segments.length) throw new UserFacingError(`目标父目录不存在：${current}`)
      if (i < segments.length) current = upload ? posix.join(current, segments[i]!) : join(current, segments[i]!)
    }
  }
  private finish(job: Job) {
    const c = this.summarize(job).counts
    if (job.entries.some(e => e.state === "interrupted")) { job.batch.state = "interrupted"; return }
    if (c.cancelled) { job.batch.state = "cancelled"; return }
    job.batch.state = c.failed || c.conflict ? c.completed ? "partial" : "failed" : "completed"
  }
  private async run(job: Job, signal: AbortSignal, decision?: { entryId: string; action: "overwrite" | "keepBoth" }) {
    const remote = this.connection(job); signal.throwIfAborted()
    if (!job.scanned) await this.scan(job, remote, signal)
    signal.throwIfAborted()
    if (!job.batch.target) await this.destination(job, remote, signal)
    job.batch.state = "running"; this.save(job)
    const upload = job.batch.direction === "upload"
    for (const entry of job.entries.filter(e => e.kind === "directory" && e.state === "queued")) {
      signal.throwIfAborted()
      const path = upload ? posix.join(job.batch.target, entry.path) : join(job.batch.target, entry.path)
      try {
        await this.safeTarget(job, path, remote)
        const existing = await this.exists(path, upload, remote)
        if (existing && existing.kind !== "directory") throw new UserFacingError("目录与文件类型冲突")
        if (!existing) { if (upload) await remote.mkdir(path); else await mkdir(path) }
        entry.state = "completed"
      } catch (error) { entry.state = "failed"; entry.error = message(error) }
    }
    const files = job.entries.filter(e => e.kind === "file" && e.state === "queued")
    const connectionId = job.batch.connectionId
    const slots = this.active.get(connectionId) ?? { small: 0, big: 0 }; this.active.set(connectionId, slots)
    const transfer = async (entry: TransferEntry) => {
      const source = entry.source ?? (upload ? join(job.batch.source, entry.path) : posix.join(job.batch.source, entry.path))
      let target = entry.target ?? (upload ? posix.join(job.batch.target, entry.path) : join(job.batch.target, entry.path))
      const locks: string[] = []
      const reserve = async (path: string) => {
        const key = `${upload ? connectionId : "local"}:${path}`
        while (this.reserved.has(key)) { await new Promise<void>(resolve => setTimeout(resolve, 20)); signal.throwIfAborted() }
        signal.throwIfAborted(); this.reserved.add(key); locks.push(key)
      }
      entry.state = "running"
      try {
        await reserve(target)
        signal.throwIfAborted(); this.connection(job)
        const sourceInfo = upload ? await lstat(source).then(s => ({ kind: s.isFile() ? "file" : "other", size: s.size, mtime: s.mtimeMs })) : await remote.lstat(source)
        if (sourceInfo.kind !== "file" || sourceInfo.size !== entry.size || sourceInfo.mtime !== entry.sourceMtime) throw new UserFacingError("源文件已改变，请新建传输")
        const sourceRoot = upload ? await realpath(dirname(source)) : await remote.realpath(posix.dirname(source))
        const expectedParent = upload ? dirname(source) : posix.dirname(source)
        if (sourceRoot !== expectedParent) throw new UserFacingError("源路径已变成符号链接")
        await this.safeTarget(job, target, remote)
        const existing = await this.exists(target, upload, remote)
        let overwrite = false
        if (existing) {
          if (existing.kind !== "file") throw new UserFacingError("目标与文件类型冲突")
          if (decision?.entryId !== entry.id) { entry.state = "conflict"; entry.error = "目标文件已存在，等待选择"; return }
          if (decision.action === "keepBoth") {
            let found = false
            for (let i = 1; i < 1000; i++) {
              const candidate = `${target} (${i})`
              const key = `${upload ? connectionId : "local"}:${candidate}`
              if (this.reserved.has(key)) continue
              this.reserved.add(key); locks.push(key)
              if (!(await this.exists(candidate, upload, remote))) { target = candidate; found = true; break }
              this.reserved.delete(key); locks.pop()
            }
            if (!found) throw new UserFacingError("同名文件过多")
          } else overwrite = true
        }
        entry.target = target; await this.safeTarget(job, target, remote); signal.throwIfAborted()
        const targetBefore = overwrite ? upload ? await remote.lstat(target) : await lstat(target).then(s => ({ size: s.size, mtime: s.mtimeMs })) : undefined
        const beforeCommit = async () => {
          this.connection(job); await this.safeTarget(job, target, remote)
          if (targetBefore) {
            const now = upload ? await remote.lstat(target) : await lstat(target).then(s => ({ size: s.size, mtime: s.mtimeMs }))
            if (now.size !== targetBefore.size || now.mtime !== targetBefore.mtime) throw new UserFacingError("目标文件在传输期间已改变，未覆盖")
          }
        }
        const progress = (n: number) => { entry.transferred = n }
        if (upload) await remote.upload(source, target, { signal, 进度: progress, 覆盖: overwrite, beforeCommit })
        else {
          // A no-overwrite reservation blocks races with other local jobs; target is checked again below.
          if (!overwrite && await this.exists(target, false, remote)) throw new UserFacingError("目标文件刚刚出现，请重试后处理冲突")
          await remote.download(source, target, { signal, 进度: progress, noReplace: !overwrite, beforeCommit })
        }
        entry.transferred = entry.size; entry.state = "completed"
        if (upload) this.opts.uploaded?.(connectionId, target, entry.size)
      } catch (error) {
        entry.state = signal.aborted ? this.disposed ? "interrupted" : "cancelled" : "failed"; entry.error = message(error)
        if (upload) this.opts.uploaded?.(connectionId, target, entry.size, entry.error)
      } finally { for (const key of locks) this.reserved.delete(key); this.summarize(job); this.save(job) }
    }
    let index = 0
    const worker = async () => {
      while (index < files.length) {
        signal.throwIfAborted()
        const entry = files[index++]!; const big = entry.size > BIG
        while (slots.small + slots.big >= 3 || (big && slots.big >= 1)) {
          await new Promise<void>(resolve => setTimeout(resolve, 20)); signal.throwIfAborted()
        }
        if (big) slots.big++; else slots.small++
        try { await transfer(entry) } finally { if (big) slots.big--; else slots.small-- }
      }
    }
    const outcomes = await Promise.allSettled(Array.from({ length: Math.min(3, files.length) }, worker))
    const rejected = outcomes.find(result => result.status === "rejected")
    if (rejected?.status === "rejected") throw rejected.reason
    signal.throwIfAborted(); this.finish(job)
  }
}
