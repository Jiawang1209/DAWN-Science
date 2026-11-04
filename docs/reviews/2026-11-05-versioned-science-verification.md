# 内容版本交接、科研批量模板与评测基线专项验收

日期：2026-11-05。基线 `07275d77`；专项分支 `codex/versioned-science-batches`；隔离工作区 `/Users/liuyue/.codex/worktrees/dawn-versioned-science-20261105/dawn-science`。本轮按用户要求制定方案、建立 /goal 并执行；仅本地开发，不推送、不发布。未提交或合并，本地 main 保持原状。

## 对照目标的交付

1. **版本化交接**：新建流水线冻结初始输入 SHA256/bytes；正式提交采集版本期间封住新调用并响应取消；父端在原占用内复核正式证明与物理内容；审阅绑定最新 accepted 分析输出。恢复核对原输入和仍有效的验收产物；ack 不豁免版本冲突。路线写回先核验内容，再沿用路线 CAS 和幂等 marker；会话停止/回退排空投影，旧拥有者不能迟到写回。
2. **复用已有机制**：使用现有 fileIdentity 工作线程和 artifact_versions/observations；无新数据库 schema、执行循环或存储系统。普通 Pi、旧 Team、持久 Bot 共用契约与回执。版本绑定的限定写入占用原 inputs+outputs，执行任务继续整工作区占用；未绑定旧任务保留旧行为。旧记录明确显示未绑定，不能补造历史版本。
3. **科研模板和批量**：tabular-ecology@1 / figure-reproduction@1，明确用户批准方法、单位、缺失值或文献证据条件。1–8 项、每项最多 4 输入、同一 Team 串行，每项原固定阶段，最多两次修正与 16 次阶段尝试。所有未来项权限在开始时冻结；稳定输出目录按请求与项隔离，拒绝原始数据/输入覆盖及路径、硬链接别名重叠。
4. **汇总和恢复**：同一 scheduler.改 原子归档本项并入队下一项；失败即停，不跳过条件。汇总使用原 scheduler/attempt/占用/正式提交，不调用额外模型，只复制已验收事实与版本。已完成项保留，汇总未知效果显式确认后用原 settings 恢复；归档取消全批量，不能恢复。部分完成不写 delivered，最终复核全部项、原输入和汇总版本后统一 CAS。
5. **轻量状态和评测**：协议 8.42，原 Team 状态展示进度、内容绑定、冲突原因和汇总路径。五组同条件单／多 agent 本地软件评测，独立核对实际统计文件、输入、阻塞及同一初始缺陷返工；保留配对标准、源码/构建指纹、实际调用/可见或未知用量与脚本干预。

设计与计划见 `docs/superpowers/specs/2026-11-05-versioned-science-design.md` 和 `docs/superpowers/plans/2026-11-05-versioned-science.md`。批量工具复用原 science-pipeline-tools 的成员解析/冻结/准入，不另建重复工具装配；评测数据集中于共用确定性 mock 脚本，不另复制一套测试服务器。

## 审查发现与修复

- 正式提交异步封存新增证明后，coordinator Outcome 的 strict 协议拒绝顶层 versions。真实 Pi 复现后仅在统一结果中保留正式 receipt.versions，移除内部传输字段，跨进程和持久编排均通过。
- 投影 cancelPending 期间，team onChange 可能重新排队。增加同步 suspended 状态与受控新用户轮次 resume；close 永久关闭并排空。独立审查原复现脚本修复后路线 revision 保持 1、写入 0。
- 批量输出字面路径不同但可指向同一真实目录/硬链接。准入复用 canonical/inode 占用路径检查所有 inputs/outputs，写入前拒绝别名覆盖。
- team_finish 原先只取消当前 pipeline，留下已归档 batch interrupted。同步取消 batch，恢复入口先拒绝 archived，回归保证拒绝不改记录。
- 增加回退排空投影时的 await 曾使 stop 在回退 promise 登记前 dispose。完整回归发现后调整为先登记整段 promise，定向回退/投影/批量恢复 22 项通过。
- 版本绑定 workspace-write 原先只占输出；最终输入 hash 后可能遭协作 writer 修改。原占用现在覆盖 inputs+outputs；工具全只读快捷分支仅适用于未绑定任务。普通与窄工具设置均有红绿测试，独立复现确认竞争 writer 被阻塞且能取消；Bot/汇总/投影没有重入锁。
- 评测初版返工只注入 multi。现在两条路径首次真实 result.json 都缺单位，同一最终宿主真值、同一修正要求及一次修正上限；single 与 multi 均返工一次，不把独立审阅不同工作量伪装成同条件。
- 评测补齐 usage.partial 及模式汇总标记，标准命令前置构建；中断在模型选择执行工具后统一注入。输入保留基线是外部故障注入之后、执行器准入之前的字节。

