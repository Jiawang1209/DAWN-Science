/**
 * 文件名搜索的走法（dock-polish ③，2026-08-21）。
 * 学自 DSH-better-sidebar：**有预算、截断出声、不跟符号链接**。
 */
import { describe, expect, it } from "vitest"
import { 搜文件名, type 搜索条目 } from "../../src/files/search.js"

/** 一棵假树：路径 → 子项 */
function 假树(树: Record<string, 搜索条目[]>) {
  const 读过: string[] = []
  const readdir = async (dir: string) => {
    读过.push(dir)
    const v = 树[dir]
    if (!v) throw new Error(`ENOENT ${dir}`)
    return v
  }
  return { readdir, 读过 }
}
const f = (name: string): 搜索条目 => ({ name, kind: "file" })
const d = (name: string): 搜索条目 => ({ name, kind: "dir" })

describe("搜文件名", () => {
  it("按名字不分大小写地子串匹配，**浅的先出**，目录也算", async () => {
    const { readdir } = 假树({
      "": [d("src"), f("README.md"), d("docs")],
      src: [f("Main.ts"), d("ui")],
      "src/ui": [f("main-view.tsx")],
      docs: [f("main.md")],
    })
    const r = await 搜文件名(readdir, "", "main")
    expect(r.matches.map((m) => m.path)).toEqual(["src/Main.ts", "docs/main.md", "src/ui/main-view.tsx"])
    expect(r.truncated).toBeUndefined()
  })

  it("查询里带 `/` 就对相对路径匹配", async () => {
    const { readdir } = 假树({ "": [d("a"), d("b")], a: [f("x.ts")], b: [f("x.ts")] })
    const r = await 搜文件名(readdir, "", "b/x")
    expect(r.matches.map((m) => m.path)).toEqual(["b/x.ts"])
  })

  it("默认忽略的目录不进去（.git / node_modules…），**但告诉人跳过了几个**", async () => {
    const { readdir, 读过 } = 假树({
      "": [d(".git"), d("node_modules"), d("src")],
      src: [f("a.ts")],
    })
    const r = await 搜文件名(readdir, "", "a")
    expect(读过).not.toContain(".git")
    expect(读过).not.toContain("node_modules")
    expect(r.skippedDirs).toBe(2)
  })

  it("**符号链接不进去**（目录环会把预算全吃掉）", async () => {
    const { readdir, 读过 } = 假树({
      "": [{ name: "loop", kind: "dir", symlink: true }, f("z.txt")],
      loop: [d("loop")],
    })
    await 搜文件名(readdir, "", "z")
    expect(读过).toEqual([""])
  })

  it("命中到上限就停，说是 `matches`", async () => {
    const 多 = Array.from({ length: 50 }, (_, i) => f(`hit-${i}.txt`))
    const { readdir } = 假树({ "": 多 })
    const r = await 搜文件名(readdir, "", "hit", { maxMatches: 10 })
    expect(r.matches).toHaveLength(10)
    expect(r.truncated).toBe("matches")
  })

  it("看过的条目到上限就停，说是 `visited`，并报看了多少", async () => {
    const 树: Record<string, 搜索条目[]> = { "": [] }
    for (let i = 0; i < 30; i++) {
      树[""]!.push(d(`d${i}`))
      树[`d${i}`] = Array.from({ length: 20 }, (_, j) => f(`f${j}.txt`))
    }
    const { readdir } = 假树(树)
    const r = await 搜文件名(readdir, "", "不存在的名字", { maxVisited: 100 })
    expect(r.truncated).toBe("visited")
    expect(r.visited).toBeGreaterThanOrEqual(100)
    expect(r.visited).toBeLessThan(160)
  })

  it("超时就停，说是 `time`；已经找到的照样给", async () => {
    let now = 0
    const readdir = async (dir: string): Promise<搜索条目[]> => {
      now += 50
      return dir === "" ? [f("slow.txt"), d("x"), d("y")] : [f("slow2.txt")]
    }
    const r = await 搜文件名(readdir, "", "slow", { timeoutMs: 60, clock: () => now })
    expect(r.truncated).toBe("time")
    expect(r.matches.map((m) => m.path)).toContain("slow.txt")
  })

  it("读不了的目录跳过不炸，计入 `unreadable`", async () => {
    const { readdir } = 假树({ "": [d("ok"), d("bad")], ok: [f("q.txt")] })
    const r = await 搜文件名(readdir, "", "q")
    expect(r.matches.map((m) => m.path)).toEqual(["ok/q.txt"])
    expect(r.unreadable).toBe(1)
  })

  it("根是绝对路径（远端）时，结果也是绝对路径", async () => {
    const { readdir } = 假树({ "/home/dawn": [d("数据")], "/home/dawn/数据": [f("样本.csv")] })
    const r = await 搜文件名(readdir, "/home/dawn", "样本")
    expect(r.matches.map((m) => m.path)).toEqual(["/home/dawn/数据/样本.csv"])
  })

  it("空查询什么都不搜", async () => {
    const { readdir, 读过 } = 假树({ "": [f("a")] })
    const r = await 搜文件名(readdir, "", "   ")
    expect(r.matches).toEqual([])
    expect(读过).toEqual([])
  })
})
