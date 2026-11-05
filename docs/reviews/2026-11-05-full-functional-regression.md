# 全功能回归与升级后向导复核

起点：main `732bd513`。用户要求核实旧功能没有被编排升级破坏，并指出安装 0.0.44、在应用内更新重启后未看到向导。保留本地工作范围，不推送、不发布、不替换安装应用，不重置用户设置、凭证和会话。

## 当前发现与修复

### 应用内更新沿用向导状态

安装包版本已核实为 0.0.44、构建文件时间为 2026-11-02。原更新成功回调会 `adoptAutomaticUpdate()`，沿用安装 UUID；原测试也明确要求“自动更新接续世代”。向导的 completed/skipped 两个 localStorage 键只按这个身份隔离，因此更新后的新版本可能继承旧版本“已看过”的状态。此前本地编排源码没有替换这个安装包。

修复保持 v1 安装记录及裸 UUID、旧更新器接续行为兼容，仅将传给渲染层的向导身份改为“安装 UUID@应用版本”。新版本第一次出现欢迎页，同一版本完成或主动跳过后重启保持稳定；模型配置、密钥、数据库与旧向导记录不删除。覆盖了旧更新器先保存接续状态、再启动新版本的组合。

真实打包模式的隔离验证使用安装应用的临时副本叠加当前源码构建，独立 profile、数据库和 localhost 模型服务；核验 `app.isPackaged=true`。实际跑通 0.0.44 欢迎→完成/跳过→同版本重启不弹→模拟旧更新器接续后 0.0.45 再欢迎，并确认原提供商配置及旧引导标记保留。截图与 result.json 在 validation/packaged-onboarding/。这不是签名发布包认证，也没有执行真实更新下载/替换或改写 /Applications。

### 远端普通子任务能力回退

审阅发现前台和续问虽传入 remote 禁用 control，执行器又回退到 orchestration，可能误报支持实时纠偏。真实子进程握手回归复现了 remote=true 时 canSteer=true。修复增加内部显式 allowSteering 策略；远端仅关闭这项未经验证的能力，普通编排、执行、续问、取消和结果保留。本地缺省行为保持。回归覆盖 local/remote × foreground/followup。

### 本地终端退出时遗漏原生回调排空

第一轮桌面日志记录三次 `libc++abi ... Napi::Error`，系统 DiagnosticReports 三份 SIGABRT 的栈均指向 `pty.node` 的 `ThreadSafeFunction::CallJS` 与 Node `FreeEnvironment`。这不是仅有超时推测；摘要、原报告名和 SHA-256 保存在 `native-exit-crashes.json`。相关退出代码在本次编排升级前已存在。

原 `needsGracefulShutdown()` 不计入活跃本地 PTY，同步关闭只是发起异步 stop；原 PTY stop 只检查 PID 是否消失，SIGKILL 后也不等实际 onExit。测试夹具又吞掉关闭错误且不检查退出码，因此原生崩溃的场景仍可显示通过。第一轮另有两个后续首窗超时及对应 worker 收尾超时；它们与前面原生崩溃相邻，但不能只凭相邻宣称因果。

修复复用 TerminalControl 的实际本地活跃登记，进入原有异步关闭路径。PTY completion 按具体进程代次绑定，重复 stop 共享整个 TERM/grace/KILL/回调排空过程；PID 已消失也继续等原生 onExit，随后让出一次事件循环。默认 200ms 宽限期加 1000ms 回调等待，沿用 workbench 1500ms 与主进程 4000ms 兜底。旧回调不能清理新代次，observer 抛错也在 finally 结算完成与清理。超过预算仍属有界降级，不声称所有故障都能排空。

夹具在普通结束与重开时都检查真实进程的 signalCode=null、exitCode=0，关闭失败直接失败；应用启动/首窗失败也走 finally，关闭各隔离服务并移除临时目录。已从本地 Playwright 实现确认 `app.close()` 成功后已等到 ChildProcess close，可以直接读取最终退出状态。

### 远端终端的本地呈现器也纳入收尾

远端 Shell 的 DAWN 呈现器实际创建本地 PtyRuntime，却不向 TerminalControl 的远端观察注册本地端口；因此不能只按本地端口登记判定原生资源。修复在 RemoteTerminalRuntime 独立追踪启动中、活跃及排空中的本地呈现器，复用既有退出等待/收摊注册，不增加协议或另建调度器。远端条目删除后仍保留本地排空任务；关闭准入后，迟到的 environment/start 不得产生无人收尾的呈现器。具体进程 start 的 promise 完成后才 stop，多个呈现器全部结算后再 AggregateError 汇总，后台失败显式记录而不成为 unhandled rejection。

父层 workbench 同样改为 allSettled：一个资源失败不能提前放弃其他会话，race timer 在提前完成时清除，原超时预算不变。独立审查抓到并通过红测闭合了两项组合遗漏：兄弟呈现器先失败导致提前返回、断开时对尚未启动完成的本地 PTY 过早 stop。六项远端新增回归覆盖活跃、deferred environment、deferred local start、断线后排空、后台失败与双呈现器组合。

第二轮完整单元曾出现原有远端呈现输出在默认 1000ms 观察窗口未到达，637 文件中 6303 通过、1 失败、10 跳过（final-unit.txt）；该用例未改源码独立重跑 19 通过（remote-presentation-rerun.txt），未放宽观察阈值。现场与后续结果均保留，不能把独立重跑当作此前整套全绿。最终在补齐上述资源追踪后再次运行完整组。

### 技能作者标签与英文界面扫描边界

