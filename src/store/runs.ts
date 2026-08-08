/**
 * Run 与溯源的读写（Task 2.4）。
 *
 * **Run 是统一抽象**（规格 7.33）：一次 agent 回合是一个 Run，一次内核执行也是。
 * `requestType` 区分类型、`origin` 区分人与 agent。①-B 只产生 `agent_turn`，
 * ②-A 会加 `execute_r` / `execute_py`——届时**不需要改表**。
 */
import type Database from "better-sqlite3"
import type { Cost, ProvenanceLink, RunOrigin, RunStatus, RunSummary } from "../protocol/index.js"

export interface RunInsert {
  runId: string
  projectId: string
  sessionId: string
  parentRunId?: string
  origin: RunOrigin
  requestType: string
  status: RunStatus
  startedAt: string
  finishedAt?: string
  terminalReason?: string
  hasError: boolean
  artifactCount?: number
  cost?: Cost
}

export interface RunFinish {
  status: Exclude<RunStatus, "running">
  finishedAt: string
  hasError: boolean
  terminalReason?: string
  artifactCount?: number
  cost?: Cost
}

interface RunRow {
  id: string
  project_id: string
  session_id: string
  parent_run_id: string | null
  origin: RunOrigin
  request_type: string
  status: RunStatus
  started_at: string
  finished_at: string | null
  terminal_reason: string | null
  has_error: number
  artifact_count: number | null
  cost_visible: number | null
  cost_input_tokens: number | null
  cost_output_tokens: number | null
  cost_cache_read_tokens: number | null
  cost_total_usd: number | null
  cost_invisible_reason: string | null
}

/** 把成本拆成列。cost 未提供时全为 NULL——那表示「尚未记录」，与「不可见」不同。 */
function costColumns(cost: Cost | undefined) {
  if (!cost) {
    return {
      cost_visible: null,
      cost_input_tokens: null,
      cost_output_tokens: null,
      cost_cache_read_tokens: null,
      cost_total_usd: null,
      cost_invisible_reason: null,
    }
  }
  if (cost.visible) {
    return {
      cost_visible: 1,
      cost_input_tokens: cost.inputTokens,
      cost_output_tokens: cost.outputTokens,
      cost_cache_read_tokens: cost.cacheReadTokens ?? null,
      cost_total_usd: cost.totalUSD,
      cost_invisible_reason: null,
    }
  }
  return {
    cost_visible: 0,
    cost_input_tokens: null,
    cost_output_tokens: null,
    cost_cache_read_tokens: null,
    cost_total_usd: null,
    cost_invisible_reason: cost.reason,
  }
}

function toCost(r: RunRow): Cost | undefined {
  if (r.cost_visible === null) return undefined
  if (r.cost_visible === 1) {
    return {
      visible: true,
      inputTokens: r.cost_input_tokens ?? 0,
      outputTokens: r.cost_output_tokens ?? 0,
      ...(r.cost_cache_read_tokens === null ? {} : { cacheReadTokens: r.cost_cache_read_tokens }),
      totalUSD: r.cost_total_usd ?? 0,
    }
  }
  return { visible: false, reason: r.cost_invisible_reason ?? "未说明" }
}

/** 未设字段整个省略而非留 null（沿用 ①-A 的纪律）——`"cost" in run` 才能反映真实情况。 */
function toRun(r: RunRow): RunSummary {
  const cost = toCost(r)
  return {
    runId: r.id,
    projectId: r.project_id,
    sessionId: r.session_id,
    origin: r.origin,
    requestType: r.request_type,
    status: r.status,
    startedAt: r.started_at,
    hasError: r.has_error === 1,
    ...(r.parent_run_id === null ? {} : { parentRunId: r.parent_run_id }),
    ...(r.finished_at === null ? {} : { finishedAt: r.finished_at }),
    ...(r.terminal_reason === null ? {} : { terminalReason: r.terminal_reason }),
    ...(r.artifact_count === null ? {} : { artifactCount: r.artifact_count }),
    ...(cost === undefined ? {} : { cost }),
  }
}

interface ProvRow {
  resource_id: string
  producing_run_id: string | null
  environment_snapshot_id: string | null
  source_path: string | null
  provenance_complete: number
  incomplete_reason: string | null
}

function toProvenance(r: ProvRow): ProvenanceLink {
  return {
    resourceId: r.resource_id,
    provenanceComplete: r.provenance_complete === 1,
    ...(r.producing_run_id === null ? {} : { producingRunId: r.producing_run_id }),
    ...(r.environment_snapshot_id === null ? {} : { environmentSnapshotId: r.environment_snapshot_id }),
    ...(r.source_path === null ? {} : { sourcePath: r.source_path }),
    ...(r.incomplete_reason === null ? {} : { incompleteReason: r.incomplete_reason }),
  }
}

