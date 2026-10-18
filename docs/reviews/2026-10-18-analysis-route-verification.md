# 会话级分析路线验收记录

基线 fecaaad4；分支 codex/analysis-route。用户批准实现，不合并、不推送、不替换安装版。资料使用隔离合成任务，原项目和既有预览草稿保留。

## 工程基线

`npm test`：414文件通过，4621项通过、10原设置跳过，83.21秒。日志 `/tmp/dawn-analysis-route-baseline.log`。既有canvas提示保留，未据此更改断言。

## 分阶段证据

- 模型与原子路线簿：40项定向测试、类型检查通过；规格与质量审查通过。最终基础提交 `e6489857`。
- 原生接线：主提交 `66748d15` 定向24文件489项通过；重复工具ID观察隔离提交 `96ff283b`；规格修正 `b3f25911` 后定向6文件58项、类型检查及构建通过。规格审查独立复验相关2文件12项通过。
- 规格复核发现并修复：实际发送路线动作时忙则拒绝，不进入followUp队列；案例正文检查不跨其他case_id。新回归先失败再通过。
- 向导文案独立RED/GREEN文本演练：旧文案缺结构化版本/CAS/留存要求，新文案补齐。只验证文字决策要求，不计作实际工具运行或科研质量验收。
- 质量复核发现并修复：明确拒选/不明确语句不得写入案例选择；shell预检失败、无法证明启动时保持not_observed，只有真实输出或数字退出记录支持运行事实。提交 `912567e0` 定向10文件129项通过，独立质量复验7文件86项通过，规格和质量均通过后进入UI阶段。
- 旧方案模式布局断言基线：独立checkout `fecaaad4` 构建后，运行 `npx playwright test e2e/plan-mode.spec.ts --grep '三颗按钮与开关常驻看得见|开关只留图标|ACP 会话'`，同样3项失败，均为helper要求plan-toggle-wrap直接父元素是composer-footer，而现有结构含composer-tools包装。日志 `/tmp/dawn-route-plan-baseline.log`；现场复制到预览目录 `baseline-plan-failures/`。基线checkout已确认归档，主分支未修改。已校正为最近附栏归属，保留位置/可见/不横滚/不遮盖验收，3项通过。
- UI 主提交 `1f08bb50`，规格修正 `4a0e400d` 历史引用不借当前文件事实，质量修正 `d940a1ce` 最新读取错误可见；独立规格27项、质量29项复验通过。
- 真实预览发现路线metadata被误计“产出未知”，`11fd7125` 只给成功的两件路线工具记录空工作区文件事实，普通/失败工具逻辑不变、旧账不回填。真实pi/MCP/RunStore回归先RED后GREEN，独立整体复核通过；预览新会话实际只生成1份报告，无unknown提示。
- 全量首轮仅5项失败：两组旧会话恢复测试替身缺 `getAnalysisRoute`，未触发生产恢复逻辑。独立复现后只补两行接口（`826a8992`），不改原断言；8项定向通过。随后全量424文件、4750项通过，10项原跳过，85.23秒。日志 `/tmp/dawn-analysis-route-final-green.log`。
- root独立类型检查、构建通过，保留既有canvas/eval/大chunk提示。相关Electron共18项通过（58.7秒），覆盖路线、案例、方案、坞自适应与真正会话重启。日志 `/tmp/dawn-analysis-route-final-typecheck.log`、`/tmp/dawn-analysis-route-final-build.log`、`/tmp/dawn-analysis-route-final-e2e.log`。

- 最终生产修正 `363899ad`：实际重启时首次读取早于Native恢复，界面补订阅既有会话状态变化，恢复完成自动重读同revision证据，不轮询、不自动执行。真正重启Electron断言先RED后GREEN；规格/最终复核通过。root在可见预览实际关闭重开，确认无需手动刷新恢复文件事实、参考选择和未运行/未审查状态。
- root在 `363899ad` 重新跑全量：424文件、4750项通过，10项原跳过，88.04秒；类型检查与构建通过。日志 `/tmp/dawn-analysis-route-final-363-vitest.log`、`/tmp/dawn-analysis-route-final-363-typecheck.log`、`/tmp/dawn-analysis-route-final-363-build.log`。

