/**
 * 项目面板的四块（Task 2.10）。
 *
 * **学 Rho 拆成一组而非一个**——它实测有 runsPanel / artifactPanel / plotsPanel /
 * problemsPanel / auditPanel / evidencePanel / environmentPanel 七个独立面板，
 * 正好对应 `ProjectSummary` 的计数。①-B 只做四块：状态 · 产出 · 成本 · 历史。
 *
 * **本文件只 import `src/protocol`**，不碰 runtime / session / store——
 * 该约束由 Task 2.13 的扫描测试强制。
 */
import type {
  Cost,
  FileChangeFacts,
  ProvenanceLink,
  RunSummary,
  SessionSummary,
} from "../protocol/index.js"

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="panel">
      <h3 className="panel-title">{title}</h3>
      <div className="panel-body">{children}</div>
    </section>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="empty">{children}</p>
}

/* ── 状态 ─────────────────────────────────────────────────────────── */

export function StatusPanel({ sessions }: { sessions: SessionSummary[] }) {
  if (sessions.length === 0) {
    return (
      <Panel title="状态">
        <Empty>还没有会话</Empty>
      </Panel>
    )
  }
  const alive = sessions.filter((s) => s.state === "alive").length
  const starting = sessions.filter((s) => s.state === "starting").length
  const exited = sessions.filter((s) => s.state === "exited").length
  return (
    <Panel title="状态">
      <ul className="stat-row">
        <li>存活 {alive}</li>
        {starting > 0 ? <li>启动中 {starting}</li> : null}
        <li>已退出 {exited}</li>
      </ul>
    </Panel>
  )
}

/* ── 产出 ─────────────────────────────────────────────────────────── */

/**
 * 三种状态必须显示成三样，不能合并：
 *   有事实且非空 → 列文件
 *   有事实且为空 → 「未改动任何文件」（这是一个**事实**）
 *   **没有事实**  → 「无法确定」（这是**不知道**）
 *
 * 把第三种显示成第二种是撒谎——本项目最不能犯的错。
 * 后端在拿不到 git 基线时不返回 `fileChanges` 字段，正是为了让这里能区分。
 */
export function ChangesPanel({ facts }: { facts: FileChangeFacts | undefined }) {
  if (!facts) {
    return (
      <Panel title="产出">
        <Empty>无法确定——没有取到 git 基线（会话早于本次启动，或工作区不是 git 仓库）</Empty>
      </Panel>
    )
  }
  return (
    <Panel title="产出">
      {facts.mayIncludeUserEdits ? (
        <p className="caveat">⚠ 可能包含你自己的修改——本阶段没有 worktree 隔离，分不清是谁改的</p>
      ) : null}
      {facts.files.length === 0 ? (
        <Empty>未改动任何文件</Empty>
      ) : (
        <ul className="file-list">
          {facts.files.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

/* ── 成本 ─────────────────────────────────────────────────────────── */

/**
 * **三态，不是两态**：
 *   可见   → 金额与 token
 *   不可见 → 「不可见」+ 原因，**页面上不出现 0 也不出现 $**
 *   未记录 → 「尚未记录」
 *
 * 把「不可见」显示成 0 会让人以为免费，那是错的。
 */
export function CostPanel({ cost }: { cost: Cost | undefined }) {
  if (!cost) {
    return (
      <Panel title="成本">
        <Empty>尚未记录</Empty>
      </Panel>
    )
  }
  if (!cost.visible) {
    return (
      <Panel title="成本">
        <p className="unknown">不可见</p>
        <p className="caveat">{cost.reason}</p>
      </Panel>
    )
  }
  return (
    <Panel title="成本">
      <p className="amount">${cost.totalUSD.toFixed(6)}</p>
      <p className="tokens">
        输入 {cost.inputTokens} · 输出 {cost.outputTokens}
        {cost.cacheReadTokens === undefined ? null : ` · 缓存读 ${cost.cacheReadTokens}`}
      </p>
    </Panel>
  )
}

/* ── 溯源 ─────────────────────────────────────────────────────────── */

/** 不完整必须写明原因——不隐藏、不留白（规格 7.33）。 */
export function ProvenanceBadge({ link }: { link: ProvenanceLink }) {
  if (link.provenanceComplete) return <span className="prov ok">溯源完整</span>
  return (
    <span className="prov partial">
      溯源不完整：{link.incompleteReason}
    </span>
  )
}

/* ── 历史 ─────────────────────────────────────────────────────────── */

const ORIGIN_LABEL = { user: "人", agent: "agent", system: "系统" } as const
const STATUS_LABEL = {
  running: "进行中",
  completed: "完成",
  failed: "失败",
  cancelled: "已取消",
} as const

function duration(run: RunSummary): string | undefined {
  // 进行中的 run 不显示耗时——它还没结束，任何数字都是编的
  if (run.status === "running" || !run.finishedAt) return undefined
  const ms = new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime()
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`
}

export function RunsPanel({ runs }: { runs: RunSummary[] }) {
  if (runs.length === 0) {
    return (
      <Panel title="历史">
        <Empty>还没有记录</Empty>
      </Panel>
    )
  }
  return (
    <Panel title="历史">
      <ul className="run-list">
        {runs.map((r) => {
          const d = duration(r)
          return (
            <li key={r.runId} className={r.hasError ? "run err" : "run"}>
              <span className="origin">{ORIGIN_LABEL[r.origin]}</span>
              <span className="req">{r.requestType}</span>
              <span className="status">{STATUS_LABEL[r.status]}</span>
              {d ? <span className="dur">耗时 {d}</span> : null}
            </li>
          )
        })}
      </ul>
    </Panel>
  )
}
