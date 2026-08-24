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
import { 文件类按名字 } from "./file-kind.js"
import { 类型图标 } from "./files.js"
import { useCallback, useEffect, useRef, useState } from "react"
import { Button, EmptyState, Loader } from "./primitives.js"
import { HoverCard, 浮层事件, type 悬停浮层 } from "./hover-card.js"

import { t, tf } from "./i18n/index.js"

export interface Skill {
  name: string
  description: string
  tools?: string[]
  model?: string
  filePath: string
  from: "builtin" | "global" | "project"
  title?: string
  group?: string
  disabled: boolean
  mutable: boolean
}
export interface SkillLoad {
  agents: Skill[]
  problems: { filePath: string; reason: string }[]
  dir: string
  dirs: { builtin?: string; global?: string; project?: string }
}

export interface SubagentActions {
  setEnabled: (filePath: string, enabled: boolean) => Promise<unknown>
  importSubagents: (req: { source: string; to: "global" | "project"; overwrite?: boolean; dryRun?: boolean }) => Promise<导入回执>
  deleteSubagent: (filePath: string) => Promise<unknown>
  pickDirectory: () => Promise<string | null>
  问: (req: { title: string; detail: React.ReactNode; confirmLabel: string; altLabel?: string | undefined }) => Promise<"confirm" | "alt" | "cancel">
  hasProject: boolean
  onChanged?: (() => void) | undefined
}

/**
 * **子 Agent** 那一屏（S20；2026-08-22 改成名册：三层、分组、停用、导入，形状与技能屏同一套）。
 * 每一份定义同时也是一个技能（`/skill:名`）——同一份文件，两处登记。
 */
