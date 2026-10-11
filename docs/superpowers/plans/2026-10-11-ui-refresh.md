# DAWN Science 页面迭代 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. 用户已授权在分支开始实施；本轮顺序实现并以真实 Electron 验证。完成后的只读代码审查按 requesting-code-review 技能执行。

**Goal:** 实现整体浅色科研工作界面，让本机直接新建、服务器连接和远端会话形成清楚的入口关系，同时完善主对话、输入框和右侧结果预览。

**Architecture:** 沿用现有 Electron、React、Nanostores、任务协议和 SSH 服务。服务器目录以连接记录为来源，与现有任务按 connectionId 合并；连接管理和会话导航共用一个服务器区。全局新建继续本机空态，远端创建继续 createTask；不重做执行核心。EcoAI 独立产品派生单独排期。

**Tech Stack:** TypeScript、React、Electron、Vite、Vitest、Playwright Electron、CSS tokens。

---

## 当前状态与范围

- 日期：2026-10-11；核对基线 HEAD `207f9ff0`、版本 `0.0.25`。原工作区为 `codex/analysis-delivery-skill`，不能据此推定等于 main。
- 已创建用户指定分支 **`页面迭代`**，复用独立工作区 `/Users/liuyue/.codex/worktrees/ui-refresh-plan/dawn-science`。原工作区不切换、不重置。
- 已完成T1–T37及多轮实际预览，用户于2026-10-11确认当前效果并授权本地提交、合并main；合并检查见[验证记录第三十五轮](2026-10-11-ui-refresh-verification.md)。不推送、不替换安装版，保留分支/工作树和隔离预览。早期验收条目与当时边界保留为历史，不代表本轮新结论。
- [最新确认规格](../specs/2026-10-11-ui-refresh-design.md) 是验收依据；10 月 10 日 UI 计划已被本计划取代。四张较新的流程图优先于旧整合图的侧栏细节。
- 不增加全局工作位置向导；不把服务器管理留在另一个重复的“远端服务器”区；不创建 EcoAI 工程。
- 不读写用户真实数据库、钥匙串、科学目录。验证使用现有隔离 dev:mock/E2E 夹具与假 SSH。
- 执行顺序：T0 → T1 → T2A → T2B → T2C → **截图检查 A** → T3 → T4 → T5 → T6 → T7 → **截图交接 B**。
- 每阶段保持聚焦 diff；本地提交/集成已获用户授权，推送仍由用户处理。阶段建议提交名仅为历史组织建议，本轮汇总提交已验收改动。

## 文件地图

| 文件 | 改动责任 |
| --- | --- |
| `src/ui/tokens.css`、`src/ui/styles.css` | 浅色外壳、连续工作面、层级、留白和响应式布局 |
| `src/ui/state/theme.ts`、`src/ui/state/accent.ts` | 新用户默认浅色/强调色，保留合法已存偏好 |
| `src/ui/state/sidebar.ts` | 仅默认宽度；折叠、拖拽与存储 key 保持 |
| 新增 `src/ui/server-navigation.ts` | 纯函数：连接目录与任务归属合并；保留无会话服务器及孤立历史 |
| 新增 `src/ui/server-sidebar.tsx` | 一个服务器导航区、连接状态/操作、远端新建和会话插槽；不发协议请求 |
| `src/ui/views.tsx` | SessionSidebar 顺序、现有任务行和批量操作接入新服务器区；对话/输入/RightDock 布局 |
| `src/ui/remote.tsx` | 紧凑 ConnectionDialog；移除重复 RemoteSection 展示，保留认证、删除、解释器入口 |
| `src/ui/App.tsx` | 连接/保存/远端创建回调接线、本机空态身份核对；不另造任务协议 |
| `src/ui/state/right-dock.ts` | 常用三面板分组；九个内部 ID 与状态语义保持 |
| `src/ui/generated-strip.tsx` | 真实本轮结果的紧凑摘要及展开 |
| `src/ui/artifacts.tsx`、`src/ui/files.tsx` | 大预览与真实文件清单；复用已有读取及生命周期 |
| `src/ui/i18n/en.ts` | 新可见文案翻译；不改协议字段 |
| `docs/DESIGN.md`、`docs/DEVELOPMENT_HISTORY.md` | 按实际完成记录契约、验证、截图和剩余限制 |

完整测试路径在各任务中列出。新服务器组件不 import views.tsx，避免与 remote.tsx 现有反向引用形成新循环；会话行由 views.tsx 的原任务行渲染器提供，不复制一套操作。

## T0：重新核对基线并保存可比截图

**Read:** `CLAUDE.md`、`docs/DESIGN.md`、`e2e/fixtures.ts`、`scripts/dev-mock.mjs`、`src/protocol/operations.ts` 的 saveConnection/connectRemote/createTask。

- [x] 执行 `git status --short --branch`、`git rev-parse HEAD`、`git worktree list`、`node --version`。预期处于上述分支，Node ≥22；若基线改变，先核对涉及文件，不重置其他改动。
- [x] 仅在当前隔离工作区缺依赖时执行 `npm ci`。运行 `npm run typecheck` 与 `npx vitest run tests/ui/design-contract.test.ts tests/ui/theme.test.ts tests/ui/accent.test.ts tests/ui/right-dock.test.ts tests/ui/sidebar-groups-persist.test.ts`，记录原有失败与通过数，不能改断言掩盖基线。
- [x] 运行 `npm run build`，然后 `npx playwright test e2e/visual.spec.ts e2e/remote-connections.spec.ts e2e/composer-sizing.spec.ts`。实际基线 48 项：31 通过、17 失败；14 项属于已有视觉基线/Skills 数量差异，3 项为项目样例与临时会话目录不匹配。类型检查、构建、144 项基线单测通过。与本轮新失败分开记录。
- [x] 使用隔离 Electron visual 夹具留存 14 张基线截图到 `tmp/ui-refresh-verification/before/`（1280×840，含亮/暗空态、对话、设置、面板）。未额外用 dev:mock 重拍远端四态；首版实施后补拍对应流程。样例和 SSH 均隔离。

## T1：整体工作面与默认浅色

**Modify:** `src/ui/tokens.css`、`src/ui/styles.css`、`src/ui/state/theme.ts`、`src/ui/state/accent.ts`、`docs/DESIGN.md`。
**Tests:** `tests/ui/theme.test.ts`、`tests/ui/accent.test.ts`、`tests/ui/design-contract.test.ts`、`e2e/theme.spec.ts`。

- [x] 在 theme 单测先将旧默认 system 的断言与 beforeEach 初值同步调整，再加入“无已存偏好且系统暗色时，新用户仍选 light”，同时保留 stored dark/light/system 的加载与系统变更测试。失败应来自旧默认 system，而不是环境 mock 不完整。
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

- [x] 将主题 atom 初始值与 loadTheme 的无记录默认统一为 light；更新相邻注释，以及读取存储失败、损坏值回落提示中的“跟随系统”为“亮色”。合法的 stored system 仍进入 resolveTheme；损坏值明确记录错误并回落 light，不能清除合法用户选择。关键替换片段为：

```ts
export const $theme = atom<ThemeChoice>("light")
// loadTheme 内，读取 localStorage 后：
let choice: ThemeChoice = "light"
if (isChoice(stored)) choice = stored
else if (stored !== null) {
  console.error(`[theme] 存储里的主题值无法识别：${JSON.stringify(stored)}，回落到亮色`)
}
```

- [x] 默认强调色起始值采用 `#208a7b`（工程初值），同步 `DEFAULT_ACCENT`、tokens 的默认种子及其已有一致性断言。已保存 accent 不强制替换；暗色和按钮文字继续用现有派生算法验证，不能把示例值当成已测对比度。
- [x] 调整亮色 surface 种子：app/sidebar 使用轻微暖灰，panel/input 使用近白；描边仍由现有中性前景混合得到。新增的阴影、间隔、圆角只在 tokens 定义并登记，不在 TSX/CSS 调用处写裸色。
- [x] 使用 `.app-shell .body` 当前 grid 和 CSS 变量增加约 8px 工作面间隔，保留 minmax 下限与侧栏/右栏开合类。主区和右侧各一层工作面；不要给正文、每个步骤再次加卡片。
- [x] 执行 `npx vitest run tests/ui/theme.test.ts tests/ui/accent.test.ts tests/ui/design-contract.test.ts`，再执行 `npx playwright test e2e/theme.spec.ts`。预期新默认与原保存偏好均通过。
- [x] 保存 1280/1440/1920 宽度分析对话、1440 本机/远端空态，以及 1280 亮暗视觉基线；复核暗色、自选强调色、焦点环与文字对比度。未单独补拍 1920 空态。

