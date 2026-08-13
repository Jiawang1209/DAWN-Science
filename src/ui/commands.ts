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
  showConversation(): void
  showProjectPanel(): void
  newSession(agentId: string): void
  abort(): void
  openProject(): void
  /** 删除当前会话。**与侧栏那个 × 是同一个动作**——一个动作一个家 */
  deleteSession(): void
  /** 掀开／收起底部终端。**与 composer 上那颗是同一个动作** */
  toggleDock(): void
  setTheme(choice: ThemeChoice): void
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
}

const THEMES: readonly { choice: ThemeChoice; label: string }[] = [
  { choice: "system", label: msgid("跟随系统") },
  { choice: "light", label: msgid("亮色") },
  { choice: "dark", label: msgid("暗色") },
]

/** 中止为什么用不了。**分清是哪一种，笼统写「不可用」等于没说** */
function abortUnavailable(ctx: CommandContext): string | undefined {
  if (!ctx.session) return "还没有会话"
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
  if (agents.length === 0) {
    // **不是把这条藏起来。** 藏起来的话，搜「新建会话」搜不到的人
    // 分不清是没这个功能还是配置有问题
    out.push({
      id: "session.new",
      title: t("新建会话"),
      group: "会话",
      run: () => {},
      unavailable: "配置里还没有可用的 agent",
    })
  } else {
    for (const a of agents) {
      out.push({
        id: `session.new:${a}`,
        title: tf("新建会话：{0}", a),
        group: "会话",
        keywords: `new session ${a}`,
        run: () => actions.newSession(a),
      })
    }
  }

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

  // ── 项目 ─────────────────────────────────────────────────────────
  out.push({
    id: "project.open",
    title: t("打开文件夹为新项目"),
    group: "项目",
    keywords: "open project folder 目录",
    run: () => actions.openProject(),
  })
  out.push({
    id: "project.panel",
    title: t("项目概览"),
    group: "项目",
    keywords: "overview runs 历史 产出",
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
   * 而人在「文件」或「项目概览」那一屏也可能想开个终端。
   */
  out.push({
    id: "view.terminal",
    title: ctx.dockOpen ? "收起终端" : "打开终端",
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
