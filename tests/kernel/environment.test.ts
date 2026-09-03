/**
 * 内核快照的 `where`（远程内核，2026-09-03）。
 *
 * 同一个 conda env 装在两台不同的机器上，不是同一个环境——
 * 指纹要能分辨「哪台机器」。但**本机内核不带这个字段**，
 * 所以老快照的指纹必须一个字节不变（这是 R5 之前算出来的老 id 仍然有效的证据）。
 */
import { describe, expect, it } from "vitest"
import { fingerprintOf, type EnvironmentSnapshot } from "../../src/kernel/environment.js"

const 样例: EnvironmentSnapshot = {
  language: "python", version: "3.11.9", executable: "/opt/conda/bin/python", platform: "Linux-x86_64",
  libraryPaths: ["/opt/conda/lib/python3.11"], packages: [{ name: "numpy", version: "2.1.0" }], packagesTotal: 1,
}

describe("内核快照的 where（远程内核，2026-09-03）", () => {
  it("**本机快照的指纹一个字节不变**：R5 之前算出来的 id 仍指向同一行", () => {
    // 这串是改动之前用同一份样例算出来的（改动前跑一次 fingerprintOf(样例) 抄进来）
    expect(fingerprintOf(样例)).toBe("a3206e7c07458ef43090b360496b21ad4c8e866c441b909fca5b92ff40b974a7")
  })
  it("带 where 的与不带的是两份快照；同一个 conda env 搬到另一台机器不是同一个环境", () => {
    const a = fingerprintOf({ ...样例, where: { connectionId: "conn-1" } })
    const b = fingerprintOf({ ...样例, where: { connectionId: "conn-2" } })
    expect(a).not.toBe(fingerprintOf(样例))
    expect(a).not.toBe(b)
  })
})
