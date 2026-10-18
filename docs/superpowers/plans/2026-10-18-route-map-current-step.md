# 路线图与当前步骤实施计划

> 使用 superpowers:executing-plans 与 test-driven-development，在 codex/analysis-route 继续；用户已批准本设计与实现。替代同日“总览→详情→文件”的主视图方案，复用已有导航隔离和预览工作，不合并、不推送、不替换安装版，不委派。

**Goal:** 三栏布局不变，路线坞上方始终保留依赖图及真实处理位置，下方展示所选步骤动态、产物或文件预览。

**Architecture:** 路线簿和动作协议不变；图的连线来自 dependencies，沿用团队按依赖分层的布局思想。当前处理步骤只关联忙碌会话最后一条结构化 continue 意图，普通查看/检索/点击不冒充执行。路线记录的进度和应用观察到的运行事实分开，未关联到活动回合的 in_progress 明示为记录状态。历史选择与刷新藏在“路线选项/调整记录”，历史只读和文件事实边界保持。

**Tech Stack:** React / TypeScript、nanostores、既有产品 tokens 与图标、Vitest、真实 Electron / Playwright。

## 执行清单

- [x] 1. 补 `tests/ui/analysis-route-map.test.tsx`：图常驻、选中不改变活动位置、历史入口默认隐藏、依赖而非编号连线、真实活动意图边界；运行确认 RED。
- [x] 2. 新增 `src/ui/route-map-model.ts`、`analysis-route-map.tsx`：稳定依赖层、适配窄坞/并行分支、图例、当前/下一步摘要、回到当前步骤。节点名称优先，ID 仅作索引。
- [x] 3. 改 `analysis-route.tsx`、`state/route-navigation.ts`、`App.tsx`：默认选当前或下一步，显式浏览固定选中；图/详情/预览并存，关闭返回本步，菜单保留历史；作用域、晚返回、恢复与主对话草稿守卫不变。
- [x] 4. 改 `analysis-route-step.tsx`：两页签“执行动态/本步产物”，输入/参考折叠在下方；复用真实执行说明、工具事实、审查记录，不造时间或 Bot 对话；原有单步动作、案例、阻塞不删。
- [x] 5. 样式/i18n/原有测试同步；修复路线 PDF 适配时画布高度收缩问题。定向测试、typecheck、build、真实路线/坞 Electron 回归与全量 Vitest。
- [x] 6. 独立 Electron 实看与探索：进行中、等待处理、全部交付；切节点不换运行位置，文件打开时图可见，Markdown/CSV/R/PNG/PDF，阅读还原、缺失重试、历史、关闭重开、280/480px 明暗/中英、长标题与分支。
- [x] 7. 更新唯一开发历史与验收记录；留当前分支和可见预览，说明工程 mock 与科研实算的边界。

## QA 与完成判据

功能和视觉共同覆盖上述六类状态及关键按钮；模拟控件不进入生产 UI。图状态以结构化记录/活动意图为准；点击浏览不发模型，select/skip/restore 原有请求计数不变。文件名在内容上方，预览关闭可回到本步且焦点可用；每张截图对应具体状态，文档记录现有产物未登记 PDF 的事实和 QA 副本补登记范围。科学复算和原案例不重跑，用户正在查看的旧预览不关闭、不覆盖草稿。

验收记录：`docs/reviews/2026-10-18-route-map-current-step-verification.md`。图内超长路线滚动；最终可见案例保持原 11 项登记文件。
