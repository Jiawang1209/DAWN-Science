# SSH 连接取消实施计划

**Goal:** 连接启动期断开真正取消资源，迟到回调不恢复旧连接。
**Architecture:** RemoteExecutor 持有启动资源和可取消等待；RemoteConnections 为每次尝试关联身份与取消，迟到状态/清理只作用于原尝试。
**Tech Stack:** TypeScript、ssh2、Vitest、Electron/Playwright，共用 fake-ssh。

- [x] 新建 codex/ssh-connect-cancellation，基线 4ed7aa1d；SSH/Connections 原 2 文件 28 项通过。
- [x] 新增确定性握手/读私钥/环境捕获/重连竞争回归，先复现失败。
- [x] src/remote/ssh.ts 登记启动 client、取消握手与环境捕获等待、隔离迟到事件；src/remote/connections.ts 隔离尝试与 pending，closeAll 包含启动中。
- [x] 共用 fake-ssh 增加握手延迟控制；真实 Electron 验证取消/立即重连，相关 SSH/SFTP/传输测试回归。
- [x] 完成 typecheck、build、定向和全量验证，自审并更新 review / DEVELOPMENT_HISTORY。
- [x] 提交并快进本地 main，主目录复验后记录；再为内核启动期清理另建分支。

依用户指示串行执行，不委派，不推送或替换安装版。
