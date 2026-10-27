import { WorkbenchServer } from "../../src/workbench/server.js";
import { ArtifactStore } from '../../src/artifacts/store.js'
import { ArtifactRetention } from '../../src/artifacts/retention.js'
/**
 * 先出方案的后端一侧（spec §4.5）：`answerPlan` 分码与租约、非 native、中枢的 `plan` 条目与 `propose_plan` 不画工具行。
 *
 * 真 `createWorkbenchBackend` + 真 `SessionManager`；运行时是 `FakeRuntime` 的替身（`make()` 照 `redirect-backend.test.ts`）。
 */
import { afterEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrate } from "../../src/store/schema.js";
import { ProjectStore } from "../../src/store/projects.js";
import { SessionStore } from "../../src/store/sessions.js";
import { RunStore } from "../../src/store/runs.js";
import { TaskStore } from "../../src/store/tasks.js";
import { SessionManager } from "../../src/session/manager.js";
import { ProjectManager } from "../../src/project/manager.js";
import { SessionTranscripts } from "../../src/workbench/events.js";
import { FakeRuntime } from "../../src/runtime/fake.js";
import type { SessionId } from "../../src/runtime/types.js";
import { createWorkbenchBackend } from "../../src/workbench/backend.js";
import { memoryCredentials } from "../helpers/credentials.js";
import type { ProviderRegistry } from "../../src/config/schema.js";

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { vi } from "vitest";
import type { DeliveryRecord } from "../../src/protocol/delivery.js";
const registry: ProviderRegistry = {
  agents: {
    "ds-chat": {
      kind: "native",
      provider: "deepseek",
      model: "m",
      capabilities: ["chat"],
    },
  },
};
const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function make(
  extra: Partial<Parameters<typeof createWorkbenchBackend>[0]> = {},
) {
  const runtime = new FakeRuntime();
  const db = new Database(":memory:");
  migrate(db);
  const sessionStore = new SessionStore(db);
  const runStore = new RunStore(db);
  const sessions = new SessionManager({
    store: sessionStore,
    registry,
    runtimes: { native: runtime, pty: runtime },
    workspaceRoot: tmpdir(),
  });
  const projects = new ProjectManager({
    projects: new ProjectStore(db),
    sessions: sessionStore,
    runs: runStore,
    registry,
  });
  const events = new SessionTranscripts({ terminalMaxChars: 10_000 });
  const scratch = mkdtempSync(join(tmpdir(), "dawn-scratch-"));
  const repo = mkdtempSync(join(tmpdir(), "dawn-plan-"));
  dirs.push(scratch, repo);
  const artifactStore=new ArtifactStore(db),artifactRetention=new ArtifactRetention({store:artifactStore,directory:join(scratch,'retained')})
  const backend = createWorkbenchBackend({
    artifactStore,artifactRetention,
    ...extra,
    projects,
    projectStore: new ProjectStore(db),
    runs: runStore,
    sessions,
    credentials: memoryCredentials(),
    registry,
    events,
    tasks: new TaskStore(db),
    scratchRoot: scratch,
    trashItem: async (p) => {
      rmSync(p, { recursive: true, force: true });
    },
  });
  const 开一段 = async () => {
    const { sessionId } = (await backend.createTask({
      agentId: "ds-chat",
      workspace: repo,
    })) as { sessionId: string };
    await backend.acquireLease({ sessionId, holder: "user" });
    return sessionId;
  };
  return { backend, runtime, repo, 开一段, sessions, events, artifactStore };
}

it('retains results across chat deletion and rejects stale project removal confirmation',async()=>{
 const f=make(),sessionId=await f.开一段();writeFileSync(join(f.repo,'result.csv'),'n\n4\n')
 const group=await f.backend.captureAndRetainCurrent({sessionId,path:'result.csv',requestId:'g1',name:'first'}) as import('../../src/artifacts/model.js').RetainedResult
 const projectId=f.sessions.get(sessionId)!.projectId!
 await f.backend.deleteSession({sessionId})
 const next=await f.开一段()
 expect((await f.backend.listRetainedResults({sessionId:next}) as {results:unknown[]}).results).toHaveLength(1)
 const saved=await f.backend.readRetainedArtifact({sessionId:next,retainedId:group.id,memberId:group.members[0]!.id}) as {content: {kind: string,table?: {rows: string[][]}}}
 expect(saved.content).toMatchObject({kind:'table',table:{rows:[['4']]}})
 const old=f.artifactStore.impact(projectId)
 await expect(f.backend.deleteProject({projectId})).rejects.toBeTruthy()
 writeFileSync(join(f.repo,'result.csv'),'n\n5\n')
 await f.backend.captureAndRetainCurrent({sessionId:next,path:'result.csv',requestId:'g2',name:'second'})
 await expect(f.backend.deleteProject({projectId,retainedRevision:old.revision,deleteRetained:true})).rejects.toBeTruthy()
 const current=f.artifactStore.impact(projectId)
 await f.backend.deleteProject({projectId,retainedRevision:current.revision,deleteRetained:true})
 expect(f.artifactStore.retainedList(projectId)).toEqual([])
 expect(group.members[0]?.observation.sha256).toBeTruthy()
})

