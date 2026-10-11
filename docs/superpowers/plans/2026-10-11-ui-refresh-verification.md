# 页面迭代：首版实施验证记录

日期：2026-10-11。分支：`页面迭代`。基线：`207f9ff0`。

工作树：`/Users/liuyue/.codex/worktrees/ui-refresh-plan/dawn-science`。
原工作区保留 `codex/analysis-delivery-skill`，应用改动仅在隔离工作树；未提交、合并、推送、签名打包或替换已安装应用。

## 已实现

- 默认浅色与克制的青绿色；已有主题、强调色和侧栏宽度偏好继续恢复。
- 本机新建直接输入，首发才创建任务；项目、统一服务器区、最近/会话按使用优先级排列；定时、归档、设置仍可达。
- 添加服务器保存并连接；编辑仅保存；失败保留记录 ID、表单和本机草稿。服务器下新建远端任务复用连接，无本机回退，两台同名目录服务器的任务与草稿隔离。
- 厂家署名、精确模型及输入工具保留；首版上下文/权限位于卡外，已由第五轮同卡双层布局替代；不新增“标准”选项。
- 右侧文件/结果文件/笔记本常驻，其余六项收进更多；不自动开栏。结果按实际本轮文件计数，预览下保留文件清单，完整长列表可滚动。

## 范围校正与限制

- 远端目录按钮显示会话实际 `remote.cwd` 与完整路径，切换仍通过原自然语言命令机制。原计划误以为已有远端目录选择器，已改正；本轮未新增远端浏览/设置目录协议。显示路径没有传入本机附件落盘的 `workspace` 参数。
- 数据、模型和 SSH 均为隔离测试夹具；不代表真实服务器连通、真实科研分析或模型质量验证。
- **PDF 已知基线缺陷，尚未修复**：有效 pdf-lib 样例在约半秒后触发 `ChildProcessSecurityPolicy/localStorage` renderer 终止。隐藏、可见窗口及 `git archive 207f9ff0` 单独构建的旧 UI 均复现；`files.tsx` 与 Electron 主进程同基线完全一致，未见本轮引入证据，但根因未确定。iframe 替换与 PdfOopif 开/关探针均未解决，实验性改动已撤除。保持现有 PDF 实现与 blob 回收语义，不将瞬间 embed 挂载算成功，不宣称 PDF 通过。
- `e2e/pdf-preview-stability.spec.ts` 明示已知缺陷，默认跳过；独立复现命令为 `DAWN_REPRO_PDF=1 npx playwright test e2e/pdf-preview-stability.spec.ts`。保留约 1.8 秒后继续交互及切换文件判据。本轮完整界面截图测试仅验证成功的实际图像预览。
- EcoAI 仅保留独立派生计划，本轮未创建第二产品。
- 全量仓库测试、签名安装包、真实 macOS 组词输入和真实网络未执行。输入组合事件、Enter/Shift+Enter、灰色建议、权限及侧边草稿以已有组件/Electron 回归为依据。

## 验证证据

- 实施前基线：类型检查、构建通过；5 文件 144 项相关单测通过；48 项桌面测试 31 通过、17 失败（14 项视觉基线/Skills 计数，3 项项目样例与临时会话目录不匹配）。没有把旧基线当作全绿。
- 首版单测合并运行：20 文件 230 项通过；设计契约/双语扫描补验 2 文件 97 项通过，与前者存在重叠，不累加成独立用例数。
- 只读代码复核发现长结果列表被预览规则裁切；新增 60 文件桌面用例先失败，再限定 `.artifacts-preview` 滚动作用域后通过。复核未发现新的明确 P1/P2。
- 209 项相关 Electron 首轮 196 通过、13 失败。12 项为旧定位/布局契约（3 灰色建议替换 placeholder、3 归档 toast 与入口重名、6 旧侧栏/页签结构）；1 项为侧边对话仍用旧外壳底色，已改为主区一致的 panel 面。所有失败均进入最终复验范围，没有提高超时或放宽截图容差。
- 105 项定向桌面复验：102 通过、3 失败。两项侧栏几何断言仍沿用旧分组结构，已按实际相邻区域和有图标的入口修正；第三项是新加入的有效 PDF 稳定性检查，另行确认旧 UI 同样失败后拆为明确的已知缺陷用例。随后整套 sidebar-layout、sidebar-size、图像界面截图及 PDF 已知缺陷文件再验：21 通过、1 跳过。各轮覆盖有重叠，不相加成独立通过数。首轮 13 项失败涉及的文件都已复验通过。
- 最终类型检查与构建通过，构建只有原有 eval/大 chunk 提示。14 组亮暗 expected/actual/diff 已逐张审阅，按原配置重复两遍，28 次通过；阈值仍为 0、maxDiffPixels 仍为 100，遮罩未扩大。

## 真实应用截图

截图位于工作树 `tmp/ui-refresh-verification/`，不包含真实凭证、用户科学数据或真实服务器地址。

| 状态 | 路径 |
| --- | --- |
| 本机空态 | `checkpoint-a/local-new-task.png` |
| 添加服务器 | `checkpoint-a/add-server.png` |
| 已连接服务器 | `checkpoint-a/connected-server.png` |
| 远端新会话 | `checkpoint-a/remote-new-session.png` |
| 连接失败 | `checkpoint-a/connection-failed-1280.png` |
| 两台服务器、草稿隔离 | `checkpoint-a/two-servers-1280.png` |
| 分析与结果预览 | `after/analysis-{1280,1440,1920}.png` |
| 暗色/自选强调色 | `after/analysis-dark.png`、`after/analysis-custom-accent.png` |
| 窄右侧对话 | `after/narrow-side-chat.png` |
| 完整长结果列表 | `after/long-result-list.png` |
| PDF 失败诊断 | `diagnostics/pdf-before-crash.png`；这是崩溃前挂载画面，不是成功预览 |

截图交付给用户审阅不等于用户已验收，也不等于发布。

## 命令与日志

所有命令在上述隔离工作树运行。`logs/` 指 `tmp/ui-refresh-verification/logs/`，保留首轮失败记录，便于追踪断言迁移与实际修复。

| 检查 | 命令或记录 | 结果 |
| --- | --- | --- |
| 定向单测 | `dawn-ui-unit-final3.log` 第 2 行保留完整 20 文件命令 | 230 通过 |
| 契约与双语 | `dawn-ui-contract-final.log` | 97 通过，与前项重叠 |
| 类型 | `npm run typecheck`，`dawn-ui-typecheck-final2.log` | 通过 |
| 构建 | `npm run build`，`dawn-ui-build-final.log` | 通过 |
| 相关桌面首轮 | `dawn-ui-related-e2e.log` 第 2 行保留 29 文件命令 | 196 通过、13 失败 |
| 定向桌面复验 | `dawn-ui-final-e2e.log` 第 2 行保留 13 文件命令 | 102 通过、3 失败 |
| 收尾复验 | `npx playwright test e2e/sidebar-layout.spec.ts e2e/sidebar-size.spec.ts e2e/ui-refresh-preview.spec.ts e2e/pdf-preview-stability.spec.ts`，`dawn-ui-final-recheck.log` | 21 通过、PDF 已知缺陷 1 跳过 |
| PDF 当前/可见/旧 UI 复现 | `dawn-ui-pdf-stability-red.log`、`dawn-ui-pdf-visible.log`、`dawn-ui-pdf-baseline.log` | 三者均失败，未修复 |

视觉差异审阅另见 `visual-diff/` 的 14 组 expected/actual/diff 与两张对照拼图。首次差异采集用临时配置将 expect 等待缩短至 3 秒，只减少已知大面积设计差异的等待；像素容差、遮罩与样例不变。基线更新及最终复验均使用原仓库配置。

视觉收尾补记：首次按原配置复验 13/14 通过，暗色命令面板阴影差异 2077 像素；逐像素分析仅 RGB 各通道 1 的灰度差（原图总计 2128 像素），范围在浮层下缘阴影，内容与布局未变。额外三次独立采集的 actual 完全相同，均与刚更新的基线存在该差异。保留三张 actual、diff 和日志；不通过提高阈值、增加遮罩或修改产品阴影规避。采集差异的底层原因尚未确定。

只读审查独立确认三次稳定 actual 完全一致，无新增明确 P1/P2。根据 `CLAUDE.md:119–121` 的明确规则，已将稳定化后的 actual 仅替换暗色命令面板这一张基线，保留旧基线作诊断；随后按原配置对全部 14 项重复两遍。最终两遍共 28 次通过，日志 `dawn-ui-visual-final2.log`。该规则解释了 update 模式可能写入未稳定帧的已知症状，不代表已定位 Chromium 的投影灰度差根因。

最终差异检查通过；原工作区仍干净，分支/HEAD 与实施前一致。实际截图已交付审阅，用户验收、真实 SSH/输入法体验与发布尚未完成。


## 第二轮：精致与舒展感

用户试用后反馈“整体缺少参考图的精致、舒展感”，并授权“继续修改”。沿用同一分支与隔离开发配置。

- 60px 顶栏、32px 品牌标记，搜索仍使用原名字搜索入口并显示准确的范围提示。
- 侧栏主按钮 48px 且内容居中；导航 16px、行高 40px；分区标题/计数作为次级信息，服务器区底部留白收紧。
- 默认正文 17px，一级/二级/三级正文标题按 1.4/1.2/1.05 倍缩放；已有 15px 等合法偏好保留。厂家署名与正文同字号，头像与正文缩进跟随字号变化。
- 主/侧对话标题共用 28px 令牌，相邻消息留白 24px。模型/推理控件 40px，发送 44px；工具、用量、权限入口保留。
- 右侧默认 480px；已保存 380px 等宽度优先。图表以面板实际宽度呈现，紧凑清单跟随预览内容，不再被固定到底部；长完整清单仍可滚动。

142 项阶段单测与后续 157 项单测有重叠，不相加。默认宽度与默认字号/偏好恢复均有先红后绿证据。首次 38 项 Electron 检查 36 通过、2 失败：主按钮居中与旧同左缘断言冲突，改为中心几何判据；服务器分区间空白 48px 超过原上限，实际收紧样式，保留原测试阈值。后续完整复验结果见下方最终记录。

第一轮截图保留于 `tmp/ui-refresh-verification/iteration-1/`。最新 1586×992 截图与认可图同尺寸，另检查 1280/1440/1920、暗色、自选强调色和窄侧边对话。截图使用隔离模型/SSH与明确标示的示例数据，不代表执行了真实科研分析。PDF 的既有 renderer 终止问题未在本轮修复，不计入通过。


### 第二轮实际复验与稳定帧

- 最终相关 Vitest 9 文件 157 项通过，类型检查与构建通过；默认宽度与字号的失败日志分别为 `dawn-ui-refine-red.log`、`dawn-ui-refine-font-red.log`。
- 扩大 Electron 52 项初验 49 通过、3 失败，均指向一行内容 46px 与空框 44px 的差异；修复共享最小高度后，相关 14 项复验通过。新断言精确按当前行高和内边距计算，不提高溢出容差，也保留清空、自动增高、滚动上限和主侧对齐判据。
- 最新 1586 样例通过既有 `renameSession` 命名，另存 `analysis-1586-top.png` 展示对话顶部；底部完整结果截图仍在 `analysis-1586.png`。均为真实程序布局，不对截图拼接或美化。
- 14 组预期设计变化在 `iteration-2-visual-red/` 留存 expected/actual/diff 与两张接触表，审阅后更新全部基线。原配置首验 13 通过，暗色命令面板失败；再次单跑复现，两个稳定 actual 完全相同。与刚更新 expected 相差 2138 个像素，RGB 最大差值 2，其中 2110 个为浮层下缘阴影灰度差 1、26 个为权限文字/箭头边缘通道差 1、2 个为定时图标边缘灰度差 2；布局无位移。证据在 `iteration-2-shadow/`。按 `CLAUDE.md:119–121` 只替换该单张为稳定 actual，保留旧 expected；未改阈值或遮罩。底层合成差异根因未定位。

