/**
 * 版本比较（规格 `2026-09-06-应用内更新-design.md`）。
 *
 * **为什么值得单独一个文件**：这条链上最容易被字符串比较毁掉的就是这里。
 * `"0.0.10" > "0.0.9"` 在字符串里是 false——0.0.10 发出去之后，装着 0.0.9 的人
 * 永远看不到它，而且**一声不吭**。这是所有失败模式里最坏的一种。
 *
 * 只认 `major.minor.patch[-预发布]`，`v` 前缀可有可无（tag 带、package.json 不带）。
 * **不认识的串抛错，不回落成 0.0.0**：GitHub 回一个畸形 tag 时，
 * 静默当 0 会让我们判成「有新版」并请人去下一个不存在的东西。
 */
export interface 版本 {
  major: number
  minor: number
  patch: number
  /** 没有就是正式版。`-rc1` 里的 `rc1` */
  预发布?: string
}

const 形状 = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/

export function 解析版本(原: string): 版本 {
  const m = 形状.exec(原.trim())
  if (!m) throw new Error(`认不出这是个版本号：${JSON.stringify(原)}`)
  const [, a, b, c, pre] = m
  return { major: Number(a), minor: Number(b), patch: Number(c), ...(pre ? { 预发布: pre } : {}) }
}

const 取 = (v: 版本 | string): 版本 => (typeof v === "string" ? 解析版本(v) : v)

/** `a` 比 `b` 新返回 1，旧返回 -1，一样返回 0 */
export function 比版本(a: 版本 | string, b: 版本 | string): -1 | 0 | 1 {
  const x = 取(a)
  const y = 取(b)
  for (const k of ["major", "minor", "patch"] as const) {
    if (x[k] !== y[k]) return x[k] > y[k] ? 1 : -1
  }
  // 预发布排在同号正式版**之前**（semver 的规则，也是直觉：0.1.0-rc1 是 0.1.0 之前的东西）
  if (x.预发布 && !y.预发布) return -1
  if (!x.预发布 && y.预发布) return 1
  if (x.预发布 && y.预发布 && x.预发布 !== y.预发布) return x.预发布 > y.预发布 ? 1 : -1
  return 0
}

/**
 * 值不值得提示。**只有严格更新才算**——
 * 本地打的开发版常常比线上还新，那时提示等于劝人降级。
 */
export function 是更新的(候选: string, 当前: string): boolean {
  return 比版本(候选, 当前) === 1
}
