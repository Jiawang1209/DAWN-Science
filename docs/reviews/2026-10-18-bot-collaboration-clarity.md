# Bot 协作状态、总览与交付入口验收

分支 `codex/bot-collaboration-clarity`，基于本地 main `6bcbd43e`。按用户批准的三栏布局实施；不合并、不推送、不替换安装版。

## 行为与边界

- 主对话只显示一张团队摘要，入口打开已有 Bot 坞的团队总览或交付清单。
- 主摘要、成员行和任务详情共用结构化状态投影。任务“已返回”与成员“可接新任务”分别表达；一次协作回应不计为完成一个任务。用户问题、权限、队友等待、回应后待继续、依赖、失败、中断与取消分别保留。
- 单行成员列表；查看结果和选择发言对象互不影响。详情保留任务详情、停止、补充要求以及成员执行对话；真正的问题仍在实际成员对话里回答。
- 团队总览 → 成员结果 → 文件列表 → 文件预览。预览占用当前内容区，关闭或返回后回到文件列表并恢复文件按钮焦点，避免长列表把图像推到屏幕外。
- 完整讨论保留原追加顺序、稳定头像、发送回执、逐成员处理状态、原消息内文件预览及阅读位置。总览没有用额外模型调用生成摘要。
- 导航、选定成员、团队发言草稿、对象、请求回执和任务补充草稿按 owner/session、workspace scope、team 分开保留。异步打开任务检查存活及作用域。
- 文件索引只使用运行时写回的 completed task/current attempt `artifacts`，按完整路径去重；保留登记成员、任务和 attempt 来源。分类为图、表格与数据、报告、脚本、其他。不会解析任意回复正文或扫描整个项目来补数量。
- 文件核验沿用现有后端根目录/realpath/文件读取守卫；“已核验文件”表示交付登记时经过现有核验，不代表科研结论已经审查通过，后续删除会在预览中报错。纯文本回应可无文件。旧 attempt 返回不能阻塞当前任务或混入当前交付。

## 验证

- 实施过程全量 Vitest：432 文件、4,785 项通过，10 项原跳过；日志 `/tmp/dawn-bot-clarity-tests-final.log`。
- 最后预览布局修正后定向 41 项通过，覆盖状态、attempt、文本结果、导航、补充失败保留、文件预览关闭/焦点、范围和迟到读取；日志 `/tmp/dawn-bot-clarity-focused-final.log`。
- 最终 typecheck 与主进程/UI 构建通过；日志 `/tmp/dawn-bot-clarity-typecheck.log`、`/tmp/dawn-bot-clarity-build.log`。构建沿用既有 direct-eval/chunk-size 警告。
- 最终实际 Electron E2E 8 项通过（两条协作、三条派单、一条依赖团队、两条直接对话）；日志 `/tmp/dawn-bot-clarity-e2e-final.log`。测试继续执行真实运行时、IPC、持久化和工具，而非向 DOM 填造状态。
- 实跑确认总览/成员/文件/讨论/助手/成员执行对话之间切换，草稿和对象不丢；关闭预览恢复触发按钮；通过实际分隔条拖到 280px、实际设置切换亮暗主题。已检查无横向溢出、预览标题和关闭入口可见、图形可解码、代码高亮、表格及报告可读。
- 确定性推理只证明工程链路；不把它作为真实模型科研判断质量的证据。未改调度器、远端执行策略或安装版。

## 保留的实际预览与案例

工作树 `tmp/bot-collaboration-acceptance-20261018/`（Git 忽略）保留隔离数据库、配置、Electron userData、案例工作区和截图，预览保持打开。该目录只用于验收，不提交。

- owner `17d1cd80-e20e-4869-93b6-de1da7101f01`，team `team-mvdu0xa3`。
- 输入 6 行，第六行 y=-999；实际用户问题要求选择缺失值处理策略，界面回答后才继续。数据 Bot 查字典并反问统计 Bot，统计 Bot 拟合后交接绘图，绘图 Bot 再确认图形要求。
- 实际 1 项任务、3 位成员、4 次双向请求/交接均回应且已接回；不会把两位协作成员虚报为另外两项完成任务。
- 真实 Python 输出 n=5、excluded=1、slope=2、intercept=1，原始 input.csv 按字节不变。清洗数据和 JSON 结果也保留在文件中；本轮任务显式登记了 6 个可预览文件，不能将“项目中存在”一概算为本轮登记交付。
- `acceptance-evidence.json` 保存模型结果、实际任务/交接状态和 10 个输入输出的 SHA256；`workspace/.dawn/sessions/.../teams/.../team.json` 是真实团队记录。
- 截图：`01-waiting-for-answer.png`、`02-question.png`、`07-overview-final.png`、`09-file-preview-final.png`、`10-narrow-script.png`、`11-dark-narrow-script.png`、`12-dark-narrow-image.png`、`13-dark-narrow-overview.png`；最终常规宽度截图另存 `14-final-overview.png`。

后续验收可从主对话摘要进入总览，打开统计助手结果及其脚本/表格/报告/图形；完整讨论可追溯四次交接和已回答的问题。远端文件仍走既有读取边界，本次没有真实远端服务器实跑。
