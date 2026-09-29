/**
 * 命令注册表（①-B″ · U1）。
 *
 * 对标 Hermes：
 * > ***"One action, one home."*** *A command may have keyboard, palette, and visible
 * > affordances, but they **invoke the same action and state**.
 * > **Do not fork behavior per entry point.**"*
 *
 * ## 这句话怎么才算真的做到
 *
 * 靠自觉是做不到的。做这个 Task 之前，`App.tsx` 里 `() => setView("settings")`
 * **写了四遍**，中止与打开项目还各自带着实现——命令面板再加一个入口就是第五份。
 *
 * 所以纪律落在结构上：
 *
 * ```
 * Actions   ← 动作只有这一份定义，按钮与命令都从它取
 *    ↑
 * buildCommands()   ← run 只许转发，不许有实现
 * ```
 *
 * **`run` 里出现任何实现（`client.` / `await` / `setView(`）就是开了第二个家**，
 * 由 `tests/ui/design-contract.test.ts` 扫描拦下。
 *
 * ## 不可用的命令留在列表里
 *
 * Rho 的规矩：**缺失不等于不支持。** 一条命令搜不到时，人无法区分
 * 「没有这个功能」和「它现在用不了」。所以不可用的命令照样列出来，
 * 并写明原因——与协议层 `ProvenanceLink` 必须给 `incompleteReason` 是同一条纪律。
 */
import type { SessionSummary } from "../protocol/index.js"
import type { ThemeChoice } from "./state/theme.js"
import type { View } from "./state/view.js"

import { t, tf, msgid } from "./i18n/index.js"
import { 优化输入快捷键 } from "./enhance.js"
/**
 * 命令的分组。**它既是键又是标签**（2026-08-13 双语时才看清这一点）。
 *
 * 所以它在这里保持中文原文——那是**键**；翻译发生在渲染处
 * （`palette.tsx` 里的 `t(g.group)`）。在这儿翻的话，
 * 同一个组在两种语言下会变成两个不同的键，分组当场散成两半。
 *
 * `msgid()` 只是让扫描看得见这几句；它在运行时什么都不做。
 */
export const COMMAND_GROUPS = [
  msgid("会话"),
  msgid("模型"),
  msgid("项目"),
  msgid("视图"),
  msgid("设置"),
] as const
export type CommandGroup = (typeof COMMAND_GROUPS)[number]

export interface Command {
  id: string
  title: string
  group: CommandGroup
  /** 额外的搜索词。**人记得的往往不是我们起的那个名字** */
  keywords?: string
  /** 展示用的快捷键提示，例如 `⌘K`。不在这里绑定，只是告诉人有这么回事 */
  keybinding?: string
  run: () => void
  /**
   * 不可用的原因。**缺省 = 可用。**
   *
   * 不可用时必须填，且要说清是哪一种不可用——「没有会话」和
   * 「没有正在进行的回合」是两件事，笼统写「不可用」等于没说。
   */
  unavailable?: string
}

/**
 * 界面上所有动作的**唯一定义处**。
 *
 * 按钮、快捷键、命令面板三者拿到的是同一个对象里的同一个函数。
 * 想加一个入口，就往这里加一个字段——**而不是在调用点再写一遍**。
 */
export interface Actions {
  openSettings(): void
  /** 直接开到设置里的某一类（2026-08-23，扩展那五屏从侧栏并进设置之后，⌘K 仍要一步到位） */
  openSettingsSection(id: string): void
  showConversation(): void
  showProjectPanel(): void
  /**
   * **新建任务**（T4，2026-08-13 由 `newSession(agentId)` 改成这个）。
   *
   * 任务模型下「开一段新对话」只有一个动作：回初始画面，
   * **在那儿挑 LLM、挑工作目录，开口那一刻才真的建出来**。
   * 此前面板里是「新建会话：DeepSeek / 新建会话：kimi …」一串——
   * 那是任务模型之前的形状，而且它**绕过了工作目录那一步**，
   * 建出来的永远是普通会话。
   */
  newTask(): void
  abort(): void
  /** 删除当前会话。**与侧栏那个 × 是同一个动作**——一个动作一个家 */
  deleteSession(): void
  /** 掀开／收起底部终端。**与 composer 上那颗是同一个动作** */
  toggleDock(): void
  setTheme(choice: ThemeChoice): void
  /** 在坞里另开一段对话（侧边对话，2026-09-24）。**与坞格里那颗「另开一段」是同一个动作**，并把坞打开到那一格 */
  newSideChat(): void
  /** 开坞并切到「对话」那一格。永远是开，不是切换 */
  openSideChat(): void
  /** 打开侧栏搜索并切到「按内容」（会话全文搜索，2026-09-27）。**与侧栏那两颗切换是同一件事** */
  openContentSearch(): void
  /** 压缩当前这段的上下文（2026-09-27）。**与仪表弹层「现在压缩」、输入框里的 `/compact` 是同一个动作** */
  compactContext(): void
  /** 回到上一句之前：对最后一句自己说的话点那颗「回到这句之前」（2026-09-27） */
  rewindLast(): void
  /** 先出方案开 / 关（2026-09-27）。**与输入卡那颗开关、`/plan` 是同一个动作** */
  togglePlan(): void
  /**
   * 改写主区输入框里这一版草稿（2026-09-29）。**与输入卡上那颗「优化输入」、⌘⇧E 是同一个动作**：
   * 转给那颗按钮自己的「去增强」（草稿、档位、撤回栈都在它身上），不另写一份。
   */
  enhanceInput(): void
}

