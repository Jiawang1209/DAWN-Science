/**
 * 卡死守卫（①-B″ · R1）。
 *
 * 模型退化时会反复发出**完全相同的工具调用**，每次拿回同样的结果，毫无进展。
 * pi 不管这件事——全包 grep `stuck|repeated|no_progress` 零命中——
 * 于是它会一路烧到迭代上限。**烧的是用户的钱。**
 *
 * ## 为什么是窗口式，不是连续式
 *
 * wisp-science 在这里留了一道疤。它的测试名字就叫
 * `interspersed_tool_call_loop_breaks_the_loop`，注释写着：
 *
 * > *"the case the **old consecutive-only guard** let run to max_iter"*
 *
 * **连续式守卫会被 A/B/A/B 绕过去**：任意相邻两批都不相同，但整体在原地打转。
 * 他们踩过一次才改成窗口式。**别人的疤是可以不重复的**，所以我们直接从窗口式起步。
 *
 * ## 它不是正确性机制
 *
 * 这是**成本护栏**。它可能误伤（一个真需要反复读同一文件的合理流程），
 * 所以阈值定得宽松，而且**中断必须带原因出声**——用户要能判断这次是不是误伤。
 */

/** 扫描最近多少批工具调用 */
export const STUCK_WINDOW = 16

/**
 * 窗口内重复多少次判定卡死。
 *
 * 5 而不是 2、3：**宁可晚一点停，也不要误伤**。一个合理的流程完全可能
 * 在 16 批里读同一个文件三四次（比如改一处、验一次、再改一处）。
 */
export const STUCK_REPEAT_LIMIT = 5

/** 一次工具调用。只关心名字与入参——结果不参与判定，因为卡死的定义就是"结果都一样" */
export interface GuardedCall {
  name: string
  input: unknown
}

/**
 * 稳定序列化：**对键排序**。
 *
 * `JSON.stringify` 对键序敏感，`{path, content}` 与 `{content, path}` 会得到
 * 两个不同的字符串——而它们是同一个调用。模型在不同轮次里给出的键序不保证一致，
 * 不排序就会漏判。
 *
 * 循环引用不抛错：**工具入参是模型给的，不可信**。守卫自己崩掉比不守卫更糟。
 */
function stableStringify(value: unknown, seen = new WeakSet<object>()): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null"
  if (seen.has(value as object)) return '"[circular]"'
  seen.add(value as object)
  if (Array.isArray(value)) {
    return `[${value.map((v) => stableStringify(v, seen)).join(",")}]`
  }
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0,
  )
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v, seen)}`).join(",")}}`
}

/** 整批调用的签名。**一批算一个单位**——模型一次可以发好几个调用，它们共同构成"这一步" */
export function batchSignature(calls: readonly GuardedCall[]): string {
  return calls.map((c) => `${c.name}:${stableStringify(c.input)}`).join("|")
}

export class StuckGuard {
  private readonly recent: string[] = []

  /**
   * 记一批调用，并判断是否已经卡死。
   *
   * @returns 卡死时返回**给用户看的原因**；否则 `undefined`。
   *   返回原因而不是布尔，是因为规格 7.5 要求中断必须出声——
   *   调用方拿到的东西必须足够写进 transcript。
   */
  check(calls: readonly GuardedCall[]): string | undefined {
    if (calls.length === 0) return undefined
    const sig = batchSignature(calls)
    // 先数窗口里已有的，再把自己放进去：repeats 是"算上这次共出现几次"
    const repeats = this.recent.filter((s) => s === sig).length + 1
    this.recent.push(sig)
    if (this.recent.length > STUCK_WINDOW) this.recent.shift()

    if (repeats < STUCK_REPEAT_LIMIT) return undefined

    const names = [...new Set(calls.map((c) => c.name))].join("、")
    return (
      `检测到重复调用：最近 ${STUCK_WINDOW} 批里，同一组工具调用（${names}）` +
      `以完全相同的参数出现了 ${repeats} 次，没有产生新进展，已中断以免继续消耗额度。` +
      `通常是模型退化——可以换更强的模型，或换一种问法再试。`
    )
  }

  /** 新回合开始时清空。**上一轮的重复不该算到这一轮头上** */
  reset(): void {
    this.recent.length = 0
  }
}
