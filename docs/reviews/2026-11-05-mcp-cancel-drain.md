# MCP 取消关闭根因与完整桌面回归

起点：`e58a07fa`，本轮在 `codex/mcp-cancel-drain` 隔离工作树实施。用户授权本地提交/合并，不推送、不发布、不替换正式 App。

## 根因闭环

原代码的实际 loopback HTTP 压力复现：200 次、并发 16，1 个已返回响应头的 SSE 请求在调用取消、取消通知已经送达后，服务端响应和 socket 继续保持打开。额外观察至 6 秒仍未关闭，取证在 pool/fixture 强制清理之前，不能归结为默认 1000ms 观察窗口太短。原始数据在 baseline-probe.json。

主动 GC 对照：在响应头已经返回后两轮 GC，30 次、并发 8 中，15 个已打开流全部未释放；15 个尚未返回响应头的请求正常关闭。gc-probe.json 保留时序。使用 Node 22.23.0 / Undici 6.27.0 的真实 HTTP、SDK、响应 body，不是只检查 mock AbortSignal。

本地 Node 内置 Undici 的 Request 实现中，跟随上游 signal 的 abort controller 由 Request 强持有，abort listener 仅保留 controller 的 WeakRef，controller 回收后的 finalizer 移除 listener。`mcpSafeFetch` 先构造短命 Request，再让 fetch 从其 signal 继续跟随；响应头返回后临时 Request 可回收，破坏后来取消至仍活跃响应 body 的链路。请求 Promise 已取消和取消通知已到达，并不能证明该 body 已释放。

最小修复保持原 `FetchLike(string | URL, init)` 契约：每次实际 fetch 直接转发调用方原始 `init.signal`，包括显式 null。保留原同源重定向、请求/共享流信号来源、恢复与结果未知语义，不重置连接池，不改超时/重试/视觉基线。

额外探测了静态契约之外的临时 Request 输入：本机原生 fetch 与辅助函数都存在相同 GC 限制。证据在 request-input-probe.json；本轮未扩展 MCP 原有 URL 调用契约，不宣称修复 Node 的通用 fetch API。

## 验证

- 新增真实 Node 子进程 `--expose-gc` 回归，原实现稳定失败，最小修复后通过；包含同源 307 后 GC/取消。
- 修复后的 200 次 GC 压力、100 次同源重定向 GC 压力、500 次普通并发取消全部通过，均在强制清理前观测到实际响应关闭；原 1000ms 判断保持。
- 上述压力并发是独立池/服务之间的负载，各轮一个 hold 与先完成的 echo；同一连接多等待流、HTTP202 共享 GET 和恢复由既有 MCP 回归覆盖，本轮没有将独立池压力表述为这些路径的 GC 压测。
- 实际 Electron 43.8.4 / Node 24.22.1：只对目标 MCP URL 观察客户端收到的 SSE 响应头，再主进程 GC，点击停止后约 41ms 服务端响应关闭；同一连接 echo 成功，初始化世代仍为 1、hold 只调用一次。测试使用隔离配置/数据库与 localhost 服务、确定性推理，没有真实付费推理或外部 MCP。
- 新增桌面场景开发时的折叠区操作、evaluate 动态导入、HTTP 头计数范围错误均已修正测试准备过程；现场单独保留，不作为产品回归或成功证据。
- 正式桌面清单：原 919 项加新增 MCP 场景，共 920 项、239 文件；完整结果在后续追加。独立 kernel 组另跑。

## 交付状态

最终类型检查、完整构建通过；638文件/6313项通过、10项前提跳过；独立内核6项通过。最终完整桌面921项中920通过、1既有跳过，零失败、零重试、无全局收尾错误，46.2分钟。1482条源指纹及14张基线均无漂移。独立复审无新增阻塞，代码已本地提交`5a894ad8`；main集成复验续记于文末。

## 首轮部分运行与测试夹具修正

首轮完整清单运行在发现失败后有序 SIGINT（退出 130）：331 通过、2 失败、1 中断、586 尚未运行。desktop-full.json/txt 与失败 trace 原样保留，该轮不能称作完整验收。source-manifest-first-partial.json 保存其 1480 条源文件版本。

两项失败均有明确现场：

