/**
 * 世代守卫（Hermes 六条里的第 3 条）。
 *
 * > *"**Guard against the past.** Async results can arrive out of order; a stale
 * > response must never overwrite newer intent. Generation counters and request
 * > tokens exist for this."*
 *
 * 具体场景：用户在 A 会话点了一下，请求飞出去了；他等不及切到 B。
 * A 的响应这时才回来——**它必须被丢掉**，否则 B 的界面上会出现 A 的内容。
 *
 * 此前 `App.tsx` 用一个 `watching.current` ref 手工核对，只覆盖了 transcript
 * 一处；Run 详情那条用的是另一套 `let stale = false` 的闭包写法。
 * **两套写法就是两处各自漂移。** 这里收成一处。
 */

/** 当前世代。任何"用户改变了意图"的动作都应当推进它 */
let generation = 0

/**
 * 领一个守卫。**调用即推进世代**——也就是说，先前领走的守卫立刻作废。
 *
 * 用法：
 * ```ts
 * const g = guard()
 * const data = await fetchSomething()
 * if (g.stale()) return   // 用户已经切走了，这条结果不作数
 * apply(data)
 * ```
 */
export function guard(): { stale: () => boolean } {
  const mine = ++generation
  return { stale: () => mine !== generation }
}

/**
 * 作废当前全部飞行中的请求，但不领新守卫。
 *
 * **世代号只增不减。** 归零看起来更"干净"，实际上会制造撞车：
 * 旧请求持有 `mine = 1`，归零后新请求也拿到 `mine = 1`，
 * 于是**旧请求会被误判为新鲜**——正好是这套机制要防的那件事。
 * 这个坑是写 `resetTranscript()` 时发现的。
 */
export function invalidate(): void {
  generation++
}

/** 只读当前世代。测试与诊断用，不参与逻辑判断 */
export function currentGeneration(): number {
  return generation
}