## T2A：统一服务器目录和左侧层级

**Create:** `src/ui/server-navigation.ts`、`src/ui/server-sidebar.tsx`、`tests/ui/server-navigation.test.ts`、`tests/ui/server-sidebar.test.tsx`。
**Modify:** `src/ui/views.tsx` 的 SessionSidebar、`src/ui/App.tsx` 的侧栏 props、`src/ui/remote.tsx`、`src/ui/state/sidebar.ts`、`src/ui/styles.css`、`src/ui/i18n/en.ts`。
**Regression:** `tests/ui/sidebar-groups-persist.test.ts`、`tests/ui/session-row-context.test.tsx`；`e2e/sidebar-layout.spec.ts`、`e2e/sidebar-folds-persist.spec.ts`、`e2e/sidebar-size.spec.ts`、`e2e/session-organize.spec.ts`、`e2e/session-archive.spec.ts`。

当前 SessionSidebar 只从任务计算服务器组；没有会话的已保存服务器会漏掉。先验证合并模型，再改 DOM，不只把旧远端区换位置。

- [x] 新建以下纯函数测试，运行 `npx vitest run tests/ui/server-navigation.test.ts`，预期初次因模块尚不存在而失败：

```ts
import { expect, it } from "vitest"
import type { RemoteConnection } from "../../src/protocol/index.js"
import { buildServerGroups } from "../../src/ui/server-navigation.js"

const connection = (id: string, sortOrder = 0): RemoteConnection => ({
  id, label: id, host: "example.org", port: 22, username: "researcher",
  hasSecret: false, sortOrder, createdAt: "2026-10-11T00:00:00.000Z",
  state: { kind: "idle" },
})

it("无会话的连接也常驻；本机任务不进入服务器", () => {
  const groups = buildServerGroups([connection("s1")], [{}, { connectionId: "s2" }])
  expect(groups.map(g => g.id)).toEqual(["s1", "s2"])
  expect(groups[0]?.tasks).toEqual([])
  expect(groups[1]?.connection).toBeUndefined()
  expect(groups[1]?.tasks).toEqual([{ connectionId: "s2" }])
})

it("按连接的顺序展示，多会话只对应一台服务器", () => {
  const groups = buildServerGroups([connection("s1", 2), connection("s2", 1)],
    [{ connectionId: "s1" }, { connectionId: "s1" }])
  expect(groups.map(g => g.id)).toEqual(["s2", "s1"])
  expect(groups[1]?.tasks).toHaveLength(2)
})
```

- [x] 实现纯连接/任务合并，不缓存另一份任务列表。`connection` 缺省表示连接已移除的历史分组：

```ts
import type { RemoteConnection, TaskSummary } from "../protocol/index.js"

export type ServerGroup<T> = {
  id: string
  connection?: RemoteConnection
  tasks: T[]
}

export function buildServerGroups<T extends Pick<TaskSummary, "connectionId">>(
  connections: readonly RemoteConnection[], tasks: readonly T[],
): ServerGroup<T>[] {
  const groups = new Map<string, ServerGroup<T>>()
  for (const connection of [...connections].sort((a, b) => a.sortOrder - b.sortOrder)) {
    groups.set(connection.id, { id: connection.id, connection, tasks: [] })
  }
  for (const task of tasks) {
    if (!task.connectionId) continue
    let group = groups.get(task.connectionId)
    if (!group) {
      group = { id: task.connectionId, tasks: [] }
      groups.set(task.connectionId, group)
    }
    group.tasks.push(task)
  }
  return [...groups.values()]
}
```

- [x] 在 `server-sidebar.tsx` 定义服务器区组件的输入边界，使用现有 primitives、图标、Tooltip；任务行作为插槽传入，协议操作留在 App。参数契约：

```ts
import type { ReactNode } from "react"
import type { RemoteConnection, TaskSummary } from "../protocol/index.js"
import type { ServerGroup } from "./server-navigation.js"

export interface ServerSidebarProps {
  groups: readonly ServerGroup<TaskSummary>[]
  busyId?: string
  problem?: string
  problemId?: string
  folded: (id: string) => boolean
  onToggle: (id: string) => void
  onAdd: () => void
  onEdit: (connection: RemoteConnection) => void
  onConnect: (id: string) => void
  onDisconnect: (id: string) => void
  onNewTask: (connection: RemoteConnection) => void
  renderTask: (task: TaskSummary) => ReactNode
  renderSelection: (group: ServerGroup<TaskSummary>) => ReactNode
  toolbar?: ReactNode
}
```

- [x] 组件测试使用上面的 connection 夹具与 `vi.fn()` 回调：空目录显示常驻“添加服务器”；无会话连接可展开并新建；连接中禁用该行重复动作；孤立历史可读但不能连接/新建；管理菜单可编辑/连接/断开。用 `role=region`、`aria-label=服务器`、`data-connection-id` 标识服务器区和行，状态同时包含文字与点；不使用 index 作 key。
- [x] 服务器行状态映射为 ready→已连接、connecting→连接中、idle/disconnected→未连接。`busyId` 用于禁用重复动作，不作为在线状态：创建任务或保存期间不能把已连接误标为连接中。失败原因显示在该行或可聚焦详情，保留上次连接时间。`group` 标签沿用原分组呈现，没分组的不加“未分组”假标题。
- [x] App 的连接/远端创建错误保留所属连接 ID（`connProblemId`，传入 `problemId`）；busy 清除后错误仍能归到正确服务器，新动作清除对应旧错误。没有 ID 的保存失败只放弹窗，不把一台服务器的错误展示在另一台行内。该 ID 不持久化，不修改协议。
- [x] 把 SessionSidebar 的服务器目录替换为 `buildServerGroups(connections, 全部任务)`；任务列表仍走原 `任务行(t, true)`。批量工具条沿用；只在 `group.tasks.length > 0` 时绘制分组勾选框，避免 `[].every(...)` 让空服务器显示全选。计算“最近”的收纳数只统计有任务的分组，不能因新增一个空连接改变最近显示规则。
- [x] 将真实 DOM 顺序改为新建任务→项目→服务器→最近→会话，定时/已归档移到底部工具区并保留原出现条件；设置、更新不丢失。移除 App 传入的独立 `remote` 节点和 RemoteSection 的重复展示，先用 `rg -n 'RemoteSection|服务器名' src/ui tests e2e` 核对调用，再移除无用导出/props；连接操作全部接入 ServerSidebar。
- [x] 将 `SIDEBAR_DEFAULT` 设为 248，保留200–420边界及已存值。主要选中态仅标当前会话，项目/服务器仅轻量标识上下文；不同区域同一会话不出现多个大色块。调整容器间距，按钮几何仍由 primitives/Row 管理，不通过调用点覆盖内距。
- [x] 运行新建的两个单测文件及本节列出的两个既有单测；运行本节五个 E2E。预期通过，新增空连接与原批量会话操作都可用，折叠/拖拽恢复原 key。不改变远端任务优先按 connectionId 归类的规则。

## T2B：紧凑添加弹窗与保存后连接

**Modify:** `src/ui/remote.tsx` 的 ConnectionDialog、`src/ui/App.tsx` 的 saveConnection/连接回调、`src/ui/styles.css`、`src/ui/i18n/en.ts`。
**Create:** `tests/ui/connection-dialog.test.tsx`。
**Regression:** `e2e/remote-connections.spec.ts`，新增 `e2e/server-navigation.spec.ts`。

