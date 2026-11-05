# 有界并行实际执行评测
确定性 localhost provider 回复并施加每请求 180ms 延迟，只证明真实 Pi／Python／文件／冻结验收／锁／汇总和路线投影工程路径；不代表真实模型质量、费用或速度收益。
相同 CSV、方法、工具与验收；并发 2 为独立只读核查／审阅创建冻结的执行会话，分析成员仍共享且持原工作区执行锁。
backendStartedAt 是持锁后首个真实模型请求；queuedAt 是调度起轮，二者之间包含锁等待、进程启动与 SDK 准备，不能全称作锁等待。
lockReservations 直接观察原共享锁的 acquire/grant/release；lockWaitMs 为实际锁队列等待总和，不改变准入规则。
actualOverlapMs 只使用真实 provider 请求已开始且宿主已结束的完整任务区间；没有用 pending 或排队时间伪造并行。
重复两对并交替顺序仅降低部分抖动，样本不足以推断普遍性能收益；未上报用量维持 unknown/partial，不按零费用处理。

| 重复 | 并发 | 墙钟 ms | 请求数 | backend 重叠 ms | 最大 backend 并发 | 分析重叠 ms | 实际锁等待 ms | 实际值正确 | 版本审阅／路线／单次汇总 | 可见 token（部分） | 未知任务用量 |
|---|---:|---:|---:|---:|---:|---:|---:|---|---|---:|---:|
| 1 | 1 | 15094 | 20 | 0 | 1 | 0 | 23 | true | true | 400 | 1 |
| 1 | 2 | 9896 | 20 | 1356 | 2 | 0 | 3010 | true | true | 400 | 1 |
| 2 | 2 | 9989 | 20 | 1349 | 2 | 0 | 2880 | true | true | 400 | 1 |
| 2 | 1 | 11634 | 20 | 0 | 1 | 0 | 19 | true | true | 400 | 1 |

## 真实时间线（相对单次夹具创建，ms）

### 重复 1／并发 1

| 任务 | 阶段 | 成员 | 调度起轮 | 持锁后首请求 | 宿主结束 |
|---|---|---|---:|---:|---:|
| p-0-a-check-0-0 | check | check | 568 | 1721 | 2207 |
| p-0-a-analyze-0-1 | analyze | analyze | 2218 | 2877 | 5749 |
| p-0-a-review-0-2 | review | review | 5758 | 6817 | 7795 |
| p-1-b-check-0-0 | check | check | 7811 | 8840 | 9357 |
| p-1-b-analyze-0-1 | analyze | analyze | 9372 | 10464 | 12702 |
| p-1-b-review-0-2 | review | review | 12716 | 13314 | 14218 |
| batch-summary-0 | aggregate | aggregate | 14241 | 无模型请求 | 14905 |

### 重复 1／并发 2

| 任务 | 阶段 | 成员 | 调度起轮 | 持锁后首请求 | 宿主结束 |
|---|---|---|---:|---:|---:|
| p-0-a-check-0-0 | check | check | 361 | 1028 | 1509 |
| p-1-b-check-0-0 | check | batch-check-2 | 373 | 1029 | 1486 |
| p-1-b-analyze-0-1 | analyze | analyze | 1498 | 2191 | 4430 |
| p-0-a-analyze-0-1 | analyze | analyze | 4446 | 5084 | 7431 |
| p-1-b-review-0-2 | review | batch-review-2 | 4466 | 8094 | 9013 |
| p-0-a-review-0-2 | review | review | 7453 | 8098 | 8997 |
| batch-summary-0 | aggregate | aggregate | 9045 | 无模型请求 | 9688 |

### 重复 2／并发 2

| 任务 | 阶段 | 成员 | 调度起轮 | 持锁后首请求 | 宿主结束 |
|---|---|---|---:|---:|---:|
| p-0-a-check-0-0 | check | check | 345 | 1124 | 1584 |
| p-1-b-check-0-0 | check | batch-check-2 | 381 | 1103 | 1562 |
| p-1-b-analyze-0-1 | analyze | analyze | 1574 | 2154 | 4593 |
| p-0-a-analyze-0-1 | analyze | analyze | 4609 | 5210 | 7427 |
| p-1-b-review-0-2 | review | batch-review-2 | 4627 | 8096 | 9008 |
| p-0-a-review-0-2 | review | review | 7445 | 8097 | 9027 |
| batch-summary-0 | aggregate | aggregate | 9060 | 无模型请求 | 9779 |

### 重复 2／并发 1

| 任务 | 阶段 | 成员 | 调度起轮 | 持锁后首请求 | 宿主结束 |
|---|---|---|---:|---:|---:|
| p-0-a-check-0-0 | check | check | 342 | 872 | 1325 |
| p-0-a-analyze-0-1 | analyze | analyze | 1333 | 1870 | 4001 |
| p-0-a-review-0-2 | review | review | 4012 | 4586 | 5476 |
| p-1-b-check-0-0 | check | check | 5488 | 6026 | 6495 |
| p-1-b-analyze-0-1 | analyze | analyze | 6506 | 7087 | 9271 |
| p-1-b-review-0-2 | review | review | 9286 | 9889 | 10779 |
| batch-summary-0 | aggregate | aggregate | 10800 | 无模型请求 | 11428 |

## 停止、取消与恢复

停止／恢复：{"intervention":"stop-resume","activeTasks":["p-0-a-check-0-0","p-1-b-check-0-0"],"stopAt":1041,"drainedAt":1106,"drainMs":65,"status":"interrupted","aggregateAttempts":0,"completedBefore":[]}；最终完成=true。
终态取消：{"intervention":"cancel","activeTasks":["p-0-a-check-0-0","p-1-b-check-0-0"],"stopAt":988,"drainedAt":1056,"drainMs":68,"status":"cancelled","aggregateAttempts":0,"completedBefore":[]}；无汇总=true。

完整复用派生批次见 all-reuse.json：零新增模型请求、单次宿主汇总及当前路线版本投影均作实际断言。
每次实际产物保存在 artifacts/；完整团队检查点、路线、汇总、请求和区间见同目录 JSON。
