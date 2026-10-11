# DAWN Science UI Refresh Implementation Plan

> **已被新版取代（2026-10-11）：** 见 [2026-10-11-ui-refresh.md](2026-10-11-ui-refresh.md)。本文件保留讨论历史，不再作为实施依据；新版采用本机直接新建，并将连接管理与远端会话合成一个服务器区。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. 用户尚未授权开始应用实现；本轮只保存计划。后续默认在隔离分支顺序执行，不自动派发子 agent。

**Goal:** 将已认可的整合效果图落实为统一、清楚的浅色科研工作界面，保留现有全部主要操作与会话状态。

**Architecture:** 沿用 Electron、React、Nanostores 和现有面板/协议。改动集中在 UI 令牌、布局、入口顺序、结果摘要与预览呈现；不重写会话、SSH、内核和工具运行逻辑。EcoAI 独立产品派生单独排期，本次 UI 成果可作为后续派生版本或选择性同步的共同界面。

**Tech Stack:** TypeScript、React 19、Electron 43、Vite 8、Vitest、Playwright Electron、CSS tokens。

---

## 基线与执行边界

- 计划依据：当前工作区 HEAD `207f9ff0`，package.json 版本 0.0.25。原工作区分支为 `codex/analysis-delivery-skill`；不能以分支名推定它等于 main。
- 计划所在工作区：`/Users/liuyue/.codex/worktrees/ui-refresh-plan/dawn-science`，分支 `codex/ui-refresh-plan`。此分支目前仅写文档和参考图。
- [已确认设计规格](../specs/2026-10-10-ui-refresh-design.md) 是验收依据；[批准参考图](../../design-references/2026-10-10-ui-refresh/approved.png) 用于审阅视觉，不是精确的功能清单。
- 不恢复 2026-10-04 旧的 provenance/版本化交付路线图。本次沿用现有分析脚本、注释与 README 交付方式。
- 不修改 `/Applications` 中的已安装软件，不读写用户真实数据库、凭证、科学工作目录。dev:mock 与 E2E 继续使用其隔离夹具。
- 任务顺序：T0 → T1 → T2 → T3 → T4 → T5 → T6 → T7。每阶段产出真实应用截图供审阅；文档中的复选框当前均表示尚未执行。
- 实现期间只保留聚焦改动；没有必要把 views.tsx/App.tsx 整体拆分。最后单独确认本地提交/合并与发布，不自动推送。

## 文件地图

| 文件 | 责任与改动边界 |
| --- | --- |
| `src/ui/tokens.css` / `src/ui/styles.css` | 语义颜色、工作面、字号、留白、导航和输入/面板响应式样式 |
| `src/ui/state/theme.ts` / `src/ui/state/accent.ts` | 首次使用默认浅色、默认柔和强调色；保留已保存选择 |
| `src/ui/state/sidebar.ts` | 仅初始宽度；持久化 key 与拖拽边界不改 |
| `src/ui/views.tsx` | SessionSidebar、ConversationView、EmptyConversation、RightDock、房客名；复用现有回调 |
| `src/ui/App.tsx` | 必要的 prop 接线；agentLabel、打开产物与服务器操作沿用原语义 |
| `src/ui/state/right-dock.ts` | 常用面板列表；内部九个 tenant ID、宽度状态与开合语义保留 |
| `src/ui/generated-strip.tsx` | 本轮文件紧凑摘要与展开；本轮产物计算函数不改 |
| `src/ui/artifacts.tsx` / `src/ui/files.tsx` | 紧凑清单与大预览复用，PDF/图片/文本和下载/外部打开 |
| `src/ui/i18n/en.ts` | 新可见文案对应英文；不修改协议名字 |
| `docs/DESIGN.md` / `docs/DEVELOPMENT_HISTORY.md` | 记录已实现的规则、验证和边界，不能把计划记为功能完成 |

## T0：准备实现工作区和可比基线

