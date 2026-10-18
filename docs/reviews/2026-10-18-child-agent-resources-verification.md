# 子 Agent 按需资源接入与验收

2026-10-18。独立分支 `codex/child-agent-resources`，基于 main `fe857cef`；用户要求不合并、不推送、不替换安装版。

## 实际行为

桌面已有技能/记忆配置会自动为普通子 Agent 和旧 Team 配置父侧只读资源访问器。子进程得到 `resource_search` / `resource_read`，先检索名称、用途与来源，再按返回的 ID 读正文。关联文本参考路径只能在该技能的真实目录内，不能借平铺技能访问其他停用技能。过程使用既有工具行与子转录，应用退出后仍可恢复；续问重新建立资源目录。

技能按项目、全局、自带先去重再过滤。manual/off 技能不可发现，也不能用其他技能的参考路径绕过；手动调用仍在主会话。自带技能复用已有设置开关，未重新实现技能管理。完整用途描述参与查询，返回预览才缩短。个别损坏/超大/不可读技能单独报告有界诊断，保留同名遮蔽，其他健康技能仍可查询。

记忆仅从 MemoryStore 活动确认轨读取：user / memory 为全局，key 限定本项目与当前分支；未知分支隐藏分支专属条目。不读待确认队列和归档。记忆关闭或读取族关闭时明确返回不可用。索引和全文按字符分页，告知总量、截断与 nextOffset。父侧权限拒绝出声；需要 ask 的读取不在子任务偷偷放行，而返回主会话配置授权的说明。

主 Agent 派单正文仍须明确用户约束。资源不会注册新的执行工具，扩展/提示模板/默认技能扫描仍关闭；子 Agent 的新经验只交回主 Agent，沿用用户确认，不提供资源写入或递归委派工具。

## 机制验收

| 检查 | 实际结果 |
| --- | --- |
| 开发前全量 `npm test` | 403 文件，4547 passed / 10 skipped，94.06 秒 |
| 资源目录边界测试 | 6 项通过，覆盖优先级/遮蔽、记忆作用域、分页、越界/符号链接/二进制、损坏技能隔离与长描述搜索 |
| 父子 RPC / 工厂复验 | 独立复审重跑 3 文件11项通过，涵盖并行/链式/续问、Team 分流、插件开关与远端本机目录隔离 |
| 真实构建子入口 | Electron-as-Node + 真实 pi + 共享推理 mock：四次资源工具调用、角色仅 read 时资源工具仍可用且无 bash/subagent；续问刷新记忆，旧 Team 保留成员通信工具 |
| 最终全量 `npm test` | 409 文件，4562 passed / 10 skipped，100.05 秒 |
| 最终相关复验 | 29 文件200项通过，3.13秒；覆盖资源、普通子任务、Team 与 Bot |
| `npm run typecheck` | 通过 |
| `npm run build` | 通过；无新增依赖、数据库迁移或应用版本变化 |
| 新 Electron 资源验收 | 1 项通过，6.8 秒：主会话真实派单、四次只读查询、续问再查四次、真实应用退出重启后恢复8条资源记录 |
| 既有 Electron 回归 | 29 项通过，覆盖子 Agent、Team、技能、记忆和 Bot；另有1条旧页签布局断言在干净 main 的重新构建上同样失败，不计入通过 |
| 独立只读代码复审 | 提出的2项P2均先复现再修复，二次复审关闭，未再发现可行动问题 |

证据位于工作树忽略目录 `tmp/child-resources/`：`baseline-tests.log`、`resources-red.log`、`bridge-red.log`、`native-red.log`、`integration-red.log`、`review-red.log`、`review-search-red.log`、`review-green.log`、`full-final.log`、`typecheck-final.log`、`build-final.log`、`e2e-regression.log`、`e2e-resource-final.log`、`electron-resource-tools.png`。失败尝试未混入通过项；没有更新视觉基线或容差。

旧断言 `e2e/subagent-view.spec.ts:149` 固定要求右坞9个页签，实际响应式界面为6个，其他入口进入“更多”。在未改源码的主工作区 main `fe857cef` 重新 `npm run build`，再运行 `npx playwright test e2e/subagent-view.spec.ts --grep '看得见：chip'`，同样 expected 9 / received 6。日志保存为 `main-build-baseline.log` / `main-e2e-baseline.log`。未修改该用例或页签布局，也未把它纳入30项通过的 Electron 检查。

## 验收中处理的问题

- pi 的 `tools` 也限制自定义工具：只将本轮确实注册的资源工具和原 Team 通信工具加入白名单，仍不增加 bash 等执行工具。
- macOS `/var` 与 `/private/var` 是同一位置的别名：目录和文件均用真实路径计算默认相对路径，兼容平铺 `.md` 技能。
- 共享 mock 兼容实际 API 的用户 content 数组，并只按当前用户轮的真实工具结果取 ID，续问不使用上一轮 ID。
- 新 UI 用例最初使用了错误的续问按钮名称，后按现有“接着问它 / 接着问”契约修正；应用重载后需要从侧栏重新打开会话，最终改用更强的真正退出/重启验收，恢复了8条工具记录。

## 首版边界

验收中的模型是确定性 mock，证明资源加载、进程通信、工具执行及持久化机制，不代表真实模型必然选对技能或科学方法。未调用用户的真实模型服务，未运行真实科研分析。

远端旧子进程仍在本机运行，首版仅提供全局/自带技能和全局记忆，不把本机同名目录当作远端项目资源。ACP 未新增接入；新 Bot 沿用原 NativeRuntime 技能/记忆能力并通过既有回归。

资源查询不是 OS 文件系统沙箱，角色既有 read/bash 权限仍由原机制定义。本轮未扩大执行工具集，也未重新设计整个子进程执行权限体系。
