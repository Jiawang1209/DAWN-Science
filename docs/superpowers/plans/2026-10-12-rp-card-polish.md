# RP 品牌与交互卡片细节优化实施计划

**Goal:** 保持现有功能和布局，以已认可预览润色交互卡片并统一顶栏 RP。

**Architecture:** 在现有工作树分支内执行；App.tsx 只替换品牌图形，styles.css 只改绘制属性，tokens.css 提供主题派生描边。提问与权限 TSX、业务状态和协议不改。

**Tech Stack:** React、Vite、CSS 主题令牌、Vitest、真实 Electron Playwright。

## 步骤

- [x] 建立 `codex/rp-card-polish`，复用已安装依赖；既有设计契约、提问与权限组件基线 112 项通过。
- [x] 构建修改前产物；运行 `npx playwright test e2e/user-questions.spec.ts e2e/permission.spec.ts` 并保存卡片原布局证据。
- [x] App.tsx 导入 `../../packaging/icon.svg`；原 `.brand-mark` 换为相同尺寸的装饰图片，保留品牌按钮回调。
- [x] tokens.css 定义 `--dawn-decision-stroke`；styles.css 让两类卡片使用现有 input 工作面、柔和边界及 bordered 阴影；提问选项采用 accent-soft 和 inset 描边，自由输入使用 app 表面。仅改背景、边框色、阴影和选中标题色。
- [x] 在 DESIGN.md 登记品牌资产与卡片约束；更新 DEVELOPMENT_HISTORY.md 的范围和实测证据。
- [x] 运行 `npm test -- tests/ui/design-contract.test.ts tests/ui/question-card.test.tsx tests/ui/permission-card.test.tsx`、`npm run typecheck`、`npm run build`。
- [x] 运行原提问、权限、完整界面与亮暗视觉检查；审阅截图差异后更新 RP 与当前主线版本号基线，复验视觉检查。
- [x] 核对 `git diff --check` 与最终 diff，无业务或布局改动；向用户交付分支、截图和验证结果，保留分支及工作树。

本次没有行为变化，使用既有真实流程验证不回归。只读审查后新增 `e2e/decision-card-polish.spec.ts`，保护 RP 资产可用性与选中文字在极浅/极深自选色下的真实绘制对比度；先复现初版 65% 强调色混色比例失败，再验证修正。若基线失败，先定位并与 main 对照，不调整容差掩盖问题。

视觉差异审阅补充：主线版本为 0.0.26，现有基线仍显示 0.0.25。14 张差异除 RP 槽外仅有右下版本号末位，另两张有一个蓝色通道相差 1 的导航抗锯齿像素；对应基线同步当前主线版本，不改遮罩/容差。
