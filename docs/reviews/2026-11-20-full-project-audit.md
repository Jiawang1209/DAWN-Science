# DAWN 全项目检查与缺陷修复（2026-11-20）

分支：`codex/full-project-audit-20261120`；起点：`4188a62a`；版本：`0.0.51`。

本轮检查构建、类型、依赖、全量 Vitest、Electron 操作及真实内核。结论仅适用于记录的本机与测试场景，不能据此证明所有功能没有 bug。未操作正式安装版、正式配置或其他项目；未提交、合并、推送、发布。

结果：修复 8 组已复现的代码/依赖问题，并修正过时或不稳定的测试夹具。下列为当前修改后的最终结果，初次失败仍保留在后文及外部证据中。

| 最终检查 | 结果 | 证据文件 |
|---|---|---|
| 类型检查与构建 | 通过；已有 direct-eval / 大 chunk 提醒保留 | `typecheck-acceptance.log`、`build-layout-fixed.log` |
| 全量 Vitest（4 workers） | 787 文件、7,740 测试通过，10 条按既有条件跳过 | `vitest-acceptance.log` |
| Electron 完整清单，跨批次汇总 | 1,000 通过、1 条既有跳过；合计 1,001 项 | `e2e-unique-coverage.json`，逐项关联原运行日志 |
| 视觉基线连续两轮 | 28/28 通过；14 个 macOS 屏幕/主题组合 | `visual-verified.log` |
| 文件/上传/预览专项 | 19/19 通过 | `files-verified.log` |
| 真实 Python/R 内核，含假 ACP 借用链路 | 6/6 通过；使用本机内核 | `kernel-verified.log` |
| 流式性能 | 3/3；输入 p95 16.5 ms，单轮事件 IPC 6,550 B | `performance-verified.log` |
| macOS arm64 临时包 | 构建通过；CLI help、SQLite、技能/子 Agent、假模型子进程、PTY 回显、解释器探测、内核列表 6 项 GUI 冒烟通过，截图已检查 | `pack-acceptance.log`、`packaged-smoke.log`、`packaged-smoke.png` |
| 依赖与告警复查 | 依赖树 problems 为空，npm audit 告警 0 | `dependencies-acceptance.json`、`npm-audit-acceptance.json` |
| 凭据守卫自身测试 | 21/21 通过 | `secret-guard-tests.log` |

唯一跳过的 Electron 项是 `sidebar-collapse.spec.ts` 中已明确按历史设计取舍放弃的展开动画测试。跨批次汇总不代表最初完整运行全绿；后续改动涉及的模块均另做相关复验。上述假模型、fake SSH/外部服务只验证软件链路，不代表真实供应商或科学结论的独立验收。

## 已复现并修复

| 问题 | 原因与影响 | 修复及回归 |
|---|---|---|
| 内核 JSON 数组损坏 | `pickMime` 把所有数组视为多行文本，`[1,2]` 变成 `12`，对象数组变成 `[object Object]`；JSON 字符串也未保留引号语义 | JSON MIME 单独使用 `JSON.stringify`；覆盖对象、数组、嵌套数组、字符串、数字、布尔及 null |
| `.ipynb` 导出的 JSON 改变结构 | `application/json` 被写成文本行数组，而 nbformat 要求原始 JSON 值 | 导出时解析结构；不完整或非法的旧 JSON 以 `text/plain` 保留并说明原因，不制造完整数据 |
| Markdown 导出的 SVG 无法显示 | SVG 原本是 XML 文本，却标记为 base64 | 单独生成 UTF-8、百分号编码的 data URI；PNG/JPEG 仍按原有 base64 处理 |
| 排队定时运行读取后来修改的配置 | 运行只冻结 prompt/revision，启动时从现定义读取 Agent、目录和权限；旧任务可在新配置下执行 | 入队冻结完整定义，SQLite 保存可空 JSON 快照；schema v19→v20 增量迁移；旧记录不回填伪历史；旧记录版本不符时明确失败，版本相同仍可执行；删除定义仍阻止运行 |
| 更新下载取消与重试竞态 | 通过错误文本是否含“取消”判断取消；HTTP 响应前 AbortError 被误报失败；迟到进度/完成可覆盖新状态 | 用本次控制器身份隔离回调，取消立即回到可下载状态；重试等待旧下载清理，避免同名文件互相删除；测试取消前响应、迟到成功/失败和错误含“取消”的正常失败 |
| MCP 间接依赖存在中危告警 | `@hono/node-server@2.1.5`、`hono@4.13.14` 命中已发布公告 | 在 SDK 已允许的版本范围内更新至 2.1.9 / 4.13.19；没有更换 SDK 或增加顶层依赖；同时 npm 校正 lockfile 顶层旧版本号 0.0.47→0.0.51 |
| 长临时目录使 ACP 工具网关失效 | Unix socket 地址未检查字节长度；实际 Electron 记录 `listen EINVAL`，同一前缀的超长路径还可能被底层截断 | 超过 macOS 103 字节上界时，用 `/tmp` 下独占的短目录；令牌仍只走环境变量，目录 0700、socket 0600；关闭清理及重复关闭均验证，Windows 命名管道不变 |
| 极窄文件面板中目录行被裁掉 | 文件树最小高度计算包含边框/内距，却漏掉占用高度的横向滚动条；900px 窗口的上传流程稳定失败 | 计入实际滚动条高度，保持至少一整行目录和预览/传输区域预算；原上传断言不放宽，修复后真实 Electron 用例通过 |

