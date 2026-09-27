/**
 * 回退之后给模型留的那句话（2026-09-27，spec §4.4）。`display: false`：给模型读的，人那一侧对话里已经有通知。
 *
 * 为什么要留：只退文件、对话留着，模型的上下文里写着「我生成了 figures/fig1.png」而它已经没了——会照着一段不存在的历史往下做；
 * 只撤对话、文件留着，正好反过来；两样都退了，内核里的变量却还是被撤掉那几轮算出来的。**三种都得点名说。**
 * 英文写：与 `dawn-model-change` 那句同一个理由——它是给模型的指令，不是界面文案。
 */
import type { 回退做法 } from "./types.js"
import type { 回退结果 } from "../project/checkpoints.js"

const 摘 = (s: string) => (s.length > 60 ? `${s.slice(0, 60)}…` : s)
const 列 = (xs: readonly string[]) => xs.map((x) => `\`${x}\``).join(", ")

export function 给模型的回退话(
  做法: 回退做法,
  这句: string,
  r: (Pick<回退结果, "restored" | "removed" | "keep"> & Partial<Pick<回退结果, "cannot" | "failed">>) | undefined,
  内核们: readonly string[],
): string | undefined {
  const 内核 = 内核们.length
    ? ` The ${内核们.join(" and ")} kernel${内核们.length > 1 ? "s were" : " was"} NOT rewound: kernel variables still hold values computed in the rewound turns — re-run what you need instead of trusting them.`
    : ""
  if (做法 === "conversation") {
    return `[system] The user removed the conversation from the message "${摘(这句)}" onward, but the workspace files were NOT rewound: changes made in those removed turns are still on disk. Check the files before assuming their state.${内核}`
  }
  if (做法 === "both") return 内核 ? `[system] The user rewound files and conversation to before the message "${摘(这句)}".${内核}` : undefined
  const 退了 = r?.restored.length ? ` Restored to their earlier content: ${列(r.restored)}.` : ""
  const 挪了 = r?.removed.length ? ` Moved away (they did not exist then): ${列(r.removed)}.` : ""
  const 没动 = r?.keep.length ? ` Left as they are because the user edited them later: ${列(r.keep.map((x) => x.path))}.` : ""
  // 退不回的（超上限、原始数据）与做到一半出事的（2026-09-27 数据安全那次改成逐个报）：它们**还是现在的样子**，也得点名
  const 没退成 = [...(r?.cannot ?? []).map((x) => x.path), ...(r?.failed ?? []).map((x) => x.path)]
  const 没退 = 没退成.length ? ` NOT rewound (still as they are now): ${列(没退成)}.` : ""
  return `[system] The user rewound workspace files to how they were before the message "${摘(这句)}"; the conversation was kept.${退了}${挪了}${没动}${没退} Anything earlier in this conversation about these files is out of date — re-read them before relying on them.${内核}`
}
