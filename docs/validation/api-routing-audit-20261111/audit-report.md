# API 路由与全项目检查

## 范围与边界

本轮从本地 main `c79c2450afbf6a1d879012bf5406e3ec7c225503` 创建隔离分支 `codex/api-routing-audit-20261111`。用户说明问题发生在输入框／模型选择器，要求检查当前开发版，不安装 GitHub 发行版。修复、测试并本地提交；不推送、不发布、不替换安装 App，不自动合并本轮分支。

检查方式是全项目类型检查、构建、测试与按模块追踪关键链路，不代表人工逐行审查全部源码。源目录包含 667 个文件，清单见 `coverage-inventory.json`。真实云端模型、生产 SSH/SaaS、跨平台、签名、公证、发行包安装升级未验证。模型实验只用隔离夹具和本机 HTTP 服务，未使用正式 API key。

## 已确认的问题与修复

1. **新任务默认服务依赖旧顺序。** 多家凭证共存时，自动生成 agent 按凭证登记顺序追加，空态选择第一家。只读检查发现本机两套 profile 的凭证条目均为 Moonshot 在前、DeepSeek 在后；这解释了当前源码中的一种可复现路径，不作为已运行所有 GitHub 发行版的证据。新增非敏感设置 `model.newTaskProvider`，仅在明确保存服务或成功切换后记录，后端投影排序复用现有新建入口。旧配置还没有偏好且所有 API agent 都为自动生成时，以最后登记的可用服务作为新任务默认值；存在手工 native 声明时保留其顺序。原 agent 声明、旧会话和冻结执行不改写；失效选择仍可回退。
2. **会话恢复覆盖显式选择。** Native 启动总把原 agent 模型传入 SDK，压过会话记录中的切换；SDK 当前版本 `setModel` 还要求显式 `{persist:true}` 才保存默认值。复用 pi 分支记录和本会话 `pi/settings.json` 恢复路由，并显式等待 SDK 设置写入。凭证检查使用恢复后的 provider，分叉也先决定实际继承的 provider 再检查凭证。
3. **派生任务使用启动路由。** 普通 subagent、普通团队与科研流程的默认路由闭包原先捕获 Native 启动值。新调用读取父会话当前模型，执行器在调用／一轮开始时复制；已排队的前台调用和显式成员模型保持自己的快照。批准方案已有的冻结模型继续优先。未新增调度器。
4. **选择器重载后显示原配置。** UI 模型缓存为空时退回原 agent 声明；改为复用现有上下文观测接口，在恢复完成及主／侧对话取用量时同步当前路由，并检查每会话选择代次。重复选择同一模型也使早先观测失效，旧用量和旧模型不能覆盖新选择。目录加载另按请求代次防止旧列表覆盖切换后的刷新。加强桌面测试确实先抓到“只接概览读取、没有接普通对话恢复”的遗漏；失败日志、截图和上下文保存在 `desktop-strong-failure/` 与 `desktop-routing-strong-red.log`，随后复验通过。
5. **旧 key 验证结果迟到。** 同家旧 key 验证失败可能覆盖后来保存的新 key 的成功状态。按 provider 记录验证代次，在目录读取／验证完成后检查；删除凭证使旧验证失效。新任务偏好另有用户操作代次，早发晚到的保存不能覆盖较新的明确选择。
6. **依赖与测试入口。** npm audit 初始 7 moderate、0 high/critical，均沿 minimatch 受影响版本链。仅覆盖 `minimatch@>=7.0.0 <11.0.1` 为 11.0.1，保留未受影响的 3/5 系列，没有强制 SDK／打包器跨代升级。干净重装后 audit 为 0，npm ls 全树无问题。首次直接运行 Vitest 缺少构建产物的失败现场保留；npm test 增加 pretest 构建 Electron 子进程，明确测试依赖。

7. **普通 Bot 团队的有效进展没有清零重复等待计数。** 全量桌面初跑在 `bot-team.spec.ts` 抓到：数据、统计任务已完成，队长第五次 `team_wait` 却被判为空转，绘图被取消。原逻辑仅在科研 pipeline 版本变化时清零。新增集成反例先红后绿，再把普通任务状态／尝试、成员轮次／状态纳入同一进展快照；时间戳、观测刷新、邮箱已读标记不算进展。没有放宽重复阈值，也没有豁免所有等待。原 10 项死循环防护测试通过；Bot 桌面复验 3.9 秒完成三项依赖任务并核对实际脚本、系数与 SVG。首个失败的日志、截图、trace 与退出诊断保存在 `bot-team-full-failure/`；该进程退出码 0，此失败不归类为历史退出超时。

