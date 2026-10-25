# 定时任务整轮结算验证

用户授权：逐项独立开分支，修复、验证后合并本地 main，再开启下一项。基线 main：516f7486fcd1f1ce9b9630266e379b45db643611。修复分支：codex/schedule-completion，独立 managed worktree。

## 修复与范围

原实现将每条 agent 文本的 final 当作成功；native 工具链每次模型迭代都会收口文本，因此后续仍在调用工具或遇到模型失败时，定时记录已经成功。现复用 SessionTranscripts.on回合收尾（runtime idle）：整次请求结束才结算；失败保留真实原因，成功摘要取最后 agent 回复。用户停止记取消；宿主取消、超时先结算再 abort，避免同步 idle 抢先成功。创建会话期间取消后不发送任务说明。监听、计时和 abort 钩子统一清理。

未增加协议或重做 UI。成功仅表示模型请求完整结束且无本轮终止错误，不表示科学结果已经通过核验。

## 可复核结果

- 原分支基线：定向 2 文件 11 项通过。
- 新增 9 项真实 backend / SQLite 行为回归。主要提前完成回归先出现 6 项预期失败；用户停止回归单独复现 expected cancelled / received succeeded。修复后 4 文件 75 项通过。
- 最终全量 Vitest：497 文件，5246 项通过、10 项跳过，104.70 秒。
- 类型检查、完整 Electron / CLI / UI 构建通过。构建保留已有大 chunk 提示；单测保留 jsdom canvas 未实现提示，无失败。
- 构建后的真实 Electron：e2e/schedule.spec.ts 共 7 项通过，32.7 秒。包括原有 4 项及新增 3 项：两次工具调用后的最终成功、工具后模型失败、用户停止取消。新用例确认中间回复 final 后仍显示“跑着”，并核对最后摘要 / agent_error / cancelled。
- E2E 使用隔离用户目录、真实运行时与 bash 工具、共用假模型服务；未调用真实模型供应商，未验收安装包或其他操作系统。
- 最后自审：结算幂等；只收目标会话；失败先于成功；超时/取消中止前认领终态；会话退出保留失败；没有文字的正常 idle 不编造摘要；队列容量在中间回复后不提前释放。

原始日志：/Users/liuyue/Documents/Codex/2026-10-25/dawn-science-fixes/schedule-completion/。失败日志 red.log、cancel-red.log；最终日志 green-final.log、full-final.log、typecheck.log、build.log、e2e.log。取消 E2E 曾因测试从未结算记录读取 sessionId 而失败，改为从运行中真实任务取会话后通过，没有为测试增加生产 API。

## 本地集成

验证通过后按已有授权快进合并本地 main，并在主目录复验。具体集成提交与主目录结果另记于下方。未推送，不替换已安装应用。