协议已支持 `saveConnection → RemoteConnection` 和 `connectRemote({id})`，本阶段不改协议、数据库或钥匙串。当前 App 的 connectRemote 捕获错误后不抛出，不能直接 await 它并误报连接成功；新增流程直接调用协议或明确重构返回结果。

- [x] 在 ConnectionDialog 测试加入新增主动作“保存并连接”、编辑主动作“保存”、必填校验、连接期间禁止重复提交、高级设置可展开、口令不回显的断言。使用显式 `connectAfterSave: boolean` prop 决定动作文案，不能仅以 draft.id 判定：新增保存后连接失败也会拿到 ID。
- [x] 将名称置前，主机/端口同一行，随后用户名和认证方式；分组放到高级设置。复用 `conn-host/user/port/label/group/key/secret` ID；名称留空沿用用户名@主机。端口为空按22，非整数或不在1–65535范围则禁止提交并显示原因。使用真实 label/Field，不只用 placeholder。
- [x] 显式密码/SSH 私钥选择仅属于对话框 UI，不新增持久化 auth 字段；由 privateKeyPath 是否存在生成既有协议请求。已核对 `src/workbench/backend.ts` 的保存是替换记录：省略 privateKeyPath 会清掉原路径，而省略 secret 会保留原凭证；`tests/workbench/connections.test.ts` 已覆盖前一种行为。编辑未切认证时维持路径且不传 secret；切认证时将 secret 设为显式空串，随后由新输入覆盖，防止原密码被当私钥口令使用。SSH 方式要求路径；切回密码清空路径。新增对应 UI 断言并运行 `npx vitest run tests/workbench/connections.test.ts tests/ui/connection-dialog.test.tsx`，不更改协议。
- [x] 在 App 与弹窗显式接入意图状态；每个添加入口先设置 add，每个编辑入口先设置 edit，再打开 draft。失败取得 ID 不改变这一意图：

```ts
const [connIntent, setConnIntent] = useState<"add" | "edit">("add")
const connectAfterSave = connIntent === "add"
```

ConnectionDialog 接收 `connectAfterSave`，文案按该值选择“保存并连接”或“保存”，编辑解释器只在 edit 且有 ID 时显示。下列流程替换当前 saveConnection 的 try 主体；请求其他字段继续沿用原映射。关键顺序为先保存取得 ID，再连接，最后关闭：

```ts
const id = d.id ?? connDraft?.id
const saved = await client.get<import("../protocol/index.js").RemoteConnection>("saveConnection", {
  ...(id ? { id } : {}),
  label: d.label,
  ...(d.group ? { group: d.group } : {}),
  host: d.host.trim(),
  ...(d.port ? { port: d.port } : {}),
  username: d.username.trim(),
  ...(d.privateKeyPath ? { privateKeyPath: d.privateKeyPath } : {}),
  ...(d.secret === undefined ? {} : { secret: d.secret }),
})
// 保存成功即记住 ID；后面的连接失败不能使重试再次新增。
setConnDraft({ ...d, id: saved.id, hasSecret: saved.hasSecret })
await loadConnections(client)
if (connectAfterSave) {
  setConnBusy(saved.id)
  try {
    await client.get("connectRemote", { id: saved.id })
  } finally {
    setConnBusy(undefined)
  }
  await loadConnections(client)
}
setConnDraft(undefined)
```

- [x] 保留原 catch 显示真实错误、finally 清除 saving；连接失败后另外刷新状态，并保留最初错误，刷新失败不能覆盖认证错误。ConnectionDialog 不因新 ID 重挂导致表单清空，也不在每次 props 更新时重置用户输入；只在明确开新弹窗时初始化本地 draft。忙碌时禁用取消/Esc关闭，直到本次请求返回；不新增无法取消的后台自动重试。新增保存失败不进连接调用，新增连接成功不调用 createTask 或切 activeSessionId。
- [x] 编辑仍仅保存；未动口令省略 secret，修改分组不清空凭证。保留删除确认和解释器配置；探测仅由用户点击触发。取消连接失败弹窗后，已保存记录仍在服务器目录。
- [x] 更新 `e2e/remote-connections.spec.ts` 的展开/添加辅助函数：服务器 region、常驻添加按钮、新增“保存并连接”后直接等状态，不再额外点击连接。保留认证失败原因、口令不回显、编辑后口令有效、分组、断开原因和上次连接时间覆盖；编辑仍找“保存”。
- [x] 在新增 server-navigation E2E 用 fakeSsh 覆盖：错误密码→已保存但连接失败→修正后重试→同一连接 ID且只有一条记录；重复点击不重复创建；连接成功任务数不变、当前会话/草稿不变；取消失败弹窗后记录仍可见。断言底层连接记录 ID/任务计数，不只看标题文字。
- [x] 运行 `npx vitest run tests/workbench/connections.test.ts tests/ui/connection-dialog.test.tsx` 和 `npx playwright test e2e/remote-connections.spec.ts e2e/server-navigation.spec.ts`，预期新增流程、认证切换和凭证回归通过。若现有协议外出现新需求，先修订计划和协议/服务/夹具回归，不靠前端假切换交付。

## T2C：本机与服务器内新会话的衔接

**Modify:** `src/ui/App.tsx` 的回到初始画面/startRemoteSession 接线、`src/ui/views.tsx` 的 EmptyConversation/服务器上下文、`src/ui/server-sidebar.tsx`、`src/ui/styles.css`、`src/ui/i18n/en.ts`。
**Tests:** `e2e/server-navigation.spec.ts`、`e2e/remote-acp-pick.spec.ts`、`e2e/composer-ready.spec.ts`、`e2e/session-title.spec.ts`、`e2e/side-session.spec.ts`。

- [x] 在 server-navigation E2E 先写两条行为回归：从远端点全局新建，未发送不增加任务，首条消息创建无 connectionId 的本机会话；从服务器新建则形成具有该 connectionId 的任务，默认目录等于服务器实际 HOME。两种入口不串目录、草稿或 @ 文件来源。
- [x] 核对现有 `回到初始画面`（清 activeSessionId/setView）与 EmptyConversation 的目录状态。只有测试证明旧目录仍继承时，才按本轮新任务身份清空旧目录选择和引用候选；不删除原会话草稿，不把所有目录 store 重置。空页延续现有首次发送创建策略，不点击就先造一行本机空任务。
- [x] 新服务器组件的新建动作直接绑定现有任务路径：

```tsx
onNewTask={(connection) => { void startRemoteSession(connection) }}
```

保留原 `client.get<TaskSummary>("createTask", { agentId, connectionId: c.id })`，不能改为仅创建 runtime 的 createRemoteSession。保留远端 agent 能力过滤、取写权、任务列表加载、恢复错误和后台/侧边会话分支；忙碌时禁用同一行新建按钮，后端失败不回退本机任务。

- [x] 远端空会话在服务器下显示“新会话”占位标题，首次发言后继续现有自动标题。主区只加紧凑服务器上下文，不加第二张连接设置卡；输入框目录入口显示真实 remote.cwd，可查看完整路径，起点来自服务端。源码复核发现现有远端通过自然语言切换目录，没有远端目录选择器；本轮保留此执行机制，不把本机目录选择或附件 workspace 接到远端路径。全局新建与远端新建文案清楚区分。
- [x] 更新 `e2e/remote-acp-pick.spec.ts` 从整合后的服务器区点“新建远端任务”，保持 claude-acp 可用、codex-acp 不支持远端等断言。新增两个服务器同名目录的隔离用例；未连接服务器的新建会先连接一次，认证失败无孤立任务。不要删去已存在模型能力检查来使布局测试通过。
- [x] 运行本节五个 E2E。使用假 SSH，核对主区与侧边会话的连接/目录/草稿隔离。预期全局本机、连接管理、远端新建三条路径各按其职责运行。

## 截图检查 A：左侧和新建流程

- [x] 以真实 Electron 保存四张浅色截图：`local-new-task.png`、`add-server.png`、`connected-server.png`、`remote-new-session.png`，放到 `tmp/ui-refresh-verification/checkpoint-a/`。使用1440×900，与规格中的参考图对应。
- [x] 再保存1280×800长名称/多服务器图及连接失败图，检查常驻添加入口、底部工具、当前选中态和错误是否清楚。实现中先检查截图，再完成整体布局，统一交给用户审阅；不能把生成效果图当成实现截图。用户本轮已授权完整实施，无须中途再确认。