**Files:** 阅读 `CLAUDE.md`、`docs/DESIGN.md`、`e2e/fixtures.ts`、`scripts/dev-mock.mjs`；本任务不改应用。

- [ ] 在实施时重新检查 `git status --short --branch`、`git rev-parse HEAD` 和 `git worktree list`。若基线已前进，先核对涉及文件差异，再在独立 `codex/*` 实施工作区续做；不切换或重置他人的工作区。
- [ ] 用 `node --version` 确认 Node ≥22；仅在实施工作区缺依赖时执行 `npm ci`。不能共享另一工作区的 dist/release 目录。
- [ ] 运行 `npm run typecheck` 和 `npx vitest run tests/ui/design-contract.test.ts tests/ui/theme.test.ts tests/ui/accent.test.ts tests/ui/right-dock.test.ts tests/ui/sidebar-groups-persist.test.ts`。预期退出 0；记录现有失败，不能先改断言掩盖基线。
- [ ] 运行 `npm run build` 后执行 `npx playwright test e2e/visual.spec.ts e2e/who-answered.spec.ts e2e/composer-sizing.spec.ts`。保存真实 Electron 基线图、测试报告和运行环境；若基线失败，归因后再开展相关改动，不把旧失败算作本次成功。
- [ ] 按原夹具开 `npm run dev:mock`，保存空态、本地对话、远端对话、文件预览四种状态的截图到 `tmp/ui-refresh-verification/before/`。截图使用假服务与示例文件，不能带真实凭证。

## T1：整体工作面与默认浅色

**Modify:** `src/ui/tokens.css`、`src/ui/styles.css`、`src/ui/state/theme.ts`、`src/ui/state/accent.ts`、`docs/DESIGN.md`。
**Tests:** `tests/ui/theme.test.ts`、`tests/ui/accent.test.ts`、`tests/ui/design-contract.test.ts`、`e2e/theme.spec.ts`。

- [ ] 在 theme 单测先加入“无已存偏好且系统暗色时，新用户仍选 light”，同时保留 stored dark/light/system 的加载与系统变更测试。失败应来自旧默认 system，而不是环境 mock 不完整。
可添加到现有 theme.test.ts 的断言（沿用其 beforeEach 与 setup）：

```ts
it("首次使用默认亮色，同时保留显式跟随系统", () => {
  localStorage.removeItem(THEME_STORAGE_KEY)
  setSystemPrefersDark(true)
  expect(loadTheme()).toBe("light")
  expect(document.documentElement.classList.contains("dawn-light")).toBe(true)
  localStorage.setItem(THEME_STORAGE_KEY, "system")
  expect(loadTheme()).toBe("system")
  expect(document.documentElement.classList.contains("dawn-dark")).toBe(true)
})
```

- [ ] 将主题 atom 初始值与 loadTheme 的无记录默认统一为 light；更新相邻注释。合法的 stored system 仍进入 resolveTheme；损坏值明确记录错误并回落 light，不能清除合法用户选择。关键替换片段为：

```ts
export const $theme = atom<ThemeChoice>("light")
// loadTheme 内，读取 localStorage 后：
let choice: ThemeChoice = "light"
if (isChoice(stored)) choice = stored
else if (stored !== null) {
  console.error(`[theme] 存储里的主题值无法识别：${JSON.stringify(stored)}，回落到亮色`)
}
```