8. **旧会话的模型查询迟到后仍成功。** 最后一次生命周期自审增加延迟模型查询反例：等待期间停止／重建会话，旧 `setModel` 仍报告成功，并可能把模型写入共享 SID 的设置。反例先红。应用前复核当前会话实例和既有停止代次，保存后再次检查，不再向新生命周期发送旧成功回执；解析期间若开始执行或处理方案，也重新拒绝切换。停止重建与取消两种反例均通过，保存路由仍保持原值。没有新增关闭等待、超时或调度层。

依赖依据：[minimatch 官方安全公告 GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249)。11.0.1 的导出符号 `minimatch`／`Minimatch`，以及 electron-builder 的实际 `FileMatcher.computeParsedPatterns` 已做运行探针，结果见 `minimatch-consumer-probe.json`。SDK 的真实子进程、技能与 glob 由完整测试进一步覆盖；没有运行发行版安装／发布。

## 覆盖矩阵

| 检查领域 | 人工追踪与自动覆盖入口 | 证据边界 |
| --- | --- | --- |
| 配置、凭证、服务与模型 | config/loader、models-json、workbench/credential-store、backend、electron/main；config/workbench/runtime/UI 测试 | 只读检查正式 profile 的 provider 与条目名称，不解密、不改正式配置 |
| 会话、恢复、分叉 | session/manager、runtime/pi-resume、SDK createAgentSession/setModel、UI state/sync；新模型恢复测试、session-resume/recovery 桌面测试 | 本地 SDK／SQLite／Electron；不推断第三方端点内部模型身份 |
| 编排、子任务、团队、Bot | native 工具装配、subagent/tool/executor、team/scheduler、science-pipeline-tools、批准方案绑定；完整 runtime/orchestration/team/bot/integration 测试 | 复用现有契约、锁、产物版本、恢复；不扩大并发或层级 |
| 权限、取消、收尾 | gate、任务权限冻结、共享产物锁和调度器取消路径；完整 policy/MCP/orchestration/recovery/desktop 既有回归 | 历史偶发退出超时、长 Bot/MCP 排空、PTY 清理继续 OPEN |
| 文件、附件、产物、Office | 完整 files/artifacts/delivery/tools/project 测试与对应桌面入口 | 不修改正式科研输入、交付文件；未把夹具科研结论称为真实科研验证 |
| 内核、终端、远端 | kernel/terminal/remote 测试；真实 kernel E2E 单独记录；终端桌面入口 | SSH 桌面夹具为假服务，真实远端环境未登录验证 |
| 技能、记忆、科研连接器 | skills/memory/literature/science/cases/channels 的完整测试与桌面入口 | 第三方服务大多由本地确定性服务代替；不声称真实账号可用 |
| 构建、更新、包装、展示 | 完整 typecheck/build、update/electron/CLI 测试、桌面与视觉套件、流式性能入口 | 本机开发构建；不安装发行版、不改视觉基线或退出阈值 |

## 实际效果

`provider-routing-audit.spec.ts` 使用 Kimi agent 在前、DeepSeek agent 在后的隔离配置，点击菜单切换，创建下一任务，真正退出 Electron 并重开。捕获的三次对话请求均为本机 `/v1/chat/completions` 的 `model: deepseek-flash`。截图和请求字段分别见 `deepseek-selected.png`、`deepseek-after-restart.png`、`http-request-models.json`。图中的假模型回复、凭证未配置提示属于隔离夹具，不是用户正式数据。

## 验证结果与审查结论

