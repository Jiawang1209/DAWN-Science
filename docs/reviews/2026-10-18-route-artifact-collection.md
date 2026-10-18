# 路线产物收集验收

## 范围与原因

当前 `codex/analysis-route`，不合并、推送或替换安装版。前一轮路线的两个区域外框保留。

旧收集器只在 Git 快照失败时使用文件系统，因而漏掉被忽略目录中由 R/Python 内部生成的文件。子目录会话还能读取到父仓库的 porcelain 路径，存在混入工作区外路径的问题。另一方面，路线明确登记的交付引用没有接入产物标签。

## 修复与事实边界

- 子目录会话只在自身工作区做前后文件快照；仓库根保留 Git，并用有界文件快照补充忽略文件。原始输入及未改动的旧文件不算新建；重定向登记和快照发现同一路径时去重。
- 协议8.19为 `listArtifacts` 新增可选 `routeArtifacts`。与原 `artifacts` 分开；只读取当前会话路线的 deliverables，不读取 inputs/预期 outputs 或全目录作为产物。
- 路线引用按路径合并，保留 routeId/stepIds。文件存在、缺失、查不了仍分开；远端不在本机查文件，越界符号链接不被标成工作区内文件存在。工具生成记录优先；路线引用不伪造 bornRunId、bornToolCallId、生成时间，也不进入“本轮已生成”或方案生成时间对照。
- 路线事件额外发出既有 `artifactsChanged`，即时刷新产物清单与计数。文件查看沿用已有共享预览和关闭行为。
- 文件快照仍有20,000文件上限并跳过依赖/应用元数据，不跟随符号链接；大 Git 工作区超限时只能保留已知 Git/显式声明事实，不能据此承诺全部忽略输出已自动捕获。

## 实际窗口

重启原隔离预览，原会话 `7e66e7ff-c8df-4bad-b27f-4bf2b4fbae3a` 的产物从6项补齐到13项：6个旧工具新建记录，7个路线登记引用。未重跑或改写任何科研输出；13项大小与SHA256均与 `tmp/route-state-live-5oyjk8yd/output-manifest.json` 相同。

在产物标签内实际打开 PNG、Welch CSV 和中文 Markdown 报告；图像标题/坐标/底部说明完整，表格显示1行12列，报告保留排版，切换和关闭正常。预览最终保留在PNG，顶部清单同时可见表格、报告、PNG/PDF及来源标记。原先1条未知工具记录保留，不为改善显示而改写旧账本。

截图均位于 `tmp/route-state-live-5oyjk8yd/`：

- `12-artifacts-collected-png.png`：首次补齐后PNG全窗口。
- `13-artifacts-collected-table.png`：实际统计表。
- `14-artifacts-collected-report.png`：实际中文报告。
- `15-artifacts-final-preview.png`：最终产物清单与PNG。

## 自动化

先运行旧逻辑回归，观察到忽略输出漏收、父仓库路径混入、路线引用未显示等失败；修复后定向215项通过。新增真实Electron用例通过真实bash产生被Git忽略的PNG/CSV/Markdown，再通过实际路线工具登记新旧交付文件：确认3项新建、7项去重展示，旧输入及预期输出不在清单，缺失PDF不可打开，并逐个读取图/表/报告。

最终 typecheck、UI与主进程构建通过；429文件4,775项Vitest通过、10项原跳过；10项相关真实Electron回归通过。日志 `/tmp/dawn-artifact-typecheck-final.log`、`/tmp/dawn-artifact-build.log`、`/tmp/dawn-artifact-ui-final.log`、`/tmp/dawn-artifact-full-final.log`、`/tmp/dawn-artifact-e2e-verified.log`。先前一次Electron批次与UI重建重叠，页面重载时遇到构建目录暂时不存在的 `ERR_FILE_NOT_FOUND`；等待构建结束后完整重跑10项全部通过，没有修改断言掩盖该失败。确定性推理仅为工程验证；既有合成科研输出本轮只读复用。
