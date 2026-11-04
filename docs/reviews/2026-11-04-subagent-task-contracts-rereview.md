# 子任务契约二次审查与本地集成

日期：2026-11-04（Asia/Shanghai）。基线 d99d9e95；专项分支 codex/subagent-task-contracts。

用户明确要求：复查契约验收、权限冻结、产物锁和恢复；发现问题修复并补测试；验证无阻塞后本地提交并合并 main，不推送、不发布。本轮按仓库单主线约定自行审查，没有委派，也不宣称独立第三方审查。

## 发现与修复

1. **权限门未覆盖真实 Team 通信装配（阻塞，已修复）。** 新门包住了内置文件和执行工具，但成员的 team_send 单独注册，窄范围成员仍能唤醒队友执行副作用。真实 Electron-as-Node/Pi 成员进程复现只读与限定写入两条越权 RPC；另以真实管道复现父端直接接收该调用。现在窄范围子进程不注册 team_send，父端 runner 也按同一冻结范围检查 RPC；team_status 和只读资源继续可用。
2. **产物锁遗漏硬链接别名（阻塞，已修复）。** realpath 只能统一符号链接；同一工作目录内不同硬链接路径可以同时取得写占用。新增本地预约路径函数，同时预约规范路径与现存文件 dev/ino；普通子任务、Team 和旧本地 Bot 适配共用，不对远端路径执行本机 stat。回归覆盖两个 scoped 写者和 scoped/旧 Bot 写者，保留互不重叠并行、排队取消及实际进程退出后释放检查。
3. **编排索引重建丢失验收回执（已修复）。** 旧 meta 含成功回执时只恢复文本；启动前 blocked 没有模型 result 时连错误结果也丢失。现在重建终态时恢复 receipt 和 error，再次打开持久索引仍保持；损坏回执在建立身份前拒绝，连续重开也不会变成静默成功。额外复现并修复重建刚完成身份注册就崩溃的窗口：仅有空 epoch-0 身份、没有消息或结果时继续补建；已有新轮次/状态/结果/消息的索引不被旧元数据覆盖。running 仍恢复为 interrupted，不重放。补充恢复后父端权限档/工具定义变宽也不能覆盖原冻结设置的断言。

## 审查范围

- 契约默认值与路径、输入就绪、最终 JSON、缺失/未声明产物、实际执行/审阅证据、failed/issues/blocked 与下游门。
- 普通前台/后台/parallel/chain/续问、旧 Team 与本地持久 Bot 的设置入口、真实 Pi 工具注册、父端 RPC 和宿主验收。
- 共享锁的规范化、硬链接身份、取消排队、后端清理与验收期间的持有、finally 释放。
- 设置/回执重开、旧索引重建、损坏状态、成员令牌与迟到结果、公共协议投影和 Bot 结果重建。

原始实现与上一轮验收记录保留在 [首次验收](2026-11-04-subagent-task-contracts-verification.md)。本轮新增记录以本文为准；旧源码 SHA256 清单仅代表首次验收时的源码。

## 验证与集成

修复后未发现剩余阻塞问题。最终固定源码的验证结果：

- `npm test -- --maxWorkers=4`：601 文件全部通过；6081 项通过、11 跳过（共 6092 项），184.92 秒。本轮新增 11 项回归。
- 定向回归：44 文件、298 项通过，包含真实成员子进程、父端 RPC、恢复、锁、取消和原协作能力。
- Electron：7 场景通过，30.5 秒；覆盖契约、缺失输入阻塞、后台编排、Bot 团队与持续协作。
- `npm run typecheck`、`npm run build`、暂存与未暂存 diff 检查通过；保留既有构建 eval/chunk 提示和 jsdom canvas 提示。
- 39 个变更源码/测试文件的最终 SHA256 清单核对无漂移。

按用户授权本地提交至专项分支并快进集成；合并后的检查另在本文补记。专项分支和隔离工作区保留，不推送、不发布。

### 本地 main 集成结果

功能及审查修复已提交为 `6f80f389`（feat(subagents): add verified contracts and frozen execution scopes），本地 main 从 `d99d9e95` 快进到该提交，无合并冲突。主目录合并前干净，未拉取、推送、发布、替换已安装应用或清理其他工作区。

main 上再次运行类型检查与完整构建通过，44 文件 / 298 项关键回归通过（8.30 秒）；重新核对 39 个源码/测试哈希无漂移，src/tests/e2e 与已完整验收的专项提交完全一致。本补记及 main 验证输出单独作本地文档提交，未改变运行代码。专项分支及隔离工作区保留。

合并后证据：[类型检查](../validation/subagent-task-contracts-20261104/main-typecheck.txt) / [构建](../validation/subagent-task-contracts-20261104/main-build.txt) / [关键回归](../validation/subagent-task-contracts-20261104/main-targeted.txt) / [源码一致性](../validation/subagent-task-contracts-20261104/main-source-match.txt)。

首次完整运行：601 文件，6077 通过、11 跳过，1 项失败发生于既有 remote-terminal 测试清理阶段等待 PTY 退出的 1 秒断言；该生产代码与测试未改变，单独重跑 19 项全部通过。降低并发后的中间运行恰遇审查中新加的部分索引红灯用例，已停止（exit 130），不作为最终验收；保留全部记录。最终运行固定源码与构建产物，不在运行中修改测试。

证据：

- [完整测试](../validation/subagent-task-contracts-20261104/review-unit.txt) / [定向回归](../validation/subagent-task-contracts-20261104/review-targeted.txt) / [Electron](../validation/subagent-task-contracts-20261104/review-electron.txt)
- [类型检查](../validation/subagent-task-contracts-20261104/review-typecheck.txt) / [构建](../validation/subagent-task-contracts-20261104/review-build.txt) / [最终源码 SHA256](../validation/subagent-task-contracts-20261104/review-tested-source-sha256.json)
- [硬链接红灯](../validation/subagent-task-contracts-20261104/review-red.txt) / [真实成员通信红灯](../validation/subagent-task-contracts-20261104/review-peer-red.txt) / [父端 RPC 红灯](../validation/subagent-task-contracts-20261104/review-peer-parent-red.txt) / [部分索引红灯](../validation/subagent-task-contracts-20261104/review-partial-index-red.txt)
- [首次完整运行的清理失败](../validation/subagent-task-contracts-20261104/review-unit-first.txt) / [终端单独复核](../validation/subagent-task-contracts-20261104/review-terminal-isolated.txt) / [已停止的中间运行](../validation/subagent-task-contracts-20261104/review-unit-intermediate.txt)

## 边界

验收证明契约、文件与实际工具证据，不证明科学结论。workspace-exec 复用既有权限规则，并非 OS/网络沙箱。锁协调同一规范工作目录、同一宿主进程内已接入的子任务写者，不拦外部进程/编辑器，不提供输入快照或跨进程租约。严格远端契约继续拒绝。测试使用临时目录、确定性本地模型，不调用真实服务商、不操作真实科研数据、已安装应用或凭据。
