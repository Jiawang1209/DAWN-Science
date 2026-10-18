# 会话级科研分析路线 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. 按顺序执行各任务，规格审查后再质量审查；主agent负责接口和最终验收。

**Goal:** 在独立分支交付可持续操作、可恢复的会话路线，维护授权和证据边界。

**Architecture:** Zod协议模型 + 会话目录原子路线簿 + 原生结构化工具/后端操作/快照事件 + 对话摘要/坞详情。复用现有案例、文件预览、租约、发送与策略门；不解析自然语言步骤建立状态。

**Tech Stack:** TypeScript、Zod、React、pi NativeRuntime、Vitest、Playwright/Electron、共享mock。

## Task 1: 路线模型与持久化

Files: 新建 src/protocol/analysis-route.ts、src/runtime/analysis-route-book.ts、tests/runtime/analysis-route-book.test.ts、tests/protocol/analysis-route.test.ts；导出src/protocol/index.ts。

- [x] 写Schema/行为失败用例：重复ID、缺依赖/环、路径越界、案例选择不属于候选、旧revision冲突、保存失败不改内存、重开恢复/历史、上游更改标记下游复核、进度与执行/核验独立。
- [x] 运行 `npx vitest run tests/protocol/analysis-route.test.ts tests/runtime/analysis-route-book.test.ts` 确认失败原因。
- [x] 实现 `AnalysisRouteBook(file)`，`read()`/`history()`/`replace(expectedRevision,draft,reason)`/`act(expectedRevision,stepId,action,selection?)`/`interrupt(reason)`；写临时文件+rename成功后才发布新快照。动作select/skip/restore；restore回pending且保留既有证据与needsReview。历史存完整快照，读取损坏报错，不静默覆盖。
- [x] 统一导出 `AnalysisRouteSchema`、`AnalysisRouteDraftSchema`、`AnalysisRoute`、`AnalysisRouteDraft`、`RouteStep`、`RouteAction`、`routeActionMessage(route,stepId,action)`；消息含routeId/revision/stepId，view/search为只读，continue明确只推进该步骤并尊重现有授权。
- [x] 测试绿、typecheck；更新唯一开发历史并本地提交；规格和质量审查。

## Task 2: 原生工具、后端与事件

Files: 新建src/tools/analysis-route.ts；修改src/runtime/native.ts/types.ts、src/session/manager.ts、src/workbench/backend.ts/events.ts、src/protocol/events.ts/operations.ts/version.ts、src/policy/plan-mode.ts、讨论策略文件、scripts/mock-inference-server.mjs及对应tests/runtime/workbench/protocol。

- [x] 接口以Task1实际导出为准；测试工具注册和受控元数据策略、无路线路径、CAS错误、native支持范围、租约/忙碌限制、切换隔离、tool结果到事件、真实重启恢复。
- [x] 原生工具 `get_analysis_route` 读取、`update_analysis_route` 提交完整draft+expectedRevision；返回可读错误，不自动terminate或运行。启动恢复路线，运行状态中断转blocked，回退标复核；历史不得复活已回退的自动执行。route进度与工具证据分别维护。
- [x] SessionUpdate增加analysisRoute快照及analysis_route运行时事件，主侧订阅/恢复/空快照一致；协议minor递增。后端getAnalysisRoute支持只读历史；actOnAnalysisRoute严格request/response Schema，select/skip/restore只改元数据，view/search/continue返回明确转录消息，由UI原有发送路径传递。忙碌/不可写/不支持不开始动作。
- [x] 新操作同一改动补共享mock，MLAI候选必须来自实际结果，交付文件引用受路径守卫及实际证据核对；无法核实显式标注。修改科研分析向导说明何时建路线、每步更新及授权界限，保持关闭/手动技能边界。
- [x] 定向测试、typecheck/build绿；开发历史和协议文档；本地提交后规格/质量审查。

## Task 3: 路线摘要与坞操作

Files: 新建src/ui/analysis-route.tsx及UI测试；修改src/ui/App.tsx/views.tsx/state/right-dock.ts/styles.css/i18n/en.ts、必要case-cards-view.tsx扩展；tests/ui/design-contract.test.ts、共享mock及e2e/analysis-route.spec.ts。

- [x] 先覆盖无路线、步骤展开、view/search只读消息、select不执行、skip/restore、阻塞/忙碌、冲突刷新、切会话竞态、核验状态分离和产物打开。
- [x] 对话紧凑摘要展示标题/已交付数/当前阻塞，点击开路线坞；无路线给明确创建入口（发送只规划意图，不执行）。详情单列步骤，当前选中展开；复用tokens和图标、按钮、反馈，不加固定全屏面板。案例标题/详情与选择分开，选参考不自动执行。路径沿用文件预览，显示不存在/未知；历史版本只读可查看。
- [x] route房客进入全部房客和自适应更多菜单，中文/英文完整。现有普通案例、方案、子Agent预览继续可用。根据当前会话所有者隔离状态和请求，晚返回不得覆盖新会话。
- [x] 构建后Electron验证完整mock路线与真实文件、失败和重启；实际隔离预览亮暗/窄坞/键盘/长步骤。将用户可见要求映射到截图和功能检查，不修改用户项目或旧预览草稿。
- [x] 全量Vitest、typecheck/build、相关Electron、diff检查。记录每次真实模型演示的输入、调用/产物、限制；不把mock当科研判断质量验收。只读规格与质量复核通过后本地提交，保留独立分支、main=fecaaad4。
