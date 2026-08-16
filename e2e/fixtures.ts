/**
 * e2e 的启动夹具。
 *
 * **每个用例一套全新的配置目录、数据库、工作区。** 测试之间不许有暗管道——
 * 那正是 3.3 里模块级 atom 咬过我们一次的地方（一个用例留下的
 * `activeProjectId` 让下一个用例的按钮一直禁用，表现为「点了没反应」）。
 *
 * **假推理服务器与 `npm run dev:mock` 是同一个模块。**
 * Hermes 在 `dev-mock.mjs` 的文件头明确写下这条理由：
 * 两套 mock 会各自漂移，那时「本地是好的」就不再意味着什么。
 */
import { test as base, expect, _electron, type ElectronApplication, type Page } from "@playwright/test"
import { execFileSync } from "node:child_process"
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { DEFAULT_CONFIG_YAML } from "../src/config/loader.js"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
// @ts-expect-error -- .mjs 脚本无类型声明；它同时服务于 npm run dev:mock
import { startMockInferenceServer, mockModelsJson, CANNED_REPLY } from "../scripts/mock-inference-server.mjs"

const ROOT = resolve(import.meta.dirname, "..")

export { CANNED_REPLY }

/**
 * 开一段**没有工作路径的对话**。
 *
 * **2026-08-12 又改了一次主语**（作者定案）：
 *
 * > *「我一旦直接开始对话，其实就算是一个普通的会话了……
 * > 我点击新建任务之后，依旧也是这个画面。」*
 *
 * 于是「新建任务」**不再建任何东西**，它只是把人送回初始画面；
 * **真正建出来的那一刻是第一次开口**。所以这里改成「回初始画面 → 说一句」。
 *
 * 名字**仍然没改**：几十条用例引它，而它做的事没变——
 * 开一段不设工作路径的对话。
 *
 * **首句可以指定**：这段对话的标题就取自它，而好几条用例正是盯着标题的
 * （侧栏那一行叫什么、置顶之后谁排在最前）。不给参数时用「开始」——
 * 那些用例不关心标题。
 */
export async function 开一段临时会话(page: Page, 首句?: string): Promise<void> {
  /**
   * **建出一段会话，但不产生任何对话。**
   *
   * ## 为什么不走界面那条路
   *
   * 新模型下「新建任务」不建任何东西——**开口那一刻才建**（作者定的）。
   * 于是夹具想「有一段会话」就只能替用例说一句话，而那一句会：
   *   - 在屏幕上多一轮问答；假模型的回复是**写死的同一句**，
   *     用例再说一句就有两条一模一样的，`getByText(CANNED_REPLY)` 撞 strict mode；
   *   - 占掉标题（侧栏那一行的名字取自第一句）；
   *   - 让所有数 `.turn` / `.thought` 的用例多算一轮。
   *
   * 我试过「默认发」和「默认不发」，各挂三十来条——**问题不在默认值，
   * 在于让夹具去说话本身**。
   *
   * ## 所以它直接调应用自己的 `createTask`
   *
   * 这不是后门：**那就是界面按下发送时调的同一个操作**。
   * 而「点新建任务 → 打字 → 发送 → 建出来并归类」那条真实路径，
   * 由 `task.spec.ts` 与 `sidebar-layout.spec.ts` 专门盯着——
   * **夹具是搭台子的，不是验路的**。
   *
   * @param 首句 给了就再说一句，让这段对话有个名字（侧栏那一行的标题取自它）。
   */
  const 建好了 = await page.evaluate(async () => {
    const w = window as unknown as {
      dawn: { invoke: (op: string, req: unknown) => Promise<{ data?: unknown }> }
    }
    const p = (await w.dawn.invoke("getProviders", {})) as { data?: { agents?: { agentId: string }[] } }
    const agentId = p.data?.agents?.[0]?.agentId
    if (!agentId) return false
    await w.dawn.invoke("createTask", { agentId })
    return true
  })
  if (!建好了) throw new Error("夹具里一个 agent 都没有——`开一段临时会话` 建不出会话")

  // 界面还不知道有这条——重载走的是真实的启动装配
  await page.reload()
  await page.locator(".session-list .sess-item .row").first().click()
  await page.getByPlaceholder(/今天帮你做些什么/).waitFor({ timeout: 30_000 })

  if (首句 === undefined) return
  const box = page.getByPlaceholder(/今天帮你做些什么/)
  await box.fill(首句)
  await box.press("Enter")
  await page.locator(".turns").getByText(首句, { exact: true }).waitFor({ timeout: 30_000 })
}

