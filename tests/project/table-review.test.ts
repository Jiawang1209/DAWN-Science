/**
 * 表格摘要走**真 git 仓库**（2026-08-18）。
 *
 * 这一层的要害不是「`比两张表` 算得对不对」——那有它自己的 11 条判据。
 * 这里验的是**旧的那一张表从哪儿来**：`git show HEAD:` 拿不到、拿错、
 * 或者悄悄拿成工作区里那一份，症状都是「摘要说没变」，而那是最坏的一种错。
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest"
import { execFileSync } from "node:child_process"
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { 表格摘要, 表格比较行上限 } from "../../src/project/table-review.js"

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "t",
      GIT_AUTHOR_EMAIL: "t@t",
      GIT_COMMITTER_NAME: "t",
      GIT_COMMITTER_EMAIL: "t@t",
    },
  })
}

let repo: string

/** 写一份文件并提交，作为 `HEAD` 里的那一版 */
function 提交(相对路径: string, 正文: string): void {
  const 全 = join(repo, 相对路径)
  mkdirSync(join(全, ".."), { recursive: true })
  writeFileSync(全, 正文)
  git(repo, "add", "-A")
  git(repo, "commit", "-q", "-m", `写 ${相对路径}`)
}

const 改 = (相对路径: string, 正文: string) => writeFileSync(join(repo, 相对路径), 正文)

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), "dawn-tablerev-"))
  git(repo, "init", "-q", "-b", "main")
  writeFileSync(join(repo, "seed.txt"), "seed\n")
  git(repo, "add", ".")
  git(repo, "commit", "-q", "-m", "seed")
})
afterEach(() => rmSync(repo, { recursive: true, force: true }))

describe("表格摘要", () => {
  it("**一列换了单位**：一句「乘了 1000」，而不是「每一行都变了」", async () => {
    提交("d.csv", "样品,质量\na,1\nb,2\nc,3\n")
    改("d.csv", "样品,质量\na,1000\nb,2000\nc,3000\n")

    const r = await 表格摘要(repo, "d.csv")
    expect(r?.kind).toBe("diff")
    if (r?.kind !== "diff") throw new Error("上一句已经断言过了")
    expect(r.scaled).toEqual([{ column: "质量", factor: 1000 }])
    // **被「整列乘了个因子」解释掉的格不再逐格重复** —— 那正是噪声的来源
    expect(r.cellsTotal).toBe(0)
  })

  it("**只是重排**：一行都没少，逐行 diff 却会说「全文件重写」", async () => {
    提交("d.csv", "n\na\nb\nc\n")
    改("d.csv", "n\nc\na\nb\n")

    const r = await 表格摘要(repo, "d.csv")
    expect(r).toMatchObject({ kind: "diff", reordered: true })
  })

  it("改列名认成**改名**，不是「删一个加一个」", async () => {
    提交("d.csv", "样品,质量\na,1\nb,2\n")
    改("d.csv", "样品,mass\na,1\nb,2\n")

    const r = await 表格摘要(repo, "d.csv")
    if (r?.kind !== "diff") throw new Error("应该是 diff")
    expect(r.columns).toEqual([{ kind: "renamed", name: "mass", from: "质量" }])
  })

  it("**旧的那一张真的来自 `HEAD`**，不是工作区里那一份", async () => {
    提交("d.csv", "n\n1\n2\n")
    改("d.csv", "n\n10\n20\n")

    const r = await 表格摘要(repo, "d.csv")
    if (r?.kind !== "diff") throw new Error("应该是 diff")
    // 拿工作区那份当旧版的话，这里会是「什么都没变」
    expect(r.scaled).toEqual([{ column: "n", factor: 10 }])
  })

  it("**新增的文件没有摘要**：「所有行都是新加的」正确但毫无信息量", async () => {
    改("新的.csv", "a,b\n1,2\n")
    expect(await 表格摘要(repo, "新的.csv")).toBeUndefined()
  })

  it("**不是表就没有摘要** —— 代码文件走逐行 diff 那一支", async () => {
    提交("a.py", "print(1)\n")
    改("a.py", "print(2)\n")
    expect(await 表格摘要(repo, "a.py")).toBeUndefined()
  })

  it("工作区里已经删掉的文件不给摘要，也**不抛**", async () => {
    提交("d.csv", "a,b\n1,2\n")
    rmSync(join(repo, "d.csv"))
    expect(await 表格摘要(repo, "d.csv")).toBeUndefined()
  })

  it("**表太大就说没比** —— 只比前面一段会得出错的结论", async () => {
    const 行 = (i: number) => `${i},${i}\n`
    let 旧 = "a,b\n"
    for (let i = 0; i < 表格比较行上限 + 5; i++) 旧 += 行(i)
    提交("大.csv", 旧)
    改("大.csv", 旧.replace("0,0\n", "0,1\n"))

    const r = await 表格摘要(repo, "大.csv")
    expect(r?.kind).toBe("skipped")
    // **说清楚读了多少**，不是笼统一句「失败」（规格 7.5）
    if (r?.kind !== "skipped") throw new Error("应该是 skipped")
    expect(r.reason).toContain(String(表格比较行上限))
  })

  it("上一版**不是一张表**时如实说，而不是沉默", async () => {
    // `.txt` 按内容判：散文那一版不是表，改成对齐的三列之后是表
    提交("x.txt", "这是一段散文，随便写的。\n第二句话，长度不一样，逗号数量也不一样。\n")
    改("x.txt", "a,b,c\n1,2,3\n4,5,6\n")

    const r = await 表格摘要(repo, "x.txt")
    expect(r?.kind).toBe("skipped")
  })
})
