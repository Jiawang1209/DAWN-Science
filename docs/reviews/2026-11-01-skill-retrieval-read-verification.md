# Skill 检索、读取记录与效果验收

分支：`codex/skill-retrieval-read-evaluation`，基于本地 `main` 的 `7c74045d`。仅本地开发和提交，不推送、不合并、不替换已安装应用，不修改用户配置、凭据或用户已安装的技能目录。

## 交付行为

- 原生会话 `search_skills` / `use_skill`、ACP 网关 `dawn_search_skills` / 兼容 list/use、子任务 resource search/read 共用目录、同名优先级、标签和检索排序。自动检索先去重再排除 manual/off。
- 返回名称、说明、来源、标签及字面命中依据，限制分页和单项元数据；诊断也限量并报告截断。术语解释不强制使用技能；词汇规则不能替代一般意图理解。
- 成功读取才生成带 SHA-256、相对资源路径、来源及完整/部分状态的记录。记录在折叠工具组中可见，展开可检查细节；搜索、失败、中断和其他工具声称的 JSON 不生成成功读取记录。
- 原生直接 `read` 的检查放在 SDK 解析后的文件访问处，覆盖 `@`、file URL、上下文 cwd、符号链接别名和普通路径；保持 SDK 图片识别能力。每次调用独立跟踪实际读取路径。
- 原生与子任务历史保留读取记录。ACP 从工具账本恢复为已结束、只读的凭据历史，并提示完整 ACP 对话没有恢复；不会为查看凭据启动外部 agent。
- 超过 20 个自动技能时改用按需检索；保留显式命令。刷新目录和原生会话快照时保留历史、模型、工具与内核。SDK 在手动命令入队时展开说明，后续禁用不改写已授权快照；新读取仍会被拒绝。
- 已更新 `writing-skills` 的检索字段、刷新、全局写入权限和外部运行时说明；用户文档见 `docs/skills.md`。

## 验证

最终代码验证（2026-11-01）：

| 检查 | 结果 |
|---|---|
| `npm test` | 583 个测试文件通过；5,990 项通过、10 项跳过，退出 0 |
| `npm run typecheck` | 退出 0 |
| `npm run build` | Electron、CLI、UI 构建全部通过，退出 0 |
| `npx playwright test e2e/skill-retrieval.spec.ts e2e/skills.spec.ts e2e/artifacts.spec.ts` | 18 项通过，退出 0 |
| `npx tsx scripts/evaluate-skills.ts --json docs/superpowers/reports/2026-11-01-skill-retrieval-evaluation.json` | 固定检索、策略约束和提示元数据测量通过，退出 0 |
| `git diff --check` | 通过 |

Electron 覆盖检索后读取、折叠与展开状态、页面重载恢复、实际手动展开、原技能详情/标签/批量/刷新/三档/导入/删除、普通文件读取和产物行为。已查看读取记录折叠、展开截图，未见遮挡或溢出。测试使用临时配置、工作区与假推理服务。

测试日志中的 Canvas 未实现提示以及构建中的既有 direct-eval / 大块体积提示未导致失败；不把这些提示解释为真实 provider 或科研执行验证。

独立规格复查通过。独立代码审查发现的 SDK 路径解析差异已修复并通过复查；对应真实 SDK 回归先失败、修复后通过。

## 离线效果及范围

[固定离线报告](../superpowers/reports/2026-11-01-skill-retrieval-evaluation.md)与相邻 JSON 保留查询、标签、候选、元数据指纹和复跑入口：18 个正例全部 hit@3/hit@5，10 个普通/概念负例零候选，2 项策略约束通过。旧整句检索在相同正例上为 0/18。

200 项合成目录的 SDK 技能元数据块从 52,409 字符 / 78,783 UTF-8 字节降到 0；9 项小目录保持 2,458 / 3,644。这里只测技能元数据块，没有推导整个提示、token、费用或速度。

补充措辞探针仍漏掉 scoping review/evidence table 与 independent measurements/pseudoreplication 两种专业表达；冻结开发集和修复复查均不是独立盲测。Electron 使用隔离配置与假 provider；本次不主张真实模型会主动正确选择技能、不执行技能所附科研代码，也不证明科学准确性。
