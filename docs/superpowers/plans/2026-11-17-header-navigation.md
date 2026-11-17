# 顶栏导航实现计划

> 按 superpowers:executing-plans 在当前会话执行。设计及效果已获用户确认。

**Goal:** 将已确认的紧凑居中导航、侧栏分界和功能提示接入正式组件。
**Architecture:** React Topbar 负责委托事件和 portal 提示；原 Button、HomeButton、SessionTabs 与 DockSwitch 提供提示文案。侧栏状态和 CSS 初值保持一致，不改后端协议或导航状态机。
**Tech Stack:** React、TypeScript、语义 CSS 令牌、Vitest、Playwright Electron。

- [x] 先在 HomeButton 与侧栏宽度测试中记录新要求，运行 `npm test -- tests/ui/header-navigation.test.tsx tests/ui/sidebar-width.test.ts`，确认旧实现不满足纯图标入口与300px下限。
- [x] 为 Topbar 写鼠标延迟、键盘、Escape、滚动、取消计时器和卸载回归测试；实现没有布局包装的委托提示及portal。
- [x] 在 App 内移动 HomeButton 到 brand-stack 左侧；给本行控件传入翻译后的 data-tooltip。保留原有按钮可及名和回调。
- [x] 顶栏三颗图标统一32×32px、居中；导航宽为侧栏宽减左侧16px内距，右侧12px内距；侧栏/导航边线共用颜色。最小及初始宽度300px，折叠后保持控件原位并隐藏分界线，窄窗导航用内容宽。
- [x] 更新受300px下限及返回首页命名影响的既有断言。增加Electron用例，测量图标中心、Logo间距、分界线、拖宽、折叠恢复、提示与草稿恢复。
- [x] 运行相关UI测试、typecheck、build、Electron首页/页签/侧栏回归；查看实际截图。运行secret guard与diff检查，记录验证报告，留在功能分支。

实现参考：返回按钮 `variant="ghost" size="icon" className="home-button" aria-label={t("首页")}`；提示入口为 `data-tooltip={t("返回首页")}`；侧栏边界以 `.topbar-navigation.getBoundingClientRect().right === .sidebar.getBoundingClientRect().right` 验证；居中以SVG和按钮中心差小于0.5px验证。
