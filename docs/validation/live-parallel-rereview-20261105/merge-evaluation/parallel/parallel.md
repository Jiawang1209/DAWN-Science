# 有界并行实际执行评测
确定性 localhost provider 回复并施加每请求 180ms 延迟，只证明真实 Pi／Python／文件／冻结验收／锁／汇总和路线投影工程路径；不代表真实模型质量、费用或速度收益。
相同 CSV、方法、工具与验收；并发 2 为独立只读核查／审阅创建冻结的执行会话，分析成员仍共享且持原工作区执行锁。
backendStartedAt 是持锁后首个真实模型请求；queuedAt 是调度起轮，二者之间包含锁等待、进程启动与 SDK 准备，不能全称作锁等待。
lockReservations 直接观察原共享锁的 acquire/grant/release；lockWaitMs 为实际锁队列等待总和，不改变准入规则。
actualOverlapMs 只使用真实 provider 请求已开始且宿主已结束的完整任务区间；没有用 pending 或排队时间伪造并行。
重复两对并交替顺序仅降低部分抖动，样本不足以推断普遍性能收益；未上报用量维持 unknown/partial，不按零费用处理。

| 重复 | 并发 | 墙钟 ms | 请求数 | backend 重叠 ms | 最大 backend 并发 | 分析重叠 ms | 实际锁等待 ms | 实际值正确 | 版本审阅／路线／单次汇总 | 可见 token（部分） | 未知任务用量 |
|---|---:|---:|---:|---:|---:|---:|---:|---|---|---:|---:|
| 1 | 1 | 11783 | 20 | 0 | 1 | 0 | 16 | true | true | 400 | 1 |
| 1 | 2 | 9441 | 20 | 1346 | 2 | 0 | 2761 | true | true | 400 | 1 |
| 2 | 2 | 9491 | 20 | 1347 | 2 | 0 | 2814 | true | true | 400 | 1 |
| 2 | 1 | 11671 | 20 | 0 | 1 | 0 | 18 | true | true | 400 | 1 |

## 真实时间线（相对单次夹具创建，ms）

### 重复 1／并发 1

| 任务 | 阶段 | 成员 | 调度起轮 | 持锁后首请求 | 宿主结束 |
|---|---|---|---:|---:|---:|
| p-0-a-check-0-0 | check | check | 342 | 891 | 1352 |
| p-0-a-analyze-0-1 | analyze | analyze | 1362 | 1922 | 4154 |
| p-0-a-review-0-2 | review | review | 4165 | 4795 | 5679 |
| p-1-b-check-0-0 | check | check | 5689 | 6237 | 6691 |
| p-1-b-analyze-0-1 | analyze | analyze | 6705 | 7292 | 9436 |
| p-1-b-review-0-2 | review | review | 9453 | 10071 | 10952 |
| batch-summary-0 | aggregate | aggregate | 10973 | 无模型请求 | 11575 |

### 重复 1／并发 2

| 任务 | 阶段 | 成员 | 调度起轮 | 持锁后首请求 | 宿主结束 |
|---|---|---|---:|---:|---:|
| p-0-a-check-0-0 | check | check | 347 | 1019 | 1479 |
| p-1-b-check-0-0 | check | batch-check-2 | 360 | 1018 | 1505 |
| p-0-a-analyze-0-1 | analyze | analyze | 1493 | 2084 | 4234 |
| p-1-b-analyze-0-1 | analyze | analyze | 4251 | 4844 | 6983 |
| p-0-a-review-0-2 | review | review | 4265 | 7630 | 8528 |
| p-1-b-review-0-2 | review | batch-review-2 | 7004 | 7642 | 8546 |
| batch-summary-0 | aggregate | aggregate | 8579 | 无模型请求 | 9226 |

### 重复 2／并发 2

| 任务 | 阶段 | 成员 | 调度起轮 | 持锁后首请求 | 宿主结束 |
|---|---|---|---:|---:|---:|
| p-0-a-check-0-0 | check | check | 350 | 1017 | 1492 |
| p-1-b-check-0-0 | check | batch-check-2 | 363 | 1018 | 1471 |
| p-1-b-analyze-0-1 | analyze | analyze | 1481 | 2044 | 4234 |
| p-0-a-analyze-0-1 | analyze | analyze | 4251 | 4865 | 7039 |
| p-1-b-review-0-2 | review | batch-review-2 | 4270 | 7680 | 8578 |
| p-0-a-review-0-2 | review | review | 7057 | 7684 | 8596 |
| batch-summary-0 | aggregate | aggregate | 8627 | 无模型请求 | 9282 |

### 重复 2／并发 1

| 任务 | 阶段 | 成员 | 调度起轮 | 持锁后首请求 | 宿主结束 |
|---|---|---|---:|---:|---:|
| p-0-a-check-0-0 | check | check | 334 | 894 | 1349 |
| p-0-a-analyze-0-1 | analyze | analyze | 1358 | 1913 | 4112 |
| p-0-a-review-0-2 | review | review | 4124 | 4717 | 5607 |
| p-1-b-check-0-0 | check | check | 5617 | 6172 | 6627 |
| p-1-b-analyze-0-1 | analyze | analyze | 6638 | 7190 | 9354 |
| p-1-b-review-0-2 | review | review | 9369 | 9960 | 10838 |
| batch-summary-0 | aggregate | aggregate | 10858 | 无模型请求 | 11463 |

## 停止、取消与恢复

停止／恢复：{"intervention":"stop-resume","activeTasks":["p-0-a-check-0-0","p-1-b-check-0-0"],"stopAt":986,"drainedAt":1053,"drainMs":67,"status":"interrupted","aggregateAttempts":0,"completedBefore":[]}；最终完成=true。
终态取消：{"intervention":"cancel","activeTasks":["p-0-a-check-0-0","p-1-b-check-0-0"],"stopAt":1031,"drainedAt":1099,"drainMs":68,"status":"cancelled","aggregateAttempts":0,"completedBefore":[]}；无汇总=true。

完整复用派生批次见 all-reuse.json：零新增模型请求、单次宿主汇总及当前路线版本投影均作实际断言。
每次实际产物保存在 artifacts/；完整团队检查点、路线、汇总、请求和区间见同目录 JSON。
