# 上传体验实施计划

按已选择的整体方案使用 executing-plans 在当前会话实施，不委派子 agent。规格：`../specs/2026-10-21-upload-experience-design.md`。

**Goal:** 在现有文件面板统一上传入口、确认与批次进度。
**Architecture:** 上传确认组件仅负责说明；App 捕获目标并提交；TransferBatches 拥有文件与目录任务，面板按后端状态显示。
**Tech Stack:** TypeScript、React、Zod、SFTP、Vitest、Electron/Playwright。

- [x] 基线：`npm test -- tests/remote/transfer-batches.test.ts tests/ui/transfer-batches.test.tsx tests/workbench/directory-transfer.test.ts`。
- [x] 先写失败测试：选中文件不套目录、同名冲突/源保留、异常过滤跨页；服务最小扩展 `startFiles({connectionId,sources,targetParent})` 与可选明细状态筛选。
- [x] 新增协议 `startFileUploadBatch`，保留既有六操作；所有操作枚举/mock后端夹具同次更新。协议8.22。
- [x] 先写UI测试：来源/目标确认与取消、主按钮非危险色；摘要文件完成计数和百分比、每项紧凑、异常筛选。
- [x] 新建 `src/ui/transfer-confirmation.tsx`，沿用 ConfirmDialog；App 的文件/文件夹/拖入文件入口冻结同一目标，均提交批次，删除旧上传UI队列，旧单文件下载保留。
- [x] 调整 `file-upload-menu.tsx`、`transfer-batches.tsx`、`files.tsx`、主题令牌样式与i18n；不建立新的常驻大面板。
- [x] 跑类型检查、核心/协议/界面测试和完整构建；更新 Electron 用例点击路径，保留磁盘字节、同名保护与记账断言；检查亮暗、窄窗、隐藏继续和确认取消。
- [x] 自行复核生命周期、目标身份、错误筛选与键盘；更新唯一开发历史及验收记录，实际 Electron 留窗供用户验收，不合并推送。

结果：见 `../../reviews/2026-10-21-upload-experience-verification.md`。用户追加的总体/逐文件进度条已实现，实际中间百分比与完成状态通过Electron验证；未合并推送。

## 已批准的底部布局追加实施

继续使用executing-plans自行执行，保留现有工作树和未提交改动，不委派、不合并。

- [x] 在 `e2e/upload-experience.spec.ts` 增加真实几何检查：`tree.bottom <= preview.top`、`preview.bottom <= transfers.top`、`abs(transfers.bottom - panel.bottom) <= 1`、`transfers.height <= panel.height / 3 + 1`；无任务时高度为0，展开后明细内部滚动；先运行现有dist并确认失败。
- [x] 在 `src/ui/files.tsx` 调整普通模式行定义为 `auto auto ${显示树高}px minmax(0, 1fr) auto`，DOM中预览先于传输；ResizeObserver计入传输包装层，并以面板实际高度写入CSS变量；在 `src/ui/styles.css` 统一底部布局、三分之一上限与内部滚动，保持加宽/关闭预览/展开阅读的既有网格。窄矮窗再按工具栏后余量约束上限，预留32px明细，剩余空间不足时临时压缩目录而不保存偏好。
- [x] 固定UI构建后运行 `npx playwright test e2e/upload-experience.spec.ts e2e/directory-transfer.spec.ts e2e/panel-preview-layout.spec.ts e2e/preview-collapse.spec.ts e2e/script-reading.spec.ts`，最终11/11通过；检查宽窄、缩窗、无任务、展开阅读/收起预览以及既有目录往返；相关UI单测155项、类型检查及diff检查通过。
- [x] 刷新同一实际Electron演示预览，选中说明文件，使文件树、内容与底部传输同屏；分别检查收起/展开与暗色窄窗，保存截图，更新唯一开发历史和验收记录，留窗等待用户验收。

## 用户追加授权的本地集成

用户确认预览后授权再次核对、提交并合并main，明确先不推送。此前的「不合并」是预览阶段边界，本轮按最新授权执行。

- [x] 自行源码复核上传确认的目标身份、文件批次源/目标、同名保护、取消与重传、持久化、底部布局与异常过滤。修正根目录`/`被误判为`//`，新增先红后绿的服务回归与实际Electron协议验收；服务/后端/协议64项通过。
- [x] 修正后全量449文件4887项通过、10项跳过，类型检查与完整构建通过；日志见验收记录。
- [x] 固定构建并隔离旁观预览后完成相关Electron及默认亮暗视觉复验，53/53通过；只排除已在原始基线确认失败的四项旧用例，不更新截图或放宽断言。
- [x] 功能及验收证据提交`f669d1f8`，主工作区干净时从`ac3a4160`快进合并main；main重新完整构建、关键68项及真实Electron3项通过，补录实际集成结果并重开main隔离预览，不推送。
