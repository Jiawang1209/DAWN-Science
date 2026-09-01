/**
 * 后端错误的双语载荷（B15，2026-09-01）。
 *
 * 首启审计（2026-08-28）记的：英文界面上**每一条后端错误都是中文**——
 * 后端 `fault(code, "没有这个项目：p1")` 抛的话被界面原样显示，`t()` 从来没见过它。
 *
 * 定案：错误除了渲染好的中文 `message`，还带一份 `{ msgid, args }`：
 *   - `msgid` 是带 `{0}` `{1}` 占位符的**中文原文**，与界面 `tf()` 同一套约定，查的是同一张 `EN` 表；
 *   - `args` 是要填进去的值。
 * 它坐在 `error.details.i18n`（`details` 本来就是 `unknown`，旧读者照旧解析），
 * 以及 `getProviders.unusable[].i18n`。客户端拿到就 `tf(msgid, ...args)`，
 * 于是所有读 `e.message` 的地方**免费**得到当前语言；中文那一面逐字节不变。
 *
 * **只有业务性失败带它**。`internal_error` 的归一化那条路永远不带——
 * 那里的 details 可能含路径、连接串、密钥片段（`server.ts` 里那条「不向客户端泄露内部细节」的规矩）。
 */
import { z } from "zod"

export const FaultI18nSchema = z
  .object({
    msgid: z.string().min(1),
    args: z.array(z.union([z.string(), z.number()])),
  })
  .strict()
export type FaultI18n = z.infer<typeof FaultI18nSchema>

/**
 * 造一份 `{ msgid, args }`。
 *
 * 它在运行时什么也不做，**存在是为了让扫描看得见**（同界面那边的 `msgid()`）：
 * `tests/workbench/fault-i18n.test.ts` 与 `tests/ui/i18n.test.ts` 按 `i18n消息("…")` 的字面实参
 * 对英文表，不用它而手写对象，那句话在扫描眼里就不存在。
 */
export function i18n消息(msgid: string, ...args: (string | number)[]): FaultI18n {
  return { msgid, args }
}

/**
 * 把 `{0}` `{1}` 换成 args——与界面 `tf()` 一模一样的替换规则：
 * 同一个占位符可以出现多次；没给的原样留着（露出一个 `{2}` 比静默吞掉好找）。
 */
export function 渲染i18n(msgid: string, args: readonly (string | number)[]): string {
  return msgid.replace(/\{(\d+)\}/g, (m, i) => {
    const v = args[Number(i)]
    return v === undefined ? m : String(v)
  })
}

/** `error.details` 里有没有 i18n 载荷。**不合形状就当没有**——details 是 unknown，别在这里炸 */
export function 取错误i18n(details: unknown): FaultI18n | undefined {
  if (typeof details !== "object" || details === null || !("i18n" in details)) return undefined
  const r = FaultI18nSchema.safeParse((details as { i18n: unknown }).i18n)
  return r.success ? r.data : undefined
}
