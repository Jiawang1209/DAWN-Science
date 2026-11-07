# 有界并行实际执行评测
确定性 localhost provider 回复并施加每请求 180ms 延迟，只证明真实 Pi／Python／文件／冻结验收／锁／汇总和路线投影工程路径；不代表真实模型质量、费用或速度收益。
相同 CSV、方法、工具与验收；并发 2 为独立只读核查／审阅创建冻结的执行会话，分析成员仍共享且持原工作区执行锁。
backendStartedAt 是持锁后首个真实模型请求；queuedAt 是调度起轮，二者之间包含锁等待、进程启动与 SDK 准备，不能全称作锁等待。
lockReservations 直接观察原共享锁的 acquire/grant/release；lockWaitMs 为实际锁队列等待总和，不改变准入规则。
actualOverlapMs 只使用真实 provider 请求已开始且宿主已结束的完整任务区间；没有用 pending 或排队时间伪造并行。
重复两对并交替顺序仅降低部分抖动，样本不足以推断普遍性能收益；未上报用量维持 unknown/partial，不按零费用处理。

| 重复 | 并发 | 墙钟 ms | 请求数 | backend 重叠 ms | 最大 backend 并发 | 分析重叠 ms | 实际锁等待 ms | 实际值正确 | 版本审阅／路线／单次汇总 | 可见 token（部分） | 未知任务用量 |
|---|---:|---:|---:|---:|---:|---:|---:|---|---|---:|---:|
| 1 | 1 | 11186 | 20 | 0 | 1 | 0 | 21 | true | true | 400 | 1 |
| 1 | 2 | 8838 | 20 | 1398 | 2 | 0 | 2595 | true | true | 400 | 1 |
| 2 | 2 | 8883 | 20 | 1374 | 2 | 0 | 2627 | true | true | 400 | 1 |
| 2 | 1 | 11154 | 20 | 0 | 1 | 0 | 21 | true | true | 400 | 1 |

## 真实时间线（相对单次夹具创建，ms）

### 重复 1／并发 1

| 任务 | 阶段 | 成员 | 调度起轮 | 持锁后首请求 | 宿主结束 |
|---|---|---|---:|---:|---:|
| p-0-a-check-0-0 | check | check | 350 | 876 | 1328 |
| p-0-a-analyze-0-1 | analyze | analyze | 1334 | 1844 | 3905 |
| p-0-a-review-0-2 | review | review | 3913 | 4450 | 5378 |
| p-1-b-check-0-0 | check | check | 5390 | 5904 | 6383 |
| p-1-b-analyze-0-1 | analyze | analyze | 6395 | 6896 | 8979 |
| p-1-b-review-0-2 | review | review | 8993 | 9556 | 10460 |
| batch-summary-0 | aggregate | aggregate | 10478 | 无模型请求 | 11022 |

### 重复 1／并发 2

| 任务 | 阶段 | 成员 | 调度起轮 | 持锁后首请求 | 宿主结束 |
|---|---|---|---:|---:|---:|
| p-0-a-check-0-0 | check | check | 312 | 878 | 1367 |
| p-1-b-check-0-0 | check | batch-check-2 | 325 | 865 | 1346 |
| p-1-b-analyze-0-1 | analyze | analyze | 1355 | 1854 | 3936 |
| p-0-a-analyze-0-1 | analyze | analyze | 3951 | 4467 | 6518 |
| p-1-b-review-0-2 | review | batch-review-2 | 3969 | 7104 | 8041 |
| p-0-a-review-0-2 | review | review | 6537 | 7111 | 8055 |
| batch-summary-0 | aggregate | aggregate | 8084 | 无模型请求 | 8646 |

### 重复 2／并发 2

| 任务 | 阶段 | 成员 | 调度起轮 | 持锁后首请求 | 宿主结束 |
|---|---|---|---:|---:|---:|
| p-0-a-check-0-0 | check | check | 356 | 923 | 1395 |
| p-1-b-check-0-0 | check | batch-check-2 | 369 | 932 | 1415 |
| p-0-a-analyze-0-1 | analyze | analyze | 1406 | 1919 | 3986 |
| p-1-b-analyze-0-1 | analyze | analyze | 3999 | 4523 | 6596 |
| p-0-a-review-0-2 | review | review | 4016 | 7178 | 8107 |
| p-1-b-review-0-2 | review | batch-review-2 | 6616 | 7180 | 8091 |
| batch-summary-0 | aggregate | aggregate | 8136 | 无模型请求 | 8699 |

### 重复 2／并发 1

| 任务 | 阶段 | 成员 | 调度起轮 | 持锁后首请求 | 宿主结束 |
|---|---|---|---:|---:|---:|
| p-0-a-check-0-0 | check | check | 318 | 811 | 1277 |
| p-0-a-analyze-0-1 | analyze | analyze | 1283 | 1773 | 3863 |
| p-0-a-review-0-2 | review | review | 3872 | 4409 | 5322 |
| p-1-b-check-0-0 | check | check | 5334 | 5839 | 6309 |
| p-1-b-analyze-0-1 | analyze | analyze | 6320 | 6837 | 8883 |
| p-1-b-review-0-2 | review | review | 8896 | 9430 | 10354 |
| batch-summary-0 | aggregate | aggregate | 10373 | 无模型请求 | 10954 |

## 停止、取消与恢复

停止／恢复：{"intervention":"stop-resume","activeTasks":["p-0-a-check-0-0","p-1-b-check-0-0"],"stopAt":884,"drainedAt":942,"drainMs":58,"status":"interrupted","aggregateAttempts":0,"completedBefore":[]}；最终完成=true。
终态取消：{"intervention":"cancel","activeTasks":["p-0-a-check-0-0","p-1-b-check-0-0"],"stopAt":893,"drainedAt":955,"drainMs":62,"status":"cancelled","aggregateAttempts":0,"completedBefore":[]}；无汇总=true。

完整复用派生批次见 all-reuse.json：零新增模型请求、单次宿主汇总及当前路线版本投影均作实际断言。
每次实际产物保存在 artifacts/；完整团队检查点、路线、汇总、请求和区间见同目录 JSON。
