# 终端命令行调用 DAWN：接入核对

用户进一步明确：在终端命令行中也可以调用 DAWN Science。目标包含真正的 CLI 入口；此前仅将桌面对话移入终端工作区的实现方向不完整。当前工作区的界面调整仍是未验收的分支改动，不作为交付。

## 已有代码

- `src/cli.ts` 有 agents、run、sessions、demo，`run` 创建 NativeRuntime / PtyRuntime，再将标准输入输出接到 SessionManager。
- `package.json` 有开发用 `npm run dawn`，没有可分发的 `bin` 命令安装入口。目前不能把拟议的直接 `dawn` 启动体验说成已经完成。
- `src/electron/wiring.ts` 明确不依赖 Electron，可装配核心运行时、工作台协议、工具、权限、内核、MCP 等；`WorkbenchServer.handle` 也不依赖窗口。应复用其能力和事件，不维护另一个简化 Agent。
- 旧 CLI 直接 new NativeRuntime，并仅处理基础输出/退出，不是桌面工作台完整装配。需要为 CLI 补齐工具过程、权限/问答、停止、会话恢复和可靠的终端输入输出体验。

## 命令行体验

在任意工作目录运行 `dawn`，进入 Agent；自由对话，按任务调用 DAWN 工具。工作目录和进程环境来自启动的终端。DAWN 内置终端与系统终端使用相同入口，不叠加第二套桌面聊天框。运行中 Ctrl-C 中止回合；退出应恢复终端输入状态。

用户已选择第一种：Normal 是原 Shell。下列第二种保留为研究对照，不实施：

1. 原 Shell 为 Normal：`dawn` 是一个前台 Agent 程序，退出回原 Shell。最符合一般 CLI 的启动方式，保留原 Shell 本身的目录和环境；子进程内改变目录或环境不会自动改写父 Shell。
2. DAWN 内部双模式：启动后由 CLI 自己管理一个 PTY，Agent / Normal 共用该 PTY。这样两模式间可连续保留 cd、环境和解释器变量；退出 CLI 后回外层 Shell。需要完成 CLI 内部的模式切换和终端转发，不能宣称任意接管外部父 Shell 的内存状态。

## 接入时必须解决的实际边界

- 凭证通过现有 CredentialsPort 装配。桌面加密凭证依赖 Electron safeStorage，不能假设普通 Node 进程可直接解密；CLI 的合法凭证来源需要独立接入，不打印或复制实际密钥。
- CLI 与运行中的桌面不能分别对同一数据库执行启动残留对账。`createWorkbench` 和旧 CLI 都有 reconcileOnStartup，直接共库会误判另一进程的活会话。第一版采用独立 CLI 数据目录；未来如需共享活动会话须由同一后端拥有它们。
- better-sqlite3、node-pty、zeromq 有原生运行时依赖；命令分发与真实启动要在使用的 Node/Electron ABI 下验证，不能只补一个 package bin 字段就算完成。
- 开发、安装入口和预览均使用隔离路径，不更改已安装软件，不改用户 PATH / Shell 配置，不合并或推送。

## 下一步验收目标

真实终端中输入开发版命令，能开始对话、调用真实工具、展示并回答权限、停止回合、退出回 Shell；工具写出的文件与日志可核验。再在隔离 Electron 的原生终端运行同一 CLI，画面中只有 CLI 自己的一个输入入口。固定模型仅验接口与过程，不宣称验证了真实模型的任意任务能力。