Notebook 格式依据：[nbformat 官方说明](https://nbformat.readthedocs.io/en/latest/format_description.html)。依赖公告见 [node-server](https://github.com/advisories/GHSA-qv5m-9pm6-hqp3)、[Hono](https://github.com/advisories/GHSA-4m76-xfj5-7975)。公告命中不等于本项目已经复现了每一种攻击条件。

Unix socket 字节上界依据：[Node.js IPC 文档](https://nodejs.org/api/net.html#identifying-paths-for-ipc-connections)。该问题由本轮长 `TMPDIR` 隔离场景触发，不能表述为用户正式安装版一定遇到的故障。

## 检查范围

| 范围 | 入口/证据 |
|---|---|
| 项目约定、路线及构建发布 | `CLAUDE.md`、长期路线图、P0 入口、`package.json`、CI、Electron/Vite/打包配置 |
| 首页、项目、会话和引导 | `src/ui/state/app-page.ts`、`project-dialog.tsx`、`src/project/create.ts` / `manager.ts`、安装身份及凭据交接；现有组件与 Electron 回归 |
| 本地文件、远端传输与代码保存 | 工作区 realpath 守卫、交付路径守卫、SFTP 超时/串行保存；现有单测与 loopback SSH/SFTP 集成 |
| 内核、输出和 Notebook | `src/kernel/outputs.ts`、`channel.ts`、`挂载.ts`、`src/runtime/kernel.ts`、Notebook 导出；真实 Python/R 与新增富输出导出回归 |
| 定时与更新 | 领域、SQLite、调度器、工作台执行器、更新检查/下载/安装分界；相关 463 条定向测试首轮通过 |
| API/ACP、MCP、科研协作及产物 | 全量 Vitest 中现有对应套件；真实桌面回归使用本地假模型/假外部服务，不代表真实供应商验收 |

## 运行记录

原始日志根：`~/.codex/audit-reports/dawn-science/2026-11-20-full-project-audit/`。

- 初次类型检查、构建、`npm ls --all` 通过。
- 初次全量 Vitest：7,717 通过、10 跳过、12 失败。运行中添加了 Notebook 复现测试；12 个失败均来自这些新增用例。此记录不是“原仓库已有 12 条测试失败”。
- 完整定向红灯：Notebook/内核/调度器 14 失败、39 通过；更新服务 3 失败；快照迁移 2 失败。具体见 `regressions-red.log`、`update-red.log`、`snapshot-migration-red.log`。
- 修复后相关模块 35 文件、463 测试通过（`fixes-focused.log`）。
- 依赖树再次检查没有 problems；更新后的 `npm audit` 总告警为 0（`dependencies-final.json`、`npm-audit-final.json`）。
- 两次预跑 Electron 因切换验证安排主动中断，不能计作完整 E2E 通过；保留 `e2e-initial.log`、`e2e-final.log`。
- 同时运行全量测试、Electron 和打包时，出现 SFTP 短超时用例及科研 24 臂集成的失败；保留首次现场，SFTP 单项复测已通过。后续按独立重型验证区分负载敏感与功能回归。
- SFTP 失败的具体原因是后续正常传输也受 5 ms 夹具期限约束，实际收到超时而非预期的“不支持原子替换”。将测试专用 idle 期限设为 100 ms、整体看门狗设为 1 s，保留真实 HTTP/SFTP 与原文件不变的断言；产品超时未改变。
- 独立全量复验（4 workers）：7,738 通过、10 跳过、1 失败。新增失败为本地工具取消测试，后续在私有临时目录单独稳定复现。测试错误等待四个 Shell 全部进入脚本，而每个仍受默认 3 s 探测期限约束；取消场景改为确认一个实际运行标记后取消、使用独立的测试期限，并在 `finally` 中终止和等待待完成探测。修复后单项通过；这项是测试夹具修复，不是已证实的产品长路径缺陷。
- 科研 24 臂集成在独立全量中通过；不修改其 60 s 期限。并发负载下的首次超时仍保留，不将其改写为首次全绿。
- `npm run security:test`：21 通过；临时 macOS arm64 `.app` 构建成功，未安装或替换正式应用。

最后一次完整 Vitest、类型检查及最新临时包均在文件树修复后运行。

### Electron 完整检查中发现的后续问题

- 已启动的 1,001 项检查在修复网关前保留 582 通过、6 失败、1 主动中断、412 未执行，日志为 `e2e-complete.log`。其中两个 ACP 工具调用失败与网关长路径相关。
- 其余失败经截图/错误现场确认是测试假设过时：首启同时存在首页与隐藏工作台两个 `.app-shell`；设置页存在多个“保存”；面板默认宽 480 px，原用例却直接断言 <440 px 的样式。分别改为首启对话框、Python 解释器组内按钮及真实缩窄面板到 416 px，保留原来的功能与布局断言。
- 在 `kernel-session.spec.ts` 中同步修正同类解释器按钮定位。
- 新增真实 Python→Notebook IPC 富输出导出用例通过；实际 `.ipynb` 另经系统 Python 的 `nbformat.validate` 通过，保留原始导出文件。
- 继续执行时，通过 Playwright `--test-list` 选择全部未通过/未执行项，并重跑受影响的 7 个完整用例文件，共 457 项。与上一轮不在此选择中的 544 项通过记录合计覆盖原清单 1,001 项；这不是一次全部通过的运行，最终报告按批次分别给数。
- 457 项续跑实际为 439 通过、1 既有跳过、17 失败。17 项包括 14 个旧视觉基线、2 个过时布局预期和 1 个真实文件树高度缺陷；均保留原始失败记录。
- 两个布局预期按当前已合入导航契约修正：1280px 的面板上限改为 560px（300px 侧栏 + 420px 正文），品牌间距改测可伸缩 `.brand-stack` 的边界，仍严格验证 4px 控件间距。对应 1280/1920 对齐、页眉及上传流程的 4 项复验通过。
- 视觉基线最后更新于 `92c8864a`（11 月 16 日），导航变化来自 `b2cbd7d6`（11 月 17 日），见既有 `2026-11-17-header-navigation-verification.md`。逐张检查 14 个 diff（含汇总图及完整示例）后，确认是 260→300px 侧栏、返回入口和导航布局的预期变化；用失败比较中稳定化后的 actual 帧更新 macOS 基线。原基线副本、前后 SHA-256、diff 和 actual 均在外部日志根保留。未改比较阈值、遮罩、产品配色或渲染参数；更新后再运行两轮验证。
- 临时安装包冒烟脚本同步使用持久的全局引导状态、区分首页与隐藏工作台，并通过首页原按钮进入工作台；最终以真实临时包运行结果验收。

## 明确边界

真实供应商模型、实际 SSH 服务器、微信/飞书生产账号、Windows/Linux 真机、远端 CI、Developer ID 签名公证和正式安装版升级不在本机确定性验收中。既有长期路线图的 P0/P1 不因本轮检查自动完成。

本轮仅迁移临时数据库和内存数据库。代码包含 schema v20，后续用户实际运行此分支时会按既有事务迁移流程加列；本轮没有运行正式数据库迁移。未给历史运行填充并不存在的快照。

## 收尾与复查

- 登记的隔离运行根、测试凭据/数据库/工作区与临时 `.app` 已删除；日志、失败截图/trace、真实导出 Notebook/Markdown 和包截图留在仓库外证据根。
- 历史 `docs/validation/`、`artifacts/`、`output/playwright/` 中被旧用例刷新或新生成的 156 个文件已先保存到外部 `generated-e2e-evidence/`，再逐文件还原至开始时的状态。保留 SHA-256 清单 `generated-evidence-restoration.json`；没有覆盖历史验收记录。
- 分支保留代码、测试、经检查更新的 14 张 macOS 视觉基线及本轮计划/报告；`git diff --check` 通过。
- 未提交、未合并 `main`、未推送或发布；正式安装版与数据未更改。清洁重新安装、正式旧版升级及其他操作系统仍需单独验收。

## 后续需求：窗口与大屏自适应（2026-11-20，待讨论）

- 用户反馈：正式桌面 App 换到大屏展示时，页面比例显得不协调；希望窗口大小变化时，布局、按钮、文字和其他元素能协调变化。具体表现尚未在用户的大屏环境复现，暂不判断是布局、系统显示缩放还是应用缩放造成。
- 工作顺序：先完成本轮 debug，再继续此项；本次只记录，不改界面，也不视为已批准实施方案。
- 后续讨论方向：结合响应式布局和有上下限的界面尺度；布局根据可用窗口空间调整，文字、按钮、间距适度变化，同时考虑手动界面缩放或演示模式。是否采用、缩放范围和触发条件待讨论确定。
- 后续检查需区分窗口尺寸、显示器分辨率与系统显示缩放；观察小窗口、笔记本、大屏及跨显示器移动时的真实效果，再决定设计。
- 验收重点：阅读舒适、按钮易操作、正文行长合理，侧栏和工作面板比例协调；避免无限放大、挤压、遮挡或裁切。具体尺寸矩阵与截图验收留到此项启动时制定。