- 稳定帧单张替换后，以原配置、原容差和原遮罩运行 `npx playwright test e2e/visual.spec.ts --repeat-each=2`，28 次全部通过，日志 `dawn-ui-refine-visual-final2.log`。服务器流程四项收尾复验通过，最新四态截图重新生成；日志 `dawn-ui-refine-server-final.log`。
- 最终通过范围：157 项相关单测、14 项输入/字号/侧边对话/完整预览桌面复验、4 项服务器桌面复验、28 次视觉复验。包含交叉覆盖，不相加当作独立用例总数。类型与构建通过；构建仅既有 eval/大 chunk 提示。
- 已通过原生界面刷新独立开发预览并恢复原会话，已有 DeepSeek 配置与对话保留，未提交新消息。原工作区仍为干净的 `codex/analysis-delivery-skill`，HEAD `207f9ff0`。没有提交、合并、推送、签名打包或覆盖安装版。最终差异检查通过。


## 第三轮：项目/服务器突出，最近/会话退为次级

### 实现与独立复核

- 仅修改导航类名及局部样式，不修改排序、折叠与状态逻辑。主分区标题 14px/600、项目/机器行 48px/16px/500；项目整行淡强调色、操作常驻且右侧留白收紧。历史与嵌套任务 34px/14px，活动任务和运行/待答状态保留。
- `ui-refresh-preview.spec.ts` 通过现有真实 IPC 创建隔离样例目录和会话，使截图包含多项目、服务器、最近、会话；不是生产演示数据或硬编码界面。最窄 200px 下断言项目操作、添加/管理服务器及远端新建的边界全部位于侧栏内。
- 只读复核未发现新增明确 P1/P2，指出截图夹具应尊重已保存的展开状态，已修正；随后左右把手同名类定位改为读屏名称精确匹配。

### 已执行的检查

- `npx vitest run tests/ui/design-contract.test.ts tests/ui/server-sidebar.test.tsx`：2 文件 96 项通过。
- `npm run typecheck` 与 `npm run build` 通过；只有既有 eval/大 chunk 提示。截图夹具修改后类型复验通过。
- `npx playwright test e2e/sidebar-layout.spec.ts e2e/sidebar-size.spec.ts e2e/sidebar-states.spec.ts e2e/server-navigation.spec.ts e2e/ui-refresh-preview.spec.ts`：初次 32 通过、截图夹具 1 失败（误收起已展开项目）。修正后截图用例揭示左右把手定位歧义，再修正后定向 1 项通过，最终本轮这 33 个独立用例均通过；不把重复运行相加。
- 视觉首验实际窗口内容区 1080×808，而既有基线为 1280×808，14 项因尺寸和预期侧栏变化失败。固定视觉用例的 1280×808 内容尺寸，未修改生产窗口逻辑、容差或 mask；第二次 14 组 expected/actual/diff 审阅确认变化集中左侧，记录于 `iteration-3-visual-red-fixed-size/`，之后用原配置 `--update-snapshots=all`，14 项重存完成。最终复验结果见下文补记。

### 截图与边界

- 第二轮图已保存在 `tmp/ui-refresh-verification/iteration-2/{after,checkpoint-a}/`。新 `after/analysis-1586-top.png` 展示完整主次层级；另有 1280/1440/1920、200px 侧栏、暗色和自选强调色截图。
- 模型回复、图表和服务器均为隔离夹具，不代表真实科学分析或真实 SSH 网络验证。上一轮已记录的 PDF renderer 终止缺陷没有触及或修复，不计为本轮通过项目。
- 沿用“页面迭代”工作树，不提交、合并、推送、打包或替换安装版；真实预览的配置、凭证、会话与草稿保留。

### 最终复验与开发预览

- 视觉重复两遍首验：26 次通过，仅亮色空态同一基线两次失败。两张稳定 actual 完全相同；单独复验仍失败且 actual 与此前完全相同。差异为输入卡阴影边沿 695 个像素最大通道差 1，以及图标边缘 2 个像素最大通道差 8；没有结构位移。具体合成原因未确定，不归因为已证实的 Electron 缺陷。
- 已按根 CLAUDE.md 的明确规则，将单独验证的稳定 actual 复制到这一张基线；`npx playwright test e2e/visual.spec.ts --grep '空态 · 亮色' --repeat-each=2` 最终 2 次通过。其余 13 类在之前两遍中各自通过，未改变它们的基线或阈值。不能写成“最后整套命令 28/28 通过”；准确结果为其余 26 次通过，加这一张修正后 2 次通过。
- 差异与单独复现保存在 `tmp/ui-refresh-verification/iteration-3-stable-frame/`；全部命令日志复制到 `logs/iteration-3/`。最终 `git diff --check` 通过；原工作区仍干净。
- 通过 CUA 核对标题“DAWN Science · 页面迭代 · 开发预览”，刷新前处于本机空白页且输入框无草稿；Cmd+R 后保留该页面、原项目/最近/服务器折叠状态、248px 侧栏和真实 DeepSeek 连接，输入框聚焦。未发送测试消息、添加样例或读取凭证到真实预览。


## 第四轮：项目名称、开场建议与输入底栏（2026-10-11）

用户实际试用后要求项目名称与操作按钮更舒展、快捷建议放回输入框上方，并补充输入卡难看和新建任务字体过大。

- 项目操作收为一颗常驻“⋯”，菜单在页面层定位，避免侧栏滚动裁切；保留项目新建会话、移除确认及磁盘目录保护。248px 下七字项目名完整，200px 下菜单/操作不溢出；Esc 返回触发按钮焦点。
- 开场建议恢复 DOM 原顺序，在输入卡上方；新增共享 `card-compact` size，最小 64px，不改变其他案例卡。
- 新建任务文字 14px/500，保留 48px 触达区域。两处 composer 的准备工具与模型/推理/发送共用底栏；控件 36px，窄屏自然换行。上下文、权限保持卡外，所有原工具保留。
- 主侧同高修复：原行数算法按 top/8 取整，把中线齐平的 29px 工具和 36px 控件误报为两行；改按中线分组。侧边跟随主区一行时，三项准备工具保留图标与无障碍名称。

验证过程保留失败记录：

- 新项目菜单 4 项单测先因组件不存在失败，实施后通过。宽屏工具与发送齐行的 E2E 先在旧布局测得中线差约 53.85px，改造后通过。
- 旧 sidebar 单测夹具未提供新版服务器操作/连接权威记录，按实际新版契约迁移夹具；折叠图标断言改为服务器现有描边，仍检查 aria-expanded 与内容折叠，未为测试改生产图标。
- 第一轮布局 13 项中 12 通过，1920 下主侧高差 36px；行数回归单测先红（同一排误算两行），修复后两项通过。未放宽主侧等高与底边对齐断言。
- 只读复核指出 attach 旧几何断言仍引用已撤的 composer-gap；同步迁移 attach、agent-pill 的边界及 waiting 停止按钮包含关系。补验发现测试/样式错误使用不存在的 enhance-trigger，改为真实 enhance-main，后续五项相关桌面复验全部通过。

本轮已执行：

- 相关单元 7 文件 170 项通过；类型检查与构建通过（仅已有 eval/大 chunk 提示）。
- 43 项主回归通过：agent-pill、composer-sizing、delete-project、side-session、sidebar-layout、ui-refresh-preview、waiting。
- 额外项目移除与终端家目录两项通过；共用底栏、窄侧工具、两尺寸主侧等高、完整多尺寸预览五项复验通过，其中四项与主回归重叠；不累加为独立 50 项。
- 截图：`after/local-new-task.png`、`analysis-{1080,1280,1440,1586,1920}.png`、`analysis-1586-top.png`、`project-menu-200.png`、暗色、自选强调色与侧边对话。第三轮截图已保留于 `iteration-3/`。样例数据/模型/SSH 仅存在于隔离夹具。

14 类亮暗视觉基线首验均因本轮预期改动失败，逐张审阅 expected/actual/diff 后使用 --update-snapshots=all 更新；随后按原 threshold=0、maxDiffPixels=100 和原 mask 完整复验 14 项通过（27.7s），未放宽容差。只读复核收尾未发现新增明确 P1/P2。

真实隔离预览已刷新并抬到前台，标题 `DAWN Science · 页面迭代 · 开发预览`。刷新前确认输入为空；刷新后返回原来的“新对话”，恢复侧栏原折叠状态，仍为项目 1、最近 3、会话 2、宽 248；保留 DeepSeek、deepseek-flash 与推理高、真实配置与全部历史。未发送测试消息、添加样例或读取真实凭证。既有 PDF renderer 终止缺陷未触及，不计通过。仍未提交、合并、推送、打包或替换安装版。


## 第五轮：最后确认稿实现（2026-10-11）

- 双层输入卡：首页/主区/侧会话的模型与发送位于白色上层，工具/上下文/权限位于同卡浅灰下层，取消外置状态行。模型/推理触发器采用无描边样式；附件、目录、终端、优化模式、方案、权限、压缩及停止回调保持。首页不伪造未产生的上下文读数。
- 全局布局：收纳按钮中心与展开侧栏右边界对齐，随持久化宽度改变，收起仍可展开；两侧外表面共用 sidebar 令牌，正文/预览用 panel；版本号移至全局状态栏右端，900px 窗口仍可见。
- 先证失败：旧构建的 3 个确认稿用例全部按预期失败（发送未在上层、按钮偏移、面板底色不同）；相关 3 条单测失败。实现后继续修正窄工具带优化提示向右溢出 2px、侧会话工具带相对主区多/少一行的问题；未放宽几何误差。
- 单测：10 文件 191 项通过，含输入/模型/权限结构、设计契约、主题、结果面板、项目菜单、底栏测量和过程显示。类型检查、构建、`git diff --check` 通过。日志 `/tmp/dawn-final-layout-unit-final.log`、`/tmp/dawn-final-layout-types-final.log`、`/tmp/dawn-final-layout-build-final.log`。
- Electron：首轮 8 项布局/多尺寸/真实图像预览检查通过；49 项交互回归首轮 47 通过、2 个布局问题失败，经修正后 9 项针对复核全部通过，覆盖原失败、1280/1920 主侧等高、三种宽度输入卡、对齐/版本、两侧颜色、内容增高/换行。三轮合计覆盖 57 个不同用例；次数不可简单相加。日志 `/tmp/dawn-final-layout-e2e2.log`、`/tmp/dawn-final-layout-regression.log`、`/tmp/dawn-final-layout-recheck.log`。
- 多尺寸截图在 `tmp/ui-refresh-verification/after/`（1080/1280/1440/1586/1920 分析页，亮/暗、自选强调色及空态）。样例数据/SSH/凭证仅在隔离夹具，未写入真实预览用户数据。
- 视觉基线：旧版 14 组 expected/actual/diff 已保存至 `tmp/ui-refresh-verification/final-layout-visual-red/` 并逐张审阅；仅确认稿造成的顶栏、输入卡、面板和版本位置变化。更新运行 14 项通过，随后独立重验 14 项通过。阈值 0、maxDiffPixels 100、遮罩保持原配置。日志 `/tmp/dawn-final-layout-visual-update.log`、`/tmp/dawn-final-layout-visual-verify.log`。
- 真实开发预览：通过原生 UI 刷新并前置独立窗口“DAWN Science · 页面迭代 · 开发预览”，文件 URL 指向本工作树 `dist/ui/index.html`。目视确认首页和已有会话输入卡；会话显示 deepseek-flash / 高，工具与上下文 2% / 完全访问处于卡内同一底栏，结果面板与侧栏同色，版本在全局右下角。保留原侧栏折叠与宽度，未发送消息、改写草稿或读取真实凭证。安装版与原工作区不变，不提交/合并/推送/签名打包。

