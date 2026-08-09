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

export type CommandGroup = "会话" | "模型" | "项目" | "视图" | "设置"

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
  setTheme(choice: ThemeChoice): void
}

export interface CommandContext {
  actions: Actions
  agents: readonly string[]
  session: SessionSummary | undefined
  /** agent 还在说话。**只有这时「中止」才有意义** */
  busy: boolean
  view: View
}

const THEMES: readonly { choice: ThemeChoice; label: string }[] = [
  { choice: "system", label: "跟随系统" },
  { choice: "light", label: "亮色" },
  { choice: "dark", label: "暗色" },
]

/** 中止为什么用不了。**分清是哪一种，笼统写「不可用」等于没说** */
function abortUnavailable(ctx: CommandContext): string | undefined {
  if (!ctx.session) return "还没有会话"
  if (ctx.session.kind !== "native") return "外部 CLI 的回合边界不可观测，无法中止"
  if (!ctx.busy) return "当前没有正在进行的回合"
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
      title: "新建会话",
      group: "会话",
      run: () => {},
      unavailable: "配置里还没有可用的 agent",
    })
  } else {
    for (const a of agents) {
      out.push({
        id: `session.new:${a}`,
        title: `新建会话：${a}`,
        group: "会话",
        keywords: `new session ${a}`,
        run: () => actions.newSession(a),
      })
    }
  }

  const abortWhy = abortUnavailable(ctx)
  out.push({
    id: "session.abort",
    title: "中止当前回合",
    group: "会话",
    keywords: "stop abort 停止",
    run: () => actions.abort(),
    ...(abortWhy ? { unavailable: abortWhy } : {}),
  })

  // ── 项目 ─────────────────────────────────────────────────────────
  out.push({
    id: "project.open",
    title: "打开文件夹为新项目",
    group: "项目",
    keywords: "open project folder 目录",
    run: () => actions.openProject(),
  })
  out.push({
    id: "project.panel",
    title: "项目概览",
    group: "项目",
    keywords: "overview runs 历史 产出",
    run: () => actions.showProjectPanel(),
  })

  // ── 视图 ─────────────────────────────────────────────────────────
  if (ctx.view !== "conversation") {
    out.push({
      id: "view.conversation",
      title: "返回对话",
      group: "视图",
      keywords: "back conversation",
      run: () => actions.showConversation(),
    })
  }
  /**
   * **2026-08-09 删掉了「切换终端」。**
   *
   * 那个命令的对象（可折叠的终端 dock）已经不存在：对托管 CLI 的会话，
   * 终端就是主体；对内置 agent，本来就没有终端。
   * **一个没有对象的动作留在面板里，只会让人点了之后怀疑是不是坏了。**
   */
  // ── 设置 ─────────────────────────────────────────────────────────
  out.push({
    id: "settings.open",
    title: "打开设置",
    group: "设置",
    keywords: "settings 偏好 凭证 主题 api key",
    run: () => actions.openSettings(),
  })
  for (const t of THEMES) {
    out.push({
      id: `theme.${t.choice}`,
      title: `主题：${t.label}`,
      group: "设置",
      keywords: `theme 主题 明暗 ${t.label}`,
      run: () => actions.setTheme(t.choice),
    })
  }

  return out
}
