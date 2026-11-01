# Skill 检索离线验收（2026-11-01）

固定开发验收集通过。结果来自本地元数据检索与 SDK 提示格式化，没有调用真实模型或 provider，没有运行 Skill 附带代码、科研分析或外部工具，也不证明科学结论正确。

## 复跑入口与范围

```sh
npx vitest run tests/skills/retrieval-evaluation.test.ts tests/skills/自带技能.test.ts
npx tsx scripts/evaluate-skills.ts --json docs/superpowers/reports/2026-11-01-skill-retrieval-evaluation.json
```

本次两个测试文件共 9 项通过，评测命令退出码为 0。[完整 JSON 报告](2026-11-01-skill-retrieval-evaluation.json)保留逐题查询、可接受 Skill、标注依据、候选、计数及元数据/夹具 SHA-256。命令默认只向 stdout 输出 JSON；`--json` 另存报告。任一必需正例未进入前 3、任一负例返回候选、策略约束失败或内置目录发现有诊断，命令都会非零退出。

语料为仓库实际 `skills/*/SKILL.md` 的 9 个内置 Skill，发现诊断为 0。冻结夹具位于 `tests/fixtures/skill-retrieval-evaluation.json`，包含 18 个中英文科研/文档/技能编写正例、5 个普通闲聊负例和 5 个概念解释负例。每个内置 Skill 有中文与英文/同义表达正例；负例明确要求零候选。合成目录另检查 manual/off 不进入自动检索，以及项目同名停用技能先覆盖全局/内置、不能在过滤后重新露出低优先级版本。

## 同一夹具的检索结果

| 指标 | 旧整句字面基线 | 当前检索 |
|---|---:|---:|
| 正例 hit@3 | 0 / 18 | 18 / 18 |
| 正例 hit@5 | 0 / 18 | 18 / 18 |
| 普通负例有候选的题数 / 候选总数 | 0 / 0 | 0 / 0 |
| 概念负例有候选的题数 / 候选总数 | 0 / 0 | 0 / 0 |
| 独立策略约束 | 不适用 | 2 / 2 |

旧基线复现此前 `src/subagent/resource-search.ts` 的 Skill 分支：名称与完整说明拼接，NFKC、转小写、空白折叠后做整句子串匹配，不使用新标签、分词或同义词；两者使用相同顺序、查询及前 5 展示窗口。候选总数包含窗口之外的结果，hit@k 表示前 k 名中至少有一个可接受 Skill。

固定正例标签在检索失败时保留，开发中据此修正同义词和泛词问题。因此这是一组开发验收证据，不是独立盲测，也不能推导任意科研表达或真实模型自动选择 Skill 的准确率。候选命中不代表模型已读取或采用指令。

## Skill 元数据提示大小

使用实际 `@earendil-works/pi-coding-agent` 的 `formatSkillsForPrompt`，对比 `skillPromptEntries` 投影前后；200 项合成目录循环使用实际 9 个 Skill 的说明，位置统一为稳定的 `/skills/<name>/SKILL.md`，避免机器路径长度影响结果。

| 自动调用 Skill 数 | 原元数据块字符数 / UTF-8 字节数 | 投影后字符数 / UTF-8 字节数 |
|---|---:|---:|
| 9 | 2,458 / 3,644 | 2,458 / 3,644 |
| 200 | 52,409 / 78,783 | 0 / 0 |

字符数使用 JavaScript `string.length`。超过 20 项时停止自动注入全部 Skill 说明，保留按需检索及显式调用资源；小目录提示兼容。以上只测 SDK 的 Skill 元数据块，不是整个系统提示、工具 schema、会话上下文、token、费用或速度测量。

## 固定集之外的措辞限制

另对 12 条补充措辞做了本地探针；它们不计入上述冻结集，也不改写其分母。概念/混合行动边界修复和说明更新后复查：9 条行动请求有 7 条 hit@3，3 条概念负例均零候选。两个仍未命中的表达是：

- `Conduct a scoping review and build an evidence table`：预期 `literature-review`，实际零候选。
- `Check whether measurements are independent and avoid pseudoreplication`：预期 `scientific-review`，实际零候选。

这反映有限词汇映射仍会漏掉未覆盖的专业释义。先前暴露的 `给我讲讲EDA这个术语`、`可以聊聊绘图是什么吗` 误命中，以及 `Define reproducibility; next, help me edit my analysis script` 被概念守卫误过滤，在本次复查中已分别返回零候选、零候选和可接受候选；这几条修复后的复查也不是独立盲测。一般性意图理解、复杂否定、多步任务和真实模型是否主动检索仍未由本报告验证。

## 文档与刷新能力核对

已修订 `skills/writing-skills/SKILL.md`：检索字段为名称、说明与包内/个人标签；技能页的「刷新技能清单」只重读页面，已打开的原生会话空闲时可用「刷新当前会话技能」更新下一轮，无需新对话。实际依据为 `src/ui/skills.tsx`、`src/ui/App.tsx`、`src/session/manager.ts` 和 `src/runtime/native.ts`。外部 ACP 运行时当前未实现 `refreshSkills`，外部 agent 自有技能/提示按自身流程刷新，不能把 DAWN 页面的刷新当作外部会话已更新。

全局目录写入说明已按 `src/policy/permissions.ts` 更正：原生工具对工作区外写入根据权限档允许、询问或拒绝，硬拒不被档位覆盖；外部运行时可能更严格。文档要求遵守实际权限返回，禁止换工具、Shell 或链接绕过拒绝。本次没有修改用户技能目录、权限、凭据、安装应用或部署环境。