## 第六轮：项目区三级层次（2026-10-11）

- 原生页面复现：文件夹箭头比“项目”收纳标题靠左，项目内会话直接沿用最近/普通会话的左缘。根因为第二轮 `.sidebar .proj-head` 覆盖原左缩进；项目区缺少独立的子会话缩进。
- 修正：项目头左外距从 12px 改为 28px，项目子会话列表左距从 33px 改为 56px；项目头按钮右内距从 8px 收回到 0，操作入口右缘不动。最近/普通会话/服务器规则不变。
- 先证失败：完整预览现有用例加入文件夹箭头/标题比收纳更靠右、子会话文字比文件夹再靠右的几何断言，旧构建在第一条失败。初版缩进后原有七字项目名检查失败，收回多余内距后通过，没有降低名称完整或几何检查要求。
- Electron：`sidebar-layout.spec.ts` 与 `ui-layout-final.spec.ts` 共 14 项通过；最终 `ui-refresh-preview.spec.ts` 1 项通过，验证三级缩进、248px 七字名、200px 菜单、五种窗口宽度、暗色/自选色和真实图像预览。首轮 15 项中的预览失败已修复并复验。旧 `sidebar-columns.spec.ts` 同左缘断言范围排除项目子会话，本轮未执行该旧文件；其余共同右缘规则未修改。
- 单测：`project-actions` 与 `design-contract` 共 95 项通过；类型检查、UI 构建、`git diff --check` 通过。日志 `/tmp/dawn-project-hierarchy-{red,e2e,preview,unit,types,build}.log`。
- 视觉：首轮 12 项通过，仅“坞里的对话”亮/暗两张出现项目头和子会话区域的预期差异，已逐张审阅并保存至 `tmp/ui-refresh-verification/project-hierarchy-visual-red/`。仅更新这两张基线，更新运行 2 项通过；完整复验 13 项通过、暗色概览因输入卡顶边 466px 阴影差异失败。审阅差异后保留原概览基线，定向连续两次复验均通过；未调容差/遮罩，也未把偶发帧写进基线。日志 `/tmp/dawn-project-hierarchy-visual-{red,update,verify,overview}.log`；不是最后一次整套命令 14/14 通过。
- 原生预览已刷新并前置：回到原会话和结果面板，展开已有 tmp 文件夹，目视确认项目标题、文件夹、内层会话逐级缩进，最近/普通会话保留原层级。保留 248px 侧栏宽度、其他分区状态和真实配置，未发送消息/改写草稿/读取凭证；只将项目展开供用户查看。不提交/合并/推送/替换安装版。

## 第七轮：服务器与项目统一三级层次（2026-10-11）

- 服务器区采用“服务器标题 → 具体服务器 → 远端任务”。服务器外层左距改为 28px，箭头/名称分别与项目文件夹对齐；内层列表补 28px，使全局左缘为 56px，任务文字与项目内会话一致。连接状态与错误原因跟随服务器名称，新建远端任务文字跟随子任务。菜单右缘保留，最近/普通会话样式未改。
- 先证失败：新增真实 Electron 几何用例在旧构建的服务器/项目箭头对齐处失败；实施后验证箭头、名称、子任务、状态和新建入口文字，以及 200px 窄栏菜单可达。最近/会话列表的 33px 左距仍有独立断言。历史 `sidebar-columns.spec.ts` 的同左缘范围同步排除远端子任务，该旧文件本轮未执行；分级几何由新用例负责。
- 相关单测：`server-sidebar`、`server-navigation`、`design-contract` 共 3 文件 98 项通过；类型检查与 UI 构建通过。日志 `/tmp/dawn-server-hierarchy-{unit,types,build}.log`。
- Electron：`server-navigation.spec.ts`、`ui-refresh-preview.spec.ts`、`sidebar-folds-persist.spec.ts`、`ui-layout-final.spec.ts` 最终一轮 10 项通过（22.9s）。涵盖连接、失败重试、草稿隔离、两台服务器、分级、200px 菜单、项目持久化、确认稿布局与多尺寸/暗色预览。早先定向 1 项已包含在这 10 项内，不重复计数。日志 `/tmp/dawn-server-hierarchy-{red,check,e2e}.log`。
- 视觉：`visual.spec.ts` 最终 14 项通过（25.9s），本轮未更新任何基线、阈值或遮罩。已目视检查 `checkpoint-a/server-hierarchy-200.png`、`after/analysis-1586-top.png`、`after/analysis-dark.png`；完整预览还生成五种窗口宽度和自选强调色截图。日志 `/tmp/dawn-server-hierarchy-visual.log`。服务器连接与任务来自隔离 fakeSsh 夹具，不能据此声称验证真实 SSH 网络。
- 独立原生窗口“DAWN Science · 页面迭代 · 开发预览”已刷新并前置，文件 URL 指向本工作树 `dist/ui/index.html`。保留刷新前首页、248px 宽度和所有分区折叠状态，真实配置中没有服务器，因此没有向真实 profile 添加样例服务器；分级通过上述隔离 Electron 实测。未发送消息、改写草稿或读取凭证，不提交/合并/推送/替换安装版。


## 第八轮：所有会话共用左缘（2026-10-11）

- 用户明确“保持一个顺序”指左边对齐，不是排序。项目/具体服务器本身保留分级，项目内、远端、最近和普通会话文字共用同一条左缘。项目列表左距 33px，远端列表扣除父容器 28px；新建远端任务文字跟随会话列，连接状态仍跟随服务器名。
- 新跨区几何断言在旧构建先失败，改造后 10 项 Electron 通过（25.0s）：服务器连接/失败重试/草稿隔离、四区文字左缘、200px 菜单和新建入口、项目折叠持久化、确认稿布局、多尺寸/暗色预览。历史 columns 左缘断言恢复涵盖四区，本轮未执行该历史文件；新 server-navigation 用例已覆盖四区实际几何。
- 设计契约单测 91 项、类型检查与 UI 构建通过。日志 `/tmp/dawn-session-align-{red,e2e,unit,types,build}.log`。没有改排序、连接与会话逻辑。
- 视觉首轮 12 项通过，仅“坞里的对话”亮/暗两张因项目内会话左移出现预期差异；逐张审阅 diff 后仅更新这两张，更新运行 2 项通过。差异存放于 `tmp/ui-refresh-verification/session-align-visual-red/`，阈值/遮罩未改。最终复验见下文。
- 独立原生预览已刷新并前置，标题与文件 URL 确认属于页面迭代工作树。目视确认项目内会话与普通会话文字左缘一致，保留用户现有首页、248px 宽度、项目/会话展开和最近折叠状态，未发送消息或添加真实服务器。远端分级由隔离 fakeSsh Electron 测试验证，不代表真实 SSH 网络验证。原 checkout 干净；未提交、合并、推送或替换安装版。

- 最终视觉全量复验 14 项通过（29.6s），日志 `/tmp/dawn-session-align-visual-verify.log`；更新日志 `/tmp/dawn-session-align-visual-update.log`，首验日志 `/tmp/dawn-session-align-visual.log`。最终 `git diff --check` 通过。


## 第九轮：服务器区统一项目样式（2026-10-11）

- 用户批准标题内多选与加号、去链接下划线/常驻灰底、正常连接仅绿点和紧凑新建入口。ServerSidebar 的 headerActions 只接收多选按钮，toolbar 保留批量操作；正常连接的状态通过绿点无障碍名称和现有悬停浮层表达，其他状态与失败原因继续显示文字。新建远端任务高度 32px，跨区会话左缘保持。
- 先证失败：新单测在旧实现 3 项失败；旧构建的 Electron 用例在正常连接仍显示 server-meta 处失败。首轮实现单测发现原生按钮 title 违反既有契约，去掉原生 title 并沿用 HoverCard；桌面检查中 checkbox 定位匹配到机器和任务两颗，改为完整无障碍名称。没有放宽几何检查。
- 最终相关单测 3 文件 155 项通过（server-sidebar、views、design-contract），类型检查和 UI 构建通过。主桌面 9 项通过（23.8s）：服务器导航/连接/重试/草稿隔离、四区左缘、200px 标题操作同排/多选/管理、新建入口高度、悬停无下划线、静止透明、多尺寸亮暗和确认稿布局。
- 额外远端回归最终 12 项通过（23.7s），覆盖添加/断开/重连、编辑不丢口令、常驻入口、语言切换、200px 管理、长名称/新建入口、批量勾选和上次连接时间。首验 11 通过、1 失败为旧断行检测把新建任务 48px 触达高度当作两行；改用文本 Range 的真实行数后完整 12 项通过。日志 `/tmp/dawn-server-tidy-{unit-red,red,unit,unit-final,build,types-final,e2e,e2e-final,remote,remote-final}.log`。不声称执行了完整仓库测试。
- 隔离 Electron 截图已重新生成，包含 200px、1080/1280/1440/1586/1920、暗色与自选强调色。样例服务器使用 fakeSsh，不代表真实 SSH 网络验收。
- 原生独立窗口已刷新并返回原来的远端空白会话，当前机器 Genek 仍为 ready；目视确认标题多选/加号同排、名称没有下划线、无常驻底色、正常状态不再多占一行。保留用户 366px 侧栏、分区折叠及真实连接配置；没有发送消息、添加服务器、断开连接或读取凭证。用户随后已在预览中操作，后续不继续干扰原生窗口。

- 视觉首验 14 张均因服务器标题加号/行高产生差异，已查看 14 张 diff 联系表并复核 200px 与暗色实际截图，变化集中服务器区。原 expected/actual/diff 保存在 `tmp/ui-refresh-verification/server-tidy-visual-red/`。审阅后按原 threshold=0、maxDiffPixels=100 与原遮罩更新，更新运行 14 项通过（36.0s）；最终复验另记。日志 `/tmp/dawn-server-tidy-visual-{red,update}.log`。

- 最终视觉完整复验 14 项通过（30.6s），日志 `/tmp/dawn-server-tidy-visual-verify.log`；最终 `git diff --check` 通过，原 checkout 仍干净。未提交/合并/推送/替换安装版。


## 第十轮：远端新建入口并入机器行（2026-10-11）

