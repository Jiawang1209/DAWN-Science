# 路线坞分层导航实施计划

> 已被用户后续批准的 `2026-10-18-route-map-current-step.md` 替代。此处仅保留先前方案背景；导航隔离、共享预览等工作已复用于新方案，未采用单独总览页作为最终主视图。

> **For agentic workers:** 使用 superpowers:executing-plans 在当前会话逐项执行。用户已批准设计和实现，沿用 codex/analysis-route；不委派、不合并、不推送、不替换安装版。

**Goal:** 保持左侧项目、中间对话、右侧坞三栏，路线标签内部按总览、步骤详情、文件预览切换。

**Architecture:** 后端路线、动作与文件契约不变；拆出步骤内容组件，增加渲染进程内按会话/连接/目录/routeId 隔离的导航缓存。复用 FilePreview，文件只在所属步骤显示，关闭回到该步骤。重新打开坞恢复浏览位置，应用重启仍由现有路线簿恢复业务状态。

**Tech Stack:** React、TypeScript、nanostores、现有 DAWN CSS tokens、Vitest / Testing Library、Playwright / Electron。

## 任务与验证

- [ ] 1. 新增 `tests/ui/analysis-route-navigation.test.tsx`：默认总览、逐层进入/返回、多格式文件、关闭重挂保留位置、会话/目录/路线隔离、删除步骤/文件与异步晚返回。先运行观察失败，再实现。
- [ ] 2. 新增 `src/ui/state/route-navigation.ts`：导航仅缓存 UI 状态，最多保留 50 个作用域，不缓存文件内容、不调用模型；`App.tsx` 显式传完整 scopeKey。
- [ ] 3. 改 `src/ui/analysis-route.tsx` 并拆出 `src/ui/analysis-route-step.tsx`：总览每步一行；详情分本步产物/任务说明/运行记录，动作与阻塞守卫保留；文件页复用预览、固定返回入口、保留历史提示和读取失败重试。
- [ ] 4. 改 `src/ui/styles.css` 与 `src/ui/i18n/en.ts`：沿用产品主题，280px 窄坞换行、状态/交付/运行事实分别表达；更新原有 UI 与设计契约测试，保留全部业务断言。
- [ ] 5. 更新 `e2e/analysis-route.spec.ts`：真实 Electron 经 IPC 建路线、动作、交付、分层浏览与真正重启；新增输入草稿/布局不变及关闭坞重开用例。运行定向 Vitest、typecheck、build、相关 Electron 和完整 Vitest。
- [ ] 6. 使用 playwright-interactive 技能打开隔离的实际 Electron 预览，复用上次合成案例文件但不重跑科研分析；验收总览、详情、Markdown/图/表/脚本预览、返回/关闭、历史、明暗与窄坞。截图和 QA 记录保存在独立预览目录。
- [ ] 7. 更新 `docs/DEVELOPMENT_HISTORY.md` 与验证记录，检查 diff 与本地主分支边界；留在当前分支提供可见预览。

## QA 判据

总览不堆详情；步骤本地浏览不发模型请求；继续/选参考等仍走原动作入口；预览文件名在内容上方；关闭/阅读还原回到正确父层；切换坞不丢位置或对话草稿；新会话/不同目录不继承位置；历史不借当前事实且无执行动作；缺失文件可见重试、晚返回不串文件；右坞 280/480px、中英/明暗无横向溢出。应用重启业务记录恢复，浏览位置不承诺跨应用重启。
