# 窄窗首次复验

纵向修复已通过：canvas/node均75px、overflow0。新增严格可见性断言暴露900px窗最右节点仅229/230px可见（ratio0.9956522），保留trace和截图；未放宽ratio=1。依赖图滚动区补4px内边距，给边界取整和键盘焦点留空间。footer命中改为必须属于当前节点，并实际点击plan_2确认检查面板和选中态联动。

首次本地live locator截图因稳定性等待超时，未作为产品通过证据；同版本Electron夹具稳定复现，修复前后截图和几何分别保留。

补充坐标取证（narrow-diagnostic/narrow-plan_3.json）确认1px来自自动化nearest滚动：容器scrollWidth828、clientWidth808，可滚至20，但scrollIntoViewIfNeeded停在15，节点右缘849.5比视口848.5多1px。尚有5px可滚空间，不是内容丢失或不可达。撤回无效的CSS留白实验；最终测试用浏览器原生center滚动逐卡片查看，继续保持ratio=1，且实际点击验证。产品最终仅统一图的比例，CSS无改动。
