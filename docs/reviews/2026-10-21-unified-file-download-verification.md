# 单文件下载统一任务核验

用户最初要求在新分支完成并打开实际预览，暂不合并、推送；确认外框和主题色按钮后，已授权复核通过后提交并本地合并 main，仍不推送。

基线 `351972f5`，分支 `codex/unified-file-download`，工作树 `/Users/liuyue/.codex/worktrees/unified-file-download/dawn-science`。初次预览时未提交；后续集成状态以文末记录和开发历史为准。

## 最终行为

- 文件及产物预览共用单文件下载回调，创建统一持久化传输任务。旧独立下载卡片及其轮询状态移除。
- 普通文件直接落入下载目录，显示字节进度、状态、实际本机目标；权限失败和取消后可在原任务重传，同名需明确选择覆盖、另存或跳过。
- 新增兼容操作 `startFileDownloadBatch`，协议 minor 为 8.23；原 `startDownload` / `transferStatus` 保留。共享后端与假 SSH 走相同的批次服务。
- 底部统一传输区保持透明底；按用户后续反馈，外框改用与文件列表、预览相同的1px主题色及radius-sm圆角；固定底部，任务明细内部滚动。
- 上传入口、加宽及收窄使用与初始化科研目录相同的primary小按钮，跟随外观主题色及可读字色；菜单和宽度操作保留。

## 自动检查

| 检查 | 结果 |
| --- | --- |
| `npm test` | 449 文件，4893 项通过、10 项跳过 |
| `npm run typecheck` | 通过 |
| `npm run build` | 通过 |
| 相关 Electron | 12 项通过 |
| `git diff --check` | 通过 |

新增服务用例先在旧实现失败，再验证普通/空文件内容、进度完成、重启后原任务重试、同名保留旧文件及目录来源拒绝。相关服务/协议/后端/IPC/UI检查9文件245项通过。

Electron 命令及范围：

```
npx playwright test e2e/single-file-download.spec.ts e2e/upload-experience.spec.ts e2e/directory-transfer.spec.ts e2e/rounded-tabs.spec.ts e2e/preview-collapse.spec.ts
npx playwright test e2e/remote-connections.spec.ts --grep '远端文件下得下来|下载同一个文件两次|本地文件没有'
```

前者9项、后者3项通过。覆盖单文件字节进度、切换面板继续传、取消后清理、重试、实际本机 EACCES、同名另存、目录往返/失败恢复、上传确认、亮暗宽窄、圆角和预览收起。没有宣称整份 remote-connections spec 全量通过。

首次全量只发现删除旧卡片后留下的7条孤立英文翻译；已删除，i18n6项及最终全量重新通过。

## 实际 Electron 预览

新建独立配置、数据库、工作区、下载目录和 Electron userData，加载本工作树构建产物。演示服务器为假 SSH，模型端点为本机 mock；未使用真实凭据，未操作 Genek。

- 点击下载读我.md，实际本机文件内容正确。
- 将隔离下载目录设为0500产生真实 EACCES；恢复0700并点击“重传未完成项”，同一 batch 成功，4096字节全部为x，无 `.dawn-part-` 残留。
- 实际内容区1500×836及1100×688检查；亮暗两种主题截图，窄窗无横向溢出。传输区背景透明、0.5px细描边、10px圆角，位于窗口内。
- 留下另一条可供用户点击重试的失败任务，其目录权限已经恢复；默认新下载目录恢复为隔离 downloads。

截图与结构化证据：[预览目录](../../artifacts/unified-file-download/)。本轮未新增真实服务器核验，不宣称断点续传，不替换安装版应用。

## 外框一致性修订

用户反馈原外框过细过浅后，仅调整CSS外框为1px `--dawn-accent`、`--dawn-radius-sm`。UI构建和相关UI104项重新通过；刷新真实Electron，亮色上下均为rgb(32,138,123)，暗色均为rgb(71,185,169)，线宽均1px，当前圆角标量下均7.5px，传输区继续透明。证据见border-matched-light.png、border-matched-dark.png和border-matched.json。前述0.5px/10px截图和参数保留为修订前证据；本次未重复运行全量功能测试。

## 最终提交前复核

用户确认后，对最终源码重新执行全量测试、类型检查和完整构建，全部通过：449文件4893项通过、10项跳过。相关Electron14项均有通过证据：上述首条命令增加panel-preview-layout.spec.ts两项，共11项，另有原下载3项。

首轮Electron中10项通过，上传用例在夹具firstWindow等待窗口时30秒超时，功能步骤尚未运行。已保存首轮日志merge-first-electron-run.txt，结束该次失败留下的测试进程后，在全量单测结束的环境下单独执行上传与既有下载4项，18.2秒全部通过；未改产品代码、未放宽超时、未排除上传用例。不能将首轮描述为11项一次通过。

最终按钮使用既有primary变体，随外观主题色变化；上传菜单及加宽/收窄已在实际Electron操作验证。相关截图为toolbar-accent-light.png，参数为toolbar-accent.json。旧预览JSON中的committed/merged=false表示当时快照，最终状态以本报告后续集成记录为准。本轮复核仍使用隔离假SSH，未新增真实服务器核验。

## 本地 main 集成结果

- 功能提交 `f6bceb02a3716b6b5da28a62998f889286ea634f` 已从 `351972f5` 快进合并本地main；没有合并冲突。
- main再次完整构建通过；相关5文件174项通过，单文件下载/目录往返与失败恢复/上传体验共5项Electron全部通过（25.6秒）。
- 实际预览切换到 `/Users/liuyue/Desktop/Github_repos/dawn-science/dist/ui/index.html`，复用独立演示配置及数据库；连接假SSH，展开目录后点击下载读我.md，统一任务完成，磁盘62字节内容正确。
- 主工作区预览确认统一任务外框1px主题色、背景透明、旧卡片数量0、无横向溢出。证据：[main截图](../../artifacts/unified-file-download/main-preview.png)、[main验收参数](../../artifacts/unified-file-download/main-integration.json)。
- 保留功能分支和工作树；不推送、不替换安装版，未重新操作Genek。合并后的这条记录作为单独docs提交保留。
