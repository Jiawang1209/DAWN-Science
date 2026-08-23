/**
 * `@路径` 引用（2026-08-23，学自 dsh-at-file）。
 * 三件事：识别什么、不识别什么；发送前怎么展开；展开不碰原文。
 */
import { describe, expect, it } from "vitest"
import { 扫引用, 展开引用, 引用标记 } from "../../src/files/mentions.js"

describe("扫引用 · 识别语法", () => {
  it("`@路径` 一串没有空白的字；首次出现去重", () => {
    expect(扫引用("看看 @data/a.csv 和 @src/x.py，再看 @data/a.csv").map((r) => r.path)).toEqual(["data/a.csv", "src/x.py"])
  })
  it("目录形式的尾 `/` 去掉；句末标点不算路径", () => {
    expect(扫引用("列一下 @results/。").map((r) => r.path)).toEqual(["results"])
    expect(扫引用("(@a.csv)").map((r) => r.path)).toEqual(["a.csv"])
    expect(扫引用("@a.csv, @b.csv").map((r) => r.path)).toEqual(["a.csv", "b.csv"])
  })
  it("位置覆盖 `@` 到路径末尾（不含尾随标点）——引用栏的 × 靠它抠字", () => {
    const [r] = 扫引用("看 @a.csv。")
    expect(r).toEqual({ path: "a.csv", start: 2, end: 8 })
  })
  it("光 `@`、`@@`：什么都不是", () => {
    expect(扫引用("@ 和 @@x")).toEqual([{ path: "x", start: 5, end: 7 }])
  })
})

describe("展开引用 · 发送前只验存在", () => {
  const 盘 = new Map<string, "file" | "directory">([
    ["data/a.csv", "file"],
    ["results", "directory"],
  ])
  const 查 = async (p: string) => 盘.get(p)

  it("存在的拼成 <workspace-reference>，附在原文后面；**原文一字不动**", async () => {
    const r = await 展开引用("看看 @data/a.csv 和 @results/", 查)
    expect(r.refs).toEqual([
      { path: "data/a.csv", kind: "file" },
      { path: "results", kind: "directory" },
    ])
    expect(r.text).toBe(
      '看看 @data/a.csv 和 @results/\n\n<workspace-reference path="data/a.csv" kind="file" />\n<workspace-reference path="results" kind="directory" />',
    )
  })
  it("不存在的留作普通文字——`@alice` 这种 handle 什么都不发生", async () => {
    const r = await 展开引用("问问 @alice", 查)
    expect(r).toEqual({ text: "问问 @alice", refs: [] })
  })
  it("绝对路径、`~`、`..` 越界的不认——引用只指工作区里的东西", async () => {
    const 全认 = async () => "file" as const
    const r = await 展开引用("@/etc/passwd @~/.ssh/id_rsa @../secret @C:/x", 全认)
    expect(r.refs).toEqual([])
  })
  it("查的时候抛了 = 不存在，不让一条引用炸掉整句话", async () => {
    const r = await 展开引用("@a", async () => { throw new Error("ENOENT") })
    expect(r.refs).toEqual([])
  })
  it("远端带 host；属性转义，路径本身不改", () => {
    expect(引用标记({ path: 'a"b<c>.csv', kind: "file" }, "conn-1")).toBe('<workspace-reference path="a&quot;b&lt;c&gt;.csv" kind="file" host="conn-1" />')
  })
})