- `/compact` 的压缩标记、摘要、用量断言已经通过；第三句输入失败，因为下一步建议把 placeholder 从“输入问题”换成“检查缺失值并说明处理方法”。仅将该文件的区域内输入 helper 改为 `textarea.composer-field`，不改产品、断言或超时。
- 双内核重启/退出用例已完成 R/Python 运行和正常退出；夹具随后调用已主动关闭应用的 `app.process()`，Playwright 已释放其进程通道。改为成功启动时缓存 ChildProcess，每次重开更新，仍 await 应用关闭并严格检查 signalCode=null、exitCode=0，不吞错误。

修正后完整 context-compaction、双内核重启、MCP GC 取消及双终端退出组 13 项通过（fixture-recheck.json/txt），独立只读复审无阻塞。source-manifest.json 重新冻结 1480 条，只比首轮改变上述两份 E2E 代码；从第一项重新执行完整 920，结果单列 desktop-complete.json/txt，不拼接两轮结果。

## 第二轮完整运行与退出诊断

第二轮 `desktop-complete.json/txt` 已完整运行 920 项：918 通过、1 项既有跳过、1 项失败，另有对应 worker 收尾超时，50.3 分钟、退出 1。失败在远程内核被外部杀死后恢复用例：业务断言均通过，夹具 `await app.close()` 等待超时；不是 MCP 取消失败，也不能称作完整绿。两项先前测试夹具失败已通过。

原失败 trace 显示 Debugger ending 后没有应用 Close 完成，尚不能区分 native 退出卡住和子进程 stdio 未释放。新增仅环境变量启用的退出观察：记录 app 退出事件、缓存 ChildProcess 的 exit/close 和 stdio 状态；5 秒后只对本次拥有的 Electron 采样。观察器不关闭管道、不杀进程、不改变产品关闭逻辑/60 秒预算/退出码断言，记录与 ps 会引入少量时序扰动。

同一远程内核用例连续 5 次通过（1.8 分钟），均正常 exit 0、signal null，stdio 和 child close 完整；约半秒退出，未复现原卡顿。非空 activeResources 本身不证明泄漏；目前不将 native ZMQ 析构或其他猜测写成根因。保留失败原始现场，继续从第一项完整执行，并启用诊断。

## 独立复审

只读审查确认：每次实际 fetch 都转发调用方原 signal；专用请求与共享流的取消所有权未扩大，同源 307 与跨源拒绝保留旧规则。服务端 response-close 在 pool/fixture 强制清理前观测，GC 子进程与临时目录隔离；Electron 场景在目标 SSE 响应头到达后 GC，实际点击停止，并校验同一代连接可继续 echo。每次重开更新缓存的 ChildProcess，保持正常退出码断言；上下文输入仅换区域内稳定定位。退出诊断不改变预算或关闭逻辑。未发现新增阻塞 P1/P2。

该结论不等于远程内核偶发退出问题已修复；其根因尚未定位。新 GUI 的动态 placeholder 理论上受空输入建议影响，现有定向已通过；若后续该定位失败，应按测试输入准备机制调查，不误判 MCP 连接故障。

## 复现入口与边界

- `npx vitest run tests/mcp` 覆盖 MCP 及强制 GC 子进程回归。
- `DAWN_MCP_DIAG_GC=1 node --expose-gc --import tsx scripts/diagnose-mcp-cancellation.ts 200 16 <result.json>` 运行取消压力；再加 `DAWN_MCP_DIAG_REDIRECT=1` 覆盖同源 307。
- 构建后 `npx playwright test e2e/mcp-cancellation.spec.ts --workers=1 --update-snapshots=none` 验证真实 Electron；可通过 `DAWN_MCP_CANCEL_DEMO_DIR` 指定截图与时序输出目录。
- `DAWN_ELECTRON_EXIT_DIAGNOSTICS_DIR=<isolated-dir>` 为 E2E 开启退出观察。默认关闭；只采样本次 launch 拥有的进程，不记录通用 stderr、配置/请求正文。

本轮实际环境为 macOS、Node 22.23.0 / Electron 43.8.4 (Node 24.22.1)。模型和 SSH 端点为确定性本地夹具，Python/R 内核及 Electron、HTTP、GC、文件/数据库路径实际执行。结果不外推外网服务、付费推理、其他平台或安装包升级；未替换 /Applications 的正式应用，也未改正式配置/数据。

