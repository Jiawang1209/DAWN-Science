# DAWN Science 代码与依赖检查 2026 年 10 月 30 日

检查基准：`main`，版本 `0.0.41`，提交 `89aab93edd24a6204e70657f7e0714956cb2e74f`。本机 macOS arm64、Node `22.23.0`、npm `12.0.1`。检查开始时工作区干净。

当前结论：构建和类型检查通过，但存在已复现的运行逻辑、文件边界、远程 MCP 依赖问题；不能据此判定项目无错或适合无条件发布。此次没有修改业务源码、依赖版本、锁文件或测试基线，没有提交、推送、发布或替换安装版。

## 检查范围

全仓库 TypeScript 检查、553 个 Vitest 测试文件、三部分构建、全部安装依赖树和生产/开发依赖审计；独立临时目录清洁安装；本机 macOS arm64 打包；真实 Electron E2E；37 个已跟踪 JS/MJS/CJS 文件与 1 个 shell 文件语法检查。

人工审查重点覆盖运行时/内核、会话生命周期、调度、数据库/项目/产物、远程执行、Bot/子任务、UI/IPC、浏览器、配置、CLI、MCP、更新/打包及 CI。自动检查覆盖不等于每行代码都经过形式化证明，也不证明真实科研结果正确。

## 自动验证结果

| 检查 | 本次结果 | 证据 |
|---|---|---|
| `npm run typecheck` | 通过，exit 0 | artifacts/code-audit-2026-10-30/dawn-audit-20261030-typecheck.log |
| `npm run build` | Electron、CLI、UI 均通过，exit 0 | dawn-audit-20261030-build.log |
| `npm test` | 550 文件通过、3 文件失败；5810 通过、3 失败、10 跳过；265.14 秒 | dawn-audit-20261030-tests.log |
| 远程终端单独复测 | 19/19 通过；全量失败属时序/负载相关现象，未证明已修复 | dawn-audit-20261030-remote-retest.log |
| 内核两文件复测 | 2 通过、2 失败；Bot 重复签名再次出现，另有 R 握手超时；原 attach 用例这次通过 | dawn-audit-20261030-kernel-retest.log |
| 主 Electron E2E 897 项 | 860 通过、36 失败、1 预设跳过；分段运行后集合核对完整 | dawn-audit-20261030-e2e-coverage.json |
| 真实内核 Electron E2E | 4 通过、2 失败；失败发生在 createTask 后未出现会话 | dawn-audit-20261030-e2e-kernel.log |
| 被标题过滤遗漏的3项 | attach:541、kernels:15、setup-wizard:97 均通过；见 A14 | dawn-audit-20261030-e2e-omitted.log |
| 输入卡高度复测 | 1280宽通过，1920宽再次失败，高度差44px；新旧验收契约冲突，见A15 | dawn-audit-20261030-side-retest.log |
| PDF 路线预览复测 | 同一高度断言再次失败，147.5859375px vs >180px | dawn-audit-20261030-route-retest.log |
| 孤儿任务删除复测 | 旧的行内删除按钮定位再次失败；当前操作已迁入菜单 | dawn-audit-20261030-bulk-retest.log |
| 短窗口上传预览复测 | 同一最终布局断言再次失败；文件预览被压成细条，见A16 | dawn-audit-20261030-upload-retest.log |
| `npm ls --all --json` | 首尾两次均通过，无 missing/invalid/peer problems；依赖树一致 | dawn-audit-20261030-npm-ls-final.json |
| 临时目录 `npm ci --no-audit --no-fund` | 通过，1040 包；本机 npm 安装脚本策略阻拦的项目保留警告；随后 SQLite/PTY/ZMQ/esbuild 加载成功 | dawn-audit-20261030-install-workdir.log |
| macOS arm64 `electron-builder --dir` | 通过，ad-hoc 签名；未公证 | dawn-audit-20261030-pack.log |
| 打包应用冒烟 | 测试钥匙串下 CLI help、启动/SQLite、自带技能、假模型对话、PTY、解释器探测、内核设置均通过 | dawn-audit-20261030-packaged-mock-test.log |
| 流式输入／IPC 预算专项 | 1 项通过；输入到双 rAF 的 p95=16.7ms（预算150ms），23个输入样本，JSON事件载荷6550字节（预算1000000字节）；未跑其余两项完整性能测量 | dawn-audit-20261030-perf.log |
| JS 与 shell 语法 | 37 个 JS/MJS/CJS、1 个 shell 均通过 | dawn-audit-20261030-script-syntax.json、extra-syntax.json |

主 E2E 原始运行在第533项后因会话中断而停止；随后恢复363项，另单跑1项标题含分隔符的用例。这里统计的是三个日志的897个唯一用例，不是一次不中断的全量命令。完整默认清单904项已逐项核对：主组897项，内核组额外4个唯一项，补漏3项；共906次记录，因内核组与主组重复2项。其中903个唯一用例实际运行，1项按仓库既有取舍跳过。kernel-session.spec.ts:156 在主组通过、独立内核组失败，保留两次相反结果。详见 dawn-audit-20261030-e2e-all-coverage.json。

