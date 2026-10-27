# 产物极简流程验收

日期：2026-10-28。分支 `codex/artifact-provenance`，基线 `846e1c35`。继续使用原独立工作树 `/Users/liuyue/.codex/worktrees/artifact-provenance/dawn-science`；没有提交、合并、推送或替换安装版。

用户随后批准最终检查及本地 main 集成；最新结果见 [本地 main 最终检查](2026-10-28-artifact-provenance-main-verification.md)。下文保留本次极简流程阶段的验收事实。

## 用户可见变化

- 默认产物页只保留结果、历史、更多菜单，交付说明和交付页签移出日常视图。
- 文件预览旁直接点“保留”：自动按文件名/当地时间命名，保存后仍显示原预览，不先打开管理页或填写表单。
- 来源默认是一句摘要；代码、输入、环境、日志、Run/哈希、观察历史、核对及缺口在关闭的“详细来源”里。组合、名称、备注和限额在“更多保留选项”里。
- 历史只列真正留存的版本，点文件直接读固定副本；冻结来源、删除确认和版本交付仍可按需进入，默认不显示 JSON。
- “已保留”需核对当前文件身份。已留存记录对应的当前文件被外部修改时，不能继续误标已保留；保存当前内容作后补身份，旧记录不变。若在核对与复制之间又变化，则先拒绝，再由用户明确选择保留更新内容，不能静默冒用旧来源。
- 未修改数据库、协议或留存服务；本轮改变界面组织和保存入口。

## 实际验证

原始日志、截图和隔离体验备份在 `/Users/liuyue/Documents/Codex/2026-10-28/dawn-artifact-simple-flow/`。

| 检查 | 结果 | 证据 |
| --- | --- | --- |
| 新流程 RED | 旧界面在默认表单/详情、一键保存、历史入口及次级交付等断言上先失败 | `dawn-artifact-simple-red.log` |
| 变化文件 RED | 文件漂移后不允许自动回退；需提供用户明确选择的当前内容保存动作 | `dawn-artifact-simple-drift-red.log` |
| 保存状态 RED | 外部修改后仍显示已保留的缺口先被检出，再补当前身份核对 | `dawn-artifact-simple-status-red.log` |
| 最终相关 UI/契约 | 5 文件、139 项通过：保留/来源、交付、产物预览、设计与 i18n | `dawn-artifact-simple-related.log` |
| 完整 Vitest | 534 文件、5619 项通过，10 原有跳过；包含实际 Python/R 文件采集和留存 | `dawn-artifact-simple-vitest-final.log` |
| 最终类型与构建 | 通过；既有 eval/大 chunk 提示未通过调整阈值隐藏 | `dawn-artifact-simple-typecheck.log`、`dawn-artifact-simple-build.log` |
| 最终新 Electron | 4/4：预览内一键保留、覆盖后直接旧副本、960×640 英文窄面板、只读查询/后补身份、真实 Python/R 环境与 Run 关联 | `dawn-artifact-simple-electron-final.log` |
| 最终原有 Electron | 30/30：产物/路线/预览、真实交付与身份/表格/日志回归、全部 14 张原视觉基线 | `dawn-artifact-simple-regression-final.log` |
| 英文窄页头 RED/GREEN | 原标题被分成两行，增加实际 Range 文本行数及布局边界检查；修正后标题一行、动作不重叠、不超出页头 | `dawn-artifact-simple-narrow-red.log`、最终新 Electron 日志和 `simple-artifacts-narrow-english.png` |
| 界面人工检查 | 查看中文默认保留、固定副本预览、英文窄面板及实际体验窗口；来源/表单关闭，结果预览保留 | `retained-result-panel.png`、`retained-history-preview.png`、`simple-artifacts-narrow-english.png`、`preview-ready.png` |
| 代码与范围检查 | `git diff --check` 通过，package.json/锁文件/原视觉截图无修改；手工自审，无子 agent | 本分支 diff 与本记录 |

完整 Vitest 后只继续调整页头菜单文案和不换行样式，并补充真实文本行数/布局断言；这部分以最终 139 项相关测试、类型/构建、新 4 项与原 30 项 Electron 再验证。没有为了单纯刷新计数重复全量测试。

## 原体验资料与重新启动

使用同一独立 profile：`/Users/liuyue/Documents/Codex/2026-10-27/dawn-science-artifact-provenance/experience-2AeZiu`，没有新建空数据库来替换用户的体验资料，也没有关闭其他预览进程。

- 先做 SQLite 在线备份：`experience-pre-restart.db`；记录旧留存 payload 和 12 个管理对象/工作区文件身份，见 `experience-pre-restart.json`。
- 只重开当前聊天启动的旧预览进程。启动后核对原 1 组留存 payload、全部 12 个文件无变化，见 `experience-restart-check.json`。
- 随后核实输入、原结果和第二版脚本仍为本聊天准备的合成示例，再通过真实 Notebook 运行完整第二版代码，记录 `data/raw/plots.csv` 输入声明；不依赖重开前的内核变量。
- 当前工作区第二版 CSV 为 `v2,n=4,mean_y=7.75`；原留存副本仍可读为 `v1,n=6,mean_y=6.1667`。第二版图片同步由真实 Python 重画；未替用户按下保留。
- 最终窗口停在第二版 CSV 预览，主按钮可用、显示“保留”；历史能直接读第一版。进程信息和实际旧字节检查保存在 `preview-ready.json`，窗口保留运行供用户体验。

本轮自动化的模型回复仍为共用确定性 mock；Notebook 和独立交付的解释器/文件执行为真实。界面易用性需用户实际体验反馈；这些检查不表示科研结论得到独立核验。本地采集覆盖和未捕获输入/变量的边界沿用首次实现。
