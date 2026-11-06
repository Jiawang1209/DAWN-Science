# 有界并行实际执行评测
确定性 localhost provider 回复并施加每请求 180ms 延迟，只证明真实 Pi／Python／文件／冻结验收／锁／汇总和路线投影工程路径；不代表真实模型质量、费用或速度收益。
相同 CSV、方法、工具与验收；并发 2 为独立只读核查／审阅创建冻结的执行会话，分析成员仍共享且持原工作区执行锁。
backendStartedAt 是持锁后首个真实模型请求；queuedAt 是调度起轮，二者之间包含锁等待、进程启动与 SDK 准备，不能全称作锁等待。
lockReservations 直接观察原共享锁的 acquire/grant/release；lockWaitMs 为实际锁队列等待总和，不改变准入规则。
actualOverlapMs 只使用真实 provider 请求已开始且宿主已结束的完整任务区间；没有用 pending 或排队时间伪造并行。
重复两对并交替顺序仅降低部分抖动，样本不足以推断普遍性能收益；未上报用量维持 unknown/partial，不按零费用处理。

| 重复 | 并发 | 墙钟 ms | 请求数 | backend 重叠 ms | 最大 backend 并发 | 分析重叠 ms | 实际锁等待 ms | 实际值正确 | 版本审阅／路线／单次汇总 | 可见 token（部分） | 未知任务用量 |
|---|---:|---:|---:|---:|---:|---:|---:|---|---|---:|---:|
| 1 | 1 | 13621 | 20 | 0 | 1 | 0 | 41 | true | true | 400 | 1 |
| 1 | 2 | 9459 | 20 | 1353 | 2 | 0 | 2792 | true | true | 400 | 1 |
| 2 | 2 | 9430 | 20 | 1381 | 2 | 0 | 2773 | true | true | 400 | 1 |
| 2 | 1 | 11754 | 20 | 0 | 1 | 0 | 11 | true | true | 400 | 1 |

## 真实时间线（相对单次夹具创建，ms）

### 重复 1／并发 1

| 任务 | 阶段 | 成员 | 调度起轮 | 持锁后首请求 | 宿主结束 |
|---|---|---|---:|---:|---:|
| p-0-a-check-0-0 | check | check | 491 | 2076 | 2565 |
| p-0-a-analyze-0-1 | analyze | analyze | 2572 | 3834 | 6101 |
| p-0-a-review-0-2 | review | review | 6110 | 6662 | 7579 |
| p-1-b-check-0-0 | check | check | 7590 | 8148 | 8609 |
| p-1-b-analyze-0-1 | analyze | analyze | 8621 | 9152 | 11286 |
| p-1-b-review-0-2 | review | review | 11300 | 11880 | 12781 |
| batch-summary-0 | aggregate | aggregate | 12802 | 无模型请求 | 13446 |

### 重复 1／并发 2

| 任务 | 阶段 | 成员 | 调度起轮 | 持锁后首请求 | 宿主结束 |
|---|---|---|---:|---:|---:|
| p-0-a-check-0-0 | check | check | 344 | 995 | 1471 |
| p-1-b-check-0-0 | check | batch-check-2 | 356 | 1006 | 1493 |
| p-0-a-analyze-0-1 | analyze | analyze | 1484 | 2055 | 4266 |
| p-1-b-analyze-0-1 | analyze | analyze | 4283 | 4851 | 7052 |
| p-0-a-review-0-2 | review | review | 4298 | 7689 | 8594 |
| p-1-b-review-0-2 | review | batch-review-2 | 7092 | 7690 | 8578 |
| batch-summary-0 | aggregate | aggregate | 8623 | 无模型请求 | 9238 |

### 重复 2／并发 2

| 任务 | 阶段 | 成员 | 调度起轮 | 持锁后首请求 | 宿主结束 |
|---|---|---|---:|---:|---:|
| p-0-a-check-0-0 | check | check | 359 | 1050 | 1524 |
| p-1-b-check-0-0 | check | batch-check-2 | 370 | 1050 | 1545 |
| p-0-a-analyze-0-1 | analyze | analyze | 1536 | 2110 | 4268 |
| p-1-b-analyze-0-1 | analyze | analyze | 4284 | 4848 | 7030 |
| p-0-a-review-0-2 | review | review | 4298 | 7652 | 8560 |
| p-1-b-review-0-2 | review | batch-review-2 | 7050 | 7653 | 8576 |
| batch-summary-0 | aggregate | aggregate | 8606 | 无模型请求 | 9226 |

### 重复 2／并发 1

| 任务 | 阶段 | 成员 | 调度起轮 | 持锁后首请求 | 宿主结束 |
|---|---|---|---:|---:|---:|
| p-0-a-check-0-0 | check | check | 336 | 874 | 1339 |
| p-0-a-analyze-0-1 | analyze | analyze | 1347 | 1877 | 4016 |
| p-0-a-review-0-2 | review | review | 4027 | 4599 | 5488 |
| p-1-b-check-0-0 | check | check | 5505 | 6052 | 6503 |
| p-1-b-analyze-0-1 | analyze | analyze | 6516 | 7110 | 9290 |
| p-1-b-review-0-2 | review | review | 9308 | 9979 | 10867 |
| batch-summary-0 | aggregate | aggregate | 10891 | 无模型请求 | 11525 |

## 停止、取消与恢复

停止／恢复：{"intervention":"stop-resume","activeTasks":["p-0-a-check-0-0","p-1-b-check-0-0"],"stopAt":1044,"drainedAt":1107,"drainMs":63,"status":"interrupted","aggregateAttempts":0,"completedBefore":[]}；最终完成=true。
终态取消：{"intervention":"cancel","activeTasks":["p-0-a-check-0-0","p-1-b-check-0-0"],"stopAt":1001,"drainedAt":1068,"drainMs":67,"status":"cancelled","aggregateAttempts":0,"completedBefore":[]}；无汇总=true。

完整复用派生批次见 all-reuse.json：零新增模型请求、单次宿主汇总及当前路线版本投影均作实际断言。
每次实际产物保存在 artifacts/；完整团队检查点、路线、汇总、请求和区间见同目录 JSON。
