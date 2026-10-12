# RP 与交互卡片细节优化验证记录

分支 `codex/rp-card-polish`，起点 `main` / `ec42c5f9`。工作树 `/Users/liuyue/.codex/worktrees/rp-card-polish/dawn-science`。本记录按开发阶段追加，最终验收与本地集成范围见末节。开发期间未改主工作树、安装版或真实用户数据库。

## 范围核对

最初 RP/卡片阶段的生产变更涉及 App 的品牌资产引用、SVG 资产类型声明、卡片绘制 CSS 和两枚主题派生令牌；后续服务器状态与时间调整及最终反馈补齐见下方对应记录。

`git diff --exit-code main -- src/ui/question-card.tsx src/ui/permission-card.tsx src/ui/views.tsx src/ui/primitives.tsx packaging` 无差异。卡片结构、字号、内距、行高、最大高度、滚动、按钮位置、回调、默认选择和快捷键未改。

## 已执行检查

- 修改前：设计契约、提问/权限组件 112 项通过；真实 Electron 提问、权限和几何探针 14 项通过。
- 修改后：设计契约、提问/权限、views、theme 五文件 189 项通过；`npm run typecheck` 和 `npm run build` 通过。views 中原有 jsdom canvas 提示仍存在，真实浏览器 canvas 验证通过。
- 最终生产代码上的真实 Electron：提问 6 项、权限 6 项、完整分析多尺寸预览 1 项、前后几何探针 2 项通过。几何结果比较包含每个标题、选项、输入区、操作区及按钮的相对坐标和尺寸；提问覆盖亮、暗、自选色、900px 窄窗，确认卡覆盖亮暗，两类卡片均与修改前完全相等。
- 新增真实绘制对比度用例：白、黄、黑、紫四种强调色 × 亮暗两主题。初版 65% 强调色产生浅色白主题 2.32:1、浅色黄主题 2.44:1、暗色黑主题 1.97:1，先复现失败；改为 30% 强调色与 70% 正文后，八组为 6.22–15.08:1，均超过 4.5:1。顶栏 RP 资产实际加载成功，槽为 32×32px。

## 视觉基线审阅

首次视觉检查 14 张均出现预期 RP 差异，同时暴露旧基线仍显示 0.0.25、当前 main 为 0.0.26 的末位数字差异。逐张计算像素范围并审阅 diff，除左上 x17–47/y13–44 和右下 x1257–1263/y791–800 外，两张只有同一导航位置一个蓝通道相差 1 的抗锯齿像素。没有其他布局或内容变化。差异证据在 `tmp/rp-card-polish-verification/visual-differences/`。

审阅后重存 14 张基线，未修改视觉容差或遮罩。第一轮复验暗色设置栏失败 467 像素，集中在未改的输入框顶部描边；单跑仍失败，而两次实际稳定截图逐像素完全一致，确认更新时捕获了未稳定帧。按 CLAUDE.md 的现有规则，用稳定 actual 替换该张基线后单跑及完整复验。

最终单跑暗色设置栏 1/1 通过；随后新增 RP/对比度用例和全部亮暗视觉 15/15 通过（28.0s）。结合先前最终生产构建上的 15 项功能/几何检查，共 30 项独立 Electron/视觉核对通过。最终 `git diff --check` 通过，主工作树仍在 main 且干净。

## 复现与产物

```bash
npm test -- tests/ui/design-contract.test.ts tests/ui/question-card.test.tsx tests/ui/permission-card.test.tsx tests/ui/views.test.tsx tests/ui/theme.test.ts
npm run typecheck
npm run build
npx playwright test e2e/user-questions.spec.ts e2e/permission.spec.ts e2e/ui-refresh-preview.spec.ts e2e/decision-card-polish.spec.ts e2e/visual.spec.ts
git diff --check
```

