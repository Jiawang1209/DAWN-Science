import { createHash, randomUUID } from "node:crypto"
import { resolve } from "node:path"
import {
  DEFAULT_LIMITS,
  type ArtifactScope,
  type ArtifactExecution,
  type ArtifactLimits,
} from "./model.js"
import { fileIdentity } from "./blobs.js"
import { ArtifactStore } from "./store.js"
import { fsSnapshot, fsDiff } from "../project/fs-facts.js"
import { 工作区内相对路径 } from "../files/paths.js"

export interface CaptureRequest {
  tool: string
  code: string
  inputPaths?: string[] | undefined
  toolCallId?: string | undefined
  runId?: string | undefined
  language?: string | undefined
  kernelId?: string | undefined
  sequence?: number | undefined
  snapshotOutputs?: boolean
  reading?: boolean
  direct?: boolean
}
export interface CaptureHandle {
  dispatched(): void
  finish(result: {
    paths?: string[] | undefined
    failed: boolean
    ambiguous?: boolean | undefined
    logText?: string | undefined
  }): Promise<void>
}
export interface CapturedFileFacts {
  toolCallId?: string | undefined
  runId?: string | undefined
  filesWritten: string[]
  filesCreated: string[]
  mayIncludeUserEdits: boolean
}
export class ArtifactCapture {
  readonly limits: ArtifactLimits
  private active = new Map<string, Set<{ ambiguous: boolean }>>()
  constructor(
    readonly options: {
      store: ArtifactStore
      scope: (sessionId: string) => ArtifactScope | undefined
      environment?: (sessionId: string, request: CaptureRequest) => unknown
      changed?: (
        sessionId: string,
        facts?: CapturedFileFacts,
        execution?: ArtifactExecution,
      ) => void
      limits?: Partial<ArtifactLimits>
    },
  ) {
    this.limits = { ...DEFAULT_LIMITS, ...options.limits }
  }
  async begin(
    sessionId: string,
    request: CaptureRequest,
  ): Promise<CaptureHandle | undefined> {
    const scope = this.options.scope(sessionId)
    if (!scope) return undefined
    const key = `${scope.projectId}:${resolve(scope.workspace)}`,
      active = this.active.get(key) ?? new Set<{ ambiguous: boolean }>()
    const marker = { ambiguous: active.size > 0 }
    for (const item of active) item.ambiguous = true
    active.add(marker)
    this.active.set(key, active)
    const execution: ArtifactExecution = {
      ...scope,
      workspace: resolve(scope.workspace),
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      tool: request.tool,
      codeSha256: createHash("sha256").update(request.code).digest("hex"),
      status: "pending",
      dispatch: "not_dispatched",
      gaps: [],
      ...(Buffer.byteLength(request.code) <= this.limits.codeBytes
        ? { code: request.code }
        : {}),
      ...(request.toolCallId ? { toolCallId: request.toolCallId } : {}),
      ...(request.runId ? { runId: request.runId } : {}),
      ...(request.language ? { language: request.language } : {}),
      ...(request.kernelId ? { kernelId: request.kernelId } : {}),
      ...(request.sequence !== undefined ? { sequence: request.sequence } : {}),
    }
    if (!execution.code)
      execution.gaps.push("代码原文超过保存上限，仅保留完整哈希")
    if (request.tool === "run_code" || request.tool === "notebook")
      execution.gaps.push(
        "可能依赖已有内核变量；变量状态和程序内部动态输入未捕获",
      )
    else if (request.direct)
      execution.gaps.push(
        "此处记录实际文件写入参数，不能据此确认已执行分析计算",
      )
    const environment = this.options.environment?.(sessionId, request)
    if (environment !== undefined) execution.environment = environment
    else execution.gaps.push("未记录环境快照")
    let hashSpentMs = 0,
      capturedBytes = 0,
      capturedFiles = 0
    const identity = async (path: string) => {
      const remaining = this.limits.hashMs - hashSpentMs
      if (
        remaining <= 0 ||
        capturedFiles++ >= this.limits.captureFiles ||
        capturedBytes >= this.limits.captureBytes
      )
        throw new Error("本次来源采集预算已用完")
      const started = Date.now()
      try {
        const result = await fileIdentity(scope.workspace, path, {
          maxBytes: Math.min(
            this.limits.hashBytes,
            this.limits.captureBytes - capturedBytes,
          ),
          timeoutMs: remaining,
        })
        capturedBytes += result.bytes
        return result
      } finally {
        hashSpentMs += Math.max(0, Date.now() - started)
      }
    }
    const inputs = new Map<string, { sha256: string; bytes: number }>()
    let before: ReturnType<typeof fsSnapshot>
    try {
      this.options.store.putExecution(execution)
      if (request.snapshotOutputs) {
        before = fsSnapshot(scope.workspace)
        if (!before) execution.gaps.push("文件探针超过上限，输出范围未知")
      }
      for (const raw of [...new Set(request.inputPaths ?? [])].slice(0, 50)) {
        const path = 工作区内相对路径(scope.workspace, raw)
        if (!path) {
          execution.gaps.push("输入路径不在当前工作区")
          continue
        }
        try {
          const value = await identity(path)
          inputs.set(path, value)
          this.options.store.observe(scope, {
            path,
            ...value,
            executionId: execution.id,
            relation: "declared_input",
            attribution: "declared",
            gaps: [
              request.reading
                ? "读取前身份核对，读取是否成功尚未确认"
                : "声明输入已核对身份，未证明程序实际消费",
            ],
          })
        } catch (e) {
          const reason = String(e instanceof Error ? e.message : e)
          execution.gaps.push(`${path}：${reason}`)
          try {
            this.options.store.observe(scope, {
              path,
              ...partialMetadata(e),
              executionId: execution.id,
              relation: "declared_input",
              attribution: "declared",
              gaps: [reason, "仅记录声明与可得元信息，没有完整内容身份"],
            })
          } catch {
            /* Unsafe path remains an explicit execution gap. */
          }
        }
      }
    } catch (e) {
      active.delete(marker)
      if (!active.size) this.active.delete(key)
      throw e
    }
    let finished = false
    const dispatched = () => {
      execution.dispatch = "dispatched"
      execution.dispatchedAt = new Date().toISOString()
    }
    return {
      dispatched,
      finish: async (result) => {
        if (finished) return
        finished = true
        let outputFacts: CapturedFileFacts | undefined
        try {
          let paths = result.paths ?? []
          if (
            request.snapshotOutputs &&
            before &&
            execution.dispatch !== "not_dispatched"
          ) {
            const after = fsSnapshot(scope.workspace)
            if (after) {
              const diff = fsDiff(before, after)
              paths = [...paths, ...diff.written]
              outputFacts = {
                toolCallId: request.toolCallId,
                runId: request.runId,
                filesWritten: diff.written,
                filesCreated: diff.created,
                mayIncludeUserEdits: true,
              }
            } else execution.gaps.push("执行后文件探针不完整")
          }
          if (request.reading && result.failed)
            execution.gaps.push("读取工具失败；前置身份观察不能证明读取成功")
          for (const [path, initial] of inputs) {
            try {
              const now = await identity(path)
              if (now.sha256 !== initial.sha256)
                execution.gaps.push(`输入在执行期间发生变化：${path}`)
              else if (request.reading && !result.failed)
                this.options.store.observe(scope, {
                  path,
                  ...now,
                  executionId: execution.id,
                  relation: "read",
                  attribution: "observed",
                  gaps: [
                    "读取期间身份核对，具体读取范围以工具参数为准；不证明后续分析实际消费",
                  ],
                })
            } catch (e) {
              execution.gaps.push(
                `输入执行后未核实：${path}（${String(e instanceof Error ? e.message : e)}）`,
              )
            }
          }
          const unique = [...new Set(paths)]
          if (unique.length > this.limits.captureFiles)
            execution.gaps.push(
              `另有 ${unique.length - this.limits.captureFiles} 个输出未采集`,
            )
          for (const raw of unique.slice(0, this.limits.captureFiles)) {
            const path = 工作区内相对路径(scope.workspace, raw)
            if (!path) continue
            const ambiguous = marker.ambiguous || Boolean(result.ambiguous)
            const input = {
              path,
              executionId: execution.id,
              relation: request.direct
                ? ("write" as const)
                : ("changed" as const),
              attribution: ambiguous
                ? ("ambiguous" as const)
                : request.direct
                  ? ("direct" as const)
                  : ("observed" as const),
              gaps: ambiguous
                ? ["运行期间观察到变化，可能混入其他调用或用户修改"]
                : [],
            }
            try {
              this.options.store.observe(scope, {
                ...input,
                ...(await identity(path)),
              })
            } catch (e) {
              const reason = String(e instanceof Error ? e.message : e)
              execution.gaps.push(`${path}：${reason}`)
              try {
                this.options.store.observe(scope, {
                  ...input,
                  ...partialMetadata(e),
                  gaps: [...input.gaps, reason],
                })
              } catch {
                /* Invalid/unobservable paths are a gap, never a synthesized file. */
              }
            }
          }
        } catch (e) {
          execution.gaps.push(
            `来源采集失败：${String(e instanceof Error ? e.message : e)}`,
          )
        } finally {
          active.delete(marker)
          if (!active.size) this.active.delete(key)
          execution.finishedAt = new Date().toISOString()
          if (result.logText !== undefined && !request.reading) {
            const bytes = Buffer.from(result.logText),
              cap = 16 * 1024
            execution.log = {
              head: bytes.subarray(0, cap).toString("utf8"),
              tail:
                bytes.length > cap
                  ? bytes
                      .subarray(Math.max(cap, bytes.length - cap))
                      .toString("utf8")
                  : "",
              bytes: bytes.length,
              omittedBytes: Math.max(0, bytes.length - 2 * cap),
            }
          }
          if (execution.dispatch === "dispatched")
            execution.dispatch = result.failed ? "failed" : "completed"
          execution.status = result.failed
            ? "failed"
            : execution.gaps.length
              ? "partial"
              : "captured"
          if (!execution.runId && request.toolCallId) {
            const row = this.options.store.db
              .prepare(
                "SELECT id FROM runs WHERE project_id=? AND session_id=? AND tool_call_id=? ORDER BY rowid DESC LIMIT 1",
              )
              .get(scope.projectId, scope.sessionId, request.toolCallId) as
              | { id: string }
              | undefined
            if (row) execution.runId = row.id
          }
          try {
            this.options.store.putExecution(execution)
            this.options.changed?.(sessionId, outputFacts, execution)
          } catch (e) {
            console.error(
              "[产物来源] 保存执行证据失败",
              e instanceof Error ? e.message : String(e),
            )
          }
        }
      },
    }
  }
}
function partialMetadata(error: unknown): { bytes?: number } {
  const bytes =
    typeof error === "object" && error !== null
      ? (error as { fileBytes?: unknown }).fileBytes
      : undefined
  return typeof bytes === "number" && Number.isSafeInteger(bytes) && bytes >= 0
    ? { bytes }
    : {}
}
