# 产物极简流程实施计划

> 按 executing-plans 在当前独立工作树顺序执行，使用 test-driven-development；不启动子 agent，不提交、合并或推送。用户已批准设计方向并要求实现后启动预览，不重复请求流程确认。

**Goal:** 用户无需进入管理页或填表，即可在预览中保留满意结果，再从历史直接读旧副本。

**Architecture:** 保留现有 ArtifactStore/Retention 与协议，分离预览控制、折叠来源和留存历史。ArtifactsPanel 注入预览操作；AnalysisDeliveryPanel 默认退为简洁文件页，交付经次级菜单进入。

**Tech Stack:** 现有 React/TypeScript、Vitest、Electron/Playwright，无新增依赖。

## 1. 明确用户行为回归

文件：`tests/ui/artifact-history.test.tsx`、`tests/ui/analysis-delivery.test.tsx`、`e2e/artifact-retention.spec.ts`。

- [x] 用 `screen.queryByRole('textbox', {name:'留存名称'})` 验证默认无表单；单击 `保留当前结果`，断言 retainArtifactResults 使用选定 observationId/sha256 且自动名字非空。
- [x] 模拟 history/list/readRetained，断言历史只列组和文件，打开直接展示旧表格；详细字段先不挂载，点击后才出现。
- [x] 增加路径/会话迟到响应、复制失败不调用后补捕获、未支持/只读不提供写入的回归。
- [x] 运行 `npx vitest run tests/ui/artifact-history.test.tsx tests/ui/analysis-delivery.test.tsx`，确认新流程断言先失败。

## 2. 实现预览、来源与历史

文件：`src/ui/artifact-history.tsx`、新 `src/ui/artifact-source.tsx`、`src/ui/artifacts.tsx`、`src/ui/analysis-delivery.tsx`、`src/ui/styles.css`、`src/ui/i18n/en.ts`。

- [x] `ArtifactResultControls`：加载当前最新输出观察/来源；主按钮直接 `retainArtifactResults({members:[{observationId,sha256}],name:自动名})`；无哈希的当前记录使用 captureAndRetainCurrent，历史未知记录不可假装恢复。保存失败不自动改用当前内容。
- [x] 所有异步结果按 session/path/client 生命周期令牌守卫；保存中的 requestId 使用 ref 防重入，作用域变化不将旧状态带入。
- [x] `ArtifactSourceDetails`：代码、输入、环境、日志、Run/哈希及缺口按需展开，已保存成员使用冻结来源。
- [x] `ArtifactHistoryPanel`：只查询已留存组；点击成员调用 readRetainedArtifact，以 FilePreview 显示；高级操作里保留删除确认和版本交付引用。
- [x] 用 `renderPreviewActions(path)` 给 ArtifactsPanel 注入操作，不替换当前文件预览。默认父面板只展示结果/历史/更多操作；整理/交付记录收进更多操作。
- [x] 运行相关 UI、设计、i18n 与类型检查；修正翻译孤儿及真实可访问名称冲突，不放宽契约。

## 3. 实机回归与交还预览

文件：上述 Electron 用例、相关交付 E2E 入口、使用说明/验收记录/开发历史。

- [x] 新 Electron 场景直接在文件预览点保留，覆盖工作区后从历史打开原字节；详细来源不要求先打开。补英文或窄面板操作验证。
- [x] 原交付用例经“更多操作”进入；运行 `npm run typecheck`、`npm test`、`npm run build` 和产物/交付/预览/14 张原视觉基线。
- [x] 保存现有体验 profile 的 SQLite 在线备份及文件身份；仅重开本聊天启动的预览进程，使用原 profile，不清空资料。
- [x] 检查结果、保留、历史三态截图；更新使用说明和验收记录，保留分支供用户体验，不合并或推送。

2026-10-28：三步完成。最终相关 139 项、完整 5619 项/10 原有跳过、类型与构建、新 Electron 4/4 和原回归 30/30 通过；预览沿用原资料重开。详情见 [验收记录](../../reviews/2026-10-28-artifact-simple-flow-verification.md)。