export interface CommandContext {
  actions: Actions
  agents: readonly string[]
  session: SessionSummary | undefined
  /** agent 还在说话。**只有这时「中止」才有意义** */
  busy: boolean
  view: View
  /** 底部终端开着没有。**决定那条命令说「打开」还是「收起」** */
  dockOpen?: boolean
  /** 坞里为什么没处另开（没有「地方」）。缺省 = 能开 */
  sideNewUnavailable?: string | undefined
  /** 这一段的先出方案：开没开、为什么用不了（native 还没报上 `dawn.plan` 时由 App 给原因） */
  plan?: { on: boolean; unavailable?: string | undefined } | undefined
  /**
   * 当前这段说过话没有（至少一句自己说的话）。「回到上一句之前」据它（spec §2.1）。
   * **缺省 = 没说过**：缺失不等于能用——按了才说「没有可回退的」就是一条点了没反应的命令。
   */
  saidSomething?: boolean | undefined
  /** 当前这段正在回退（从预览到做完）。缺省 = 没有 */
  rewinding?: boolean | undefined
  /**
   * 主区那颗「优化输入」报上来的状态（`$优化输入`）。**缺省 = 眼前没有主区输入框**——
   * 缺失不等于能用：按了没反应的命令比列成不可用更坏。
   */
  enhance?: { unavailable?: string | undefined } | undefined
}

const THEMES: readonly { choice: ThemeChoice; label: string }[] = [
  { choice: "system", label: msgid("跟随系统") },
  { choice: "light", label: msgid("亮色") },
  { choice: "dark", label: msgid("暗色") },
]

/** 中止为什么用不了。**分清是哪一种，笼统写「不可用」等于没说** */
function abortUnavailable(ctx: CommandContext): string | undefined {
  if (!ctx.session) return t("还没有会话")
  /**
   * **这句话此前是假的**（2026-08-09 · ①-C 修）。
   *
   * 原文写「外部 CLI 的回合边界不可观测」——那是 PTY 时代的实情。
   * `cli` 会话的回合边界**恰恰是可观测的**（`result` / `turn.completed`）。
   *
   * 真正的原因是另一件事：**中止能力因 CLI 而异**——
   * codex 一轮一个进程，杀掉它就是「只停这一轮」；
   * claude 是长驻进程，杀掉等于**结束整个会话**。
   * 界面只知道 `kind: "cli"`，分不清是哪一个，所以暂不开放。
   *
   * **不可用的理由必须是真的**：一句听起来合理但不成立的解释，
   * 比「不可用」三个字更坏——它会让人据此做错判断。
   */
  if (ctx.session.kind === "pty") return t("终端的中止是按 Ctrl-C，不走这个命令")
  if (ctx.session.kind === "cli") {
    return t("外部 CLI 里只有部分能「只停这一轮」，界面还分不清是哪一种，暂未开放")
  }
  if (!ctx.busy) return t("当前没有正在进行的回合")
  return undefined
}