- [ ] 默认强调色起始值采用 `#208a7b`（工程初值），同步 `DEFAULT_ACCENT`、tokens 的默认种子及其已有一致性断言。已保存 accent 不强制替换；暗色和按钮文字继续用现有派生算法验证，不能把示例值当成已测对比度。
- [ ] 调整亮色 surface 种子：app/sidebar 使用轻微暖灰，panel/input 使用近白；描边仍由现有中性前景混合得到。新增的阴影、间隔、圆角只在 tokens 定义并登记，不在 TSX/CSS 调用处写裸色。
- [ ] 使用 `.app-shell .body` 当前 grid 和 CSS 变量增加约 8px 工作面间隔，保留 minmax 下限与侧栏/右栏开合类。主区和右侧各一层工作面；不要给正文、每个步骤再次加卡片。
- [ ] 执行 `npx vitest run tests/ui/theme.test.ts tests/ui/accent.test.ts tests/ui/design-contract.test.ts`，再执行 `npx playwright test e2e/theme.spec.ts`。预期新默认与原保存偏好均通过。
- [ ] 记录 1280/1440/1920 宽度的空态和对话图，并复核暗色、自选强调色、焦点环与文字对比度。通过后进入导航调整。

## T2：左侧层级与常用入口

**Modify:** `src/ui/views.tsx` 的 SessionSidebar、`src/ui/styles.css`、`src/ui/state/sidebar.ts`；只有布局接线需要时动 `src/ui/App.tsx`。
**Tests:** `tests/ui/sidebar-groups-persist.test.ts`、`e2e/sidebar-layout.spec.ts`、`e2e/sidebar-columns.spec.ts`、`e2e/sidebar-folds-persist.spec.ts`、`e2e/sidebar-size.spec.ts`。

- [ ] 在 `e2e/sidebar-layout.spec.ts` 的现有本地/远端夹具中新增 DOM 顺序检查：项目早于服务器，服务器早于最近，最近早于会话。先确认原来最近居前会让新断言失败。不要用 CSS order 做出视觉顺序与读屏顺序不一致的界面。
- [ ] 在 SessionSidebar 移动原 JSX 分组整体，保留项目组/服务器组/最近的/会话组数据、折叠 key 与任务行回调。项目下面的会话不换归属；最近仍是现有跨项目/服务器前 5 条的快捷索引。
- [ ] 通过同一个任务 ID 判断选中：项目行可用浅强调面，最近重复入口只用轻量选中标记；真实 aria 状态不随视觉减弱而删除。
- [ ] 将现有远端管理节点与定时/归档动作整理进底部工具区，设置与更新入口继续常驻。采用现有 `remote`、`onShowSchedule`、`onShowArchived` 回调；不重新实现连接管理。短窗口下中间导航区滚动，底部不压住项目/会话最后一行。
- [ ] 将 `SIDEBAR_DEFAULT` 起始值改为 248，保持 MIN=200/MAX=420 与存储读取优先；调整新建按钮、组标题、行图标和文字基线。空服务器组不画假连接；当前实际为空时仍可从远端管理新增。
- [ ] 运行 `npx vitest run tests/ui/sidebar-groups-persist.test.ts`，随后 `npx playwright test e2e/sidebar-layout.spec.ts e2e/sidebar-columns.spec.ts e2e/sidebar-folds-persist.spec.ts e2e/sidebar-size.spec.ts e2e/sidebar-collapse.spec.ts`。
- [ ] 人工核对排序、多选、重命名、归档、删除确认和拖拽手柄仍可达；左右栏各自宽度持久化，折叠后重启不重置。

## T3：对话层级与本轮结果摘要

**Modify:** `src/ui/generated-strip.tsx`、`src/ui/styles.css`；仅必要接线修改 `src/ui/views.tsx` 和 `src/ui/App.tsx`；文案写入 `src/ui/i18n/en.ts`。
**Tests:** `tests/ui/generated-strip.test.ts`、`tests/ui/generated-strip-render.test.tsx`、`tests/ui/turn-process-view.test.tsx`、`e2e/who-answered.spec.ts`。