/**
 * **在当前项目里**开一段会话（2026-08-11）。
 *
 * 侧栏顶上那颗「新建会话」建的是**临时会话**——它有自己的独立目录，
 * 不属于任何项目（作者：*「会话其实更倾向于……没有设置项目的临时会话」*）。
 * 所以凡是要验「账本 / 产出 / git 事实」的用例都得走这条路：
 * 那些东西都是**按项目**组织的。
 */
export async function 在项目里开会话(page: Page): Promise<void> {
  /**
   * **T3-a 起，「有工作路径」就是「在项目里」**（2026-08-12）。
   *
   * 侧栏不再有「新建项目」那颗按钮，项目那一栏是**从任务的路径长出来的**。
   * 所以这里造一个带路径的任务——路径取夹具自己的 workspace，
   * 于是账本、产出、git 事实都落在同一个地方，与改之前一模一样。
   *
   * 走的是应用自己那条 IPC（`window.dawn.invoke`），**不是另造一条后门**：
   * 后门验过的东西不等于真实那条路验过。
   */
  const ws = await page.evaluate(async () => {
    const w = window as unknown as {
      dawn: { invoke: (op: string, req: unknown) => Promise<{ data?: { workspace?: string } }> }
    }
    const r = (await w.dawn.invoke("listProjects", {})) as unknown as {
      data?: { workspace: string }[]
    }
    return r.data?.[0]?.workspace
  })
  if (!ws) throw new Error("夹具里一个项目都没有——`在项目里开会话` 没有路径可用")

  await page.evaluate(async (workspace) => {
    const w = window as unknown as {
      dawn: { invoke: (op: string, req: unknown) => Promise<unknown> }
    }
    const p = (await w.dawn.invoke("getProviders", {})) as unknown as {
      data?: { agents?: { agentId: string }[] }
    }
    const agentId = p.data?.agents?.[0]?.agentId
    await w.dawn.invoke("createTask", { agentId, workspace })
  }, ws)

  // 界面还没刷新到这条新任务上——重载最省事，且走的是真实的启动装配
  await page.reload()
  const 项目 = page.locator(".proj-list .proj-item").first()
  await 项目.locator(".row").first().click()
  await 项目.locator(".proj-session-list .sess-item .row").first().click()
}

/**
 * **等到「真的进对话了」**（2026-08-12）。
 *
 * 不能只等 `回车发送` 那个输入框：**空态现在也是一张输入卡**
 * （作者：*「不要上来就是用 Deepseek 开始，而是要直接是对话窗口」*），
 * 两处占位符一模一样。只等它的话，用例会把字打进空态那一张，
 * 随后界面切进对话，**那句话凭空消失**——症状是「发了没反应」。
 *
 * `.conv-title` 只有对话那一屏有，所以它是可判定的分界。
 */
export async function 等进了对话(page: Page): Promise<void> {
  await page.locator(".conv-title").waitFor({ timeout: 60_000 })
  await page.getByPlaceholder(/今天帮你做些什么/).waitFor({ timeout: 60_000 })
}

/**
 * 用指定的 agent 开一段对话（T4，2026-08-13）。
 *
 * **走 composer 上那颗 pill，不走命令面板。** 此前这些用例按 ⌘K 点
 * 「新建会话：claude」，而那一串命令（每个 agent 一条）在 T4 里收成了
 * 一条「新建任务」——`createSession` 操作本身也从协议 5.0 里摘掉了。
 *
 * **挑 agent 的家只有一个：开口之前那颗 pill。** 这也正是人真的会走的那条路，
 * 所以换过来之后这些用例的搭台比原来更实。
 *
 * @param agent pill 菜单里那一项的名字（agent 的显示名，认不出的 cli 也在列）
 */
