# 科研流水线二次审查证据

基线 5c88414e，分支 codex/science-pipeline。

归档时仅清理行尾空格与文件末尾多余空行，测试输出内容及计数保留。

- `*-red.txt` 是刻意保留的失败复现，包括恢复通知/领取、非法恢复副作用、阶段外写入口、检查点期间取消。
- `critical-final.txt`：本轮真实 Native、恢复与 Pi 取消路径，3 文件/25 项通过。
- `stage-recovery-green.txt`：正常阶段结算通知失败、原调度/恢复与真实 Pi，4 文件/22 项通过。
- `cancel-lock-submission.txt`：共享锁、正式提交与实际 Pi，4 文件/18 项通过。
- `unit-cancel-metadata-regression.txt`：首次整套发现旧取消元数据约定的遗漏；修复后 `route-native-final.txt` 三文件/32 项通过，再执行完整最终验收。
- `unit-before-stage-fault-fix.txt`：正常阶段通知故障修复前的一次完整绿色运行；最终验收另在 `unit-final.txt`，不混用源码版本。
- `typecheck-final.txt`、`build-final.txt`、`electron-final.txt`、`unit-final.txt`：本轮固定源码的完整验收。
- `source-sha256.txt`：待集成的 56 个变更代码/测试/夹具，文档日志不计入。
- `main-*`：本地 main 集成后的验证和源码匹配（完成后补充）。

结论见 [二次审查报告](../../reviews/2026-11-05-science-pipeline-rereview.md)。localhost 确定性推理仅用于软件验收，不证明真实服务商成功率、科学正确性或成本收益。
