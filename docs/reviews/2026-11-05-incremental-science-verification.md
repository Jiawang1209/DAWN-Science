# 增量科研交付与可执行验收：实现、审查和效果

基线：`ce5ae5dd035f6eff82d159150a44086be63423d6`。工作区：`/Users/liuyue/.codex/worktrees/dawn-incremental-science-20261105/dawn-science`；分支：`codex/incremental-science-acceptance`。本批不自动提交/合并，不推送、不发布、不替换安装应用；main 保持原状。

## 用户能看到的变化

1. 原团队面板显示宿主规则、期望/实际、文件内容版本，以及“数值核验未配置”的明确边界。实际输入 x=1..5，模型和文件都报 999，宿主独立计算 3，阻止进入审阅。
2. 受阻批次显式派生新批次。A 已完整通过且当前条件一致则沿用旧产物/审阅；B 未通过则在新目录重新执行。逐项显示原因、来源和保留的文件，不改原批次，不把历史执行算入本次用量。
3. 原评测入口增加增量对照，不另建执行循环。原五对基线保持；相同故障前置之后，完整重跑 20 请求/2分析项，派生重跑 10请求/1分析项/1复用项。完全重复为0新增模型请求、2复用项，仍有宿主核验/汇总成本。

直接查看 [效果演示与原始文件](../validation/incremental-science-20261105/demo/README.md)、[增量对照](../validation/incremental-science-20261105/evaluation/incremental.md) 和 [完整 JSON](../validation/incremental-science-20261105/evaluation/incremental.json)。模型为 localhost 确定性夹具；Pi、Native Bot、SQLite、Python/R、文件和 Electron 实际执行，不支持真实模型质量/费用外推。

## 复用的既有实现

- `TaskSubmission` 冻结/正式提交、统一父端 finalizer，追加宿主规则后再绑定实际内容版本；取消不封存。
- `fileIdentity` 有界 worker 和原表格解析，完整核验声明 CSV；无预览替代、无新增模型测试代码执行。
- 原 Team reducer、attempt fencing、阶段修正上限及串行批量；新批次只复制闭合历史投影，原调度器执行必要项和固定宿主汇总。
- 原共享产物占用内核对源文件；准入异步后重查来源、当前团队、路线及取消；恢复仍验证历史有效版本，最终沿原 CAS。
- 原环境探测/解析/指纹词汇；仅已知隔离环境、实际脚本字节和受控执行证据可复用，普通启动方式降为无复用证明。
- 科研成员的执行者定义和工具权限同份冻结，公共快照剥离内部正文。签名纳入父端 owning modules 与实际 child bundle，旧无证明批次不补造证据。

## 审查发现与修复

独立只读 reviewer 多轮复现、复验；主审补充实际执行者捕获测试。以下均已补反例和修复：

| 缺口 | 最终处理与证据 |
|---|---|
| SVG 的 PI、xml:base、转义 CSS 可藏外链 | 拒绝这些活动/外链语法；保留普通静态样式和本地引用 |
| 超长引号跨行 CSV 平方扫描 | 原表格拼接改线性奇偶计数与片段 join；保留完整内容 |
| 单独 CR 可绕过物理行预算 | LF、CR、CRLF 统一计数，超过200000行阻塞 |
| 大数相消令参考均值错误 | 补偿求和；均值先缩放，非有限参考值阻塞 |
| 元数据探测可能导入工作区同名模块 | Python -I；固定探测，不导入项目 platform.py |
| shell 函数可冒充 Python，脚本后改未绑定 | 受控解释器实际调用，前后脚本/环境证明绑定；普通 shell 不获复用证明 |
| 取消/超时只杀解释器、后代迟到写 | 共用原进程树快照/清理，等close再返回；Pi父端取消覆盖后代组 |
| R 探测到bin/R却使用Rscript参数 | 固定R包装以真实解释器执行声明脚本；实机R marker验收 |
| 正常退出时另起session的后代已重挂接 | 完成握手前保持解释器存活，先快照清理后代，再终验；缺握手明确失败无证明 |
| 排队期间名册变更使实际正文与签名不符 | 新科研成员冻结完整执行者定义，调度/工具/签名同源；真实child spec捕获红绿测，公共快照不泄露正文 |
| 样式类/边框令牌遗漏 | 使用原stroke令牌并补真实复用列表样式，103项设计契约通过 |

最后两轮独立复验：受控执行/executor/runner/PTY 4文件36项通过；执行者捕获及契约快照通过，独立对象检查内部保留正文而公开快照不含正文；未发现剩余重要阻塞。此结论限本次审查范围，不声称是OS沙箱或通用动态工作流。

## 验收证据

- 最终类型检查：[typecheck-final.txt](../validation/incremental-science-20261105/typecheck-final.txt)。
- 完整构建：[build-final.txt](../validation/incremental-science-20261105/build-final.txt)。保留原构建的 direct-eval 与大包提示，无新增构建错误。
- 最终全量测试：[unit-final.txt](../validation/incremental-science-20261105/unit-final.txt)。冻结源码629文件全部通过，6227项通过、11项跳过；无未处理异常。
- 7个真实桌面场景：[electron-final.txt](../validation/incremental-science-20261105/electron-final.txt)。最终冻结源码7/7通过，截图和实际汇总已更新。
- 真实Pi局部重跑/重复采用/输入失效；真实backend/Native Bot/SQLite的正确与错误数值两模式，均纳入全量测试。Bot结果与产物版本入库，错误数值不进入review。
- 派生并发幂等、来源/当前团队/修订/排空/未知效果、共享锁等待取消、篡改、权限/方法/执行者变化、派生后恢复：[actor-freeze-green.txt](../validation/incremental-science-20261105/actor-freeze-green.txt)、[derivation-final.txt](../validation/incremental-science-20261105/derivation-final.txt)。
- 原五对与9条增量评测：[evaluation-final.txt](../validation/incremental-science-20261105/evaluation-final.txt)。临时stdlib-only venv是真实环境变化，不联网、不安装包，结束删除；两项均重新执行。
- 冻结清单：[source-manifest.json](../validation/incremental-science-20261105/source-manifest.json)。收尾再核对全部列出源码/脚本/测试，不以旧日志替代最终源码。

红测和中间失败日志保留为修复证据，包括早期Bot通知器未dispose的测试清理问题（已补正式dispose，无最终未处理异常），不将这些中间结果报告成最终通过。

## 当前适用范围

数值规则仅支持明确列的 mean/sum/min/max 与 n/unit/回执一致性；SVG只验证结构、静态性和声明引用。历史复用是采用可追溯已审阅产物，不是重新执行或科学正确性证明。环境未知、缺证据、未完整通过、条件变化时重跑。固定包装支持普通同步科研脚本；OS级守护进程、外部异步服务和主动绕过宿主的行为沿既有workspace-exec边界，不保证沙箱隔离。真实模型质量、费用与泛化收益尚未评测。

最终源码清单复核：1466个源码/脚本/测试/配置文件无漂移；git diff --check通过；本地main仍为ce5ae5dd且干净。本批改动未提交、未合并。


后续合并前复审更新：上述为首次实现阶段证据。新增反例与修复、R复用保守降级、最终提交及本地main验收以 [2026-11-05-incremental-science-rereview.md](2026-11-05-incremental-science-rereview.md) 为准；不将旧完成结论冒充后续源码验证。
