# DeepSeek Flash 终端图片专项验收

日期：2026-10-23。功能基线提交 `4ba276d9`，工作区 `/Users/liuyue/.codex/worktrees/terminal-assistance/dawn-science`，分支 `codex/terminal-assistance`。

## 结论

复用已配置的 `deepseek/deepseek-flash` 和原加密凭证，真实 API 验证以下三项通过。本轮没有修改功能代码或生产配置，没有启用视觉转述、切换到其他模型或另配 key。

1. **终端发图**：实际系统剪贴板粘贴新 PNG；先暂存 1 张、未产生用户轮次，输入问题后一起发送。随机代号只放在图片里，首句问题不包含代号、颜色和形状答案。Flash 正确回答绿色圆形、橙色三角形与完整代号。运行时元数据确认 deepseek-flash，视觉转述 enabled=false、ready=false；本次是原生识图。
2. **显示返回图片**：Flash 实际调用 bash，在现有 python3/matplotlib 环境生成新文件 `deepseek-flash-chart-6014b5ca.png`，随后 read 回读 PNG 并用 Markdown 图片返回。两个工具均成功，未安装依赖。终端输出缩略图可点击放大，放大图与实际输出 PNG 的 SHA256 一致，尺寸 750×525，文件 13474 字节。Agent 调用绘图工具生成文件，不声称 Flash API 原生生成位图。
3. **返回会话后问原图**：点击“返回会话”后原用户附图可见。在同一 native ID 续问最初图片，不重新附图、不调用工具，Flash 仍正确回答完整代号及绿色圆形。用户轮次中只有第一句带图，GUI 续问未新建/复制任务，任务数 18 → 18。

## 会话与证据

- 终端 ID：`b3e442fe-ba99-4976-ac3d-8f9413590d8c`。
- CLI/native 会话 ID：`7bc56770-51af-40e8-a9cc-3fb9032bf0f7`。
- 原主人会话 ID：`65e30787-8332-4576-a242-ae55e5c2e181`。
- 输出文件 SHA256：`580859ad3b5341ae4ccec81c9d19ade91a8f2f8cbd1c3471126898fdf71bf7ec`。
- 证据：`artifacts/deepseek-terminal-images/evidence.json`，新输入 `input-proof.png`，真实生成图表副本 `generated-chart.png`，截图 01–07。

补充验证拖入/移除待发图片、重开终端仍显示缓存图片，以及原主人草稿隔离保留。草稿比较以确认填入后的基线为准；最初自动化在终端仍打开时未完成草稿预置，未将那次未确认基线的比较作为产品结论。真实剪贴板在粘贴后已恢复。

最终独立 Electron 预览保持亮色 1280×840、DAWN 模式，实际模型仍为 deepseek-flash，无待发图片，原文字输入就绪。缩略图、放大、关闭与返回同段对话均可操作。本轮仅专项实测和记录，不把上轮单测计数冒充本轮重跑；没有代码修改，因此未重复运行全量构建和单测。

## 边界与保留

原 providers.yaml 和 credentials.json 哈希前后一致；密钥未出现在日志或证据。主目录 main 仍为 `38959c57` 且干净。不合并、不推送、不安装或替换安装版。只保留当前独立分支、实测证据与可试用预览。

本次图片输出展示在终端，图形会话原图续问已验证；图表是工程样例，不是科研结果。本轮不新增外部终端图片协议或图片生成服务。