- 用户要求“新建远端任务”属于对应服务器，独立一行显得突兀。现将入口改为每台机器右侧常驻加号，与管理菜单并排；标题加号仍添加服务器。移除独立入口布局，连接状态与会话左缘保持。
- 保留原无障碍名称与新建回调；机器折叠时，点击加号先展开再创建。忙碌/连接中仍禁用入口，被移除连接不显示新建。新增单测在旧实现先失败（折叠时无入口），实现后相关 3 文件 156 项全部通过。新增单测曾误用 Playwright 的 exact 选项，类型检查检出后改为锚定名称正则，复验通过。日志 `/tmp/dawn-server-inline-{red,unit-final,types-final,build}.log`。
- 真实 Electron 主布局 9 项通过，包含 200px 图标/菜单可达、折叠机器新建并展开、跨区会话左缘、连接与草稿、五种宽度、亮暗/自选色及真实图像预览；额外服务器回归 12 项通过，含连接/断开、凭证不回显、中英、长机器名悬停与批量 checkbox。均使用隔离 fakeSsh，不代表真实网络验收。日志 `/tmp/dawn-server-inline-{e2e,remote}.log`。
- 既有亮暗视觉基线完整 14 项通过，未更新任何基线或调整容差/遮罩。既有截图主要覆盖空服务器目录；具体服务器新图标布局由专门几何测试与 `tmp/ui-refresh-verification/checkpoint-a/server-hierarchy-200.png` 目视核对补充，多尺寸截图位于 `tmp/ui-refresh-verification/after/`。日志 `/tmp/dawn-server-inline-visual-red.log`（首次运行即全通过）。
- 独立原生预览已刷新并恢复用户原 tmp 项目会话，标题为“DAWN Science · 页面迭代 · 开发预览”；目视确认 Genek 行右侧为连接点、加号、管理菜单，下面只列会话。保留 366px 侧栏、真实连接与全部历史；未发送消息、创建真实任务、修改连接或读取凭证。
- 类型检查、UI 构建、最终 diff 检查通过；原 checkout 干净。只修改页面迭代工作树，不提交/合并/推送，不替换安装版。不声称执行完整仓库测试。


## 第十一轮：原 PDF／图片的简洁预览（2026-10-11）

- 按用户参考图合并视觉文件头，保留文件名、放大、系统打开，原定位/删除/远端下载继续可达。图片直接显示原字节，PDF 使用随包 worker 将原字节绘制到浅色卡片；不转存、不覆盖、不新增读取协议。多页仅保留基本翻页。用户补充后去掉“正在绘制 PDF”文字，只显示已有加载图标，保留读屏说明。
- 新真实 PDF 检查先在旧内嵌阅读器路径记录 2 项失败；首次广回归 22 项中 20 项通过、2 项失败。修复 ResizeObserver 同尺寸重复重绘和最终绘制状态竞争；大图复现夹具恢复原始 380px 坞宽度，保留 1.3 倍伸展断言。随后图表/坏文件/大图定向 3 项通过。此前主布局/多尺寸/暗色与文件其他路径已通过，未声称完整仓库测试。日志 `/tmp/dawn-pdf-card-{regression,recheck2}.log`。
- 最新去文案后的类型检查、UI 构建通过；产物组件和设计契约 2 文件 103 项单测通过（`/tmp/dawn-pdf-simple-unit.log`）；合法 PDF 稳定性、真实彩色像素/翻页/放大/Escape 焦点恢复、坏文件可继续切换共 3 项 Electron 通过（13.0s），检查无 embed/iframe、无 CSP 拒绝与 1080px 溢出。原 PDF 稳定性跳过已取消，本轮实际执行通过。日志 `/tmp/dawn-pdf-simple-{types,build,e2e}.log`。
- 审阅 `after/pdf-card-1440.png`、1080px 截图及真实原生窗口：实际 `figures/r_ggplot2/iris_lm_by_species.pdf` 正常显示三组拟合图，没有黑色阅读器或加载文字。刷新前确认没有发送或真实草稿，返回原 tmp 项目会话与同一 PDF；侧栏 368px、Genek 连接、历史和凭证保持，未发送消息、修改分析文件或执行连接操作。
- 不更新视觉基线/容差；不提交、合并、推送或替换安装版。原 checkout 干净。


## 第十二轮：项目／机器行使用写字图标新建会话（2026-10-11）

- 用户澄清入口属于 tmp／Genek 各自行，而服务器标题加号用于添加/配置连接。项目新建从“⋯”菜单移到它之前的常驻写字图标；具体机器行新建换相同图标，标题加号保持。没有管理能力时不渲染空菜单；项目折叠时先展开再走原路径回调。
- 更新现有入口检查后，旧实现 3 项失败、58 项通过，失败为行内入口缺失及菜单仍包含新建。实施后 project-actions、views、server-sidebar、design-contract 共 4 文件 160 项单测通过；类型检查和 UI 构建通过。单测环境已有 canvas getContext 提示，不影响断言；PDF 像素由第十一轮真实 Electron 检查。日志 `/tmp/dawn-project-plus-red.log`、`/tmp/dawn-project-compose-{unit,types,build}.log`。
- 真实 Electron 2 项通过（8.1s）：项目折叠后点击行内入口自动展开、原文件夹下出现第二条且仍只有一个项目；完整分析页覆盖五种尺寸、暗色/自选色、七字项目名、200px 两颗按钮可达、菜单 Esc 恢复焦点和真实 SVG 预览。已查看 `after/analysis-1586-top.png` 和原生截图。日志 `/tmp/dawn-project-compose-e2e.log`。
- 既有亮暗视觉全量 14 项通过（28.4s），没有更新基线、容差或遮罩；具体写字入口另由完整分析页和原生窗口检查。日志 `/tmp/dawn-project-compose-visual.log`。
- 独立窗口已刷新并前置，确认 URL 属于页面迭代工作树；tmp 和 Genek 行“⋯”前均有写字图标，服务器标题仍为加号。刷新前确认首页无草稿/运行发送，保留用户首页、368px 侧栏、分区状态和真实 Genek 连接；未点击真实新建入口、发送消息或修改连接。原 checkout 干净，不提交/合并/推送或替换安装版。


## 第十三轮：顶部会话标签与状态点（2026-10-11）

- 用户明确选择“顶部整排会话标签＋会话名称前的小圆点”。改为浅色标签带、等宽 10.5rem／36px 圆角标签、白色工作面选中态与柔和边界；取消长强调色下划线。普通灰点仅视觉隐藏，真实未读为色点、运行为小圆环；沿用原权威状态。关闭使用现有 SVG，当前/悬停/键盘进入时可见。服务器身份、切换/归档/同处新建/排序逻辑保持。
- 本轮为低影响视觉调整，沿用现有检查，没有增加只复述样式实现的测试。页签排序和设计契约 2 文件 92 项通过，类型检查与 UI 构建通过；真实 Electron 8 项通过（21.6s），覆盖切换/新建、排序并重载、归档恢复/删除确认、多尺寸/200px/亮暗/自选色和图像预览。日志 `/tmp/dawn-tabs-polish-{unit,types,build,e2e}.log`。
- 视觉首验 12 项通过，只有含真实页签的“坞里的对话”亮暗两张因新标签带/高度/关闭图标而变化；已逐张查看 diff/actual，并审阅独立完整分析暗色和原生五标签窗口。首验保存于 `tmp/ui-refresh-verification/tabs-visual-red/`。审阅后只更新这两张，更新运行 2 项通过（6.6s）；保持原容差和遮罩。日志 `/tmp/dawn-tabs-polish-visual{,-update}.log`。
- 独立原生窗口已刷新并回到刷新前的 Genek 第一条空白会话，五个标签完整呈现，普通灰点隐藏；保留 368px 侧栏、用户折叠状态、服务器连接与历史。刷新前确认没有正在发送或真实草稿，未创建真实会话、发送消息、修改连接或读取凭证。原 checkout 干净；不提交/合并/推送或替换安装版。

- 最终视觉全量复验 14 项通过（30.6s），日志 `/tmp/dawn-tabs-polish-visual-verify.log`；最终 `git diff --check` 通过。


## 第十四轮：页签跟随结果文件参考，恢复实心绿点（2026-10-11）

- 用户明确指定以结果文件页签作为参考，取代第十三轮白色圆角卡片：选中采用 fill-2 浅灰方正底、强调色文字与 2px 底线，保留等宽 10.5rem／36px 尺寸。真实运行状态恢复原实心 live 绿点，未读仍为强调色点，普通空闲不虚构状态。仅改 CSS，现有排序、切换、关闭和同处新建保持。
- 沿用现有检查，没有增加只验证样式实现的测试。页签排序和设计契约 2 文件 92 项通过，类型检查、UI 构建通过；真实 Electron 4 项通过（13.3s），覆盖切换/同处新建、排序重载、菜单宽度及五种尺寸/亮暗/自选色/200px 操作和真实图像。日志 `/tmp/dawn-tabs-reference-{unit,types,build,e2e}.log`。
- 含真实页签的“坞里的对话”亮暗两项先记录预期视觉失败，逐张查看 diff，变化集中标签带；另审阅完整分析页实际截图。差异保存在 `tmp/ui-refresh-verification/tabs-reference-visual-red/`。审阅后仅更新两张基线，2 项通过（6.6s）；全量复验 14 项通过（31.7s），未修改容差或遮罩。日志 `/tmp/dawn-tabs-reference-visual{,-update,-verify}.log`。
- 独立原生预览已刷新，恢复用户原 Genek 第一条空白会话与右侧结果文件页。目视确认浅灰选中底、绿色文字和底线；当前空白会话没有运行点。保留用户调整后的 293px 侧栏、项目/服务器/最近折叠与普通会话展开状态，真实连接不变。没有发送消息、新建真实会话、操作连接或读取凭证。
- 只修改页面迭代工作树，不提交、合并、推送或替换安装版；不声称执行完整仓库测试。

## 第十五轮：右侧坞页签字号（2026-10-11）

- 仅将 `.right-dock .dock-tab-btn` 的字号令牌由 sub-navigation（16px）改为 sub（默认 14px），保留点击高度、选中态、角标、滚动和绿点。无 TS 或行为改动，不新增复述样式的测试。
- UI 构建通过；既有完整分析页 Electron 用例 1 项通过（6.2s），覆盖五种尺寸、暗色/自选色、200px 侧栏与实际图像。已审阅完整分析截图和真实原生窗口，确认标题视觉收小。日志 `/tmp/dawn-dock-type-{build,e2e}.log`。
- 视觉首验 10 项通过，概览与坞内对话的亮暗四张按预期变化；逐张审阅 diff，差异仅在坞标题文字/随字宽调整的下划线。审阅后只更新对应四张，4 项通过（12.1s）；完整复验 14 项通过（29.6s）。未改容差或遮罩。日志 `/tmp/dawn-dock-type-visual-{red,update,verify}.log`，差异目录 `tmp/ui-refresh-verification/dock-type-visual-red/`。
- 原生独立预览已刷新并恢复原 Genek 首条空白会话、结果文件面板及用户 293px 侧栏与折叠状态；未发消息、创建真实会话、操作连接或读取凭证。原 checkout 干净，不提交/合并/推送或替换安装版。

## 第十六轮：侧栏顺序与服务器折叠图标（2026-10-11）

