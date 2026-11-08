# 再审查与本地main集成（2026-11-09）

范围与发现详见[审查记录](../../reviews/2026-11-09-collaboration-evidence-merge-review.md)。用户本轮明确授权提交并合并main；不推送、不发布、不替换正式App。单线代码自审，未委派独立审查者。

已复现并修复：旧直接离线命令静默退出、失败夹具没有传播失败、SIGINT没有走取消排空。三个原始失败断言和一个真实子进程取消失败均保留red日志；5项专项green通过。两入口统一接入原research runner，不另写调度/锁/恢复。

本轮新增真实模型请求0。前一轮148次及原始冻结报告保留，不以离线修复冒充重新联网结果。

## 证据

- baseline.json：main与正式profile三文件哈希（不含正文）。
- source-freeze.json：本轮审查后代码冻结。
- fixture-cli-red.log / fixture-cli-green.log / fixture-cancel-red.log / fixture-final-green.log：先失败后修复，含真实分离子进程取消。
- typecheck.log / build.log：退出0。
- full-vitest.log：完整集合，4worker执行中，保留原超时和全部用例。
- prior-demo-close.json：本轮只关闭自己上一轮的隔离候选，实际101ms；不能据此关闭历史问题。

后续追加桌面结果、集成SHA、main验收及实际效果图。历史退出/Bot/MCP/PTY和默认并行长评测超时继续OPEN，1500/4000ms不变。

## 合并前最终验证

712个Vitest文件7057通过/11跳过（4worker，266.19秒），typecheck/build退出0；56项相关Electron全部通过（4.6分钟），含MCP流取消、向导/旧状态、普通/ACP方案、Bot/subagent、版本/恢复与两类终端退出。全量后仅把新增CLI测试的路径断言改为平台原生basename，3项直接CLI用例再次通过；应用代码不变，差异与最终冻结另存。实际旧命令运行另留legacy-cli-demo，六题6合格配对。正式profile及main再次核对不变。历史退出/PTY与默认高并行长测试超时仍OPEN，阈值不变。

## 本地集成及 main 复验

代码提交 `e57d6b66` 已从 `899463dd` 快进到本地 main，无冲突。main 重新构建、类型检查退出 0，4 项 Electron 冒烟通过（17.1 秒），覆盖批准方案执行及展开返回、单块自动安排、旧跳过状态与可用模型入口。1666 个冻结源文件逐一核对无差异；正式配置、凭证、数据库哈希与基线一致。

main 隔离演示使用 localhost 模拟模型（11 次模拟请求，0 次真实请求），Electron/文件工具/契约与版本验收实际执行：3 项宿主验收通过、clean.csv 与 model.csv 两个验收产物；展开流程工作台后 Escape 返回成功。实际截图为 main-approved-arrangement.png、main-expanded-overview.png、main-conversation-demo.png。未推送、发布或替换安装版；专项分支与 worktree 保留。历史偶发退出超时、Bot/MCP 长收尾、PTY 清理和默认高并行长测试超时继续 OPEN。
