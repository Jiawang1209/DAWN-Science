# 有界并行实际执行评测
确定性 localhost provider 回复并施加每请求 180ms 延迟，只证明真实 Pi／Python／文件／冻结验收／锁／汇总和路线投影工程路径；不代表真实模型质量、费用或速度收益。
相同 CSV、方法、工具与验收；并发 2 为独立只读核查／审阅创建冻结的执行会话，分析成员仍共享且持原工作区执行锁。
backendStartedAt 是持锁后首个真实模型请求；queuedAt 是调度起轮，二者之间包含锁等待、进程启动与 SDK 准备，不能全称作锁等待。
lockReservations 直接观察原共享锁的 acquire/grant/release；lockWaitMs 为实际锁队列等待总和，不改变准入规则。
actualOverlapMs 只使用真实 provider 请求已开始且宿主已结束的完整任务区间；没有用 pending 或排队时间伪造并行。
重复两对并交替顺序仅降低部分抖动，样本不足以推断普遍性能收益；未上报用量维持 unknown/partial，不按零费用处理。

| 重复 | 并发 | 墙钟 ms | 请求数 | backend 重叠 ms | 最大 backend 并发 | 分析重叠 ms | 实际锁等待 ms | 实际值正确 | 版本审阅／路线／单次汇总 | 可见 token（部分） | 未知任务用量 |
|---|---:|---:|---:|---:|---:|---:|---:|---|---|---:|---:|
| 1 | 1 | 16489 | 20 | 0 | 1 | 0 | 15 | true | true | 400 | 1 |
| 1 | 2 | 9631 | 20 | 1317 | 2 | 0 | 2810 | true | true | 400 | 1 |
| 2 | 2 | 9772 | 20 | 1352 | 2 | 0 | 2825 | true | true | 400 | 1 |
| 2 | 1 | 12123 | 20 | 0 | 1 | 0 | 14 | true | true | 400 | 1 |

## 真实时间线（相对单次夹具创建，ms）

### 重复 1／并发 1

| 任务 | 阶段 | 成员 | 调度起轮 | 持锁后首请求 | 宿主结束 |
|---|---|---|---:|---:|---:|
| p-0-a-check-0-0 | check | check | 536 | 1858 | 2397 |
| p-0-a-analyze-0-1 | analyze | analyze | 2404 | 3631 | 6342 |
| p-0-a-review-0-2 | review | review | 6356 | 7775 | 8777 |
| p-1-b-check-0-0 | check | check | 8791 | 10173 | 10681 |
| p-1-b-analyze-0-1 | analyze | analyze | 10696 | 11854 | 14064 |
| p-1-b-review-0-2 | review | review | 14080 | 14732 | 15628 |
| batch-summary-0 | aggregate | aggregate | 15648 | 无模型请求 | 16287 |

### 重复 1／并发 2

| 任务 | 阶段 | 成员 | 调度起轮 | 持锁后首请求 | 宿主结束 |
|---|---|---|---:|---:|---:|
| p-0-a-check-0-0 | check | check | 345 | 1030 | 1493 |
| p-1-b-check-0-0 | check | batch-check-2 | 357 | 1013 | 1470 |
| p-1-b-analyze-0-1 | analyze | analyze | 1482 | 2067 | 4291 |
| p-0-a-analyze-0-1 | analyze | analyze | 4307 | 4926 | 7094 |
| p-1-b-review-0-2 | review | batch-review-2 | 4329 | 7813 | 8708 |
| p-0-a-review-0-2 | review | review | 7117 | 7831 | 8728 |
| batch-summary-0 | aggregate | aggregate | 8761 | 无模型请求 | 9409 |

### 重复 2／并发 2

| 任务 | 阶段 | 成员 | 调度起轮 | 持锁后首请求 | 宿主结束 |
|---|---|---|---:|---:|---:|
| p-0-a-check-0-0 | check | check | 489 | 1186 | 1657 |
| p-1-b-check-0-0 | check | batch-check-2 | 500 | 1201 | 1681 |
| p-0-a-analyze-0-1 | analyze | analyze | 1672 | 2260 | 4403 |
| p-1-b-analyze-0-1 | analyze | analyze | 4419 | 5039 | 7221 |
| p-0-a-review-0-2 | review | review | 4436 | 7898 | 8808 |
| p-1-b-review-0-2 | review | batch-review-2 | 7243 | 7912 | 8826 |
| batch-summary-0 | aggregate | aggregate | 8859 | 无模型请求 | 9545 |

### 重复 2／并发 1

| 任务 | 阶段 | 成员 | 调度起轮 | 持锁后首请求 | 宿主结束 |
|---|---|---|---:|---:|---:|
| p-0-a-check-0-0 | check | check | 355 | 952 | 1404 |
| p-0-a-analyze-0-1 | analyze | analyze | 1411 | 1960 | 4140 |
| p-0-a-review-0-2 | review | review | 4152 | 4767 | 5679 |
| p-1-b-check-0-0 | check | check | 5690 | 6308 | 6771 |
| p-1-b-analyze-0-1 | analyze | analyze | 6786 | 7444 | 9624 |
| p-1-b-review-0-2 | review | review | 9641 | 10250 | 11180 |
| batch-summary-0 | aggregate | aggregate | 11204 | 无模型请求 | 11899 |

## 停止、取消与恢复

停止／恢复：{"intervention":"stop-resume","activeTasks":["p-0-a-check-0-0","p-1-b-check-0-0"],"stopAt":1033,"drainedAt":1094,"drainMs":61,"status":"interrupted","aggregateAttempts":0,"completedBefore":[]}；最终完成=true。
终态取消：{"intervention":"cancel","activeTasks":["p-0-a-check-0-0","p-1-b-check-0-0"],"stopAt":1155,"drainedAt":1216,"drainMs":61,"status":"cancelled","aggregateAttempts":0,"completedBefore":[]}；无汇总=true。

完整复用派生批次见 all-reuse.json：零新增模型请求、单次宿主汇总及当前路线版本投影均作实际断言。
每次实际产物保存在 artifacts/；完整团队检查点、路线、汇总、请求和区间见同目录 JSON。
