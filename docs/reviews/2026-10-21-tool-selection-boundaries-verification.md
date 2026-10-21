# 工具选择边界核验

最终状态：用户验收后，功能提交6601622d已快进合并本地main；主工作区集成核验通过，未推送。下文未提交/未合并的描述为各预览阶段当时记录。

分支codex/tool-selection-boundaries，基线2ee18997。用户授权修改并预览，未提交、合并或推送；main保持原提交且干净。

## 边界与实现

1. 普通状态查询先读已有摘要、状态文件和必要的有限日志，信息足够即回答，并说明来源和时间；过期/缺失/矛盾时补查具体缺口。短时计算可用一次性脚本，复杂统计、绘图、连续分析或需要变量时按任务使用run_code。
2. 显式@R/@r仅R，@Python/@python及兼容@Py/@py仅Python，@RPython/@rpython允许两门；识别大小写不敏感，菜单不重复同一语言。只有界面附加有效run-code-request时成为本轮显式执行入口，普通引用/代码/路径不触发；下一条普通消息不继承语言约束。同句先不要运行优先。
3. 明确不要启动/使用内核时，NativeRuntime在执行前拒绝run_code和inspect_data，尚未进入内核或溯源；读取和必要shell查询继续走原有权限门。只认当前分支已送达的用户原话，限制持续到明确恢复或有效快捷入口；引用/助手/工具/排队消息不会解除。原有完整讨论门、方案审批、权限和语言校验保留。
4. 远端系统补充明确read/bash/write/edit及可用的内核在服务器执行，本机cwd只是资源和转录位置；不把Linux路径拿去当本机资源加载目录。shell改变cwd后结果告知模型新路径，后续相对路径使用原有真实cwd状态。

这些是按必要性选择工具的指引及明确禁令的运行时门，不是通用自然语言意图分类器。不会把“进度”关键词一律变成禁止Python，也不声称固定模型演示证明真实模型永不误选。此门针对NativeRuntime的run_code/inspect_data，不扩张成对所有外部ACP/MCP执行器的强制保证。

## 验证结果

| 检查 | 结果 |
| --- | --- |
| 基线 | 相关3文件81项通过 |
| 先红 | 系统指引/远端上下文及cd提示共3项失败；加内核门后真实运行时3项在旧实现失败；完整Python别名2项失败；前置快捷与禁令优先4项失败 |
| 最终全量 | 453文件4914项通过、10项跳过，125.39秒 |
| 类型/完整构建/diff | 通过；保留已有Canvas、direct-eval及构建体积提示 |
| 核心Electron | 新边界3项、既有讨论门1项、快捷入口10项，共14项通过，39.8秒 |
| 大小写Electron | R/Py/Python/RPython及各自小写8项通过，16.3秒；含4项此前未计入的新用例 |
| 真内核Electron | 本地真实Python内核与笔记本共享变量1项通过，4.0秒；未使用真实SSH或远端解释器 |
| 最终补充单测 | 新界面断言与运行时16项、大小写与引用23项通过 |

合计19项不同Electron用例。实际模型请求包含新选择指引、服务器位置与工具结果；固定模型按测试场景发起read或故意强行run_code，验证协议、真实agent loop、工具门和渲染，并不证明模型智能选择的统计成功率。明确恢复时，在无解释器夹具中进入内核层并如实报告未配置；另一个真实Python用例验证可执行路径和共享变量。

首轮Electron新增用例有两处夹具错误：requests是{url,body}而非裸body，以及服务器按钮现名为“新建远端任务”；纠正后全过，未放宽阈值或排除用例。运行时显式语言用例补齐已送达消息在pi实时messages和sessionManager两处的同步，随后定位并修复前置快捷标记遮住禁令的真实问题。

## 实际预览与证据

独立可见Electron标题为“DAWN Science · 工具调用边界预览”，配置、数据库、资源目录及下载目录均为新的临时目录，假模型/假发布源仅监听回环地址。假服务器名明确标为演示；“进度查询 · 读取现成结果”会话只有一次read，未启动内核。保留用户当前窗口/草稿，后续不强制切换其正在操作的会话。

- lightweight-status.png：可见假服务器的现成进度查询，明确标注示例数据。
- kernel-explicit-denial.png：真实Electron回归中固定模型强行调用，被运行时拒绝的画面。
- electron-lightweight-query.png：真实Electron回归的摘要读取画面。
- verification.json：分支、测试和执行边界摘要。

首次复制回归截图时，后续Playwright启动清理了默认test-results，已用独立/tmp输出目录重新捕获两项演示并保存。可见预览创建第二会话时遇到输入/切换时序，未继续覆盖当前窗口草稿；拒绝场景图片取自通过的Electron用例，未伪称已填入该可见会话。

命令：npm run typecheck；npm run build；npm test；npx playwright test e2e/tool-selection.spec.ts e2e/execution-boundary.spec.ts e2e/kernel-shortcuts.spec.ts；npx playwright test e2e/kernel-shortcuts.spec.ts --grep '可从菜单选择'；npx playwright test e2e/notebook.spec.ts --grep 'agent 跑的与人敲的'；git diff --check。

## 用户验收后的合并前复核

用户明确授权通过后提交并合并本地main，不推送。人工代码复核发现行内代码格式的工具名会被通用文本清理移除，导致“不要调用run_code”的格式化写法不生效。新增策略及真实NativeRuntime两项回归先红后绿；仅保留单独格式化的run_code/inspect_data标识符，代码块、整句代码及转述仍排除。新增Electron验证@python之后的格式化禁令在实际起内核前拒绝。

重新执行：相关10文件154项、全量453文件4916项通过，10项跳过（102.88秒）；类型、完整构建、diff通过。e2e/tool-selection.spec.ts、execution-boundary.spec.ts、kernel-shortcuts.spec.ts共19项通过（49.5秒），真实本地Python内核与笔记本共享变量1项通过（3.3秒），合计20项不同Electron用例。未修改既有阈值或排除用例。保留既有Canvas、direct-eval与构建体积提示。

核对了8种大小写入口、本轮语言约束/下一轮清除、@R误选Python拒绝、同句禁令优先、显式恢复后连续执行、代码/引文/附图不授权、状态读取不启动内核、服务器上下文和cd目录提示。当前仍保留独立预览，不替换安装版、不推送。

## main集成核验

6601622d由2ee18997快进合并本地main。主工作区类型检查、完整构建、diff通过；相关10文件154项通过（2.64秒），e2e/tool-selection.spec.ts和kernel-shortcuts.spec.ts共18项真实Electron通过（33.9秒），含8种大小写入口、同句禁令、错误语言、语言本轮作用、状态读取、显式恢复及远端目录提示。预览与原分支保留；不推送、不替换安装版。主工作区集成结果见main-integration.json。
