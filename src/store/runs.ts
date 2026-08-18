/**
 * Run 与溯源的读写（Task 2.4）。
 *
 * **Run 是统一抽象**（规格 7.33）：一次 agent 回合是一个 Run，一次内核执行也是。
 * `requestType` 区分类型、`origin` 区分人与 agent。①-B 只产生 `agent_turn`，
 * ②-A 会加 `execute_r` / `execute_py`——届时**不需要改表**。
 */
import type Database from "better-sqlite3"
import type { Cost, ProvenanceLink, RunOrigin, RunStatus, RunSummary } from "../protocol/index.js"
import { 汇总用量, type 用量汇总 } from "./usage.js"

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
  /** 退出码。**结构化字段**，见协议 `RunSummarySchema.exitCode` */
  exitCode?: number
  /** 文件事实。**缺省 = 不知道**，与空数组不是一回事 */
  filesWritten?: string[]
  filesRead?: string[]
  mayIncludeUserEdits?: boolean
  artifactCount?: number
  /**
   * 这次运行是在什么环境里跑的（R5）。
   *
   * **缺省 = 不知道**，与 `filesWritten` 同一条口径——不是「没有环境」。
   * 内核会话给内核快照的 id，shell 型会话给机器快照的 id；
   * 两者**不可比**，判据在 `env/snapshot.ts` 的 `compareEnvironments`。
   */
  environmentSnapshotId?: string
  cost?: Cost
}

export interface RunFinish {
  status: Exclude<RunStatus, "running">
  finishedAt: string
  hasError: boolean
  terminalReason?: string
  exitCode?: number
  filesWritten?: string[]
  filesRead?: string[]
  mayIncludeUserEdits?: boolean
  artifactCount?: number
  cost?: Cost
  /** 这一轮实际是谁答的。**缺省 = 不知道**，不补默认值 */
  model?: string
}