describe("analysis delivery backend", () => {
  it("uses this native session model, selected output evidence and persisted owner records", async () => {
    const askOnce = vi.fn(async (_target: unknown, _req: { user: string }) => ({
      model: "test-current",
      text: JSON.stringify({
        readme: "# readme\nrun command unknown",
        interpretation:
          "# 结果解读\nresults.csv 给出 n=24，缺少研究设计；不推出因果。",
        scripts: [],
        gaps: [],
      }),
    }));
    const f = make({
      askOnce,
      skills: { 自带目录: resolve("skills"), 项目目录名: ".dawn/skills" },
    });
    const sessionId = await f.开一段();
    writeFileSync(join(f.repo, "results.csv"), "n\n24\n");
    const r = (await f.backend.createAnalysisDelivery({
      sessionId,
      requestId: "delivery-1",
      name: "科研分析",
      paths: ["results.csv"],
      references: [],
      mode: "organize",
    })) as DeliveryRecord;
    expect(r.state).toBe("partial");
    expect(askOnce.mock.calls[0]?.[0]).toEqual({ sessionId });
    expect(askOnce.mock.calls[0]?.[1].user).toContain("24");
    expect(await f.backend.listAnalysisDeliveries({ sessionId })).toMatchObject(
      { supported: true, records: [{ id: r.id }] },
    );
    const other = await f.开一段();
    expect(
      await f.backend.listAnalysisDeliveries({ sessionId: other }),
    ).toMatchObject({ records: [] });
  });
  it("does not borrow a model or bypass a disabled delivery skill", async () => {
    const f = make();
    const sessionId = await f.开一段();
    expect(await f.backend.listAnalysisDeliveries({ sessionId })).toMatchObject(
      { supported: false, records: [] },
    );
    await expect(
      f.backend.createAnalysisDelivery({
        sessionId,
        requestId: "r",
        name: "d",
        paths: ["x.csv"],
        references: [],
        mode: "organize",
      }),
    ).rejects.toThrow();
  });
  it("respects the builtin skill off setting instead of silently injecting its rules", async () => {
    const askOnce = vi.fn(async () => ({ model: "m", text: "{}" }));
    const f = make({
        askOnce,
        skills: {
          自带目录: resolve("skills"),
          自带档: (name) => (name === "analysis-delivery" ? "off" : undefined),
        },
      }),
      sessionId = await f.开一段();
    expect(await f.backend.listAnalysisDeliveries({ sessionId })).toMatchObject(
      { supported: false, reason: expect.stringContaining("停用") },
    );
    await expect(
      f.backend.createAnalysisDelivery({
        sessionId,
        requestId: "off",
        name: "d",
        paths: ["results.csv"],
        references: [],
        mode: "organize",
      }),
    ).rejects.toThrow(/停用/);
    expect(askOnce).not.toHaveBeenCalled();
  });
  it("returns an actionable interpreter error through the real protocol server", async () => {
    const f = make({
      skills: { 自带目录: resolve("skills") },
      askOnce: async () => ({
        model: "m",
        text: JSON.stringify({
          readme: "# Readme\n明确的运行参数",
          interpretation:
            "# 结果解读\n依据 results.csv，有效样本量28；未计算显著性。",
          scripts: [{ path: "run.py", content: 'print("test")' }],
          gaps: [],
          validation: {
            language: "python",
            script: "run.py",
            args: ["{workspace}", "{output}"],
            comparisons: [
              { source: "results.csv", output: "results.csv", kind: "table" },
            ],
            note: "test",
          },
        }),
      }),
    });
    const sessionId = await f.开一段();
    writeFileSync(join(f.repo, "results.csv"), "n\n28\n");
    const r = (await f.backend.createAnalysisDelivery({
      sessionId,
      requestId: "interpreter-check",
      name: "d",
      paths: ["results.csv"],
      references: [],
      mode: "validate",
    })) as DeliveryRecord;
    const response = await new WorkbenchServer(f.backend).handle(
      "verifyAnalysisDelivery",
      {
        sessionId,
        id: r.id,
        plan: r.plan,
        outputsReviewed: true,
        tolerance: 0,
      },
    );
    expect(response).toMatchObject({
      ok: false,
      error: {
        code: "invalid_request",
        message: expect.stringContaining("解释器"),
      },
    });
  });
});
