# 子 agent 名册：三层、分组、停用、一份两用（agents-roster）

> 学自 `MichengAI/dsh-agency-agents` v0.1.20（代码 Apache-2.0；它那 271 份 persona 来自 `msitarzewski/agency-agents`，MIT）。
> 本地副本 `ccb_hive_code_learn/dsh-agency-agents`，解读全文 `dsh-agency-agents-解读.md`。
> 作者 2026-08-22 定的：22 份全要；**一份人设既是子 agent 也是技能**。

## 定案

- **三层目录**，与技能同一套：自带 `dist/agents`（只读，随应用发布）/ 你写的 `~/DAWN/agents`（`DAWN_AGENTS_DIR` 可改，e2e 隔离）/ 项目 `.dawn/agents`。同名项目 > 全局 > 自带；跨层同名不算写坏。
- **自带 22 份自己写**（`agents/*.md`，中文，贴科研目录约定，`data/raw` 只读）：统计与建模 5、数据处理 3、可视化 2、生态与生命科学 4、地理信息 2、写作与审查 6。不搬它那 271 份——绝大多数是做生意的，对科研工作台是噪音。它三份相关的（statistician / data-visualization / code-reviewer）作为可导入样本放 `docs/samples/`，带原 LICENSE。
- frontmatter 多三个可选字段：`title`（给人看的中文名；`name` 仍是安全标识符）、`group`（分组）、`disabled: true`（停用：屏上列、不给模型、不当技能）。
- **一份两用**：`native.ts` 的 `skillsOverride` 把没停用的子 agent 定义登记成技能（pi 读技能时剥掉 frontmatter，正文正好是人设）；技能名撞了技能赢。`/skill:名` 把规矩叫进主对话，`subagent` 工具把它派出去。
- **两级发现**（照它的 `list_experts`）：`subagent` 工具描述只列名字按组，详情靠 MCP 工具 `dawn_list_subagents`；描述里加一句「没有合适的就别派」。
- **不递归**：子 agent 进程只装 pi 默认工具，拿不到 `subagent` 工具（原本就如此，记一条测试钉住——见 `tests/subagent`）。
- 屏：与技能屏同一形状——分组筛、搜、来源 / 分组 / 启停标签、「⋯」启停与删除（进废纸篓）、导入到你写的 / 这个项目（`.md` 一个或一筐，两阶段）、三处路径。没项目也能看自带与你写的。
- 命令面板（`/` 在空输入框行首开的那个）多一组「子 agent」：「派子 agent「X」」往草稿写「用子 agent「X」来做：」；「按「X」的规矩聊」写「/skill:x 」。

## 协议 7.20
`listSubagents` 多 `from / title / group / disabled / mutable / dirs`，`projectId` 可不给；新增 `setSubagentEnabled` / `importSubagents` / `deleteSubagent`。

## 不借
它的 `@` 触发器（我们 `@` 引用文件）、`summon_experts`（我们的 parallel 已是）、外部根目录配置（三层已经够）。