36个主组失败分为2个产品布局问题、15个过期测试定位或流程、14个视觉基线差异、5个待定位问题。这是逐一查看现场后的诊断，不表示过期测试对应的全部后续断言已通过。14个视觉差异已检查实际图和差异图，主要涉及工具栏、状态栏、工作区入口等改版；未更新任何基线，仍需按当前设计正式审定。

第一次临时安装使用 npm `--prefix` 参数得到 root 名字错误；改为在临时工作目录运行同一 lock 的 `npm ci` 后成功，因此不将第一次命令错误归因于项目 lock。

打包冒烟原始运行完成前四项后，进程被 macOS Keychain 阻塞。原生 sample 显示主线程进入 `SecItemCopyMatching`/`SecurityServer::ClientSession::decrypt`；已停止该隔离测试；原日志之后的 Target closed 错误由主动终止引起，不另计为解释器或内核设置缺陷。随后仅在临时测试脚本中增加 `--use-mock-keychain`，完整冒烟通过。真实钥匙串授权、凭证迁移和已安装版行为仍未验收；测试钥匙串结果不能替代它们。

构建仍有 `browser_eval` 的 direct-eval 提示和大 chunk 提示。这些警告未造成本次构建失败。打包器同时提示未设置 author、关闭 asar、重复依赖引用和未公证；本次未将这些提示直接认定为启动缺陷。

## 主端到端失败分类

本表记录完整 897 项中逐一检查的失败现场；完整通过／失败／跳过数以上方最终汇总为准。