- 把最近 JSX 区块移到普通会话之后，四区顺序为项目、服务器、会话、最近。复用原列表及偏好键，不使用 CSS order；服务器分区标题和机器行均按自身折叠态切换现有实心/描边 SVG，连接点保持。
- 更新既有折叠断言，取消服务器一直描边的旧例外；旧实现定向 1 项失败、2 项通过，失败为收起仍 fill=none。实现后 views、server-sidebar、sidebar-groups-persist、design-contract 共 4 文件 164 项通过；类型检查和 UI 构建通过。日志 `/tmp/dawn-sidebar-order-{red,unit,types,build}.log`。未新增低影响样式测试。
- 既有多尺寸/亮暗/自选色/200px 与图像 Electron 用例 1 项通过（6.6s），已审阅隔离分析截图和原生窗口；既有亮暗视觉全量 14 项通过（29.9s），没有更新基线、容差或遮罩。既有视觉场景没有同时显示全部四区，完整顺序另由分析截图和原生窗口核对。日志 `/tmp/dawn-sidebar-order-{e2e,visual-red}.log`（visual-red 首次运行即通过）。
- 独立预览刷新后核对四区 AX/实际顺序，以及服务器分区和 Genek 行收起实心、展开描边。保留正常连接绿点，恢复原 Genek 首条空白会话、结果文件面板、293px 侧栏以及原分区/机器折叠状态。未发消息、创建真实会话、操作连接或读取凭证。原 checkout 干净，不提交/合并/推送或替换安装版。

## 第十七轮：页签悬停背景叠层（2026-10-11）

- 根因是 `.btn-ghost:hover:not(:disabled)` 比 `.session-tab:hover` 多一项伪类权重；外层 hover 底与内层 ghost 底同时绘制。文字及关闭按钮的 hover/active 用同等权重且更晚的组件选择器覆盖为透明；保留外层状态底，不改通用按钮或行为。
- UI 构建通过；既有 session-tabs、完整分析预览、visual 共 18 项通过（44.4s），包含切换/排序重载、五尺寸亮暗/自选色/200px 和 14 张基线，未更新基线、容差或遮罩。日志 `/tmp/dawn-tab-bg-{build,e2e}.log`。
- 一次性隔离 Electron CSS 探针加载真实 styles/tokens 和最小页签结构，先删除本轮覆盖复现旧双底，再使用当前 CSS 检查未选中/选中标题、关闭按钮的 hover 及鼠标按下：亮暗两态内层 backgroundColor 均透明，运行点仍有颜色。已审阅 before/after-light/after-dark，图片在 `tmp/ui-refresh-verification/tab-single-bg/`，日志 `/tmp/dawn-tab-bg-probe.log`。首次探针错误地以绝对包路径 require electron，取到可执行路径而非内建 API；只终止该探针进程，改成 require('electron') 后成功，独立临时 profile 已清理。未添加持久化测试。
- 原生预览操作期间用户已回到首页；按最新状态保持首页及 293px 侧栏，临时查看服务器后还原折叠，再刷新最新构建。未发送、创建或归档真实会话，未操作连接/凭证，不恢复用户已经收起的历史。原 checkout 干净，不提交/合并/推送或替换安装版。


## 第十八轮：独立搜索浮层（2026-10-11）

- 顶部长条仿搜索框收为 32px 放大镜，新增 Portal 搜索浮层统一输入、名字／内容模式和结果。名字按会话摘要和现有 catalog 查找，项目结果显示目录；会话显示目录／服务器，沿用统一回段路由。搜索不再改变侧栏展开状态或条目，内容命中仍交给原跳转／归档打开逻辑。
- 新组件缺失时测试先红。组件落地后 App 老测试仍在侧栏找结果，按新浮层范围更新断言；生产检查发现外部 mousedown 关闭后默认聚焦抢走入口焦点，新增 cancelable 回归先红，再 preventDefault 修复。显式入口 ref 也支持命令面板打开后的焦点恢复。
- 最终 search-panel、app-content-search、content-search、design-contract 共 4 文件 113 项通过；类型检查、UI 构建通过。日志 `/tmp/dawn-search-finalunit.log`、`/tmp/dawn-search-finaltypes.log`、`/tmp/dawn-search-finalbuild.log`。
- 真实 Electron 首轮 25 项中 10 通过，1 项外部关闭焦点失败、14 项视觉差异；焦点修复后独立回归通过。审阅 14 份 expected／actual／diff，差异均仅在 x276–635/y12–46 的顶部原搜索框区域；更新对应 14 张基线，无容差／遮罩变更。最终 session-search、ui-refresh-preview、visual 合并复验 25 项通过（1.0m），包括原内容／工具／长转录／重启／归档／跨项目／快速输入搜索，以及新增名称跳转、收起侧栏、键盘和外部退出、多尺寸亮暗截图。
- 截图位于 `tmp/ui-refresh-verification/search/{light-1080,light-1440,dark-1440}.png`；审阅旧差异保留于 `search/baseline-review/`。上述资料为隔离测试数据，非用户真实分析结果。
- 原生开发预览刷新到新构建，目视核对首页上方独立浮层、输入自动聚焦、Esc 关闭并回入口、再打开的空查询。保留当前 293px 侧栏、分区收纳和 5 条已归档记录，没有发送模型消息、新建真实会话、配置或操作连接；原工作区仍 clean，未提交／合并／推送、签名打包或替换安装版。用户可以直接在已打开的浮层试用。


## 第十九轮：快捷键速查与系统差异（2026-10-11）

- 搜索旁新增 32px 键盘按钮，Portal 只读浮层按通用导航、对话输入、笔记本与终端列 12 项已实现键位、生效条件。搜索／速查互斥；Cmd/Ctrl+K 仍打开原命令面板。未新增业务命令或绑定。使用现有主题、字号、描边和 Button；英文翻译齐备。
- 新组件缺失先证红（`/tmp/dawn-shortcuts-red.log`）；发现退出速查 cleanup 会抢回已聚焦命令输入的焦点，新增回归先红（`/tmp/dawn-shortcuts-focus-red.log`），改为仅在焦点落到 body 时恢复入口。外部 mousedown 防止默认聚焦覆盖恢复焦点。
- 用户补充三系统要求后，按 MacIntel／Win32／Linux x86_64 模块启动环境分别断言全部 12 项：主修饰键为 Command／Ctrl／Ctrl，审阅保持 Control+Shift+G，终端始终 Ctrl+C；优化输入读取原共享平台文案。最终 shortcut-panel、palette、design-contract、app-content-search 4 文件 121 项通过（10.86s）；类型检查通过，UI 构建通过（普通 chunk 大小提示）。日志 `/tmp/dawn-shortcuts-platform-unit.log`、`/tmp/dawn-shortcuts-platform-types.log`、`/tmp/dawn-shortcuts-build.log`。
- 首次真实 Electron 33 项通过。补暗色底部截图时新增测试的 exact 文本定位没有包含同一 dt 内提示，超时；查失败 AX 与 DOM 后只改测试为滚动底部说明，未改生产代码。该失败记录于 `/tmp/dawn-shortcuts-e2e-final.log`。最终 palette、session-search、visual 合并复验 33 项通过（1.1m），日志 `/tmp/dawn-shortcuts-e2e-verified.log`。覆盖入口相对位置、只读单按钮、草稿保持、Esc/外部退出回入口、Tab、命令面板切换不抢焦点、搜索与原内容/归档/跨项目/重启链路。
- 审阅 `tmp/ui-refresh-verification/shortcuts/{light-1080,light-1440,dark-1440,dark-bottom-1440}.png`，面板在窗口内、内容可滚动到底、三组及范围说明可读。原 14 张视觉基线通过，无本轮基线更新、容差或遮罩变更。现有基线保留 100px 微小差异容限；新入口另外以可见性／位置断言及实际截图确认。
- 原生独立窗口刷新前确认首页无真实草稿／运行任务；刷新后核对新按钮，打开速查并目视检查 Mac 键位，Esc 关闭回入口后重新打开供用户体验。保留首页、293px 侧栏、四区收纳和 5 条已归档记录，没有发送消息、创建真实会话或操作连接/凭证。本机实测只代表 macOS，Windows/Linux 未真机验收。原 checkout 仍干净；未提交/合并/推送、签名打包或替换安装版，不声称运行全仓库测试。


## 第二十轮：侧栏对齐与类别图标颜色（2026-10-11）

- 四区标题增加 data-section 类别，统一 16px 箭头/图标槽、以主层级字号计算的固定标题列和数量列。服务器不再单独用 max-content 标题列，所有分区右内距相同，末尾多选/添加共用 32px 中心。服务器多选按内容占位、取消额外 gap，适配 200px 侧栏及滚动条。保留项目/服务器与会话/最近的字号层级。
- 导航种子与语义令牌分别提供项目金、服务器蓝、会话主题强调色、最近紫灰，暗色独立提亮；仅图标着色，项目子文件夹与机器图标同步类别。折叠实心/展开描边、箭头、正文、连接绿点与原会话缩进/选择/连接业务不变。
- 低影响外观沿用现有单测，未增加复述 CSS 实现的单测。design-contract、views、server-sidebar 共 3 文件 156 项通过（3.58s），类型检查、UI 构建通过。日志 `/tmp/dawn-sidebar-align-unit-final.log`、`/tmp/dawn-sidebar-align-types-final.log`、`/tmp/dawn-sidebar-align-build-final.log`。jsdom 仍提示未实现 canvas，构建有既有 chunk 大小提示，均无失败。
- 原完整分析 Electron 用例补四区箭头/图标/标题/数量及尾列中心断言（1px），服务器窄栏用例补多选/添加尾列中心一致。首次分析测量发生在三角 120ms 旋转过程中，bbox 暂差 1.86px；明确等待现有动画 finished 后原断言通过，无放宽阈值。实际 200px 双操作存在错位，新增断言在旧构建先红（3.7265625px，`/tmp/dawn-sidebar-align-narrow-red.log`），移除冗余间距并收紧额外多选占位后通过。
- 首次组合运行 5 项通过、1 项三角过渡测量失败、14 项预期视觉差异；保存的 expected/actual/diff 与初验现场位于 `tmp/ui-refresh-verification/sidebar-alignment/`。全部差异范围 x47–343/y25–362，只涉及侧栏类别图标、数量/尾列及上一轮已验证但在 100px 容限内的顶部键盘入口。逐张 diff 联系图及完整 actual 亮暗已审阅，另核对完整分析的亮暗、200px 和自选色。只更新对应 14 张基线，14 项通过（31.5s），没有修改容差/遮罩。
- 最终 server-navigation、ui-refresh-preview、visual 组合 20 项通过（46.0s），包含双服务器/草稿隔离、失败连接处理、任务左缘、200px、五种尺寸、亮暗/自选色、真实图像与 14 张视觉基线。日志 `/tmp/dawn-sidebar-align-verified.log`。没有运行全仓库测试。
- 独立原生预览刷新前确认首页无草稿/运行任务；刷新后目视核对四区全收起时的彩色实心图标、数量列和多选/添加中心。保留 293px 侧栏、四区收纳和 5 条已归档记录，没有发送消息、新建真实会话或操作连接/凭证。原 checkout 干净；未提交/合并/推送或替换安装版。

## 第二十一轮：底部导航颜色与设置图标（T24）

