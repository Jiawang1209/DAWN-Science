/**
 * `@路径` 引用（2026-08-23，学自 dsh-at-file）。
 * 三件事：识别什么、不识别什么；发送前怎么展开；展开不碰原文。
 */
import { describe, expect, it, vi } from "vitest"
import { splitLinkedScriptPrompt } from "../../src/protocol/script-context.js"
import { 扫引用, 展开引用, 引用标记, 护住粘贴的艾特, 剥掉粘贴标记, 粘贴标记, 编文件规则, 规则的毛病, 扫内核指令 } from "../../src/files/mentions.js"

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

describe("第二档 · 粘贴的 `@` 不算", () => {
  it("护住：每个 `@x` 后面塞一个零宽标记；扫引用看见标记就跳过；剥掉之后一字不差", () => {
    const 原 = "问问 @alice 看看 @data/a.csv"
    const 护 = 护住粘贴的艾特(原)
    expect(护).not.toBe(原)
    expect(护.replaceAll(粘贴标记, "")).toBe(原)
    expect(扫引用(护)).toEqual([])
    expect(剥掉粘贴标记(护)).toBe(原)
    // 人接着打的不受影响
    expect(扫引用(`${护} 再看 @b.csv`).map((r) => r.path)).toEqual(["b.csv"])
  })
  it("没有 `@` 的文字原样不动", () => {
    expect(护住粘贴的艾特("hello @ world")).toBe("hello @ world")
  })
})

describe("第二档 · 文件名过滤规则", () => {
  it("精确：默认不分大小写；正则：按 pattern；都只看文件名", () => {
    const 滤 = 编文件规则([
      { kind: "exact", pattern: ".ds_store", caseSensitive: false },
      { kind: "regex", pattern: "\\.tmp$", caseSensitive: false },
      { kind: "exact", pattern: "Thumbs.db", caseSensitive: true },
    ])
    expect(滤(".DS_Store")).toBe(true)
    expect(滤("x.TMP")).toBe(true)
    expect(滤("Thumbs.db")).toBe(true)
    expect(滤("thumbs.db")).toBe(false)
    expect(滤("data.csv")).toBe(false)
  })
  it("坏规则在存之前就说得出毛病；编的时候跳过它", () => {
    expect(规则的毛病({ kind: "regex", pattern: "(", caseSensitive: false })).toMatch(/Invalid|Unterminated|regular expression/i)
    expect(规则的毛病({ kind: "exact", pattern: "a/b", caseSensitive: false })).toMatch(/分隔符/)
    expect(规则的毛病({ kind: "exact", pattern: "", caseSensitive: false })).toBe("空的")
    expect(规则的毛病({ kind: "regex", pattern: "^x", caseSensitive: true })).toBeUndefined()
    expect(编文件规则([{ kind: "regex", pattern: "(", caseSensitive: false }])("anything")).toBe(false)
  })
})


describe("内核快捷入口不是文件引用", () => {
  it("保留三个入口，显式相对路径与同名前缀仍是文件", () => {
    expect(扫引用("@R @Py @Python @RPython @./R @R.csv @Py/" ).map(r => r.path)).toEqual(["./R", "R.csv", "Py"])
  })
})


describe("关联脚本上下文保持原文", () => {
  function linked(instruction: string, source = '# @snapshot.csv\n@R\nword\u2060joiner\n') {
    const envelope = '\n\n<!-- dawn-linked-script:unicode:a.R -->\n\n当前脚本 @label.csv，入口 @Py\n\n```R\n' + source + '```\n\n<!-- dawn-script-edit:unicode -->\n\n<!-- dawn-linked-script-end:unicode -->'
    return { text: instruction + envelope, envelope }
  }

  it("粘贴标记只从本轮要求剥掉，转录与模型两次处理都保留脚本中的真实 Unicode", () => {
    const { text, envelope } = linked('解释 @\u2060pasted.csv')
    const transcript = 剥掉粘贴标记(text)
    expect(transcript).toBe('解释 @pasted.csv' + envelope)
    expect(剥掉粘贴标记(transcript)).toBe(transcript)
    expect(splitLinkedScriptPrompt(transcript)?.instruction).toBe('解释 @pasted.csv')
  })

  it("脚本和标签中的引用不是本轮文件或内核手势", async () => {
    const { text } = linked('解释代码')
    const 查 = vi.fn(async () => 'file' as const)
    expect(扫引用(text)).toEqual([])
    expect(扫内核指令(text)).toEqual([])
    expect(await 展开引用(text, 查)).toEqual({ text, refs: [] })
    expect(查).not.toHaveBeenCalled()
  })

  it("本轮输入的引用在不可变脚本包之前展开，远端引用和识别坐标保留原语义", async () => {
    const instruction = '请用 @Py 看 @typed.csv'
    const { text, envelope } = linked(instruction)
    const 查 = vi.fn(async () => 'file' as const)
    expect(扫引用(text)).toEqual([{ path: 'typed.csv', start: instruction.indexOf('@typed.csv'), end: instruction.length }])
    expect(扫内核指令(text)).toMatchObject([{ token: 'Py', start: 3, end: 6 }])
    const expanded = await 展开引用(text, 查, 'remote-1')
    const reference = '<workspace-reference path="typed.csv" kind="file" host="remote-1" />'
    expect(expanded).toEqual({ text: instruction + '\n\n' + reference + envelope, refs: [{ path: 'typed.csv', kind: 'file' }] })
    expect(查.mock.calls).toEqual([['typed.csv']])
    const parsed = splitLinkedScriptPrompt(expanded.text)!
    expect(parsed.instruction).toBe(instruction + '\n\n' + reference)
    expect(expanded.text.slice(parsed.instruction.length)).toBe(envelope)
    expect(剥掉粘贴标记(expanded.text)).toBe(expanded.text)
  })
})