第一轮英文全屏检查识别出 Skills 的动态中文标签。标签来自技能文件或个人覆盖，按现有规则属于作者内容，应保留原文；动态筛选按钮缺少 `data-authored` 标记。仅补此按钮的标记，不翻译作者标签，不修改扫描器或整个筛选区域。固定 Filter by tag / Any tag 仍须通过英文扫描。新增回归验证中文自定义/自带标签、与翻译词条重名的“技能”、原值筛选及固定英文控件边界。

## 覆盖矩阵

| 功能面 | 本轮验收路径 | 实测边界 |
|---|---|---|
| 聊天、流式、模型切换、错误、会话组织/搜索/恢复 | Node/UI 与完整 Electron | Electron/SQLite/重启真实；推理为固定本地服务 |
| 项目、文件、附件、产物、Office/PDF | 完整 Electron、本地工具往返 | 实际文件与文档生成预览；不证明微软 Office 桌面兼容 |
| 路线、方案、交付、Notebook | 路线持久化、协议、脚本/内核执行 | 科研规划与评审回复由夹具控制 |
| Python/R、变量、绘图、中断 | Vitest 串行 kernel 组及独立 kernel-session | 记录实际解释器与缺失前提，不用菜单夹具代替执行 |
| Bot、Team、subagent、科研流水线 | 全部相关 Electron 与调度/权限/恢复测试 | Pi/子进程/文件真实；模型与外部 Bot 服务模拟 |
| Skills、Memory、MCP、案例卡片 | 装配、持久化、注入、恢复与资源协议 | MCP/案例/GitHub 下载为测试出口，不验证正式服务在线 |
| 文献与 GEO/SRA/UniProt | 查询、选择、落盘、错误/限流 | 本地假 HTTP，不声称科学数据库当前在线 |
| 终端、DAWN CLI、外部 CLI/ACP | 实际 PTY/shell、恢复与权限 | 外部 Claude/Codex/ACP 使用假可执行文件，不使用真实账号 |
| SSH、目录/文件传输、远程终端/内核 | 假 SSH 服务及部分本机真内核经隧道 | 不证明真实服务器、认证或真实远端环境兼容 |
| 设置、向导、主题、视觉、更新 | 整体 UI、截图比较、隔离打包启动 | 更新出口模拟；真实安装应用保持原样 |

## 验证记录

| 执行 | 结果 | 说明 |
|---|---|---|
| 修复向导/远端策略后的完整 Node/UI/kernel project | 636 文件，6294 通过、11 跳过 | unit.txt；后续 PTY/标签修复后会再完整运行 |
| 首次完整桌面 919 场景、238 文件 | 914 通过、3 失败、2 跳过，另有 2 次 worker 收尾超时 | desktop.json/txt；52.5 分钟，保留首次失败，不能称作全绿 |
| 新增 PTY 回归修复前 | 6 项中 5 项失败 | pty-red.txt；提前完成、并发重复、超时、代次和 observer 清理均被捕获 |
| 最终 PTY/远端呈现/标签/wiring 定向单元 | 101 通过、1 既有跳过 | final-shutdown-green.txt；含修复前组合红测 |
| 修复后 7 文件真实桌面复验 | 46 通过 | 包括全部首次失败、终端历史/生命周期、双语和 Skills；严格检查退出码，无原生崩溃日志 |
| 最终远端终端、向导、纠偏代次、并行科研及终端图片桌面 | 19 通过 | final-desktop.json/txt；最终资源追踪与 allSettled 修改后，退出码全部正常 |
| 三处实际原生崩溃场景各重复三次 | 9 通过 | pty-repeat.json/txt；严格检查退出码 |
| 最终独立真实 kernel-session | 6 通过 | final-kernel.json/txt；最终收尾实现下再次验收 |
| 首轮因隔离工作区缺解释器入口而跳过的产物快照 | 补跑 1 通过 | final-interpreters.json/txt；最终代码再跑，仍只链接既有 .venv-kernel，R 使用 /usr/local/bin/R |
| 隔离真实打包模式向导 | 三次启动验证通过 | 旧标记→44欢迎→同版本重启不弹→模拟旧更新器接续后45欢迎；packaged-onboarding/result.json |
| 最终完整 Node/UI/kernel project | 637 文件，6311 通过、10 条前提跳过 | final-unit-verified.txt；原有 1000ms 断言未放宽 |

类型检查和完整构建通过。首次冻结清单 1476 条源文件，整轮结束后零变动（source-freeze-result.json）。修复后最终清单为 1477 条（新增 PTY shutdown 回归），后续合并核对该清单。原历史演示截图不替换；本次生成的四张旧功能截图单独保存在 legacy-demo。所有截图基线保持不变。

独立代码审查未发现新增 P1/P2；审查了 PTY 代次/并发/排空预算、向导持久化兼容、远端普通编排保留、作者内容范围及测试退出检查。没有将有界超时降级解释为无条件安全退出。

## 解释结果的边界

不能把“测试通过”解释为所有功能、服务商和平台绝对正确。此次不调用真实付费推理、不登录真实 SSH，不替换安装应用或执行正式升级；性能专项、签名/公证与全部平台安装认证不属于这一组功能回归。remote-kernel 的某些 R 前提通过登录 shell 的 Rscript 检测，若跳过，应按选中解释器说明，不能概括成本机没有 R。完整桌面测试可能打开公共 example.com 的内嵌页面，凭证和付费 API 仍由隔离服务接管。

本地提交、main 合并与主分支复验将在最后追加。