export function buildCommands(ctx: CommandContext): Command[] {
  const { actions, agents } = ctx
  const out: Command[] = []


  // ── 会话 ─────────────────────────────────────────────────────────
  /**
   * **一条，不是每个 agent 一条**（T4，2026-08-13）。
   *
   * 此前是「新建会话：DeepSeek / 新建会话：kimi …」一串。它有两个毛病：
   * 配三家就把面板刷掉三行；而且**它绕过了工作目录那一步**——
   * 建出来的永远是普通会话，人再想设目录得回头再找入口。
   *
   * 现在与侧栏那颗「新建任务」是同一个动作：**回初始画面**，
   * 在那儿挑 LLM、挑目录，开口那一刻才建。
   *
   * **没有可用 agent 时不藏起来**：藏起来的话，搜不到的人分不清
   * 是没这个功能还是配置有问题。
   */
  out.push({
    id: "task.new",
    title: t("新建任务"),
    group: "会话",
    keywords: "new task session 新建",
    run: () => actions.newTask(),
    ...(agents.length === 0 ? { unavailable: t("配置里还没有可用的 agent") } : {}),
  })

  /**
   * 搜对话内容（2026-09-27）。命令面板只是一个入口：它把侧栏搜索打开、切到「按内容」，结果在侧栏里——一个动作一个家。
   */
  out.push({
    id: "session.searchContent",
    title: t("搜索对话内容"),
    group: "会话",
    keywords: "search content transcript history full-text 全文 历史 搜 找 代码",
    run: () => actions.openContentSearch(),
  })

  const abortWhy = abortUnavailable(ctx)
  out.push({
    id: "session.abort",
    title: t("中止当前回合"),
    group: "会话",
    keywords: "stop abort 停止",
    run: () => actions.abort(),
    ...(abortWhy ? { unavailable: abortWhy } : {}),
  })

  /**
   * 先出方案（2026-09-27，D4）。**不可用时照样列着**：搜「方案」搜不到的人分不清是没这功能还是这段会话用不了。
   * `run` 只转发——与输入卡那颗、`/plan` 是同一个动作。
   */
  const 方案为何不能 = !ctx.session
    ? t("还没有会话")
    : ctx.session.kind === "kernel" || ctx.session.kind === "pty"
      ? t("这段不是和模型的对话，没有生成方案")
      : ctx.session.kind !== "native"
        ? t("这个 agent 不归 DAWN 管工具，生成方案用不了")
        : ctx.plan?.unavailable
  out.push({
    id: "session.plan",
    title: ctx.plan?.on ? t("退出生成方案") : t("生成方案：先写方案，批了再做"),
    group: "会话",
    keywords: "plan mode 方案 预注册 生成方案 先出方案 /plan",
    run: () => actions.togglePlan(),
    ...(方案为何不能 ? { unavailable: 方案为何不能 } : {}),
  })

  /**
   * 优化输入（2026-09-29）。坞那么窄时那颗只剩一颗星、名字只在悬停提示里——悬停才出现的东西要另有入口，这是那个入口。
   * `run` 只转发；草稿与撤回都归那颗按钮。**不可用照样列着**，原因由那颗按钮报（没 key / 框里空着 / 正在改写）。
   */
  const 优化为何不能 = ctx.enhance ? ctx.enhance.unavailable : t("眼前没有输入框，回到对话再用")
  out.push({
    id: "composer.enhance",
    title: t("优化输入"),
    group: "会话",
    keywords: "enhance improve rewrite prompt 优化 改写 增强 提示词",
    keybinding: 优化输入快捷键,
    run: () => actions.enhanceInput(),
    ...(优化为何不能 ? { unavailable: 优化为何不能 } : {}),
  })

  /**
   * 删除当前会话。
   *
   * **它在侧栏上已经有一个入口了**，为什么还要一条命令：
   * 那个 × 只在当前行与悬停时显形——作者 2026-08-10 反馈「会话还是不能删除」，
   * 查下来按钮一直是好的，**只是看不见**。多一个入口不是重复，
   * 是让「能不能发现它」不再取决于鼠标在哪。
   *
   * `run` 走的是同一个 `actions.deleteSession`，不是第二份实现。
   */
  out.push({
    id: "session.delete",
    title: t("删除当前会话"),
    group: "会话",
    keywords: "delete remove 删除 移除",
    run: () => actions.deleteSession(),
    ...(ctx.session ? {} : { unavailable: t("还没有选中会话") }),
  })

  /**
   * 压缩上下文（2026-09-27，spec §2.2）。仪表弹层与 `/compact` 之外的第三条路——**不可用照样列出**，写明是哪一种不可用。
   */
  const 压缩why = !ctx.session
    ? t("还没有会话")
    : ctx.session.kind === "kernel" || ctx.session.kind === "pty"
      ? t("这段不是和模型的对话，没有上下文可压")
      : ctx.session.kind !== "native"
        ? t("外部 agent 自己管上下文，DAWN 压不了")
        : ctx.busy
          ? t("这一轮还在跑，做完再压缩")
          : undefined
  out.push({
    id: "session.compact",
    title: t("压缩上下文"),
    group: "会话",
    keywords: "compact context /compact 压缩 上下文 摘要",
    run: () => actions.compactContext(),
    ...(压缩why ? { unavailable: 压缩why } : {}),
  })

  /**
   * 回到上一句之前（2026-09-27，回退这一轮 spec §2.1）。每句自己说的话下面那颗之外的第二条路——
   * **不可用照样列出**，写清是哪一种：笼统写「不可用」等于没说。
   * 「这段还没说过话」由 App 从转录派生一个布尔交进来（`saidSomething`），不是按下时才说。
   * 正在回退排在「在跑」前面：那一刻真正挡着的是回退本身。
   */
  const rewindWhy = !ctx.session
    ? t("还没有会话")
    : ctx.session.kind !== "native"
      ? t("只有内置对话能回退")
      : ctx.rewinding
        ? t("正在回退，等它做完")
        : ctx.busy
          ? t("agent 还在跑，停下之后才能回退")
          : !ctx.saidSomething
            ? t("这段还没说过话")
            : undefined
  out.push({
    id: "session.rewind",
    title: t("回到上一句之前"),
    group: "会话",
    keywords: "rewind undo checkpoint 回退 撤销",
    run: () => actions.rewindLast(),
    ...(rewindWhy ? { unavailable: rewindWhy } : {}),
  })

  /**
   * 坞里的对话（侧边对话，2026-09-24）。坞的「对话」页签是常驻入口，这两条是它在面板里的另一条路——
   * 右键「放进坞里」是看不见的，不能是唯一的入口。**不可用照样列出来**，写明为什么（没有「地方」）。
   */
  out.push({
    id: "side.new",
    title: t("在坞里另开一段对话"),
    group: "会话",
    keywords: "side dock chat 侧边 坞 对话 并行",
    run: () => actions.newSideChat(),
    ...(ctx.sideNewUnavailable ? { unavailable: ctx.sideNewUnavailable } : {}),
  })
  out.push({
    id: "side.open",
    title: t("打开坞里的对话"),
    group: "会话",
    keywords: "side dock chat 侧边 坞 对话",
    run: () => actions.openSideChat(),
  })

  // ── 项目 ─────────────────────────────────────────────────────────
  /**
   * **「打开文件夹为新项目」没有了**（T4，2026-08-13）。
   *
   * 任务模型下项目**是从任务的工作目录长出来的**，不再是一个要先建、
   * 再往里放会话的东西。这条命令走的是老路（`openProject` 操作），
   * 它建出来的项目在侧栏上甚至不会出现——**侧栏那一列是按任务的路径合并的**。
   *
   * 想开一个新目录：新建任务 → 选工作目录。**一个动作一个家。**
   */
  /**
   * **「概览」2026-08-20 从整屏搬进坞**（作者定的）。这条命令留着——
   * 命令面板是它除坞标签条外的另一条路，动作变成打开坞的那一格。
   * 标题跟着页签走：**同一个东西在两处必须叫同一个名字**。
   */
  out.push({
    id: "project.panel",
    title: t("概览"),
    group: "项目",
    keywords: "overview runs 历史 账本 项目概览",
    run: () => actions.showProjectPanel(),
  })

  // ── 视图 ─────────────────────────────────────────────────────────
  if (ctx.view !== "conversation") {
    out.push({
      id: "view.conversation",
      title: t("返回对话"),
      group: "视图",
      keywords: "back conversation",
      run: () => actions.showConversation(),
    })
  }
  /**
   * **2026-08-11 又加回来了「终端」。**
   *
   * 2026-08-09 删它的理由是「这个命令没有对象」——那时终端要么占满主区、
   * 要么根本不存在。**现在它有对象了**：对话区底下那条 dock。
   *
   * 留在命令面板里的理由：composer 上那颗按钮只在有会话时才有，
   * 而人在设置那一屏也可能想开个终端。
   */
  out.push({
    id: "view.terminal",
    title: ctx.dockOpen ? t("收起终端") : t("打开终端"),
    group: "视图",
    keywords: "terminal shell 终端 命令行",
    run: () => actions.toggleDock(),
  })

  // ── 设置 ─────────────────────────────────────────────────────────
  out.push({
    id: "settings.open",
    title: t("打开设置"),
    group: "设置",
    keywords: "settings 偏好 凭证 主题 api key",
    run: () => actions.openSettings(),
  })
  for (const [id, 名, 词] of [
    ["skills", t("Skills"), "skills 技能"],
    ["subagents", t("子 Agent"), "subagent 子agent 名册"],
    ["plugins", t("插件"), "plugins 插件"],
    ["mcp", t("MCP 服务器"), "mcp 服务器 工具"],
    ["assistant", t("远程助理"), "weixin 微信 远程助理"],
  ] as const) {
    out.push({
      id: `settings.${id}`,
      title: tf("设置：{0}", 名),
      group: "设置",
      keywords: 词,
      run: () => actions.openSettingsSection(id),
    })
  }
  // **形参不能叫 `t`**：那会遮住 i18n 的 `t()`，而遮住之后是「调用一个对象」的编译错
  for (const 主题 of THEMES) {
    out.push({
      id: `theme.${主题.choice}`,
      title: tf("主题：{0}", t(主题.label)),
      group: "设置",
      keywords: `theme 主题 明暗 ${主题.label}`,
      run: () => actions.setTheme(主题.choice),
    })
  }

  return out
}
