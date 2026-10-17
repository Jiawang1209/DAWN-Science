# 科研分析向导与案例卡片整合预览

2026-10-17。用户授权整合此前卡片修复并启动实际预览。DAWN 分支为 `codex/research-analysis-guide`，改动尚未提交或合入 main。

后续状态：用户明确限定只修改 DAWN 后，已在客户端补齐窄只读兼容、删除临时脚本并停止兼容层，真实直连验证八张卡及八张封面通过。当前交付边界见 [直连与集成验证](2026-10-17-direct-mlai-main-verification.md)。下文保留此前探索事实，服务端补丁方案不再采用。

## 整合与工程验证

两个工作树原本均基于 `8ad3a705`，且改动未提交。本次按共同基线合并；手动保留开发历史两组记录、两类卡片测试以及共享 MCP/模型 mock 的全部查询分支。保持已确认的技能设计版本。卡片提取、协议 8.17、实时事件、恢复与标题匹配实现已进入此分支，原 `codex/fix-case-cards` 工作树保留。

| 本轮命令 | 结果 |
| --- | --- |
| `npm test` | 402 文件，4537 通过，10 项原设置跳过；91.85 秒 |
| `npm run typecheck` | 通过 |
| `npm run build` | 通过，原有 eval/chunk 提示保留 |
| `npm run test:e2e:only -- e2e/skills.spec.ts e2e/case-cards.spec.ts e2e/mcp.spec.ts e2e/session-resume.spec.ts` | 21 项通过；55.3 秒 |
| `git diff --check` | 通过 |

Electron 回归同时覆盖技能展开与引用打包、路线与卡片对应、大结果截断且正文只写标题、封面取图、打开详情、选择完整 ID、真正重启恢复、MCP 连接及续接。没有放宽截断预算或测试断言。

## 真实模型与知识库预览

启动已构建的真实 Electron，使用独立配置、数据库、scratch、技能、CLI 和 userData。仅复制现有 DeepSeek 与 MLAI 的加密凭证条目供预览使用，没有改写原凭证。以 `dawn-science` 应用身份启动后可读取所需凭证，实际 DeepSeek 请求成功；这更新了此前独立诊断进程“凭证不可读、未发请求”的边界。

使用用户提出的土壤扩增子问题，明确标为演示假设：已有 16S ASV、分类、分组和土壤环境表，偏好 R，未提供真实文件与实验设计。限定只讨论、不运行、不安装、不建分析文件。实际过程：

- 形成 S1–S7 路线，区分输入准备、概览、多样性、差异丰度、环境关联和拓展，并说明未知设计及方法适用条件。
- 成功轮实际调用一次词表、十二次 `search_cases`、一次 `get_case`、一次 `search_chunks`，保持 R 过滤；推荐八个不同真实案例，并将 C 编号映射到步骤。
- 实际八张卡片，七张真实图廊封面成功加载；C3 仅返回片段元数据，没有 cover，界面明确显示“没有封面”。没有使用 mock PNG 或生成图片代替。
- 转录检查没有 `run_code`、`bash`、`write`、`edit`、`subagent` 调用。此次未运行科学分析，没有当前用户数据上的科学结果。
- 重新加载预览后仍恢复八张卡片及七张封面；实际 1280×808 内容区没有页面横向溢出。对话内垂直滚动用于查看长路线和全部卡片。

这是一个真实模型单例试用。模型自行给出的方法判断与引用内容尚未逐条进行科学适用性审查；不能推广为所有需求或所有模型均已验证。

## 只读声明兼容问题与明确边界

首次真实调用被讨论门拒绝：常驻 MLAI 工具声明没有 `annotations.readOnlyHint`。DAWN 已有策略只放行声明为只读的 MCP 工具，拒绝符合现有规则；本次没有取消讨论门或放行代码执行。

MLAI 原工作区存在其他未提交开发，其中段落检索源码要求 registry schema 9，而常驻服务使用 schema 8。没有修改该原工作区、重启常驻服务或重建语料。单独建立 `/Users/liuyue/.codex/worktrees/mlai-readonly-hints/MLAI-science` 的 `codex/mcp-readonly-hints`，保留当时工作区快照，再补十个工具的只读、非破坏、幂等和闭合知识库声明。

MLAI 新协议测试先在缺声明时失败，修改后 `uv run --no-sync pytest -q tests/mcp/test_readonly_annotations.py` 通过；ruff 与 server.py 的 mypy 通过。该快照的 MCP/Gallery 回归为 254 通过、2 失败：两个原 HTTP 工具名单断言仍预期九个工具，快照已含未发布的 `get_chunk`。它们不是声明修复造成，未扩大本次任务去调整段落功能或数据库。没有把 MLAI 全部检查报告为通过。

由于这份新源码无法直接加载当前 schema 8 的库，预览通过 `scripts/preview-mlai-readonly.py` 连接仍在运行的真实 `127.0.0.1:8765` 服务：只为已审阅的知识库读取工具补声明，所有实际调用和结果原样转发；图廊转发实际内容，避免 DAWN 的禁止图片重定向规则。人工协议检查确认未知写工具不被标为只读、输入与返回保持；真实检索和七张封面再次确认连接有效。中间尝试的 8766 新源码服务已停止。

兼容层只绑定 loopback 的 8767，凭证仅经进程 stdin 传入，不写文件或命令行。它是**预览辅助工具**，没有作为正式产品后端默认启用。正式交付还需将只读声明补丁集成到 MLAI 可发布版本并经服务端验收；补丁见 `artifacts/research-guide/mlai-readonly-annotations.patch`。DAWN 卡片与技能整合本身已完成。

## 证据与保留状态

- `artifacts/research-guide/integrated-unit.log`、`integrated-electron.log`、`integrated-build.log`、`integrated-typecheck.log`：整合检查。
- `artifacts/research-guide/real-preview-window.png`、`real-route-table.png`：实际窗口、路线对应；长对话按当前滚动位置截图。
- `artifacts/research-guide/real-reply.md`、`real-preview-tool-audit.json`：实际模型回答与工具范围，不包含凭证或整个用户数据库。
- `artifacts/research-guide/integrated-preview.json`：隔离目录及本会话启动的进程标识。预览和兼容层保留运行，供用户查看；不推送、不合并 main、不替换安装版。
