/**
 * 父子进程之间的契约（①-B″ · S1）。
 *
 * **这个文件是两边共用的唯一真相**：父侧 `executor.ts` 按它写 stdin，
 * 子侧 `child.ts` 按它读。分成两份定义迟早会分家，而分家的表现是
 * 「子进程收到的字段是 undefined」——排查起来要跨进程。
 *
 * ## 为什么规格走 stdin，不走环境变量
 *
 * 里面有 **apiKey**。环境变量在 Linux 的 `/proc/<pid>/environ` 里可读，
 * `ps e` 也能看到；stdin 不留在任何地方。这与 `git-facts.ts` 里
 * 「只读命令也要净化环境」是同一条纪律的另一面。
 *
 * 附带的好处：任务文本可以很长、可以含任意字符，命令行参数两样都受限。
 */

/** 父 → 子：一个任务的全部输入。**子进程不猜任何东西，父侧给全** */
export interface SubagentChildSpec {
  agent: string
  /** 已经替换过 `{previous}` 的最终任务文本 */
  task: string
  /** 来自定义文件正文 */
  systemPrompt: string
  /** 允许的工具。缺省 = 用默认工具集 */
  tools?: string[]
  provider: string
  model: string
  /** 子 agent 的工作目录。与父会话同一个工作区 */
  cwd: string
  /**
   * pi 的 agentDir。**每个子任务一个**——理由与父会话那边同源（Spike E）：
   * pi 会把模型选择写成 agentDir 级的默认值，共用就会互相串。
   */
  agentDir: string
  /** pi 的模型目录缓存路径。缺省 = 不落盘 */
  modelsPath?: string
  /** provider → apiKey。**只走这里，不进环境变量** */
  credentials?: Record<string, string>
  /**
   * **团队成员模式**（team-board，2026-08-22）。给了就：
   * - 会话记录落在 `sessionDir`，`resume` 为真时**续上一轮的会话文件**（同一个成员下一轮还记得上一轮）——
   *   进程仍是新的，不变式 1 不变；
   * - 多两个工具 `team_send` / `team_status`，走 stdout 上的 `call` 行、stdin 上的 `reply` 行与父进程说话。
   */
  member?: {
    team: string
    name: string
    sessionDir: string
    resume: boolean
  }
}

/**
 * 子 → 父：stdout 上的 NDJSON。
 *
 * 目前只有 `done` 一种。留着可辨识联合是为了下一片的进度行
 * （界面的 chip 组要显示子 agent 正在调什么工具），
 * **那时加一个成员即可，不必改父侧的解析形状**。
 */
export type SubagentDoneMessage =
  | { type: "done"; ok: true; output: string }
  | { type: "done"; ok: false; error: string }

/** 成员模式：一次工具调用，等父进程回一行 `reply` */
export interface SubagentCallMessage {
  type: "call"
  id: string
  name: string
  params: unknown
}

export type SubagentChildMessage = SubagentDoneMessage | SubagentCallMessage

/** 父 → 子（只在成员模式）：工具调用的回应，一行一条 */
export interface SubagentParentReply {
  type: "reply"
  id: string
  ok: boolean
  result: string
}

/** 子进程的环境变量。**只有这一个**，其余一律走 stdin */
export const RUN_AS_NODE = "ELECTRON_RUN_AS_NODE"

/**
 * 子侧入口在构建产物里的文件名。
 *
 * 与 `scripts/build-electron.mjs` 的 outfile **必须一致**，
 * 所以写在这里由两边引用，而不是在两处各写一遍字符串。
 */
export const CHILD_ENTRY = "subagent-child.js"
