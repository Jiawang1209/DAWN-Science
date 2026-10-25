# 多篇论文精读与对照实施计划

> 执行：使用 executing-plans 在当前会话逐项推进；用户未要求委派，不启动子 agent。

**Goal:** 内置文献调研技能让已有工具组成带页码证据的多篇论文比较流程。

**Architecture:** 技能正文提供入口与边界，references/comparison.md 提供字段与交付格式；原技能发现、覆盖、权限和 Office 工具保持。共享模型 mock 只用于确定性工程验收。

**Tech Stack:** Markdown Agent Skills、TypeScript/Vitest、现有 PDF/Excel 工具、Playwright/Electron；无新增依赖。

## 1. 基线与合同

- [x] 从 main 2f804fbf 建 codex/literature-comparison 独立工作树，复用现有 node_modules。
- [x] `npx vitest run tests/skills tests/runtime/skills-接线.test.ts tests/tools/office.test.ts`：54 通过。
- [x] 新建 tests/skills/literature-review.test.ts，真实 loader 需发现 `literature-review`、默认 model、描述包含文献调研/对照；所有 references 在技能目录内可读取；缺技能时先观察失败。
- [x] 新建 skills/literature-review/SKILL.md 与 references/comparison.md；同场景重跑，验证资源按需读取和既有 manual/off 边界。

## 2. 工程场景

- [x] 新建 scripts/mock-literature-review.mjs，只有当前用户输入“文献对照验收”才触发；依次 pdf_read 三份合成材料，用实际文本的物理页码和短摘构造表格，xlsx_write/edit/read 与 write 生成、读回。失败停止，工具缺失不绕行，讨论不写入。
- [x] 新建 tests/integration/mock-literature-review.test.ts，先验缺失模块失败，再验证历史关键词不触发、失败停止、缺工具与实际返回证据。
- [x] 在 scripts/mock-inference-server.mjs 引用同一场景，dev:mock 和 Electron 共用。
- [x] 新建 e2e/literature-review.spec.ts：真实合成 PDF、扫描/空白 PDF，实际工作簿三表、页码/摘录、未提供、原输入哈希、关闭 PDF 与只讨论零写入；另核对技能设置可见和显式正文抵达模型。

## 3. 文档与验证

- [x] 修复接入时发现的显式技能正文误判：src/skills/request.ts 提取 pi 包裹后的用户请求，原讨论/内核策略复用；权限与内核快捷入口回归先红后绿。
- [x] 修复实际双页 PDF 接入失败：原 pdf_read 传入独立 Uint8Array，仍使用既有解析器；真实双页正文和页码已通过单测及 Electron 导出。

- [x] 新建 docs/文献调研-怎么用.md；CLAUDE.md 入口、agents/literature-reviewer.md 的按需技能提示，不扩大该角色工具权限。
- [ ] 执行相关 Vitest、完整测试、typecheck、build；构建完成后运行文献调研、技能、Office、两文献插件及原视觉 Electron。
- [ ] 使用固定本地预览启动脚本切换到本工作树，保留原配置/凭证/会话；检查设置可见、说明可读、无水平溢出并截图。
- [ ] 手工审查规格覆盖、diff、未引入参考产品标记及依赖变化；记录实际验证范围，不把 mock 称为真实模型质量验证。
- [ ] 提交实现，仅快进合并本地 main，主目录重跑相关测试/类型/构建与关键 Electron，记录结果，未推送。
