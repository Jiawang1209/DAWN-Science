# 设置分类侧滑详情实施计划

**Goal:** 保留各设置内容原样，为右栏分类进退和整页分类切换提供轻量动效及实际预览。
**Architecture:** 新use-settings-transition.ts封装Web Animations取消和减少动态效果处理；SettingsColumn原滚动容器参与动画并在外层裁切位移，用户导航恢复焦点/列表滚动；SettingsShell现有右内容容器使用淡入，保留原节点与内容。
**Tech Stack:** React、TypeScript、Web Animations、原CSS令牌、Vitest、Playwright Electron。

- [x] 新组件回归先在旧代码观察失败：原位详情立即出现、进退动效、减少动态效果、快速切换及同分类草稿。
- [x] 新hook与两处接入，只加列内视口容器；不修改AppearancePanel或其他分类内容。
- [x] 相关单测、类型、构建、真实Electron设置回归与减少动态效果验证。
- [x] 打开本分支隔离预览，检查亮暗/宽窄及中间帧，保留截图/动效证据。
- [x] 补视觉契约、开发记录及核验报告；不提交、合并、推送。

- [x] 按反馈将整个设置外壳改为圆角四边框；验证亮暗、列表/关于、拖宽、展开收回并原位刷新预览CSS。

- [x] 按反馈统一面板与设置的默认背景；相关125项、背景Electron4项及独立亮暗/自定义隔离核验通过，原位刷新预览CSS。