- [ ] 先补 `GeneratedStrip` 行为测试：some 默认显示真实数量及“查看结果”，可展开到原文件 chips；none 不画；unknown 不变成“0个”；mixed 显示未知提醒；只有一个可用文件时“查看结果”仍调用已有 onOpen(path)。不能为计数绕过 `本轮产物`。
- [ ] 在 GeneratedStrip 开头的所有条件 return 之前声明展开状态；默认紧凑摘要，展开后复用原 chips 与阈值。结果入口使用已有 onOpen 进入同一产物预览；如果全部缺失，显示展开明细入口和已不存在状态，不伪装成成功预览。

```ts
// 与现有 React hooks 合并导入；必须在 kind 的条件 return 之前。
const [expanded, setExpanded] = useState(false)
// 通过 kind === "some" 守卫后使用：
const firstAvailable = 产物.artifacts.find(a => a.exists !== false)
// “查看结果”只在 firstAvailable 存在时显示；调用原 onOpen。
// “展开文件列表”切换 expanded，并把原 GeneratedChip 列表放入对应区域。
```

- [ ] 新摘要使用 `tf("已生成 {0} 个文件", 产物.artifacts.length)`，unknownCount 延续原提示。删除原默认英文 GENERATED 装饰标题，但保留其事实层测试。
- [ ] 只改助手正文、用户气泡、思考/工具折叠区的间距与字级。沿用消息 who-name 的 `item.by ? (nameOf?.(item.by) ?? item.by) : agentId`，未知服务商显示原 ID，不猜厂家、不重写历史。
- [ ] 保留助手复制、用户修改/回到这句之前以及当前用量入口。效果图里助手“编辑/回复”不新增；每轮用量继续可查看，不因追求干净而丢掉。
- [ ] 运行 `npx vitest run tests/ui/generated-strip.test.ts tests/ui/generated-strip-render.test.tsx tests/ui/turn-process-view.test.tsx`；执行 `npx playwright test e2e/who-answered.spec.ts e2e/composer-history-copy.spec.ts`。
- [ ] 截图核对长回复、代码块、表格、工具展开、错误与流式回复，不以缩小文字换留白。

## T4：输入框布局与所有入口可达

**Modify:** `src/ui/views.tsx` 的 ConversationView/EmptyConversation、`src/ui/styles.css`；不更改 composer-field 的输入状态算法。
**Tests:** `tests/ui/composer-config-pills.test.tsx`、`tests/ui/composer-compact.test.tsx`、`tests/ui/composer-field.test.tsx`；既有相关 E2E。

- [ ] 先在 `e2e/composer-sizing.spec.ts` 增加主区与窄右侧对话的工具按钮可见/无重叠检查。按钮名从实际 markup 取 exact 名称；检验矩形不越出输入卡，不固定死渲染后的每一像素。
- [ ] 主区与 EmptyConversation 使用相同 class 层级：输入正文、模型/推理强度/发送一行、工具一行、卡外状态。保留各自的 session/草稿身份与 handlers，不能在 JSX 移动时重挂整张输入卡。
- [ ] 布局使用 flex-wrap 与 min-width:0；模型/强度/发送不被工作目录挤走。工作目录长名可省略但有 Tooltip 完整路径；不能隐藏整个工具组。布局起始规则：

```css
.composer-controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--dawn-space-2);
}
.composer-controls .ws-chip,
.composer-controls .ws-entry { min-width: 0; }
```

- [ ] 添加文件、工作目录、终端、优化输入及其模式下拉、生成方案都使用原组件和回调。无能力/忙碌/待答时保留真实禁用理由；不画不存在的模型和强度选项。
- [ ] 卡外保留上下文比例和权限菜单。删除的只是设计图虚构的独立“标准”选择，不删除 EnhanceMenu 的 standard 或现有工作步骤模式。
- [ ] 运行 `npx vitest run tests/ui/composer-config-pills.test.tsx tests/ui/composer-compact.test.tsx tests/ui/composer-field.test.tsx tests/ui/composer-render.test.ts`，再执行 `npx playwright test e2e/composer-ready.spec.ts e2e/composer-sizing.spec.ts e2e/next-prompt.spec.ts e2e/plan-mode.spec.ts e2e/user-questions.spec.ts e2e/side-session.spec.ts`。
- [ ] 人工核对中文组词、Enter/Shift+Enter、Tab 接受灰色建议、@与/、附件、多行、排队/停止和终端；主区与右侧输入内容不能互串。

