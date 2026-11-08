# 交付引导及编排入口合并验收

## 修复与覆盖

详见 ../../reviews/2026-11-09-delivery-guidance-merge-review.md。三项修复：合法长问题的补信息超限、前置 RPC 期间不能取消补信息、旧窄面板 CSS 隐藏下一步与成果详情。

- long-questions-red.log / long-questions-green.log：问题文本无需重复，答案使用精确方案版本和题号。
- clarification-cancel-red.log / clarification-cancel-green-final.log / pre-send-cancel-green.log / late-ack-green.log：前置 read/acquire/enable 取消不再发送、排空前禁止重入、旧 ACK 不解除新锁、答案保留。
- narrow-red.log / narrow-green.log：真实 Electron 的旧隐藏规则红绿复现；成功/阻塞两种状态均可在窄面板查看下一步，主动展开后版本与额度可见且不横向溢出。

## 新鲜验收

| 范围 | 结果 | 证据 |
| --- | --- | --- |
| 完整 Vitest | 717 文件，7083 通过，11 跳过 | vitest-full-final.log |
| 完整构建 | 通过 | build-final.log |
| 类型检查 | 通过 | typecheck-final.log |
| 相关桌面 | 28 通过 | desktop.log |
| 补信息修复后相关桌面 | 10 通过 | desktop-final.log |
| 窄面板修复 | 2 Electron + 132 UI 通过 | narrow-green.log / narrow-ui-green.log / narrow-build.log |

首轮 vitest-full.log 在修改源码时触发候选变化保护，待确认试验被置为 not-run，不能作为最终通过；原始日志保留。修复 wrapper 初版移除 ACK 后 abort 转发导致一项失败，也保留日志；最终已修正并复验。无放宽超时、验收或视觉容差。

source-freeze-final.json 为完整测试前指纹，post-full-freeze-delta.json 明确此后仅窄面板样式和对应 Electron 断言变化；应用 TypeScript 未变化。最终交付指纹和集成结果随后追加。

## 实际效果及证据保留

actual-observation.json 记录真实候选窗口的补信息取消、答案保留和展开返回；使用本地模拟模型，0 新增真实请求，不代表真实模型质量或科学收益。

关键日志、报告、截图和原始失败 trace 纳入本地提交；其他原始模拟转录、重复截图和测试目录继续原样保留在专项工作区 /Users/liuyue/.codex/worktrees/dawn-delivery-guidance-20261109/dawn-science/docs/validation/。未清理或改写旧证据。

历史偶发退出超时和 PTY 清理继续 OPEN，正常退出观察不足以认定根因解决。1500/4000ms 原预算不变。本次仅本地提交/合并，不推送、不发布、不替换正式 App。

## 本地集成完成

代码提交 ad23c80fee21cec891903ef2507623f3432743e5 已快进进入本地 main。main 完整构建通过，222 项定向测试和 7 项 Electron 冒烟通过；对应 main-build.log / main-vitest.log / main-desktop.log。source-freeze-delivered.json 核对 1746 源文件一致及正式 profile 三文件哈希未变。

exit-summary.json 记录本轮 72 次完整退出，最大 255.68ms、无非零退出或原生收尾错误；历史两项风险继续 OPEN。源码/人工文档 diff --check 通过；原始工具日志保留工具输出中的空白，未为消除日志空白告警改写原证据。

final-chat-clean.png 展示可见编排入口、下一步及旧已验收任务；final-versions.png 展示主动展开的成果版本。候选窗口使用 localhost 模拟模型，与正式配置隔离，最后停在正常对话页。
