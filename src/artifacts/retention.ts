import { UserFacingError } from "../errors.js"
import { createHash, randomUUID } from "node:crypto"
import { join } from "node:path"
import { rename, rm, lstat } from "node:fs/promises"
import {
  DEFAULT_LIMITS,
  RetainRequestSchema,
  type ArtifactLimits,
  type ArtifactScope,
  type RetainRequest,
  type RetainedResult,
} from "./model.js"
import { ArtifactStore } from "./store.js"
import {
  directoryBytes,
  fileIdentity,
  projectDirectory,
  safeDirectory,
} from "./blobs.js"

export class ArtifactRetention {
  readonly limits: ArtifactLimits
  private queue = new Map<string, Promise<unknown>>()
  private controllers = new Map<string, AbortController>()
  private inFlight = new Map<
    string,
    { fingerprint: string; promise: Promise<RetainedResult> }
  >()
  readonly ready: Promise<void>
  constructor(
    readonly options: {
      store: ArtifactStore
      directory: string
      limits?: Partial<ArtifactLimits>
    },
  ) {
    this.limits = { ...DEFAULT_LIMITS, ...options.limits }
    for (const value of Object.values(this.limits))
      if (!Number.isSafeInteger(value) || value < 1)
        throw new UserFacingError("无效留存预算")
    this.ready = this.recoverStorage()
    void this.ready.catch(() => {})
  }
  async locked<T>(projectId: string, action: () => Promise<T>): Promise<T> {
    const previous = this.queue.get(projectId) ?? Promise.resolve()
    const next = previous.catch(() => {}).then(action)
    this.queue.set(projectId, next)
    try {
      return await next
    } finally {
      if (this.queue.get(projectId) === next) this.queue.delete(projectId)
    }
  }
  objectPath(projectId: string, sha256: string): string {
    if (!/^[a-f0-9]{64}$/.test(sha256))
      throw new UserFacingError("无效对象哈希")
    return join(
      projectDirectory(this.options.directory, projectId),
      "objects",
      sha256,
    )
  }
  list(projectId: string) {
    return this.options.store.retainedList(projectId)
  }
  cancel(projectId: string, requestId: string): boolean {
    const controller = this.controllers.get(
      JSON.stringify([projectId, requestId]),
    )
    controller?.abort()
    return Boolean(controller)
  }
  async recoverStorage(): Promise<void> {
    for (const row of this.options.store.interruptedRequests()) {
      if (!/^[a-f0-9-]{36}$/.test(row.tempKey))
        throw new UserFacingError("留存暂存标识损坏")
      const pending = join(
        projectDirectory(this.options.directory, row.projectId),
        "pending",
      )
      await safeDirectory(pending)
      await rm(join(pending, row.tempKey), { recursive: true, force: true })
      this.options.store.clearRequestTemp(row.projectId, row.tempKey)
    }
  }
  async retain(
    scope: ArtifactScope,
    raw: RetainRequest,
    signal?: AbortSignal,
  ): Promise<RetainedResult> {
    const request = RetainRequestSchema.parse(raw)
    const callKey = JSON.stringify([scope.projectId, request.requestId]),
      callFingerprint = JSON.stringify([
        scope.workspace,
        scope.sessionId,
        request,
      ]),
      active = this.inFlight.get(callKey)
    if (active) {
      if (active.fingerprint !== callFingerprint)
        throw new UserFacingError("请求 ID 已用于另一组留存参数")
      return active.promise
    }
    const controller = new AbortController()
    this.controllers.set(callKey, controller)
    const copySignal = signal
      ? AbortSignal.any([signal, controller.signal])
      : controller.signal
    const work = this.locked(scope.projectId, async () => {
      await this.ready
      if (copySignal.aborted) throw new UserFacingError("留存已取消")
      const store = this.options.store
      const fingerprint = createHash("sha256")
        .update(
          JSON.stringify({
            ...request,
            note: request.note ?? "",
            workspace: scope.workspace,
            sessionId: scope.sessionId,
          }),
        )
        .digest("hex")
      const prior = store.request(scope.projectId, request.requestId)
      if (prior && prior.fingerprint !== fingerprint)
        throw new UserFacingError("请求 ID 已用于另一组留存参数")
      if (prior?.state === "ready" && prior.resultId) {
        const old = store.retained(scope.projectId, prior.resultId)
        if (old.state !== "ready")
          throw new UserFacingError("这份留存已删除，请发起新请求")
        return old
      }
      if (store.hasPendingExecution(scope))
        throw new UserFacingError(
          "当前工作区还有执行未结束，请等待后再留存结果",
        )
      const observations = request.members.map((m) => {
        const o = store.observation(scope, m.observationId)
        if (
          !["write", "changed", "late_capture"].includes(o.relation) ||
          !o.sha256 ||
          o.sha256 !== m.sha256 ||
          o.bytes === undefined
        )
          throw new UserFacingError("该记录没有可留存的完整内容身份")
        const execution = o.executionId
          ? store.execution(scope.projectId, o.executionId)
          : undefined
        if (
          execution &&
          (execution.status === "pending" || execution.dispatch === "unknown")
        )
          throw new UserFacingError("该执行尚未稳定结束，不能留存最终结果")
        return o
      })
      if (new Set(observations.map((o) => o.id)).size !== observations.length)
        throw new UserFacingError("重复留存成员")
      const bytes = observations.reduce((n, o) => n + o.bytes!, 0)
      if (
        observations.some((o) => o.bytes! > this.limits.fileBytes) ||
        bytes > this.limits.groupBytes
      )
        throw new UserFacingError("超过单文件或整组留存上限")
      const project = projectDirectory(this.options.directory, scope.projectId)
      await safeDirectory(join(project, "objects"))
      await safeDirectory(join(project, "pending"))
      const required = new Map(observations.map((o) => [o.sha256!, o.bytes!])),
        existing = new Set<string>()
      for (const hash of required.keys()) {
        try {
          if ((await lstat(this.objectPath(scope.projectId, hash))).isFile())
            existing.add(hash)
        } catch (e) {
          if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e
        }
      }
      const addition = [...required]
        .filter(([hash]) => !existing.has(hash))
        .reduce((n, [, b]) => n + b, 0)
      if (
        (await directoryBytes(join(project, "objects"))) + addition >
        this.limits.projectBytes
      )
        throw new UserFacingError("项目留存空间不足，请显式删除旧留存副本")
      const tempKey = randomUUID()
      store.beginRequest(
        scope.projectId,
        request.requestId,
        fingerprint,
        JSON.stringify({
          request,
          workspace: scope.workspace,
          sessionId: scope.sessionId,
        }),
        tempKey,
      )
      const pending = join(project, "pending", tempKey)
      await safeDirectory(pending)
      const started = Date.now()
      try {
        const staged = new Map<string, string>()
        for (const o of observations) {
          const remaining = this.limits.copyMs - (Date.now() - started)
          if (remaining <= 0) throw new UserFacingError("整组留存超时")
          const temp = join(pending, o.id)
          const identity = await fileIdentity(scope.workspace, o.path, {
            maxBytes: this.limits.fileBytes,
            timeoutMs: remaining,
            target: temp,
            signal: copySignal,
          })
          if (identity.sha256 !== o.sha256 || identity.bytes !== o.bytes)
            throw new UserFacingError(`当前文件已变化：${o.path}`)
          if (existing.has(identity.sha256)) {
            const saved = await fileIdentity(
              join(project, "objects"),
              identity.sha256,
              {
                maxBytes: this.limits.fileBytes,
                timeoutMs: Math.max(
                  1,
                  this.limits.copyMs - (Date.now() - started),
                ),
              },
            )
            if (saved.sha256 !== identity.sha256)
              throw new UserFacingError("已有留存对象损坏")
          } else staged.set(identity.sha256, temp)
        }
        if (copySignal.aborted) throw new UserFacingError("留存已取消")
        for (const [hash, temp] of staged)
          await rename(temp, this.objectPath(scope.projectId, hash))
        const result: RetainedResult = {
          id: randomUUID(),
          projectId: scope.projectId,
          requestId: request.requestId,
          createdAt: new Date().toISOString(),
          name: request.name || observations[0]!.path,
          note: request.note ?? "",
          state: "ready",
          members: observations.map((o) => {
            const execution = o.executionId
              ? store.execution(scope.projectId, o.executionId)
              : undefined
            return {
              id: randomUUID(),
              observation: o,
              inputs: o.executionId
                ? store.executionInputs(scope.projectId, o.executionId)
                : [],
              sha256: o.sha256!,
              bytes: o.bytes!,
              ...(execution ? { execution } : {}),
            }
          }),
        }
        store.publish(result)
        return result
      } catch (e) {
        store.failRequest(scope.projectId, request.requestId)
        throw e
      } finally {
        await rm(pending, { recursive: true, force: true })
        store.clearRequestTemp(scope.projectId, tempKey)
      }
    })
    this.inFlight.set(callKey, { fingerprint: callFingerprint, promise: work })
    try {
      return await work
    } finally {
      this.inFlight.delete(callKey)
      this.controllers.delete(callKey)
    }
  }
  async read(projectId: string, id: string, memberId: string): Promise<Buffer> {
    await this.ready
    const group = this.options.store.retained(projectId, id)
    if (group.state !== "ready") throw new UserFacingError("留存副本已删除")
    const member = group.members.find((m) => m.id === memberId)
    if (!member) throw new UserFacingError("没有此留存成员")
    await safeDirectory(
      join(projectDirectory(this.options.directory, projectId), "objects"),
      false,
    )
    // Read verified bytes from one descriptor. Never fall back to workspace files.
    const identity = await fileIdentity(
      join(projectDirectory(this.options.directory, projectId), "objects"),
      member.sha256,
      {
        maxBytes: this.limits.fileBytes,
        timeoutMs: this.limits.copyMs,
        readBytes: true,
      },
    )
    if (
      identity.sha256 !== member.sha256 ||
      identity.bytes !== member.bytes ||
      !identity.content
    )
      throw new UserFacingError("留存副本损坏或已变化")
    return Buffer.from(identity.content)
  }
  async delete(projectId: string, id: string): Promise<void> {
    return this.locked(projectId, async () => {
      await this.ready
      await safeDirectory(
        join(projectDirectory(this.options.directory, projectId), "objects"),
        false,
      )
      const group = this.options.store.retained(projectId, id)
      this.options.store.markDeleted(projectId, id)
      const keep = new Set(
        this.list(projectId).flatMap((g) => g.members.map((m) => m.sha256)),
      )
      for (const member of group.members)
        if (!keep.has(member.sha256))
          await rm(this.objectPath(projectId, member.sha256), { force: true })
    })
  }
  async clearProjectStorage(projectId: string): Promise<void> {
    const directory = projectDirectory(this.options.directory, projectId)
    await safeDirectory(directory)
    await rm(directory, { recursive: true, force: true })
  }
}