export async function 用某个agent开一段(page: Page, agent: RegExp): Promise<void> {
  await page.locator(".app-shell").waitFor({ timeout: 60_000 })
  // **等它可用再点**：只等 shell 可见的话，那一刻 agent 清单还没加载完，
  // 菜单里没有这一项——症状是「偶尔飘红一条，每次不是同一条」
  await expect(page.getByRole("button", { name: "新建任务" })).toBeEnabled({ timeout: 60_000 })
  await 打开agent菜单(page)
  await page.getByRole("menuitem", { name: agent }).click()
}

/** 掀开 composer 右下那颗 pill 的菜单。**菜单本身是判据**，别用别的东西代 */
export async function 打开agent菜单(page: Page): Promise<void> {
  const pill = page.locator(".composer-controls .agent-pill")
  await pill.waitFor({ timeout: 60_000 })
  await pill.locator("button").first().click()
  await page.getByRole("menu").waitFor({ timeout: 30_000 })
}

/**
 * 进设置的某一块（2026-08-12）。
 *
 * 设置改成了「左分类 / 右内容」（作者：*「看不出太大的层次」*），
 * 默认停在「外观」。**进来就找某个控件的用例都要先点到它那一块**——
 * 不点的话找不到，而那与「这个控件坏了」在报错上长得一模一样。
 */
export async function 进设置(page: Page, 分类: string): Promise<void> {
  await page.getByRole("button", { name: "设置", exact: true }).click()
  await page.getByRole("button", { name: 分类, exact: true }).click()
}

export interface DawnFixture {
  app: ElectronApplication
  page: Page
  /** 隔离目录。用例可以读数据库验证副作用 */
  dir: string
  dbPath: string
  workspace: string
  /** 假服务器收到的请求。用来证明测试**不是空转通过** */
  requests: unknown[]
  /**
   * 关掉应用再打开（同一套目录）。返回新窗口。
   *
   * **会话续接只有这样才验得了**：在同一个进程里点来点去，
   * 永远碰不到「agent 没了、对话只在内存里」那一刻。
   */
  重开: () => Promise<Page>
  /**
   * 假推理服务器的地址。
   *
   * **给「在界面上手填一个自定义端点」那类用例用**——它要往输入框里
   * 敲一个真能连上的地址，而那个地址在夹具起来之前不存在。
   * （配置文件里用 `{{MOCK_URL}}` 占位，界面里没有占位符这条路。）
   */
  mockUrl: string
}

/**
 * 让假模型确定性地**调一次工具**。
 *
 * **刻意是声明式的，不是回调。** mock 那一侧的入口是
 * `(body) => {toolName, args} | undefined`，够灵活，但两件事让它不适合直接
 * 当夹具选项：一是 Playwright 的 `test.use()` 传函数要担心跨进程；
 * 二是用例真正要说的只有「调什么、带什么参数、调几次」，
 * **把闭包写进每个用例等于把同一段状态机抄一遍**。翻译在下面做一次。
 */
export interface MockToolCallSpec {
  toolName: string
  args: Record<string, unknown>
  /**
   * 调工具**之前先说的那一句**（2026-08-15）。
   *
   * 真模型的一轮常是：说一段 → 调工具 → 再说一段。不给这一句的话，
   * 「说完了、正在跑工具」那个中间态在 e2e 里根本不存在——
   * 而那正是 `Agent is already processing` 发生的地方。
   */
  say?: string
  /**
   * 只在第一次请求时触发。**默认 true，而且几乎总该是 true**——
   * 否则模型拿到工具结果后会再调一次，一路循环到撞上限，用例表现为超时。
   */
  once?: boolean
}

