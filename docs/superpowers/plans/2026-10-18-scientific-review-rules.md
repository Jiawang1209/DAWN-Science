# 科研审查规则统一实施计划

> **For agentic workers:** 使用 superpowers:executing-plans 在当前会话逐项实施；实现由当前会话完成。仅按 writing-skills 做压力演练、按 requesting-code-review 做独立只读复审。用户已批准设计范围及实施，保留独立分支，不合并/推送/替换安装版。

**Goal:** 一份共用科研审查规范、重点角色同步及可复核的定向验收。

**Architecture:** 复用既有技能 loader、三级覆盖和父侧资源读取。入口＋技能目录内参考，调用方保留短底线及按名称查找指引；无运行时或 UI 改动。

**Tech Stack:** Markdown、TypeScript/Vitest、pi loader、ResourceHost、Electron/Playwright。

## Task 1：基线与设计

- [x] 独立 codex/scientific-review-rules 工作树，基线 `67d8ed30`；复用已安装依赖、不安装新包。运行 `npm run build`、`npm test`，日志 `tmp/scientific-review/baseline-*`。
- [x] 保存获准设计与本计划，独立只读 Agent 对旧内容做六个压力场景，保留真实回答，不捏造失败。

## Task 2：先验契约

Files: `tests/skills/scientific-review.test.ts`、`e2e/skills.spec.ts`。

- [x] 新增 loader 实测：`loadSkills({cwd: root, agentDir: root, includeDefaults: false, skillPaths: [root]})` 返回 scientific-review，`formatSkillsForPrompt` 有科研审查描述且无正文。
- [x] 新增资源实测：`createResourceHost({workspace, roots: [{path: skills, scope: 'builtin'}]})` 查询 scientific-review，按实际 ID 分页读入口及两份参考，核对完整内容；三层实际目录同名覆盖、builtinMode manual/off 和越界读取拒绝。
- [x] 对角色/技能加少量有意义内容合同：禁止旧的当前内核重启/逐字节唯一标准/可复现总分；重点调用方含名称指引和权限/证据底线。角色 loader 验原 tools 未增加。
- [x] `npx vitest run tests/skills/scientific-review.test.ts > tmp/scientific-review/red.log 2>&1`，检查缺少资源及旧冲突引起的预期失败。
- [x] 给现有技能 Electron 文件新增显式 `/skill:scientific-review` 和技能目录显示断言，构建基线运行该测试确认正文尚不存在；不修改共享 mock 推理逻辑。

## Task 3：共用内容与同步

Files: 新建 `skills/scientific-review/SKILL.md`、`references/checklist.md`、`references/reporting.md`；修改 `skills/{reproducible-analysis,analysis-delivery,analyze-like-case}/SKILL.md`、`agents/{stat-consultant,reproducibility-reviewer,reviewer-two,data-auditor,methods-writer,data-cleaner}.md`。

- [x] 先实现新技能与目录内参考，按设计中的判断原则和六个场景写具体操作/报告例子，不造科学结果、不增加工具能力。
- [x] 修正旧冲突及相应报告模板/示例；只审查角色默认回复交回报告，授权与工具都满足才运行。复用已有任务信息，不强制重复问答。
- [x] 更新技能分工和按名称发现指引，未启用共用技能仍保留执行/证据底线；不改 manual/off 或同名覆盖。
- [x] 跑 `npx vitest run tests/skills tests/subagent/resources.test.ts tests/subagent/definitions.test.ts`，逐项修正真实失败，保留 green.log。
- [x] 独立 Agent 用相同六场景阅读新内容再演练；记录偏差、修正、再验证。内容规则测试与演练不冒充真实模型工具执行证明。

## Task 4：构建、验收与交付

Files: `CLAUDE.md`、`docs/DEVELOPMENT_HISTORY.md`、`docs/reviews/2026-10-18-scientific-review-rules-verification.md`。

- [x] `npm run typecheck`、`npm run build`，核对 dist/skills/scientific-review 及重点 dist/agents 与源码一致，dist 父侧服务真实分页读参考。
- [x] `npx playwright test e2e/skills.spec.ts e2e/child-resources.spec.ts` 验实际 Electron 技能发现/展开及子资源，不跑已记录的无关旧断言。
- [x] `npm test` 全量并读取完成结果；`git diff --check`，确认主工作区仍为原 HEAD/干净。
- [x] requesting-code-review 独立只读复审，修重要问题，按改动复验；更新实际验收记录、计划完成项与唯一开发历史。
- [x] 本地提交 codex/scientific-review-rules，保留工作树和证据；不合并、不推送、不替换安装版。

## Task 5：真实案例偏差修复（用户追加授权）

首轮真实案例见 `docs/reviews/2026-10-18-scientific-review-live-case.md`，该失败记录及旧模型报告原样保留。当前分支继续，只修改规则、角色和验收；不新增通用 OS 沙箱或宣称任意 shell 的写入都已受强制隔离。

- [x] 用真实失败转录定位委派漏传、固定临时目录清理、统计推断泛化；补三项内容契约，确认3失败/7通过。
- [x] writing-skills 压力场景前后对照：时间压力、便捷固定临时目录、沿用旧统计结论；保留实际回答及真实执行失败基线，不伪称文字基线失败。
- [x] 明确本次新验证根目录及全部临时/日志/转换/渲染路径、TMPDIR/TMP/TEMP、符号链接和不清理固定目录；完整传递委派约束并回收核对。
- [x] 限定自由度与置换检验结论；声明独立性待确认，按CSV解析与过滤顺序计数；报告核对完整工具转录，区别重复运行一致性与幂等。
- [x] targeted 契约、typecheck、build、全量测试、相关 Electron 检查；独立只读复审，修P2湿地示例及测试名。
- [x] 克隆只读原始演示材料到全新验收项目，以实际预览和真实模型启动首轮科研审查；不把手工修订/追问当首轮通过。独立核对保护文件、真实命令、路径、统计与运行状态；原样保留中间失败、末轮报告与另存勘误，记录真实限制。
- [x] 记录结果与仍有限制，本地提交，保留预览，不合并/推送/替换安装版。详见 `docs/reviews/2026-10-18-scientific-review-live-fixes.md`；首遍偏差、另存勘误和日志目录补测分别报告。
