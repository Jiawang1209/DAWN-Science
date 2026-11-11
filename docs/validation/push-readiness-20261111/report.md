# 推送前全项目复验 — 2026-11-11

## 结论与范围

本机验收范围内未发现阻塞项。基于上轮修复提交 `8ffba22a`，在隔离分支 `codex/push-readiness-20261111` 重新完成干净依赖、类型检查、全量测试、构建、整批桌面、真实 Python/R、性能及本机目录包启动。原 main 仍为 `c79c2450`，**没有合并、推送或发布**；直接推送旧 main 不会带上这些修复。

全项目自动检查与关键链路自审不等于人工逐行阅读全部源码，也不保证不存在其他缺陷。本轮没有独立子 Agent 审查。业务代码沿用 `8ffba22a`；本轮新增修复仅为 CI 构建前置入口和对应契约回归。没有扩大 Agent 数量、增加调度层、修改视觉基线或放宽阈值。

## 发现并修复的 CI 缺陷

GitHub CI 原先执行 `npx vitest run --project node --project ui`，绕过 npm 的 pretest。全新工作区 npm ci 后没有 dist，研究评测的真实子进程用例报 `ENOENT dist/electron/subagent-child.js`。本机已有旧构建时容易隐藏这个问题。

1. 干净检出复现原失败，保存 `clean-ci-red.log`。
2. 新增 `tests/ci-config.test.ts`，检查 CI 测试开始前具备真实子进程构建前置，先失败于预期断言，保存 `ci-contract-red.log`。
3. CI 改为 `npm test -- --project node --project ui`，复用现有 `pretest: npm run build:electron`，不修改测试分组或原 20 分钟判据。
4. 干净检出的研究子进程全组和契约共 17 项通过，保存 `clean-ci-green.log`；随后才进入下列全量验收。

## 全量结果

| 检查 | 本轮实际结果 | 证据 |
| --- | --- | --- |
| 全新 npm ci、npm ls 全依赖树 | 退出 0，独立 node_modules | npm-ci.log、dependency-tree-summary.json |
| npm audit | 0 项漏洞；没有新增依赖或改锁文件 | npm-audit.json |
| 全项目类型检查、完整构建 | 均通过 | typecheck.log、build.log |
| 全量 Vitest | 738 文件通过；7,196 通过、10 跳过，总数 7,206，275.27 秒 | unit-full.log |
| **完整桌面整批** | **957 通过、0 失败、1 跳过，总数 958，53.3 分钟** | desktop-full.log |
| 亮／暗视觉 | 10 项通过；基线未改 | 同一整批桌面日志 |
| 真实 Python/R 内核 | 6 项全部通过，17.1 秒 | kernel.log |
| 流式性能 | 3 项全部通过，1.4 分钟 | performance.log |
| 本机未安装目录包 | macOS arm64 构建成功，发布参数 never | pack.log |
| 包内签名完整性 | codesign 深度严格验证通过；ad-hoc 签名 | package-signature.log |
| 打包后实际启动 | 包内 CLI help 及 6 项原生 UI 冒烟均通过 | packaged-smoke.log |

桌面唯一跳过是 `sidebar-collapse.spec.ts` 中原先明确放弃的展开动画规则，没有新增 skip；Vitest 的 10 项条件跳过不计通过。本轮桌面是**同一冻结候选的一整批结果**，不是定向复验替代全量。

固定源清单包含 1,774 个文件，摘要 `d785d4bc18a4c928111300cec46766444f2279505b6b845e736afb799c27ec17`；全部验收后校验一致，见 `source-manifest.json`。构建期间的文档记录不在源码摘要中。没有在桌面整批中改产品源码或替换构建；目录包在开发回归全部结束后另建。

性能本轮输入 p95 为 **15.7ms／150ms**，单轮 IPC 为 **7,246／1,000,000 字节**。没有修改预算。完整桌面保存 995 份原生退出诊断，108 次异步收尾开始均有排空完成记录；排空超时、失败、异步失败和兜底退出事件为 0。此统计不是历史偶发问题的关闭依据。

## 覆盖的关键行为

- **服务与模型：** 明确选择 DeepSeek 后，新任务默认、同会话跨服务和真正重启恢复均通过；专项捕获三次 localhost 请求均为 deepseek-flash。主／侧会话、旧模型环境与迟到观测的隔离一并覆盖。
- **科研执行：** 契约来源确认、方案执行绑定、权限冻结、依赖阻塞、缺单位重启后仍禁止执行，以及补齐信息后的新方案真实 Python 执行均通过。
- **编排与恢复：** 普通 Bot 依赖链、子 Agent 工具过程、纠偏代次、停止排空、预算预留、累计用量恢复、停止后重开不自动重放均通过。
- **旧入口与交付：** 首启向导、侧栏、会话归档、终端展开返回、CLI 恢复、文件／附件、产物版本、技能读取证据、分析路线、笔记本及文献／远端协议夹具入口均在完整桌面中验收。
- **打包实际运行：** 从本地 .app 的包内依赖启动 CLI 和 Electron，验证 SQLite、技能／子 Agent 磁盘资源、Pi 假推理往返及子进程、PTY 真 shell 回显、解释器探测与 ZeroMQ／内核列表。没有通过开发 node_modules 代替包内 CLI 的 xterm 依赖。

## 实际效果与保护状态

`screenshots/deepseek-after-restart.png` 是本轮真正重启 Electron 后的输入框；`http-request-models.json` 是专项捕获字段。`screenshots/workflow-network.png` 为 8 个真实本地子进程完成后的流程工作台，执行完成与验收通过分别显示。`screenshots/packaged-startup.png` 为实际目录包，终端有 `DAWN_PTY_OK` 回显。

这些模型回复来自 **localhost 推理夹具**，真实云模型请求为 0；隔离截图的未配置 key／解释器提示不是正式配置状态。真实内核使用现有 Python 3.11.15 与 `/usr/local/bin/R` 4.6.1；没有安装环境或修改全局 kernelspec。

本轮重写的历史证据先归档，再将 **89 个历史跟踪文件恢复原字节，46 个新捕获移入本轮归档**；清单和校验见 `artifact-isolation.json`，大体积原始归档／诊断保留在本工作区，未全量纳入提交。原 main 和上轮专项分支均保持干净、提交不变；两套正式 providers.yaml 与初始哈希一致，正式凭证未解密，正式 App 未安装替换。保护记录见 `protected-state.json`。

## 保留的风险与未验收范围

历史偶发退出超时、长 Bot/MCP 收尾、PTY 清理继续 **OPEN**。本轮没有重现这些超时，不把正常退出样本称为已修复；1500/4000ms 判据保持不变。

本机目录包通过不等于发行包正式安装／升级通过，也不等于 Developer ID 签名、公证或其他平台验收。真实云模型、真实 SSH／SaaS 账号、Windows/Linux 真机和推送后的远端 CI 未运行。此候选保留在专项分支，原 main 尚未纳入，未触发远端操作。