## T3：对话层级与本轮结果摘要

**Modify:** `src/ui/generated-strip.tsx`、`src/ui/styles.css`；仅必要接线修改 `src/ui/views.tsx` 和 `src/ui/App.tsx`；文案写入 `src/ui/i18n/en.ts`。
**Tests:** `tests/ui/generated-strip.test.ts`、`tests/ui/generated-strip-render.test.tsx`、`tests/ui/turn-process-view.test.tsx`、`e2e/who-answered.spec.ts`。

- [x] 先补 `GeneratedStrip` 行为测试：some 默认显示真实数量及“查看结果”，可展开到原文件 chips；none 不画；unknown 不变成“0个”；mixed 显示未知提醒；只有一个可用文件时“查看结果”仍调用已有 onOpen(path)。不能为计数绕过 `本轮产物`。
- [x] 在 GeneratedStrip 开头的所有条件 return 之前声明展开状态；默认紧凑摘要，展开后复用原 chips 与阈值。结果入口使用已有 onOpen 进入同一产物预览；如果全部缺失，显示展开明细入口和已不存在状态，不伪装成成功预览。

```ts
// 与现有 React hooks 合并导入；必须在 kind 的条件 return 之前。
const [expanded, setExpanded] = useState(false)
// 通过 kind === "some" 守卫后使用：
const firstAvailable = 产物.artifacts.find(a => a.exists !== false)
// “查看结果”只在 firstAvailable 存在时显示；调用原 onOpen。
// “展开文件列表”切换 expanded，并把原 GeneratedChip 列表放入对应区域。
```

- [x] 新摘要使用 `tf("已生成 {0} 个文件", 产物.artifacts.length)`，unknownCount 延续原提示。删除原默认英文 GENERATED 装饰标题，但保留其事实层测试。
- [x] 只改助手正文、用户气泡、思考/工具折叠区的间距与字级。沿用消息 who-name 的 `item.by ? (nameOf?.(item.by) ?? item.by) : agentId`，未知服务商显示原 ID，不猜厂家、不重写历史。
- [x] 保留助手复制、用户修改/回到这句之前以及当前用量入口。效果图里助手“编辑/回复”不新增；每轮用量继续可查看，不因追求干净而丢掉。
- [x] 运行 `npx vitest run tests/ui/generated-strip.test.ts tests/ui/generated-strip-render.test.tsx tests/ui/turn-process-view.test.tsx`；执行 `npx playwright test e2e/who-answered.spec.ts e2e/composer-history-copy.spec.ts`。
- [ ] 长回复、代码块、表格与流式状态仍待集中人工视觉验收；已有工具过程、错误、会话与输入回归通过，本轮截图以空态、分析结果和双对话为主。

## T4：输入框布局与所有入口可达

**Modify:** `src/ui/views.tsx` 的 ConversationView/EmptyConversation、`src/ui/styles.css`；不更改 composer-field 的输入状态算法。
**Tests:** `tests/ui/composer-config-pills.test.tsx`、`tests/ui/composer-compact.test.tsx`、`tests/ui/composer-field.test.tsx`；既有相关 E2E。

- [x] 先在 `e2e/composer-sizing.spec.ts` 增加主区与窄右侧对话的工具按钮可见/无重叠检查。按钮名从实际 markup 取 exact 名称；检验矩形不越出输入卡，不固定死渲染后的每一像素。
- [x] 主区与 EmptyConversation 使用相同 class 层级：输入正文、模型/推理强度/发送一行、工具一行、卡外状态。保留各自的 session/草稿身份与 handlers，不能在 JSX 移动时重挂整张输入卡。
- [x] 布局使用 flex-wrap 与 min-width:0；模型/强度/发送不被工作目录挤走。工作目录长名可省略但有 Tooltip 完整路径；不能隐藏整个工具组。布局起始规则：

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

- [x] 添加文件、工作目录、终端、优化输入及其模式下拉、生成方案都使用原组件和回调。无能力/忙碌/待答时保留真实禁用理由；不画不存在的模型和强度选项。
- [x] 卡外保留上下文比例和权限菜单。删除的只是设计图虚构的独立“标准”选择，不删除 EnhanceMenu 的 standard 或现有工作步骤模式。
- [x] 运行 `npx vitest run tests/ui/composer-config-pills.test.tsx tests/ui/composer-compact.test.tsx tests/ui/composer-field.test.tsx tests/ui/composer-render.test.ts`，再执行 `npx playwright test e2e/composer-ready.spec.ts e2e/composer-sizing.spec.ts e2e/next-prompt.spec.ts e2e/plan-mode.spec.ts e2e/user-questions.spec.ts e2e/side-session.spec.ts`。
- [ ] 真实 macOS 中文组词仍待人工体验。Enter/Shift+Enter、Tab 灰色建议、权限、计划、待答、侧边草稿等组件/Electron 回归已通过；不把自动化 composition 事件算成人工输入法验收。

## T5：右侧常用面板与更多菜单

**Modify:** `src/ui/state/right-dock.ts`、`src/ui/views.tsx` 的 RightDock/房客名、`src/ui/i18n/en.ts`、`src/ui/styles.css`。
**Tests:** `tests/ui/right-dock.test.ts`；新增 `tests/ui/right-dock-render.test.tsx`，新增 `e2e/right-dock-navigation.spec.ts`。

- [x] 先添加渲染行为测试：三常用 tab 常驻，更多菜单列出其余六项，选中审阅后当前身份可读；关闭/重开仍保留 tenant，切换仅调用 onPick、不调用 onClose。保存过的九种 tenant 都可恢复。
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

- [x] 在原状态文件导出常用清单，仅作 UI 分组，原全部房客与存储校验保持：

```ts
export const 常用房客: readonly 坞房客[] = ["files", "artifacts", "notebook"]
```

- [x] RightDock 使用常用清单绘制 tab，其余通过 primitives 的现有菜单模式绘制“更多面板”。当 tenant 在更多项中，额外显示对应当前 tab，使 aria-selected 有真实目标；更多菜单排除重复展示项。完整保留九项入口。
- [x] 仅把房客名 artifacts 分支改成 `t("结果文件")`；内部 ID 仍为 artifacts。同步产物条、工具提示、命令面板等用户可见指路文案与相应 E2E selector，不能全项目替换数据库/协议的 artifacts。
- [x] 菜单支持 Esc、键盘移动、选择后回到合理焦点；关闭/切换不新造自动开栏副作用。当前 tab 自动滚入视野逻辑适配新的 tab 集合。
- [x] 运行 `npx vitest run tests/ui/right-dock.test.ts tests/ui/right-dock-render.test.tsx`；执行 `npx playwright test e2e/right-dock-navigation.spec.ts e2e/artifacts.spec.ts e2e/settings-column.spec.ts e2e/side-session.spec.ts`。

## T6：结果清单与预览合成一个工作面

**Modify:** `src/ui/artifacts.tsx`、`src/ui/files.tsx`、`src/ui/styles.css`。
**Tests:** `tests/ui/artifacts-panel.test.tsx`、`e2e/artifacts.spec.ts`、`e2e/csv-preview.spec.ts`、`e2e/web-preview.spec.ts`。

- [x] 在 ArtifactsPanel 现有测试先增加“选中预览后仍能从紧凑文件列表切换另一文件”、读取失败可重试、迟到的 A 文件读取不能覆盖 B 的断言。沿用 focus.nonce，同一路径再次点击仍能打开。
可直接加入既有 artifacts-panel.test.tsx 的回归（沿用文件内 art/noop 夹具与挂起函数）：

