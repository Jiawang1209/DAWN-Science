# 有界并行实际执行评测
确定性 localhost provider 回复并施加每请求 180ms 延迟，只证明真实 Pi／Python／文件／冻结验收／锁／汇总和路线投影工程路径；不代表真实模型质量、费用或速度收益。
相同 CSV、方法、工具与验收；并发 2 为独立只读核查／审阅创建冻结的执行会话，分析成员仍共享且持原工作区执行锁。
backendStartedAt 是持锁后首个真实模型请求；queuedAt 是调度起轮，二者之间包含锁等待、进程启动与 SDK 准备，不能全称作锁等待。
lockReservations 直接观察原共享锁的 acquire/grant/release；lockWaitMs 为实际锁队列等待总和，不改变准入规则。
actualOverlapMs 只使用真实 provider 请求已开始且宿主已结束的完整任务区间；没有用 pending 或排队时间伪造并行。
重复两对并交替顺序仅降低部分抖动，样本不足以推断普遍性能收益；未上报用量维持 unknown/partial，不按零费用处理。

| 重复 | 并发 | 墙钟 ms | 请求数 | backend 重叠 ms | 最大 backend 并发 | 分析重叠 ms | 实际锁等待 ms | 实际值正确 | 版本审阅／路线／单次汇总 | 可见 token（部分） | 未知任务用量 |
|---|---:|---:|---:|---:|---:|---:|---:|---|---|---:|---:|
| 1 | 1 | 12767 | 20 | 0 | 1 | 0 | 22 | true | true | 400 | 1 |
| 1 | 2 | 10605 | 20 | 1380 | 2 | 0 | 3270 | true | true | 400 | 1 |
| 2 | 2 | 9983 | 20 | 1375 | 2 | 0 | 2956 | true | true | 400 | 1 |
| 2 | 1 | 12414 | 20 | 0 | 1 | 0 | 23 | true | true | 400 | 1 |

## 真实时间线（相对单次夹具创建，ms）

### 重复 1／并发 1

| 任务 | 阶段 | 成员 | 调度起轮 | 持锁后首请求 | 宿主结束 |
|---|---|---|---:|---:|---:|
| p-0-a-check-0-0 | check | check | 420 | 1239 | 1730 |
| p-0-a-analyze-0-1 | analyze | analyze | 1738 | 2432 | 4694 |
| p-0-a-review-0-2 | review | review | 4706 | 5393 | 6289 |
| p-1-b-check-0-0 | check | check | 6301 | 6926 | 7392 |
| p-1-b-analyze-0-1 | analyze | analyze | 7406 | 8030 | 10255 |
| p-1-b-review-0-2 | review | review | 10272 | 10984 | 11884 |
| batch-summary-0 | aggregate | aggregate | 11915 | 无模型请求 | 12559 |

### 重复 1／并发 2

| 任务 | 阶段 | 成员 | 调度起轮 | 持锁后首请求 | 宿主结束 |
|---|---|---|---:|---:|---:|
| p-0-a-check-0-0 | check | check | 357 | 1106 | 1616 |
| p-1-b-check-0-0 | check | batch-check-2 | 372 | 1105 | 1586 |
| p-1-b-analyze-0-1 | analyze | analyze | 1600 | 2239 | 4630 |
| p-0-a-analyze-0-1 | analyze | analyze | 4650 | 5510 | 7883 |
| p-1-b-review-0-2 | review | batch-review-2 | 4677 | 8735 | 9641 |
| p-0-a-review-0-2 | review | review | 7906 | 8741 | 9657 |
| batch-summary-0 | aggregate | aggregate | 9691 | 无模型请求 | 10358 |

### 重复 2／并发 2

| 任务 | 阶段 | 成员 | 调度起轮 | 持锁后首请求 | 宿主结束 |
|---|---|---|---:|---:|---:|
| p-0-a-check-0-0 | check | check | 362 | 1096 | 1580 |
| p-1-b-check-0-0 | check | batch-check-2 | 379 | 1099 | 1557 |
| p-1-b-analyze-0-1 | analyze | analyze | 1568 | 2219 | 4467 |
| p-0-a-analyze-0-1 | analyze | analyze | 4484 | 5184 | 7398 |
| p-1-b-review-0-2 | review | batch-review-2 | 4506 | 8153 | 9092 |
| p-0-a-review-0-2 | review | review | 7421 | 8159 | 9076 |
| batch-summary-0 | aggregate | aggregate | 9127 | 无模型请求 | 9773 |

### 重复 2／并发 1

| 任务 | 阶段 | 成员 | 调度起轮 | 持锁后首请求 | 宿主结束 |
|---|---|---|---:|---:|---:|
| p-0-a-check-0-0 | check | check | 359 | 982 | 1436 |
| p-0-a-analyze-0-1 | analyze | analyze | 1444 | 2107 | 4301 |
| p-0-a-review-0-2 | review | review | 4312 | 5054 | 5949 |
| p-1-b-check-0-0 | check | check | 5960 | 6606 | 7067 |
| p-1-b-analyze-0-1 | analyze | analyze | 7080 | 7735 | 9948 |
| p-1-b-review-0-2 | review | review | 9966 | 10651 | 11545 |
| batch-summary-0 | aggregate | aggregate | 11567 | 无模型请求 | 12206 |

## 停止、取消与恢复

停止／恢复：{"intervention":"stop-resume","activeTasks":["p-0-a-check-0-0","p-1-b-check-0-0"],"stopAt":1185,"drainedAt":1245,"drainMs":60,"status":"interrupted","aggregateAttempts":0,"completedBefore":[]}；最终完成=true。
终态取消：{"intervention":"cancel","activeTasks":["p-0-a-check-0-0","p-1-b-check-0-0"],"stopAt":1019,"drainedAt":1087,"drainMs":68,"status":"cancelled","aggregateAttempts":0,"completedBefore":[]}；无汇总=true。

完整复用派生批次见 all-reuse.json：零新增模型请求、单次宿主汇总及当前路线版本投影均作实际断言。
每次实际产物保存在 artifacts/；完整团队检查点、路线、汇总、请求和区间见同目录 JSON。