interface RunRow {
  id: string
  /** R5 起有这一列。**老库里读出来是 undefined**，与 NULL 一样读作「不知道」 */
  environment_snapshot_id?: string | null
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
  exit_code: number | null
  files_written: string | null
  files_read: string | null
  may_include_user_edits: number | null
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
  /**
   * **金额不可见时，token 照记**（2026-08-16）。
   *
   * 上一版这里三档全写 null——于是 provider 报的那些真数在这一行被丢掉了。
   * 症状要到很久以后才看得见：「用量」那一屏建起来时，账本里一个 token 都没有。
   */
  return {
    cost_visible: 0,
    cost_input_tokens: cost.inputTokens ?? null,
    cost_output_tokens: cost.outputTokens ?? null,
    cost_cache_read_tokens: cost.cacheReadTokens ?? null,
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
  return {
    visible: false,
    reason: r.cost_invisible_reason ?? "未说明",
    // **null 就整个不给**：缺省是「没记到」，写成 0 会被读成「这一轮免费」
    ...(r.cost_input_tokens === null ? {} : { inputTokens: r.cost_input_tokens }),
    ...(r.cost_output_tokens === null ? {} : { outputTokens: r.cost_output_tokens }),
    ...(r.cost_cache_read_tokens === null ? {} : { cacheReadTokens: r.cost_cache_read_tokens }),
  }
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
    ...(r.exit_code === null ? {} : { exitCode: r.exit_code }),
    ...parseFiles(r),
    ...(r.artifact_count === null ? {} : { artifactCount: r.artifact_count }),
    /**
     * **这次运行是在什么环境里跑的**（R5）。
     *
     * `null` / 缺列都省略这个字段：**「不知道」不该在协议上长成一个值**。
     * 老库里的 run 就是这一种——它们产生时我们还没记环境。
     */
    ...(r.environment_snapshot_id ? { environmentSnapshotId: r.environment_snapshot_id } : {}),
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

/**
 * 把三列文件事实解回协议形状。
 *
 * **解析失败时整组留空**，而不是给一个空数组——空数组会被读成
 * 「确认没改任何文件」，那是编造（不变式 5）。
 */
function parseFiles(r: RunRow): Partial<RunSummary> {
  if (r.files_written === null) return {}
  try {
    const written = JSON.parse(r.files_written) as string[]
    /**
     * **`files_read` 为 NULL 时整个字段缺席，不写成 `[]`**（2026-08-16 修）。
     *
     * 上一版把 NULL 映射成空数组——那把「不知道读了什么」说成了
     * 「确认一个文件都没读」。此前没人撞上是因为两列总是一起写；
     * **从 git 反推的那条路（外部 agent）第一次让它们分了家**：
     * git 只知道改了什么。
     */
    const read = r.files_read === null || r.files_read === undefined
      ? undefined
      : (JSON.parse(r.files_read) as string[])
    return {
      filesWritten: written,
      ...(read === undefined ? {} : { filesRead: read }),
      ...(r.may_include_user_edits === null
        ? {}
        : { mayIncludeUserEdits: r.may_include_user_edits === 1 }),
    }
  } catch {
    return {}
  }
}

export class RunStore {
  constructor(private readonly db: Database.Database) {}

  insert(rec: RunInsert): void {
    this.db
      .prepare(`
        INSERT INTO runs (
          id, project_id, session_id, parent_run_id, origin, request_type, status,
          started_at, finished_at, terminal_reason, has_error, exit_code,
          files_written, files_read, may_include_user_edits, artifact_count,
          environment_snapshot_id,
          cost_visible, cost_input_tokens, cost_output_tokens, cost_cache_read_tokens,
          cost_total_usd, cost_invisible_reason
        ) VALUES (
          @runId, @projectId, @sessionId, @parentRunId, @origin, @requestType, @status,
          @startedAt, @finishedAt, @terminalReason, @hasError, @exitCode,
          @filesWritten, @filesRead, @mayIncludeUserEdits, @artifactCount,
          @environmentSnapshotId,
          @cost_visible, @cost_input_tokens, @cost_output_tokens, @cost_cache_read_tokens,
          @cost_total_usd, @cost_invisible_reason
        )`)
      .run({
        ...rec,
        parentRunId: rec.parentRunId ?? null,
        finishedAt: rec.finishedAt ?? null,
        terminalReason: rec.terminalReason ?? null,
        hasError: rec.hasError ? 1 : 0,
        exitCode: rec.exitCode ?? null,
        filesWritten: rec.filesWritten ? JSON.stringify(rec.filesWritten) : null,
        filesRead: rec.filesRead ? JSON.stringify(rec.filesRead) : null,
        mayIncludeUserEdits:
          rec.mayIncludeUserEdits === undefined ? null : rec.mayIncludeUserEdits ? 1 : 0,
        artifactCount: rec.artifactCount ?? null,
        environmentSnapshotId: rec.environmentSnapshotId ?? null,
        ...costColumns(rec.cost),
      })
  }

  /**
   * 把 run 推进到终态。终态必须带 finishedAt——数据库的 CHECK 也会守这一条。
   *
   * **这里写不了环境**（R5 特意没开这个口）。环境属于**准入时刻**：
   * 一次运行跑到一半，有人 `pip install` 了一个包——结束时再去探一次，
   * 记下来的就不是它实际跑在的那个环境。允许在 finish 补，
   * 等于给「回头探测当前环境」开了门，而那正是 S17 的第一条禁令。
   * 环境只在 `insert` 时写一次。
   */
  /**
   * Token 用量汇总（S21，2026-08-16）。
   *
   * 挂在这里而不是让后端自己拿 `db`：**这张表归它管**，
   * 而把裸的数据库句柄递进后端，等于给「随手写一句 SQL」开了门。
   * 口径写在 `usage.ts` 的文件头。
   */
  usage(今天: string): 用量汇总 {
    return 汇总用量(this.db, 今天)
  }

  finish(runId: string, fin: RunFinish): void {
    this.db
      .prepare(`
        UPDATE runs SET
          status = @status,
          finished_at = @finishedAt,
          terminal_reason = COALESCE(@terminalReason, terminal_reason),
          has_error = @hasError,
          exit_code = COALESCE(@exitCode, exit_code),
          files_written = COALESCE(@filesWritten, files_written),
          files_read = COALESCE(@filesRead, files_read),
          may_include_user_edits = COALESCE(@mayIncludeUserEdits, may_include_user_edits),
          artifact_count = COALESCE(@artifactCount, artifact_count),
          cost_visible = COALESCE(@cost_visible, cost_visible),
          cost_input_tokens = COALESCE(@cost_input_tokens, cost_input_tokens),
          cost_output_tokens = COALESCE(@cost_output_tokens, cost_output_tokens),
          cost_cache_read_tokens = COALESCE(@cost_cache_read_tokens, cost_cache_read_tokens),
          cost_total_usd = COALESCE(@cost_total_usd, cost_total_usd),
          cost_invisible_reason = COALESCE(@cost_invisible_reason, cost_invisible_reason),
          model = COALESCE(@model, model)
        WHERE id = @runId`)
      .run({
        runId,
        status: fin.status,
        finishedAt: fin.finishedAt,
        terminalReason: fin.terminalReason ?? null,
        hasError: fin.hasError ? 1 : 0,
        exitCode: fin.exitCode ?? null,
        filesWritten: fin.filesWritten ? JSON.stringify(fin.filesWritten) : null,
        filesRead: fin.filesRead ? JSON.stringify(fin.filesRead) : null,
        mayIncludeUserEdits:
          fin.mayIncludeUserEdits === undefined ? null : fin.mayIncludeUserEdits ? 1 : 0,
        artifactCount: fin.artifactCount ?? null,
        model: fin.model ?? null,
        ...costColumns(fin.cost),
      })
  }

  /**
   * 只补文件事实，不动状态。
   *
   * 单独一个方法而不是塞进 `finish`：文件事实到得比终态早
   * （包装器算完就发），而 `finish` 要求 run 已经结束——合并会逼出一个
   * 「先假装结束再改回去」的丑陋写法。
   */
  patchFiles(
    runId: string,
    files: {
      filesWritten: string[]
      /**
       * **缺省 = 不知道读了什么**，那一列原样不动（不是写成空数组）。
       *
       * 2026-08-16 加的这条缺省，是给「从 git 反推」用的：
       * **git 只知道「改了什么」，读了什么它一无所知**。
       * 写成 `[]` 等于宣称「确认一个文件都没读」——而那是编造（不变式 5）。
       */
      filesRead?: string[]
      mayIncludeUserEdits: boolean
    },
  ): void {
    this.db
      .prepare(`
        UPDATE runs SET
          files_written = @filesWritten,
          files_read = COALESCE(@filesRead, files_read),
          may_include_user_edits = @mayIncludeUserEdits
        WHERE id = @runId`)
      .run({
        runId,
        filesWritten: JSON.stringify(files.filesWritten),
        filesRead: files.filesRead === undefined ? null : JSON.stringify(files.filesRead),
        mayIncludeUserEdits: files.mayIncludeUserEdits ? 1 : 0,
      })
  }

  get(runId: string): RunSummary | undefined {
    const row = this.db.prepare(`SELECT * FROM runs WHERE id = ?`).get(runId) as RunRow | undefined
    return row ? toRun(row) : undefined
  }

  /**
   * 这个项目的账本里，**记得写过哪些文件**（2026-08-18，审阅那一屏用）。
   *
   * 它回答的是 git 答不出的那一半：`out/`、`data/raw/` 这类目录写进
   * `.gitignore` 是科研仓库的常态，于是一次分析生成 40 张图，
   * `git diff HEAD` 说「什么都没变」——**而账本记得**。
   *
   * `files_written` 为 NULL 的那些行**跳过**：那是「不知道」，不是「没写」。
   */
  writtenFilesOf(projectId: string, limit = 500): string[] {
    const rows = this.db
      .prepare(
        `SELECT files_written FROM runs
          WHERE project_id = ? AND files_written IS NOT NULL
          ORDER BY started_at DESC LIMIT ?`,
      )
      .all(projectId, limit) as { files_written: string }[]
    const 出 = new Set<string>()
    for (const r of rows) {
      try {
        for (const f of JSON.parse(r.files_written) as string[]) 出.add(f)
      } catch {
        // 存坏了就跳过这一行：**少算比编一个好**
      }
    }
    return [...出]
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

  /** 一个项目下有多少条账本记录。移除项目前要**把数字说给用户听** */
  countByProject(projectId: string): number {
    const r = this.db
      .prepare(`SELECT COUNT(*) AS n FROM runs WHERE project_id = ?`)
      .get(projectId) as { n: number }
    return r.n
  }

  /**
   * 删掉一个项目名下的全部账本记录。
   *
   * **只在移除项目时用。** 删单个会话不走这里——账本是按项目组织的，
   * 项目没了它就没有归属；而一个会话没了，它做过的事仍然发生过。
   */
  deleteByProject(projectId: string): number {
    return this.db.prepare(`DELETE FROM runs WHERE project_id = ?`).run(projectId).changes
  }
}