```tsx
it("预览时保留文件切换，迟到读取不覆盖当前选择", async () => {
  const first = 挂起<FileContent>()
  const readFile = vi.fn((path: string) => path === "a.txt" ? first.promise
    : Promise.resolve({ kind: "text", mediaType: "text/plain", bytes: 4, text: "second" } as FileContent))
  render(<ArtifactsPanel data={{ artifacts: [art("a.txt"), art("b.txt")], unknown: [] }}
    {...noop} readFile={readFile} />)
  fireEvent.click(screen.getByRole("button", { name: "a.txt", exact: true }))
  fireEvent.click(screen.getByRole("button", { name: "b.txt", exact: true }))
  await screen.findByText("second")
  await act(async () => first.resolve({ kind: "text", mediaType: "text/plain", bytes: 5, text: "first" }))
  expect(screen.queryByText("first")).toBeNull()
  expect(screen.getByRole("button", { name: "a.txt", exact: true })).toBeTruthy()
})
```

- [x] 将原“清单或预览”呈现整理为“预览区 + 紧凑清单”，复用现有看的/内容/读取状态和 FilePreview。清单项使用真实 path/kind/exists；不写死 PDF/R/README 三行，不对所有文件强贴科研语义标签。
- [x] 预览态的紧凑长列表内部滚动；完整清单由 dock-body 滚动，不能被预览的 height/overflow 裁切。图像按可用尺寸 contain 展示。保留现有图片懒加载，不因合并布局一次加载所有 full-size 图。
- [x] 保留 PDF blob URL 生命周期、文本/CSV/图片/HTML 预览以及外部打开、在文件中查看与远端下载语义。不是所有文件都有下载按钮，读取失败不显示示例图顶替。
- [x] 运行 `npx vitest run tests/ui/artifacts-panel.test.tsx tests/ui/files-memory.test.ts`；执行 `npx playwright test e2e/artifacts.spec.ts e2e/csv-preview.spec.ts e2e/web-preview.spec.ts`。
- [ ] PDF 稳定预览未通过：有效样例在新旧 UI 均触发 renderer 终止，根因未确定，保留独立已知缺陷复现用例并默认跳过；不算验收完成。SVG 图像、CSV/网页、缺失/未知/读取失败与迟到读取已有自动化验证。详见验证记录。

## T7：整体验证、截图与交接

**Modify:** `e2e/visual.spec.ts` 及其审阅后基线、`docs/DESIGN.md`、`docs/DEVELOPMENT_HISTORY.md`。

- [x] 运行 `npm run typecheck`、`npm run build` 与上述相关 Vitest 文件合并的一次定向运行。没有新改动与失败原因时不反复扩大/重复全套测试。
- [x] 完成前述 E2E 加 `e2e/sidebar-states.spec.ts`，覆盖空态、本地与远端、面板开合、设置、定时与归档。任何本轮实际触及的额外主路径追加对应回归，记录准确通过数和失败。
- [x] 先运行 `npm run test:e2e:visual:only`，逐张看 actual/expected/diff。若失败来自设计改动，核对属于已认可区域后才执行 `npm run test:e2e:visual:update`，再跑 `npm run test:e2e:visual:only`。不靠放大容差或整页 mask 隐藏回归。
- [x] 另存 1280×800、1440×900、1920×1080 的浅色截图及暗色回归图到 `tmp/ui-refresh-verification/after/`，同时交付“空态/主对话+结果/远端/窄右侧对话”四类关键图。继续使用夹具的确定性假数据；补交添加服务器、连接失败、远端新会话、长列表与自选强调色截图。
- [x] 更新 docs/DESIGN.md 中“项目持有目录”的描述：本机沿用项目目录、普通会话用临时空间，远端展示会话真实目录、通过既有自然语言机制切换；不新增全局工作位置向导。更新设计契约和历史，只写实际完成项、验证命令、截图证据和剩余限制。运行 `git diff --check`，核对改动文件范围，不带真实数据与生成安装包。
- [x] 把截图和验证结果交给用户审阅。实现完成不等于已发布；本地提交/集成、签名打包、推送和安装替换各自按用户后续指示执行。

## 截图交接 B：整套界面验收与交接

- [x] 展示真实应用的本机空态、远端空态、完整分析对话+结果预览、窄侧边对话截图，并给出准确的测试通过数、失败原因和未验证项。
- [x] 核对所有改变来自本计划范围，文档和截图未夹带真实凭证/科学数据；运行 `git diff --check`，检查原工作区没有本次应用改动。实现完成与提交/集成/发布分别记录。

## 要求与任务对应

| 已确认要求 | 任务 |
| --- | --- |
| 整体默认浅色、已有主题和强调色不覆盖 | T1 |
| 项目/服务器在上，最近/会话在下，底部工具保留 | T2A |
| 只有一个服务器区，无会话的连接也可见 | T2A |
| 常驻带文字的添加入口，连接状态/原因/时间可读 | T2A、T2B |
| 紧凑弹窗；保存并连接；编辑只保存；失败复用ID | T2B |
| 全局本机空态，首条消息再创建，无工作位置向导 | T2C |
| 服务器下新会话、自动连接、实际HOME、目录/草稿隔离 | T2C |
| 厂家署名、精确模型、五项工具、无虚构标准下拉 | T3、T4 |
| 右侧三常用加更多，九面板可达、不自动开栏 | T5 |
| 真实本轮文件、大预览、缺失/未知/迟到读取 | T3、T6 |
| 尺寸、暗色、自选强调色、IME、灰色建议、侧边会话 | T1、T4、T7 |
| 左侧和整套界面分别截图，统一交接审阅 | 截图交接A、截图交接B |

## 本轮实施记录与范围校正

- 已完成默认浅色、单一服务器目录、本机/远端入口、紧凑保存并连接弹窗、卡外状态、三常用加更多面板、本轮摘要及大预览加紧凑文件列表。
- 已保存真实 Electron 本机空态、添加服务器、已连接、远端空态、连接失败、三种宽度分析界面、暗色、自选强调色、窄右侧对话截图。模型、科学图表和服务器均为隔离夹具，不能作为真实科研分析或实际 SSH 网络验证。
- 源码复核校正：原计划“沿用远端目录选择器”不成立，当前产品通过自然语言切换远端目录。本轮输入框增加真实 `session.remote.cwd` 的查看入口，仍由实际 cwd 事件更新，不调用本机文件夹选择、不改附件落盘路径。直接浏览并设置远端执行目录未在本轮实现。
- 代码审查发现完整结果清单被预览态 overflow 裁切；新增 60 文件端到端回归先失败后通过，修复只限制预览态。键盘菜单焦点、窄栏服务器按钮也补充检查。
- 定向单测 230 项通过，类型与构建通过。209 项桌面首轮 196 通过、13 失败；迁移旧断言并修复侧边底色后，105 项复验 102 通过，剩余两项布局断言修正后相关 21 项再验通过，另 1 项已知 PDF 缺陷跳过。各轮有重叠，不累加为独立通过数；14 组亮暗视觉基线审阅后按原配置重复两遍，28 次通过。完整命令及视觉审阅见 [验证记录](2026-10-11-ui-refresh-verification.md)。不宣称整个仓库全量通过。
- EcoAI 的独立代码迁移、应用身份/数据/更新隔离沿用 [独立产品计划](2026-10-10-ecoai-desktop-fork.md)，此次未实施。


## 第二轮：参考图的精致与舒展感（用户已授权继续修改）

沿用已确认的入口与操作关系，只校准视觉呈现：顶栏与品牌尺寸、侧栏行高和层级、标题/厂家署名/正文比例、对话段间距、输入控件分组、右侧图表默认宽度与预览清单间距。保留已有字体、主题、面板宽度偏好；保留全部输入工具、权限/用量和九个面板入口。参考图同尺寸 1586×992 验收，同时检查 1280、1440、1920、窄侧边对话、暗色与自选强调色。

先保留第一轮截图于 `tmp/ui-refresh-verification/iteration-1/`，运行状态/设计契约与构建，实测布局并审阅截图，再更新确实属于预期设计变化的视觉基线。最终刷新隔离开发预览，保护现有配置与草稿；不提交、合并、推送、打包或覆盖安装版。已知 PDF renderer 终止缺陷不计通过。