- 用户要求定时和已归档图标也有颜色，并给设置补图标。定时紫灰、归档暖金、设置蓝灰复用 T23 亮暗导航令牌；设置使用现有齿轮 SVG 与 name 结构。底部统一图标间距、文字左缘与尾部数量，只改 views/styles 外观，不改回调或会话数据。
- 低影响外观不新建复述实现的单测；既有 views/design-contract 148 项通过（2.78s），类型检查及 UI 构建通过。日志 `/tmp/dawn-bottom-nav-unit.log`、`/tmp/dawn-bottom-nav-types.log`、`/tmp/dawn-bottom-nav-build.log`。既有 canvas 未实现提示与构建 chunk 提示不影响结果。
- 首次真实 Electron 5 项功能/布局通过，14 张基线为预期差异。逐张 expected/actual/diff 联系图已审阅，差异全部在 x24–84/y703–753，仅定时颜色及设置齿轮/文字左移；没有扩大容差或遮罩。现场保存 `tmp/ui-refresh-verification/bottom-navigation/baseline-review/` 与 `diff-contact.png`、`diff-bounds.json`。对应 14 张稳定 actual 更新为基线后，visual/ui-refresh-preview/session-archive 组合 **19 项全部通过（45.0s）**；归档行为验证只作用于隔离测试数据。日志 `/tmp/dawn-bottom-nav-e2e-first.log` 与 `/tmp/dawn-bottom-nav-e2e-final.log`。没有跑全仓库测试。
- 原生独立预览刷新前确认首页无草稿/运行任务；刷新后目视核对三项颜色、设置齿轮及文字对齐，保持 293px 侧栏、四区收起和 5 条归档记录。未发送消息、操作连接或修改真实会话状态。原 checkout 干净；未提交、合并、推送或替换安装版。

## 第二十二轮：设置齿轮轮廓修正（T25）

- 用户指出设置图标像缺半圈。放大上轮真实 Electron 空态截图（`tmp/ui-refresh-verification/bottom-navigation/gear-before.png`）并核对共享 SVG：旧外轮廓与孔中心不一致，孔偏下，底部齿轮环明显偏薄；不是侧栏裁切。
- 仅替换 `src/ui/icons.tsx` 的共享设置 path：八齿轮廓围绕 (8,8) 四向对称，内孔同心，evenodd 明确挖空。保留共享 16×16 壳、aria-hidden、类别色和 CSS 布局。命令面板中同一设置图标同步修正。
- 低影响 SVG 外观沿用既有验证，不增加复述 path 的单测。views/design-contract 148 项通过（2.69s）、类型和 UI 构建通过；真实 Electron visual 14 项通过（29.6s），无基线/容差/遮罩更新。日志 `/tmp/dawn-gear-unit.log`、`/tmp/dawn-gear-types.log`、`/tmp/dawn-gear-build.log`、`/tmp/dawn-gear-visual-first.log`。没有运行全仓库测试。
- 原生独立预览刷新后目视确认完整八齿与居中孔，保留蓝灰类别色、首页、侧栏与归档状态；原 checkout 干净，未提交/合并/推送或替换安装版。

## 第二十三轮：同级标题图标视觉尺寸（T26）

- 用户截图中四个 SVG 外框均 16×16，但内部轮廓宽度不等：文件夹 12、气泡约 11.6、机箱 14、圆盘 13.6，导致气泡/文件夹显小。仅 `.side-section[data-section] .side-section-icon` 内部图形绕 view-box 中心缩放；不缩放 SVG 本身、不移动网格。实心分别 1.1/.943/1.138/.941，描边 1.039/1.039/1.091/.977，包含描边宽度后视觉宽度接近 13px。其他导航、底部入口及子行不受影响。
- 低影响 CSS 外观沿用既有验证，无新增复述实现的单测。初次设计契约指出 CSS var 回退值违反单一权威，移除后相关 148 项单测通过（1.93s）；未放宽契约。日志 `/tmp/dawn-nav-optical-unit.log` 与 `/tmp/dawn-nav-optical-unit-final.log`。
- 首次 UI 构建和 server-navigation/ui-refresh-preview/visual 组合 **20 项通过（44.3s）**，包括四区列对齐、200px、连接/草稿隔离、多尺寸、亮暗与 14 张视觉检查；日志 `/tmp/dawn-nav-optical-build.log`、`/tmp/dawn-nav-optical-e2e-first.log`。该构建仍有无实际作用的 var 回退值，去除回退后重新构建并完整分析用例复验 **1 项通过（6.4s）**，日志 `/tmp/dawn-nav-optical-build-final.log`、`/tmp/dawn-nav-optical-preview-final.log`。本轮纯 CSS，未重复类型检查；未跑全仓库测试。没有更新基线、容差或遮罩。
- 审阅最终 `tmp/ui-refresh-verification/after/analysis-1440.png`、`analysis-dark.png` 及 200px/其他尺寸现场；独立原生预览刷新，目视核对四区收起实心图形视觉大小，保留 293px、首页、收纳与归档记录。没有发送消息或操作连接/真实会话。原 checkout 干净，未提交/合并/推送或替换安装版。

## 第二十四轮：输入框与开场卡片常驻彩色边框（T27）

- 输入卡默认边框由普通描边改为已有 `dawn-stroke-accent`；欢迎页四张 outline 开场卡同样使用柔和强调色，悬停加深。输入聚焦保持原 2px 环，未叠加内部边框；白色正文与浅色工具栏仍包在同一外框内。没有改业务行为或主题令牌。
- 低影响 CSS 外观沿用既有验证，未新增复述实现的单测。design-contract 91 项通过（1.80s），UI 构建通过；日志 `/tmp/dawn-accent-border-unit.log`、`/tmp/dawn-accent-border-build.log`，仅既有 chunk 提示。本轮未重复类型检查或运行全仓库测试。
- 完整分析用例的首页截图先点击标题，明确取消输入聚焦与卡片悬停，避免聚焦环代替常驻边框。首次 visual/ui-refresh-preview/theme 组合 6 项通过、10 张预期视觉差异；逐张 expected/actual/diff 联系图及亮暗实际截图已核对，涉及输入框、开场卡边框和命令面板毛玻璃下的边界变化，并包含前两轮容限内的少量导航/齿轮差异。现场保存在 `tmp/ui-refresh-verification/accent-borders/baseline-review/`、`diff-contact-light.png`、`diff-contact-dark.png` 和 `diff-bounds.json`。
- 只更新对应 10 张稳定 actual，未改容差或遮罩；同组合复验 **16 项全部通过（37.0s）**，覆盖 14 张亮暗基线、完整分析布局和主输入框聚焦环。日志 `/tmp/dawn-accent-border-e2e-first.log`、`/tmp/dawn-accent-border-e2e-final.log`。最终 `tmp/ui-refresh-verification/after/local-new-task.png` 为未聚焦欢迎页，分析亮暗及自选强调色截图同步核对。
- 独立原生预览已刷新，并在点击标题取消聚焦后目视确认五个常驻外框；保留 293px 侧栏、四区收起和 5 条已归档记录，没有发送消息或操作连接/真实会话。未提交、合并、推送或替换安装版。

## 第二十五轮：输入工具栏四字名称（T28）

- 用户要求四字功能名：共用未选目录 chip 改为“工作目录”，首页/对话终端开关改为“终端面板”，补英语 Terminal panel。已选目录继续显示目录名与完整路径入口，没有改回调；同步现有测试的入口定位。原生独立预览刷新后确认上传文件、工作目录、终端面板、优化输入、生成方案，保留草稿空态、侧栏及真实数据。
- UI 构建通过。首次扩大运行 views/App/composer 共 88 项，84 通过、4 失败；一项是误改了 PTY 会话类型“终端”的测试预期，已恢复；另外三项仍找旧右侧“审阅/概览”页签，与本轮两个按钮文案无关，未在文案改动中调整旧产出栏测试。最终 views/composer **64 项通过（1.87s）**，App 目录/终端入口定向 **4 项通过（2.50s，20 项未运行）**。日志 `/tmp/dawn-toolbar-label-unit.log`、`/tmp/dawn-toolbar-label-unit-final.log`、`/tmp/dawn-toolbar-label-app.log`、`/tmp/dawn-toolbar-label-build.log`；不宣称全套 App 测试通过。
- 真实 Electron 目录入口通过，单独终端打开用例通过（2.7s）。首次视觉/目录组合 3 通过、12 张预期视觉差异（43.2s）；补独立输出目录重取完整视觉现场，避免并行测试清理共享 test-results，未放宽容差。`tmp/ui-refresh-verification/toolbar-labels/review/` 的 12 组 expected/actual/diff 及 `diff-review.png`、`actual-review.png` 已审阅，主要是两处名称和随后的水平位置变化，空态/对话还包含前两轮容限内的少量导航图标差异。仅更新对应 12 张实际基线，设置页两张未更新。
- 独立预览已打开并确认未聚焦时彩色外框仍在。没有操作真实目录选择、连接或会话数据；未提交、合并、推送或替换安装版。本轮未跑全仓库测试。
- 对应基线更新后，visual/task-workspace/terminal-dock 组合 **16 项全部通过（33.8s）**，日志 `/tmp/dawn-toolbar-label-e2e-final.log`；包括 14 张亮暗视觉、目录入口和终端打开。未修改容差或遮罩。

## 第二十六轮：文件预览空间与无会话结果状态（T29）

- 根因：`loadArtifacts` 在没有 sessionId 时清为 undefined 且不发请求；App 仍渲染把 undefined 当加载的 ArtifactsPanel，因而永久加载。文件视图把保存的树高直接填进 grid，不随窗口收缩夹界；PDF 又按视口 58% 绘制，不知道面板剩余高度。
- 新增 `e2e/panel-preview-layout.spec.ts` 两条真实 Electron 回归，旧构建先红：无会话空态不存在；保存树高 600 后预览/树高度比仅 0.04（目标 >1.8）。现场 `/tmp/dawn-panel-layout-red.log` 与 `tmp/ui-refresh-verification/panel-layout-red/`。没有用新样式回填旧测试。
- App 以 sessionId 决定“开始任务后查看结果文件”空态；已有会话继续使用真实加载/空/失败/未知状态，不用假空清单盖掉错误。补中英文字。FilesView 的 ResizeObserver 测可用尺寸、复用原夹界函数；视觉模式默认上限三成，当前视觉模式内拖动优先，自动适配不写入偏好。显式 grid 区域为位置栏/提示/树/传输/预览预留行，条件提示与传输不把预览挤进隐式行。宽坞仍左树右预览。
- 仅文件面板通过 fitContainer 让图片和 PDF 适应预览区域，标题/翻页固定可见；PdfCanvas 使用实际 stage 高度，放大弹窗与结果文件卡继续用原尺寸规则。类型检查先指出文件分类函数缺第二参，补 `file` 后通过；没有放宽类型。相关 artifacts/sync/right-dock/sash/design-contract **140 项通过（2.88s）**，UI 构建、最终类型通过；日志 `/tmp/dawn-panel-unit.log`、`/tmp/dawn-panel-build-final.log`、`/tmp/dawn-panel-types-final.log`，仅既有 chunk 提示。
- 初版新回归 **2 项通过（7.1s）**：空白→已有空会话→新任务的结果状态，过高保存尺寸下 PDF 完整页与翻页、长图切换、键盘手调及缩窗；日志 `/tmp/dawn-panel-layout-green.log`。扩大至 files/artifacts/visual-file-preview/pdf-preview-stability/ui-refresh-preview/visual **37 项全部通过（1.7m）**，包含左右排布、持久化拖动、搜索/菜单、会话切换记忆、损坏 PDF、绘制像素、弹窗焦点、多尺寸和 14 张亮暗视觉；日志 `/tmp/dawn-panel-regression.log`。未更新基线、容差或遮罩，未跑全仓库测试。
- 原生独立预览刷新前确认没有草稿；刷新后核对真实 `iris_lm_report.pdf` 整页及 1/3 翻页都在面板内。恢复工作目录时误点项目新会话入口，实际新增了一段空会话，已向用户说明，未发送内容、删除或归档它；其余既有会话/文件未改。用户原来的 293px 侧栏与 431px 坞宽保持。未提交、合并、推送或替换安装版。

