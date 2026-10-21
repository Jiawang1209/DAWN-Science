# 内核设置预览实施计划

**Goal:** Python/R各一组配置，统一检测候选及手动路径，打开实际Electron预览。
**Architecture:** Settings.tsx只编排两组；interpreter-picker.tsx增加setting布局复用候选展示，默认布局维持首启和远端行为。CSS仅作用新布局。
**Tech Stack:** React、TypeScript、CSS语义令牌、Vitest、Playwright Electron。

- [x] 在tests/ui/kernel-settings.test.tsx补候选只填草稿、手填保存及无检测回退，观察旧实现失败。
- [x] 给InterpreterPicker新增setting布局，Settings移除重复InterpreterField；补英文、响应式样式。
- [x] 运行新用例及原选择器、设置、i18n、设计契约，执行typecheck与build。
- [x] 真实Electron使用独立配置验证宽窄/亮暗与保存；组件回归验证检测失败；留截图并打开预览。
- [x] 补开发历史与核验记录；预览阶段不提交、合并、推送。
- [x] 用户确认实际预览，授权复核后提交并合并本地main，仍不推送。
- [x] 合并前全量测试、类型、构建与设置相关Electron回归。
- [ ] 本地提交、快进合并及main集成核验。