| 用例 | 判定 | 已观察的失败与范围 |
|---|---|---|
| `e2e/analysis-route-map.spec.ts:9` | 产品布局问题 | e2e/analysis-route-map.spec.ts:28 stage height expected >180, actual147.5859375 CSSpx PDF renders full page; problem is undersized route preview at default window layout. Existing acceptance documented usable height fix. |
| `e2e/boot.spec.ts:14` | 过期测试定位／流程 | line20 .statusbar > span first expected 未配置任何模型; element not found Current statusbar nested controls; fixture also seeds ds-chat agent, contrary to old no-model expectation. App and conversation visible in failure snapshot. |
| `e2e/bulk-delete.spec.ts:100` | 过期测试定位／流程 | line135 searches row button 删除会话 directly, timeout30s Failure snapshot contains current menu trigger; onDelete task callback exists. Source path inspected, not executed by subagent. |
| `e2e/composer-meta.spec.ts:44` | 待定位 | checkActions line35 side dock second action button vertical center2px from timestamp, expected<=1px; called line66 after forcing dock280px Trace confirms actual second action button assertion, not usage count/statistics. No source cause or narrow repeat yet; may be minor layout regression or measurement/resize timing. Do not report broad composer/statistics failure. |
| `e2e/header-version.spec.ts:6` | 过期测试定位／流程 | line10 .brand-version expected count1 actual0 timeout25s Version now rendered as nested button.app-status-version with aria-label版本v0.0.41, not .brand-version direct statusbar child. |
| `e2e/i18n.spec.ts:109` | 过期测试定位／流程 | line150 getByRole(button,name Skills) strict mode matches settings Skills and statusbar Skills9 Use exact:true or scope settings nav. This failure does not establish untranslated Chinese. |
| `e2e/kernel-output-isolation.spec.ts:10` | 待定位 | line29 first R runInKernel result.ok=false; snapshot explicitly R_zmq_bind errno48 Address already in use repeated4 times; operation20.5275s Local real-kernel bind collision; conflicting port/owner unknown. Python and restart assertions never reached. Independent of duplicate-signature mechanism. Exact original envelope not retained by test. |
| `e2e/palette.spec.ts:157` | 过期测试定位／流程 | line166 expects shortcut trigger height=search button height28, actual shortcut32 Test still assumes shortcuts and search adjacent in same bar. Current shortcut is topbar control; search moved to sidebar Workspace actions. Failure occurs before opening dialog, so no shortcut functionality regression shown. |
| `e2e/panel-session-controls.spec.ts:22` | 待定位 | line94 scrollTop expected<217 actual217 after wheel(-120) at computed railLeft+2; predicate25s timeout All toolbar/tooltip/focus/geometry assertions passed before this. Potential gutter mouse routing or computed hit target; exact product cause not established from trace/screenshot. |
| `e2e/pick-workspace.spec.ts:47` | 过期测试定位／流程 | workspace label stays默认工作目录 after clicking工作目录; expected选文件夹就进项目 at line63 Click now opens recent-workspace chooser; must click menuitem另选文件夹… to invoke injected native directory picker. Existing test only opens menu then waits for selection to happen. |
| `e2e/pick-workspace.spec.ts:93` | 过期测试定位／流程 | workspace label stays默认工作目录 after clicking工作目录; expected选文件夹就进项目 at line98 Click now opens recent-workspace chooser; must click menuitem另选文件夹… to invoke injected native directory picker. Existing test only opens menu then waits for selection to happen. |
| `e2e/pick-workspace.spec.ts:121` | 过期测试定位／流程 | workspace label expected选文件夹就进项目 actual默认工作目录 timeout25s Same outdated one-click native-picker flow: current workspace trigger opens menu; tests never activate另选文件夹… so no target selected. Later file focus/refresh behavior untested. |
| `e2e/pick-workspace.spec.ts:154` | 过期测试定位／流程 | expected target directory file认得出的文件.md visible; missing timeout15s Same outdated one-click native-picker flow: current workspace trigger opens menu; tests never activate另选文件夹… so no target selected. Later file focus/refresh behavior untested. |
| `e2e/pick-workspace.spec.ts:207` | 过期测试定位／流程 | expected target directory file认得出的文件.md visible; missing timeout15s Same outdated one-click native-picker flow: current workspace trigger opens menu; tests never activate另选文件夹… so no target selected. Later file focus/refresh behavior untested. |
| `e2e/sess-title.spec.ts:185` | 过期测试定位／流程 | line194 .proj-list .proj-item expected1 actual0 timeout30s after clicking工作目录 only Same outdated one-click picker assumption as pick-workspace tests. Snapshot shows 工作目录 dialog and 另选文件夹 menuitem. Directory never selected; hover-card full-path assertions not reached. |
| `e2e/sess-title.spec.ts:272` | 过期测试定位／流程 | line283 last row y expected>392 actual365.09375 in560px window Failure occurs before hover at line285; fixed number10 rows no longer pushes target to test required lower region. Card rendering/clamping assertion never runs; no clipped-card defect demonstrated. |
| `e2e/side-session.spec.ts:360 [1920x1080]` | 待定位 | line370 main/side composer height difference44px (bottom difference0) persists through10s polling; 1280px counterpart passed Measured side/main card height44px difference with aligned bottoms; screenshot confirms side footer2 rows versus main1. Older footer-rows contract says equal height, newer10-28 toolbar spec permits narrow left/right split. Definite observed geometry, but classify contract/test inconsistency pending clarification of whether equal-card-height remains required. No chat functionality failure. |
| `e2e/subagent-roster.spec.ts:12` | 过期测试定位／流程 | line42 getByRole(button,name /^子 Agent/) strict mode resolves settings nav plus statusbar enabled-count button Earlier assertions confirmed23 roles, grouping/search and custom helper disabled written to file; snapshot shows both displayed counts22 as expected. Global selector ambiguous after statusbar added. Later re-enable assertions not reached. |
| `e2e/subagent.spec.ts:227` | 待定位 | line246 second chip y424.5 expected>=first bottom428.5 (4px overlap inferred from separate boundingBox calls) Both child results,2 chips,2/2 summary and ok statuses passed. Screenshot shows separate rows without overlap; source grid single column gap6. Trace measures boxes in separate calls18ms apart while transcript can move. Cannot distinguish transient scrolling/resize versus layout defect without atomic narrow repeat. Ledger assertions never reached. |
| `e2e/ui-layout-final.spec.ts:34` | 过期测试定位／流程 | checkComposer line18 send/add button vertical-center difference44px expected<=2; caller line44 side composer Newer10-28 toolbar spec explicitly allows left/right groups on separate rows in narrow dock. This test insists add/send share one row and fails on intended responsive split. Distinct from side-session equal-card-height contract, which remains active. Later overflow assertions not reached. |
| `e2e/ui-layout-final.spec.ts:48` | 过期测试定位／流程 | line69 .statusbar .brand-version element absent timeout25s Same outdated version class as header-version; version rendered .app-status-version button. Preceding compact branding/sash/collapse/reopen assertions passed. |
| `e2e/upload-experience.spec.ts:55` | 产品布局问题 | line116 final1000x620 window predicate staysfalse25s (footer flush/bounded-half-height and preview>60px conjunction) Screenshot visibly clips file-preview header/text into thin strip at1000x620 with transfer panel expanded. Earlier upload confirmation/cancel,3-file completion,remote content/binary download/source retention,columns and larger-window geometry passed. Predicate boolean does not retain individual measured values; exact failing term/root cause not isolated. Root-path upload assertions never reached. Current10-21 spec explicitly reserves preview space in narrow/short windows. Suspected remaining-height/grid allocation and zero transferMaxHeight falling back to33vh at1086; not independently measured/proven. |
| `e2e/visual.spec.ts:289 [命令面板 · 亮色]` | 视觉基线差异 | 170255 differing pixels ratio0.17 Diff and actual images inspected in14-case montage; systematic current statusbar/toolbar/default-workspace/layout changes versus older baselines (representative expected0.0.35,actual0.0.41). Actual screens render content; snapshot mismatch alone does not establish functional defect. No baseline modified; individual incidental regressions not exhaustively excluded. |
| `e2e/visual.spec.ts:289 [命令面板 · 暗色]` | 视觉基线差异 | 162406 differing pixels ratio0.16 Diff and actual images inspected in14-case montage; systematic current statusbar/toolbar/default-workspace/layout changes versus older baselines (representative expected0.0.35,actual0.0.41). Actual screens render content; snapshot mismatch alone does not establish functional defect. No baseline modified; individual incidental regressions not exhaustively excluded. |
| `e2e/visual.spec.ts:289 [坞里的对话 · 亮色]` | 视觉基线差异 | 183845 differing pixels ratio0.18 Diff and actual images inspected in14-case montage; systematic current statusbar/toolbar/default-workspace/layout changes versus older baselines (representative expected0.0.35,actual0.0.41). Actual screens render content; snapshot mismatch alone does not establish functional defect. No baseline modified; individual incidental regressions not exhaustively excluded. |
| `e2e/visual.spec.ts:289 [坞里的对话 · 暗色]` | 视觉基线差异 | 260860 differing pixels ratio0.26 Diff and actual images inspected in14-case montage; systematic current statusbar/toolbar/default-workspace/layout changes versus older baselines (representative expected0.0.35,actual0.0.41). Actual screens render content; snapshot mismatch alone does not establish functional defect. No baseline modified; individual incidental regressions not exhaustively excluded. |
| `e2e/visual.spec.ts:289 [对话 · 亮色]` | 视觉基线差异 | 125694 differing pixels ratio0.13 Diff and actual images inspected in14-case montage; systematic current statusbar/toolbar/default-workspace/layout changes versus older baselines (representative expected0.0.35,actual0.0.41). Actual screens render content; snapshot mismatch alone does not establish functional defect. No baseline modified; individual incidental regressions not exhaustively excluded. |
| `e2e/visual.spec.ts:289 [对话 · 暗色]` | 视觉基线差异 | 165631 differing pixels ratio0.17 Diff and actual images inspected in14-case montage; systematic current statusbar/toolbar/default-workspace/layout changes versus older baselines (representative expected0.0.35,actual0.0.41). Actual screens render content; snapshot mismatch alone does not establish functional defect. No baseline modified; individual incidental regressions not exhaustively excluded. |
| `e2e/visual.spec.ts:289 [概览 · 亮色]` | 视觉基线差异 | 99623 differing pixels ratio0.10 Diff and actual images inspected in14-case montage; systematic current statusbar/toolbar/default-workspace/layout changes versus older baselines (representative expected0.0.35,actual0.0.41). Actual screens render content; snapshot mismatch alone does not establish functional defect. No baseline modified; individual incidental regressions not exhaustively excluded. |
| `e2e/visual.spec.ts:289 [概览 · 暗色]` | 视觉基线差异 | 127479 differing pixels ratio0.13 Diff and actual images inspected in14-case montage; systematic current statusbar/toolbar/default-workspace/layout changes versus older baselines (representative expected0.0.35,actual0.0.41). Actual screens render content; snapshot mismatch alone does not establish functional defect. No baseline modified; individual incidental regressions not exhaustively excluded. |
| `e2e/visual.spec.ts:289 [空态 · 亮色]` | 视觉基线差异 | 125016 differing pixels ratio0.13 Diff and actual images inspected in14-case montage; systematic current statusbar/toolbar/default-workspace/layout changes versus older baselines (representative expected0.0.35,actual0.0.41). Actual screens render content; snapshot mismatch alone does not establish functional defect. No baseline modified; individual incidental regressions not exhaustively excluded. |
| `e2e/visual.spec.ts:289 [空态 · 暗色]` | 视觉基线差异 | 147914 differing pixels ratio0.15 Diff and actual images inspected in14-case montage; systematic current statusbar/toolbar/default-workspace/layout changes versus older baselines (representative expected0.0.35,actual0.0.41). Actual screens render content; snapshot mismatch alone does not establish functional defect. No baseline modified; individual incidental regressions not exhaustively excluded. |
| `e2e/visual.spec.ts:289 [设置 · 亮色]` | 视觉基线差异 | 64778 differing pixels ratio0.07 Diff and actual images inspected in14-case montage; systematic current statusbar/toolbar/default-workspace/layout changes versus older baselines (representative expected0.0.35,actual0.0.41). Actual screens render content; snapshot mismatch alone does not establish functional defect. No baseline modified; individual incidental regressions not exhaustively excluded. |
| `e2e/visual.spec.ts:289 [设置 · 暗色]` | 视觉基线差异 | 68547 differing pixels ratio0.07 Diff and actual images inspected in14-case montage; systematic current statusbar/toolbar/default-workspace/layout changes versus older baselines (representative expected0.0.35,actual0.0.41). Actual screens render content; snapshot mismatch alone does not establish functional defect. No baseline modified; individual incidental regressions not exhaustively excluded. |
| `e2e/visual.spec.ts:289 [设置栏 · 亮色]` | 视觉基线差异 | 114360 differing pixels ratio0.12 Diff and actual images inspected in14-case montage; systematic current statusbar/toolbar/default-workspace/layout changes versus older baselines (representative expected0.0.35,actual0.0.41). Actual screens render content; snapshot mismatch alone does not establish functional defect. No baseline modified; individual incidental regressions not exhaustively excluded. |
| `e2e/visual.spec.ts:289 [设置栏 · 暗色]` | 视觉基线差异 | 136944 differing pixels ratio0.14 Diff and actual images inspected in14-case montage; systematic current statusbar/toolbar/default-workspace/layout changes versus older baselines (representative expected0.0.35,actual0.0.41). Actual screens render content; snapshot mismatch alone does not establish functional defect. No baseline modified; individual incidental regressions not exhaustively excluded. |

