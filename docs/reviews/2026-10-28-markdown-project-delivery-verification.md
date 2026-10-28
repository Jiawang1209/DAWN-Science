# Markdown 图片、脚本链接与项目文件交付验收

## 范围与分支

- 基线：本地 main `fa321f8c`；独立工作树 `/Users/liuyue/.codex/worktrees/markdown-project-delivery/dawn-science`，分支 `codex/markdown-project-delivery`。
- 只处理用户授权的 Markdown 文件引用与全项目已有文件选择。不合并、不推送，不替换安装版；无依赖或协议版本变化。

## 实现与复核

- Markdown 文档获得所属的读取回调与文档路径。普通链接、图片、引用式链接先解析为工作区内相对路径，经现有清洗/安全渲染管线到专用组件；图片仍通过后端受守卫的 readFile 读取，脚本只打开现有预览。
- 保留聊天的流式渲染；文件使用整篇解析，避免引用定义被分块丢失。文档路径写进插件参数，避免 Streamdown 按插件名字缓存 processor 时复用上一份文档的目录；读取回调变化时更换渲染身份，迟到结果不能跨会话回填。
- 相对父目录、中文与编码空格已验证；工作区逃逸、协议伪装、绝对文件 URL 不放行。缺失图片、非图片内容和解码失败均显示原因。后端原有 realpath/符号链接守卫仍是权威。
- 现有文件、当前产物、交付预览共用此读取逻辑。历史留存没有完整引用快照，继续不读取当前工作区来冒充旧版图像。
- 交付选择页可以按需浏览项目目录或按文件名搜索全项目，显式勾选后添加，复用现有 listDirectory/searchFiles。保留会话作用域、隐藏路径约束、搜索预算、异常重试、选择去重和 60 项上限；不自动递归收集整个项目。
- 原始选定文件按原目录层次复制，已有 Markdown 在引用文件也被选中时仍可显示图片并跳转至复制的脚本。本轮不调整交付阶段生成新脚本的原行为。

## 实际验证

- 基线相关测试：4 文件、63 项通过。
- 新增回归先失败：缺少“从项目添加文件”，相对图片未触发读取；随后实现通过。
- 全量 Vitest：536 文件通过，5629 项通过、11 项跳过，共 5640 项。日志：`/Users/liuyue/Documents/Codex/2026-10-28/dawn-markdown-project-delivery/vitest-full.log`。
- 最后相关回归：12 文件、208 项通过，覆盖文件守卫、Markdown、交付后端、UI、双语与设计契约。
- TypeScript 检查与完整 Electron/CLI/UI 构建通过；原有 eval 和大分块构建提示保留，未放宽限制。
- 新增真实 Electron 3/3：图片实际解码；Python/R 脚本点击进入只读预览；已有项目文件可选并逐字节复制；复制后 Markdown 图片与脚本引用可用；英文 1280×808 下能完成选择，无横向溢出。
- 原流程 Electron 7 项通过：科学交付独立 Python 运行、对话 Markdown 导出、图片与代码预览、项目和临时会话产物、只读轮次无伪造产物。
- 原视觉基线 14/14 通过，未修改图片或阈值。英文用例初次失败是测试夹具强制中文和菜单定位错误，改用实际设置控件与正确标签后，新用例全部通过。

模型回复使用确定性共享 mock；文件读取、复制、图片解码与原交付 Python 独立运行都是真实执行。这些检查不证明任意真实模型的科学解读质量。本轮没有新增远端 SSH 真机验收。

## 本机体验

标准启动器：`/Users/liuyue/Library/Application Support/DAWN Science Dev Preview/launch-preview.sh`，传入本分支工作树；保留共享隔离资料，旧数据库已在线备份并登记原有 130 个资料文件的哈希。

体验目录：`/Users/liuyue/Library/Application Support/DAWN Science Dev Preview/workspaces/分步脚本与Markdown体验`。内含原始合成 CSV、分步 Python 清洗脚本和 R 绘图脚本、实际生成的清洗数据/统计表/PNG，以及 `results/reports/分析记录.md`。两份脚本已分别使用系统 Python 与 `/usr/local/bin/Rscript` 执行成功。运行时与原资料保留核对结果见同一外部证据目录的 JSON；预览实际分支/提交以标准目录 `running.json` 为准。
