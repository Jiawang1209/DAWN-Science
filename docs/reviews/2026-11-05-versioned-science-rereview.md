# 内容版本与批量科研交付：合并前复审

范围：基线 `07275d77` 至专项 `codex/versioned-science-batches` 的完整未提交功能及本轮审查修复。用户明确授权发现问题后修复、补测试，无阻塞后本地提交并合并 main；不推送、不发布。复用原专项隔离工作区，保留旧验收记录，当前证据另存 `docs/validation/versioned-science-rereview-20261105/`。

## 发现与修复

### 1. 排队与活动占用的文件身份漂移

原 `taskOutputReservation` 只在入队前获取 canonical/inode。合法旧占用者在等待期间原子替换输入并创建硬链接后，等待中的 review 持有旧 inode key，新别名 writer 能同时进入。相同问题存在于活动 writer 替换文件后新产生的 inode。

修复：原 BotOutputLocks 在每次同步调度比较前解析本地路径，排队项更新当前身份，活动项保留历史身份并合并当前身份；解析异常保守占整工作区。绑定与未绑定的本地 Bot 都接同一动态入口，不另建锁池。取消仍移除等待项，活动占用直到真正排空才释放。

复现/回归：`tests/bot/output-lock-identity.test.ts` 的排队输入替换、新旧硬链接别名；`boundaries-red.txt` 记录原失败。独立审查原实际脚本现返回 writerEnteredWhileReaderHeld=false。

### 2. 同路径的大小写别名与工作区 scope 别名

当前大小写不敏感的文件系统允许尚不存在的 `results/a/analysis.py` 与 `results/A/analysis.py` 最终指向同一文件；原批量准入按字面 canonical path 通过，第二项可覆盖第一项已验收文件。另一复现通过同一工作区的不同大小写路径进入，原 scope 字符串不同，绕过路径锁比较。

修复：锁路径、工作区 scope 和批量别名准入共用 `outputReservationKey`，对大小写/Unicode 归一保守折叠；canonical/inode 动态刷新继续生效。该标识只用于保守占用，权限判断和实际文件路径不被折叠、不扩大。大小写敏感系统可能多串行，这是保护跨平台产物的保守取舍。

回归：尚未存在的大小写输出目录、同工作区大小写/符号链接入口。`case-alias-red.txt` 与 `scope-alias-red.txt` 有真实红测，`scope-alias-green.txt` 三文件12项通过。独立复现已确认 sameWorkspace=true 且竞争 writer 保持等待。

### 3. 恢复等待期间路线已修改

原恢复入口先读路线，再 await 文件版本核验，之后只复查流程 stateRevision。核验等锁期间用户修改路线，流程自身修订不变，仍可能按旧路线恢复执行。

修复：文件核验后、同步状态变更前重新读取并核对路线 routeId/revision。若变化，拒绝恢复，原 interrupted 检查点及任务保持不变，不调用调度。

回归：真实共享锁阻塞核验、修改路线再释放，确认拒绝且零调度。原失败收录在 `boundaries-red.txt`。

### 4. 合法长批量项 ID 无法推进

批量项 ID 可为 32 字符，内部任务上限40。27字符项可启动 check，却在 analyze 阶段生成超长任务 ID，32字符项甚至不能开始。

修复：内部阶段 ID 使用稳定批量索引和有界展示前缀，完整 item.id/namespace 保留，原任务 ID 与 accepted 记录不重写，单项旧格式不变。批量索引防止相同前缀截断碰撞，最大尝试序号也保持在40字符内。

回归：27与32字符项实际推进三阶段；真实 Pi 批量测试使用两个最长、相同前缀的合法 ID。独立原脚本现可成功进入 analyze。

## 本轮复审范围与结论

两位独立只读 reviewer 分别覆盖正式提交、Pi/Bot 证明、版本观察、锁/取消，以及批量推进、汇总、契约冻结、恢复与控制入口。主实现复查路线投影生命周期、恢复 CAS、宿主汇总与集成行为。所有确认问题均有复现和修复，未将假设问题列为缺陷；最终未发现剩余已确认阻塞项。

动态身份复核没有新增执行循环或单独占用：Bot 由 backend 持锁，普通 Pi/Team 与固定汇总由原执行器持锁，投影避免嵌套持同一锁。汇总仍仅复制 accepted 回执，不创造统计结论。版本不符、输入改变或取消均不放行下游；未知副作用恢复仍须明确确认。

## 验收与本地集成

当前冻结源码清单 `source-sha256.json` 共67个变更源码/测试/夹具/配置文件。类型检查、完整构建、当前成对本地基线与针对回归已通过；冻结源码完整619文件/6171项通过、11跳过，11个Electron场景通过。两位独立只读复审最终无剩余阻塞。提交和main验证在本地集成后登记。

最终命令：`npm run typecheck`、`npm run build`、`npm test -- --maxWorkers=4`、四个相关 Electron 文件（批量、单项、普通 subagent、Team）和 `npm run evaluate:science -- docs/validation/versioned-science-rereview-20261105/evaluation`。

本轮真实执行验证使用 Python、真实 Pi/Native/Bot/SQLite/文件和确定性 localhost 推理，不读取真实提供商凭证。成对基线仍是软件路径回归，不支持真实模型准确率、费用或加速结论；没有发布或替换安装应用。


分支最终验收：`typecheck-final.txt` 与 `build-final.txt` 退出0；`full-final.txt` 619文件/6171项通过、11跳过；`electron-final.txt` 11场景通过，退出0。`source-check.json` 确认67个文件无漂移、当前评测源码及child构建指纹匹配。两模式仍各5/5成功、错误放行0，缺失/部分用量如实保留。
