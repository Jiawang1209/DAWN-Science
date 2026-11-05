# 有界并行实际执行评测
确定性 localhost provider 回复并施加每请求 180ms 延迟，只证明真实 Pi／Python／文件／冻结验收／锁／汇总和路线投影工程路径；不代表真实模型质量、费用或速度收益。
相同 CSV、方法、工具与验收；并发 2 为独立只读核查／审阅创建冻结的执行会话，分析成员仍共享且持原工作区执行锁。
backendStartedAt 是持锁后首个真实模型请求；queuedAt 是调度起轮，二者之间包含锁等待、进程启动与 SDK 准备，不能全称作锁等待。
lockReservations 直接观察原共享锁的 acquire/grant/release；lockWaitMs 为实际锁队列等待总和，不改变准入规则。
actualOverlapMs 只使用真实 provider 请求已开始且宿主已结束的完整任务区间；没有用 pending 或排队时间伪造并行。
重复两对并交替顺序仅降低部分抖动，样本不足以推断普遍性能收益；未上报用量维持 unknown/partial，不按零费用处理。

| 重复 | 并发 | 墙钟 ms | 请求数 | backend 重叠 ms | 最大 backend 并发 | 分析重叠 ms | 实际锁等待 ms | 实际值正确 | 版本审阅／路线／单次汇总 | 可见 token（部分） | 未知任务用量 |
|---|---:|---:|---:|---:|---:|---:|---:|---|---|---:|---:|
| 1 | 1 | 14386 | 20 | 0 | 1 | 0 | 13 | true | true | 400 | 1 |
| 1 | 2 | 9333 | 20 | 1323 | 2 | 0 | 2758 | true | true | 400 | 1 |
| 2 | 2 | 9529 | 20 | 1346 | 2 | 0 | 2847 | true | true | 400 | 1 |
| 2 | 1 | 12098 | 20 | 0 | 1 | 0 | 15 | true | true | 400 | 1 |

## 真实时间线（相对单次夹具创建，ms）

### 重复 1／并发 1

| 任务 | 阶段 | 成员 | 调度起轮 | 持锁后首请求 | 宿主结束 |
|---|---|---|---:|---:|---:|
| p-0-a-check-0-0 | check | check | 512 | 1772 | 2308 |
| p-0-a-analyze-0-1 | analyze | analyze | 2329 | 3736 | 6248 |
| p-0-a-review-0-2 | review | review | 6260 | 6861 | 7768 |
| p-1-b-check-0-0 | check | check | 7779 | 8495 | 8952 |
| p-1-b-analyze-0-1 | analyze | analyze | 8964 | 9546 | 11870 |
| p-1-b-review-0-2 | review | review | 11923 | 12603 | 13504 |
| batch-summary-0 | aggregate | aggregate | 13529 | 无模型请求 | 14197 |

### 重复 1／并发 2

| 任务 | 阶段 | 成员 | 调度起轮 | 持锁后首请求 | 宿主结束 |
|---|---|---|---:|---:|---:|
| p-0-a-check-0-0 | check | check | 346 | 991 | 1447 |
| p-1-b-check-0-0 | check | batch-check-2 | 358 | 1007 | 1468 |
| p-0-a-analyze-0-1 | analyze | analyze | 1458 | 1999 | 4145 |
| p-1-b-analyze-0-1 | analyze | analyze | 4160 | 4723 | 6895 |
| p-0-a-review-0-2 | review | review | 4175 | 7562 | 8454 |
| p-1-b-review-0-2 | review | batch-review-2 | 6916 | 7571 | 8470 |
| batch-summary-0 | aggregate | aggregate | 8501 | 无模型请求 | 9130 |

### 重复 2／并发 2

| 任务 | 阶段 | 成员 | 调度起轮 | 持锁后首请求 | 宿主结束 |
|---|---|---|---:|---:|---:|
| p-0-a-check-0-0 | check | check | 344 | 1044 | 1526 |
| p-1-b-check-0-0 | check | batch-check-2 | 357 | 1045 | 1506 |
| p-1-b-analyze-0-1 | analyze | analyze | 1517 | 2059 | 4222 |
| p-0-a-analyze-0-1 | analyze | analyze | 4239 | 4824 | 7063 |
| p-1-b-review-0-2 | review | batch-review-2 | 4256 | 7762 | 8657 |
| p-0-a-review-0-2 | review | review | 7081 | 7772 | 8671 |
| batch-summary-0 | aggregate | aggregate | 8702 | 无模型请求 | 9311 |

### 重复 2／并发 1

| 任务 | 阶段 | 成员 | 调度起轮 | 持锁后首请求 | 宿主结束 |
|---|---|---|---:|---:|---:|
| p-0-a-check-0-0 | check | check | 343 | 918 | 1379 |
| p-0-a-analyze-0-1 | analyze | analyze | 1385 | 1956 | 4151 |
| p-0-a-review-0-2 | review | review | 4161 | 4771 | 5660 |
| p-1-b-check-0-0 | check | check | 5672 | 6268 | 6748 |
| p-1-b-analyze-0-1 | analyze | analyze | 6767 | 7400 | 9663 |
| p-1-b-review-0-2 | review | review | 9677 | 10306 | 11211 |
| batch-summary-0 | aggregate | aggregate | 11233 | 无模型请求 | 11884 |

## 停止、取消与恢复

停止／恢复：{"intervention":"stop-resume","activeTasks":["p-0-a-check-0-0","p-1-b-check-0-0"],"stopAt":1092,"drainedAt":1162,"drainMs":70,"status":"interrupted","aggregateAttempts":0,"completedBefore":[]}；最终完成=true。
终态取消：{"intervention":"cancel","activeTasks":["p-0-a-check-0-0","p-1-b-check-0-0"],"stopAt":985,"drainedAt":1051,"drainMs":66,"status":"cancelled","aggregateAttempts":0,"completedBefore":[]}；无汇总=true。

完整复用派生批次见 all-reuse.json：零新增模型请求、单次宿主汇总及当前路线版本投影均作实际断言。
每次实际产物保存在 artifacts/；完整团队检查点、路线、汇总、请求和区间见同目录 JSON。