前后截图、几何 JSON、对比度 JSON 与临时探针保存在 `tmp/rp-card-polish-verification/`（忽略目录）。探针需临时复制回 `e2e/rp-card-polish-verify.spec.ts`，先在原构建设置 `DAWN_POLISH_PHASE=before` 保存基线，再于新构建运行默认 after；不要将临时探针作为依赖忽略文件的长期测试提交。长期回归用例是 `e2e/decision-card-polish.spec.ts`。

未运行全仓库单测、真实付费模型或 Windows/Linux 真机；本次仅 UI 绘制，无后端或跨平台运行时变更。保留分支和工作树，不提交、合并、推送或发布。

## 服务器连接信息同排补充

用户新增截图反馈：状态及上次连接时间应与机器名同排。沿用当前分支完成，仅改 `server-sidebar.tsx` 的展示结构和服务器局部 CSS。连接中/未连接文本与简短时间移到名称行；条目 ≤240px 时收起时间，≤200px 时改用可访问状态点，保留名称、新建和管理入口。完整时间/原因补到原名称悬停说明；失败全文仍在名称左缘下方显示并按可用宽度换行，不隐藏诊断。

- 新增 `e2e/server-status-alignment.spec.ts`，先在原构建确认失败：状态中线比名称低 34.5px。实现后又发现 200px 窄栏仅给名称 10px，改为状态点后通过。测试还修正了编辑表单保存入口和侧栏宽度动画的等待，未改应用交互或放宽断言。
- `npx vitest run tests/ui/server-sidebar.test.tsx tests/ui/design-contract.test.ts`：2 文件、99 项通过；`npm run typecheck`、`npm run build`：退出码均为 0。
- `npx playwright test e2e/server-status-alignment.spec.ts e2e/server-navigation.spec.ts e2e/remote-connections.spec.ts:70 e2e/remote-connections.spec.ts:102 e2e/remote-connections.spec.ts:341 e2e/remote-connections.spec.ts:356 e2e/remote-connections.spec.ts:383 e2e/remote-connections.spec.ts:1000 e2e/remote-connections.spec.ts:1084 e2e/remote-connections.spec.ts:1100 e2e/remote-connections.spec.ts:1126`：15/15 通过（30.8s）。覆盖服务器连接/断开/失败、中英文状态、时间持久化、短长名称、悬停、窄栏操作、多选和远端会话。假 SSH 与推理沿用仓库现有测试夹具，未连接用户实际服务器。
- 实际亮暗/常规/加宽/最窄侧栏截图已审阅；证据在 `tmp/rp-card-polish-verification/server-status-*.png`，局部预览为 `server-status-row.png` 和 `server-status-failure-row.png`。本轮不更改视觉基线或容差。
- 日志为 `tmp-server-status-{red,unit,types,build,e2e,regression}.log`（忽略目录）；原 RP/交互卡片成果保留，主工作树 `main` 仍干净，不提交、合并、推送或安装。

## 最新反馈：侧栏仅表达连接状态，不铺技术错误

本节替代上一节中“错误全文显示/悬停可读”的展示结论。用户明确表示不需要 `All configured authentication methods failed` 等技术原因，只关心连接状态。因此移除服务器行和列表顶部的原始错误、名称悬停中的原因行。底层 reason、连接/重试/新建逻辑及添加/编辑表单不变；名称同排状态、时间说明、窄栏状态点保留。

- 更新原侧栏失败单测，在旧实现上先确认 1/8 失败，随后侧栏/设计契约 99/99 通过；类型检查与构建退出码 0。
- 更新已有服务器失败 E2E 断言为真实 disconnected + 未连接，并确认行内及悬停均无技术错误。新增同排检查补失败不增加行高，修改口令后真实重试恢复 ready。服务器导航与上述两条连接检查共 8/8 通过（21.4s）；另原连接层级、中英切换、最窄菜单 3/3 通过，共 11 项独立 Electron 检查。
- 已审阅实际失败行、亮暗及窄栏截图。最新预览为 `tmp/rp-card-polish-verification/server-status-simple-failure-row.png`，其余截图统一 `server-status-simple-` 前缀，旧截图保留为开发证据。
- 日志统一 `tmp-server-status-simple-{red,unit,types,build,e2e,language}.log`。不改视觉基线/容差，不跑全仓库或真实 SSH；不提交、合并、推送或安装。