## T5：右侧常用面板与更多菜单

**Modify:** `src/ui/state/right-dock.ts`、`src/ui/views.tsx` 的 RightDock/房客名、`src/ui/i18n/en.ts`、`src/ui/styles.css`。
**Tests:** `tests/ui/right-dock.test.ts`；新增 `tests/ui/right-dock-render.test.tsx`，新增 `e2e/right-dock-navigation.spec.ts`。

- [ ] 先添加渲染行为测试：三常用 tab 常驻，更多菜单列出其余六项，选中审阅后当前身份可读；关闭/重开仍保留 tenant，切换仅调用 onPick、不调用 onClose。保存过的九种 tenant 都可恢复。
新增渲染测试文件的起始用例（生产菜单项统一采用 role=menuitem）：

```tsx
import { afterEach, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { RightDock } from "../../src/ui/views.js"

afterEach(cleanup)

it("常用三项直达，其他能力经更多菜单切换", () => {
  const onPick = vi.fn()
  const onClose = vi.fn()
  render(<RightDock tenant="files" width={380} onWidth={vi.fn()}
    onPick={onPick} onClose={onClose}><div>预览区域</div></RightDock>)
  for (const name of ["文件", "结果文件", "笔记本"]) {
    expect(screen.getByRole("tab", { name, exact: true })).toBeTruthy()
  }
  fireEvent.click(screen.getByRole("button", { name: "更多面板", exact: true }))
  for (const name of ["审阅", "概览", "网页", "子 agent", "团队", "对话"]) {
    expect(screen.getByRole("menuitem", { name, exact: true })).toBeTruthy()
  }
  fireEvent.click(screen.getByRole("menuitem", { name: "审阅", exact: true }))
  expect(onPick).toHaveBeenCalledWith("review")
  expect(onClose).not.toHaveBeenCalled()
})
```

- [ ] 在原状态文件导出常用清单，仅作 UI 分组，原全部房客与存储校验保持：

```ts
export const 常用房客: readonly 坞房客[] = ["files", "artifacts", "notebook"]
```

- [ ] RightDock 使用常用清单绘制 tab，其余通过 primitives 的现有菜单模式绘制“更多面板”。当 tenant 在更多项中，额外显示对应当前 tab，使 aria-selected 有真实目标；更多菜单排除重复展示项。完整保留九项入口。
- [ ] 仅把房客名 artifacts 分支改成 `t("结果文件")`；内部 ID 仍为 artifacts。同步产物条、工具提示、命令面板等用户可见指路文案与相应 E2E selector，不能全项目替换数据库/协议的 artifacts。
- [ ] 菜单支持 Esc、键盘移动、选择后回到合理焦点；关闭/切换不新造自动开栏副作用。当前 tab 自动滚入视野逻辑适配新的 tab 集合。
- [ ] 运行 `npx vitest run tests/ui/right-dock.test.ts tests/ui/right-dock-render.test.tsx`；执行 `npx playwright test e2e/right-dock-navigation.spec.ts e2e/artifacts.spec.ts e2e/settings-column.spec.ts e2e/side-session.spec.ts`。

## T6：结果清单与预览合成一个工作面

**Modify:** `src/ui/artifacts.tsx`、`src/ui/files.tsx`、`src/ui/styles.css`。
**Tests:** `tests/ui/artifacts-panel.test.tsx`、`e2e/artifacts.spec.ts`、`e2e/csv-preview.spec.ts`、`e2e/web-preview.spec.ts`。

