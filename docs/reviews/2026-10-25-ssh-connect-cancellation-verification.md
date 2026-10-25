# SSH 启动期取消验证

基线 main 4ed7aa1d；独立分支 codex/ssh-connect-cancellation。用户授权每项修复验证后合并本地 main，再继续下一项。

## 修复与自审

RemoteExecutor 从启动登记客户端；握手与环境捕获的等待可由 close 立即取消。先安装 error/close 监听再报告 connecting，回调内即时取消也安全。关闭先清除所有权，再 end；旧 ready/error/close 无权恢复状态。登录环境先保留为局部结果，只由当前连接提交。失败关闭客户端，握手对端关闭能结束等待。

RemoteConnections 在读私钥前登记每次尝试；取消立即结束外部等待，读取晚到不再创建客户端或取口令。断开后新连接有独立身份；旧 finally、错误与状态不能删除/覆盖新 pending。closeAll 同时包括尚在读私钥的尝试。主动断开保持 idle，真实认证/连接失败保持 disconnected 与原始原因；无自动重连。

自审检查了资源登记先于异步等待、监听先于状态回调、断开先失效所有权、旧清理只清旧尝试、环境捕获晚到、失败资源回收和钥匙读取晚到。不改变 Workbench 协议、既有菜单或鉴权策略。

## 验证

- 原 SSH/管理器基线 2 文件 28 项通过；新增管理器 5 项、执行器 2 项。先复现管理器 4 项失败和执行器 2 项失败，再修正；包含私钥未释放前取消 Promise 已完成的明确断言。
- 定向 remote / 连接后端 / 传输预留 / remote-kernel-gate 共 14 文件：201 项通过、8 跳过。加强取消时序后管理器 17 项复验通过。
- typecheck、完整 Electron/CLI/UI build 通过。
- 最终全量 Vitest：497 文件，5279 项通过、10 跳过，107.52 秒。
- 真实 Electron 定向 5 项通过（17.2 秒）：新增握手取消与立即重连 2 项、原连接/远端会话/断线重连路径 3 项。新增用例通过实际 IPC 发起连接/取消，观察侧栏 connecting/idle/ready，跨过原握手时点后保持取消状态；正常已连接后的断开使用现有菜单。没有增加连接中菜单按钮。
- 共用 fake-ssh 加入可配置握手延迟，并在 end 清除握手计时；dev:mock 与 E2E 使用同一实现。单测额外手动派发迟到 ready/error/close，验证即使事件晚到也不污染后继尝试。
- 首次新增 Electron 因夹具经 IPC 新增名单后未让 UI 重新读取而失败；改为保存后正常重载、再开始连接后通过，没有为测试修改生产名单行为。

证据：/Users/liuyue/Documents/Codex/2026-10-25/dawn-science-fixes/ssh-connect-cancellation/。baseline.log、red.log、executor-red.log、focused-final.log、immediate.log、typecheck-final.log、build.log、e2e-final.log、full.log 及 source-sha256.json。提交前核对源码哈希一致。

边界：真实构建与真实生命周期，SSH 对端为共用假服务器；未连接真实主机，未验收跨平台安装包。构建大 chunk 和 jsdom canvas 既有提示保留，无断言失败。

## 本地集成

修复提交 aa97562c 已从 4ed7aa1d 快进合并本地 main。主目录重新类型检查/完整构建通过，14 文件 201 项通过、8 跳过（4.61 秒），同样 5 项 Electron 全通过（12.2 秒）。main-typecheck.log、main-build.log、main-focused.log、main-e2e.log 保存于同一证据目录。仅本地提交与合并，不推送、不替换安装版。下一项内核启动期清理另开 codex/kernel-startup-cleanup 分支。
