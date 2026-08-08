# 主开发规划（已被取代）

**本文档已于 2026-08-08 被 [`2026-08-08-master-roadmap.md`](./2026-08-08-master-roadmap.md) 取代。**

不要在此处继续维护。完整原文见 git 历史（`git show 594ac96:docs/superpowers/plans/2026-08-07-master-roadmap.md` 起的各版本）。

## 为什么取代而不是原地修改

保留一份被淘汰的规划、同时又有一份新规划，会制造两个都自称权威的文档。Rho 的
`AGENTS.md` 把这种情况列为**必须停下来先处理的条件**之一：

> *"two documents claim the same state, persistence, approval, or acceptance semantics"*

因此旧文档降为存根，只保留指路。

## 新规划改了什么

1. **每个开发步骤补齐五项**：技术栈 / 成果 / 效果 / 技术栈来源 / 对标
2. **新增阶段 ①-B′「桌面成型」**（S1–S7）—— 桌面不是壳，是产品本身
3. **「事实层与证据」从 ②-B 内部提升为独立阶段 ③**（S21–S24）—— 依据：Rho 的
   `rho-store` 里 audit + evidence + compare 占 43%
4. **契约冻结点从 ②-B 之后移到 ③ 之后**，并从 6 项扩到 8 项
5. **修正参考地图的两处错误判断**：Rho 是同物种而非呈现层参考；wisp-science
   有完整的多 agent 编排，「那一格没有老师」的判断不成立
6. **新增风险 R11 / R12**
