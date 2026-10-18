# 科研路线状态实跑：合成土壤呼吸

用户要求：在实际预览中运行一个新案例，看“处理中、等待确认、已交付”，并实际切节点和看产物；不合并、不推送、不替换安装版。继续 `codex/analysis-route`，本轮无提交/合并/推送。

## 真实性与边界

新隔离目录为 `tmp/route-state-live-5oyjk8yd/`，工作区 `soil-respiration-demo/`，会话 ID `7e66e7ff-c8df-4bad-b27f-4bf2b4fbae3a`。先尝试真实 DeepSeek，但从此前开发预览复制的加密凭证在新窗口无法解密，未能开始真实模型推理；失败的隔离窗口已关闭，其临时凭证副本已移除，来源凭证与安装版未改。

已向用户说明后，采用共享 mock 推理服务的确定性场景调度，调用真实 `read/write/bash/update_analysis_route/ask_user_question`。R 进程、文件写入、提问/回答、路线持久化与 UI 走原有链路；没有注入 DOM 状态、伪造运行/交付或把外部模型能力列为本轮通过项。UI 仍沿用开发 agent 的 DeepSeek 名称，不能据此称为真实 DeepSeek 分析。每个 R 脚本内 12 秒观察停留明确写在脚本、日志、对话与报告中，仅为看清界面，与算法或计算耗时无关。

输入由 `random.Random(2026101802)` 生成：32 个独立模拟样地，control/warming 各16个，无配对、重复测量或区组。全部结论限定合成演示。

## 实际走过的路径

1. 实际读取设计说明、建立 S1 输入核查 → S2 Welch 两组比较 → S3 图表与中文报告；未点击的步骤不自动执行。
2. 点击 S1 后真实运行 `01_qc.R`。图中 S1 处理中，切看 S3 后位置仍为 S1，S3 等待前置且不能启动。S1 6项QC通过后登记交付；打开实际QC CSV。
3. 点击 S2，真实 ask_user_question 弹出报告呈现格式卡，图中 S2 橙色等待确认、S1 已交付。演示操作选择中文简报并提交；这是呈现偏好，不是替用户批准权限或改变既有执行门。
4. S2 真实运行 `02_welch.R` 时切回 S1 并打开 QC CSV；图仍显示 S2 处理中，浏览外框在 S1，预览不隐藏图、不改变执行位置。
5. S2 交付后单独点击 S3，实际运行 `03_report.R`，输出中文 Markdown 与 PNG/PDF。图中最终三步全部已交付。路线最终第10版；执行与交付记录保留，verification 仍为 unreviewed。
6. 原图纵轴未覆盖最低离群点，保留 `before-axis-fix.png`，从界面恢复并重跑 S3，将 ylim 覆盖全部观测，重新生成图与报告；没有重算S1/S2，统计数值未变。
7. 实际打开报告、展开/还原阅读、查看PNG/PDF、关闭返回；PNG/PDF均包含完整标题、坐标与边界说明。预览保持打开供用户继续查看。现场发生过产物/路线等标签切换；以持久化路线与R日志核对成功，没有把导航变化误记为执行失败。

截图位于上述隔离目录：

- `01-S1-processing-view-S3.png`：S1真实处理中，正在看S3。
- `02-S1-delivered-QC-preview.png`：S1已交付，QC实际表格。
- `03-S2-awaiting-format-confirmation.png`：真实提问等待确认。
- `04-S2-processing-preview-S1-QC.png`：S2处理中，查看S1产物。
- `05-S3-processing.png`：S3处理中。
- `07-final-fixed-figure-preview.png`：三步已交付、修正后的完整图表。

`06-all-delivered-figure-preview.png` 是修正前的过程截图，不作为最终图面验收。

## 真实产物与复核

共13个非空文件：3个R脚本、QC与比较CSV/TXT各2个、3份运行日志、中文报告、PNG、PDF。完整路径、大小与SHA256见 `output-manifest.json`；工具调用/结果去重摘要在 `tool-audit.json`，共28项。路线按步骤登记全部13项；当前“产物”标签只自动收集部分脚本/日志，其他文件从路线“本步产物”查看，不将产物标签的自动收集宣称为全覆盖。

实际统计：warming − control = 0.9015625 μmol CO₂ m⁻² s⁻¹，95% CI [0.1552699246, 1.6478550754]，Welch t = 2.4676870724，df = 29.8529948057，双侧 p = 0.0195553997。报告限定为本组合成样本，不作真实增温或因果结论。

另写 `independent-check.R` 从原始输入直接按 Welch 公式算标准误、自由度和统计量，使用 R 的 qt/pt 求区间/概率，未调用案例脚本或 t.test；12项与产物相差最大 7.11e-15。此为数值核对，不冒充独立科学审查。明细在 `independent-check.csv`。

原始输入 SHA256 仍为 `fce3cb88eb3696394fd5e8784ff1a6257fcc6af0e98a1fdaeb4a870f1d9bbb29`。

## 实跑修正及测试

- 路线 PNG 沿用了按视窗高度约束图片的通用样式，缺少按预览容器高度约束，短窗口中图像高于 stage 被居中截掉。补齐与文件查看器一致的 stage flex/min-height 与图像 height/max-height；文件预览时压缩图节点，给内容更多高度。当前实际窗口中 img 与stage均为244px高，完整图面可见。
- PDF在文件预览关闭后，所属折叠分组重新挂载为关闭，焦点恢复目标不可见。恢复焦点前打开目标文件的祖先details，真实窗口验证焦点回到该PDF。
- 为新科学演示增加共享推理服务的显式 scenario 回调：选中场景时由该场景完整决定工具及回复，避免落入旧“仅工程说明、未运行科研代码”模板；不增加任何业务协议。默认旧演示行为有回归测试。
- 新增/扩展回归先观察失败：独占场景落回旧工具；关闭PDF后焦点不可达；短窗PNG边缘越界。修正后对应测试通过；呈现选“先暂停”不执行统计、没有路线工具时不介入标题/建议调用也有检查。
- typecheck/build通过；全量 Vitest 4,769通过、10跳过；相关 Electron 6项通过，包含660px短窗口PNG边缘、PDF关闭返回焦点、真实工具/提问状态与原路线重启/守卫。日志为 `/tmp/dawn-state-typecheck-final.log`、`/tmp/dawn-state-ui-build.log`、`/tmp/dawn-state-full-final.log`、`/tmp/dawn-state-e2e-final.log`。
- 页面异常0；原始输入未改；本地主目录main仍为 `fecaaad4`，安装版未写入或替换。
