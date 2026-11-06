# 有界并行实际执行评测
确定性 localhost provider 回复并施加每请求 180ms 延迟，只证明真实 Pi／Python／文件／冻结验收／锁／汇总和路线投影工程路径；不代表真实模型质量、费用或速度收益。
相同 CSV、方法、工具与验收；并发 2 为独立只读核查／审阅创建冻结的执行会话，分析成员仍共享且持原工作区执行锁。
backendStartedAt 是持锁后首个真实模型请求；queuedAt 是调度起轮，二者之间包含锁等待、进程启动与 SDK 准备，不能全称作锁等待。
lockReservations 直接观察原共享锁的 acquire/grant/release；lockWaitMs 为实际锁队列等待总和，不改变准入规则。
actualOverlapMs 只使用真实 provider 请求已开始且宿主已结束的完整任务区间；没有用 pending 或排队时间伪造并行。
重复两对并交替顺序仅降低部分抖动，样本不足以推断普遍性能收益；未上报用量维持 unknown/partial，不按零费用处理。

| 重复 | 并发 | 墙钟 ms | 请求数 | backend 重叠 ms | 最大 backend 并发 | 分析重叠 ms | 实际锁等待 ms | 实际值正确 | 版本审阅／路线／单次汇总 | 可见 token（部分） | 未知任务用量 |
|---|---:|---:|---:|---:|---:|---:|---:|---|---|---:|---:|
| 1 | 1 | 12819 | 20 | 0 | 1 | 0 | 20 | true | true | 400 | 1 |
| 1 | 2 | 9398 | 20 | 1289 | 2 | 0 | 2838 | true | true | 400 | 1 |
| 2 | 2 | 9225 | 20 | 1312 | 2 | 0 | 2720 | true | true | 400 | 1 |
| 2 | 1 | 12009 | 20 | 0 | 1 | 0 | 22 | true | true | 400 | 1 |

## 真实时间线（相对单次夹具创建，ms）

### 重复 1／并发 1

| 任务 | 阶段 | 成员 | 调度起轮 | 持锁后首请求 | 宿主结束 |
|---|---|---|---:|---:|---:|
| p-0-a-check-0-0 | check | check | 398 | 1088 | 1545 |
| p-0-a-analyze-0-1 | analyze | analyze | 1552 | 2318 | 4596 |
| p-0-a-review-0-2 | review | review | 4610 | 5342 | 6267 |
| p-1-b-check-0-0 | check | check | 6283 | 6994 | 7459 |
| p-1-b-analyze-0-1 | analyze | analyze | 7475 | 8220 | 10488 |
| p-1-b-review-0-2 | review | review | 10505 | 11116 | 12000 |
| batch-summary-0 | aggregate | aggregate | 12022 | 无模型请求 | 12622 |

### 重复 1／并发 2

| 任务 | 阶段 | 成员 | 调度起轮 | 持锁后首请求 | 宿主结束 |
|---|---|---|---:|---:|---:|
| p-0-a-check-0-0 | check | check | 334 | 968 | 1420 |
| p-1-b-check-0-0 | check | batch-check-2 | 347 | 991 | 1467 |
| p-0-a-analyze-0-1 | analyze | analyze | 1432 | 2004 | 4116 |
| p-1-b-analyze-0-1 | analyze | analyze | 4132 | 4696 | 6915 |
| p-0-a-review-0-2 | review | review | 4148 | 7568 | 8460 |
| p-1-b-review-0-2 | review | batch-review-2 | 6937 | 7600 | 8500 |
| batch-summary-0 | aggregate | aggregate | 8533 | 无模型请求 | 9180 |

### 重复 2／并发 2

| 任务 | 阶段 | 成员 | 调度起轮 | 持锁后首请求 | 宿主结束 |
|---|---|---|---:|---:|---:|
| p-0-a-check-0-0 | check | check | 336 | 956 | 1411 |
| p-1-b-check-0-0 | check | batch-check-2 | 348 | 967 | 1436 |
| p-0-a-analyze-0-1 | analyze | analyze | 1423 | 1988 | 4141 |
| p-1-b-analyze-0-1 | analyze | analyze | 4157 | 4721 | 6844 |
| p-0-a-review-0-2 | review | review | 4173 | 7479 | 8364 |
| p-1-b-review-0-2 | review | batch-review-2 | 6865 | 7496 | 8381 |
| batch-summary-0 | aggregate | aggregate | 8411 | 无模型请求 | 9020 |

### 重复 2／并发 1

| 任务 | 阶段 | 成员 | 调度起轮 | 持锁后首请求 | 宿主结束 |
|---|---|---|---:|---:|---:|
| p-0-a-check-0-0 | check | check | 341 | 903 | 1356 |
| p-0-a-analyze-0-1 | analyze | analyze | 1363 | 1902 | 4277 |
| p-0-a-review-0-2 | review | review | 4288 | 4888 | 5782 |
| p-1-b-check-0-0 | check | check | 5792 | 6340 | 6794 |
| p-1-b-analyze-0-1 | analyze | analyze | 6806 | 7368 | 9591 |
| p-1-b-review-0-2 | review | review | 9607 | 10220 | 11115 |
| batch-summary-0 | aggregate | aggregate | 11136 | 无模型请求 | 11782 |

## 停止、取消与恢复

停止／恢复：{"intervention":"stop-resume","activeTasks":["p-0-a-check-0-0","p-1-b-check-0-0"],"stopAt":1023,"drainedAt":1084,"drainMs":61,"status":"interrupted","aggregateAttempts":0,"completedBefore":[]}；最终完成=true。
终态取消：{"intervention":"cancel","activeTasks":["p-0-a-check-0-0","p-1-b-check-0-0"],"stopAt":981,"drainedAt":1055,"drainMs":74,"status":"cancelled","aggregateAttempts":0,"completedBefore":[]}；无汇总=true。

完整复用派生批次见 all-reuse.json：零新增模型请求、单次宿主汇总及当前路线版本投影均作实际断言。
每次实际产物保存在 artifacts/；完整团队检查点、路线、汇总、请求和区间见同目录 JSON。