export interface DawnOptions {
  /**
   * 额外的环境变量（A2）。**盖不过隔离用的那几条**——见下面 `env` 的注释。
   * 目前用来打开假 ACP agent 的几种行为（问权限、报用量）。
   */
  env?: Record<string, string>
  toolCall?: MockToolCallSpec
  /**
   * **不给基底 `models.json`**（2026-08-11）。
   *
   * 默认每个用例都写一份假服务器的目录，`DAWN_MODELS_JSON` 指向它。
   * **那让测试环境比生产环境多一样东西**，而那一样东西正好盖住过一个真实缺陷：
   * 启动时没有任何 provider 覆盖时，运行时拿到的是「不落盘」，
   * 于是后来生成的目录文件永远不会被读——作者加完 `kimi-k3`
   * 在模型选择器里找不到它，就是这个。
   *
   * 打开这一项的用例因此跑在**和真实安装一样的起点上**。
   */
  noModelsBase?: boolean
  /**
   * 把工作区变成 git 仓库并做一次初始提交。**默认 false。**
   *
   * 默认值是 false 而不是 true，有两条理由：
   * ① 现有用例（含八张视觉基线）都是在**非** git 工作区下存的，
   *   改默认值会让「产出」栏换一种说法，基线全红；
   * ② 非 git 恰好是溯源的「不知道」那一支，本身值得被守住。
   *
   * **想验「知道」那一支的用例必须显式打开它**：`git-facts.ts` 的
   * `snapshot()` 第一句是 `git rev-parse HEAD`，空仓库没有 HEAD 就抛错，
   * 探针于是返回 undefined——**用例会绿，但绿得毫无意义**，
   * 它走的是「无法确定」那一支。所以初始提交也不是可选的。
   */
  gitInit?: boolean
  /**
   * 用**本机真实的** kernelspec，而不是夹具那份假的。
   *
   * 默认隔离是为了让视觉基线确定、且不把开发者的个人路径提交进仓库。
   * 但「从界面点到真内核输出」这条只能用真内核——**它因此是机器相关的，
   * 拿不到就跳过，并说清为什么**（跳过不出声等于假装跑过）。
   */
  realKernels?: boolean
  /**
   * 用那台**假服务器**代替真 SSH（②-B · R3）。
   *
   * e2e 没有真机可连，而「添加服务器 → 连接 → 连上了」是这一批的主路径。
   * 假的只有「另一端是谁」——认证仍是真判的，口令不对照样拒。
   */
  fakeSsh?: boolean
  /**
   * 假模型「想」的内容（2026-08-12）。**给了才发。**
   *
   * 界面上那一块「想了 N 秒 / 点开看它在想什么」只有它能验——
   * 不补的话，那一整块在 mock 与 e2e 里永远不出现。
   */
  thinking?: string
  /** 想完之后停多久再开口。**演的是真实模型「想完了还不说话」那段真空** */
  thinkingHoldMs?: number
  /**
   * 写权租约的 TTL（秒）。**默认 300**。
   *
   * 调小它才验得了作者报的那条：*「点了新对话，原来的对话就不能再输入了」*——
   * 那是租约过期，按默认值要等五分钟。
   */
  leaseTtlSeconds?: number
  /**
   * 原生目录选择器返回什么（T3-b，2026-08-12）。
   *
   * **它是系统模态框，Playwright 驱动不了**。给了这个值，用例就能走
   * 「点『选一个文件夹』→ 拿到路径」那条**用户真正走的路**；
   * 不给这个口子，凡是从选目录开头的路径就只能绕过界面直接打 IPC，
   * 而那样验的是后端，不是接线——**接线正是本项目翻过车的地方**。
   */
  pickDirectory?: string
  /**
   * 原生**文件**选择器要返回哪几个（2026-08-13，那颗 `＋` 用的）。
   * 逗号分隔——环境变量只能是字符串，而它要能表达「多选」。
   */
  pickFiles?: string[]
  /**
   * 模型**不声明**收图（2026-08-13）。
   *
   * 演的是一种真实存在的配置：用户自己加的 provider，
   * 如果生成的条目里没写 `input`，图就送不出去——作者的 `kimi-k3` 正是这样。
   * 只有这么造，「附了图、按下发送、当场失败」那条路才复现得出来。
   */
  modelsWithoutImages?: boolean
  /**
   * 假模型在吐第一个字之前先停多久（2026-08-13）。
   *
   * 真实的模型在这里有几秒空窗，而界面正是在那段空窗里看起来像卡死了
   * （作者：*「kimi 的回复略微有点儿慢，导致我以为是端口卡住了」*）。
   * **没有这个旋钮，「正在等模型回话」那个记号根本没有窗口出现**，
   * 用例就只能软断言——那等于没验。
   */
  firstChunkDelayMs?: number
  /**
   * 预写一份 `providers.yaml`，而不是让 DAWN 写默认那份。
   *
   * **只给需要特殊 agent 的用例用**（例如托管一个 `bash` 当 PTY agent）。
   * 不给时保持原样——第一次启动自己写出默认配置那条路径必须被真的走一遍，
   * 那正是「装好了打不开」那个缺陷的所在。
   */
  providersYaml?: string
  /**
   * 让假模型以这个 HTTP 状态失败（2026-08-10）。
   *
   * 用来验**请求被拒时界面说不说话**——key 写错、过期、额度用完在真实使用里
   * 非常常见，而「失败必须出声」是本项目的硬规矩。
   */
  failStatus?: number
}