## 诊断轮部分运行与布局测试前提

第三轮 `desktop-final.json/txt` 因两处已定位的布局测试准备问题有序 SIGINT，退出130：361通过、2失败、1中断、556尚未运行。source-manifest-diagnostic-partial.json 保留该轮1481源条目；不计完整验收。无超过5秒的退出观测，新增MCP GC场景通过；该轮尚未到远端内核原退出场景。

- 文件悬浮信息卡和时间戳断言已过，测试随后等待“加宽”失败。实际截图2160×1616、2×缩放，对应约1080 CSS宽；现有布局扣侧栏264、主区420后达不到两栏560，产品按规则省略按钮。仅该测试显式设置1280×840 CSS视口以建立两栏前提，不扩大全套视口或改产品限制。
- 内核设置保存/清空和可见性已过；最后一次ArrowRight结束883659.019、aria断言883660.427、尺寸evaluate883663.188，距键盘提交约4ms，而既有grid宽度动画180ms。最终测试等待现有.body动画finished并双RAF，再执行原单次scrollWidth<=clientWidth；不finish/cancel动画，不改容差。动画中间态仍可能临时溢出，验的是最终窄栏布局。

探索poll版10次通过单列layout-recheck；正式动画等待版两个场景各重复5次，共10项通过33秒（layout-stable-recheck.json/txt），类型检查通过，独立只读复核无阻塞。后续完整运行结果单列desktop-verified-all。冻结清单生成命令首次因stdin编码报错，测试已启动；未修改任何源码，立即重新记录1481条指纹（仅上述两份E2E相对上轮有变化），结束时再核对，不能将该元数据生成时序表述为启动前已成功冻结。

## 第四轮完整清单与后续修复

`desktop-verified-all.json/txt`：920项完整执行，912通过、7失败、1既有跳过，49.3分钟，退出1。结束时1481条源指纹无漂移（source-verification-verified-all.json）；没有超过5秒的退出观察，原远程内核被杀后恢复/退出用例通过。仍不能称整轮全绿。

七项失败均独立取证：

1. 主对话列在1080 CSS宽时偏10px。最初“page-inset不同”解释因遗漏CSS覆盖规则撤回；实际动画后、同一evaluate取证确认：turns padding均32px，滚动层offsetWidth732/clientWidth710、stable both-edges；agent左311、输入301。贴底库的两侧22px槽是实际差异。1280下列封顶784，agent374、输入375正常。新增窄窗回归在原样式稳定红（thread-column-probe），修复只测滚动层实际槽宽，在主对话root设置CSS变量，输入区按该值预留；使用ResizeObserver，不按token更新React，切会话/卸载清理。欢迎页和紧凑侧聊不改。原测试另含宽窗留白比例，显式1280建立该前提；新增1080/1280测试继续严格<=2px。
2. 工作目录菜单高度31.999053955而非32。trace先读宽346=360×0.96，随后四舍五入360便提前通过，但dawn-pop的120ms缩放尚未结束。只等待该弹窗现有动画及双RAF，保留严格尺寸相等。
3. 新MCP用例在配置页尚未提交时查询isVisible，随后点击summary反而关掉默认打开的details；未发MCP请求。改为等待精确“加一台MCP服务器”说明区的open属性和textarea可见，复用稳定composer-field输入身份。探索修正曾因两块同类details触发strict locator，单独记录在layout-and-mcp-fixed，后续限定精确summary目标，未放松取消断言。
4–5. 两项terminal-context-return都卡在原始PTY字节必须以$结尾的准备判断。加现有TerminalScreen解析取证，原判断仍红；相同raw下parsedReady=true，cursorPrefix确为Shell提示符，原始尾部含6个退格（codepoint8）与重绘序列（terminal-prompt-red.json）。最终测试复用产品TerminalScreen+readyPrompt，按实际光标判断；不改终端权限/切换业务，不靠回显假就绪。
6. 新的可选诊断在窗口就绪前evaluate，发生“Resulting promise was garbage collected”，图片业务未开始。应用事件注册移至firstWindow与reload之后；可选观测失败单独记录，不作为产品失败，应用启动/业务断言、await app.close与signal=null/exit=0仍强制执行。ChildProcess exit/close/stdio观察始终从launch接入。
7. 上传各项实际传输、下载内容、源文件保留已过，恢复原生窗口后不足两栏，等“加宽”失败。仅该E2E将宽/窄阶段明确为CSS视口1280/1100/900/1000，保留原各阶段几何、传输和文件完整性断言。

