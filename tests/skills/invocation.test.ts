/**
 * SKILL.md 里的调用策略：读与写（skills-manage，2026-08-21，学自 dsh-skills-manager）。
 * 三档：model（缺省）/ manual（`disable-model-invocation: true`）/ off（再加 `user-invocable: false`）。
 * **写是文本级替换**：只动这两行，别的一字不改。
 */
import { describe, expect, it } from "vitest"
import { 读调用策略, 写调用策略 } from "../../src/skills/invocation.js"

const 原 = `---
name: plot-figure
description: "画图"
metadata:
  source: dawn
# 注释也留着
---

# 正文
`

describe("读调用策略", () => {
  it("缺省是 model", () => {
    expect(读调用策略(原)).toBe("model")
  })
  it("disable-model-invocation: true → manual", () => {
    expect(读调用策略(原.replace("description", "disable-model-invocation: true\ndescription"))).toBe("manual")
  })
  it("再加 user-invocable: false → off；user-invocable 单独 false 也算 off", () => {
    expect(读调用策略(写调用策略(原, "off")!)).toBe("off")
    expect(读调用策略(原.replace("description", "user-invocable: false\ndescription"))).toBe("off")
  })
  it("带 BOM、\\r\\n 也认", () => {
    const 文 = "﻿" + 原.replace(/\n/g, "\r\n").replace("description", "disable-model-invocation: yes\r\ndescription")
    expect(读调用策略(文)).toBe("manual")
  })
  it("没有 frontmatter → model（读不坏）", () => {
    expect(读调用策略("# 没头\n")).toBe("model")
  })
})

describe("写调用策略", () => {
  it("manual：只加一行，注释、嵌套块、键序、引号原样", () => {
    const 出 = 写调用策略(原, "manual")!
    expect(出).toBe(`---
name: plot-figure
description: "画图"
metadata:
  source: dawn
# 注释也留着
disable-model-invocation: true
---

# 正文
`)
  })
  it("off：两行；再写回 model 把两行都删掉，不写 false", () => {
    const 关 = 写调用策略(原, "off")!
    expect(关).toContain("disable-model-invocation: true\nuser-invocable: false\n---")
    expect(写调用策略(关, "model")).toBe(原)
  })
  it("原来就有这两行（带注释、不同写法）：替换而不是重复加", () => {
    const 有 = 原.replace("description", "disable-model-invocation: yes   # 旧注释\nuser-invocable: 'false'\ndescription")
    const 出 = 写调用策略(有, "manual")!
    expect(出.match(/disable-model-invocation/g)).toHaveLength(1)
    expect(出).not.toContain("user-invocable")
  })
  it("保留 \\r\\n 与 BOM", () => {
    const 文 = "﻿" + 原.replace(/\n/g, "\r\n")
    const 出 = 写调用策略(文, "manual")!
    expect(出.startsWith("﻿---\r\n")).toBe(true)
    expect(出).toContain("disable-model-invocation: true\r\n---\r\n")
  })
  it("没有完整 frontmatter → undefined（不硬改）", () => {
    expect(写调用策略("# 没头\n", "manual")).toBeUndefined()
    expect(写调用策略("---\nname: x\n# 没收尾\n", "manual")).toBeUndefined()
  })
  it("同档重写是幂等的", () => {
    const 一 = 写调用策略(原, "off")!
    expect(写调用策略(一, "off")).toBe(一)
  })
})
