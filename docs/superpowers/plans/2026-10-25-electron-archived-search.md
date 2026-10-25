# 归档临时会话搜索修复计划

**Goal:** 摘要就绪后切换恢复会话，保住原搜索定位/高亮生命周期。
**Architecture:** 在App取消归档流程刷新临时会话摘要，不改变跳转/高亮模块及原Electron断言。
**Tech Stack:** TypeScript、React/Nanostores、Vitest异步gate、Electron。

- [x] 5b0d4b4a独立分支；原Electron稳定失败，分层诊断确认元数据缺口引起整段卸载。
- [x] 第一版DOM观察方案已撤回，失败/诊断/全量日志保留，不作为修复通过证据。
- [x] 补App摘要延迟/晚到项目列表回归，先红；最小刷新修复后相关单测/类型/完整构建及未改的整份搜索Electron通过。
- [x] 最终全量Vitest/相关会话Electron，自审与历史/证据记录。
- [x] 提交并本地快进main，主目录复验后继续剩余Electron，不推送。

本地main修复22d88d62；主目录类型/完整构建和归档相关5/5（11.9秒）通过。
