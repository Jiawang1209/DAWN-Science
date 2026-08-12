/**
 * 技能与 MCP 两屏（2026-08-12）。
 *
 * 作者定的侧栏顺序：*「第一个新建任务，第二个……技能，MCP 服务器，远端连接。」*
 *
 * ## 一条边界：**这两屏只说真话**
 *
 * 我先提过「它们现在几乎是空的、不如等能用了再上」，作者要求先做出来。
 * 那就做出来——但**不做「空占位」**：
 *
 * - **技能是真的**：`.dawn/agents/*.md` 的子 agent 本来就能跑
 *   （`src/subagent/` 有加载器与执行器），此前只是界面上看不见。
 *   这一屏把它们列出来，**连读不进来的文件与原因一起列**。
 * - **MCP 只做到一半**，所以这一屏**如实说清做到了哪儿**：
 *   它目前只对托管的 claude / codex 生效，配置由我们按会话写出去，
 *   **还没有配置界面**。写清楚比画一个点了没反应的表单诚实。
 *
 * 「看不见的能力等于不存在」有个反面：**不存在的能力不该看起来存在**。
 */
import { useEffect, useState } from "react"
import { EmptyState, Loader } from "./primitives.js"

export interface Skill {
  name: string
  description: string
  tools?: string[] | undefined
  model?: string | undefined
  filePath: string
}

export interface SkillLoad {
  agents: Skill[]
  problems: { filePath: string; reason: string }[]
  dir: string
}

export function SkillsView({ load }: { load?: (() => Promise<SkillLoad>) | undefined }) {
  const [数据, 设数据] = useState<SkillLoad | undefined>(undefined)
  const [出错, 设出错] = useState<string | undefined>(undefined)

  useEffect(() => {
    if (!load) return
    let 还在 = true
    load()
      .then((d) => 还在 && 设数据(d))
      .catch((e: unknown) => 还在 && 设出错(e instanceof Error ? e.message : String(e)))
    return () => {
      还在 = false
    }
  }, [load])

  if (!load) {
    return (
      <EmptyState
        title="还没有打开的工作目录"
        description="技能是按工作目录存的（.dawn/agents/），先给这段对话选一个文件夹。"
      />
    )
  }
  if (出错) return <EmptyState title="读不到技能" description={出错} />
  if (!数据) return <Loader label="正在读这个工作目录里的技能" />

  return (
    <div className="skills-page">
      <header className="skills-head">
        <h1 className="panel-title">技能</h1>
        {/**
          * **把目录说出来**。技能是手写的 md 文件——
          * 不说清楚放哪儿，「怎么加一个」就无从下手。
          */}
        <p className="hint">
          每个 <code>.md</code> 文件是一个技能，放在 <code>{数据.dir}</code>
        </p>
      </header>

      {数据.agents.length === 0 ? (
        <EmptyState
          title="这个工作目录里还没有技能"
          description={`在 ${数据.dir} 下建一个 .md 文件就行。那个目录里有一份 scout.md.example，去掉 .example 后缀即可启用。`}
        />
      ) : (
        <ul className="skill-list">
          {数据.agents.map((a) => (
            <li key={a.filePath} className="skill">
              <p className="skill-name">{a.name}</p>
              {/* **给模型看的选择依据**，不是装饰——它决定父 agent 会不会选中它 */}
              <p className="skill-desc">{a.description}</p>
              <p className="skill-meta">
                {/**
                  * **缺省 = 继承默认工具集**，不是「一个工具都不给」。
                  * 缺失不等于相同，缺失也不等于支持——这里的默认值才是要害。
                  */}
                <span>{a.tools ? `工具：${a.tools.join("、")}` : "工具：继承默认那一套"}</span>
                <span>{a.model ? `模型：${a.model}` : "模型：跟当前会话"}</span>
                <span className="skill-path">{a.filePath}</span>
              </p>
            </li>
          ))}
        </ul>
      )}

      {/**
        * **读不进来的不静默跳过**（规格 7.5）。
        * 一个格式写错的定义静静地不出现，人只会以为「我写的技能没生效」。
        */}
      {数据.problems.length > 0 ? (
        <section className="skill-problems">
          <h2 className="panel-title">这几个读不进来</h2>
          <ul>
            {数据.problems.map((p) => (
              <li key={p.filePath}>
                <span className="skill-path">{p.filePath}</span>
                <span className="caveat">{p.reason}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}

/**
 * MCP 那一屏。
 *
 * **它如实说清做到了哪儿**：管道有了（每段托管会话写一份 `mcp.json`，
 * 由 `--mcp-config` 指过去），但**没有配置界面**，而且**只对托管的
 * claude / codex 生效**——内置那条走 pi，还没接。
 *
 * 不画一个填了不生效的表单：那比没有更坏。
 */
export function McpView() {
  return (
    <div className="skills-page">
      <header className="skills-head">
        <h1 className="panel-title">MCP 服务器</h1>
      </header>
      <EmptyState
        title="还不能在这里配 MCP"
        description={
          "管道已经通了：每开一段托管会话（claude / codex），我们会按会话写一份 mcp.json，" +
          "并用 --mcp-config 指过去。但**目前还没有配置界面**，" +
          "而且它只对托管的那两类生效——内置对话走 pi，那条还没接上。"
        }
      />
    </div>
  )
}