/** 声明式的 toolCall 规格 → mock 那一侧要的回调。**状态机只此一份** */
function toolCallHook(spec: MockToolCallSpec | undefined) {
  if (!spec) return undefined
  let fired = false
  return () => {
    if (fired && (spec.once ?? true)) return undefined
    fired = true
    // ** 不给就不带**：旧用例一个字节不变
    return { toolName: spec.toolName, args: spec.args, ...(spec.say ? { say: spec.say } : {}) }
  }
}

function initRepo(workspace: string): void {
  const run = (...args: string[]) => execFileSync("git", args, { cwd: workspace, stdio: "pipe" })
  run("init", "-q")
  // **仓库级配置，不碰全局**：CI 与开发机上都可能没有 user.name
  run("config", "user.email", "e2e@example.com")
  run("config", "user.name", "dawn-e2e")
  run("add", "-A")
  run("commit", "-qm", "e2e 基线")
}

/**
 * 一份**固定的** kernelspec，给视觉基线用。
 *
 * 路径刻意写成不存在的 `/usr/bin/e2e-python`：这份夹具从不真的起内核，
 * 它只需要让「内核」面板有确定的内容可画。**假路径比真路径诚实**——
 * 真路径会随机器变，而这里要的恰恰是不变。
 */
function seedKernelSpec(dir: string): void {
  const d = join(dir, "jupyter", "kernels", "e2e-python")
  mkdirSync(d, { recursive: true })
  writeFileSync(
    join(d, "kernel.json"),
    JSON.stringify({
      argv: ["/usr/bin/e2e-python", "-m", "ipykernel_launcher", "-f", "{connection_file}"],
      display_name: "E2E Python",
      language: "python",
    }),
  )
}