独立 reviewer 全程只读，最终未发现已确认阻塞问题。其针对复验 3 文件 11 项通过；锁边界另用原脚本确认 competingWriterEntered=false。主实现保留全部修改与测试证据，不以 reviewer 结论替代最终命令验证。

## 验证证据

证据根目录：`docs/validation/versioned-science-20261105/`。最终源码清单 `source-sha256.json` 覆盖 66 个变更代码/测试/夹具/配置文件。

- 最终类型检查：`typecheck-final.txt`。
- 最终完整构建：`build-final.txt`，Electron/CLI/UI；构建仍有既有 direct eval 和大 bundle 提示。
- 完整单元/集成/UI/内核：`full-final.txt`：618 个文件、6162 项通过、11 项跳过，退出码 0。此前 `full-after-lifecycle.txt` 为锁补充前的 618 文件/6160 通过/11 跳过，不冒充最终冻结源码的全量证据；`full-progress.txt` 保留回退竞态的初次失败。
- 真实 Pi：`pi-progress2.txt` 保留排队测试路径规范错误的发现；修正后 `recovery-green.txt` 两文件10项通过；`batch-baseline-progress.txt` 三文件9项，覆盖两模板、缺单位 fail-fast、返工和成对基线。
- 真实 Native/Bot/SQLite：`bot-sqlite-green.txt`、`pre-final-targeted.txt` 和 `input-reservation-final.txt`；覆盖 legacy/tool/版本绑定、实际版本入库、原输入不变，最后三文件12项通过。
- 当前 Electron：`electron-final.txt`：11 个场景全部通过，退出码 0，真实内置 Pi/严格协议、批量、普通 subagent 与 Team；此前针对批量与单项四场景通过见 `electron-progress.txt`。
- 原始红绿：版本、提交、阶段绑定、投影、批量、恢复与锁的 `*-red.txt` / `*-green.txt`。`templates-first-green.txt` 是模板初次通过记录，不称为失败证据。
- 最终基线：`evaluation-final.txt`、`evaluation/baseline.json`、`evaluation/baseline.md`；两种模式各 5/5 正确交付或阻塞、错误放行 0；返工均一次；用量部分可见，未估算费用。

## 实际边界

评测与本地验收仅使用确定性 localhost 响应、合成数据、实际 Python 与文件。支持 Python/R 脚本模板，但这批真实模板执行验证使用 Python，没有声称完成 R 环境或真实提供商科学实验。未验证真实模型质量、费用或并行收益；批量有意串行。契约/文件/工具验收、一次读取及内容哈希均不代表科学认证，哈希也不等于文件字节已经保存。工作区 shell 沿用原权限，不是逐文件沙箱。旧未绑定记录兼容但不能获得过去的版本保证。

没有实现动态通用工作流、运行中 steer、全面 token 预算系统或新后端注册；没有推送、发布、替换已安装应用或改动用户历史数据。


最终收尾：类型检查、完整构建、冻结源码全量 618 文件/6162 项通过（11 跳过）及 Electron 11 场景通过；git diff --check 通过。source-check.json 证明 66 个文件无漂移、评测源码与 child 构建匹配；本地 main 仍为 07275d7708f061d6624218530fbed530b857af32，工作区干净。专项未提交、未合并、未推送、未发布。
