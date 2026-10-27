import { UserFacingError } from "../errors.js"
import type Database from "better-sqlite3"
import { createHash, randomUUID } from "node:crypto"
import { resolve } from "node:path"
import {
  ArtifactPath,
  ExecutionSchema,
  ObservationSchema,
  RetainedResultSchema,
  type ArtifactScope,
  type ArtifactObservation,
  type ObservationInput,
  type ArtifactExecution,
  type RetainedResult,
} from "./model.js"

type Payload = { payload: string }
export class ArtifactStore {
  constructor(readonly db: Database.Database) {}
  observe(scope: ArtifactScope, input: ObservationInput): ArtifactObservation {
    const path = ArtifactPath.parse(input.path),
      workspace = resolve(scope.workspace)
    return this.db.transaction(() => {
      const key = createHash("sha256")
        .update(JSON.stringify([scope.projectId, workspace, path]))
        .digest("hex")
      this.db
        .prepare(
          "INSERT OR IGNORE INTO artifact_files(id,project_id,workspace,path) VALUES (?,?,?,?)",
        )
        .run(key, scope.projectId, workspace, path)
      let versionId: string | undefined
      if (input.sha256) {
        if (!/^[a-f0-9]{64}$/.test(input.sha256) || input.bytes === undefined)
          throw new UserFacingError("内容版本需要完整哈希与字节数")
        versionId = `${key}:${input.sha256}`
        this.db
          .prepare(
            "INSERT OR IGNORE INTO artifact_versions(id,file_id,sha256,bytes) VALUES (?,?,?,?)",
          )
          .run(versionId, key, input.sha256, input.bytes)
        const old = this.db
          .prepare("SELECT bytes FROM artifact_versions WHERE id=?")
          .get(versionId) as { bytes: number }
        if (old.bytes !== input.bytes)
          throw new UserFacingError("内容版本大小不一致")
      }
      const observation = ObservationSchema.parse({
        ...scope,
        workspace,
        ...input,
        id: randomUUID(),
        fileId: key,
        createdAt: new Date().toISOString(),
        ...(versionId ? { versionId } : {}),
      })
      this.db
        .prepare(
          "INSERT INTO artifact_observations(id,file_id,version_id,project_id,workspace,path,payload) VALUES (?,?,?,?,?,?,?)",
        )
        .run(
          observation.id,
          key,
          versionId ?? null,
          scope.projectId,
          workspace,
          path,
          JSON.stringify(observation),
        )
      return observation
    })()
  }
  observation(
    scope: Pick<ArtifactScope, "projectId" | "workspace">,
    id: string,
  ): ArtifactObservation {
    const row = this.db
      .prepare(
        "SELECT payload FROM artifact_observations WHERE id=? AND project_id=? AND workspace=?",
      )
      .get(id, scope.projectId, resolve(scope.workspace)) as Payload | undefined
    if (!row) throw new UserFacingError("找不到此作用域的来源记录")
    return ObservationSchema.parse(JSON.parse(row.payload))
  }
  history(
    scope: Pick<ArtifactScope, "projectId" | "workspace">,
    path: string,
    limit = 50,
    offset = 0,
  ): ArtifactObservation[] {
    ArtifactPath.parse(path)
    return (
      this.db
        .prepare(
          "SELECT payload FROM artifact_observations WHERE project_id=? AND workspace=? AND path=? ORDER BY rowid DESC LIMIT ? OFFSET ?",
        )
        .all(
          scope.projectId,
          resolve(scope.workspace),
          path,
          Math.min(200, Math.max(1, limit)),
          Math.max(0, offset),
        ) as Payload[]
    ).map((r) => ObservationSchema.parse(JSON.parse(r.payload)))
  }
  latest(
    scope: Pick<ArtifactScope, "projectId" | "workspace">,
    sessionId?: string,
  ): ArtifactObservation[] {
    const rows = this.db
      .prepare(
        `SELECT payload FROM artifact_observations WHERE project_id=? AND workspace=? ORDER BY rowid DESC`,
      )
      .all(scope.projectId, resolve(scope.workspace)) as Payload[]
    const found = new Map<string, ArtifactObservation>()
    for (const row of rows) {
      const o = ObservationSchema.parse(JSON.parse(row.payload))
      if (
        !["write", "changed", "late_capture"].includes(o.relation) ||
        (sessionId && o.sessionId !== sessionId)
      )
        continue
      if (!found.has(o.path)) found.set(o.path, o)
    }
    return [...found.values()]
  }
  execution(projectId: string, id: string): ArtifactExecution | undefined {
    const row = this.db
      .prepare(
        "SELECT payload FROM artifact_executions WHERE id=? AND project_id=?",
      )
      .get(id, projectId) as Payload | undefined
    return row ? ExecutionSchema.parse(JSON.parse(row.payload)) : undefined
  }
  executionInputs(
    projectId: string,
    executionId: string,
  ): ArtifactObservation[] {
    return (
      this.db
        .prepare(
          "SELECT payload FROM artifact_observations WHERE project_id=? AND json_extract(payload,'$.executionId')=? AND json_extract(payload,'$.relation') IN ('read','declared_input') ORDER BY rowid",
        )
        .all(projectId, executionId) as Payload[]
    ).map((r) => ObservationSchema.parse(JSON.parse(r.payload)))
  }
  hasPendingExecution(
    scope: Pick<ArtifactScope, "projectId" | "workspace">,
  ): boolean {
    return Boolean(
      this.db
        .prepare(
          "SELECT 1 FROM artifact_executions WHERE project_id=? AND json_extract(payload,'$.workspace')=? AND json_extract(payload,'$.status')='pending' LIMIT 1",
        )
        .get(scope.projectId, resolve(scope.workspace)),
    )
  }
  putExecution(execution: ArtifactExecution): void {
    const e = ExecutionSchema.parse(execution),
      old = this.execution(e.projectId, e.id)
    if (old && old.status !== "pending")
      throw new UserFacingError("已完成执行证据不可改写")
    this.db
      .prepare(
        "INSERT INTO artifact_executions(id,project_id,payload) VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload",
      )
      .run(e.id, e.projectId, JSON.stringify(e))
  }
  request(
    projectId: string,
    requestId: string,
  ):
    | {
        fingerprint: string
        state: string
        resultId: string | null
        payload: string
      }
    | undefined {
    return this.db
      .prepare(
        "SELECT fingerprint,state,result_id AS resultId,request_payload AS payload FROM artifact_retention_requests WHERE project_id=? AND request_id=?",
      )
      .get(projectId, requestId) as
      | {
          fingerprint: string
          state: string
          resultId: string | null
          payload: string
        }
      | undefined
  }
  beginRequest(
    projectId: string,
    requestId: string,
    fingerprint: string,
    payload = "{}",
    tempKey: string | null = null,
  ): void {
    this.db
      .prepare(
        `INSERT INTO artifact_retention_requests(project_id,request_id,fingerprint,state,request_payload,temp_key) VALUES (?,?,?,'pending',?,?) ON CONFLICT(project_id,request_id) DO UPDATE SET state='pending',temp_key=excluded.temp_key`,
      )
      .run(projectId, requestId, fingerprint, payload, tempKey)
  }
  interruptedRequests(): { projectId: string; tempKey: string }[] {
    return this.db
      .prepare(
        "SELECT project_id AS projectId,temp_key AS tempKey FROM artifact_retention_requests WHERE state='interrupted' AND temp_key IS NOT NULL",
      )
      .all() as { projectId: string; tempKey: string }[]
  }
  clearRequestTemp(projectId: string, tempKey: string): void {
    this.db
      .prepare(
        "UPDATE artifact_retention_requests SET temp_key=NULL WHERE project_id=? AND temp_key=?",
      )
      .run(projectId, tempKey)
  }
  failRequest(projectId: string, requestId: string): void {
    this.db
      .prepare(
        "UPDATE artifact_retention_requests SET state='failed' WHERE project_id=? AND request_id=?",
      )
      .run(projectId, requestId)
  }
  publish(result: RetainedResult): void {
    const r = RetainedResultSchema.parse(result)
    this.db.transaction(() => {
      this.db
        .prepare(
          "INSERT INTO artifact_retained(id,project_id,payload) VALUES (?,?,?)",
        )
        .run(r.id, r.projectId, JSON.stringify(r))
      this.db
        .prepare(
          "UPDATE artifact_retention_requests SET state='ready',result_id=? WHERE project_id=? AND request_id=?",
        )
        .run(r.id, r.projectId, r.requestId)
    })()
  }
  retained(projectId: string, id: string): RetainedResult {
    const row = this.db
      .prepare(
        "SELECT payload FROM artifact_retained WHERE id=? AND project_id=?",
      )
      .get(id, projectId) as Payload | undefined
    if (!row) throw new UserFacingError("找不到此项目的留存")
    return RetainedResultSchema.parse(JSON.parse(row.payload))
  }
  retainedList(projectId: string): RetainedResult[] {
    return (
      this.db
        .prepare(
          "SELECT payload FROM artifact_retained WHERE project_id=? ORDER BY rowid DESC",
        )
        .all(projectId) as Payload[]
    )
      .map((r) => RetainedResultSchema.parse(JSON.parse(r.payload)))
      .filter((r) => r.state === "ready")
  }
  markDeleted(projectId: string, id: string): void {
    const r = this.retained(projectId, id)
    this.db
      .prepare(
        "UPDATE artifact_retained SET payload=? WHERE id=? AND project_id=?",
      )
      .run(
        JSON.stringify({
          ...r,
          state: "deleted",
          deletedAt: new Date().toISOString(),
        }),
        id,
        projectId,
      )
  }
  recover(): void {
    this.db
      .prepare(
        "UPDATE artifact_retention_requests SET state='interrupted' WHERE state='pending'",
      )
      .run()
    for (const row of this.db
      .prepare("SELECT id, payload FROM artifact_executions")
      .all() as (Payload & { id: string })[]) {
      const e = ExecutionSchema.parse(JSON.parse(row.payload))
      if (e.status === "pending")
        this.db
          .prepare("UPDATE artifact_executions SET payload=? WHERE id=?")
          .run(
            JSON.stringify({
              ...e,
              status: "interrupted",
              dispatch: "unknown",
              gaps: [...e.gaps, "宿主中断，未补写历史文件观察"],
            }),
            row.id,
          )
    }
  }
  impact(projectId: string) {
    const groups = this.retainedList(projectId),
      objects = new Map(
        groups.flatMap((g) =>
          g.members.map((m) => [m.sha256, m.bytes] as const),
        ),
      )
    return {
      count: groups.length,
      bytes: [...objects.values()].reduce((a, b) => a + b, 0),
      revision: createHash("sha256")
        .update(JSON.stringify(groups.map((g) => g.id).sort()))
        .digest("hex"),
    }
  }
  removeProject(projectId: string): void {
    this.db.transaction(() => {
      for (const table of [
        "artifact_observations",
        "artifact_versions",
        "artifact_files",
        "artifact_executions",
        "artifact_retention_requests",
        "artifact_retained",
      ]) {
        if (table === "artifact_versions")
          this.db
            .prepare(
              "DELETE FROM artifact_versions WHERE file_id IN (SELECT id FROM artifact_files WHERE project_id=?)",
            )
            .run(projectId)
        else
          this.db
            .prepare(`DELETE FROM ${table} WHERE project_id=?`)
            .run(projectId)
      }
    })()
  }
}
