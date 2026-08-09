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

export function StatusPanel({ sessions }: { sessions: readonly SessionSummary[] }) {
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
/**
 * 变更 pane（①-B″ · U4）。**不变式 5 第一次有用户可见面。**
 *
 * R3 早就把「哪次工具调用改了哪个文件」记进账本了，此前只是没人显示。
 * 与上面那个会话级的 `ChangesPanel` 不同，这里是**逐次工具调用**那一层。
 *
 * ## 两条不能松的纪律
 *
 * **① 「不知道」与「确认没改」必须看得出区别。** 账本里前者是缺省
 * （非 git 仓库、快照失败、只读工具），后者是空数组。R3 刻意保留了这个区别，
 * 界面上把它们画成同一个样子，就等于把「不知道」说成了「没改」——那是编造。
 *
 * **② `mayIncludeUserEdits` 必须显示。** 本阶段没有 worktree 隔离，
 * 分不清是 agent 改的还是作者自己改的。**不能指望人记得加脚注。**
 */
export function ToolChangesPanel({ runs }: { runs: readonly RunSummary[] }) {
  const tools = runs.filter((r) => r.requestType.startsWith("tool_call"))
  if (tools.length === 0) {
    return (
      <Panel title="变更">
        <Empty>还没有工具调用</Empty>
      </Panel>
    )
  }

  // 按回合归组。**没有 parent 的也要显示**——RunRecorder 的注释写得很清楚：
  // 没有开着的回合也要记，丢掉等于让一次真实发生的执行不留痕迹
  const groups: { key: string; items: RunSummary[] }[] = []
  for (const r of tools) {
    const key = r.parentRunId ?? `孤立:${r.runId}`
    const slot = groups.find((g) => g.key === key)
    if (slot) slot.items.push(r)
    else groups.push({ key, items: [r] })
  }

  const anyUserEdits = tools.some((r) => r.mayIncludeUserEdits)

  return (
    <Panel title="变更">
      {anyUserEdits ? (
        <p className="caveat">⚠ 可能包含你自己的修改——本阶段没有 worktree 隔离，分不清是谁改的</p>
      ) : null}
      {groups.map((g) => (
        <div key={g.key} className="turn-group">
          {g.items.map((r) => {
            // `tool_call:write` → `write`；裸 `tool_call` 说明账本没记下名字
            const name = r.requestType.slice("tool_call".length).replace(/^:/, "")
            return (
              <div key={r.runId} className="tool-change">
                <span className="name">{name || "未记录工具名"}</span>
                {r.filesWritten === undefined ? (
                  /* **缺省 = 不知道。** 与下面那一支的措辞必须不同 */
                  <span className="hint">无法确定改了什么</span>
                ) : r.filesWritten.length === 0 ? (
                  <span className="hint">没有改动文件</span>
                ) : (
                  <ul className="file-list">
                    {r.filesWritten.map((f) => (
                      <li key={f}>{f}</li>
                    ))}
                  </ul>
                )}
              </div>
            )
          })}
        </div>
      ))}
    </Panel>
  )
}

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
export interface ContextUsage {
  model?: string
  contextWindow?: number
  /** provider 报的真数。**缺省 = 尚未采集，不是 0** */
  usedTokens?: number
  bytes: { system: number; tools: number; history: number }
}

const KB = (n: number): string =>
  n < 1024 ? `${n} 字节` : n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`

/**
 * 上下文用量（①-B″ · U3）。
 *
 * ## 这个面板最要紧的一件事：**不把字节说成 token**
 *
 * `pi-ai` 里没有 tokenizer。三档内容的**字节数可以精确量，token 不能**。
 * 拿字节占比乘上一个 token 总数假装成分解，就是编造——
 * 而计划里那条纪律说得很直白：**分解不准比不分解更坏，
 * 它会让人据此做错决定**。
 *
 * 所以这里两块并列，各自为真：
 *   - **上限**：模型自带的 `contextWindow`，真数（拿不到就说拿不到）
 *   - **构成**：三档的字节数与占比，**标题里写死「按字节，不是 token」**
 *
 * 已用了多少 token 目前**尚未采集**（provider 报的 usage 一处都没接），
 * 面板如实说「尚未采集」，不拿字节去凑。
 */
export function ContextPanel({ usage }: { usage: ContextUsage | undefined }) {
  if (!usage) {
    return (
      <Panel title="上下文">
        <Empty>尚未记录</Empty>
      </Panel>
    )
  }
  const { system, tools, history } = usage.bytes
  const total = system + tools + history
  const rows: { label: string; n: number }[] = [
    { label: "系统提示词", n: system },
    { label: "工具 schema", n: tools },
    { label: "对话历史", n: history },
  ]
  return (
    <Panel title="上下文">
      <p className="tokens">
        {usage.usedTokens !== undefined && usage.contextWindow
          ? `${usage.usedTokens.toLocaleString()} / ${usage.contextWindow.toLocaleString()} tokens`
          : usage.usedTokens !== undefined
            ? `已用 ${usage.usedTokens.toLocaleString()} tokens（上限拿不到）`
            : usage.contextWindow
              ? `模型上限 ${usage.contextWindow.toLocaleString()} tokens · 已用尚未采集`
              : "尚未采集"}
        {usage.model ? ` · ${usage.model}` : ""}
      </p>
      {/* **这一行是整个面板的要害。** 不写清楚，人就会把下表当成 token 分解 */}
      <p className="hint">下表按字节，不是 token</p>
      <ul className="stat-row ctx-rows">
        {rows.map((r) => (
          <li key={r.label} className="ctx-row">
            <span className="name">{r.label}</span>
            <span className="amount">{KB(r.n)}</span>
            <span className="hint">{total > 0 ? `${Math.round((r.n / total) * 100)}%` : "—"}</span>
          </li>
        ))}
      </ul>
    </Panel>
  )
}

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

export function RunsPanel({ runs }: { runs: readonly RunSummary[] }) {
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
