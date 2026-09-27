/**
 * 子 agent 的转录 id（2026-09-27，spec `2026-09-27-子agent看得见-design.md` §4.4）。
 *
 * **两边共用这一种写法**：后端给每个子 agent 开一段子转录、界面按 id 把推送分进第三个槽，认的都是它。
 * 写在两处的话，迟早一处多一个冒号，而症状是「点了 chip，坞里一片空白」——要跨进程才查得出来。
 *
 * 会话 id 是 UUID（`src/session/manager.ts` 的 `randomUUID()`），不含 `#`；toolCallId 可能含冒号（团队的是 `team:<id>`），
 * 所以序号取**最后一个**冒号后面。
 */
const 记号 = "#sub:"

export function 子转录id(会话: string, toolCallId: string, 序号: number): string {
  return `${会话}${记号}${toolCallId}:${序号}`
}

export function 是子转录id(id: string): boolean {
  return id.includes(记号)
}

/** 拆不出来就是 undefined——**不猜**：拆错了会把一个子 agent 的过程灌进另一个的格子里 */
export function 拆子转录id(id: string): { 会话: string; toolCallId: string; 序号: number } | undefined {
  const i = id.indexOf(记号)
  if (i <= 0) return undefined
  const 尾 = id.slice(i + 记号.length)
  const j = 尾.lastIndexOf(":")
  if (j <= 0) return undefined
  const 序号 = Number(尾.slice(j + 1))
  if (!Number.isInteger(序号) || 序号 < 0) return undefined
  return { 会话: id.slice(0, i), toolCallId: 尾.slice(0, j), 序号 }
}