- 补亮暗切换与截图后，新回归最终 **2 项全部通过（6.5s）**，日志 `/tmp/dawn-panel-layout-final.log`，独立输出 `tmp/ui-refresh-verification/panel-layout-final/`。已审阅 `panel-layout-pdf.png`、`panel-layout-dark.png`、`panel-layout-small.png` 的完整页面、翻页控件和缩窗边界；结合上述 37 项既有用例，本轮真实 Electron 检查共 39 项通过。无本轮基线更新。

## 第二十七轮：页签常驻圆点、统一导航色与定时闹钟（T30）

- 用户要求恢复会话页签圆点、左侧导航图标统一颜色且跟随外观设置、定时换闹钟。定位到 `.session-tab-wrap:not([data-running="1"]):not([data-unread="1"]) .session-tab-dot` 主动隐藏普通状态；移除该规则，普通灰点常驻，保留未读强调色和运行 live 状态。导航类别/底部/项目与服务器图标共用 `--dawn-accent`，移除旧类别色种子/别名；16px和光学校正不变。新增同规格闹钟，只替换定时入口，最近保留时钟。
- 扩展两条现有真实 Electron 回归，在旧构建均先失败：普通圆点 display:none；导航实际仍为四种颜色。日志 `/tmp/dawn-nav-unified-red.log`，现场 `tmp/ui-refresh-verification/nav-unified-red/`。亮暗及自选紫色直接经设置入口修改后核对实际计算色；原生未改用户主题。
- 类型通过；最终 UI 构建通过（既有 chunk 提示），日志 `/tmp/dawn-nav-unified-types.log`、`/tmp/dawn-nav-unified-build-final.log`。初次单测157项中1项契约失败，因合并规则后原定时/归档类名失去对应选择器；保留这些有语义的入口选择器共用色规则后，4文件 **157项全部通过（2.59s）**，未改测试豁免，日志 `/tmp/dawn-nav-unified-unit-final.log`。
- 新增真实后台运行→未读→点开已读圆点检查。首次测试错误使用 hasNot 排除按钮本身（该过滤器只检查子元素），点回原页签，未读等待失败；改为按 data-session 的 :not 选择另一页签并明确断言原页签未选中。页签4项最终全过（12.6s），其中状态链路4.9s；日志 `/tmp/dawn-nav-unified-tabs-final.log`，没有改变生产未读/运行状态机制。
- 初次合并24项：9项功能通过、1项上述测试定位失败、14张预期视觉差异。逐张审阅 expected/actual/diff 联系图、亮暗完整分析及紫色自选主题。差异主要为左侧导航图标与定时闹钟，坞内对话还有顶部圆点/文字缩进；设置页包含此前容限内79像素共享齿轮变化。审阅现场 `tmp/ui-refresh-verification/nav-unified-review/`。仅更新14张对应基线，未改容差或遮罩。
- 扩展至页签/完整分析/服务器/前轮预览与结果空态/视觉共26项，25通过，1张暗色概览467像素输入框边缘的细微差异。核对裁切图后用该轮稳定 actual 保存此张；独立重复两次均过（5.4s），随后完整14张视觉全部通过（28.3s）。日志 `/tmp/dawn-nav-unified-e2e-final.log`、`/tmp/dawn-nav-unified-overview-final.log`、`/tmp/dawn-nav-unified-visual-final.log`；26个独立用例均已通过，不将复跑累加，未跑全仓库测试。
- 用户继续后确认原独立预览已关闭；用既有 `tmp/ui-refresh-preview/launch.mjs` 重新启动，复用原隔离 profile。CUA一度绑定到无参数 Electron 默认页，关闭该空白页后确认页面迭代标题与正确工作树 URL，恢复原有项目会话，截图核对常驻圆点、统一绿色导航与闹钟。保持293px侧栏，未发送消息、新建、删除或归档会话。未提交/合并/推送、打包安装或替换安装版。

## 第二十八轮：品牌与顶栏三按钮紧凑排列（T31）

- 根因是品牌槽按侧栏宽度预留固定空间，名称与按钮之间形成大块空白。按用户最新要求改为内容宽度并保留窄侧栏上限，品牌后和三个按钮之间统一8px，保留32px点击区域；最新紧凑排列要求取代此前收纳按钮固定在侧栏边界的要求。App仅同步注释，交互未改。
- 更新既有布局用例的几何验收，覆盖200/216/232/248px侧栏及折叠/展开。旧构建先失败，间距误差24.7421875px，日志 `/tmp/dawn-topbar-compact-red.log`。
- UI构建通过，91项设计契约单测通过（2.17s）；日志 `/tmp/dawn-topbar-compact-build.log`、`/tmp/dawn-topbar-compact-unit.log`。首次真实Electron组合6项功能/布局通过，14张预期视觉差异；含多尺寸完整分析、搜索浮层、快捷键和折叠展开，日志 `/tmp/dawn-topbar-compact-e2e-first.log`。
- 逐张审阅14组expected/actual/diff，现场 `tmp/ui-refresh-verification/topbar-compact-review/`。仅更新对应基线顶栏0–60px，保留正文既有像素，避免把命令面板偶发合成差异带入基线；未调整容差或遮罩。最终14张亮暗视觉全部通过（28.5s），日志 `/tmp/dawn-topbar-compact-visual-final.log`。本轮20个独立Electron检查通过，未跑全仓库测试或类型检查。
- 原隔离原生预览已刷新，截图确认名称与三按钮紧凑排列，正确页面迭代标题与工作树URL。用户期间自行切换既有会话/展开侧栏，保留其当前状态及296px侧栏；未发送消息、新建、删除或归档会话。未提交、合并、推送、安装或替换已安装软件。

## 第二十九轮：当前选中会话圆点使用强调色（T32）

- 当前页签标题与横线已有强调色，但圆点仅未读/运行有覆盖，普通已读选中态落回灰色。增加 `.session-tab-wrap.current .session-tab-dot` 与未读共用强调色；运行规则仍在后方，优先live状态色；未选中已读仍灰色，尺寸与状态判断不变。
- 扩展既有真实会话状态回归：发送前当前强调色、非当前灰色、运行live、后台未读强调色、点开已读后仍强调色。旧构建先失败，实际颜色为灰色（alpha 0.3），日志 `/tmp/dawn-active-dot-red.log`。
- UI构建通过，91项设计契约单测通过（1.83s）。真实Electron 5项通过（19.7s）：项目切换/新建/圆点常驻、真实运行→未读→已读状态、完整分析多尺寸及亮暗/自选强调色、亮暗坞内对话视觉。日志 `/tmp/dawn-active-dot-build.log`、`/tmp/dawn-active-dot-unit.log`、`/tmp/dawn-active-dot-e2e.log`；没有修改基线、容差或遮罩，未跑全仓库测试。已目视审阅 `after/analysis-1586-top.png` 的当前页签强调色圆点。
- 隔离原生窗口确认URL正确，但发现实际未发送草稿，故保留窗口不刷新，避免丢失用户内容；新样式将在下次刷新时加载，已明确告知。未发送、新建、删除或归档真实会话，未提交/合并/推送或替换安装版。

## 第三十轮：会话内关键词查找与用户提问时间（T33）

- 新增ConversationSearch，只使用当前订阅的完整items，复用协议匹配和已有预算/跳转逻辑，允许单字关键词；按条目导航，支持Enter/Shift Enter/Esc且尊重输入法。命中折叠过程先打开，再展开工具组/行并滚动高亮；动画帧清理防止离开后继续跳转。清空/关闭清理词高亮并保留草稿，切换会话收起重置。标题旁入口为“查找内容”。
- 历史RestoredItem已有at，原还原函数主动丢弃。协议8.12增加可选turn.at，实时用户消息由事件中枢记录，客户端回显携带临时时间；文字历史保留原pi时间，未知显示时间不明，不补当前时间。时间用已有本地年月日时分格式，agent无额外时间行。没有新增操作或独立mock分叉。
- 新文件测试先因组件缺失失败，随后时间来源回归明确失败于实时消息缺at（搜索测试已通过）；日志 `/tmp/dawn-conv-search-red.log`、`/tmp/dawn-conv-time-red.log`。类型和构建通过；首次177单测仅版本期望仍为8.11失败，改为8.12；扩大后设计契约发现四处按钮名称包含关系，入口改“查找内容”、收起改“收起查找”、前后按钮可见名与无障碍名一致，未豁免规则。
- 最终9文件269项单测通过（2.60s），覆盖事件/协议/历史读取/回显、匹配与预算之外跳转、切换会话重置、时间来源和缺失。类型、UI和Electron构建通过（既有chunk提示）；日志 `/tmp/dawn-conv-search-unit-final.log`、`/tmp/dawn-conv-search-types-final.log`、`/tmp/dawn-conv-search-build.log`。未跑全仓库测试。
- 新真实Electron三条加既有全局旧历史跳转共4项通过（11.7s），另折叠工具参数/输出定位1项通过（3.1s）：范围不串会话、输入法、前后导航、CSS高亮、草稿保留、超过40块仍能滚到、亮暗窄窗口、真实提问时间重开后由pi记录恢复，恢复时间与实时记录差小于3秒（服务端收取与pi写消息为相邻时刻）。日志 `/tmp/dawn-conv-search-e2e.log`、`/tmp/dawn-conv-search-tools.log`。亮/窄/暗截图已审阅，位于 `tmp/ui-refresh-verification/conversation-search/`。
- 完整分析多尺寸/自选色用例通过；首次视觉组合11通过、4张预期差异：对话和坞内对话的亮暗图新增查找入口、时间行造成动作/答复下移，坞图也包含前轮容限内当前圆点着色。审阅4组diff与实际页面后只更新这4张基线；时间行新增墙上时钟遮罩（与既有相对时间同类），未改变容差。最终14张视觉通过（26.9s），日志 `/tmp/dawn-conv-search-visual.log`、`/tmp/dawn-conv-search-visual-final.log`。合计20个独立Electron检查已通过，不累加复跑。
- 原生预览CUA确认正确隔离工作树URL、无停止按钮，但仍有未发送草稿；保留窗口不刷新或重启。新协议需要下次重开分支预览，不能宣称当前原生窗口已加载新功能。未操作真实消息/会话/连接，没有提交、合并、推送或替换安装版，原checkout保持clean。

## 第三十一轮：项目文件夹内会话拖动排序（T34）

