# 终端工具栏本地合并检查

## 范围与结论

基于 main `a429f4a9`，复核 `db636bb4` 的“接续旧对话”入口移除。删除内容限于按钮及专用弹窗、样式、翻译；CLI 历史恢复和会话、图片数据保留。没有协议或产品方向变更。

本次新增两条真实 Electron 退出回归：同时保留两个 Normal 或两个 DAWN 终端时退出应用，必须退出码为 0、无信号终止；重启后任务 ID、归档状态一致。没有新增生产代码改动。

## 本轮实际验证

- 完整 `npm test`：497 个测试文件通过，5237 项通过，10 项既有跳过。
- `npm run typecheck`、`npm run build`：通过；新增用例后再次类型检查通过。
- 全部终端 E2E，加方案、结构化问答、会话输入、附件、ACP 与 Bot 入口：130 项全部通过。
- 新增 `e2e/terminal-shutdown.spec.ts`：2 项通过，包含退出和真实重启。
- 实际分支预览：使用原隔离资料目录，恢复原问答会话及已选答案，按钮已移除；保留活动 DAWN 终端后正常退出，进程退出码为 0。

## 退出日志复查边界

最初关闭长驻分支预览时，日志曾出现一次原生 `Napi::Error`，进程退出码为 134。保留原日志，不把它描述为已修复。两种双终端退出回归和原资料目录的活动 DAWN 退出复查均未重现，退出码均为 0。本次没有据此修改资源收尾实现。

原记录：`/Volumes/RPython/DAWN-previews/terminal-toolbar-20261025-AnIUjg/preview.log`。
复查及预览记录目录：`/Volumes/RPython/DAWN-previews/main-20261025-toolbar-HxeCir/`。
测试详细日志：`/tmp/dawn-toolbar-merge-unit.log`、`/tmp/dawn-toolbar-merge-electron.log`、`/tmp/dawn-toolbar-merge-shutdown.log`。

## 集成边界

仅合并到本地 main，保持原会话、归档和隔离预览资料。未推送、未替换安装版。主 checkout 的复核日志及状态保存在主仓库 `tmp/terminal-toolbar-main-review/`，预览可用性以其中的 `ready.json` 为准。


## 主 checkout 集成复核

- main 实际 checkout 的类型检查、完整构建和 33 项重点测试通过。
- 空状态返回、待审方案历史恢复：3 项 Electron 用例通过。
- 问答恢复与两种模式双终端退出、重启：独立复跑 4 项通过（34.5 秒），退出码为 0 的断言保留。合计复核 7 个不同用例。
- 首次 main 复核中，问答页面断言已完成，但夹具等待 Electron 关闭超过清理预算；临时诊断后已恢复夹具原文件，没有提交诊断代码。独立复跑没有更改产品代码或放宽超时。
- 同期向预览盘复制检查记录时出现文件系统阻塞，随后 `/Volumes/RPython` 不再挂载。记录时间上的并发，不断言两者的因果关系。
- 原隔离资料目录位于该卷，因此未重新启动 main 的原会话预览，也没有改用空资料覆盖原会话。磁盘恢复挂载后可沿用原资料启动。
