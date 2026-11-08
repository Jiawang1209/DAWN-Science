# 默认自动安排验证索引（2026-11-08）

## 交付与使用

用户只描述任务，默认由当前会话模型提出拆分、角色与依赖；任务块数来自提议结果，不再先填数字。结果置前，可修改可读方案或用自然语言重新安排。先只读规划，采纳后仍进入原执行/验收/恢复。

实现留在 `/Users/liuyue/.codex/worktrees/dawn-mode-member-workspace-20261108/dawn-science`，分支 `codex/mode-member-workspace-20261108`。沿用前轮未提交成果；本轮未提交、未合并、未推送、未发布，不替换已安装 0.0.44。main 保持 d0b6ca78。

入口：[具体计划](../../superpowers/plans/2026-11-08-auto-arrangement.md)、[设计](../../superpowers/specs/2026-11-08-auto-arrangement-design.md)、[复审](../../reviews/2026-11-08-auto-arrangement.md)、[使用说明](../../任务安排与成员会话-怎么用.md)。前轮手工表单报告和原图保留在兄弟目录，不能作为自动安排证据。

## 软件链路与阶段效果

复用 getSessionPlan → 原租约 → dawn.plan → writeToSession → Native/Pi → propose_plan → 方案簿；结构化 arrangement 经宿主校验转为单份可读 Markdown。显示、手工编辑和批准都重新解析它，不新增任务规划数据库或另一套调度器。

| 确定性模型夹具中的任务 | 软件实际结果 | 证明边界 |
|---|---|---|
| 只计算 input.csv 均值 | 1 个任务块，单任务 | 不强行拆三块 |
| 分别统计 east.csv / west.csv | 2 个任务块，并行、分开输出 | 数量/角色来自工具参数，UI 不猜语义 |
| 清洗、建模并独立审阅 | 3 个任务块，按前驱依赖，审阅角色单列 | 未启动 Agent 或科研执行 |
| 合并前两步，保留独立审阅 | 2 个任务块，第 2 版，重启仍为 2 块 | 调整与原方案版本/恢复贯通 |
| 首包返回前中止规划，再生成 | 等待标记收起，文本保留，可再次生成 | 真正中止在途回合，不以完成后点击冒充取消 |

最终真实 Electron 截图目录为 `desktop-delivery/`：`stage-a-auto-default.png` 是默认入口，`stage-b-task-1/2/3.png` 是完整界面，`stage-b-result-1/2/3.png` 是软件直接截取的结果区域，`stage-b-adjusted.png` / `stage-b-adjusted-result.png` 是调整后结果，`stage-c-restored.png` 是重启恢复，`stage-d-cancelled.png` 是取消后状态。未手工编辑图片，未更新既有视觉基线。

## 最终验证

最终源码冻结后，`delivery-*` 命令串行完成。命令、退出码和耗时见 `delivery-checks.json`；汇总见 `final-summary.json`。

- 类型、完整构建和原 evaluate:science 的新增 `--auto-arrangement` 入口：已通过；离线 4/4 场景，模型联网请求 0。
- 完整 Node/UI：683 文件，6863 通过、10 既有跳过；相关 Electron 21 + 侧边会话 1 = 22 场景全部通过（`delivery-node-ui.log`、`delivery-desktop.log`、`delivery-side.log`）。
- 本轮未改内核执行接口，也未重跑独立 kernel 项目；没有把前轮内核计数算作本轮结果。

## 复审发现与修正

