# 路线图与当前步骤验收

范围：用户批准继续在 `codex/analysis-route` 实施；三栏布局不变。主视图采用“路线图＋当前步骤”，替代此前“总览→详情→文件”的主导航。不合并、不推送、不替换安装版。本轮未提交新的科研计算。

## 实现与证据边界

- 图按真实 dependencies 分层连线，复用团队的深度算法；并行节点同层显示，窄坞纵向排列时并行节点仍并列。四层及以上可在图内滚动。
- 图上颜色/文字表示交付、处理、等待确认、依赖等待、阻塞/复核和记录进度。查看节点使用独立外框，下方展示“正在查看”，可回到当前步骤。
- 处理中来自当前主槽最后一条合法 continue 意图与随后真实的未结束回复、运行中工具或待回答提问；浏览、解释和搜索不产生运行标记。计算派生字符串，正文流式变化不会使外壳反复更新。
- 下方为执行动态/本步产物；输入、参考和审查记录可折叠。版本默认隐藏于路线选项/路线调整记录，历史只读，历史路径预览不冒充旧文件内容或旧文件事实。
- 复用共享文件预览：报告、CSV、R、PNG、PDF；图始终存在。保留关闭、返回、阅读展开还原、失败重试和焦点恢复。修正 PDF 容器收缩导致画布过矮，以及首次打开时焦点带动步骤区滚动的问题。
- 浏览位置按会话/连接/目录/路线隔离，仅保留最多 50 个渲染期作用域；关闭重开坞恢复浏览，重启恢复业务路线，不承诺跨应用重启恢复本地浏览位置。

## 自动化

- `npm run typecheck`：通过。
- `npm run build`：通过；现有大 chunk 提示仍在，无构建失败。
- 全量 `npx vitest run`：428 个测试文件，4,765 通过、10 跳过。
- `npx playwright test e2e/analysis-route.spec.ts e2e/analysis-route-map.spec.ts e2e/pdf-preview-stability.spec.ts`：6 项真实 Electron 用例通过。包括原始 IPC/MCP/路线簿/文件写入/真正重启、参考选择与跳过恢复不额外调用模型、草稿保留、依赖阻塞、PDF 可用高度、真实工具回合选中分离、真实提问等待与回答后解除。
- 新图测试曾先出现 3 项 RED；后续实测抓出无文字工具回合漏标、待回答提问被当成空闲、初次聚焦滚动和窄坞节点挤碎，均修正并回归。
- 日志：`/tmp/dawn-route-map-typecheck.log`、`/tmp/dawn-route-map-build.log`、`/tmp/dawn-route-map-full-final.log`、`/tmp/dawn-route-map-e2e-final.log`。

这些工程用例使用共享 mock 推理服务，不证明科研结论正确。活动用例实际执行了 `sleep 4` 以检验工具回合；等待用例实际调用 ask_user_question 并从主对话回答，没有绕开原有权限或方案门。

## 实际窗口与探索

- 最终可见预览：`tmp/route-map-preview-8pgzgh4j/`。独立数据库、配置、profile、workspace；复用此前真实 R 草地合成数据案例的快照，路线最新第 7 版、3 步已交付、11 个登记文件。未重新运行原分析，未触碰旧预览中的用户草稿。
- 实际检查 CSV 26×5 表、R 脚本、Markdown 报告、PNG 图；从文件返回、切节点、关闭重开坞和阅读展开还原，图保持可见，草稿保持。报告缺失错误在 QA 副本内临时改名触发，恢复后“重试”成功；历史文件事实使用历史提示，执行动作隐藏。
- `tmp/route-map-preview-gigmjil9/` 是隔离 QA 副本。为验证 PDF，临时向其最新路线增加原已存在的 3 个 PDF 引用，实际 PDF stage 为 284px 高，随后还原路线簿。原案例和最终可见预览没有补登记。
- 同一 QA 副本另暂存 5 步并行/合流、阻塞与长标题夹具：S1→S2/S3，S2/S3→S4→S5；实际经界面查看，480px 亮色、280px 英文暗色无面板横向溢出。窄坞并行层两列各约 96px，完整标题在下方详情中换行。布局夹具同样已还原。
- 图的状态与浏览框、分支箭头、文件名/关闭键、阅读还原、历史只读提示、明暗和中英均单独实看。无页面异常；没有将“已交付”改称科学验证完成。
- QA 截图：`tmp/route-map-preview-zn_nzhmr/02-map-detail.png`、`03-csv.png`、`04-figure.png`；`tmp/route-map-preview-gigmjil9/01-pdf-existing-scientific-output.png`、`02-parallel-branches-480.png`、`04-branches-280-parallel.png`；`tmp/route-map-e2e/active-viewing-other-step.png`、`awaiting-user-confirmation.png`。旧于末次微调的截图保留作过程证据，不替代最终预览。

原始输入 SHA-256 仍为 `eac00917bafff9e972ff23574488c6a7fedc44b7130525f7cdaacc0fe1562d1b`。本地主目录 main 仍为 `fecaaad4`，当前独立分支 HEAD 仍为 `3a37fb84`，本轮修改留在该分支工作区等待视觉反馈。
