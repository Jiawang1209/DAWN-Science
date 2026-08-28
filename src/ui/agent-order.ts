/**
 * **对话可用的 agent 顺序：native 排前面**（2026-08-28，打包版首启抓的）。
 *
 * 空态屏开第一段对话用的是这份清单的第一个。全新安装的默认配置**刻意不放 native**
 * （只有 claude / codex 两个 cli），填了 key 之后自动合成的 native agent 是**追加在末尾**的——
 * 于是向导里填完 deepseek 的 key、一开口，走的其实是 claude CLI：没装就报错，装了也没有
 * 「优化输入」（那颗只给 native 会话）。开发版看不出来，因为 `providers.yaml` 里 ds-chat 本来就在第一个。
 *
 * 只调顺序，不动集合：终端（pty）照旧不进对话清单；同类之内保持配置里的次序。
 */
export function 对话agent顺序<A extends { agentId: string; kind: string }>(agents: readonly A[]): string[] {
  const 非终端 = agents.filter((a) => a.kind !== "pty")
  return [...非终端.filter((a) => a.kind === "native"), ...非终端.filter((a) => a.kind !== "native")].map((a) => a.agentId)
}
