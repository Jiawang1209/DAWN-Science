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
import { useCallback, useEffect, useState } from "react"
import { Button, EmptyState, Loader } from "./primitives.js"

import { t, tf } from "./i18n/index.js"
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
        title={t("还没有打开的工作目录")}
        description={t("技能是按工作目录存的（.dawn/agents/），先给这段对话选一个文件夹。")}
      />
    )
  }
  if (出错) return <EmptyState title={t("读不到技能")} description={出错} />
  if (!数据) return <Loader label={t("正在读这个工作目录里的技能")} />

  return (
    <div className="skills-page">
      <header className="skills-head">
        <h1 className="panel-title">{t("技能")}</h1>
        {/**
          * **把目录说出来**。技能是手写的 md 文件——
          * 不说清楚放哪儿，「怎么加一个」就无从下手。
          */}
        <p className="hint">
          {t("每个")} <code>.md</code> {t("文件是一个技能，放在")} <code>{数据.dir}</code>
        </p>
      </header>

      {数据.agents.length === 0 ? (
        <EmptyState
          title={t("这个工作目录里还没有技能")}
          description={tf("在 {0} 下建一个 .md 文件就行。那个目录里有一份 scout.md.example，去掉 .example 后缀即可启用。", 数据.dir)}
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
                <span>{a.tools ? tf("工具：{0}", a.tools.join("、")) : t("工具：继承默认那一套")}</span>
                <span>{a.model ? tf("模型：{0}", a.model) : t("模型：跟当前会话")}</span>
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
export function PluginsView() {
  return (
    <div className="skills-page">
      <header className="skills-head">
        <h1 className="panel-title">{t("插件")}</h1>
      </header>
      <EmptyState
        title={t("还没有插件这套东西")}
        /* **整段一句话，不用 `+` 拼**——拼接在英文里是另一套语序（见 en.ts 的头注） */
        description={t(
          "现在能装进来的能力有两样，各自在旁边那两屏：「技能」是你自己写的子 agent（.dawn/agents/*.md，写完就能用）；「MCP 服务器」是外部工具，管道通了、还差配置界面。插件要装什么、怎么加载、边界在哪，都还没定——定下来之前这里不会有列表。",
        )}
      />
    </div>
  )
}

/** 一台 MCP 服务器在界面上的样子（协议 5.7） */
export interface MCP一台 {
  name: string
  command: string
  args: string[]
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

        <p className="hint">{t("从那台服务器的文档里，把这样一段 JSON 整段复制过来：")}</p>
        <pre className="mcp-how-code">{`{"mcpServers": {
  "pubmed": {
    "command": "npx",
    "args": ["-y", "@cyanheads/pubmed-mcp-server"],
    "env": { "NCBI_API_KEY": "..." }
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
          {t("Python 写的服务器把 command 换成 uvx。目前只支持本地进程（stdio），还连不了只给 HTTP 地址的远程服务器。")}
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
                    {s.command} {s.args.join(" ")}
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
                    variant="text"
                    size="inline"
                    onClick={() => {
                      if (!onTest) return
                      void onTest(s.name).then((r) => {
                        设试的结果((前) => ({ ...前, [s.name]: { ok: r.ok, ...(r.error ? { error: r.error } : {}) } }))
                        重取()
                      })
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
                      onChange={() => void onFlag?.(s.name, "trusted", !s.trusted).then(重取)}
                    />
                    {t("这台我信得过")}
                  </label>
                  <label className="mcp-switch">
                    <input
                      type="checkbox"
                      checked={s.off}
                      onChange={() => void onFlag?.(s.name, "off", !s.off).then(重取)}
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
                      variant="text"
                      size="inline"
                      onClick={() => void onRemove(s.name).then(重取)}
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
                          variant="text"
                          size="inline"
                          onClick={() => {
                            void onSecret?.(s.name, v, 密文).then(() => {
                              设密文("")
                              设填着的(undefined)
                              重取()
                            })
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
