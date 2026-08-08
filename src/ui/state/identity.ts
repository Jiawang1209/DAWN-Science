/**
 * 引用同一性（Hermes 六条里的第 6 条）。
 *
 * > *"**Preserve reference identity on no-ops.** Handing React a fresh array that
 * > contains the same data re-renders expensive trees for nothing."*
 *
 * 这条在本项目不是理论问题。2026-08-08 的事故里，
 * `App({ client = createClient() })` 每渲染一次造一个新 client 身份，
 * effect 跟着每次都重跑——**渲染进程 18 秒吃满 4 GB**。
 * 那次的直接原因是默认参数，但根因是同一个：**身份变了，内容没变。**
 *
 * 所以写入路径统一走这里：内容没变就**不换引用**，下游的 `useStore`
 * 于是根本不会被唤醒。
 */
import type { WritableAtom } from "nanostores"

/** 浅比较一层。`TranscriptItem` 除 `input` 外都是标量，够用 */
function shallowEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false
  const ka = Object.keys(a as object)
  const kb = Object.keys(b as object)
  if (ka.length !== kb.length) return false
  return ka.every((k) => {
    const va = (a as Record<string, unknown>)[k]
    const vb = (b as Record<string, unknown>)[k]
    if (Object.is(va, vb)) return true
    // 工具入参是任意结构。它只在工具调用**创建**时出现一次，
    // 序列化比较的代价可以接受；用它换「入参没变就不重渲染」是划算的
    if (typeof va === "object" && typeof vb === "object") {
      try {
        return JSON.stringify(va) === JSON.stringify(vb)
      } catch {
        return false
      }
    }
    return false
  })
}

/** 数组逐元素浅比较。长度不同直接判否，避免白跑一趟 */
export function sameList<T>(a: readonly T[], b: readonly T[]): boolean {
  if (a === b) return true
  if (a.length !== b.length) return false
  return a.every((x, i) => shallowEqual(x, b[i]))
}

/**
 * 内容变了才写。
 *
 * **注意它返回是否真的写了**——调用方偶尔需要知道（例如决定要不要再取一次数）。
 */
export function setList<T>(atom: WritableAtom<readonly T[]>, next: readonly T[]): boolean {
  if (sameList(atom.get(), next)) return false
  atom.set(next)
  return true
}

/** 标量版本。nanostores 自己就会跳过 `Object.is` 相等的写入，这里只是把意图写明 */
export function setValue<T>(atom: WritableAtom<T>, next: T): boolean {
  if (Object.is(atom.get(), next)) return false
  atom.set(next)
  return true
}

export { shallowEqual }
