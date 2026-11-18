# 新建项目弹窗实现计划

> 按superpowers:executing-plans在本会话逐项执行，用户已确认设计并授权实施。

**Goal:** 接入简洁新建项目弹窗及科研目录选择/预览/创建流程。
**Architecture:** 保留ProjectDialog和createProject边界；UI读取现有纯数据目录常量并进行分组展示，仅提交scienceLayout。后端协议兼容，原生文件夹选择器及App首页路由继续复用。
**Tech Stack:** React、TypeScript、CSS语义令牌、Vitest、Playwright Electron。

- [x] 基线：project-dialog及project/create测试通过。
- [x] 修改组件测试为新按钮/标签；新增预览等于共享常量、不提前创建、折叠保留选择、取消不创建科研目录、无上下文输入/提交等断言；运行确认旧实现失败。
- [x] ProjectDialog：移除agentContext状态/输入/请求字段；保存位置、选择文件夹、目标路径提示；useId关联预览与aria-expanded；首次选择、折叠、取消选择按设计执行。
- [x] 样式：沿用570px宽弹窗、现有Button/Field；预览分组布局及用途说明，暗色/窄窗适配；移除旧checkbox及details专属样式；补英文翻译。
- [x] 更新project-create Electron用例：普通/科研创建、全目录一致、不提前写盘、失败保留状态、首条对话目录、显示说明不进入约定、返回首页及窄窗焦点恢复。
- [x] 运行组件/项目创建测试、设计扫描/i18n、typecheck/build；真实Electron项目/首页回归，检查亮暗/窄窗截图；secret guard及diff检查后本地提交并保留分支。