1. 显式自动安排请求遗漏结构时，旧工具会当普通方案交回。新增按当前分支请求绑定的 requireArrangement；错误参数不写方案、不终止为成功。
2. 审阅标记、角色/依赖关系、并行共写和人工编辑降级需要宿主守门。补结构校验与原 answerPlan 保存前校验；数量从正文重算。
3. Markdown 围栏内的示例不能当真实规范节。补围栏感知及旧方案兼容测试，不能通过未闭围栏隐藏自动安排节。
4. 回合结束却没有新有效方案时，界面不能一直称为已发出。补原完成标记的反馈与错误入口。
5. 新校验错误需要既有双语 fault 返回。全量初跑捕获 fault-i18n 准入失败，已使用本地化 invalid_request，未扩大原样白名单。
6. 外部规划取消漏清对话本地“等待首字”。复用原转录槽增加非持久、精确 inputId 的界面停止确认；只在宿主返回且身份仍匹配时清理，原排队撤回继续交回所属输入框。不同槽隔离、切换清空、新输入重新等待。它不表示产物已验收或执行已持久排空。
7. 迟到停止请求不能误伤新一轮：读取模式后、发出 abort 前核对输入；返回后再次核对 owner/窗口代次/inputId，旧确认不能清新等待。

本次为当前会话源码自审，没有声称独立子 agent 审查。原 readonly 方案门、权限、契约、产物锁、恢复与退出上限均未放宽。

## 保留的失败与中间证据

- `a-*-red.log`、`b-ui-red.log`、`review-*-red.log`、`cancel-waiting-red.log`、`stop-generation-red.log`：实现或补修前的反例；对应绿灯日志均保留。
- `full-node-ui.log`：首次全量 fault-i18n 失败；随后 `full-node-ui-final.log` 6860 通过/10 跳过是取消补修之前的中间结果。
- `c-desktop-first.log` / `playwright-a/`：重启定位器使用了错误旧路径的失败现场。
- `completion-typecheck.log`、`cancel-fixed-typecheck.log`、`stop-verified-typecheck.log`：测试夹具/测试数据类型错误，最终已纠正；没有放宽类型检查。
- `final-desktop.log` / `playwright-completion/`：取消夹具用了不适用于工具回复的 thinking 延迟，方案早已完成；20 通过、1 失败，不称全绿。
- `verified-cancel.log` / `playwright-cancel-final/`：首包延迟后复现真实的等待标记未收起，保留 trace 和失败图；修复后取消再规划与侧边用例通过（`stop-reviewed-*`）。
- `accepted-node-ui.log`：在全量运行期间增加停止代次反例，旧模块加载未包含新导出，1 失败/6862 通过；保留现场，最终冻结后重新完整运行，采用 `delivery-*` 结果。

## 指纹、作用域与历史退出跟踪

`source-freeze.json` 冻结 663 份 src/scripts 文件；前次版本存于 `pre-review-source-freeze.json`、`pre-cancel-fix-source-freeze.json`、`pre-stop-generation-source-freeze.json`。`audit.py` 可重复只读核验当前源码、main、修改前 32 份文件的存在及各桌面进程退出；输出 `audit.json`。修改前原始快照为 `/tmp/dawn-auto-arrange-20261108/before/`。

宿主/OS 退出诊断分别保存在各 `exit-*/app-*.jsonl` 与 `exit-*/exit-*.jsonl`。时长从 close-requested 相减，不能把启动后累计 ms 当成关闭耗时。最终批次 24 次原生进程退出均 code=0、close 返回且无诊断异常；OS close 最大 236.864ms，app.close 最大 237.136ms。全部中间/最终批次合计 62 次退出也逐条留存。

历史 7350/20690ms OS 退出、长时 Bot/MCP stopping 继续 **OPEN**。本轮没有修改退出代码，1500/4000ms 原预算不变；本轮退出通过也不能证明历史偶发根因关闭。

没有新增付费 API 请求，没有读取正式凭证或更换正式 App/数据。localhost 确定性模型 + 真实 Electron 证明交互与数据流，不能证明真实模型拆解质量、费用节省或科研结论。本轮未做全产品桌面全量、跨平台或慢机器验证。

最终状态：源码自审及上述检查无剩余阻塞，待用户验收。663 份源码零漂移，修改前 32 份文件无缺失，main 干净且保持 d0b6ca78。源码/测试/文档范围指纹见 `changed-files-sha256.json`；本目录证据指纹见 `evidence-sha256.json`。
