# 内核端口竞争及关闭后消息残留修复

本轮继续处理上次审查留下的 R `Address already in use`，不以普通路径再次通过替代故障恢复验证。所有改动留在本地，保留此前审查和修复。

## 原因与修改

`spawnteract` 先探测空闲端口，再启动独立内核进程绑定，之间存在其他进程抢占的窗口；同一应用的启动队列不能消除这个跨进程窗口。在真实 R 绑定前占用其 shell 端口，已复现原审查同样的 `R_zmq_bind errno: 48 / Address already in use`。

`src/kernel/channel.ts` 仅对内核输出中明确的 R/Python ZMQ 绑定冲突重新分配端口并启动，最多三次；每次先关闭失败实例。恢复发生在启动阶段，不重发分析代码，不重启其他已工作的内核。普通启动错误保留原诊断，不进入重试。告警包含尝试次数、失败 PID 和五个端口，不包含连接密钥。

首次打包故障注入又发现：旧通道关闭后仍有 ZeroMQ 待发握手存活，端口复用后新 R 收到旧签名而退出，应用退出时还提示等待 queued messages。新增真实 ZeroMQ 回归确认已关闭通道的握手确实会到达替代端点。

在创建通道前，使用 ZeroMQ 的公开 `context.blocky = false`，让新 socket 的 linger 为零，关闭时丢弃未发送消息。已有活动 socket 的配置不变；显式关闭和进程回收顺序仍保留。这避免旧握手或旧执行请求传给替代内核，也避免退出无限等待。该公开选项语义见 [ZeroMQ.js Context.blocky 文档](https://zeromq.github.io/zeromq.js/classes/Context.html#blocky)。没有修改依赖内部源码或禁用签名校验。

## 验证记录

证据目录：`artifacts/kernel-port-remediation-2026-10-31/`。

- `collision-red.log`：修改前，真实 R 端口竞争复现同样的绑定错误。
- `closed-channel-red.log`：消息清理修改前，新端点实际收到旧通道握手，回归断言失败。
- `packaged-port-race-stale-handshake-red.log`：仅加启动重试还不足，打包应用实际出现新 R 验签失败及退出等待，完整保留失败证据。
- `collision-and-close-green.log`：四项真实回归通过，包括竞争后恢复且分析代码只执行一次、持续竞争三次停止、非端口错误不重试、关闭后旧消息不再到达替代端点。

| 检查 | 最新结果与证据 |
| --- | --- |
| 全量单元/集成/UI组件 | 561个文件全部通过，5838项通过、10项既有跳过；`unit-verified.log`，142.63秒 |
| 类型、生产构建 | 均通过；`typecheck-complete.log`、`build-final.log` |
| 依赖 | 根项目全量/生产及两个spikes的四次audit均0漏洞；三个npm ls依赖树均成功 |
| macOS arm64打包 | 通过；`pack-final.log`；623个实际运行文件与工作区构建产物字节一致，按既有打包策略排除map和.DS_Store |
| 打包冒烟 | CLI、窗口/数据库、技能、模型测试链路、真实PTY、解释器和内核设置均通过；`packaged-smoke.log` |
| 打包真实故障注入 | 失败R回收、竞争端口仍被占用时重新启动成功、分析输出仅一次、已有Python变量仍为42、刷新后结果保留；正常退出code=0、signal=null、无强制终止，退出343ms；`packaged-port-race-verified.log`和`packaged-port-recovery.png` |
| 内核/远程/终端端到端 | 当前构建142/142通过，30个文件，11.1分钟；包含真实R连续重启三次、Python实例不变、结果隔离、远程内核、终端历史与图片上下文、方案执行、中文路径、活动终端退出恢复；`e2e-related.json`及`.log` |
| 独立真实内核端到端 | 6/6通过，15.7秒；Python/R执行、报错、变量面板、执行账本、解释器路径和ACP借用内核；`e2e-independent-kernels.json`及`.log` |
| 最终树核对 | 1345个源代码/测试/配置文件指纹无变化，623个工作区/打包运行文件字节一致；`source-hashes-final.json`、`packaged-build-hashes.json`；`git diff --check`通过 |

本轮额外修复一条PTY回归自身的同步错误：写入`cd`后旧提示符可能尚未刷新，改为等待实际空闲Shell查询成功且目录正确，不放宽产品的空闲校验。首次失败、修复后专项4项通过及全量通过均保留。

一次全量运行在与打包GUI同时执行时，真实浏览器的afterAll关闭超过20秒，五项行为断言均通过。保留`unit-complete.log`；独立诊断中浏览器以0退出、关闭约108ms，见`browser-shutdown-diagnostic.log`。不改产品代码或超时阈值，随后不同时运行打包GUI，完整重跑得到上述561文件全部通过的结果。

本轮两组端到端合计148项全部通过，0失败、0跳过、0重试通过。上一轮完整项目端到端记录保留在前一份报告，本轮数字不与旧结果混算。最终机器可读汇总见`verification-summary.json`。

## 验证边界

原始审查那次没有保存占用端口的进程身份，无法事后证明它是谁。本轮修复和验证的是已确定重现的竞争机制及其恢复缺口，不编造历史占用者。测试占用进程和故障注入均为隔离配置，未结束用户其他应用、未修改用户真实会话、凭证或已安装应用。

真实运行覆盖本机macOS arm64的Python、R、PTY、浏览器和Electron。模型、SSH及微信等外部服务使用项目测试夹具；未连接实际业务服务。打包使用显式模拟钥匙串开关，不等同于真实钥匙串授权或旧凭证迁移验收；Windows/Linux原生运行边界沿用前一份报告。
