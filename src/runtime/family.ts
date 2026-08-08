import { basename } from "node:path"

/**
 * 从命令名推断 CLI 家族，决定隔离配置怎么写。
 *
 * **认不出就返回 undefined**，那时 PtyRuntime 不写任何配置、直接裸起进程。
 * 这比猜一个家族安全——猜错会生成一份该 CLI 读不懂的配置，
 * 而进程照样起得来，用户以为注入生效了（同一失效模式在 Task 1.7/1.9/1.11 各出现过一次）。
 */
export function familyOf(command: string): string | undefined {
  const base = basename(command).replace(/\.(exe|cmd|bat)$/i, "")
  return base === "claude" || base === "codex" ? base : undefined
}