## 时间格式补充

用户批准保留时间并统一短单位。服务器调用既有相对时间函数时指定一分钟内为 `<1m`，其余分钟/小时/天边界和未来/无效时间处理沿用原逻辑，其他调用不改变。状态与时间增加中点分隔；悬停及可访问说明复用 `年月日时分()`，明确写“上次成功连接”及本地绝对时间，同步英文文案。

- 新格式单测先复现 1 项失败，然后格式/侧栏/双语/设计契约共 136/136 通过；类型检查及构建退出码 0。
- `npx playwright test e2e/server-status-alignment.spec.ts e2e/remote-connections.spec.ts:70 e2e/remote-connections.spec.ts:349 e2e/remote-connections.spec.ts:993`：4/4 通过（12.6s），包括刚连接后 `<1m`、历史记录 `3d`、中英文状态、完整日期悬停、亮暗/窄栏、技术错误不回显及修改口令后重试。
- 已审阅 `tmp/rp-card-polish-verification/server-status-time-failure-row.png` 与窄栏绝对时间悬停截图；其余截图同为 `server-status-time-` 前缀。日志为 `tmp-server-time-{red,unit,types,build,e2e}.log`。
- 未改变视觉基线或容差，未跑全仓库或真实 SSH，不提交、合并、推送或安装。

## 合并前最终验收与授权范围

用户明确要求“测试一下，没问题，提交，合并入 main”，本轮范围为本地提交与快进集成，不推送、发布、安装或重启现用应用。先前章节的“不提交/未跑全仓库”仅描述各开发阶段，不代表最终验收状态。保留原优化分支与验证工作树，避免此前预览链接和忽略目录中的证据丢失。

最终只读审查发现一项 P2：隐藏服务器行原始错误后，只有本机 ACP 模型时点击新建会话会无反馈，创建任务失败的侧栏路径也不再出声。新增真实 Electron 用例先在旧构建确认失败；随后在原 `startRemoteSession` 的失败分支补简短双语状态栏提示，保留内部 connProblem 与原坞内详细反馈。无兼容模型时明确提示到设置添加，侧栏行与悬停仍不展示认证/超时技术文本。复审确认问题解决，无剩余 Important/Critical 项。

最终代码的实测结果：

- `npm test`：364/364 文件通过，4257 项通过、10 项原有跳过（76.83s）。原有 jsdom canvas 提示仍存在；真实 Electron canvas 对比度检查正常。
- `npm run typecheck`、`npm run build`：退出码 0。
- `npx playwright test e2e/user-questions.spec.ts e2e/permission.spec.ts e2e/ui-refresh-preview.spec.ts e2e/decision-card-polish.spec.ts e2e/visual.spec.ts e2e/server-status-alignment.spec.ts e2e/server-navigation.spec.ts e2e/remote-connections.spec.ts:70 e2e/remote-connections.spec.ts:102 e2e/remote-connections.spec.ts:334 e2e/remote-connections.spec.ts:349 e2e/remote-connections.spec.ts:376 e2e/remote-connections.spec.ts:993 e2e/remote-connections.spec.ts:1077 e2e/remote-connections.spec.ts:1093 e2e/remote-connections.spec.ts:1119`：44/44 通过（1.5m），含 14 张亮暗视觉，无新增基线更新、容差或遮罩改动。
- `git diff --check`：通过；提问/权限组件、views、primitives、packaging 和 protocol 相对起点无差异。
- 日志：`tmp-rp-final-{all-unit,types,build,electron,review-red}.log`（忽略文件）。主工作树合并前干净，main 与分支起点相同，采用本地 `--ff-only` 集成；合并后另对主线构建、相关单测和关键 Electron 路径复验，结果在最终交付消息及主工作树日志中记录。