本轮不将这些失败一概归为产品退化，也不将新诊断自身失败掩饰为原功能问题。新增的产品变更仅是已红绿复现的主对话滚动槽对齐；MCP产品改动仍为原signal直传。定向、完整单元及最终完整桌面结果随后追加。

## 修复后验收与视觉审查

- `final-remediation-focused`：之前失败场景所在的完整相关文件，加远程内核和双终端退出，共43项全部通过，3.1分钟；可选应用事件观察无缺失、无5秒退出延迟。
- 新gutter测试追加1080 thin →1280 thin →1080 none →1080 thin，显式断言槽宽归零及恢复，保持每阶段边缘<=2px。仅修改隔离窗口样式，不改变系统滚动条设置。MCP与该用例各重复3次，共6项通过16.5秒；实际槽宽22→0→22，验证ResizeObserver响应。
- 第一轮完整单元发现2条设计契约失败（var回退值、未定义token），修正为tokens.css统一定义默认0px、样式只引用token。其后新增测试数组类型检查错误已修正为捕获函数的推导返回类型。原失败日志单列保留；最终类型检查/完整构建通过，638文件全部通过、6313项通过/10前提跳过，150.45秒。独立Electron真实内核组6项通过15.8秒。
- 开始921完整清单后，主动在前段停止以先审查UI修复的视觉影响（desktop-release-final为该次部分运行，不计完整验收）。视觉前置14项中12通过、两张“坞里的对话”亮暗失败；逐张查看expected/actual/diff，变化是主区输入卡按实际槽宽内缩11px，右侧对话保持原样。旧图0.0.41→当前0.0.44版本号有既有微小差异。像素对照确认所有差异均位于主区输入卡或该版本号区域之外0像素（visual-baseline-review.json）；只复制这两张已审查actual为基线，原threshold/maxDiffPixels、mask不变，其余基线不动。后续重跑仍用update-snapshots=none。

## 最终完整门禁

视觉审查后14项全部通过。前段停止的desktop-release-final为40通过、1中断、880未运行；不计完整验收。

最终`desktop-accepted-final.json/txt`从第一项完整运行原919加MCP/窄窗两项，共921项：**920通过、1既有跳过、0失败、0flaky、无全局错误**，46.2分钟，退出0；未自动重试，update-snapshots=none。跳过项为sidebar-collapse.spec.ts:55“展开的过程中同样不被压（已按取舍放弃）”，本轮未新增跳过。1482源码与14张基线前后哈希一致（source-verification-accepted-final.json）。

该轮包括重开在内942个Electron实例均exit 0、signal null，全部stdio和child close完成，最长close-requested到child-close约495.41ms；无5秒延迟或应用事件观察缺失。事件按原run/file归档exit-observations.jsonl，原文件哈希与事件数在exit-observations-index.json，汇总在exit-diagnostics-summary.json。

整轮实际MCP演示：响应头后GC，点击停止后约56.15ms观测服务端流关闭；pending为空；同一连接echo完成，初始化世代仍为1、hold只调用1次。截图/真实时序在full-accepted-final-demo/，推理为确定性本地夹具，HTTP与Electron实际执行。

此前desktop-complete的单次远程内核退出超时仍**未确认根因**；该场景随后5次重复、相关定向和两轮完整清单均正常，不能称那次退出问题已修复。已保留原trace和退出诊断入口，经复审未发现新的阻塞遗漏，作为未复现的间歇风险保留。MCP流泄漏则有原实现真实HTTP/GC红测与修复后绿测闭环，两者明确区分。

清理仅涉及本轮材料：已哈希清理重复通过截图，失败/中断trace保留；全量测试重写的19份旧演示导出及4张旧宣传导出恢复为原提交字节，不将历史记录改成新一轮结果。确认无进程/文件占用后清理已知失败隔离profile（56文件、约2.17MB），记录在failed-fixture-cleanup.json。正式App与配置/数据未操作。
