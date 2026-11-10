# 合并前复审与实际效果

本轮用户明确授权“审查、修复、补测试后本地提交并合入 main”，不推送、不发布、不替换安装版。前两轮的未提交状态是当时记录，本轮集成结果以本目录和 local-main 子目录为准。

## 新发现：旧批量入口拒绝过晚

`start_science_batch` 对显式缺单位原来在工作区锁和环境发现之后才拒绝。本轮两项反例分别复现意外解释器环境探测和锁等待，见 batch-admission-red.log。

修复复用原模板展开与 scienceReadinessIssue，在公开工具入口提前拒绝；不增加权限、不改调度器、不自动补单位。两种锁状态下都不发现模型、不探测环境、不发布团队；明确补单位后新批次仍可正常创建。

## 实际探针

[公开工具输出](batch-unit-effects.json) · [可重放探针](batch-unit-probe.ts)

探针使用真实共享输出锁及自制 CSV，无环境发现/模型 mock。结果：单位缺失错误、catalogCalls=0、childCalls=0、currentTeamPublished=false、timedOut=false、无科研输出目录、输入字节不变。探针 finally 释放自己的锁并清理隔离目录。

## 审查范围

[检查矩阵](coverage.json) · [专项审查](../../../reviews/2026-11-11-planning-readiness-merge-review.md)

覆盖方案绑定、冻结定义/权限/模型、owner 与执行代次、迟到取消、排空与锁、恢复、普通安排和批量入口。保留原“停止 → 新方案或新批次 → 重新验收”边界，未知副作用不自动重放。

## 效果与验收

修复后 15 个文件、129 项定向测试通过。完整代码测试和 11 项相关桌面结果由 final-verdict.json 记录；main 合并后的再验证由 local-main/verdict.json 记录。实际模型调用为 0，不宣称提问率或费用收益已在真实模型下改善。

历史偶发退出超时、长 Bot/MCP 收尾和 PTY 清理保持 OPEN。正常相关测试退出只增加观察，不关闭历史问题，不调整超时阈值。

## 候选验收结果

类型检查、构建通过；完整代码回归 733 文件、7171 项通过、11 跳过；11 项相关 Electron 通过。

- [候选结论](final-verdict.json)
- [缺单位反馈](desktop/missing-unit-confirmed.png)
- [补齐后双验收](desktop/new-confirmed-proposal-accepted.png)
- [实际 Python 结果](desktop/actual-result.json)
- [实际取消与排空](outcome-desktop/cancellation/fixture.json)
- [退出观察](exit-summary.json)

main 本地集成和复验结果将在 local-main/verdict.json 留存。