| 检查 | 结果 | 对应证据／版本 |
| --- | --- | --- |
| 全项目类型检查、完整构建 | 通过 | `typecheck-final.log`、`build-final.log`，最终候选 |
| 全量 Vitest | 737 文件通过；7,194 项通过，11 项跳过，266.85 秒 | `vitest-final-verified.log`，最终候选 |
| 完整桌面套件 | 958 项：953 通过、3 失败、2 跳过，55 分钟 | `desktop-full.log`，固定构建 A；没有中途替换 dist |
| 最终相关桌面复验 | 47 项全部通过，3.5 分钟 | `desktop-final-targets.log`，最终候选；包含上述 3 项修正及真实解释器快照 |
| 真实 Python/R 内核 | 6 项全部通过，16.6 秒 | `kernel-final.log`，最终候选；使用已存在解释器，不安装环境 |
| 流式性能 | 3 项全部通过，1.4 分钟 | `perf-final.log`，最终候选；输入延迟 p95 28.4ms／150ms，IPC 7,682／1,000,000 字节 |
| 视觉基线 | 10 项亮／暗基线通过 | 完整桌面 A；没有更新基线、掩码、容差或退出判据 |
| 干净依赖安装、npm ls/audit | 安装与依赖树通过；audit 由 7 moderate 降至 0 | 初始与修复后 audit JSON、安装日志、消费者探针 |

新增 23 项 Vitest 回归和 1 项 Electron 桌面回归；完整测试覆盖既有入口，重点人工追踪模型路由、恢复、派生任务及迟到回调。审查为本轮串行自审，没有宣称独立审查或逐行读完全部源码。当前范围没有已知阻塞项；不能据此保证不存在其他缺陷。

### 失败现场、修正及版本边界

完整桌面 A 的 3 项失败均保留现场：`cross-service-switch` 在保存另一服务后仍假定默认 DeepSeek，补显式选择作为原测试的起点；`late-endpoint` 假定入口按钮仍名为 DeepSeek，改用稳定入口定位；`science-incremental` 的复用及源文件断言已通过，截图却没展开旧详细记录入口，现先通过公开按钮展开并等待可见内容再截图。没有删除原同会话、历史、HTTP、复用和文件断言。三项在最终候选复验通过。

完整 A 的一项真实解释器快照因隔离工作区没有 `.venv-kernel` 跳过，随后通过已有 Python/R 环境在最终 47 项中补验；另一项 sidebar-collapse 为既有显式 skip，保留。Vitest 的 11 项既有跳过保持记录，不算通过。

A 之后自审追加被动观测并发反例，拆开缓存更新和显式选择代次；随后追加模型查询迟到与停止／重建反例，复用停止代次修复。最终候选已重新完成全部 Vitest、类型检查、构建及 47／6／3 复验。**没有声称最终候选重新跑过一整批 958 项**。两次候选清单和差异见 `candidate-source-sha256.json`、`final-candidate-source-sha256.json`、`post-build-source-delta.json`。

最早桌面初跑曾因普通 Bot 团队进展问题主动停止：138 通过、1 产品失败、1 中断、1 跳过、817 未运行，退出 130；修复后重新执行完整 A。该轮失败不混入上述 958 项结果，也不算历史退出超时。

### 数据与范围保护

回归生成的历史证据先归档，再将 80 个历史跟踪文件恢复为基线原字节，46 个新生成捕获移入本轮归档，核验记录见 `regression-artifact-isolation.json`；没有通过改历史证据制造通过。原 main 仍为 `c79c2450afbf6a1d879012bf5406e3ec7c225503` 且干净。正式 profile 的 providers.yaml 哈希保持不变，凭证未解密，安装 App 未替换。原始日志和较大 trace／归档保留在隔离工作区，提交仅包含可复核的选定证据。

真实 Python 为原仓库已有 `.venv-kernel/bin/python`（3.11.15），R 为 `/usr/local/bin/R`（4.6.1）。仅测试入口接受 `DAWN_TEST_PYTHON` 覆盖；没有改变产品解释器配置或全局 kernelspec。

开发源代码修复不等于已验证发行包。真实云模型请求为 0；真实 SaaS／SSH、跨平台、签名、公证、安装升级仍未运行。历史偶发退出超时、长 Bot/MCP 收尾及 PTY 清理继续 **OPEN**；正常退出样本不能关闭历史问题，1500/4000ms 判据未提高。

### 用户可见行为

明确切换服务成功后，下一新任务使用该服务；旧会话保留自身选择，重启后恢复，不被全局偏好改写。已有 Kimi 会话若从未切换，仍需在该会话模型菜单明确选择 DeepSeek 一次。子任务继承调用时路由，显式成员模型及冻结方案仍按原契约执行。

`deepseek-composer-after-restart.png` 为最终候选真正重启 Electron 后的输入框截图；推理来自 localhost 测试夹具，不是云端 DeepSeek 验证。对比请求字段见 `http-request-models.json`。