export const test = base.extend<{ dawnOptions: DawnOptions; dawn: DawnFixture }>({
  // 用例侧：`test.use({ dawnOptions: { … } })`。**不写就是现状**，
  // 这是现有 10 个 spec 一行都不用改的原因
  dawnOptions: [{}, { option: true }],

  dawn: async ({ dawnOptions }, use) => {
    const server = await startMockInferenceServer({
      toolCall: toolCallHook(dawnOptions.toolCall),
      ...(dawnOptions.thinking ? { thinking: dawnOptions.thinking } : {}),
      ...(dawnOptions.thinkingHoldMs ? { thinkingHoldMs: dawnOptions.thinkingHoldMs } : {}),
      ...(dawnOptions.failStatus ? { failStatus: dawnOptions.failStatus } : {}),
      ...(dawnOptions.firstChunkDelayMs
        ? { firstChunkDelayMs: dawnOptions.firstChunkDelayMs }
        : {}),
    })
    const dir = mkdtempSync(join(tmpdir(), "dawn-e2e-"))
    const workspace = join(dir, "workspace")
    mkdirSync(workspace, { recursive: true })
    seedKernelSpec(dir)
    writeFileSync(join(workspace, "README.md"), "# e2e 工作区\n")
    if (dawnOptions.gitInit) initRepo(workspace)
    const configPath = join(dir, "providers.yaml")
    /**
     * **`{{MOCK_URL}}` 会被换成假服务器的地址。**
     *
     * 用例想验「自己填 baseUrl 的 provider 能不能真的连上」，
     * 而那个地址在夹具起来之前不存在——留一个占位符是唯一诚实的接法。
     */
    /**
     * **测试自己提供 native agent，不再靠产品默认**（2026-08-10）。
     *
     * 发布出去的默认配置从此**不摆任何 native agent**——摆哪一家就是在替
     * 用户选（作者：*「给人一种我们只能配置 deepseek 的错觉感」*）。
     *
     * 但大部分 e2e 需要一个能对话的 native agent。**让产品默认迁就测试是本末倒置**，
     * 所以这里补一份：`shell` / `claude` / `codex` 仍来自发布的那份默认配置
     * （它们不需要 key），`ds-chat` 由测试自己加。
     */
    /**
     * **插在 `agents:` 之后，不是追加在末尾。**
     * 「新建会话」用的是列表里的第一个——追加在末尾会让默认 agent
     * 从 `ds-chat` 变成 `claude`，一堆用例的前提就悄悄变了。
     */
    const 测试用默认 = DEFAULT_CONFIG_YAML.replace(
      "agents:\n",
      `agents:
  ds-chat:
    kind: native
    provider: deepseek
    model: deepseek-v4-flash
    capabilities: [chat, exec]

`,
    )
    if (!dawnOptions.providersYaml) writeFileSync(configPath, 测试用默认)

    if (dawnOptions.providersYaml) {
      writeFileSync(configPath, dawnOptions.providersYaml.replaceAll("{{MOCK_URL}}", server.url))
    }

    const modelsPath = join(dir, "models.json")
    if (!dawnOptions.noModelsBase) {
      writeFileSync(
        modelsPath,
        JSON.stringify(
          mockModelsJson(server.url, "deepseek", undefined, !dawnOptions.modelsWithoutImages),
          null,
          2,
        ),
      )
    }
    const dbPath = join(dir, "dawn.db")

    /**
     * **同一套目录，再开一次**（会话续接的 e2e 要用，2026-08-11）。
     *
     * 抽成一个函数只为一件事：*「关掉应用，再打开，之前那段对话还在吗」*
     * ——那句话只有真重启一次才验得了。参数一个字都不能变，
     * 否则重开的就是另一个应用（另一个库、另一份配置）。
     */
    const 起一次 = () => _electron.launch({
      args: [
        join(ROOT, "dist", "electron", "main.js"),
        /**
         * **userData 也要隔离。**
         *
         * 2026-08-09 做主题时发现的洞：夹具的注释写着「每个用例一套全新的配置目录、
         * 数据库、工作区」，但 `localStorage` 不住在这三样里的任何一个，它住在
         * `app.getPath("userData")`——而那个路径此前一直是**开发机上真实的那一份**。
         *
         * 后果有两层：用例之间有暗管道；跑一次 e2e 会改掉作者自己应用里的设置。
         * 前者是这份文件开头就明令禁止的，后者更糟——测试不该有副作用溢出到测试之外。
         */
        `--user-data-dir=${join(dir, "electron-user-data")}`,
        /**
         * **把色彩配置钉死在 sRGB。**
         *
         * 2026-08-09 做视觉基线时撞出来的：把逐像素阈值收紧之后，八张基线开始
         * 随机红一两张，每次 3000–5000 像素。diff 图指得很清楚——
         * **只有饱和色的区域在变，所有中性灰一个像素都没动**，
         * 而且按钮的整块底色都在变，不只是文字边缘，所以不是抗锯齿。
         *
         * 那是 macOS 广色域屏上的行为：Chromium 有时按 sRGB 合成、有时按显示器的
         * P3 合成。**这不是应用的问题，是采集环境的问题**，所以修在这里，
         * 而不是靠调大容差把真实的颜色漂移一起放过去。
         */
        "--force-color-profile=srgb",
      ],
      env: {
        ...process.env,
        /**
         * 用例自己要加的环境变量（A2，2026-08-16）。
         *
         * **放在最前面**，好让下面那些隔离用的（`DAWN_CONFIG` 等）
         * 覆盖它——**隔离不容协商**：一条用例不该有办法把自己指回
         * 开发机真实的配置与数据库。
         */
        ...(dawnOptions.env ?? {}),
        // **不写 DAWN_CONFIG 指向已有文件**：第一次启动应当自己写出默认配置。
        // 这条路径正是「装好了打不开」那个缺陷的所在，必须被真的走一遍
        DAWN_CONFIG: configPath,
        DAWN_DB: dbPath,
        DAWN_DEFAULT_WORKSPACE: workspace,
        ...(dawnOptions.noModelsBase ? {} : { DAWN_MODELS_JSON: modelsPath }),
        // **外部 CLI 的配置也要隔离**：不指的话会去读开发机真实的 ~/.codex，
        // 那正是这份文件开头明令禁止的暗管道（2026-08-09 加模型自动发现时捅的洞）
        DAWN_CLI_HOME: join(dir, "cli-home"),
        /**
         * **临时会话的目录根也要隔离**（2026-08-11）——
         * 不隔离的话，跑一次 e2e 就往开发机的 `~/DAWN/scratch` 里建一串目录。
         * 与上面几条是同一条理由：测试不该有副作用溢出到测试之外。
         */
        DAWN_SCRATCH_ROOT: join(dir, "scratch"),
        /**
         * **内核搜索路径也要隔离**，理由与上一条完全一样，只是后果更难看：
         * 内核列表随机器而变，进了视觉基线就等于
         * ① 基线在别的机器上必然红，② **把开发者的个人路径以图片形式提交进仓库**。
         * 这里指向夹具里那一份固定的 kernelspec（见下面的 `seedKernelSpec`）。
         */
        ...(dawnOptions.realKernels
          ? {}
          : { DAWN_JUPYTER_ROOTS: join(dir, "jupyter", "kernels") }),
        ...(dawnOptions.fakeSsh ? { DAWN_FAKE_SSH: "1" } : {}),
        /**
         * **测试不把窗口弹出来**（2026-08-11，作者提）。
         *
         * 作者：*「每次测试都要弹出来，导致我什么都干不了。」*
         * 一套要跑四分钟、期间抢走十几次焦点的测试，
         * **代价会转嫁成「那就少跑几次」**——而那正是三条准入规则最怕的结局。
         *
         * `DAWN_SHOW_WINDOW=1` 可以要回来：真要盯着看它点什么的时候有用。
         */
        ...(process.env["DAWN_SHOW_WINDOW"] === "1" ? {} : { DAWN_HIDE_WINDOW: "1" }),
        ...(dawnOptions.leaseTtlSeconds
          ? { DAWN_LEASE_TTL: String(dawnOptions.leaseTtlSeconds) }
          : {}),
        /**
         * 原生目录选择器返回什么（T3-b）。**它是系统模态框，Playwright 驱动不了**。
         * 给了这个值，用例就能走「点按钮 → 选文件夹」那条**真正的路**，
         * 而不是绕过界面直接打 IPC——后者验的是后端，不是接线。
         */
        ...(dawnOptions.pickDirectory ? { DAWN_PICK_DIRECTORY: dawnOptions.pickDirectory } : {}),
        ...(dawnOptions.pickFiles ? { DAWN_PICK_FILES: dawnOptions.pickFiles.join(",") } : {}),
      },
    })

    let app = await 起一次()
    /**
     * 等第一个窗口。**30 秒是原值，2026-08-10 调回。**
     *
     * 中途一度提到 90 秒，为的是绕开三次间歇红——后来查清根因是
     * 真内核那条 e2e 会拖垮同一个 worker 里的下一条（已隔离，见
     * `e2e/kernel-session.spec.ts`）。实测单独连启 5 次，每次稳定 1.0 秒；
     * **30 秒仍有 30 倍余量**。
     */
    /**
     * **主进程说的话要能被看见**（2026-08-11）。
     *
     * 此前只转发了渲染进程的 console。于是主进程里的
     * 「[启动失败] …」「[workbench] … 失败」这类消息**一个字都到不了终端**——
     * 而 `firstWindow` 挂起那笔账查了十几次，每次卡住的正是这里：
     * 一个 30 秒的超时，没有任何线索说它到底在等什么。
     */
    app.process().stderr?.on("data", (b: Buffer) => {
      const 文本 = b.toString().trimEnd()
      if (文本) console.error("[主进程]", 文本)
    })

    const 接线 = (p: Page) => {
      // 渲染进程的报错要能被看见——这条通路本身就是 2026-08-08 补的
      p.on("console", (m) => {
        if (m.type() === "error") console.error("[渲染进程]", m.text())
      })
      return p
    }

    /**
     * **把界面语言钉在中文**（2026-08-13）。
     *
     * 产品的默认是**英文**（作者定的）。而这套用例里有五百多处
     * 「按名字找按钮」，全是中文名——不钉住的话它们会一次性全红，
     * **而红成一片就没人看得出哪条是真问题**。
     *
     * 这不是一条后门：它写的就是应用自己在人点「中文」时写的那一格
     * （`localStorage["dawn.global.lang"]`），键名与值都取自 `i18n/index.ts`。
     *
     * **英文那一面另有专门的用例盯着**（`i18n.spec.ts`）：
     * 走一遍主路径，断言该出现的英文都在、且屏幕上一个汉字都没有。
     * 这里钉中文，是为了让「别的东西坏没坏」这个问题仍然答得出来。
     */
    const 钉住中文 = async (p: Page) => {
      await p.addInitScript(() => {
        try {
          localStorage.setItem("dawn.global.lang", "zh")
        } catch {
          /* 存不进去就算了：那时整个应用都会退回默认，用例自然会红 */
        }
      })
      // `addInitScript` 只对之后的导航生效，首帧已经画过了，所以要重来一次
      await p.reload()
    }

    let page = 接线(await app.firstWindow())
    await 钉住中文(page)

    /**
     * **关掉再打开**（会话续接的 e2e 要用，2026-08-11）。
     *
     * *「之前聊过的，也无法连续上」*这句话，只有真重启一次才验得了：
     * 在同一个进程里点来点去，永远碰不到「agent 没了、对话只在内存里」那一刻。
     */
    const 重开 = async (): Promise<Page> => {
      await app.close().catch(() => {})
      app = await 起一次()
      app.process().stderr?.on("data", (b: Buffer) => {
        const 文本 = b.toString().trimEnd()
        if (文本) console.error("[主进程]", 文本)
      })
      page = 接线(await app.firstWindow())
      await 钉住中文(page)
      return page
    }

    await use({
      app,
      page,
      dir,
      dbPath,
      workspace,
      requests: server.requests,
      mockUrl: server.url,
      重开,
    })

    /**
     * **关不掉要出声。** 上一版是 `.catch(() => {})`——静默吞掉。
     * 2026-08-10 追一个「下一条用例启动挂住」的 bug 时才发现：
     * 真出问题时这里一个字都不说，线索直接没了。
     * 吞掉异常仍然是对的（一条用例的收尾失败不该让它变红），**但不能不吭声**。
     */
    await app.close().catch((err: unknown) => {
      console.error("[e2e] Electron 关不掉：", err instanceof Error ? err.message : String(err))
    })
    await server.close()
    rmSync(dir, { recursive: true, force: true })
  },
})

export { expect } from "@playwright/test"

/** 读数据库验证副作用。**界面说发生了，账本上也得有** */
export async function readRuns(dbPath: string): Promise<Record<string, unknown>[]> {
  const { default: Database } = await import("better-sqlite3")
  const db = new Database(dbPath, { readonly: true })
  try {
    /**
     * **把 `has_error` 与 `terminal_reason` 也取出来**（2026-08-11）。
     *
     * 「跑挂的代码有没有被如实记成失败」正要看这两列——
     * 少取一列，用例就只能验到 `status`，而 `status=failed` 却
     * `has_error=0` 这种**自相矛盾的行**照样会溜过去。
     */
    return db
      .prepare(
        /**
         * **`id` 与 `parent_run_id` 也要取**（B1，2026-08-17）。
         *
         * 外部 agent 经 MCP 调我们的工具时，那条 Run 挂在哪一轮上
         * 是路线 B 的立身之本——不取这两列，用例只能验到「有这么一条」，
         * 而**「它挂对了地方」照样验不出来**。
         */
        "SELECT id, parent_run_id, request_type, origin, status, has_error, terminal_reason FROM runs ORDER BY started_at",
      )
      .all() as Record<string, unknown>[]
  } finally {
    db.close()
  }
}
