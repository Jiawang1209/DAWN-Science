# 交付引导、待确认闭环与协作台验收（2026-11-09）

基线main38ba63ef，专项工作区codex/delivery-guidance-20261109。按用户确认先实施优先级1/2并调整对应信息层级。未提交、未合并，不推送发布，不替换正式安装版；正式配置、凭证和数据库只核对哈希。本轮0次真实模型请求，所有模型交互为localhost自制夹具。

## 可以看到的变化

- 已有宿主科学契约时可用内容绑定的contractRef，工具展开完整契约进入旧方案/批准/冻结流程，避免抄写acceptance。目录目前由可信宿主注入，科研评测已接入；无目录普通任务继续完整契约，不猜科学规则。
- get_task_status的deliveryGuide列出精确产物、审阅路径、JSON与metrics字段和本轮可用证据；不生成数值或审阅结论，不代替submit_task_result。长字段标记省略/截断，原32KiB边界不变。
- 待确认方案显示问题与逐项回答；补齐后生成新版本，采纳前不执行。重启恢复原方案问题；当前窗口的未发送回答按会话和完整方案身份保存，可切换面板返回，不串给其他会话或新版。
- awaiting-info评测单列，不能算合格交付或正确科学阻塞。已结束但没有正式提交的审阅提示，要求确切失败、排空、执行代次与宿主提交观测。
- 主摘要常显成果、阻碍、下一步；版本与额度可展开，流程工作台与原详情入口保留。

## 实际效果

- stage-a-effect.json：实际propose_plan和TaskSubmission投影，不是模型质量实验。
- desktop/stage-b-awaiting-info.png、stage-b-new-proposal.png：真实Electron待确认及补充后新方案。
- desktop/stage-c-summary.png、stage-c-versions.png、stage-c-expanded.png：摘要、版本与展开返回。
- demo-final-answer-preserved.png、demo-final-summary-dark.png、demo-final-versions-dark.png：最终构建的深色主题操作实拍。
- interactive-observation.json：切换面板后保留mg/g，采纳前无输出，采纳后1项宿主验收、7次模拟请求、0次真实请求。

## 日志与限制

保留所有red/green及原始桌面失败trace。首轮full-vitest.log捕获两个旧定制fixture仍读旧契约提示的超时及34401字节检查点超限；修复后专项通过，不增加30s或32KiB阈值。手动发现草稿丢失后补复现与共享视图缓存，126项相关UI/设计/返回测试通过。

最终完整Vitest、相关Electron、源码身份与正式profile核对结果会在下方追加。期间仅强化了awaiting-info测试实际输出目录的断言、将演示元数据reviewedPath改为acceptedArtifactPath；应用代码保持最终冻结，额外单项通过与最终桌面分别验证这些测试改动。旧冻结manifest保留。

当前验证不证明真实模型成功率、费用或复杂科研收益提升。未发送答案只在窗口内保留，不承诺其跨应用重启持久化。单线自审，未委派独立审查者。历史7350/20690ms退出、长Bot/MCP收尾与PTY清理继续OPEN，1500/4000ms不变。

## 最终结果

- 完整Vitest：716文件7074通过/11跳过，263.49秒，full-vitest-final.log。
- 首轮58项Electron：57通过/1失败，desktop-final.log；取消入口修复后147项UI定向及10项相关Electron全部通过，b-stop-entry-green.log / desktop-stop-recheck.log。旧失败不覆盖。
- 最新类型/构建退出0：stop-final-typecheck.log / stop-final-build.log。
- 科研离线：fixture-final/research.md六题6合格配对，真实文件/Python/契约/内容版本运行；awaiting-info-evaluation/research.md等待信息场景没有启动执行，不算合格交付或正确科学阻塞。汇总见final-evaluation-observation.json。
- 最终宿主工具引导：stage-a-effect-final.json；取消入口、答案与文件检查：interactive-cancel-observation.json。
- 退出：exit-summary.json，87次观察最大252.13ms，0非零退出、0原生关闭错误事件；历史退出与PTY仍OPEN。
- completion-state.json和source-freeze-delivered.json：1739源文件、全量后4文件差异与复验、main及正式profile哈希核对。

本轮目标完成，代码留在专项工作区，未提交合并；不推送发布，不替换正式App。独立候选窗口可继续操作，模型仍为本地模拟。