失败分类依据截图、trace、当前源码和必要的独立复测；未执行完的后续断言不写成已验证。详细源位置见同目录原始分类 JSON。

## 按优先级列出的代码问题

复现脚本以断言缺陷存在为成功条件，退出码 0 表示复现成功，不能当作修复后的回归通过。

### A01 P1 浏览器下载经最终文件符号链接写到工作区外

定位：`src/tools/browser/tools.ts:37-42,367`。

触发：工作区包含指向外部的目标文件符号链接，模型调用 browser_download 保存到该相对路径。

证据：已运行真实路径守卫：workspace/download.csv 指向 outside/data.csv 时守卫放行，随后同工具写法将外部 original 改为 downloaded。父目录符号链接下新增子目录还会在拒绝前创建外部目录。

影响：绕过工具声称的工作区写入边界，可覆盖外部文件。

建议：在任何 mkdir/写入前校验所有已有祖先及最终目标；禁止跟随最终文件符号链接，写入采用安全原子替换并考虑竞态。

复现脚本：`artifacts/code-audit-2026-10-30/probes/ui/browser-path-escape.ts`。脚本使用本机绝对源码路径，按报告基准 checkout 运行。

### A02 P1 远程 MCP 跨源重定向转发自定义密钥头和请求正文

定位：`src/mcp/客户端.ts:279-286; src/mcp/request-fetch.ts:78; package.json @modelcontextprotocol/sdk`。

