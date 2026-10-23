# 终端会话上下文承接验收

日期：2026-10-23。独立工作区：`/Users/liuyue/.codex/worktrees/terminal-assistance/dawn-science`，分支 `codex/terminal-assistance`。

## 结果

点击终端“返回会话”，主区打开该终端最近认证的 Agent 原生会话 ID。原话、回答、工具结果和当前模型选择随同一记录显示；续问写入该记录，不新建或复制任务。普通终端从未启动 Agent 时仍返回原会话及草稿。Normal 后保留最近的 Agent 目标，重新运行 dawn 则更新为新目标。

后台保存每个终端各自的目标及项目，PTY 退出时清理；返回动作重新读取状态和目标列表，检查发起窗口作用域；模型优先读当前原生运行时，停止后使用最后选择。界面会话别名允许在同一项目中重新打开原 PTY，原归属不被覆盖。跨目录 CLI 返回时跟随其实际项目；跨项目重新打开旧 PTY 不在本次范围内。

## 自动核验

- 类型检查和完整构建通过。
- 全量 Vitest：470 文件通过，4986 项通过、10 项跳过，93.42 秒。
- 针对性协议、状态与 CLI 核验：5 文件、118 项通过。
- 真实 Electron：desktop-cli、terminal-context-return、terminal-assistance、terminal-dock 合计 18 项通过，1.1 分钟。
- Electron 覆盖同 ID 续问、原草稿保留、无 Agent 回退、Normal 后返回、再次打开复用 PTY、多终端各自目标、删除目标后提示且保持终端，以及子目录启动 CLI 后返回正确项目、后台长工具继续完成。
- 静态复核返回请求的终端/原会话/项目/视图校验、启动和停止中拒绝导航、归档目标过滤与错误留在终端。未单独模拟所有异步竞态。
- 初次失败分别为新状态字段缺失（预期 RED）、测试定位器同时匹配高亮层与 textarea、macOS /var 与 /private/var 路径别名断言；定位器限定 textarea，路径比较真实物理路径后最终整组通过。

最终日志在 `artifacts/terminal-context-return/checks/`。现有构建 bundle/eval 提示、测试 jsdom canvas 提示及 Electron fixture 恢复日志不影响最终通过状态。

## 真实模型与实际预览

使用已配置的 DeepSeek V4 Pro，沿用已有加密凭证源，只读访问，不另配 key。先让终端 Agent 读取真实 sample.txt，并只在该会话记住随机代号；返回图形会话后，不重复代号、不读文件、不调用工具，模型准确答出原代号。

最终构建实际验证：终端与图形会话均为 `fcaff1a1-0151-4a5f-8225-560642ef19c8`，GUI 续问前后任务数均为 9，原工具结果与模型显示正确。另一次完整实测还确认 Normal 后回到同一记录仍能准确回忆代号，原会话草稿保持独立。证据在 final-real-evidence.json 与 real-evidence.json。

实际 Electron 检查亮色 1280×840、暗色 1000×720。返回按钮及悬浮“返回会话”提示可见，终端与会话主区切换，没有重复聊天输入框。窄窗滚动后答案和输入框均可见。截图 01–06 在 `artifacts/terminal-context-return/`。最终恢复亮色大窗口，停在同段可继续输入的图形会话；原 PTY 与 Agent 仍存活。

## 边界

主目录 main 仍为 `38959c57` 且干净；仅独立分支本地提交。未合并、推送、安装、替换安装版或修改生产配置。原 providers.yaml 与 credentials.json 校验一致；证据不包含凭证内容。本次未添加或验收图片输入、输出功能。实测范围为 macOS 开发 Electron 和当前配置的 API 模型。
