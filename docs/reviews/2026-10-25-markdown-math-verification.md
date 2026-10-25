# 数学公式排版验收（2026-10-25）

## 结果

`codex/markdown-math` 的实现提交 `c0730079` 已快进合并至本地 main。没有推送、发布或替换安装版。主目录与分支的生产代码、依赖及测试完全相同；本报告与计划收尾只改文档。

## 交付范围

- 共享 AgentMarkdown 接入官方 `@streamdown/math@1.0.3`，KaTeX 锁定为 `0.16.47`。API 层为 `createMathPlugin({singleDollarTextMath:true,errorColor:"var(--dawn-danger)"})`；CSS 与字体由 Vite 本地打包，无 CDN。
- `$…$` 行内公式、独占行 `$$` 独立公式；覆盖分数、上下标、求和、矩阵、中文段落。此项未加入 `\(...\)`／`\[...\]` 定界符兼容或公式编辑器。
- 用户与助手消息、Markdown 文件预览共用渲染器；保留原有代码高亮及复制/下载。行内和围栏代码不解析公式；字面美元可用 `\$`。
- 独立长公式在自身区域横向滚动，不能撑宽消息、文件预览或窗口；主题色与字号继承现有体系。
- 语法错误局部可见，后文继续渲染；公式源码保留在复制内容、文件和 Markdown 导出中。KaTeX 默认 trust=false，未放宽 CSP。
- KaTeX 的标准 `.katex-display` 容器仅获设计扫描的精确例外；Streamdown/Tailwind 类名禁令保持。

使用依据：[Streamdown 官方数学插件文档](https://streamdown.ai/docs/plugins/math)。替代方案是另建 MathJax 渲染链或自写公式字符串替换；本次不采用，以保持同一 Markdown 解析器、流式处理和代码保护边界。

## 当次验证

| 阶段 | 结果 | 证据 |
|---|---|---|
| 原有 Markdown 基线 | 2 文件、12 项通过 | baseline.log |
| 新公式用例初次复现 | 7 失败、2 通过，失败为没有数学 DOM | red.log |
| 模型夹具路径误判复现 | 1 失败、1 通过 | mock-red.log |
| 分支全部 UI | 177 文件、1678 项通过 | ui-all.log |
| 分支 mock 集成 | 13 文件、42 项通过 | mock-all.log |
| 分支类型检查与构建 | 通过 | typecheck.log、build.log |
| 分支真实 Electron | 22/22 通过 | verified-electron.log |
| 合并后主目录相关测试 | 17 文件、166 项通过 | main-tests.log |
| 合并后主目录类型检查与构建 | 通过 | main-typecheck.log、main-build.log |
| 合并后主目录真实 Electron | 22/22 通过 | main-electron.log |

22 项 Electron 包含新增公式 3 项、原有 Markdown 5 项、原有视觉基线 14 项。公式用例覆盖真实消息/IPC/流式回复、MathML、矩阵行列、局部语法错误、复制与导出、文件预览、窄坞滚动、主题和实际字体加载；没有 CSP、字体解码或页面异常。视觉基线、像素阈值、mask 和 CSP 均未变更。

最初视觉轮次发现共享 mock 用整份 messages 判断是否含 markdown，分支路径 `markdown-math` 出现在系统提示中便误触发富文本回复，导致期待固定正文的用例失败。先以新集成用例复现，再仅将该判定收窄到最后一条用户消息；未修改视觉图像或减弱断言。完整复验为 22/22。该轮诊断保留在 visual.log 和 visual-results/。

UI 全量日志中保留 jsdom 的两条 HTMLCanvasElement getContext 未实现提示，测试仍全部通过；构建有既有分块大小提示。没有因此安装 canvas、修改测试环境或调整构建阈值。

## 原生开发预览

严格使用 `/Users/liuyue/Library/Application Support/DAWN Science Dev Preview/launch-preview.sh`，传入 `/Users/liuyue/.codex/worktrees/markdown-math/dawn-science`，运行实现提交 `c0730079`。先让上一版隔离预览正常退出，并释放退出所等待的调试连接；沿用同一隔离 profile，未修改模型配置、凭证或既有会话。

通过真实文件面板打开隔离示例 `数学公式排版验收.md`，点击展开阅读并检查：4 个有效数学表达式、3 个独立公式、行内模型和矩阵外观清晰；语法错误留在局部。原生窗口实测长公式容器宽 395、内容宽 1157，横向滚轮可移动 450 像素，窗口没有横向溢出。KaTeX_Main、KaTeX_Math、KaTeX_Size2/3 字体实际加载。保留预览工作树供继续查看。

截图逐张目视检查：verified-electron/ 下的亮/暗消息、窄坞与流式状态，以及 preview-native.png、preview-native-long.png。亮暗公式跟随正文，求和和矩阵未裁切；长公式滚动保留完整内容。

## 证据与边界

日志和截图根目录：`/Users/liuyue/Documents/Codex/2026-10-25/dawn-science-markdown-math/`。

这是公式解析、渲染和既有 UI 路径验收；模型回复使用共享确定性推理夹具，原生预览读取本地固定 Markdown，没有调用真实模型进行科研推理。本轮未重跑仓库全部 Node/内核或全部历史 Electron 用例，未验证 Windows/Linux 真机或发布安装包，不据此声称数学推导或科研结果正确。
