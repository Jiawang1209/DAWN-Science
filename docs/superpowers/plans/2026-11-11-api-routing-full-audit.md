# 开发版全项目检查与 API 模型路由修复计划

**目标：** 排查“配置 DeepSeek，输入框仍显示 Kimi”，修复可复现问题，检查依赖和关键功能路径，完成回归与本地提交。用户明确要求不安装发布包，仅在开发版检查。

**架构原则：** 复用 provider 目录、既有新任务和会话模型选择入口、NativeRuntime、子任务冻结契约及恢复机制。模型选择跟随用户明确操作，已有会话和冻结任务保持其独立路由；不按模型自报身份判断请求来源，不把某一家硬编码为全局默认。

**隔离：** 基线 main 为 c79c2450afbf6a1d879012bf5406e3ec7c225503；工作区 /Users/liuyue/.codex/worktrees/dawn-api-routing-audit-20261111/dawn-science，分支 codex/api-routing-audit-20261111。新建隔离依赖目录，用锁文件安装开发依赖，不安装或替换正式 App，不改正式配置/数据库，不解密凭证。允许本地提交，暂不自动合并、推送或发布。没有新的真实模型额度，模型验证使用本地捕获服务器。

## A. 清点与复现

- [x] 核实 main 干净、基线、项目规则及用户问题的观察位置。
- [x] 新建隔离工作区，以 npm ci 安装锁定依赖；记录 Node/npm、安装日志、依赖树与漏洞报告。
- [x] 仅只读提取两套 profile 的 provider/agent/模型和凭证条目名称；不读取或输出密钥值、不触发钥匙串解密、不修改这些文件。
- [x] 建立源目录/测试/入口覆盖矩阵，区分全量自动检查、重点人工追踪和未覆盖外部服务。
- [x] 用 Moonshot 在前、DeepSeek 后的本地夹具复现新任务显示和发送目标；再覆盖显式选择、重启、凭证新增/删除及旧会话。
- [x] 检查主模型切换后的普通子任务、Team、Bot、批准方案的路由；先写反例，证实前后端请求字段再修复。

## B. 依赖检查与最小修复

- [x] npm ls 全树无依赖问题；Node 的 SQLite、PTY、ZeroMQ、esbuild 探针成功，隔离 Electron 开发运行时可用。npm 12 跳过部分依赖脚本是警告，不能未经验证就判为损坏或全量放开。
- [x] npm audit 得到 7 项 moderate、0 high/critical，均沿链指向 minimatch；保存官方 GHSA-g3hv-75wg-m249 与修复版本 11.0.1 的依据。
- [x] 检查受影响 9/10 系列消费者的导入方式与 API；只更新受影响解析范围，保留旧 3/5 系列，避免 audit fix --force 引发 SDK 大升级或打包器回退。
- [x] 更新 package.json/package-lock.json 后重建干净依赖、重跑 npm ls/audit 与实际 glob/技能/打包功能；不按警告数量盲目升级全部库。

## C. 模型选择与路由

重点文件：src/ui/agent-order.ts、src/ui/state/catalog.ts、src/ui/App.tsx、src/ui/views.tsx、src/workbench/backend.ts、src/session/manager.ts、src/runtime/native.ts、src/subagent/tool.ts、src/subagent/executor.ts、src/team/scheduler.ts。

- [x] 新任务默认选择有明确来源，用户选择/保存服务后不被旧凭证插入顺序覆盖；失效选择可安全回退，CLI/ACP/远端入口继续可用。
- [x] 当前会话的 provider 和 model 成对显示与发送；换服务成功后才更新，失败或迟到回调不污染另一会话。
- [x] 逐一验证新派生任务继承当前路由，已经冻结的执行保持原模型/权限/内容版本；排队、取消、恢复不靠可变全局路由串会话。
- [x] 保留原执行记录，不把 SDK 请求元数据或模型自报名称冒充服务端实际模型认证；输出捕获到的请求地址和 model 字段，不包含 Authorization。
- [x] 测试先红后绿；如发现其他独立问题先记录根因、影响和测试，再最小修改。

## D. 全项目自动检查与手工重点审查

- [x] 全项目类型检查与完整构建；覆盖 Node/Electron/CLI/UI 产物和 native ABI。
- [x] 完整 Vitest，分清 node、UI 与串行真实内核；记录失败、跳过、退出码与持续时间。
- [x] 完整相关桌面套件，单 worker、隔离 profile/workspace/user-data；保存失败现场后定位，不自动修改视觉基线、容差、掩码或退出阈值。
- [x] 单独运行真实 kernel E2E、关键视觉/性能入口（按当前配置是否已属于全套决定，不无目的重复），补齐 Python/R/Notebook 的真实文件证据。
- [x] 检查配置/凭证/更新、文件与附件、内核/终端、工具/权限/MCP、会话/模型、路线/编排/恢复、产物/Office、技能/记忆/外部入口的测试归属与静态风险；不能把统计通过称为逐行人工审查全部代码。
- [x] 用户不要求安装包，不安装发行版；可检验开发构建和打包配置，远端、真实 SaaS、签名、公证、跨平台和真实升级未运行时明确保留边界。

## E. 审查与本地提交

- [x] 复核修复的取消、权限、会话隔离、恢复及旧入口；不新增调度器，不扩大 Agent 数量，不自动重放未知副作用。
- [x] 记录前后请求与界面截图、依赖结果、全量回归结果、尚存风险及准确候选指纹。
- [x] 最后核实 main 未变、专项修改范围明确且没有凭证/私有输入进入提交；在专项分支本地提交，保留工作区，不推送/发布/替换安装版。

## 历史风险

历史偶发退出超时、长 Bot/MCP 收尾及 PTY 清理继续 OPEN。正常退出样本不关闭历史问题；不提高已有 1500/4000ms 判据。不沿用前轮模型调用余额。

## 当前证据

docs/validation/api-routing-audit-20261111/：npm-ci.log、npm-ls.json、npm-audit.json、minimatch-tree.json、minimatch-fixed-metadata.json、profile-routing-redacted.json。正式 profile 的凭证只检查条目名称，没有解密。

## 阶段记录与验收

- 模型选择、恢复、派生调用、会话隔离和迟到回调已完成反例与修复，共新增 23 项 Vitest、1 项桌面回归。
- 最终候选类型检查与完整构建通过；全量 Vitest：737 文件、7,194 通过、11 跳过，266.85 秒。
- 完整固定构建 A 桌面：958 项，953 通过、3 失败、2 跳过；3 个旧用例前提修正后，最终候选相关桌面 47 项全部通过。没有将相关复验称为同一候选的 958 项全绿。
- 最终真实内核 6 项、性能 3 项通过；完整 A 的 10 项视觉基线通过，未修改基线或阈值。
- 干净安装与依赖树通过，npm audit 初始 7 moderate，针对性覆盖后为 0；没有强制 SDK 跨代升级。
- 正常 Bot 任务进展误判为空转及模型查询迟到问题已修复并补反例；历史退出超时、长 Bot/MCP 收尾和 PTY 清理继续 OPEN。
- 回归重写的历史证据已先归档再恢复原字节，main 和正式 profile 保持不变。提交前校验候选指纹和 staged 范围，在专项分支本地提交；不合并 main、不推送、不发布。
- 完整证据和未验证边界见 `docs/validation/api-routing-audit-20261111/audit-report.md`。
