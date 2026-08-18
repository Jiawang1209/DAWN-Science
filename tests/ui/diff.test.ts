/**
 * 行号必须对得上（2026-08-18）。
 *
 * 一个**错的**行号比没有行号更坏：没有行号时人知道要自己去数，
 * 而错的行号会把人带到文件里另一个地方，且看起来一切正常。
 */
import { describe, it, expect } from "vitest"
import { 拆统一diff } from "../../src/ui/diff.js"

const 号 = (原文: string) => 拆统一diff(原文).map((r) => [r.类型, r.行号] as const)

describe("拆统一diff", () => {
  it("行号从块头的两个起点各自往下走", () => {
    const 原文 = [
      "diff --git a/a.txt b/a.txt",
      "index 111..222 100644",
      "--- a/a.txt",
      "+++ b/a.txt",
      "@@ -10,3 +10,4 @@",
      " 上下文一",
      "-删掉的",
      "+新加的甲",
      "+新加的乙",
      " 上下文二",
    ].join("\n")

    expect(号(原文)).toEqual([
      ["hunk", undefined],
      ["context", 10],
      ["del", 11], // **旧文件**里的第 11 行
      ["add", 11], // **新文件**里的第 11 行——两个 11 不是同一行，靠 +/− 分辨
      ["add", 12],
      ["context", 13],
    ])
  })

  it("前言那四行不画 —— 文件头已经把「这是哪个文件」说清楚了", () => {
    const 原文 = ["diff --git a/a b/a", "index 1..2", "--- a/a", "+++ b/a", "@@ -1 +1 @@", "-旧", "+新"].join("\n")
    expect(拆统一diff(原文).map((r) => r.文本)).toEqual(["@@ -1 +1 @@", "-旧", "+新"])
  })

  it("**其余元信息一律留着** —— 只有它说得出「这是个新文件」「这是二进制」", () => {
    const 原文 = [
      "diff --git a/新的.png b/新的.png",
      "new file mode 100644",
      "index 000..abc",
      "Binary files /dev/null and b/新的.png differ",
    ].join("\n")
    expect(拆统一diff(原文).map((r) => r.文本)).toEqual([
      "new file mode 100644",
      "Binary files /dev/null and b/新的.png differ",
    ])
  })

  it("空的上下文行**照样占一个行号** —— 当成元信息的话，后面每一行都会偏", () => {
    // 原文里的空行经 split 之后就是空串，而它在文件里实实在在占一行
    const 原文 = ["@@ -1,3 +1,3 @@", " 第一行", "", "+加在第三行"].join("\n")
    expect(号(原文)).toEqual([
      ["hunk", undefined],
      ["context", 1],
      ["context", 2],
      ["add", 3],
    ])
  })

  it("`\\ No newline` 是 git 的旁白，**不占文件的一行**", () => {
    const 原文 = ["@@ -1 +1 @@", "-旧", "\\ No newline at end of file", "+新"].join("\n")
    expect(号(原文)).toEqual([
      ["hunk", undefined],
      ["del", 1],
      ["meta", undefined],
      ["add", 1],
    ])
  })

  it("多个块各自从自己的起点重新起算", () => {
    const 原文 = ["@@ -1,2 +1,2 @@", " 甲", "@@ -80,2 +81,2 @@", " 乙", "+丙"].join("\n")
    expect(号(原文)).toEqual([
      ["hunk", undefined],
      ["context", 1],
      ["hunk", undefined],
      ["context", 81],
      ["add", 82],
    ])
  })

  it("空 diff 拆出来是空的 —— 不编一行出来", () => {
    expect(拆统一diff("")).toEqual([])
  })
})