触发：配置的远程 HTTP/SSE MCP 端点返回跨源重定向；307/308 保留请求正文。

证据：真实 SDK 1.30.0 与本项目 McpRequestFetch，在两个本机回环 HTTP 服务间复现 307 后 X-API-Key 哑密钥和 tools/list 正文到达另一 origin。

影响：自定义凭证、会话标识及工具参数可能泄漏到另一个站点。当前 fetch 会移除 Authorization，本次未声称该头泄漏；stdio 不受该路径影响。

建议：升级 MCP SDK 至至少 1.32.0 并回归本项目自定义 fetch/取消/SSE；或在 fetch 层拒绝重定向、严格约束 origin。

复现脚本：`artifacts/code-audit-2026-10-30/probes/dependency/repro-mcp-redirect.mjs`。脚本使用本机绝对源码路径，按报告基准 checkout 运行。

来源：[MCP SDK 上游公告](https://github.com/advisories/GHSA-6prh-2h8m-c8cw)。

### A03 P2 内核握手重试重复签名，初始 PUB 消息丢失后无法恢复

定位：`src/kernel/channel.ts:313-325`。

触发：初始 kernel_info 的 PUB 状态在订阅生效前丢失；重试沿用相同消息身份与内容。

证据：实际 createKernelChannel、enchannel 与本机 ipykernel；传输夹具只丢弃首个握手的 busy/idle 与 welcome，观察到 10 次发送、1 次 shell 回复、0 条后续握手状态、Duplicate Signature 与 2.5 秒就绪超时。另有真实内核直接协议复现：同消息重发不回复，新身份立即回复。

影响：健康的 Python/R 或远端内核可能被判定启动失败，run_code 不执行；与本次部分集成失败形态一致，但原始失败未抓到全部网络帧，不能断言每条都仅由此导致。

建议：每次探测生成新身份和新签名；跟踪所有本轮握手身份并接受相应状态。补确定性丢首帧回归。

复现脚本：`artifacts/code-audit-2026-10-30/probes/core/repro-handshake-adapter.mjs`。脚本使用本机绝对源码路径，按报告基准 checkout 运行。

### A04 P2 删除正在恢复的会话后，运行时仍被绑定为活动

定位：`src/session/manager.ts:486-490,929-949`。

触发：打开历史会话触发恢复，在 start 完成前删除或停止同一会话。

证据：真实 SessionManager 配合延迟 start：resume -> remove -> start 完成，结果 removed=true、数据库记录不存在、isLive=true、stops=0，resume 返回 undefined。

影响：运行时和数据库身份分离；已删除会话仍有活动资源，删除动作不能保证终止待启动运行时。

建议：按会话串行化恢复/停止/删除，或引入启动失效令牌，失效后对已启动运行时执行 stop。

复现脚本：`artifacts/code-audit-2026-10-30/probes/core/repro.mjs`。脚本使用本机绝对源码路径，按报告基准 checkout 运行。

### A05 P2 长时间定时任务的重叠检测只看最近 50 条历史

定位：`src/schedule/scheduler.ts:99-100`。

触发：单次运行跨过至少 50 个调度周期。

证据：真实 Scheduler 与保持实际排序/裁剪语义的隔离 store：1 分钟计划跑到第 51 分钟，原运行被 50 条 skipped 记录挤出查询；额外运行变为 queued，原运行完成后 starts 从 1 增为 2。默认执行超时 60 分钟，场景可达。

影响：本应因 overlap 跳过的任务被排队并再次执行，可能重复计算或写入。

建议：独立查询未完成运行，不能用历史分页判断在途状态；裁剪时保护未完成记录。

复现脚本：`artifacts/code-audit-2026-10-30/probes/core/repro.mjs`。脚本使用本机绝对源码路径，按报告基准 checkout 运行。

### A06 P2 视觉请求只限制响应头等待，响应体可无限等待

定位：`src/runtime/vision.ts:89-102`。

触发：视觉服务很快返回响应头，但 JSON 正文迟迟不结束。

证据：真实 描述图片 使用受控 Response body；将既定 60 秒计时压缩为 20ms，3 倍期限后 Promise 仍 pending 且 signal.aborted=false，释放 body 后才完成。

影响：贴图转述或 look_at_image 超过声明的 60 秒仍可能挂住。

建议：超时覆盖 fetch 和整个响应体解析，并将中止传播给转述/工具取消路径。

复现脚本：`artifacts/code-audit-2026-10-30/probes/vision-timeout.mjs`。脚本使用本机绝对源码路径，按报告基准 checkout 运行。

### A07 P2 同时首次使用浏览器会启动两份并遗留一份

定位：`src/tools/browser/session.ts:43-51,164-170`。

触发：浏览器尚未启动时，两会话/子任务并发调用浏览器工具。

证据：真实 session 模块，仅 stub chromium.launch：Promise.all 两个开标签后关闭，launches=2、closed=[false,true]，但状态 open=false,tabs=0。

影响：全局引用被覆盖，关闭只处理最后一份，早先浏览器进程与标签成为孤儿，界面状态与真实进程不一致。

建议：共享进行中的启动 Promise，关闭与启动串行协调。

复现脚本：`artifacts/code-audit-2026-10-30/probes/ui/browser-concurrent-launch.ts`。脚本使用本机绝对源码路径，按报告基准 checkout 运行。

### A08 P2 网页下载完成时可能被登记到另一个项目

定位：`src/electron/web-preview.ts:307-317,347; src/electron/wiring.ts:1622`。

触发：项目 A 的慢速下载未结束，预览转到项目 B，然后 A 下载完成。

证据：代码路径确认：will-download 捕获 URL，但 done 才读取可变 上次项目；后续 open 会替换该项目。未进行 Electron 下载切项目运行复现。

影响：A 的下载事实写入 B 的项目/活会话，污染来源记录。

建议：在下载开始时固定 projectId/关联会话，与 URL 一并保存在闭包。

### A09 P2 Windows 默认 PowerShell 无法进入桌面 DAWN 模式

定位：`src/config/loader.ts:89; src/terminal/control.ts:174-176; src/cli/desktop-host.ts:58`。

触发：Windows 新安装的默认终端点击进入 DAWN，或在其内解析生成的 dawn.cmd。

证据：代码路径确认：Windows 默认 powershell.exe，而 launchCli 仅允许 sh/bash/zsh；环境 PATH 又使用冒号而非 Windows 分号。未运行原生 Windows。

影响：默认空闲 PowerShell 被拒绝进入；命令搜索路径第一项被破坏。

建议：实现明确的 PowerShell 启动/空闲检测，使用平台 path.delimiter，补原生 Windows 功能测试。

### A10 P2 发布库存只检查扩展名，漏架构仍可能声称齐全

定位：`.github/workflows/release.yml:91-105`。

触发：例如 Linux arm64 构建失败而 x64 成功，或一个 macOS 架构失败。

证据：已执行原始 workflow inventory 脚本，隔离目录仅放 mac-arm64 dmg、win-x64 exe、Linux-x64 AppImage/deb；缺 Linux arm64 与 mac x64 仍输出“四个平台的包都在”。没有触发发布。

影响：自动发布的完整性声明不准确，缺失目标未进入提示。

建议：按预期 OS、架构、文件类型/变体检查精确文件名并与矩阵结果对应。

复现脚本：`artifacts/code-audit-2026-10-30/probes/release-inventory.mjs`。脚本使用本机绝对源码路径，按报告基准 checkout 运行。

### A11 P2 默认路线 PDF 预览高度小于既有验收要求

定位：`src/ui/styles.css:8980,8984; e2e/analysis-route-map.spec.ts:29`。

触发：默认窗口尺寸下，路线图和文件预览同时打开，并有底部提示区域。

证据：完整 E2E 与单独复测均观测到 stage.height=147.5859375px，断言要求 >180；canvas 已 data-rendered=true，截图可见整页但缩得过小。历史验收文档明确记录曾修复过矮问题。

影响：图文阅读区域不足；不等于 PDF 解码失败，放大入口仍可用。

建议：给预览正文保留合理高度，让总览在垂直空间不足时压缩/滚动；保持草稿/焦点/路线可见性回归。

### A14 P2 端到端入口用标题过滤，漏测三个无关用例

定位：`package.json:39-42`。

触发：按 npm run test:e2e 的标题正则排除“内核会话|解释器路径”，相关词同时出现在其他文件的测试标题中。

证据：实际收集完整默认清单904项；grep-invert 后897项。被过滤的7项中，kernel-session单跑仅补回4个独立用例，同时重复主套件的2项；attach.spec.ts:541、kernels.spec.ts:15、setup-wizard.spec.ts:97 三项未被标准入口补回。本轮已单独补跑这3项，全部通过。

影响：即使命令各阶段通过，也不等于默认测试清单全部执行；非内核测试被静默漏掉。

建议：按文件或明确项目划分 kernel-session，与完整测试清单做集合核对，避免用自然语言标题划定隔离组。

### A16 P2 短窗口展开传输任务后文件预览被压成细条

定位：`src/ui/files.tsx:1052,1086,1093; src/ui/styles.css:2226,2443,9086; e2e/upload-experience.spec.ts:113-116`。

触发：完成多文件上传，在文件面板打开文本预览并展开传输任务，将窗口缩至1000×620。

证据：主套件和单独复测均在最终布局谓词等待25秒后失败；失败截图显示文件预览标题被裁切、正文不可读。前面的文件内容、二进制下载、源文件保留断言已通过；最终根目录上传断言尚未到达。10月21日upload-experience-design明确要求短窗口仍保留预览。见dawn-audit-20261030-upload-retest.log及失败截图。

影响：常见短窗口下无法正常阅读文件预览。尚未证明上传数据损坏；组合谓词未分别记录三个测量值，不能把传输区位置或高度也断言为已失败。

建议：检查文件面板固定区域、目录、预览、传输区的联合高度分配，保留预览可读下限；特别核对transferMaxHeight为0时回退33vh的路径。该回退是待验证假设，不是已经确定的根因。

### A12 P3 Node 支持声明超出实际依赖支持范围

定位：`package.json:11; node_modules/@earendil-works/pi-*/package.json engines; node_modules/jsdom/package.json:124`。

触发：遵循根 engines 声明使用较早 Node22/24 版本做开发或运行独立 CLI。

证据：声明 >=22，而生产 pi 0.86.0 与 undici 要求 >=22.19.0；开发 jsdom30 要求 ^22.22.2 || ^24.15.0 || >=26.0.0。当前 Node22.23.0 满足依赖。

影响：受支持声明与实际可安装/运行环境不一致。

建议：对齐 engines、开发环境与文档，按实际支持版本设置 CI 矩阵。

### A13 P3 普通非 native 会话也反复记录 Bot 送达失败

定位：`src/workbench/backend.ts:759,2177-2179,2235,2739; src/bot/delivery.ts:13-15`。

触发：启用默认 Bot 存储时订阅或完成一次 ACP/内核会话，即便没有 Bot 待发送结果。

证据：本次真实 Electron 测试中，正常 ACP/内核会话多次记录 [Bot] 恢复送达失败／结果送达失败：Bot Team 第一版只支持 native/API 主会话。代码在任意 idle/订阅触发 flush，且在确认是否存在 pendingResults 前就调用只支持 native 的 busy 回调。

影响：产生与实际任务状态无关的错误堆栈，污染诊断日志；这些错误被捕获，未证明会终止正常会话。

建议：在触发 flush 前筛选合适的 owner/runtime，或先检查实际待发送项；保留真实结果送达异常的明确报告。

### A15 P3 输入卡同高旧契约与新版窄栏分行规则未对齐

定位：`src/ui/footer-rows.ts:2-9; src/ui/styles.css:8853-8855; e2e/side-session.spec.ts:360; docs/superpowers/specs/2026-10-28-composer-toolbar-order.md:5`。

触发：1920宽窗口中同时显示主会话和侧边会话；侧栏容器小于600px而主区足够宽。

证据：主套件与独立复测均观察到1920宽窗口两输入卡相差44px，底边对齐；1280宽对照通过。旧源码注释和测试要求同高，但10月28日较新设计明确允许极窄栏左右组分行，尚不能把高度差本身确定为违背当前需求。

影响：测试与新旧设计口径冲突，使绿色验收标准不清晰；没有证明影响消息发送或导致控件裁切。

建议：先按最新设计核定同高要求是否保留，再同步布局、测试和旧注释；不要仅为通过旧断言强制改变已批准的窄栏交互。

## 依赖审计的解释

| 范围 | 严重 | 高危 | 中危 | 低危 | 合计 |
|---|---:|---:|---:|---:|---:|
| 根项目含开发依赖 | 4 | 13 | 15 | 7 | 39 |
| 根项目 `--omit=dev` | 4 | 10 | 13 | 7 | 34 |
| spikes/c-electron-term | 0 | 2 | 0 | 0 | 2 |
| spikes/d-electron-zmq | 0 | 2 | 7 | 0 | 9 |

这些是 npm 审计返回的受影响依赖条目数，可能包含同一依赖链的元告警，不是独立可利用漏洞数。`--omit=dev` 也不等同于最终打包应用的可达代码扫描。两个 spikes 是独立实验项目，不能与根应用简单加总。

已实际复现的依赖攻击路径为 A02。`simple-git`/argv-parser 严重告警没有在 src/scripts 中找到实际引用；`proxy-addr` 需要 Express trust-proxy 等前提，项目 MCP 服务走 stdio，未见相应配置；DOMPurify 经 Streamdown/Mermaid 进入依赖图，但未证明项目使用该公告所要求的配置；OAuth 相关 MCP 告警未见 authProvider 路径。它们需要修复/消减依赖并做可达性核对，但不能写成这次均已成功利用。

Electron 43.3.0、MCP SDK 1.30.0、Zod 4.4.3、Vite 8.2.1、Vitest 4.1.10 等均有审计条目，完整清单见 JSON。部分修复建议会跨主版本或甚至降级，不宜直接 `npm audit fix --force`。应分组升级、评估 API 差异，并回归原生模块、MCP 取消/重连、构建和打包。

根 manifest 与 lock 的 dependencies/devDependencies/bin/engines 一致；lock 的根版本仍为 `0.0.35`，manifest 为 `0.0.41`。这是发布元数据维护缺口，本次清洁安装已成功，不是已证明的安装阻断。两个构建脚本直接 import `esbuild`，当前由传递依赖提供而未直接声明，是维护风险，本次未导致失败。

## 测试诊断与支持边界

- `boot.spec.ts` 仍寻找 `.statusbar > span`，`header-version.spec.ts` 仍寻找 `.brand-version`，当前状态栏结构已改变。`bulk-delete.spec.ts` 寻找旧行内“删除会话”按钮，当前入口为“会话操作”菜单内“删除”。英文界面测试中，宽泛的 Skills 按钮定位同时匹配设置和状态栏两处入口，不能据此认定有中文泄漏。应更新交互路径，并继续验证实际功能，不能靠删除断言或更新截图把失败变绿。

- `e2e/fixtures.ts` 的 `开一段临时会话` 忽略 `createTask` 返回的错误并返回 true。内核测试创建耗时约 20.4 秒后，又因不存在会话等 30 秒，最终错误隐藏了原始启动错误；需要先检查创建响应并抛出原始信息。

- 双内核隔离用例在首次 R 执行时出现 `R_zmq_bind: Address already in use`，Python 初始化与后续三次 R 重启都未到达。冲突端口及其占用者未捕获，不能断言这就是 A03，或指定是哪一个进程干扰。端口分配器先探测空闲再启动，进程内串行队列不解决跨进程竞态；本轮仍保留为实际启动失败与待定位环境条件。

- 完整测试与其他本机工作可能争用 CPU、窗口或系统资源。单独复测通过只说明本次复测通过，不能抹去原始失败；确定性协议/状态复现不依赖该负载。

- 模型链路使用共享 mock 推理服务；没有调用用户真实付费模型，没有连接真实 SSH/微信/飞书账号。真实 Python/R 内核测试只运行测试自带的本机任务。

- 本机仅验证 macOS arm64。Windows/Linux 原生打包、运行、安装/更新、真实服务器和真实凭证迁移未验证。CI YAML 的存在不代表远端 CI 已通过，本轮未核实远端 Actions 状态。

- macOS 打包测试使用隔离 profile、数据库、工作区和临时目录，未替换 `/Applications` 中的应用。E2E 生成的已跟踪截图会先归档为本轮证据，再还原检查前版本；新增审查报告和证据另行保留。

## 修复顺序建议

先处理 A01/A02 文件与凭证边界，再修复 A03 内核握手及 A04 会话生命周期；随后修复调度、请求超时、浏览器并发和归属；并行整理过期测试与失败诊断。最后分批升级依赖，在原生平台和真实授权环境补齐验收。此顺序是审查建议，不表示上述问题已经修改。
