# 窗口响应式布局实施计划

按 writing-plans 与 executing-plans 流程在当前新分支内执行，不委派子代理。

**目标：** 仅使侧栏、正文和工作面板随窗口协调分配宽度。

**结构：** 独立纯函数统一计算宽度与上下界，App 保留比例偏好并把实际宽度交给既有面板和拖动条。现有像素偏好作为兼容回退。

**技术：** React、TypeScript、localStorage、Vitest、真实 Electron/Playwright；不添加依赖。

- [x] 校验 audit 文件哈希、类型检查及 106 条相关测试，提交修复并快进合并本地 main；创建 `codex/responsive-layout-20261120`。
- [x] 按用户收窄的范围记录设计，冻结字体/按钮/间距及正式 App 数据边界。
- [x] 新建 `e2e/responsive-workbench.spec.ts`，验证 1440→1920→2560→3840→1280→900→1440 的真实宽度、边界和控件尺寸；在旧实现上保存失败证据。
- [x] 新建 `tests/ui/workbench-layout.test.ts`，覆盖默认比例、旧偏好、宽度上下界、折叠空间、存储校验及保存失败。
- [x] 新建 `src/ui/workbench-layout.ts`；接入 `src/ui/App.tsx`、`src/ui/views.tsx`、`src/ui/settings-column.tsx`，让网格、导航、拖动条、文件单双栏使用同一实际宽度。
- [x] 执行 `npx vitest run tests/ui/workbench-layout.test.ts tests/ui/sidebar-width.test.ts tests/ui/right-dock.test.ts`、`npm run typecheck`、`npm run build`。
- [x] 执行响应式、侧栏调宽/折叠、面板标签、设置及文件预览相关 Electron 检查；实际查看多尺寸截图。涉及旧基线时先看 diff，不直接更新基线。
- [x] 复查最终差异、记录已验证范围和边界、清理登记的隔离运行数据；保留功能分支，不自动合并或推送。

最终结果：7,753 测试通过、10 跳过；核心 Electron 两批 46 通过、1 既有跳过。视觉最后两轮 27/28，深色命令面板存在最大 1 色阶的阴影比较不稳定，未修改该基线或阈值；详见 `docs/reviews/2026-11-20-responsive-layout-verification.md`。