第二轮已完成视觉细化与实际预览刷新。最终相关单测 157 项、输入/字号/侧边/完整界面复验 14 项、服务器复验 4 项、视觉原容差两轮 28 次通过，类型与构建通过；具体首轮失败、修复和重叠范围见验证记录。用户视觉满意度仍待实际试用，不等于用户已验收或发布。


## 第三轮：左侧工作入口的主次层级（用户已授权，先不合并）

- 项目与服务器标题加重，条目 48px 行高、16px 名称；展开项目使用整行淡强调色，操作仍常驻。缩减项目右侧无效留白，为目录名称释放宽度。
- 最近/会话及嵌套任务使用 14px、34px 行高；分区标题、计数、辅助动作与连接说明退为次级。选中和运行/待答状态仍可辨认。
- 保留排序、折叠偏好、所有入口与键盘操作；不自动折叠历史、不覆盖宽度/主题偏好。检查 200px 最窄侧栏、常规尺寸、亮暗与自选强调色；隔离夹具补齐项目和历史并存的真实导航状态。
- 定向运行设计契约、服务器组件、侧栏尺寸/布局/状态与服务器 E2E，审阅视觉差异再更新基线，刷新隔离开发预览；不提交、合并、推送或替换安装版。

第三轮已完成并刷新隔离开发预览。96 项单测、33 个独立桌面用例、类型与构建通过。14 类视觉检查完成，亮色空态按仓库稳定帧规则单独修正后复验两遍通过；其他 13 类此前已各验两遍，具体计数与原始失败见验证记录。保持当前本机空白页、原折叠/宽度与真实配置；不提交、合并、推送或替换安装版。


## 第四轮：项目名称空间与快捷建议位置（用户已授权，仍不合并）

项目行的新建/删除合并为一个常驻“⋯”菜单，为名称腾出一颗按钮的空间；保留原新建、删除确认和目录保护。菜单使用页面层定位以避免滚动区裁切，支持键盘和关闭返回焦点。快捷建议恢复源码原有顺序，放在输入卡上方，卡高从 104px 收为约 64px，自适应列数。补菜单行为单测、迁移真实项目入口 E2E，截图检查长项目名/200px/快捷建议上下顺序，最后刷新隔离开发预览。

用户补充：输入卡过于松散、模型与工具分两层显得繁琐，新建任务字号过大。本轮同步将两处输入卡的模型/推理/发送放入准备工具共用底栏，宽屏一行、窄屏自然换行；保留全部工具、原草稿与自动增高，状态仍在卡外。新建任务使用 14px 中字重，保留 48px 触达区域。先验证宽屏底栏对齐的失败用例，再构建并复验实际布局。

第四轮完成：170 项相关单测、43 项桌面主回归、2 项额外项目/终端用例及 5 项相关复验通过（有重叠，见验证记录）；14 类视觉审阅后按原容差全量复验通过。类型与构建通过。隔离预览已刷新，返回原空白会话并恢复折叠；不提交、合并、推送或替换安装版。


## T8：最后确认稿落地（2026-10-11，用户已授权实施）

依据最后整页效果图 `exec-1a1534ee-1491-43af-902a-0f6376c6ff37.png` 和用户输入框参考。仅修改页面迭代隔离分支，不提交、合并、推送或替换安装版。

- [x] 先在 `e2e/ui-layout-final.spec.ts` 验证首页/主会话/窄侧边会话双层卡、边界对齐/折叠恢复、版本位置及同色面板；运行旧构建记录预期失败。更新现有上下文和推理位置单测，先确认失败。
- [x] `src/ui/views.tsx`：两种输入框将 `.composer-controls` 移入 `.composer-box` 末尾；工具留在 `.composer-footer` 左组、`.composer-status` 移入同底栏右组，保持原回调与菜单。
- [x] `src/ui/App.tsx`：把侧栏宽度同步到外壳，顶部按钮中心以展开宽度定位，收起后保留入口；版本从品牌搬到全局状态栏最右。
- [x] `src/ui/styles.css`：白色上层＋浅灰底栏共用外框，模型/思考选择器减去描边；左右外面板用同一 sidebar 令牌，预览用 panel 令牌；窄宽度缩短辅助按钮文字，必要时底栏两组折行，不能裁掉能力。
- [x] 迁移受影响几何断言，运行相关单测、类型检查、构建、真实 Electron 功能/布局测试和多尺寸截图；视觉基线先看 diff，确认设计变化再全量更新并重验。
- [x] 更新规格、设计契约、开发历史与验证记录；用独立现有 profile 打开真实开发预览，确认窗口呈现新的输入卡和版本位置。

## T9：项目区三级缩进（用户试用反馈）

- [x] 对比项目、最近和会话的真实页面及样式：项目行左缩进被第二轮规则取消，箭头比收纳标题靠左，内层会话也未跟随项目行分级。
- [x] 在现有完整预览用例加入父子箭头/文字的相对几何检查，旧构建先确认失败；仅修正项目头与项目内会话的左缩进，右侧菜单位置保持。
- [x] 复核默认七字名称、200px 菜单、展开/切换、多尺寸/暗色、确认稿四项布局和相关单测；检查视觉差异后按原容差重验。
- [x] 更新验证记录和开发历史，刷新独立预览给用户查看；不合并或替换安装版。

## T10：服务器跟随项目的三级层次

- [x] 用户已指定“服务器标题 → 具体服务器 → 远端任务”，与项目的父子层次保持一致；最近/会话不动。检查现有服务器父容器缩进与项目不同。
- [x] 真实 Electron 几何检查先证失败；仅调整服务器头、内层任务及新建入口缩进，状态对齐名称，保持菜单右缘和已有行为。
- [x] 验证连接/重试/草稿、三级几何、200px 菜单、项目名称及多尺寸/暗色；更新文档并刷新独立预览，不合并/替换安装版。


## T11：所有会话共用左缘（用户澄清反馈）

- [x] 用户明确“保持一个顺序”指左边对齐，不改排序；项目文件夹/服务器本身保持分级。旧构建先验证跨区会话左缘不同。
- [x] 项目列表回到 33px，远端列表扣除父容器 28px；新建远端任务文字同步会话列。最近/普通会话规则保持。
- [x] 复验跨区几何、窄栏操作、连接/草稿和多尺寸预览，更新记录并刷新独立预览；不合并/替换安装版。


## T12：服务器区与项目统一视觉规则（用户已批准）

- [x] 核对截图与源码：多选在标题外，名称继承 text 按钮下划线，连接成功重复显示状态，机器行有独立常驻灰底。
- [x] 标题内放多选和常驻加号；批量工具栏仍在下一行。名称用普通行按钮，成功只显示可访问绿点，连接中/未连接/异常继续显示说明，紧凑新建任务入口。
- [x] 验证标题布局、200px 操作、多选/连接/重试/语言与草稿，多尺寸亮暗截图；更新记录并打开独立分支预览，不合并/替换安装版。


## T13：新建远端任务收进服务器行（用户试用反馈）

- [x] 用户要求新建入口属于具体服务器，去掉独立一行；采用机器行右侧“＋”，与管理菜单并排，标题加号继续添加服务器。
- [x] 新建图标保持原无障碍名称与回调，折叠时点击会先展开；移除独立入口布局，保持状态/会话左缘。
- [x] 检查 200px 操作、折叠创建、连接/草稿、多尺寸与视觉差异；刷新独立预览，不合并/替换安装版。


## T14：PDF 与图片统一为图表卡片（用户参考图确认）

目标：单一文件头（文件图标、短文件名、放大、外部打开），浅色图表工作面，下接可滚动结果列表。PDF 不再嵌入 Chromium 阅读器；单页默认适应可用宽高，仅多页文件保留基本翻页，不把文档转存为图片或覆盖原件。不显示“正在绘制 PDF”等技术文字，等待期间仅显示小加载图标。

实现：新增 `visual-file-preview.tsx` 承载图片/PDF 文件头和模态放大；`pdf-canvas.tsx` 以随包 PDF.js 渲染已经经后端守卫返回的字节，保留原读取协议/上界与严格 CSP，离线附带 worker、字体与 CMap。`files.tsx` 转交视觉类型；`artifacts.tsx` 对视觉类型合并重复文件头，原返回/定位/下载仍可达。只在本工作树执行，不提交合并或安装。

