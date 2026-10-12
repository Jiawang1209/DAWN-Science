# 预览收起 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 图片与脚本的共享 × 收起入口，保留目录状态与既有功能。

**Architecture:** App 持有仅影响文件预览的开关，openFile 显式打开；FilesView 隐藏预览并让原目录占用空出的空间，保持同一 DOM 与分栏偏好。FilePreview/VisualFilePreview 共用收起按钮，产物回调返回清单。只读 UI，不新增协议或依赖。

**Tech Stack:** React、现有 Button/关闭图标/主题令牌、Vitest、Electron Playwright。

### Task 1: 组件与状态

Files: src/ui/App.tsx、files.tsx、visual-file-preview.tsx、artifacts.tsx、styles.css、i18n/en.ts；允许新增共享 preview-close-button.tsx。

- [x] 先加图片/脚本共享按钮、展开时收起、目录 DOM 保留及产物回清单的失败用例，运行相关 Vitest 验证 RED。
- [x] App 为文件预览增加开关：`const [filePreviewOpen, setFilePreviewOpen] = useState(true)`；`openFile` 中 `setFilePreviewOpen(true)`；关闭只设 false，保留 path/content，身份切换按原恢复逻辑重新开启。传到 FilesView。
- [x] FilesView 新增 `previewOpen=true` / `onClosePreview?`，关闭时将 grid 改为 where/note/tree/xfer 单列，隐藏预览及分栏拖动把手。目录 DOM、选中与滚动保留；阅读展开退出。再次 openFile 打开。
- [x] 共享关闭按钮使用 ghost/icon Button + 既有关闭 SVG，只显示 ×，名称/提示双语化，不使用原生 title；脚本头及图片动作栏末端添加。产物回调 `设看的(undefined)`，阅读状态随之退出。键盘收起后焦点回可见导航。
- [x] 聚焦用例转绿，类型检查通过；不改原放大/下载/删除/定位/返回及脚本边框。

### Task 2: 桌面与交付

Files: e2e/preview-collapse.spec.ts、docs/DESIGN.md、docs/DEVELOPMENT_HISTORY.md 与本计划。

- [x] 新 Electron 回归先在旧 dist 复现 × 缺失；真实图片和脚本均检查点击/键盘收起、树 DOM/展开/滚动保留、重新打开同一文件、产物收起回清单、消息/定位再打开。
- [x] 全部 UI 测试、typecheck、build；Electron 新用例与 script-preview/script-reading/panel-preview-layout/visual-file-preview/artifacts/visual 原流程通过，审阅截图，不改视觉容差。
- [x] 先规格审查再质量审查，修复实际问题；更新历史与证据，留在当前分支供查看，不提交合并。


## 验证记录（2026-10-12）

- 新组件 7 项先因缺少 × 而 RED；目录靠底普通/展开两项补回归，使新增组件用例为 9 项。全部 UI 127 文件、1327 项通过（24.92 秒），类型检查及构建通过。
- 真实 Electron 在旧构建确认缺入口；关闭后新滚动回跳（旧值 90/新值 200）、靠底关闭夹限（889.5 → 406.5）均先 RED，再修复。隐藏树 getter 为 0 的浏览器行为和聚焦防跳一起验证。
- 最终桌面覆盖图片解码/放大/模态 Esc、文件及产物收起、同文件重开、消息产物定位重开、选中/展开/目录 DOM/滚动/分栏恢复，以及原长脚本/预览布局/产物流程和亮暗视觉基线。实际新截图保留在 `tmp/preview-collapse-verification/`。
- 规格复审与代码质量复审均通过，质量审查发现的目录靠底夹限已修复。最终 Electron 批次 31 项中 30 项通过，含全部 3 项新增回归；暗色命令面板有 1652 像素阴影差异。前一批暗色设置栏也曾出现 467 像素输入框边缘差异；已审阅差异图，本轮没有修改对应样式。使用同一构建，对这两个界面分别连续复测 3 次，6 项全部通过（10.9 秒）。记录为间歇视觉差异，具体渲染原因尚未确定，不宣称原 31 项同批全绿；未更新基线、容差或 mask。初次失败截图、trace 与批次日志保存在 `tmp/preview-collapse-verification/visual-failure/` 和 `electron-31-initial.log`，复测日志为 `visual-recheck.log`。
- 中英文可访问名称与自定义提示齐全；遵守已有 i18n 双引号扫描与按钮名称无子串冲突契约，未修改扫描或容差。
- 隔离分支 `codex/script-reading`，未提交、合并、推送或替换安装版，main 保持 `4cd67229`。


## 用户批准的最终集成（2026-10-12）

- [x] 最终文件行保留修改时间和大小；选择名主题色、共享收起、阅读和细外框效果获用户确认。
- [x] 全量 4282 项单测通过、10 项跳过；类型检查与完整构建通过。46 项独立桌面用例分批验证通过；修正测量容器后文件面板 14 项全部通过，未放宽视觉容差。
- [x] 只读审查无阻塞发现，按用户授权本地提交并快进集成 main；保留隔离预览，不推送、不替换安装版。
