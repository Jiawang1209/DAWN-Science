# 后续审查与逐项修复 — 2026-10-25

起点：本地main `d7b266be`。用户授权继续检查，每项独立分支，验证后合并本地main，明确不推送。上一轮原审查缺陷及838项Electron累计覆盖已在既有记录闭环；本轮复核最近已验收界面的视觉欠账及交付验证的原始数据/进程输出边界。

## 已完成的四项

| 独立分支 | 提交 | 修复与直接证据 |
|---|---|---|
| codex/workspace-visual-baselines | 6ace7655 | 逐张查看旧expected/actual/diff后同步14张已验收工作区界面PNG。脚本、遮罩、容差不改；完整视觉连续两轮14/14，main再14/14 |
| codex/delivery-log-encoding | 735c5026 | 真进程跨块中文/表情曾变乱码；stdout/stderr独立UTF-8流解码和1MiB原始字节预算，截断不产生半字符。3项红回归后55项通过，Electron6项通过，main复验通过 |
| codex/delivery-table-parser | 25b91d8b | 交付核验独立严格解析，保留原始表头、末尾空记录及引号内CRLF，拒绝非法引号被当一致。原预览保持。新增15项首跑10红，最终相关110项及Electron8项通过，main全量5318/10跳过及相关22项Electron通过 |
| codex/delivery-padded-counts | 0c5e3d36 | 末轮发现严格保留表头后的角色识别交互：带空格的计数字段需保持原精确规则。仅角色推断trim，原始列名仍逐字比较，连续值容差保留。4项红后115项及Electron9项通过 |

每项都有独立计划、验证记录及开发历史条目，前一项完成并合并后才创建下一项分支。四个工作树均已通过Codex归档，提交和可恢复快照保留；既有用户开发预览工作树未清理。

## 最终主目录验证

验证源码/测试提交：`0c5e3d36`。本汇总提交只修改文档。

- `npm run typecheck`：通过。
- `npm test`：502文件、5323通过、10项原有跳过，总5333项，110.78秒。没有新增单测skip。
- `npm run build`：Electron、CLI、UI通过；保留原有大chunk构建提示。
- 四份相关Electron规格一次完整运行：23/23通过，57.7秒。视觉14项、既有交付5项、日志1项、严格表格/计数字段3项。
- `git diff --check`：通过。四个修复提交均检查为main祖先。
- 原始复现探针在最终代码上复验：中文/表情保持，表头/空记录/引号内换行差异返回不一致，损坏CSV明确未比较，带空格计数字段保持精确，普通测量字段保持容差。

## 证据与边界

证据根：`/Users/liuyue/Documents/Codex/2026-10-25/dawn-science-next-audit/`。

- `visual-baselines/`：14张原expected/actual/diff、总览图、前后SHA256、连续验证及main复验。
- `log-encoding/`：真实Node/Python与Electron乱码红回归、修复后stdout/stderr预览截图、单测和main复验。
- `table-parser/`：解析红回归、真实文件写入/原文件不变/verification.json状态、Electron截图；新用例最初同名文字定位失误的日志保留，随后限定比较记录，产品未为此调整。
- `padded-counts/`：角色识别红回归、0.01容差下真实Electron仍拒绝计数差异及相关复验。
- `probes/`：修复前后输出；`final-main/`为最终主目录类型/全量Vitest/完整构建/23项Electron日志。

本轮没有重跑全部历史Electron清单；23项是受影响主路径的选择集。macOS真实Electron/IPC/文件/数据库，交付测试使用本机既有Python；模型使用共用确定性mock。未将这些结果外推为真实供应商、真实SSH、Windows/Linux真机、安装包升级或科学结论验收。CSV分隔符检测继续沿用现有逗号/制表符/分号启发式；没有新增任意CSV方言或字段角色协议。

所有修复仅在本地main；未推送、未发布、未替换安装版、未安装解释器或依赖、未修改系统或网络配置。
