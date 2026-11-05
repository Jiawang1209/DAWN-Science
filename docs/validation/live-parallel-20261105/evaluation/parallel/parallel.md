# 有界并行实际执行评测
确定性 localhost provider 回复并施加每请求 180ms 延迟，只证明真实 Pi／Python／文件／冻结验收／锁／汇总和路线投影工程路径；不代表真实模型质量、费用或速度收益。
相同 CSV、方法、工具与验收；并发 2 为独立只读核查／审阅创建冻结的执行会话，分析成员仍共享且持原工作区执行锁。
backendStartedAt 是持锁后首个真实模型请求；queuedAt 是调度起轮，二者之间包含锁等待、进程启动与 SDK 准备，不能全称作锁等待。
lockReservations 直接观察原共享锁的 acquire/grant/release；lockWaitMs 为实际锁队列等待总和，不改变准入规则。
actualOverlapMs 只使用真实 provider 请求已开始且宿主已结束的完整任务区间；没有用 pending 或排队时间伪造并行。
重复两对并交替顺序仅降低部分抖动，样本不足以推断普遍性能收益；未上报用量维持 unknown/partial，不按零费用处理。

| 重复 | 并发 | 墙钟 ms | 请求数 | backend 重叠 ms | 最大 backend 并发 | 分析重叠 ms | 实际锁等待 ms | 实际值正确 | 版本审阅／路线／单次汇总 | 可见 token（部分） | 未知任务用量 |
|---|---:|---:|---:|---:|---:|---:|---:|---|---|---:|---:|
| 1 | 1 | 17635 | 20 | 0 | 1 | 0 | 25 | true | true | 400 | 1 |
| 1 | 2 | 12976 | 20 | 1429 | 2 | 0 | 3583 | true | true | 400 | 1 |
| 2 | 2 | 13051 | 20 | 1408 | 2 | 0 | 3701 | true | true | 400 | 1 |
| 2 | 1 | 13752 | 20 | 0 | 1 | 0 | 16 | true | true | 400 | 1 |

## 真实时间线（相对单次夹具创建，ms）

### 重复 1／并发 1

| 任务 | 阶段 | 成员 | 调度起轮 | 持锁后首请求 | 宿主结束 |
|---|---|---|---:|---:|---:|
| p-0-a-check-0-0 | check | check | 431 | 1664 | 2227 |
| p-0-a-analyze-0-1 | analyze | analyze | 2238 | 3697 | 6462 |
| p-0-a-review-0-2 | review | review | 6474 | 7697 | 8715 |
| p-1-b-check-0-0 | check | check | 8729 | 9864 | 10368 |
| p-1-b-analyze-0-1 | analyze | analyze | 10382 | 11722 | 14660 |
| p-1-b-review-0-2 | review | review | 14678 | 15490 | 16477 |
| batch-summary-0 | aggregate | aggregate | 16502 | 无模型请求 | 17334 |

### 重复 1／并发 2

| 任务 | 阶段 | 成员 | 调度起轮 | 持锁后首请求 | 宿主结束 |
|---|---|---|---:|---:|---:|
| p-0-a-check-0-0 | check | check | 460 | 1563 | 2088 |
| p-1-b-check-0-0 | check | batch-check-2 | 475 | 1590 | 2113 |
| p-0-a-analyze-0-1 | analyze | analyze | 2100 | 3129 | 5780 |
| p-1-b-analyze-0-1 | analyze | analyze | 5801 | 6716 | 9352 |
| p-0-a-review-0-2 | review | review | 5816 | 10643 | 11638 |
| p-1-b-review-0-2 | review | batch-review-2 | 9385 | 10707 | 11718 |
| batch-summary-0 | aggregate | aggregate | 11754 | 无模型请求 | 12671 |

### 重复 2／并发 2

| 任务 | 阶段 | 成员 | 调度起轮 | 持锁后首请求 | 宿主结束 |
|---|---|---|---:|---:|---:|
| p-0-a-check-0-0 | check | check | 443 | 1709 | 2206 |
| p-1-b-check-0-0 | check | batch-check-2 | 456 | 1770 | 2294 |
| p-0-a-analyze-0-1 | analyze | analyze | 2231 | 3361 | 5872 |
| p-1-b-analyze-0-1 | analyze | analyze | 5889 | 6939 | 9502 |
| p-0-a-review-0-2 | review | review | 5909 | 10837 | 11828 |
| p-1-b-review-0-2 | review | batch-review-2 | 9526 | 10824 | 11809 |
| batch-summary-0 | aggregate | aggregate | 11861 | 无模型请求 | 12771 |

### 重复 2／并发 1

| 任务 | 阶段 | 成员 | 调度起轮 | 持锁后首请求 | 宿主结束 |
|---|---|---|---:|---:|---:|
| p-0-a-check-0-0 | check | check | 456 | 1592 | 2090 |
| p-0-a-analyze-0-1 | analyze | analyze | 2100 | 3177 | 5770 |
| p-0-a-review-0-2 | review | review | 5782 | 6910 | 7820 |
| p-1-b-check-0-0 | check | check | 7830 | 8375 | 8849 |
| p-1-b-analyze-0-1 | analyze | analyze | 8862 | 9395 | 11488 |
| p-1-b-review-0-2 | review | review | 11503 | 12064 | 12970 |
| batch-summary-0 | aggregate | aggregate | 12989 | 无模型请求 | 13578 |

## 停止、取消与恢复

停止／恢复：{"intervention":"stop-resume","activeTasks":["p-0-a-check-0-0","p-1-b-check-0-0"],"stopAt":945,"drainedAt":1007,"drainMs":62,"status":"interrupted","aggregateAttempts":0,"completedBefore":[]}；最终完成=true。
终态取消：{"intervention":"cancel","activeTasks":["p-0-a-check-0-0","p-1-b-check-0-0"],"stopAt":942,"drainedAt":1009,"drainMs":67,"status":"cancelled","aggregateAttempts":0,"completedBefore":[]}；无汇总=true。

完整复用派生批次见 all-reuse.json：零新增模型请求、单次宿主汇总及当前路线版本投影均作实际断言。
每次实际产物保存在 artifacts/；完整团队检查点、路线、汇总、请求和区间见同目录 JSON。
