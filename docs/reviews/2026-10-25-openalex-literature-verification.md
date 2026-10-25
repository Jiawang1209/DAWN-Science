# 科研文献插件验收

## 范围与实现

独立分支 `codex/openalex-literature`，从本地 main `289bcb3c` 开始。独立实现 OpenAlex 关键词/年份检索、精确 DOI 索引元数据核对和所选真实记录保存；未读取外部参考项目源码，也未新增其名称、链接、标识、素材或文案。不增加依赖或协议操作。

设置第四张插件卡默认关闭，原有三个插件的默认状态不变。导航数字是启用数，因此仍为 3，不能按总数改成 4。仅 API 会话装配；外部 CLI/ACP agent 不受控。远端仅查询，本地保存经过既有写权限门；方案/讨论/路线只读门明确放行两项查询，保存仍受限制。

客户端固定官方 HTTPS，禁止跳转，单次最多 25 条、20 秒超时、2 MiB 响应预算，摘要展开后也受字符预算限制。不自动翻页或重试，不下载 PDF。保留实际来源、查询条件、时间和缺失/截断状态。返回的 DOI 必须与请求匹配，404 不解释成论文不存在。

保存仅接受会话内实际观察到的 UUID，缓存最多 100 条且不跨应用重启。生成新目录中的 JSON/Markdown，不覆盖旧文件，拒绝非法路径、符号链接与工作区逃逸。模型修改查询输出对象或传入未查身份不能替换缓存原记录。若磁盘写入失败，可能留下部分目录，工具会返回失败而非完整保存成功。

## 分支验证

证据根目录：`/Users/liuyue/Documents/Codex/2026-10-25/dawn-science-openalex-literature/`。

| 检查 | 结果 | 证据 |
| --- | --- | --- |
| 完整 Vitest | 508 文件，5379 通过，10 原有跳过 | `full-tests-controlled.log`，命令 `npm test -- --maxWorkers=4` |
| 新文献与共享 mock、既有 MCP 定向检查 | 77 通过 | `focused-review.log` |
| 类型、构建 | 通过 | `typecheck-final.log`、`build-final.log` |
| 相关真实 Electron | 40/40 通过 | `electron-clean.log` |
| 视觉基线 | 14/14 通过，图片、阈值和 mask 均未改 | 包含在上述 Electron 运行中 |
| 原生预览 | 固定 launcher，1280×808；插件开关、真实清单普通/展开阅读通过目视检查，无横向溢出 | `preview-plugin.png`、`preview-plugin-enabled.png`、`preview-live-references*.png` |
| 真实服务 | 匿名生产客户端检索 2 条、DOI 匹配 1 条、未收录 DOI 0 条 | `live-client.json`、`live-client.log` |
| 真实保存 | 生产工具检索后选第一条保存，原生预览实际打开 JSON 对应 Markdown | `live-save.json`、`real-saved-references/` |

Electron 覆盖：默认关闭无查询请求、界面启用与持久化、新会话装配、关键词/年份/数量、DOI、只保存所选记录、两份真实文件与产物预览、关闭后新会话无工具、限流与零结果不保存、方案期只查询，以及既有 Office/浏览器/记忆/方案/讨论/产物流程。

模型和 API 在自动 Electron 场景中使用共享确定性夹具，工具装配、权限、IPC、文件与渲染是真实执行；固定模型不能证明任意真实模型的规划质量。真实网络探针与保存另外执行，未伪装为固定数据。真实检索第一条为 “Reduction of microbial diversity in grassland soil is driven by long-term climate warming”，来源缺少摘要，实际文件明确保留“来源未提供摘要”。

修复过程中先确认失败：未实现客户端/工具的失败、未装配和只读门失败、HTTP 错误体未释放的回归用例，以及 Electron 发现的默认关闭插件启用后未持久化。后者根因是设置空串会删除键，已对默认关闭插件显式存 `0`。相关证据保留在最初的 red/first 日志中。

完整测试初次高并发运行有 1 条既有 MCP HTTP 假服务器 5 秒启动超时；单独复跑 32 项通过，限制 worker 数后完整重跑全部通过，未改超时或断言。一次 Electron 运行与预览构建重叠，首条产物用例遇到 `ERR_FILE_NOT_FOUND`；固定构建后完整 40 项干净重跑通过。最初视觉等待把启用数误设为总数 4，检查 UI 计数来源后恢复为 3，未重存基线。

## 审阅与边界

完成默认状态持久化、权限装配、缓存隔离、字节/摘要预算、响应体释放、路径与来源保存检查。新增文件与 diff 添加行未命中参考项目名称或路径；已有历史归属说明未做无关清理。没有推送、发布、替换已安装应用或更改真实用户配置。固定预览继续使用隔离 profile，测试产物仅追加到该 profile 的 plan-demo 工作区。

使用入口见 [科研文献使用说明](../科研文献-怎么用.md)。本次只交付索引元数据查询与清单，不含全文综述、PDF 下载或科学结论审核。

## 本地集成

实现提交 `ad8516a3` 已从独立分支快进合入本地 main（起点 `289bcb3c`）。主目录复验：

- `npm run typecheck`、`npm run build` 通过，见 `main-typecheck.log`、`main-build.log`。
- 11 文件、220 项相关测试通过，覆盖文献、共享 mock、方案/讨论/路线只读门、溯源与既有插件；见 `main-related.log`。
- 同组 40/40 Electron 通过，含 14 个未改视觉基线；见 `main-electron.log`。源代码与分支逐文件一致，无主目录专用改动。
- 固定 launcher 重启的原生预览来自 `codex/openalex-literature` / `ad8516a3`，保留隔离 profile 和本次真实文献产物，停在文献插件入口；`preview-native.png` 是已提交版本。

保留正在使用的预览工作树。后续仅补记本验收与历史，不推送、不发布、不替换已安装应用。