export class RunStore {
  constructor(private readonly db: Database.Database) {}

  insert(rec: RunInsert): void {
    this.db
      .prepare(`
        INSERT INTO runs (
          id, project_id, session_id, parent_run_id, origin, request_type, status,
          started_at, finished_at, terminal_reason, has_error, artifact_count,
          cost_visible, cost_input_tokens, cost_output_tokens, cost_cache_read_tokens,
          cost_total_usd, cost_invisible_reason
        ) VALUES (
          @runId, @projectId, @sessionId, @parentRunId, @origin, @requestType, @status,
          @startedAt, @finishedAt, @terminalReason, @hasError, @artifactCount,
          @cost_visible, @cost_input_tokens, @cost_output_tokens, @cost_cache_read_tokens,
          @cost_total_usd, @cost_invisible_reason
        )`)
      .run({
        ...rec,
        parentRunId: rec.parentRunId ?? null,
        finishedAt: rec.finishedAt ?? null,
        terminalReason: rec.terminalReason ?? null,
        hasError: rec.hasError ? 1 : 0,
        artifactCount: rec.artifactCount ?? null,
        ...costColumns(rec.cost),
      })
  }

  /** 把 run 推进到终态。终态必须带 finishedAt——数据库的 CHECK 也会守这一条。 */
  finish(runId: string, fin: RunFinish): void {
    this.db
      .prepare(`
        UPDATE runs SET
          status = @status,
          finished_at = @finishedAt,
          terminal_reason = COALESCE(@terminalReason, terminal_reason),
          has_error = @hasError,
          artifact_count = COALESCE(@artifactCount, artifact_count),
          cost_visible = COALESCE(@cost_visible, cost_visible),
          cost_input_tokens = COALESCE(@cost_input_tokens, cost_input_tokens),
          cost_output_tokens = COALESCE(@cost_output_tokens, cost_output_tokens),
          cost_cache_read_tokens = COALESCE(@cost_cache_read_tokens, cost_cache_read_tokens),
          cost_total_usd = COALESCE(@cost_total_usd, cost_total_usd),
          cost_invisible_reason = COALESCE(@cost_invisible_reason, cost_invisible_reason)
        WHERE id = @runId`)
      .run({
        runId,
        status: fin.status,
        finishedAt: fin.finishedAt,
        terminalReason: fin.terminalReason ?? null,
        hasError: fin.hasError ? 1 : 0,
        artifactCount: fin.artifactCount ?? null,
        ...costColumns(fin.cost),
      })
  }

  get(runId: string): RunSummary | undefined {
    const row = this.db.prepare(`SELECT * FROM runs WHERE id = ?`).get(runId) as RunRow | undefined
    return row ? toRun(row) : undefined
  }

  /** 最近的在前——项目面板的历史栏要的就是这个顺序。 */
  listByProject(
    projectId: string,
    opts: { sessionId?: string; limit?: number } = {},
  ): RunSummary[] {
    const where = opts.sessionId ? `project_id = ? AND session_id = ?` : `project_id = ?`
    const args: unknown[] = opts.sessionId ? [projectId, opts.sessionId] : [projectId]
    const limit = opts.limit ?? 200
    const rows = this.db
      .prepare(`SELECT * FROM runs WHERE ${where} ORDER BY started_at DESC, id DESC LIMIT ?`)
      .all(...args, limit) as RunRow[]
    return rows.map(toRun)
  }

  putProvenance(link: ProvenanceLink): void {
    this.db
      .prepare(`
        INSERT OR REPLACE INTO provenance (
          resource_id, producing_run_id, environment_snapshot_id, source_path,
          provenance_complete, incomplete_reason
        ) VALUES (@resourceId, @producingRunId, @environmentSnapshotId, @sourcePath,
                  @provenanceComplete, @incompleteReason)`)
      .run({
        resourceId: link.resourceId,
        producingRunId: link.producingRunId ?? null,
        environmentSnapshotId: link.environmentSnapshotId ?? null,
        sourcePath: link.sourcePath ?? null,
        provenanceComplete: link.provenanceComplete ? 1 : 0,
        incompleteReason: link.incompleteReason ?? null,
      })
  }

  getProvenance(resourceId: string): ProvenanceLink | undefined {
    const row = this.db.prepare(`SELECT * FROM provenance WHERE resource_id = ?`).get(resourceId) as
      | ProvRow
      | undefined
    return row ? toProvenance(row) : undefined
  }
}
