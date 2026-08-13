/**
 * 科研目录约定（作者 2026-08-13 定，2026-08-14 落地）。
 *
 * ## 为什么是一份文件，不是一段硬编码的提示词
 *
 * pi 的 `DefaultResourceLoader` 本来就会读工作区里的
 * `AGENTS.override.md` / `AGENTS.md` / `CLAUDE.md`（见它的 candidates 名单）。
 * **约定写成文件，pi 自然读得到，你也能直接改**——
 * 硬编码进系统提示词的话，它既看不见也改不动，
 * 而「看不见的东西」正是这个项目一再吃亏的地方。
 *
 * 还有一条更要紧的理由：**不是每个工作区都是科研项目**。
 * 一段对话的工作目录可能是任意一个代码仓库，
 * 对着它说「图表写进 `figures/`」是错的。做成一次**明确的动作**
 * （你按一下，它才写进去），比一律注入诚实。
 *
 * ## 这里是这份约定的唯一来源
 *
 * 权限判据里的 `data/raw` 也从这儿取。两处各写各的，改一处忘一处时，
 * **门拦的目录和文档写的目录会对不上**——那种错没有任何东西会报警。
 */

/** 原始数据目录。**权限判据与这份文档共用它** */
export const 原始数据目录 = "data/raw"

/**
 * 要建出来的目录。**空目录也建**——
 * 「该往哪儿放」这件事，看见一个空文件夹就懂了，
 * 而一句写在文档里的话要人先去读。
 */
export const 科研目录 = [
  "figures",
  "results/tables",
  "results/models",
  "results/reports",
  "analysis/scripts",
  "analysis/notebooks",
  原始数据目录,
  "data/processed",
  "literature",
] as const

/**
 * 写进 `AGENTS.md` 的那段话。
 *
 * **逐字来自作者**，只在末尾补了一句 `remote/` 的说明格式。
 * 这段话是给模型看的，所以它是**指令口吻**，不是介绍口吻。
 */
export const 约定正文 = `## 产物落位（本项目采用标准科研目录结构）

产物请写入以下路径（相对项目根目录）：

- 图表 -> \`figures/\`
- 表格 -> \`results/tables/\`
- 拟合模型 -> \`results/models/\`
- 报告 -> \`results/reports/\`
- 脚本与 notebook -> \`analysis/scripts/\`、\`analysis/notebooks/\`
- 数据 -> \`${原始数据目录}/\`（原始输入，**不修改**）、\`data/processed/\`（衍生数据）
- 从远程主机拉取的文件 -> \`remote/<服务器>/\`，每台服务器一个子目录，用该执行上下文的名称命名
- 文献与 PDF -> \`literature/\`

**不要把生成的文件留在项目根目录。**

> \`${原始数据目录}/\` 是只读的：DAWN 的工具权限门在「拦下危险操作」档下会直接拒绝对它的写入。
> 需要产出衍生数据时写到 \`data/processed/\`。
`

/** pi 会读的那几个文件名，**按它的优先级排**（见 `resource-loader.js` 的 candidates） */
export const pi会读的指令文件 = [
  "AGENTS.override.md",
  "AGENTS.md",
  "AGENTS.MD",
  "CLAUDE.md",
  "CLAUDE.MD",
] as const

/** 我们自己要写的那一份。**只写 `AGENTS.md`**——那是 pi 名单里最通用的一个 */
export const 我们写的指令文件 = "AGENTS.md"
