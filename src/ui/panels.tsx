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
import { formatTokens } from "./format.js"
import type {
  Cost,
  FileChangeFacts,
  ProvenanceLink,
  RunSummary,
  SessionSummary,
} from "../protocol/index.js"
import { Button } from "./primitives.js"

import { t, tf, msgid } from "./i18n/index.js"
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

/**
 * **「状态」面板 2026-08-20 删掉了**（概览收窄成「当前这段会话」时，
 * 作者定的）。它列的是项目里所有会话，而侧栏本来就在答这个问题——
 * 两处答同一件事等于没有判据。
 */

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
/**
 * 一串文件名。**给了 `onOpen` 就是按钮，没给就是纯文本**——
 * 长得像能点却点不动，比不能点更糟。
 */
function FileList({ files, onOpen }: { files: readonly string[]; onOpen?: (path: string) => void }) {
  return (
    <ul className="file-list">
      {files.map((f) => (
        <li key={f}>
          {onOpen ? (
            <Button variant="ghost" size="inline" className="file-link" onClick={() => onOpen(f)}>
              {f}
            </Button>
          ) : (
            f
          )}
        </li>
      ))}
    </ul>
  )
}

export function ToolChangesPanel({
  runs,
  onOpenFile,
}: {
  runs: readonly RunSummary[]
  /** 点开预览。**不变式 5 已经知道 agent 写了哪些文件**——那是最短的入口 */
  onOpenFile?: (path: string) => void
}) {
  const tools = runs.filter((r) => r.requestType.startsWith("tool_call"))
  if (tools.length === 0) {
    return (
      <Panel title={t("变更")}>
        <Empty>{t("还没有工具调用")}</Empty>
      </Panel>
    )
  }

  // 按回合归组。**没有 parent 的也要显示**——RunRecorder 的注释写得很清楚：
  // 没有开着的回合也要记，丢掉等于让一次真实发生的执行不留痕迹
  const groups: { key: string; items: RunSummary[] }[] = []
  for (const r of tools) {
    const key = r.parentRunId ?? tf("孤立：{0}", r.runId)
    const slot = groups.find((g) => g.key === key)
    if (slot) slot.items.push(r)
    else groups.push({ key, items: [r] })
  }

  return (
    <Panel title={t("变更")}>
      {/* 归属告知**不在这里**——它是项目级的事实，由 `AttributionCaveat` 在概览顶上说一次 */}
      {groups.map((g) => (
        <div key={g.key} className="turn-group">
          {g.items.map((r) => {
            // `tool_call:write` → `write`；裸 `tool_call` 说明账本没记下名字
            const name = r.requestType.slice("tool_call".length).replace(/^:/, "")
            return (
              <div key={r.runId} className="tool-change">
                <span className="name">{name || t("未记录工具名")}</span>
                {r.filesWritten === undefined ? (
                  /* **缺省 = 不知道。** 与下面那一支的措辞必须不同 */
                  <span className="hint">{t("无法确定改了什么")}</span>
                ) : r.filesWritten.length === 0 ? (
                  <span className="hint">{t("没有改动文件")}</span>
                ) : (
                  <FileList files={r.filesWritten} {...(onOpenFile ? { onOpen: onOpenFile } : {})} />
                )}
              </div>
            )
          })}
        </div>
      ))}
    </Panel>
  )
}

/**
 * 归属告知：**这一屏上的文件改动分不清是谁改的。**
 *
 * ## 为什么它不长在面板里
 *
 * 2026-08-09 之前它同时长在「产出」和「变更」两个面板里，于是
 * **同一句四十字的橙色警告在概览上并排出现两次**——那是整屏最响的东西，
 * 而它说的是同一件事。本项目在别处已经写过这条：*「一个事实只显示一次」*。
 *
 * 但也不能简单地删掉其中一个：两个面板的数据来源不同
 * （一个来自 git 基线，一个来自逐次工具调用），
 * **只留一个的话，另一个有而这一个没有时，警告会整个消失**——
 * 那是静默吞掉告知，规格 7.5 明令禁止。
 *
 * 所以它提到概览层，由**两个来源合并**判定，说一次。
 */
