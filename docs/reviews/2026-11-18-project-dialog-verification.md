# 新建项目弹窗与科研目录验证

日期：2026-11-18。基线main `6c5a2b7e`；独立分支 `codex/project-dialog-science-folders`。

## 已实现

- 新建表单移除Agent Context输入和自定义agentContext请求字段，清理对应孤立翻译。项目设置也不再显示该提示；原协议可选字段保留兼容，已有项目及标准科研布局自动约定文件不改。
- 保存位置复用原生文件夹选择器，名称和位置实时生成最终路径预览。
- “初始化科研目录”首次点击选中并展开；“已选择科研目录”可以收起/重开，选择持续保留；“取消添加”清除选择并归还焦点。
- data/analysis/figures/results/literature预览直接读取policy/science-layout.ts的9个叶子目录，与新建项目和坞内初始化共用唯一清单。
- 科研按钮只设置本次创建选项，不提前写文件。确认创建才调用原createProject，保持独占新目录、重复目录拒绝、失败回滚、说明仅展示的既有约束。
- 创建成功进入原工作台流程，首条会话使用新项目工作目录。普通项目为空目录；取消不产生项目目录。
- 窗口使用原Button/Field/主题令牌；普通窗口完整展示科研目录，窄窗内容滚动且错误及底部操作独立可见。

## 验证

- 基线组件/磁盘创建：26通过。
- 先更新需求测试并确认旧版失败（5失败、1通过），再实现；核心组件、磁盘创建、设计扫描、i18n：139通过。
- 全UI：244文件、2359测试通过。
- `npm run typecheck`、`npm run build`、`npm run security:check`通过。
- 实际Electron：project-create、app-home、science-layout，9通过、无跳过。验证原生选择器接线、预览目录与实际9个目录一致、未确认/取消不写盘、取消科研选择后创建空项目、已有目录和原约定文件不被覆盖、项目说明/收藏/重命名持久化、首轮对话工作目录、首页与四步引导返回及坞初始化。
- 截图复核发现普通窗口下最后一行被裁切后，收紧局部内距，增加最后一行位于footer上方的几何断言；3条项目创建Electron用例重新通过。没有放宽断言或更新视觉基线。
- 内含原有direct-eval/大chunk构建提醒、Canvas测试环境提醒，未改变相关配置。

日志：`/tmp/dawn-project-dialog-{baseline,red,green,all-ui,types,build,secrets,electron,layout-final}.log`。
截图（真实分支构建，无临时布局覆盖）：`/Users/liuyue/.codex/visualizations/2026/11/15/01a1dd44-1bf3-7981-9109-f81e832a348e/dawn-project-dialog-implemented-20261118/`。

## 运行与集成边界

所有Electron/磁盘测试只在夹具临时profile、配置、数据库、workspace及假模型内执行，未读取真实API Key、未修改正式App数据。验证为本机macOS；不声称真实模型、远端、Windows/Linux验收。新建项目不要求用户填写模型或解释器。本轮留在功能分支，本地提交，未合并main或推送。