- 根因：任务行已有拖动事件，但App提供的排序全集只有tempSessions，实际项目会话来自sessions，因此drop查不到from/to而静默返回。并且原drop把跨项目全集交给按项目保存的回调，首条ID可能来自别的项目。现合并两份摘要并去重、排除终端；drop验证同项目/同收纳/同置顶状态，提交所属项目顺序。复用既有reorderSessions及数据库事务，无协议/存储改动。
- 新真实Electron回归先在测试准备阶段缺少异步新建等待失败，补齐tab和侧栏数量等待后，明确复现拖动后顺序不变，日志 `/tmp/dawn-project-reorder-red.log`。单测修正项目头选择器后，明确暴露混入临时项目及跨项目/文件夹问题（3红1绿），日志 `/tmp/dawn-project-reorder-unit-red.log`。
- 最终6文件178项相关单测通过（2.45s），覆盖侧栏、页签排序、服务器分组和数据库保存；类型检查发现上一轮conversation-search测试夹具缺少必需projectId，补齐后类型通过，搜索3项单测复验通过（2.26s），总计181项。日志 `/tmp/dawn-project-reorder-unit.log`、`/tmp/dawn-project-reorder-types.log`、`/tmp/dawn-project-reorder-fixture.log`。UI/Electron构建通过，既有chunk提示，日志 `/tmp/dawn-project-reorder-build.log`。git diff --check通过，未跑全仓库测试。
- 真实Electron页签/会话整理15项通过（34.9s），含项目第三条拖到第一条、侧栏与顶部同步、关闭进程后重开仍保留，普通会话拖动及置顶边界；服务器收纳拖动另1项通过（2.4s）。日志 `/tmp/dawn-project-reorder-e2e.log`、`/tmp/dawn-project-reorder-server.log`。合计16个独立检查，无样式改动，无基线/容差/遮罩调整。
- CUA读取隔离原生预览确认正确工作树URL，当前仍有实际未发送草稿，故不刷新/重启；新构建须下次重开分支预览生效，不能宣称原生旧窗口已加载修复。未操作真实消息/会话/连接，未提交、合并、推送或替换安装版。

## 第三十二轮：右侧“结果文件”改名为“产物”（T35）

- 页签/面板标题的房客名、产物清单读屏名称、对话跳转“查看产物”、超出显示数量的提示和新任务空态统一使用产物；英文Artifacts/View artifacts。内部artifacts租户ID、清单、预览及保存逻辑不变。“文件”页签保持文件。同步测试定位、当前设计文档，测试进坞夹具不再把产物映射为旧名称；历史记录不追溯改名。
- 139项相关单测通过（5文件，1.69s），类型和UI/Electron构建通过，保留既有chunk提示。日志 `/tmp/dawn-artifacts-name-unit.log`、`/tmp/dawn-artifacts-name-types.log`、`/tmp/dawn-artifacts-name-build.log`。源码/测试/当前设计文档无“结果文件”残留，git diff --check通过，未跑全仓库测试。
- 真实Electron功能8项通过：产物条跳转、预览/返回清单、临时/CLI/只读会话状态、长清单滚动、首页空态、PDF/图片空间、常用及更多面板切换与关闭重开。首次视觉10通过4张预期文案差异，组合18通过4失败（49.9s），日志 `/tmp/dawn-artifacts-name-e2e.log`。
- 审阅概览/坞内对话的亮暗4组expected/actual/diff，差异只在“结果文件”缩短为“产物”及后续页签位置。现场保存在 `tmp/ui-refresh-verification/artifacts-name/`；更新这4张基线，未改变容差/遮罩。最终14张视觉通过（27.4s），日志 `/tmp/dawn-artifacts-name-visual-final.log`，合计22个独立Electron检查。
- CUA确认正确隔离工作树原生窗口仍有未发送草稿，保留不刷新/重启；下次重开分支预览生效。没有操作真实消息/会话/连接，未提交、合并、推送或替换安装版，原checkout保持clean。

## 第三十三轮：文件与产物脚本语法高亮（T36）

- 根因：两处共用FilePreview，非Markdown文本原来统一使用裸pre。新增共用ScriptPreview，按扩展名/MIME识别语言，懒加载已有Shiki；React文本节点保留源文、中文注释、缩进、CRLF、空行及末尾换行，脚本中的HTML不执行。亮暗token颜色随主题切换；未知文本不加载高亮，Markdown仍按原路径显示。异步结果按文件隔离，失败保留原文并显示提示，既有截断提示不变。
- R/Python回归在旧实现先明确失败于缺少高亮，日志 `/tmp/dawn-script-preview-red.log`。默认WASM引擎虽单测通过，实际Electron被现有script-src CSP阻止；初次桌面组合19通过、2新用例失败，保留 `/tmp/dawn-script-preview-csp-failure.log`。改为Shiki JavaScript正则引擎后实际桌面通过，无CSP放宽。首次单测暴露ESM导出不可spy及CSS变量fallback违反设计契约，改为模拟本地封装、继承默认颜色，未豁免契约。
- 最终4文件112项单测通过（1.91s），包含R/Python/JavaScript实际token、原文精确保留、普通文本/Markdown、切换竞态和失败回退；类型与UI/Electron构建通过，保留既有chunk提示。日志 `/tmp/dawn-script-preview-unit.log`、`/tmp/dawn-script-preview-types.log`、`/tmp/dawn-script-preview-build.log`。未跑全仓库测试。
- 新真实Electron两项通过（7.6s）：实际生成R/Python脚本，从“查看产物”预览、跳转文件、经设置切换暗色、再回产物；核对原文一致、至少三种实际计算色、亮暗颜色变化及无高亮/CSP错误。既有files/artifacts共19项通过（52.9s），覆盖文件树、图片/PDF/Markdown/CSV、搜索与限量、空间拖动和会话记忆、产物清单/跳转/只读/CLI/长清单。合计21个独立检查，日志 `/tmp/dawn-script-preview-new-e2e.log`、`/tmp/dawn-script-preview-existing-e2e.log`。
- 已审阅 `tmp/ui-refresh-verification/script-preview/` 的 `r-artifacts-light.png`、`python-artifacts-light.png`、`r-files-dark.png`、`python-files-dark.png`，确认实际桌面两处脚本高亮；没有更新视觉基线、容差或遮罩。测试结束后CUA再次确认原生预览URL正确，仍有实际未发送草稿，故不刷新/重启；下次重开分支版本生效。没有操作真实消息/会话/连接，未提交、合并、推送或替换安装版。

## 第三十四轮：草稿输入框Markdown语法高亮（T37）

- 根因：草稿是原生textarea，既有镜像仅为@及内核引用画灰底。保留textarea与非受控DOM所有权，将镜像替换为独立ComposerHighlight；Markdown原文和已标语言的围栏脚本复用Shiki双主题及JS正则引擎。90ms合并输入，按当前文本接纳结果；未知语言、不闭合围栏保留原文，失败提示且回到原生字形。无富文本转换、代码语言推断或CSP放宽，普通文字不加载高亮。
- 首轮3项回归2红1绿，失败明确是缺少Markdown高亮，日志 `/tmp/dawn-composer-highlight-red.log`。最终6文件120项单测通过（3.47s），覆盖Markdown/R/Python实际词法差异、CRLF/中文/空行原文、未闭合及未知语言、HTML不执行、@灰底、竞态与失败、既有IME/草稿/重定向及脚本预览。首次契约检查发现错误的背景token名，改为已有surface-panel后通过，未豁免规则。日志 `/tmp/dawn-composer-highlight-unit.log`；类型和UI/Electron构建通过，既有chunk提示，日志 `/tmp/dawn-composer-highlight-types.log`、`/tmp/dawn-composer-highlight-build.log`。未跑全仓库测试。
- 新真实Electron3项验证：首页实际着色与镜像几何，原生选区替换和撤销；长Markdown内部滚动和尾部空行，Chromium CDP的imeSetComposition/insertText验证组词期间原生字形与最终中文，发送原文不带额外标记、清空无残留；主对话与窄坞共用、设置亮暗切换、围栏跟随强调色。首次撤销断言把逐键输入误当一次原子编辑，改用一次原生insertText后通过，不改产品撤销行为。
- 与既有输入尺寸、IME、附件粘贴/@灰底、历史修改/复制等组合27项通过（49.6s），日志 `/tmp/dawn-composer-highlight-e2e.log`。扩展至Markdown渲染时7通过1失败，旧长代码用例在懒加载pre替换空隙直接取boundingBox得到null；原用例单独复跑通过，日志 `/tmp/dawn-composer-highlight-markdown-repro.log`。补等待高亮标志及实际代码盒大于600px，继续原sticky尺寸断言，无生产Markdown改动；最终新高亮3项与Markdown5项组合8项通过（18.8s），日志 `/tmp/dawn-composer-highlight-final-e2e.log`。共32个独立检查，不累加重复运行。
- 已审阅 `tmp/ui-refresh-verification/composer-highlight/home-r-light.png`、`side-python-dark.png`：原始标记、代码、选区、字号和窄坞均正常；没有改视觉基线、容差或遮罩。CUA只读核对正确隔离工作树原生窗口仍有用户Markdown草稿，保留不刷新/重启；不能宣称旧窗口已加载新构建，下次重开分支预览生效。原checkout保持clean，未操作真实消息/会话/连接，未提交、合并、推送或替换安装版。

## 第三十五轮：用户验收后的本地集成检查

- 用户确认当前效果并授权合并main，未授权推送或替换安装版。页面迭代基线207f9ff0，main为27bd34cc且工作树干净；main是页面迭代祖先，只有已有0.0.25发行提交位于其间。原checkout仍为codex/analysis-delivery-skill且干净，保留不切换。
- 独立只读审查覆盖服务器连接/创建、PDF生命周期、脚本/输入高亮竞态、IME、查找与时间、排序归属和界面边界，无Critical/Important问题。审查还指出新PDF/图片组件使用单引号翻译调用会漏过现有扫描；统一为双引号并修正英文Enlarge preview消除Expand按钮名称包含关系，未豁免扫描。
- 首次全仓库364文件、4246项通过/10失败/10跳过，日志`/tmp/dawn-ui-merge-unit.log`。在未改动main上对照5个失败文件：42通过/5失败，4项默认client夹具把更新状态错误返回[]，1项原快满了孤儿翻译，日志`/tmp/dawn-ui-merge-main-baseline.log`。分支新增差异为审阅/概览改更多菜单的3个旧入口断言、默认字号15→17及侧边底色app→panel。仅适配已确认设计和合法假回执，原业务断言、收敛预算、监听数量、字号范围保留，并新增输入卡描边断言。
- 全仓库复跑364文件全部通过：4256项通过，10项原有跳过，72.10秒，日志`/tmp/dawn-ui-merge-unit-final.log`。翻译调用统一后最终6文件138项通过，4.15秒，日志`/tmp/dawn-ui-merge-reconcile-final.log`；最终类型与构建通过，日志`/tmp/dawn-ui-merge-types-final.log`、`/tmp/dawn-ui-merge-build-final.log`，只保留既有chunk大小提示。
- 43项真实Electron全部通过，1.7分钟，日志`/tmp/dawn-ui-merge-e2e.log`：14张亮暗视觉、三处输入布局/品牌与两侧底色、多尺寸分析/强调色、服务器连接/失败/草稿隔离/重复创建、结果空态与预览比例、PDF存活与翻页/放大/错误、坞导航、R/Python脚本及Markdown草稿高亮、查找/时间戳、项目内排序。未更新任何视觉基线、容差或遮罩。
- 所有测试使用隔离夹具，未操作当前原生预览及真实会话/服务器；profile、dist、tmp、node_modules均被忽略，不纳入提交。保留分支和工作树。本地main合并后复验结果由本轮交付回执记录。
