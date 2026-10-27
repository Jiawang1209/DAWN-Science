import { UserFacingError } from "../errors.js"
import { fileIdentity } from "./blobs.js"
import {
  DEFAULT_LIMITS,
  type ArtifactScope,
  type RetainRequest,
} from "./model.js"
import type { ArtifactStore } from "./store.js"
import type { ArtifactRetention } from "./retention.js"
import { 分类预览 } from "../files/access.js"

export function createArtifactOperations(options: {
  store?: ArtifactStore | undefined
  retention?: ArtifactRetention | undefined
  session: (id: string) =>
    | {
        projectId?: string | undefined
        workspace: string
        connectionId?: string | undefined
      }
    | undefined
  readOnly?: boolean | undefined
  sourceSupported?: (sessionId: string) => boolean
  changed?: (projectId: string) => void
}) {
  const lateRequests = new Map<
    string,
    {
      fingerprint: string
      controller: AbortController
      promise: Promise<import("./model.js").RetainedResult>
    }
  >()
  const scope = (sessionId: string): ArtifactScope => {
    const s = options.session(sessionId)
    if (!s?.projectId) throw new UserFacingError("没有此会话的项目")
    return { projectId: s.projectId, workspace: s.workspace, sessionId }
  }
  const support = (sessionId: string) =>
    Boolean(
      options.store &&
        options.retention &&
        !options.session(sessionId)?.connectionId &&
        (options.sourceSupported?.(sessionId) ?? true),
    )
  const write = (sessionId: string) => {
    if (options.readOnly)
      throw new UserFacingError("当前宿主只读，不能保存或删除留存")
    if (!support(sessionId))
      throw new UserFacingError("此执行位置尚不支持本地来源留存")
    return scope(sessionId)
  }
  const store = () => {
    if (!options.store) throw new UserFacingError("来源记录服务未接入")
    return options.store
  }
  const retention = () => {
    if (!options.retention) throw new UserFacingError("结果留存服务未接入")
    return options.retention
  }
  const getObservation = (sessionId: string, id: string) =>
    store().observation(scope(sessionId), id)
  return {
    getArtifactHistory: async ({
      sessionId,
      path,
      offset,
    }: {
      sessionId: string
      path: string
      offset?: number | undefined
    }) => {
      scope(sessionId)
      return support(sessionId)
        ? {
            supported: true,
            observations: store().history(scope(sessionId), path, 50, offset),
          }
        : {
            supported: false,
            reason: "此执行位置尚未接入自动来源记录",
            observations: [],
          }
    },
    getArtifactSource: async ({
      sessionId,
      observationId,
    }: {
      sessionId: string
      observationId: string
    }) => {
      if (!support(sessionId))
        throw new UserFacingError("此执行位置尚未接入自动来源记录")
      const o = getObservation(sessionId, observationId),
        e = o.executionId
          ? store().execution(o.projectId, o.executionId)
          : undefined
      return {
        observation: o,
        inputs: o.executionId
          ? store().executionInputs(o.projectId, o.executionId)
          : [],
        ...(e ? { execution: e } : {}),
      }
    },
    checkArtifactCurrent: async ({
      sessionId,
      observationId,
    }: {
      sessionId: string
      observationId: string
    }) => {
      const s = scope(sessionId),
        o = getObservation(sessionId, observationId)
      if (!support(sessionId) || !o.sha256)
        return {
          state: "unchecked" as const,
          note: "未记录完整哈希或此执行位置不可检查",
        }
      try {
        const now = await fileIdentity(s.workspace, o.path, {
          maxBytes: DEFAULT_LIMITS.hashBytes,
          timeoutMs: DEFAULT_LIMITS.hashMs,
        })
        return {
          state:
            now.sha256 === o.sha256
              ? ("matched" as const)
              : ("changed" as const),
          note:
            now.sha256 === o.sha256
              ? "当前字节与这份记录一致"
              : "工作区文件已变化；历史记录没有改写",
        }
      } catch (e) {
        return {
          state:
            (e as NodeJS.ErrnoException).code === "ENOENT"
              ? ("missing" as const)
              : ("failed" as const),
          note: String(e instanceof Error ? e.message : e),
        }
      }
    },
    retainArtifactResults: async ({
      sessionId,
      ...request
    }: RetainRequest & { sessionId: string }) => {
      const s = write(sessionId),
        result = await retention().retain(s, request)
      options.changed?.(s.projectId)
      return result
    },
    captureAndRetainCurrent: async ({
      sessionId,
      path,
      requestId,
      name,
      note,
    }: {
      sessionId: string
      path: string
      requestId: string
      name: string
      note?: string | undefined
    }) => {
      const s = write(sessionId),
        key = JSON.stringify([s.projectId, requestId]),
        fingerprint = JSON.stringify([s, path, name, note ?? ""]),
        active = lateRequests.get(key)
      if (active) {
        if (active.fingerprint !== fingerprint)
          throw new UserFacingError("请求 ID 已用于另一组留存参数")
        return active.promise
      }
      const controller = new AbortController()
      const promise = (async () => {
        const prior = store().request(s.projectId, requestId)
        // Retries must use the original observation, even after the live file changes.
        if (prior) {
          const original = JSON.parse(prior.payload) as {
            request: RetainRequest
            workspace: string
            sessionId: string
          }
          const member = original.request?.members[0]
          const observed = member
            ? store().observation(s, member.observationId)
            : undefined
          if (
            original.workspace !== s.workspace ||
            original.sessionId !== sessionId ||
            original.request.name !== name ||
            (original.request.note ?? "") !== (note ?? "") ||
            original.request.members.length !== 1 ||
            observed?.path !== path ||
            observed.relation !== "late_capture"
          )
            throw new UserFacingError("请求 ID 已用于另一组留存参数")
          return retention().retain(s, original.request, controller.signal)
        }
        const identity = await fileIdentity(s.workspace, path, {
          maxBytes: retention().limits.fileBytes,
          timeoutMs: retention().limits.copyMs,
          signal: controller.signal,
        })
        const o = store().observe(s, {
          path,
          ...identity,
          relation: "late_capture",
          attribution: "unknown",
          gaps: ["后补留存：只能证明此刻内容，原始生成来源未经确认"],
        })
        const result = await retention().retain(
          s,
          {
            requestId,
            name,
            note: note ?? "",
            members: [{ observationId: o.id, sha256: identity.sha256 }],
          },
          controller.signal,
        )
        options.changed?.(s.projectId)
        return result
      })()
      lateRequests.set(key, { fingerprint, controller, promise })
      try {
        return await promise
      } finally {
        lateRequests.delete(key)
      }
    },
    listRetainedResults: async ({
      sessionId,
      offset = 0,
    }: {
      sessionId: string
      offset?: number | undefined
    }) => {
      const s = scope(sessionId)
      if (!options.retention)
        return { supported: false, reason: "结果留存服务未接入", results: [] }
      const { fileBytes, groupBytes, projectBytes } = retention().limits
      return {
        supported: true,
        results: retention()
          .list(s.projectId)
          .slice(offset, offset + 50),
        limits: { fileBytes, groupBytes, projectBytes },
      }
    },
    readRetainedArtifact: async ({
      sessionId,
      retainedId,
      memberId,
    }: {
      sessionId: string
      retainedId: string
      memberId: string
    }) => {
      const s = scope(sessionId),
        group = store().retained(s.projectId, retainedId),
        member = group.members.find((m) => m.id === memberId)
      if (!member) throw new UserFacingError("没有这个留存成员")
      const bytes = await retention().read(s.projectId, retainedId, memberId)
      return {
        path: member.observation.path,
        sha256: member.sha256,
        content: 分类预览(member.observation.path, bytes.length, (max) =>
          max === undefined ? bytes : bytes.subarray(0, max),
        ),
      }
    },
    deleteRetainedResult: async ({
      sessionId,
      retainedId,
      confirmed,
    }: {
      sessionId: string
      retainedId: string
      confirmed: true
    }) => {
      if (confirmed !== true)
        throw new UserFacingError("删除留存副本需要明确确认")
      const s = write(sessionId)
      await retention().delete(s.projectId, retainedId)
      options.changed?.(s.projectId)
      return { deleted: true as const }
    },
    cancelArtifactRetention: async ({
      sessionId,
      requestId,
    }: {
      sessionId: string
      requestId: string
    }) => {
      const s = write(sessionId),
        late = lateRequests.get(JSON.stringify([s.projectId, requestId]))
      late?.controller.abort()
      return {
        cancelled: retention().cancel(s.projectId, requestId) || Boolean(late),
      }
    },
  }
}