export function AttributionCaveat({ show }: { show: boolean }) {
  if (!show) return null
  return (
    <p className="caveat panel-wide">
      {t("⚠ 可能包含你自己的修改——本阶段没有 worktree 隔离，分不清是谁改的")}
    </p>
  )
}

/** 两个来源合并：git 基线说的，或任何一次工具调用说的 */
export function mayIncludeUserEdits(
  facts: FileChangeFacts | undefined,
  runs: readonly RunSummary[],
): boolean {
  return (
    facts?.mayIncludeUserEdits === true ||
    runs.some((r) => r.requestType.startsWith("tool_call") && r.mayIncludeUserEdits)
  )
}

export function ChangesPanel({
  facts,
  onOpenFile,
}: {
  facts: FileChangeFacts | undefined
  onOpenFile?: (path: string) => void
}) {
  if (!facts) {
    return (
      <Panel title={t("产出")}>
        <Empty>{t("无法确定——没有取到 git 基线（会话早于本次启动，或工作区不是 git 仓库）")}</Empty>
      </Panel>
    )
  }
  return (
    <Panel title={t("产出")}>
      {facts.files.length === 0 ? (
        <Empty>{t("未改动任何文件")}</Empty>
      ) : (
        <FileList files={facts.files} {...(onOpenFile ? { onOpen: onOpenFile } : {})} />
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
      <Panel title={t("上下文")}>
        <Empty>{t("尚未记录")}</Empty>
      </Panel>
    )
  }
  const { system, tools, history } = usage.bytes
  const total = system + tools + history
  const rows: { label: string; n: number }[] = [
    { label: t("系统提示词"), n: system },
    { label: t("工具 schema"), n: tools },
    { label: t("对话历史"), n: history },
  ]
  return (
    <Panel title={t("上下文")}>
      <p className="tokens">
        {usage.usedTokens !== undefined && usage.contextWindow
          ? `${formatTokens(usage.usedTokens)} / ${formatTokens(usage.contextWindow)} tokens`
          : usage.usedTokens !== undefined
            ? tf("已用 {0} tokens（上限拿不到）", formatTokens(usage.usedTokens))
            : usage.contextWindow
              ? tf("模型上限 {0} tokens · 已用尚未采集", formatTokens(usage.contextWindow))
              : t("尚未采集")}
        {usage.model ? ` · ${usage.model}` : ""}
      </p>
      {/* **这一行是整个面板的要害。** 不写清楚，人就会把下表当成 token 分解 */}
      <p className="hint">{t("下表按字节，不是 token")}</p>
      {/**
       * 三档占比的堆叠条。**它表达的是下面那张表，不是新事实**——
       * 宽度就是字节占比，与「下表按字节，不是 token」那句话说的是同一件事。
       *
       * 宽度用行内样式，因为它**是数据**：百分比来自这一次的实际字节数，
       * 不是某个设计决定。颜色仍然只从令牌来。
       */}
      {total > 0 ? (
        <div className="ctx-bar" aria-hidden="true">
          {rows.map((r) => (
            <span
              key={r.label}
              className={`ctx-seg seg-${rows.indexOf(r) + 1}`}
              style={{ width: `${(r.n / total) * 100}%` }}
            />
          ))}
        </div>
      ) : null}
      <ul className="stat-row ctx-rows">
        {rows.map((r) => (
          <li key={r.label} className="ctx-row">
            <span className="name">{r.label}</span>
            {/* 值与百分比必须在同一行里，且中间有间距。
                上一版三个 span 直接并排、没有任何分隔，渲染出来是
                「系统提示词7.5 KB59%」，而且会在 `7.5` 和 `KB` 之间断行 */}
            <span className="ctx-value">
              <span className="amount">{KB(r.n)}</span>
              <span className="hint">{total > 0 ? `${Math.round((r.n / total) * 100)}%` : "—"}</span>
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  )
}

/** `listVariables` 的三态。**空列表与「不支持」是两回事** */
export type VariablesState =
  | { supported: false; reason: string }
  | { supported: true; variables: readonly VariableRow[] }
  | undefined

export interface VariableRow {
  name: string
  type: string
  dimensions?: string
  preview: string
  previewTruncated: boolean
}

/**
 * 变量面板（②-A · K5 · S14）。
 *
 * *「人能看见 agent 在这个会话里造出了什么。」*
 * 人和 agent 共用同一个活会话，**看不见就等于要靠猜**。
 *
 * ## 三态在界面上必须分得开
 *
 * | 实情 | 界面说什么 |
 * |---|---|
 * | 还没取到 | 「尚未记录」 |
 * | 不支持（例如 R 内核） | **说清为什么**，而不是一片空白 |
 * | 支持且为空 | 「这个会话里还没有变量」——**那是真的没有** |
 *
 * 把后两者都画成空列表，用户会以为自己的变量丢了。
 */
/**
 * 环境快照（②-B · S17）。
 *
 * 它回答的是**「这个结果是在什么环境跑出来的」**——
 * 这是「科研工具」与「AI 编辑器」的分界线之一。
 *
 * **三态分得开**（与变量面板同一条纪律）：没拿到要说原因，
 * 一片空白会被读成「这个环境什么都没有」。
 */
export type EnvironmentState =
  | undefined
  | { captured: false; reason: string }
  | {
      captured: true
      kind: "kernel"
      id: string
      language: "python" | "R"
      version: string
      executable: string
      platform: string
      libraryPaths: string[]
      packages: { name: string; version: string }[]
      packagesTotal: number
    }
  /**
   * 机器快照（②-B · R5，2026-08-13）。
   *
   * **与内核那支不共用一个形状**（计划 §3.4）：内核答「这个解释器里有什么」，
   * 机器答「这台机器是什么」，它们**不可比**。合成一个类型、靠可空字段区分的话，
   * 这个面板就能画出「解释器版本：未知」——而真相是**它问错了问题**。
   *
   * 底下这些**全是可选的，而且缺席就是缺席**：精简容器里没有 `/etc/os-release`、
   * 没有 `nproc`、甚至没有 `git`。那时这一行整个不画，而不是画成「未知」。
   */
  | {
      captured: true
      kind: "shell"
      id: string
      where: "local" | { connectionId: string }
      os?: string
      osRelease?: string
      distro?: string
      arch?: string
      cpus?: number
      memoryKib?: number
      tools?: Record<string, { path: string; version?: string }>
      workspace?: string
      workspaceIsGitRepo?: boolean
    }

export function EnvironmentPanel({ state }: { state: EnvironmentState }) {
  if (!state) {
    return (
      <Panel title={t("环境")}>
        <Empty>{t("尚未记录")}</Empty>
      </Panel>
    )
  }
  if (!state.captured) {
    return (
      <Panel title={t("环境")}>
        <p className="unknown">{t("没有快照")}</p>
        <p className="caveat">{state.reason}</p>
      </Panel>
    )
  }

  if (state.kind === "shell") return <机器环境 state={state} />

  const 截断了 = state.packagesTotal > state.packages.length
  return (
    <Panel title={t("环境")}>
      <dl className="env-facts">
        <dt>{t("解释器")}</dt>
        {/* **版本 + 路径一起给**：光有版本回答不了「哪个 conda 环境」 */}
        <dd>
          {state.version}
          <span className="env-path">{state.executable}</span>
        </dd>
        <dt>{t("平台")}</dt>
        <dd>{state.platform}</dd>
        <dt>{t("库路径")}</dt>
        <dd>
          {state.libraryPaths.length === 0 ? (
            <span className="hint">{t("内核没说")}</span>
          ) : (
            state.libraryPaths.map((p) => (
              <span key={p} className="env-path">
                {p}
              </span>
            ))
          )}
        </dd>
        <dt>{t("指纹")}</dt>
        {/* **前 12 位够认**，而且它是内容指纹：同一个环境的两个会话给同一个 id */}
        <dd className="env-mono">{state.id.slice(0, 12)}</dd>
      </dl>

      <details className="env-packages">
        <summary>
          已装的包（{state.packages.length}
          {截断了 ? ` / 共 ${state.packagesTotal}` : ""}）
        </summary>
        {/* **截断要出声**（规格 7.5）：一份被砍过的清单和完整的看起来一样 */}
        {截断了 ? (
          <p className="caveat">
            只记下了前 {state.packages.length} 个，另有 {state.packagesTotal - state.packages.length} 个未记录
          </p>
        ) : null}
        <ul className="env-pkg-list">
          {state.packages.map((p) => (
            <li key={p.name}>
              <span className="name">{p.name}</span>
              <span className="sub">{p.version}</span>
            </li>
          ))}
        </ul>
      </details>
    </Panel>
  )
}

/**
 * 机器快照那一支（R5）。
 *
 * **一行探不到就整行不画。** 显示「未知」会被读成一个确定的事实
 * （「我们问过了，它没有」），而实情是我们没问到——两者在界面上必须长得不一样。
 */
function 机器环境({
  state,
}: {
  state: Extract<Exclude<EnvironmentState, undefined>, { kind: "shell" }>
}) {
  const 工具 = Object.entries(state.tools ?? {})
  return (
    <Panel title={t("环境")}>
      <dl className="env-facts">
        <dt>{t("机器")}</dt>
        {/* **本地就说本地**，远端说清是哪一台——两台机器可以同名，所以用连接 id */}
        <dd>{state.where === "local" ? t("本机") : tf("远端：{0}", state.where.connectionId)}</dd>

        {state.distro || state.os ? (
          <>
            {/**
             * **不能写「系统」**：那个 msgid 已经被账本里的 `origin: system` 占了
             * （2026-08-13 i18n 扫描发现）。同一个中文串两种含义、一份译文，
             * 换到英文时必有一处是错的——而错的那处看起来完全正常。
             */}
            <dt>{t("操作系统")}</dt>
            <dd>
              {state.distro ?? state.os}
              {state.osRelease ? <span className="env-path">{state.osRelease}</span> : null}
            </dd>
          </>
        ) : null}

        {state.arch || state.cpus !== undefined || state.memoryKib !== undefined ? (
          <>
            <dt>{t("硬件")}</dt>
            <dd>
              {[
                state.arch,
                state.cpus === undefined ? undefined : tf("{0} 核", String(state.cpus)),
                state.memoryKib === undefined ? undefined : 说内存(state.memoryKib),
              ]
                .filter(Boolean)
                .join(" · ")}
            </dd>
          </>
        ) : null}

        {工具.length > 0 ? (
          <>
            <dt>{t("PATH 上的工具")}</dt>
            <dd>
              {工具.map(([名, 它]) => (
                <span key={名} className="env-path">
                  {名}
                  {它.version ? ` ${它.version}` : ""} — {它.path}
                </span>
              ))}
            </dd>
          </>
        ) : null}

        {state.workspace ? (
          <>
            <dt>{t("工作区")}</dt>
            <dd>
              <span className="env-path">{state.workspace}</span>
              {/* **不知道就不说**：git 没装、目录不在、没权限都会探不到，
                  而三种都不等于「这不是一个 git 仓库」 */}
              {state.workspaceIsGitRepo === undefined ? null : (
                <span className="hint">
                  {state.workspaceIsGitRepo ? t("是 git 仓库") : t("不是 git 仓库")}
                </span>
              )}
            </dd>
          </>
        ) : null}

        <dt>{t("指纹")}</dt>
        {/* **前 12 位够认**，而且它是内容指纹：同一台机器的两段会话给同一个 id */}
        <dd className="env-mono">{state.id.slice(0, 12)}</dd>
      </dl>
    </Panel>
  )
}

/** KiB → 人看的。**只在显示层换算**，存的一直是原始数字 */
function 说内存(kib: number): string {
  const gib = kib / 1024 / 1024
  return gib >= 1 ? `${gib.toFixed(1)} GiB` : `${Math.round(kib / 1024)} MiB`
}

export function VariablesPanel({ state }: { state: VariablesState }) {
  if (!state) {
    return (
      <Panel title={t("变量")}>
        <Empty>{t("尚未记录")}</Empty>
      </Panel>
    )
  }
  if (!state.supported) {
    // **不支持要说原因**（规格 7.5）：一片空白会被读成「没有变量」
    return (
      <Panel title={t("变量")}>
        <p className="unknown">{t("看不到")}</p>
        <p className="caveat">{state.reason}</p>
      </Panel>
    )
  }
  if (state.variables.length === 0) {
    return (
      <Panel title={t("变量")}>
        <Empty>{t("这个会话里还没有变量")}</Empty>
      </Panel>
    )
  }
  return (
    <Panel title={t("变量")}>
      <ul className="var-list">
        {state.variables.map((v) => (
          <li key={v.name} className="var">
            <span className="name">{v.name}</span>
            <span className="sub">
              {v.type}
              {v.dimensions ? ` · ${v.dimensions}` : ""}
            </span>
            <p className="var-preview">
              {v.preview}
              {/* **截断要显式标注**——砍过的预览和完整的看起来一模一样 */}
              {v.previewTruncated ? <span className="hint">{t("（预览已截断）")}</span> : null}
            </p>
          </li>
        ))}
      </ul>
    </Panel>
  )
}

export function CostPanel({ cost }: { cost: Cost | undefined }) {
  if (!cost) {
    return (
      <Panel title={t("成本")}>
        <Empty>{t("尚未记录")}</Empty>
      </Panel>
    )
  }
  if (!cost.visible) {
    return (
      <Panel title={t("成本")}>
        <p className="unknown">{t("不可见")}</p>
        <p className="caveat">{cost.reason}</p>
      </Panel>
    )
  }
  return (
    <Panel title={t("成本")}>
      <p className="amount">${cost.totalUSD.toFixed(6)}</p>
      <p className="tokens">
        输入 {formatTokens(cost.inputTokens)} · 输出 {formatTokens(cost.outputTokens)}
        {cost.cacheReadTokens === undefined
          ? null
          : ` · 缓存读 ${formatTokens(cost.cacheReadTokens)}`}
      </p>
    </Panel>
  )
}

/* ── 溯源 ─────────────────────────────────────────────────────────── */

/** 不完整必须写明原因——不隐藏、不留白（规格 7.33）。 */
export function ProvenanceBadge({ link }: { link: ProvenanceLink }) {
  if (link.provenanceComplete) return <span className="prov ok">{t("溯源完整")}</span>
  return (
    <span className="prov partial">
      溯源不完整：{link.incompleteReason}
    </span>
  )
}

/* ── 历史 ─────────────────────────────────────────────────────────── */

/**
 * 谁发起的这一次 run。
 *
 * `user` 上一版写的是**「人」**——一个孤零零的汉字挨着绿色的 `agent`，
 * 看着像乱码。改成「你」，与 transcript 里用户发言的标签**同一个词**：
 * 同一个概念在两处叫两个名字，读的人得先想一下它们是不是一回事。
 */
const ORIGIN_LABEL = { user: msgid("你"), agent: "agent", system: msgid("系统") } as const
const STATUS_LABEL = {
  running: msgid("进行中"),
  completed: msgid("完成"),
  failed: msgid("失败"),
  cancelled: msgid("已取消"),
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
      <Panel title={t("历史")}>
        <Empty>{t("还没有记录")}</Empty>
      </Panel>
    )
  }
  return (
    <Panel title={t("历史")}>
      <ul className="run-list">
        {runs.map((r) => {
          const d = duration(r)
          return (
            <li key={r.runId} className={r.hasError ? "run err" : "run"}>
              <span className="origin">{t(ORIGIN_LABEL[r.origin])}</span>
              <span className="req">{r.requestType}</span>
              <span className="status">{t(STATUS_LABEL[r.status])}</span>
              {d ? <span className="dur">耗时 {d}</span> : null}
            </li>
          )
        })}
      </ul>
    </Panel>
  )
}