export function SubagentsView({ load, actions }: { load?: (() => Promise<SkillLoad>) | undefined; actions?: SubagentActions | undefined }) {
  const [数据, 设数据] = useState<SkillLoad | undefined>(undefined)
  const [出错, 设出错] = useState<string | undefined>(undefined)
  const [代, 设代] = useState(0)
  const [忙, 设忙] = useState<string | undefined>(undefined)
  const [回话, 设回话] = useState<{ kind: "ok" | "bad"; text: string } | undefined>(undefined)
  const [筛组, 设筛组] = useState<string>("all")
  const [搜, 设搜] = useState("")
  const [浮着的, 设浮着的] = useState<悬停浮层 | undefined>(undefined)

  useEffect(() => {
    if (!load) return
    let 还在 = true
    load()
      .then((d) => 还在 && 设数据(d))
      .catch((e: unknown) => 还在 && 设出错(e instanceof Error ? e.message : String(e)))
    return () => {
      还在 = false
    }
  }, [load, 代])

  const 做 = async (key: string, 事: () => Promise<string | undefined>) => {
    设忙(key)
    设回话(undefined)
    try {
      const 说 = await 事()
      if (说) 设回话({ kind: "ok", text: 说 })
      设代((n) => n + 1)
      actions?.onChanged?.()
    } catch (e) {
      设回话({ kind: "bad", text: e instanceof Error ? e.message : String(e) })
    } finally {
      设忙(undefined)
    }
  }

  const 去导入 = async (to: "global" | "project") => {
    if (!actions) return
    const source = await actions.pickDirectory().catch((e: unknown) => {
      设出错(e instanceof Error ? e.message : String(e))
      return null
    })
    if (!source) return
    await 做("import", async () => {
      const 检 = await actions.importSubagents({ source, to, dryRun: true })
      if (检.pending.length + 检.conflicts.length === 0) throw new Error(检.failed.map((f) => `${f.source}：${f.why}`).join("；") || t("这里没有可导的定义"))
      let overwrite = false
      if (检.conflicts.length > 0) {
        const 答 = await actions.问({
          title: tf("已经有同名的子 agent：{0}", 检.conflicts.map((c) => c.name).join("、")),
          detail: t("覆盖：替换同名文件；不覆盖：跳过同名项。"),
          confirmLabel: t("覆盖"),
          altLabel: 检.pending.length > 0 ? t("只导没撞名的") : undefined,
        })
        if (答 === "cancel") return undefined
        overwrite = 答 === "confirm"
      }
      const r = await actions.importSubagents({ source, to, overwrite })
      return [
        r.imported.length ? tf("导了 {0} 个：{1}", r.imported.length, r.imported.map((x) => x.name).join("、")) : undefined,
        r.skipped.length ? tf("跳过 {0} 个同名的", r.skipped.length) : undefined,
        r.failed.length ? tf("{0} 个失败：{1}", r.failed.length, r.failed.map((f) => f.why).join("；")) : undefined,
      ].filter(Boolean).join("。") + t("。新会话起生效")
    })
  }

  if (出错) return <EmptyState title={t("读不到子 agent")} description={出错} />
  if (!数据) return <Loader label={t("正在读子 agent")} />

  const 来处 = (f: Skill["from"]) => (f === "builtin" ? t("自带") : f === "project" ? t("这个项目带的") : t("你写的"))
  const 组们 = [...new Set(数据.agents.map((a) => a.group ?? t("其它")))]
  const 筛出来 = 数据.agents.filter((a) => (筛组 === "all" || (a.group ?? t("其它")) === 筛组) && (!搜.trim() || `${a.title ?? ""} ${a.name} ${a.description}`.toLowerCase().includes(搜.trim().toLowerCase())))

  return (
    <div className="skills-page">
      <HoverCard 浮着的={浮着的} />
      <header className="skills-head">
        <h1 className="panel-title">{t("子 Agent")}</h1>
        <p className="hint">{t("独立进程中执行单个任务并返回结果。每个子 agent 同时也是技能，可用 /skill:名字 调用。")}</p>
        {actions ? (
          <div className="skills-actions">
            <Button variant="primary" size="sm" disabled={忙 === "import"} onClick={() => void 去导入("global")}>
              {t("导入到你写的…")}
            </Button>
            {actions.hasProject ? (
              <Button variant="primary" size="sm" disabled={忙 === "import"} onClick={() => void 去导入("project")}>
                {t("导入到这个项目…")}
              </Button>
            ) : null}
          </div>
        ) : null}
        {回话 ? (
          <p className={回话.kind === "bad" ? "caveat" : "mcp-ok"} role="status">
            {回话.text}
          </p>
        ) : null}
      </header>

      <details className="mcp-how" open={数据.agents.length === 0}>
        <summary>{t("往哪儿放？")}</summary>
        <p className="hint">{t("同名时，越靠上的那一份赢：")}</p>
        <ul className="skill-list">
          {(
            [
              ["project", t("这个项目带的")],
              ["global", t("你写的")],
              ["builtin", t("自带")],
            ] as const
          ).map(([k, 名]) =>
            数据.dirs[k] ? (
              <li key={k} className="skill">
                <p className="skill-name">{名}</p>
                <p className="skill-desc">
                  <code>{数据.dirs[k]}</code>
                </p>
              </li>
            ) : null,
          )}
        </ul>
        <p className="caveat">{t("一个 .md 一个子 agent：frontmatter 写 name / description，正文是人设。")}</p>
      </details>

      {数据.agents.length === 0 ? (
        <EmptyState title={t("还没有子 agent")} description={t("在上面那几个目录里放一个 .md 就行。")} />
      ) : (
        <>
          <div className="skills-filters">
            <div className="theme-choices" role="radiogroup" aria-label={t("分组")}>
              <Button variant={筛组 === "all" ? "primary" : "secondary"} size="sm" role="radio" aria-checked={筛组 === "all"} onClick={() => 设筛组("all")}>
                {t("全部")}（{数据.agents.length}）
              </Button>
              {组们.map((g) => (
                <Button key={g} variant={筛组 === g ? "primary" : "secondary"} size="sm" role="radio" aria-checked={筛组 === g} data-authored="" onClick={() => 设筛组(g)}>
                  {g}（{数据.agents.filter((a) => (a.group ?? t("其它")) === g).length}）
                </Button>
              ))}
            </div>
            <input className="control skills-search" type="search" value={搜} aria-label={t("搜子 agent")} placeholder={t("按名字或说明搜")} onChange={(e) => 设搜(e.target.value)} />
            <span className="skills-count hint">{tf("{0} 个，{1} 个开着", 数据.agents.length, 数据.agents.filter((a) => !a.disabled).length)}</span>
          </div>
          {筛出来.length === 0 ? (
            <EmptyState title={t("没有对上的子 agent")} description={t("换个词，或者把筛选清掉。")} />
          ) : (
            <ul className="skill-group" aria-label={t("子 agent 清单")}>
              {筛出来.map((a) => (
                <li key={a.filePath} className="skill-row" data-authored="" data-state={a.disabled ? "off" : undefined}>
                  <div
                    className="skill-row-main"
                    {...浮层事件(设浮着的, a.title ?? a.name, a.description, [{ 图: "文件夹", 文: a.filePath }, { 图: "文件", 文: a.tools ? tf("工具：{0}", a.tools.join("、")) : t("工具：继承默认那一套") }], undefined, 清单上的卡)}
                  >
                    <p className="skill-name">
                      <span className="skill-name-text">{a.title ?? a.name}</span>
                      {a.title ? <span className="tag skill-slug">{a.name}</span> : null}
                      <span className="tag">{来处(a.from)}</span>
                      {a.group ? <span className="tag">{a.group}</span> : null}
                      <span className={`tag ${a.disabled ? "tag-off" : "tag-model"}`}>{a.disabled ? t("已停用") : t("已启用")}</span>
                    </p>
                    <p className="skill-desc">{a.description}</p>
                  </div>
                  {actions ? (
                    <子agent行尾菜单
                      a={a}
                      忙={忙 === a.filePath}
                      可删={a.mutable}
                      onToggle={() => void 做(a.filePath, async () => { await actions.setEnabled(a.filePath, a.disabled); return a.disabled ? tf("「{0}」启用了。新会话起生效", a.name) : tf("「{0}」停用了。新会话起生效", a.name) })}
                      onDelete={() =>
                        void (async () => {
                          const 答 = await actions.问({ title: tf("删掉子 agent「{0}」？", a.name), detail: <code>{a.filePath}</code>, confirmLabel: t("移到废纸篓") })
                          if (答 !== "confirm") return
                          await 做(a.filePath, async () => { await actions.deleteSubagent(a.filePath); return tf("「{0}」已移到废纸篓。新会话起生效", a.name) })
                        })()
                      }
                    />
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {数据.problems.length > 0 ? (
        <section className="skill-problems">
          <h2 className="panel-title">{t("这几个读不进来")}</h2>
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

function 子agent行尾菜单({ a, 忙, 可删, onToggle, onDelete }: { a: Skill; 忙: boolean; /** 自带的只能启停、不能删（文件在应用包里） */ 可删: boolean; onToggle: () => void; onDelete: () => void }) {
  const [开着, 设开着] = useState<{ top: number; left: number } | undefined>(undefined)
  const 按钮 = useRef<HTMLButtonElement>(null)
  const 打开 = () => {
    const r = 按钮.current?.getBoundingClientRect()
    if (!r) return
    设开着({ top: Math.min(Math.max(8, r.bottom + 4), window.innerHeight - 120), left: Math.max(8, r.right - 180) })
  }
  return (
    <div className="row-actions skill-row-actions">
      <Button ref={按钮} variant="ghost" size="icon" className="row-more" aria-label={tf("子 agent 操作：{0}", a.name)} aria-expanded={Boolean(开着)} disabled={忙} onClick={() => (开着 ? 设开着(undefined) : 打开())}>
        ⋯
      </Button>
      {开着 ? (
        <>
          <div className="menu-scrim" onClick={() => 设开着(undefined)} />
          <div className="row-menu" role="menu" aria-label={tf("子 agent 操作：{0}", a.name)} style={{ top: 开着.top, left: 开着.left }}>
            <Button variant="ghost" size="inline" role="menuitem" onClick={() => { 设开着(undefined); onToggle() }}>{a.disabled ? t("启用") : t("停用")}</Button>
            {可删 ? <Button variant="text" size="inline" role="menuitem" className="menu-danger" onClick={() => { 设开着(undefined); onDelete() }}>{t("删除")}</Button> : null}
          </div>
        </>
      ) : null}
    </div>
  )
}

/** 一个 Agent Skill 在界面上的样子（协议 6.0） */
export interface AgentSkill {
  name: string
  description: string
  filePath: string
  from: "builtin" | "global" | "project"
  manualOnly: boolean
  /** 三档（7.17）：开 / 只手动 / 关 */
  invocation: 调用档
  /** 自带的只读 */
  mutable: boolean
}
export type 调用档 = "model" | "manual" | "off"

export interface 导入回执 {
  kind: "single" | "batch"
  pending: { name: string; source: string }[]
  conflicts: { name: string; source: string }[]
  imported: { name: string; dest: string; overwritten: boolean; warnings: string[] }[]
  skipped: { name: string; source: string }[]
  failed: { source: string; why: string }[]
}

/**
 * 技能屏能做的三件事（skills-manage，2026-08-21，学自 dsh-skills-manager）。
 * **都写文件**：档位写进 SKILL.md 的 frontmatter（别的工具也认这两行），导入是复制目录，删是进废纸篓。
 * 没给就还是那张只读清单。
 */
export interface SkillActions {
  setInvocation: (filePath: string, mode: 调用档) => Promise<unknown>
  importSkill: (req: { source: string; to: "global" | "project"; overwrite?: boolean; dryRun?: boolean }) => Promise<导入回执>
  deleteSkill: (filePath: string) => Promise<unknown>
  pickDirectory: () => Promise<string | null>
  /** 问一句「覆盖？」「删？」——走全局那个确认框 */
  问: (req: { title: string; detail: React.ReactNode; confirmLabel: string; altLabel?: string | undefined }) => Promise<"confirm" | "alt" | "cancel">
  /** 有当前项目才给「导进这个项目」 */
  hasProject: boolean
  /** 做完一件事（导入 / 删除 / 启停）报一声：侧栏的数要跟着变 */
  onChanged?: (() => void) | undefined
}

export interface AgentSkill装载 {
  skills: AgentSkill[]
  problems: { path: string; reason: string }[]
  dirs: { builtin?: string; global?: string; project?: string }
}

/** 悬停卡开在行的右边、贴着页面的右缘算 */
const 清单上的卡 = { 标题: ".skill-name-text", 容器: ".skills-page", 开在: "左边" as const }

/** 行尾那颗「⋯」：开 / 只手动 / 关 / 删除。与会话行、文件行同一套菜单形状 */
function 行尾菜单({ s, 忙, 可删, 档名, onMode, onDelete }: { s: AgentSkill; 忙: boolean; /** 自带的只能换档、不能删 */ 可删: boolean; 档名: (m: 调用档) => string; onMode: (m: 调用档) => void; onDelete: () => void }) {
  const [开着, 设开着] = useState<{ top: number; left: number } | undefined>(undefined)
  const 按钮 = useRef<HTMLButtonElement>(null)
  const 打开 = () => {
    const r = 按钮.current?.getBoundingClientRect()
    if (!r) return
    const 高 = 170
    设开着({ top: Math.min(Math.max(8, r.bottom + 4), window.innerHeight - 高 - 8), left: Math.max(8, r.right - 180) })
  }
  return (
    <div className="row-actions skill-row-actions">
      <Button ref={按钮} variant="ghost" size="icon" className="row-more" aria-label={tf("技能操作：{0}", s.name)} aria-expanded={Boolean(开着)} disabled={忙} onClick={() => (开着 ? 设开着(undefined) : 打开())}>
        ⋯
      </Button>
      {开着 ? (
        <>
          <div className="menu-scrim" onClick={() => 设开着(undefined)} />
          <div className="row-menu" role="menu" aria-label={tf("技能操作：{0}", s.name)} style={{ top: 开着.top, left: 开着.left }}>
            {(["model", "manual", "off"] as const).map((m) => (
              <Button key={m} variant="ghost" size="inline" role="menuitemradio" aria-checked={s.invocation === m} onClick={() => { 设开着(undefined); if (m !== s.invocation) onMode(m) }}>
                {s.invocation === m ? "✓ " : ""}{档名(m)}
              </Button>
            ))}
            {可删 ? (
              <Button variant="text" size="inline" role="menuitem" className="menu-danger" onClick={() => { 设开着(undefined); onDelete() }}>
                {t("删除")}
              </Button>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  )
}

/**
 * **Agent Skills** 那一屏（S20，2026-08-15）。
 *
 * 作者：*「我的目标就是要对标 hermes、codex app 这种搞 skills。」*
 *
 * ## 它与「子 agent」是两种东西
 *
 * | | 是什么 | 怎么用 |
 * |---|---|---|
 * | **Agent Skill** | 一份**写给模型读的说明书**：何时用、何时别用、速查 | 模型自己读，或 `/skill:名` |
 * | **子 agent** | 派一个分身去干活，有自己的工具集与模型 | 父 agent 调 `subagent` 工具 |
 *
 * 此前两者共用「技能」一个词——**两个不同的东西共用一个名字**，
 * 正是这个仓库最忌讳的含混。作者拍板：技能这个词让给 Agent Skills。
 *
 * ## 这一屏要说清三件事
 *
 * 1. **有哪些、各是干什么的**——`description` 是模型选它的依据，
 *    人也该看得见（写得含糊的技能永远不会被用上）
 * 2. **它从哪儿来**：自带 / 你写的 / 这个项目带的。**同名时项目 > 全局 > 自带**
 * 3. **往哪儿放**——三个目录的路径都写出来，否则「怎么加一个」无从下手
 */
export function AgentSkillsView({ load, actions }: { load?: (() => Promise<AgentSkill装载>) | undefined; actions?: SkillActions | undefined }) {
  const [数据, 设数据] = useState<AgentSkill装载 | undefined>(undefined)
  const [出错, 设出错] = useState<string | undefined>(undefined)
  /** 改动之后重读用的令牌 */
  const [代, 设代] = useState(0)
  /** 正在做的那件事（按 filePath 或 "import"），做完清掉 */
  const [忙, 设忙] = useState<string | undefined>(undefined)
  /** 上一件事的结果或错误，摆在列表上面——**失败必须出声** */
  const [回话, 设回话] = useState<{ kind: "ok" | "bad"; text: string } | undefined>(undefined)
  const [筛, 设筛] = useState<"all" | AgentSkill["from"]>("all")
  const [搜, 设搜] = useState("")
  const [浮着的, 设浮着的] = useState<悬停浮层 | undefined>(undefined)

  useEffect(() => {
    if (!load) return
    let 还在 = true
    load()
      .then((d) => 还在 && 设数据(d))
      .catch((e: unknown) => 还在 && 设出错(e instanceof Error ? e.message : String(e)))
    return () => {
      还在 = false
    }
  }, [load, 代])

  const 做 = async (key: string, 事: () => Promise<string | undefined>) => {
    设忙(key)
    设回话(undefined)
    try {
      const 说 = await 事()
      if (说) 设回话({ kind: "ok", text: 说 })
      设代((n) => n + 1)
      actions?.onChanged?.()
    } catch (e) {
      设回话({ kind: "bad", text: e instanceof Error ? e.message : String(e) })
    } finally {
      设忙(undefined)
    }
  }

  const 去导入 = async (to: "global" | "project") => {
    if (!actions) return
    const source = await actions.pickDirectory().catch((e: unknown) => {
      设出错(e instanceof Error ? e.message : String(e))
      return null
    })
    if (!source) return
    await 做("import", async () => {
      const 检 = await actions.importSkill({ source, to, dryRun: true })
      if (检.pending.length + 检.conflicts.length === 0) {
        // 全失败：把每条原因说出来
        throw new Error(检.failed.map((f) => `${f.source}：${f.why}`).join("；"))
      }
      let overwrite = false
      if (检.conflicts.length > 0) {
        const 答 = await actions.问({
          title: tf("已经有同名的技能：{0}", 检.conflicts.map((c) => c.name).join("、")),
          detail: t("覆盖：替换同名目录；不覆盖：跳过同名项。"),
          confirmLabel: t("覆盖"),
          altLabel: 检.pending.length > 0 ? t("只导没撞名的") : undefined,
        })
        if (答 === "cancel") return undefined
        overwrite = 答 === "confirm"
      }
      const r = await actions.importSkill({ source, to, overwrite })
      const 段 = [
        r.imported.length ? tf("导了 {0} 个：{1}", r.imported.length, r.imported.map((x) => x.name + (x.overwritten ? t("（覆盖）") : "")).join("、")) : undefined,
        r.skipped.length ? tf("跳过 {0} 个同名的", r.skipped.length) : undefined,
        r.failed.length ? tf("{0} 个失败：{1}", r.failed.length, r.failed.map((f) => f.why).join("；")) : undefined,
        ...r.imported.flatMap((x) => x.warnings),
      ].filter(Boolean)
      return 段.join("。") + t("。新会话起生效")
    })
  }

  const 去删 = async (s: AgentSkill) => {
    if (!actions) return
    const 答 = await actions.问({
      title: tf("删掉技能「{0}」？", s.name),
      detail: <code>{s.filePath.replace(/\/SKILL\.md$/, "")}</code>,
      confirmLabel: t("移到废纸篓"),
    })
    if (答 !== "confirm") return
    await 做(s.filePath, async () => {
      await actions.deleteSkill(s.filePath)
      return tf("「{0}」已移到废纸篓。新会话起生效", s.name)
    })
  }

  if (!load) return <EmptyState title={t("本次运行没有装配技能")} description={t("这是启动时的装配问题，不是配置问题。")} />
  if (出错) return <EmptyState title={t("读不到技能")} description={出错} />
  if (!数据) return <Loader label={t("正在读技能")} />

  const 来处 = (f: AgentSkill["from"]) =>
    f === "builtin" ? t("自带") : f === "project" ? t("这个项目带的") : t("你写的")
  const 档名 = (m: 调用档) => (m === "model" ? t("开") : m === "manual" ? t("只手动") : t("关"))
  const 状态名 = (m: 调用档) => (m === "model" ? t("已启用") : m === "manual" ? t("只能手动调用") : t("已关"))
  const 筛出来 = 数据.skills.filter((x) => (筛 === "all" || x.from === 筛) && (!搜.trim() || `${x.name} ${x.description}`.toLowerCase().includes(搜.trim().toLowerCase())))

  return (
    <div className="skills-page">
      <HoverCard 浮着的={浮着的} />
      <header className="skills-head">
        <h1 className="panel-title">{t("Skills")}</h1>
        <p className="hint">
          {t("技能 = 文件夹 + SKILL.md。模型按需读取，也可用 /skill:名字 显式调用。")}
        </p>
        {actions ? (
          <div className="skills-actions">
            {/**
              * **导入**（skills-manage）：从本机选一个含 SKILL.md 的文件夹（或一筐），复制进来。
              * 「新建」仍然不做——让 agent 写（`writing-skills`），这里只管「下下来的怎么进来」。
              */}
            <Button variant="primary" size="sm" disabled={忙 === "import"} onClick={() => void 去导入("global")}>
              {t("导入到你写的…")}
            </Button>
            {actions.hasProject ? (
              <Button variant="primary" size="sm" disabled={忙 === "import"} onClick={() => void 去导入("project")}>
                {t("导入到这个项目…")}
              </Button>
            ) : null}
          </div>
        ) : null}
        {回话 ? (
          <p className={回话.kind === "bad" ? "caveat" : "mcp-ok"} role="status">
            {回话.text}
          </p>
        ) : null}
      </header>

      {/**
        * **三个目录都写出来。** 不说清放哪儿，「怎么加一个」就无从下手
        * （与子 agent、MCP 那两屏同一条）。**同名时越具体的赢**，也要说。
        */}
      <details className="mcp-how" open={数据.skills.length === 0}>
        <summary>{t("往哪儿放？")}</summary>
        <p className="hint">{t("同名时，越靠上的那一份赢：")}</p>
        <ul className="skill-list">
          {(
            [
              ["project", t("这个项目带的")],
              ["global", t("你写的")],
              ["builtin", t("自带")],
            ] as const
          ).map(([k, 名]) =>
            数据.dirs[k] ? (
              <li key={k} className="skill">
                <p className="skill-name">{名}</p>
                <p className="skill-desc">
                  <code>{数据.dirs[k]}</code>
                </p>
              </li>
            ) : null,
          )}
        </ul>
        <p className="caveat">
          {t("名字仅限小写字母、数字和连字符。")}
        </p>
      </details>

      {数据.skills.length === 0 ? (
        <EmptyState
          title={t("还没有技能")}
          description={t("在上述目录中新建文件夹并放入 SKILL.md。")}
        />
      ) : (
        <>
          {/**
            * **一张密的清单，不是一摞卡片**（2026-08-21 作者给了 DSH 技能页那张图）：
            * 每行两行高——名字 + 来源标签 + 状态标签，下面说明单行省略；细线分隔；
            * 路径进悬停卡；操作收进行尾的「⋯」。上面一行：来源筛选 + 搜索 + 计数。
            */}
          <div className="skills-filters">
            <div className="theme-choices" role="radiogroup" aria-label={t("来源")}>
              {(["all", "project", "global", "builtin"] as const).map((k) => {
                const n = k === "all" ? 数据.skills.length : 数据.skills.filter((x) => x.from === k).length
                if (k !== "all" && n === 0) return null
                return (
                  <Button key={k} variant={筛 === k ? "primary" : "secondary"} size="sm" role="radio" aria-checked={筛 === k} onClick={() => 设筛(k)}>
                    {k === "all" ? t("全部") : 来处(k)}（{n}）
                  </Button>
                )
              })}
            </div>
            <input
              className="control skills-search"
              type="search"
              value={搜}
              aria-label={t("搜技能")}
              placeholder={t("按名字或说明搜")}
              onChange={(e) => 设搜(e.target.value)}
            />
            <span className="skills-count hint">
              {tf("{0} 个，{1} 个开着", 数据.skills.length, 数据.skills.filter((x) => x.invocation === "model").length)}
            </span>
          </div>
          {筛出来.length === 0 ? (
            <EmptyState title={t("没有对上的技能")} description={t("换个词，或者把筛选清掉。")} />
          ) : (
            <ul className="skill-group" aria-label={t("技能清单")}>
              {筛出来.map((s) => (
                <li key={s.filePath} className="skill-row" data-authored="" data-state={s.invocation === "off" ? "off" : undefined}>
                  <div
                    className="skill-row-main"
                    {...浮层事件(设浮着的, s.name, s.description, [{ 图: "文件夹", 文: s.filePath }], undefined, 清单上的卡)}
                  >
                    <p className="skill-name">
                      <span className="skill-name-text">{s.name}</span>
                      <span className="tag">{来处(s.from)}</span>
                      <span className={`tag tag-${s.invocation}`}>{状态名(s.invocation)}</span>
                    </p>
                    {/* **模型选它的依据**，不是装饰——写得含糊的技能永远不会被用上 */}
                    <p className="skill-desc">{s.description}</p>
                  </div>
                  {actions ? (
                    <行尾菜单 s={s} 忙={忙 === s.filePath} 可删={s.mutable} 档名={档名} onMode={(m) => void 做(s.filePath, async () => { await actions.setInvocation(s.filePath, m); return tf("「{0}」改为{1}。新会话起生效", s.name, 档名(m)) })} onDelete={() => void 去删(s)} />
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {/** **写坏了要看得见**：静静不出现的话，人只会以为「我写的技能没生效」 */}
      {数据.problems.length > 0 ? (
        <section className="skill-problems">
          <h2 className="panel-title">{t("这几个读不进来")}</h2>
          <ul>
            {数据.problems.map((p) => (
              <li key={`${p.path}${p.reason}`}>
                <span className="skill-path">{p.path}</span>
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
 * 插件那一屏（2026-08-12，作者要的，放在技能下面）。
 *
 * **它如实说清「还没有」**，并指出现在能装的能力是哪两样——
 * 而不是摆一个空列表让人以为「我还没装而已」。
 *
 * 插件与技能、MCP 不同：技能是 `.dawn/agents/*.md`（本来就能跑），
 * MCP 是管道通了只差界面，而**插件在我们这儿还没有承载体**——
 * 装什么、怎么加载、边界在哪，一样都还没定。
 */
export interface 插件一族 {
  key: string
  name: string
  on: boolean
  tools: { name: string; description: string }[]
}
export interface 插件一个 {
  id: string
  name: string
  on: boolean
  families: 插件一族[]
}

/**
 * 插件那一屏（2026-08-25 起有了第一个承载体，学自 dsh-office）。
 *
 * **插件 = 仓库里审过的内置工具包**，不做任意 JS 加载——「装什么、怎么加载、
 * 边界在哪」这三问的答案。第一张卡：Office 文档（四族 14 工具）。
 * 开关改的是设置键，**下一段会话生效**（工具是建会话时装上去的）——卡上写明。
 */
/** 插件与族的名字来自后端（协议里是数据不是文案）；这里静态映射一层 `t`，让 i18n 的孤儿扫描看得见 */
const 插件文案 = (n: string): string =>
  ({ "Office 文档": t("Office 文档"), 电子表格: t("电子表格"), PDF: "PDF", 演示文稿: t("演示文稿"), "Word 文档": t("Word 文档") })[n] ?? n

export function PluginsView({ load, onFlag }: {
  load: () => Promise<{ plugins: 插件一个[] }>
  onFlag: (pluginId: string, family: string | undefined, on: boolean) => Promise<unknown>
}) {
  const [插件们, 设插件们] = useState<插件一个[] | undefined>(undefined)
  const [出错, 设出错] = useState<string | undefined>(undefined)
  const 重取 = useCallback(() => {
    load().then((r) => 设插件们(r.plugins)).catch((e: unknown) => 设出错(e instanceof Error ? e.message : String(e)))
  }, [load])
  useEffect(重取, [重取])
  const 拨 = (id: string, family: string | undefined, on: boolean) => {
    // **乐观翻转**：受控勾选框等后端回包才动，就是「点了没反应」的那半秒；失败再重取纠正
    设插件们((前) =>
      前?.map((p) =>
        p.id !== id
          ? p
          : family
            ? { ...p, families: p.families.map((f) => (f.key === family ? { ...f, on } : f)) }
            : { ...p, on },
      ),
    )
    void onFlag(id, family, on).then(重取).catch((e: unknown) => {
      设出错(e instanceof Error ? e.message : String(e))
      重取()
    })
  }
  return (
    <div className="skills-page">
      <header className="skills-head">
        <h1 className="panel-title">{t("插件")}</h1>
        <p>{t("插件是随应用内置、经过审查的工具包。开关改动对下一段新会话生效。")}</p>
      </header>
      {出错 ? <p className="caveat">{出错}</p> : null}
      {插件们 === undefined ? null : (
        <ul className="skill-list">
          {插件们.map((p) => (
            <li key={p.id} className="skill plugin-card" data-state={p.on ? "on" : "off"}>
              <p className="skill-name">
                {插件文案(p.name)}
                <span className="mcp-from">{tf("{0} 个工具", p.families.reduce((n, f) => n + f.tools.length, 0))}</span>
                {p.on ? <span className="badge-on">{t("已启用")}</span> : <span className="mcp-off">{t("已关闭")}</span>}
              </p>
              <p className="skill-meta">
                <label className="mcp-switch">
                  <input type="checkbox" checked={p.on} onChange={() => 拨(p.id, undefined, !p.on)} />
                  {t("启用这个插件")}
                </label>
              </p>
              <ul className="plugin-family-list">
                {p.families.map((f) => (
                  <li key={f.key} className="plugin-family" data-on={p.on && f.on ? "1" : undefined}>
                    <label className="mcp-switch plugin-family-head">
                      <input
                        type="checkbox"
                        checked={f.on}
                        disabled={!p.on}
                        onChange={() => 拨(p.id, f.key, !f.on)}
                        aria-label={tf("启用 {0} 工具", 插件文案(f.name))}
                      />
                      <类型图标 类={文件类按名字(`a.${f.key === "ppt" ? "pptx" : f.key}`, "file")} />
                      <span className="plugin-family-name">{插件文案(f.name)}</span>
                      <span className="plugin-family-count">{f.tools.length}</span>
                    </label>
                    {/* 工具名如实列出：**列出来的就是模型此刻真的有的**（关着的族淡显不藏） */}
                    <p className="plugin-tools">{f.tools.map((x) => x.name).join(" · ")}</p>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** 一台 MCP 服务器在界面上的样子（协议 5.7） */
export interface MCP一台 {
  name: string
  /** 起它的命令。**只有本机那种有**——与 `url` 恰好一个有一个没有 */
  command?: string
  args: string[]
  /** 连过去的地址。**只有远端那种有**（2026-08-19） */
  url?: string
  /** `http` = streamable HTTP（新），`sse` = 老那套 */
  transport?: "http" | "sse"
  env: string[]
  missingSecrets: string[]
  cwd?: string
  from: "global" | "project"
  trusted: boolean
  off: boolean
  state: "unknown" | "ready" | "failed"
  error?: string
  tools: { name: string; description: string }[]
}

export interface MCP装载 {
  servers: MCP一台[]
  problems: string[]
  configPath?: string
}

/**
 * MCP 那一屏（2026-08-15）。
 *
 * 在此之前它如实写着「还不能在这里配」——那是对的，因为当时真的不能。
 * 现在能了：内置对话走 pi，MCP 客户端是我们自己那一层
 * （pi 不带），工具经 `customTools` 注进去。
 *
 * ## 这一屏要回答的三个问题
 *
 * 1. **配了哪几台、是谁配的**（全局 / 某个项目带的）
 * 2. **此刻连没连上**——`还没试过` 与 `连不上` 分开显示，
 *    后者一定带原因。两者混成一个「未连接」的话，
 *    一个刚配好的服务器会显示成故障。
 * 3. **还差什么**——缺哪个密钥要点名，而不是笼统一句「没配好」。
 *
 * ## 加一台仍然要手写 YAML
 *
 * 这一版**不做「新增服务器」的表单**，而是把配置文件的路径显眼地说出来。
 * 理由：命令、参数、工作目录、环境变量四样都要填，做一个能填对的表单
 * 是另一件事；**而摆一个填不全的表单比让人去改文件更坏**——
 * 他会以为填完就能用。**能在这里做的两件事（拨开关、填密钥）都做了**，
 * 因为它们恰恰是不该写进那份文件的。
 */
export function McpView({
  load,
  onTest,
  onFlag,
  onSecret,
  onAdd,
  onRemove,
}: {
  load?: (() => Promise<MCP装载>) | undefined
  onTest?: ((name: string) => Promise<{ ok: boolean; error?: string; tools: { name: string }[] }>) | undefined
  onFlag?: ((name: string, flag: "trusted" | "off", value: boolean) => Promise<void>) | undefined
  onSecret?: ((name: string, varName: string, secret: string) => Promise<void>) | undefined
  /** 粘一段 JSON 加一台。**解析在服务端做**——密钥的值在那里就被丢掉了 */
  onAdd?: ((json: string) => Promise<{ name: string; needsSecrets: string[] }>) | undefined
  onRemove?: ((name: string) => Promise<void>) | undefined
} = {}) {
  const [数据, 设数据] = useState<MCP装载 | undefined>(undefined)
  const [出错, 设出错] = useState<string | undefined>(undefined)
  /** 刚试过的结果。**与列表里的 `state` 分开存**：列表是取回来的那一刻的事实 */
  const [试的结果, 设试的结果] = useState<Record<string, { ok: boolean; error?: string }>>({})
  const [填着的, 设填着的] = useState<{ 服务器: string; 变量: string } | undefined>(undefined)
  /** 粘进来那段 JSON，以及加完之后要说的那句话 */
  const [粘的, 设粘的] = useState("")
  const [加的结果, 设加的结果] = useState<
    { ok: true; 名: string; 要密钥: string[] } | { ok: false; 话: string } | undefined
  >(undefined)
  const [密文, 设密文] = useState("")

  const 重取 = useCallback(() => {
    if (!load) return
    load()
      .then(设数据)
      .catch((e: unknown) => 设出错(e instanceof Error ? e.message : String(e)))
  }, [load])

  useEffect(() => {
    重取()
  }, [重取])

  if (!load) {
    return (
      <div className="skills-page">
        <header className="skills-head">
          <h1 className="panel-title">{t("MCP 服务器")}</h1>
        </header>
        <EmptyState
          title={t("本次运行没有装配 MCP")}
          description={t("这是启动时的装配问题，不是配置问题。")}
        />
      </div>
    )
  }
  if (出错) return <EmptyState title={t("读不到 MCP 名单")} description={出错} />
  if (!数据) return <Loader label={t("正在读 MCP 名单")} />

  return (
    <div className="skills-page">
      <header className="skills-head">
        <h1 className="panel-title">{t("MCP 服务器")}</h1>
        {/**
          * **把配置文件的路径说出来**。加一台要手写 YAML——
          * 不说清放哪儿，「怎么加一个」就无从下手（与技能那一屏同一条）。
          */}
        {数据.configPath ? (
          <p className="hint">
            {t("在这份文件的")} <code>mcp:</code> {t("段里加一台；项目独有的写在")}{" "}
            <code>.dawn/mcp.yaml</code>
            <br />
            <code>{数据.configPath}</code>
          </p>
        ) : null}
      </header>

      {/**
        * **加一台：粘一段 JSON**（2026-08-15 作者要的接口）。
        *
        * 作者：*「就和我配置其他的大模型，或者 Skill 似的，
        * 我是不是应该搞一个配置的接口啥的呢？」*——他是对的，而这个仓库
        * 早就为同一件事下过结论（`config/writer.ts` 的文件头：
        * *「让人打开一个 yaml 手写一段，本身就是这个应用没做完。」*）。
        *
        * **为什么是粘贴而不是填五个格子**：每台服务器的 README 给的都是
        * Claude Desktop 的那段 JSON。照着填既慢又容易抄漏一个引号——
        * 而那正是「填不全的表单」真正的危险。粘进来还顺手处理掉了那个
        * 最要紧的差别：**JSON 里带着的密钥值，我们只取变量名**。
        */}
      <details className="mcp-how" open={数据.servers.length === 0}>
        <summary>{t("加一台 MCP 服务器")}</summary>

        <p className="hint">{t("粘贴服务器文档中的 JSON 配置：")}</p>
        <pre className="mcp-how-code">{`{"mcpServers": {
  "pubmed": {
    "command": "npx",
    "args": ["-y", "@cyanheads/pubmed-mcp-server"],
    "env": { "NCBI_API_KEY": "..." }
  }
}}`}</pre>
        {/**
          * **两种形态都给一个例子**（2026-08-19 作者要的：
          * *「我要对接的是我自己放在云服务器上的 MCP」*）。
          *
          * 只给本机那个例子的话，人会照着它去改——而远端那种连 `command`
          * 都没有，改不出来。**一个例子只教得会它自己那一种。**
          */}
        <p className="hint">{t("已经跑在服务器上的那种，给地址：")}</p>
        <pre className="mcp-how-code">{`{"mcpServers": {
  "my-cloud": {
    "type": "http",
    "url": "https://your-server.example/mcp",
    "headers": { "Authorization": "Bearer ..." }
  }
}}`}</pre>

        <textarea
          className="control mcp-paste"
          rows={4}
          value={粘的}
          placeholder={t("把那段 JSON 粘在这里")}
          aria-label={t("MCP 服务器的 JSON 配置")}
          onChange={(e) => {
            设粘的(e.target.value)
            设加的结果(undefined)
          }}
        />
        <p className="skill-meta">
          <Button
            variant="text"
            size="inline"
            onClick={() => {
              if (!onAdd || !粘的.trim()) return
              void onAdd(粘的)
                .then((r) => {
                  设加的结果({ ok: true, 名: r.name, 要密钥: r.needsSecrets })
                  设粘的("")
                  重取()
                })
                .catch((e: unknown) =>
                  设加的结果({ ok: false, 话: e instanceof Error ? e.message : String(e) }),
                )
            }}
          >
            {t("加进来")}
          </Button>
        </p>
        {加的结果?.ok === false ? <p className="caveat">{加的结果.话}</p> : null}
        {加的结果?.ok === true ? (
          <p className="mcp-ok">
            {tf("「{0}」加好了。", 加的结果.名!)}
            {加的结果.要密钥 && 加的结果.要密钥.length > 0
              ? tf("它要 {0}——在下面那一条里填上，再按「试一次」。", 加的结果.要密钥.join("、"))
              : t("在下面按「试一次」看看连不连得上。")}
          </p>
        ) : null}

        {/**
          * **密钥那一条是整块里唯一不能少的。**
          * 别人的 README 里 `env` 装的是密钥本身，照抄的人不会注意到差别，
          * **而那份配置文件是会被分享、会进 git 的**。
          */}
        <p className="caveat">
          {t(
            "密钥不会写进配置文件：我们只留变量名，值在下面每台各自的输入框里填，存进系统钥匙串。别人的文档里 env 带着值，那种写法迟早把 key 提交上去。",
          )}
        </p>
        <p className="hint">
          {t("Python 服务器用 uvx；远程服务器 type 填 http 或 sse，默认 http。")}
        </p>
      </details>

      {/**
        * **配好之后怎么用**（2026-08-15 作者要的）。
        *
        * 作者：*「很有必要的是，告诉一下我 MCP 的用法如何。」*——
        * 光有配置说明不够：**配完不知道怎么使唤它，等于没配**。
        *
        * 三句话说清三件事：怎么用（就说人话）、怎么确认它真用了（找工具行，
        * 而不是看答案对不对）、被拦了怎么办。
        * 中间那条最要紧：**模型自己编一个答案，与它真去查了，在屏幕上长得一样。**
        */}
      <details className="mcp-how">
        <summary>{t("配好之后怎么用？")}</summary>
        <p className="hint">{t("回到对话里说人话就行，不用记工具名。比如：")}</p>
        <pre className="mcp-how-code">{t(
          "查一下近五年「土地利用变化对土壤微生物多样性的影响」的综述，\n挑三篇最相关的给我摘要，再按 APA 列出参考文献",
        )}</pre>
        <p className="caveat">
          {t(
            "怎么确认它真的查了：看对话里有没有那条工具调用行（写着 pubmed__pubmed_search_articles 这样的名字）。只看答案是不行的——模型凭印象编一段和真去查了，在屏幕上长得一模一样。",
          )}
        </p>
        <p className="hint">
          {t(
            "如果回来的是「还没有被过目」，那是权限门拦下了：把那一台的「这台我信得过」打开，或者到设置里把权限档改成全部允许。",
          )}
        </p>
      </details>

      {数据.servers.length === 0 ? (
        <EmptyState
          title={t("还没有配 MCP 服务器")}
          description={t(
            "MCP 服务器是外部工具：数据库、文献库、领域 API 都有现成的。在上面那份文件里加一段 mcp: 就行——我们不需要为每样工具各写一遍代码。",
          )}
        />
      ) : (
        <ul className="skill-list">
          {数据.servers.map((s) => {
            const 试 = 试的结果[s.name]
            return (
              <li key={s.name} className="skill" data-state={s.off ? "off" : s.state}>
                <p className="skill-name">
                  {s.name}
                  {/* **它是谁配的**：项目带的那些会随仓库走 */}
                  <span className="mcp-from">
                    {s.from === "project" ? t("这个项目带的") : t("全局")}
                  </span>
                  {s.off ? <span className="mcp-off">{t("已关闭")}</span> : null}
                </p>
                <p className="skill-desc">
                  <code>
                    {/**
                      * **两种形态各显示各的**（2026-08-19）：
                      * 本机那种给命令行，远端那种给地址与传输方式。
                      * 地址后面缀上 `http` / `sse`——**连不上时第一个要确认的
                      * 就是它走的哪种**，而这两种的排查方向完全不同。
                      */}
                    {s.url ? `${s.url}　${s.transport ?? "http"}` : `${s.command ?? ""} ${s.args.join(" ")}`}
                  </code>
                </p>

                {/**
                  * **缺哪个密钥要点名**（规格 7.5）：笼统一句「没配好」
                  * 会让人对着三个变量挨个试。
                  */}
                {s.missingSecrets.length > 0 ? (
                  <p className="caveat">
                    {tf("还差 {0} 没填，填上才连得起来", s.missingSecrets.join("、"))}
                  </p>
                ) : null}

                {试 ? (
                  <p className={试.ok ? "mcp-ok" : "caveat"}>
                    {试.ok ? t("连上了") : 试.error}
                  </p>
                ) : null}

                {s.tools.length > 0 ? (
                  <p className="skill-meta">
                    <span>{tf("{0} 个工具：{1}", String(s.tools.length), s.tools.map((x) => x.name).join("、"))}</span>
                  </p>
                ) : null}

                <p className="skill-meta">
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => {
                      if (!onTest) return
                      void onTest(s.name).then((r) => {
                        设试的结果((前) => ({ ...前, [s.name]: { ok: r.ok, ...(r.error ? { error: r.error } : {}) } }))
                        重取()
                      }).catch((e: unknown) => 设试的结果((前) => ({ ...前, [s.name]: { ok: false, error: e instanceof Error ? e.message : String(e) } })))
                    }}
                  >
                    {t("试一次")}
                  </Button>

                  {/**
                    * **这两个开关不写进配置文件**——项目级名单会跟着仓库被
                    * clone，让它声明自己可信等于没有门。所以它们住在本机的库里。
                    */}
                  <label className="mcp-switch">
                    <input
                      type="checkbox"
                      checked={s.trusted}
                      onChange={() => void onFlag?.(s.name, "trusted", !s.trusted).then(重取).catch((e: unknown) => 设出错(e instanceof Error ? e.message : String(e)))}
                    />
                    {t("这台我信得过")}
                  </label>
                  <label className="mcp-switch">
                    <input
                      type="checkbox"
                      checked={s.off}
                      onChange={() => void onFlag?.(s.name, "off", !s.off).then(重取).catch((e: unknown) => 设出错(e instanceof Error ? e.message : String(e)))}
                    />
                    {t("先别连它")}
                  </label>

                  {/**
                    * **加得进就该删得掉。** 只对全局那些给这颗——
                    * 项目级的住在那个仓库的 `.dawn/mcp.yaml` 里，属于那个仓库，
                    * 不该由这一屏改。**不给按钮，比给一颗按了报错的强。**
                    */}
                  {s.from === "global" && onRemove ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => void onRemove(s.name).then(重取).catch((e: unknown) => 设出错(e instanceof Error ? e.message : String(e)))}
                    >
                      {tf("删掉 {0}", s.name)}
                    </Button>
                  ) : null}
                </p>

                {/* 它要的每个环境变量各有一个填的入口。**值只进不出**，所以框永远是空的 */}
                {s.env.map((v) => (
                  <p key={v} className="skill-meta mcp-secret">
                    <span>{v}</span>
                    {填着的?.服务器 === s.name && 填着的.变量 === v ? (
                      <>
                        <input
                          type="password"
                          className="control mcp-secret-input"
                          value={密文}
                          autoFocus
                          aria-label={tf("{0} 的值", v)}
                          onChange={(e) => 设密文(e.target.value)}
                        />
                        <Button
                          variant="primary"
                          size="inline"
                          onClick={() => {
                            void onSecret?.(s.name, v, 密文).then(() => {
                              设密文("")
                              设填着的(undefined)
                              重取()
                            }).catch((e: unknown) => 设出错(e instanceof Error ? e.message : String(e)))
                          }}
                        >
                          {t("存下来")}
                        </Button>
                      </>
                    ) : (
                      <Button
                        variant="text"
                        size="inline"
                        onClick={() => {
                          设密文("")
                          设填着的({ 服务器: s.name, 变量: v })
                        }}
                      >
                        {s.missingSecrets.includes(v) ? t("去填") : t("换一个")}
                      </Button>
                    )}
                  </p>
                ))}
              </li>
            )
          })}
        </ul>
      )}

      {/**
        * **名单本身的问题不静默跳过**（规格 7.5）：
        * 重名、项目文件读不出来——不说的话人只会以为「我配的那台没生效」。
        */}
      {数据.problems.length > 0 ? (
        <section className="skill-problems">
          <h2 className="panel-title">{t("这几处要处理")}</h2>
          <ul>
            {数据.problems.map((p) => (
              <li key={p}>
                <span className="caveat">{p}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}
