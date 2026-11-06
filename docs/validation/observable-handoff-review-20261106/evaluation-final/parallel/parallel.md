# 有界并行实际执行评测
确定性 localhost provider 回复并施加每请求 180ms 延迟，只证明真实 Pi／Python／文件／冻结验收／锁／汇总和路线投影工程路径；不代表真实模型质量、费用或速度收益。
相同 CSV、方法、工具与验收；并发 2 为独立只读核查／审阅创建冻结的执行会话，分析成员仍共享且持原工作区执行锁。
backendStartedAt 是持锁后首个真实模型请求；queuedAt 是调度起轮，二者之间包含锁等待、进程启动与 SDK 准备，不能全称作锁等待。
lockReservations 直接观察原共享锁的 acquire/grant/release；lockWaitMs 为实际锁队列等待总和，不改变准入规则。
actualOverlapMs 只使用真实 provider 请求已开始且宿主已结束的完整任务区间；没有用 pending 或排队时间伪造并行。
重复两对并交替顺序仅降低部分抖动，样本不足以推断普遍性能收益；未上报用量维持 unknown/partial，不按零费用处理。

| 重复 | 并发 | 墙钟 ms | 请求数 | backend 重叠 ms | 最大 backend 并发 | 分析重叠 ms | 实际锁等待 ms | 实际值正确 | 版本审阅／路线／单次汇总 | 可见 token（部分） | 未知任务用量 |
|---|---:|---:|---:|---:|---:|---:|---:|---|---|---:|---:|
| 1 | 1 | 12370 | 20 | 0 | 1 | 0 | 15 | true | true | 400 | 1 |
| 1 | 2 | 9083 | 20 | 1388 | 2 | 0 | 2732 | true | true | 400 | 1 |
| 2 | 2 | 9096 | 20 | 1396 | 2 | 0 | 2712 | true | true | 400 | 1 |
| 2 | 1 | 11286 | 20 | 0 | 1 | 0 | 12 | true | true | 400 | 1 |

## 真实时间线（相对单次夹具创建，ms）

### 重复 1／并发 1

| 任务 | 阶段 | 成员 | 调度起轮 | 持锁后首请求 | 宿主结束 |
|---|---|---|---:|---:|---:|
| p-0-a-check-0-0 | check | check | 465 | 1538 | 2015 |
| p-0-a-analyze-0-1 | analyze | analyze | 2024 | 2743 | 4848 |
| p-0-a-review-0-2 | review | review | 4857 | 5400 | 6331 |
| p-1-b-check-0-0 | check | check | 6342 | 6888 | 7371 |
| p-1-b-analyze-0-1 | analyze | analyze | 7383 | 7898 | 10119 |
| p-1-b-review-0-2 | review | review | 10133 | 10719 | 11644 |
| batch-summary-0 | aggregate | aggregate | 11665 | 无模型请求 | 12227 |

### 重复 1／并发 2

| 任务 | 阶段 | 成员 | 调度起轮 | 持锁后首请求 | 宿主结束 |
|---|---|---|---:|---:|---:|
| p-0-a-check-0-0 | check | check | 325 | 926 | 1407 |
| p-1-b-check-0-0 | check | batch-check-2 | 336 | 945 | 1427 |
| p-0-a-analyze-0-1 | analyze | analyze | 1417 | 1964 | 4041 |
| p-1-b-analyze-0-1 | analyze | analyze | 4056 | 4611 | 6767 |
| p-0-a-review-0-2 | review | review | 4071 | 7360 | 8310 |
| p-1-b-review-0-2 | review | batch-review-2 | 6787 | 7368 | 8294 |
| batch-summary-0 | aggregate | aggregate | 8339 | 无模型请求 | 8893 |

### 重复 2／并发 2

| 任务 | 阶段 | 成员 | 调度起轮 | 持锁后首请求 | 宿主结束 |
|---|---|---|---:|---:|---:|
| p-0-a-check-0-0 | check | check | 325 | 926 | 1403 |
| p-1-b-check-0-0 | check | batch-check-2 | 335 | 908 | 1382 |
| p-1-b-analyze-0-1 | analyze | analyze | 1395 | 1910 | 4045 |
| p-0-a-analyze-0-1 | analyze | analyze | 4061 | 4603 | 6745 |
| p-1-b-review-0-2 | review | batch-review-2 | 4079 | 7374 | 8314 |
| p-0-a-review-0-2 | review | review | 6763 | 7373 | 8329 |
| batch-summary-0 | aggregate | aggregate | 8358 | 无模型请求 | 8909 |

### 重复 2／并发 1

| 任务 | 阶段 | 成员 | 调度起轮 | 持锁后首请求 | 宿主结束 |
|---|---|---|---:|---:|---:|
| p-0-a-check-0-0 | check | check | 306 | 795 | 1276 |
| p-0-a-analyze-0-1 | analyze | analyze | 1284 | 1831 | 3900 |
| p-0-a-review-0-2 | review | review | 3912 | 4461 | 5392 |
| p-1-b-check-0-0 | check | check | 5404 | 5931 | 6386 |
| p-1-b-analyze-0-1 | analyze | analyze | 6398 | 6963 | 9041 |
| p-1-b-review-0-2 | review | review | 9056 | 9611 | 10524 |
| batch-summary-0 | aggregate | aggregate | 10544 | 无模型请求 | 11089 |

## 停止、取消与恢复

停止／恢复：{"intervention":"stop-resume","activeTasks":["p-0-a-check-0-0","p-1-b-check-0-0"],"stopAt":937,"drainedAt":992,"drainMs":55,"status":"interrupted","aggregateAttempts":0,"completedBefore":[]}；最终完成=true。
终态取消：{"intervention":"cancel","activeTasks":["p-0-a-check-0-0","p-1-b-check-0-0"],"stopAt":976,"drainedAt":1041,"drainMs":65,"status":"cancelled","aggregateAttempts":0,"completedBefore":[]}；无汇总=true。

完整复用派生批次见 all-reuse.json：零新增模型请求、单次宿主汇总及当前路线版本投影均作实际断言。
每次实际产物保存在 artifacts/；完整团队检查点、路线、汇总、请求和区间见同目录 JSON。