- 最终Electron复跑曾出现metadataCount 15→16：原始请求证明新增是useNextPrompt延迟400ms的无工具建议调用，不是skip/restore模型调用。测试通过待发草稿→清空稳定RED，现等待可见data-ghost完成再冻结未过滤总请求数；严格相等断言保留，生产代码不变。日志 `/tmp/analysis-route-metadata-count-red.log`、`/tmp/analysis-route-metadata-count-green.log`；路线+会话恢复+下一句建议5项通过（28.9秒），真实路线连续重复3次通过（37.9秒）。测试修正提交 `22e26c86`，独立最终复核通过，生产代码仍为 `363899ad`。

## 交互与视觉验收结果

以下“实看”为隔离 Electron 窗口经真实点击、工具调用与文件读取后的结果；自动化状态边界另列，避免把测试覆盖写成全部实看。

| 用户可见要求 | 实际结果与证据 |
| --- | --- |
| 对话摘要和路线坞 | 创建路线不自动打开坞；点摘要后进入单列路线。新会话无继承路线。最终 `route-overview-final.png`，480px、亮色。 |
| 步骤与案例 | S1参考实际为 mlai-science / 20251017-e2e-alpha-diversity；选择不增加模型请求；详情打开同完整ID的真实测试案例地址。 |
| 查看与补检索 | 查看实际仅调用get；补检索实际get/search/update，候选去重为1；实际消息保留动作标记，画面显示可读步骤动作；未调用代码执行工具。 |
| 继续单步 | 仅S1调用get/write/update生成说明报告，S2/S3仍待开始。S3依赖阻塞可见。忙碌、租约、版本冲突和只读限制由后端/UI自动测试覆盖。 |
| 进度与证据分离 | S1已交付，Agent执行仍未运行，审查仍未审查；文件显示观察到工具生成，主对话仅1个文件且无未知产出。 |
| 文件查看 | 真实报告可展开、还原、关闭；文件列表在上。将本次自建报告移走后可见文件缺失与重试，恢复后能读取，输入资料未删除。`route-reading-final.png`、`route-missing-file.png`。 |
| 跳过与恢复 | S3跳过/恢复前后模型请求数不变，原记录留存；状态和恢复入口可见。 |
| 修改与历史 | 实看旧版本只读、无继续入口，旧文件引用不借当前生成事实，展开时仍标明读取当前路径。`route-history-reading-light.png`。修改前置条件导致复核、路径越界拒绝由协议/运行时自动测试覆盖。 |
| 恢复与隔离 | 真实关闭、重开本次窗口后路线/选择/交付恢复；修复后无需手动刷新即可显示工具生成事实。跨会话晚返回、中断及回退需复核另有自动回归。 |
| 响应与键盘 | 实看亮色480px、英文暗色480/280px、长标题亮色280px；窄坞无横滚，Space/Enter展开、Tab能到动作。`route-480-dark-en.png`、`route-280-dark-en.png`、`route-long-280-light.png`。 |

工程mock只证明协议、工具、状态和界面贯通。本次没有执行科研计算，也没有验收真实模型判断或科学结论；报告正文明确标注未运行、未独立审查。未实连SSH机器，远端解析与协议边界由自动测试覆盖。

截图均保存在下述隔离预览目录。早期截图含修复前的旧产物账本，仅作对应交互证据；最终概览和阅读截图为修复后新建的验收会话，不回填旧账。

## 独立预览准备

目录：`tmp/analysis-route-preview-FQkoUV`，新建独立配置、数据库、用户profile与workspace，不复用已安装软件或旧预览草稿。合成输入为3个ASV、6个样本的计数表及分组表；只用于工程演示，不执行科研计算。

## 最终保留状态

功能与验收留在 `codex/analysis-route` 及本独立worktree。主checkout仍为 `main` / `fecaaad4` 且干净，未合并、未推送，未触碰 `/Applications/DAWN Science.app`。隔离可见预览保持打开在480px亮色路线概览；三步中仅S1交付一份明确未运行科研代码的工程说明报告。
