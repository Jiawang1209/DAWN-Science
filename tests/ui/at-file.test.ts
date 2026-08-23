/**
 * `@` 菜单的纯逻辑（2026-08-23，学自 dsh-at-file）：什么时候算在打 `@`、选完写成什么、候选怎么排。
 */
import { describe, expect, it } from "vitest"
import { 在打艾特, 艾特选完, 抠掉引用, 排路径, 成候选行 } from "../../src/ui/at-file.js"

describe("在打艾特", () => {
  it("行首 / 空白后的 `@`，光标在它后面：在打", () => {
    expect(在打艾特("@", 1)).toEqual({ start: 0, end: 1, query: "" })
    expect(在打艾特("看 @da", 5)).toEqual({ start: 2, end: 5, query: "da" })
    expect(在打艾特("@src/", 5)).toEqual({ start: 0, end: 5, query: "src/" })
  })
  it("邮箱里的 `@` 不算；打了空格就不算；光标不在令牌里不算", () => {
    expect(在打艾特("a@b", 3)).toBeUndefined()
    expect(在打艾特("@a ", 3)).toBeUndefined()
    expect(在打艾特("@a b", 4)).toBeUndefined()
  })
})

describe("艾特选完 / 抠掉引用", () => {
  it("文件 → `@路径 `；目录 → `@路径/ `；钻目录 → `@路径/` 不加空格", () => {
    const 位 = { start: 2, end: 5, query: "da" }
    expect(艾特选完("看 @da 完", 位, "data/a.csv", "file")).toEqual({ draft: "看 @data/a.csv  完", caret: 14 })
    expect(艾特选完("看 @da", 位, "data", "dir")).toEqual({ draft: "看 @data/ ", caret: 9 })
    expect(艾特选完("看 @da", 位, "data", "dir", true)).toEqual({ draft: "看 @data/", caret: 8 })
  })
  it("抠掉一个引用连着后面那个空格一起抠；别的引用不动", () => {
    expect(抠掉引用("看 @a.csv 和 @b.csv", "a.csv")).toBe("看 和 @b.csv")
    expect(抠掉引用("看 @a.csv", "zzz")).toBe("看 @a.csv")
  })
})

describe("排路径（照 dsh-at-file 的 rankFiles）", () => {
  const 条 = [
    { path: "src/client/view.ts", kind: "file" as const },
    { path: "src/view.ts", kind: "file" as const },
    { path: "README.md", kind: "file" as const },
    { path: "src", kind: "dir" as const },
    { path: "data", kind: "dir" as const },
    { path: "data/raw/review-2020.csv", kind: "file" as const },
  ]
  it("空关键词 = 浏览：浅的在前、同层目录在前", () => {
    expect(排路径(条, "", 10).map((x) => x.path)).toEqual(["data", "src", "README.md", "src/view.ts", "data/raw/review-2020.csv", "src/client/view.ts"])
  })
  it("纯关键词只匹配文件名：完整 > 前缀 > 子串 > 子序列；深处散落的字母不产生无关结果", () => {
    expect(排路径(条, "view", 10).map((x) => x.path)).toEqual(["src/view.ts", "src/client/view.ts", "data/raw/review-2020.csv"])
    // `rvw` 在 review 里是子序列；`src/client/view.ts` 的文件名里没有 r
    expect(排路径(条, "rvw", 10).map((x) => x.path)).toEqual(["data/raw/review-2020.csv"])
  })
  it("带 `/` 按路径段顺序匹配：`src/view` 找到 `src/client/view.ts`；`src/` 是列这个目录下的", () => {
    expect(排路径(条, "src/view", 10).map((x) => x.path)).toEqual(["src/view.ts", "src/client/view.ts"])
    expect(排路径(条, "src/", 10).map((x) => x.path)).toEqual(["src/view.ts", "src/client/view.ts"])
  })
  it("limit 截断", () => {
    expect(排路径(条, "", 2)).toHaveLength(2)
  })
})

describe("成候选行", () => {
  it("主标题是文件名；重名时把父目录写进主标题——人眼扫的是主标题", () => {
    const 行 = 成候选行([
      { path: "src/view.ts", kind: "file" },
      { path: "src/client/view.ts", kind: "file" },
      { path: "README.md", kind: "file" },
    ])
    expect(行.map((r) => [r.name, r.dir])).toEqual([
      ["view.ts - src", "src"],
      ["view.ts - src/client", "src/client"],
      ["README.md", undefined],
    ])
  })
})
