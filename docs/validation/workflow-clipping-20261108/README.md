# 任务依赖卡片裁切修复（2026-11-08）

用户指出实际演示“任务依赖”只显示半张卡片。此前视觉验收漏掉此处，不把之前的通过结果当作本问题已通过。

## 根因与最小修复

旧侧栏小DAG节点高30px，流程工作台按1.25倍绘制，画布仅37.5px；但节点复用Button card-compact最小高度64px，实际超出26.5px。滚动容器因而裁住代次文字。数据没有缺失。

只将流程工作台的比例改为2.5，使画布/节点/坐标/连线一致，节点75px高、230px宽。共享Button、旧Team DAG、数据、调度、契约、会话和恢复逻辑不改。CSS留白实验未解决额外滚动断言问题，已撤回，最终无CSS改动。

## 回归

先加Electron断言，red.log和red/dependency-geometry.json稳定复现26.5px溢出；实际修改后canvas/node均75px、bottomOverflow0。

窄窗nearest自动滚动留下1px未滚到位，实际仍有可滚空间；记录IntersectionObserver和所有祖先坐标，而非放宽ratio=1。最终使用原生center滚动逐节点查看，校验footer命中当前节点，并实际点击核对详情标题与选中态。见narrow-first-note.md；中间失败、截图和trace原样保留。

专项Vitest两文件10项通过（unit-fixed.log）；typecheck和构建退出0。最终Electron结果见desktop-final2.log，包括900×640整卡可见、点击、展开返回、原始工具与版本核对、取消/恢复、八成员网络和旧工作台入口。没有重复全量7017项，范围明确为本次显示修复专项。

独立只读复核无P1/P2；按建议加强了footer同节点命中与真实点击检查。最终结果与截图确认后本地提交、快进到main并更新隔离演示；不推送、不发布、不替换正式App。无付费调用。历史偶发退出与PTY清理仍OPEN，1500/4000ms阈值不变。

最终Electron **4/4通过，48.6秒**（desktop-final2.log）。typecheck-final2.log、build-final2.log退出0；两文件10项专项Vitest通过。最终画布与节点均75px，节点bottomOverflow全0；滚动区没有隐藏纵向溢出。900×640逐节点严格ratio=1、footer命中当前节点、点击显示相应详情均通过。