- [x] 先写真实合法彩色多页 PDF 的 Electron 失败检查，覆盖无内嵌阅读器、真像素、放大/返回、翻页、窄面板与坏文件出错。
- [x] 实现离线 PDF 渲染和统一视觉文件头，验证资源/CSP、异步切换清理与多页，不新增读盘路径。
- [x] 跑文件/产物/主布局和相关单测，审阅真实截图；本轮不更新视觉基线，更新设计/开发记录。
- [x] 确认真实预览无进行中的发送/草稿后刷新并恢复当前会话/文件，展示分支版本，保留安装版。


## T15：项目与服务器行常驻写字入口（用户直接指定并澄清）

- [x] 项目行“新建会话”从菜单移到“⋯”之前，沿用原 onNewTaskIn；与具体服务器行统一使用用户提供的方框写字图标。服务器标题加号仍只添加/配置服务器。没有删除能力时不显示空菜单。折叠项目点击写字入口先展开再创建，与服务器一致。
- [x] 更新已有组件/侧栏入口检查，先确认直接入口在旧实现缺失；检查正确文件夹归属、窄侧栏按钮顺序/可达和多尺寸效果。
- [x] 更新设计与验证记录，刷新独立分支预览；不合并、不替换安装版，不创建真实测试会话。


## T16：会话标签与状态点美化（已由 T17 的最新参考取代）

- [x] 顶部采用浅色标签带，等宽紧凑圆角页签；选中页签白色工作面与柔和边界，移除长下划线。保留横向滚动、关闭归档、排序与同处新建。
- [x] 普通会话去掉装饰灰点，运行和未读状态继续显示；关闭按钮用现有图标并在键盘聚焦时可见。不改服务器身份标记。
- [x] 验证现有页签/归档/排序/设计契约和真实多尺寸亮暗预览，审阅视觉差异，刷新分支预览；不合并或替换安装版。


## T17：页签跟随结果文件参考，恢复实心绿点（用户最新反馈）

- [x] 取代 T16 的白色圆角卡片：浅灰方正选中底、强调色文字和底线，使用现有主题令牌，保持页签尺寸/滚动/关闭与排序能力。
- [x] 运行状态恢复原有实心 live 绿点，取消圆环；未读状态继续显示色点，不虚构空闲状态。
- [x] 定向复验和审阅亮暗截图，刷新独立预览；不合并或替换安装版。

## T18：右侧坞页签字号收小

- [x] 右侧“文件／结果文件／笔记本”等标题由 16px 收为现有 14px 辅助文字令牌，保留点击高度、选中态和运行绿点。
- [x] 验证实际构建的多尺寸亮暗界面，刷新独立分支预览；不合并或替换安装版。

## T19：侧栏顺序及服务器折叠图标统一

- [x] JSX 顺序改为项目、服务器、会话、最近；各分区原列表、排序、折叠和批量能力保持。
- [x] 服务器收纳标题及具体机器图标都跟随自身折叠状态：收起实心、展开描边，复用现有图标。
- [x] 更新既有折叠断言，核对真实 Electron 与独立预览；不合并或替换安装版。

## T20：页签悬停只绘制一层背景

- [x] 找到通用 ghost hover/active 选择器覆盖组件透明底的原因；仅页签文字按钮和关闭按钮清除内层背景，由整格控制底色。
- [x] 隔离 Electron CSS 探针复现并核对亮暗 hover/active；既有界面/视觉检查通过，刷新独立预览，不合并或替换安装版。

## T21：搜索按钮打开独立浮层

用户指定以按钮打开搜索浮层，取代顶部仿输入框和侧栏内重复搜索区。

- [x] 新建 `src/ui/search-panel.tsx`：Portal 浮层内统一输入、名字/内容模式与结果；项目和任务名称来自已有 catalog，内容复用 ContentSearchResults。自动聚焦、Esc/外部点击关闭、Tab 焦点循环和方向键/Enter 选结果，中文组词时不触发跳转。
- [x] `src/ui/app.tsx` 改为紧凑搜索按钮，搜索不再展开/过滤侧栏；名字结果沿用回到那段路由，项目结果沿用原项目选择，内容沿用打开搜到的并保留命中词后关闭浮层；命令面板仍直达按内容。关闭清空词和模式，焦点回搜索按钮。
- [x] 先以 `tests/ui/search-panel.test.tsx` 和 App 接线检查证失败，覆盖结果/焦点/退出/模式与侧栏保持；再实现。使用主题令牌完善 `src/ui/styles.css`，保持窄窗口与亮暗模式。
- [x] 运行组件/App/内容搜索/设计契约单测、类型检查和 UI 构建；更新原 `e2e/session-search.spec.ts` 的关闭预期，验证名字选择、Esc/外部退出与折叠侧栏独立性，以及原内容搜索/归档/跨项目/重启链路。审阅真实 Electron 多尺寸截图，若基线变化先看 diff 再更新并复验。
- [x] 刷新独立预览，保留用户最新页面/草稿与偏好；更新历史和验证，不提交/合并/推送或替换安装版。

## T22：搜索旁的快捷键速查

用户选择只读速查，按功能分组展示已实现的操作与组合键，不做可执行命令入口。

- [x] 新建 `src/ui/shortcut-panel.tsx`，复用 Portal 浮层布局和主题令牌，分通用、对话输入、笔记本／终端列实际键位与生效条件；Mac、Windows、Linux 分别验证修饰键；终端中断保持 Ctrl+C，不新增绑定。自动聚焦关闭按钮、Tab 循环、Esc／外部退出并恢复入口焦点。
- [x] `src/ui/icons.tsx` 增加同规格键盘图标，`src/ui/app.tsx` 在搜索右侧增加 32px 速查按钮；搜索／速查互斥，命令面板快捷键仍沿用原逻辑。`src/ui/styles.css` 补同尺寸帮助浮层，`src/ui/i18n/en.ts` 补翻译。
- [x] 先加 `tests/ui/shortcut-panel.test.tsx` 及 `e2e/palette.spec.ts` 中真实入口／位置／退出／只读／命令面板切换检查，证红再实现。
- [x] 组件、命令面板、App 搜索和设计契约定向检查、类型／UI 构建通过；真实 Electron、搜索与视觉回归，差异先审阅再更新和复验。刷新独立预览并打开速查，记录历史；不提交／合并／推送或替换安装版。


## T23：侧栏标题和尾部操作对齐，图标着色

- [x] 修改 `src/ui/views.tsx`、`src/ui/server-sidebar.tsx` 为四区标明类别；`src/ui/styles.css` 统一标题列、右内距和操作尾列，移除服务器特例。仅图标加色，项目与服务器子行同类图标沿用。`src/ui/tokens.css` 补亮暗类别色，不用告警/连接状态色替代装饰色。
- [x] 沿用设计契约及 sidebar/完整分析 Electron 检查验证折叠展开、200px 窄侧栏、亮暗和自选主题；实际截图核对四区标题/数量/尾部操作及颜色，低影响外观不新建复述实现的单测。
- [x] 类型、UI 构建和相关检查通过，视觉差异先审阅再更新并复验。刷新独立原生预览供用户查看，保留草稿/收纳状态，补历史与验证；不提交、合并、推送或替换安装版。

## T24：底部导航颜色与设置图标

- [x] 定时沿用紫灰、归档沿用暖金、设置沿用蓝灰类别令牌，亮暗自动适配；设置补现有齿轮和 name 文本结构，三项同一图标/文字列，数量留在尾部。
- [x] 相关 148 项单测、类型、构建通过；真实 Electron 19 项通过。14 张视觉差异先审阅，范围仅底部导航，再更新对应基线并复验。独立预览已刷新，保留会话状态，不提交、合并、推送或替换安装版。

## T25：修正设置齿轮轮廓

- [x] 放大真实截图确认旧齿轮中心孔偏下；改共享设置 SVG 为同心、对称八齿，保留 16px 外壳和类别色。
- [x] 类型、构建、148 项相关单测及 14 项亮暗真实 Electron 视觉检查通过；独立预览已刷新并目视确认轮廓完整，无基线更新，不合并或替换安装版。