- [ ] 在 ArtifactsPanel 现有测试先增加“选中预览后仍能从紧凑文件列表切换另一文件”、读取失败可重试、迟到的 A 文件读取不能覆盖 B 的断言。沿用 focus.nonce，同一路径再次点击仍能打开。
- [ ] 将原“清单或预览”呈现整理为“预览区 + 紧凑清单”，复用现有看的/内容/读取状态和 FilePreview。清单项使用真实 path/kind/exists；不写死 PDF/R/README 三行，不对所有文件强贴科研语义标签。
- [ ] 列表很长时仅列表内部滚动；图像按可用尺寸 contain 展示。保留现有图片懒加载，不因合并布局一次加载所有 full-size 图。
- [ ] 保留 PDF blob URL 生命周期、文本/CSV/图片/HTML 预览以及外部打开、在文件中查看与远端下载语义。不是所有文件都有下载按钮，读取失败不显示示例图顶替。
- [ ] 运行 `npx vitest run tests/ui/artifacts-panel.test.tsx tests/ui/files-memory.test.ts`；执行 `npx playwright test e2e/artifacts.spec.ts e2e/csv-preview.spec.ts e2e/web-preview.spec.ts`。
- [ ] 在真实 Electron 使用隔离 PDF 与 PNG 样例人工核对预览显示；有读不到/缺失/无文件时的明确状态图。文件区域原有宽度适配不受结果面板新布局影响。

## T7：整体验证、截图与交接

**Modify:** `e2e/visual.spec.ts` 及其审阅后基线、`docs/DESIGN.md`、`docs/DEVELOPMENT_HISTORY.md`。

- [ ] 运行 `npm run typecheck`、`npm run build` 与上述相关 Vitest 文件合并的一次定向运行。没有新改动与失败原因时不反复扩大/重复全套测试。
- [ ] 完成前述 E2E 加 `e2e/sidebar-states.spec.ts`，覆盖空态、本地与远端、面板开合、设置、定时与归档。任何本轮实际触及的额外主路径追加对应回归，记录准确通过数和失败。
- [ ] 先运行 `npm run test:e2e:visual:only`，逐张看 actual/expected/diff。若失败来自设计改动，核对属于已认可区域后才执行 `npm run test:e2e:visual:update`，再跑 `npm run test:e2e:visual:only`。不靠放大容差或整页 mask 隐藏回归。
- [ ] 另存 1280×800、1440×900、1920×1080 的浅色截图及暗色回归图到 `tmp/ui-refresh-verification/after/`，同时交付“空态/主对话+结果/远端/窄右侧对话”四类关键图。继续使用夹具的确定性假数据。
- [ ] 更新设计契约和历史，只写实际完成项、验证命令、截图证据和剩余限制。运行 `git diff --check`，核对改动文件范围，不带真实数据与生成安装包。
- [ ] 把截图和验证结果交给用户审阅。实现完成不等于已发布；本地提交/集成、签名打包、推送和安装替换各自按用户后续指示执行。

## 自检覆盖表

| 已确认要求 | 实施任务 |
| --- | --- |
| 默认整体浅色、保留旧主题/强调色选择 | T1 |
| 项目/服务器优先，最近与会话下移；底部能力保留 | T2 |
| 每轮厂商署名，输入框精确模型 | T3、T4 |
| 输入框五个入口、权限与上下文；无虚构标准 | T4 |
| 结果摘要真实、未知/缺失不丢 | T3、T6 |
| 右侧三常用加更多、九面板可达 | T5 |
| PDF/图片大预览与真实文件切换 | T6 |
| 尺寸、暗色、IME、灰色建议、侧边对话回归 | T1、T4、T7 |
| 科研脚本与说明交付不扩成内部溯源工程 | 全程边界 |

## 当前文档交付的验证口径

本轮只检查文档链接、参考图落盘、路径/测试文件存在性、Git 差异与范围。以上应用测试是未来实现的执行清单，尚未以本计划运行；不能声明视觉刷新或双产品构建已经完成。