## T26：同级导航图标的视觉尺寸

- [x] 保留四区 16px 图标盒子及现有对齐，按原 SVG 内部留白校正图形比例；圆形略收、文件夹与气泡略放，实心/描边分别校正，不影响其他使用位置。
- [x] 148 项相关单测、构建与真实 Electron 20 项检查通过；移除无必要 CSS 回退值后最终构建及完整分析用例复验通过。亮暗/展开/窄栏截图及原生收起状态已核对，未更新基线，独立预览已刷新；不合并或替换安装版。

## T27：输入框和开场卡片常驻彩色边框

- [x] 输入卡与欢迎页四张开场卡默认使用已有主题强调色边框，悬停加深，输入时保留原聚焦环；主题色随亮暗和用户强调色变化。
- [x] 91 项契约、构建及 16 项真实 Electron 聚焦/布局/亮暗检查通过；未聚焦截图和原生预览确认常驻外框。10 张预期基线差异审阅后更新并复验，刷新独立预览，不合并或替换安装版。

## T28：输入工具栏四字名称

- [x] 未选目录入口统一为“工作目录”，终端开关统一为“终端面板”，与上传文件/优化输入/生成方案保持四字；已有目录仍显示名称，补英文翻译并同步既有测试定位。
- [x] 构建、相关组件及 App 入口检查通过，原生分支预览刷新确认文案，目录和终端真实 Electron 行为核对。
- [x] 审阅亮暗文案差异后更新对应 12 张视觉基线，视觉/目录/终端组合 16 项通过（33.8s），记录边界；不合并或替换安装版。

## T29：文件预览空间及无任务结果空态

- [x] 回归先红：独立 Electron 首页结果文件无加载/无产物串入；保存过高树尺寸后 PDF/图片预览占主要空间，页面/翻页不被裁切，拖动仍有效。
- [x] `App.tsx` 按会话上下文显示结果空态，补中英文字；已有会话加载/失败/未知产物继续沿用真实状态。
- [x] `files.tsx` 根据可用高度夹树尺寸，图像模式默认树不超过约三成；当前视觉模式内手动拖动优先，不自动覆盖持久化偏好；宽坞保留左右排布。
- [x] `visual-file-preview.tsx`、`pdf-canvas.tsx`、`styles.css` 仅文件面板预览适配可用高度，留出标题/翻页；放大弹窗和结果文件卡保持现有行为。
- [x] 单测/类型/构建，真实 Electron 新回归及已有文件/产物/PDF/布局检查，亮暗截图和必要视觉基线核对；刷新并打开独立预览，补历史和验证，不合并/推送/替换安装版。

## T30：恢复页签圆点，统一导航色与定时闹钟

- [x] 在 `e2e/session-tabs.spec.ts` 增加普通圆点实际可见性与尺寸回归，旧构建先证失败；保留会话切换/拖动验证。扩展 `e2e/ui-refresh-preview.spec.ts` 核对亮暗/自选色下导航图标与强调色一致。
- [x] `styles.css` 移除普通圆点隐藏规则，保留未读/运行覆盖；导航图标统一 `--dawn-accent`，不改连接/运行标记和箭头/文字色；`tokens.css` 移除失去用途的类别色种子/别名。
- [x] `icons.tsx` 添加16px描边闹钟（双铃/表盘/脚），`views.tsx` 只替换定时入口，保留最近时钟。
- [x] 类型、UI构建、相关单测及真实Electron页签/完整分析/侧栏/视觉检查，审阅亮暗与自选色和基线差异后才更新对应基线；刷新独立窗口，记录验证，不合并/推送/替换安装版。

## T31：缩短品牌与顶栏三按钮间距

- [x] 更新 `e2e/ui-layout-final.spec.ts` 原边界对齐用例为品牌后8px及按钮间8px的几何验收，覆盖200–248px侧栏及折叠展开，旧构建先失败。
- [x] `styles.css` 顶栏gap改8px、品牌槽内容宽度并受侧栏宽度上限约束；`App.tsx` 同步注释，不改交互。
- [x] 构建、既有契约和真实Electron布局/搜索/快捷键/视觉检查；审阅截图差异后更新对应基线并复验，刷新独立预览，不合并或替换安装版。

## T32：当前会话圆点着色

- [x] 扩展已有真实会话圆点回归：当前强调色、非当前灰色、运行与未读优先；旧构建先红。
- [x] 增加 current 圆点样式，保持运行优先；构建及针对性检查，刷新隔离预览，补记录，不合并或替换安装版。

## T33：会话内查找与提问时间

- [x] 完成 [会话内搜索与提问时间实施计划](2026-10-11-conversation-search-time.md)，269项单测、类型、构建、20个独立Electron检查通过；原生窗口有未发送草稿，未重启，不合并或替换安装版。

## T34：项目内会话拖动排序

- [x] 真实Electron复现：项目内第三条拖到第一条，顺序不变；保存入口漏掉当前项目会话。
- [x] 将当前项目会话纳入排序集合；按归属项目提交顺序，拒绝跨文件夹/服务器及置顶分界拖动，沿用已有数据库排序操作。
- [x] 181项相关单测、类型与构建通过；16项真实Electron检查通过，含侧栏/顶部页签同步、重启持久化、普通及服务器会话排序。
- [x] 记录验证与历史；原生窗口仍有未发送草稿，保留不重启，下次重开生效；不合并/推送/替换安装版。

## T35：坞内“结果文件”统一命名为“产物”

- [x] 统一页签、面板标题/无障碍名称、对话跳转入口、溢出提示及首页空态，英文统一Artifacts；内部artifacts标识与存储不变。
- [x] 同步相关测试定位和当前设计文档，139项单测、类型、构建通过。
- [x] 8项真实桌面功能检查及14项亮暗视觉检查通过；审阅后更新4张文案变化的基线。原生窗口有未发送草稿，保留不重启，下次重开生效；不合并或替换安装版。

## T36：文件与产物内脚本语法高亮

- [x] 两处共用FilePreview，原来非Markdown文本均是裸pre；R/Python高亮回归先红。
- [x] 共用ScriptPreview按扩展名/MIME识别语言，使用已有Shiki及JavaScript正则引擎异步标记、双主题配色，不放宽CSP；React文本节点保留原文、缩进及CRLF，不解析脚本HTML。未知文本与Markdown行为不变。
- [x] 112项相关单测、类型及UI/Electron构建通过；21项真实Electron检查通过，覆盖R/Python两处预览、明暗切换与既有文件/产物路径；单测覆盖切换竞态、失败回退和原文保留。已审阅4张实际截图。
- [x] 补验证记录与开发历史；原生窗口仍有未发送草稿，保留不重启，下次重开生效；不合并或替换安装版。

## T37：草稿输入框Markdown语法高亮

- 设计：复用现有引用镜像，不改textarea为富文本；Markdown原始标记始终保留，标题/强调/行内代码着色，标注语言的围栏代码复用Shiki脚本配色；未闭合围栏适应输入中状态，未知语言显示原文。裸代码不猜语言，不插入围栏。两处主/首页输入与坞内会话共用。
- 边界：DOM仍拥有文字、光标及选区；只在当前文本高亮已就绪时隐藏textarea字形，光标/选区保留。组词期间隐藏镜像，原生字形正常显示；高亮异步结果不串草稿，失败保留原文并给出状态，@引用原灰底继续保留。只改页面迭代，不重启有草稿的原生窗口。
- [x] 添加先红回归：原文精确保留、Markdown/围栏R及Python、未闭合和未知语言、引用、竞态与失败；中文组词和选区、滚动对齐真实桌面验收。
- [x] 独立高亮辅助与镜像组件，沿用已有JS正则Shiki引擎；最小接入两处镜像及组词标记，不改发送协议/草稿存储。
- [x] 120项相关单测、类型及UI/Electron构建通过，32个独立真实Electron检查通过；已审阅亮色R输入和暗色窄坞Python截图。补设计与开发历史，原生有草稿保留不重启，不合并或替换安装版。
