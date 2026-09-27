/**
 * 回退这一轮的影子存档（2026-09-27，spec `2026-09-27-回退这一轮-design.md` §4.1）。
 * 真文件系统（临时目录），不 mock `fs`——克隆 / 拷贝 / 权限位这些只有真盘上才说得准。
 */
import { afterEach, describe, expect, it } from "vitest"
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { 检查点存档 } from "../../src/project/checkpoints.js"

const dirs: string[] = []
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

function 新的(选项: ConstructorParameters<typeof 检查点存档>[2] = {}) {
  const d = mkdtempSync(join(tmpdir(), "dawn-ckpt-"))
  dirs.push(d)
  const ws = join(d, "ws")
  mkdirSync(ws)
  const 存档目录 = join(d, "session", "checkpoints")
  const 喊了: string[] = []
  const 存 = new 检查点存档(ws, 存档目录, { 喊: (话) => 喊了.push(话), ...选项 })
  return { ws, 存档目录, 存, 喊了, 重开: () => new 检查点存档(ws, 存档目录, { 喊: (话) => 喊了.push(话), ...选项 }) }
}
export const 写 = (ws: string, p: string, s: string | Buffer) => {
  mkdirSync(dirname(join(ws, p)), { recursive: true })
  writeFileSync(join(ws, p), s)
}
export const 读 = (ws: string, p: string) => readFileSync(join(ws, p), "utf8")
const 对象数 = (存档目录: string) => readdirSync(join(存档目录, "objects")).length

describe("影子存档 · 拍", () => {
  it("第一句的开头：把工作区里的文件都存一份；同一句第二件工具不再拍", async () => {
    const { ws, 存档目录, 存 } = 新的()
    写(ws, "a.py", "print(1)\n")
    写(ws, "out/图.txt", "旧\n")
    await 存.开轮("e1")
    expect(对象数(存档目录)).toBe(2)
    await 存.开轮("e1")
    expect(存.段落()).toEqual([{ kind: "turn", entry: "e1", start: "s1" }])
  })

  it("收尾只拍 stat、不存；下一句开头只存变过的", async () => {
    const { ws, 存档目录, 存 } = 新的()
    写(ws, "a.py", "print(1)\n")
    await 存.开轮("e1")
    写(ws, "a.py", "print(22)\n")
    await 存.收尾()
    expect(对象数(存档目录), "收尾不存内容").toBe(1)
    await 存.开轮("e2")
    expect(对象数(存档目录), "a.py 的新版在下一句开头存下").toBe(2)
    expect(存.段落()).toEqual([
      { kind: "turn", entry: "e1", start: "s1", end: "s2" },
      { kind: "turn", entry: "e2", start: "s3" },
    ])
  })

  it("同一轮里 pi 送进下一句：同一张既是上一句的结尾、也是这一句的开头", async () => {
    const { ws, 存 } = 新的()
    写(ws, "a.py", "1\n")
    await 存.开轮("e1")
    写(ws, "a.py", "22\n")
    await 存.开轮("e2")
    expect(存.段落()).toEqual([
      { kind: "turn", entry: "e1", start: "s1", end: "s2" },
      { kind: "turn", entry: "e2", start: "s2" },
    ])
  })

  it("重开：段、起点、已存字节都读得回来", async () => {
    const { ws, 存, 重开 } = 新的()
    存.记起点("leaf-0")
    写(ws, "a.py", "1\n")
    await 存.开轮("e1")
    await 存.收尾()
    const 又 = 重开()
    expect(又.起点()).toBe("leaf-0")
    expect(又.段落()).toEqual(存.段落())
    又.记起点("leaf-9")
    expect(又.起点(), "起点只记第一次").toBe("leaf-0")
  })
})

describe("影子存档 · 上限与跳过（spec §5）", () => {
  it("超过单个上限的不存，记 too_large", async () => {
    const { ws, 存档目录, 存 } = 新的({ 单个上限: 10 })
    写(ws, "big.csv", "0123456789ABC")
    写(ws, "small.txt", "x")
    await 存.开轮("e1")
    expect(对象数(存档目录)).toBe(1)
  })

  it("data/raw 一律不存（原始数据，回退不碰它）", async () => {
    const { ws, 存档目录, 存 } = 新的()
    写(ws, "data/raw/survey.csv", "id,v\n1,2\n")
    await 存.开轮("e1")
    expect(对象数(存档目录)).toBe(0)
  })

  it("存档满了：之后的不存，**只喊一次**", async () => {
    const { ws, 存档目录, 存, 喊了 } = 新的({ 总上限: 6 })
    写(ws, "a.txt", "1234")
    写(ws, "b.txt", "5678")
    写(ws, "c.txt", "9abc")
    await 存.开轮("e1")
    expect(对象数(存档目录)).toBe(1)
    await 存.收尾()
    写(ws, "d.txt", "zzzz")
    await 存.开轮("e2")
    expect(喊了.filter((x) => x.includes("存档满了"))).toHaveLength(1)
  })

  it("文件数超上限：这一句记断档、喊一次，不装作存上了", async () => {
    const { ws, 存, 喊了 } = 新的({ cap: 2 })
    for (const n of ["a", "b", "c"]) 写(ws, `${n}.txt`, n)
    await 存.开轮("e1")
    await 存.开轮("e2")
    expect(存.段落()).toEqual([
      { kind: "gap", entry: "e1", reason: "too_many_files" },
      { kind: "gap", entry: "e2", reason: "too_many_files" },
    ])
    expect(喊了.filter((x) => x.includes("没法存档"))).toHaveLength(1)
  })

  it(".dawn 与 node_modules 里的不扫（沿用 FS_SKIP_DIRS）", async () => {
    const { ws, 存档目录, 存 } = 新的()
    写(ws, ".dawn/trash/x.txt", "x")
    写(ws, "node_modules/p/index.js", "x")
    await 存.开轮("e1")
    expect(对象数(存档目录)).toBe(0)
    expect(existsSync(join(存档目录, "snapshots.jsonl"))).toBe(true)
  })
})

/** 演一轮：开头 → agent 动手 → 收尾 */
async function 一轮(存: 检查点存档, entry: string, 动手: () => void) {
  await 存.开轮(entry)
  动手()
  await 存.收尾()
}
const 之后 = (...entries: string[]) => ({ 之后的用户: entries, 在存档之前: false })

describe("影子存档 · 计划（spec §4.2）", () => {
  it("回到第二句之前：改过的改回去、新建的挪走、没动的不列", async () => {
    const { ws, 存 } = 新的()
    写(ws, "a.py", "v1\n")
    写(ws, "keep.md", "不动\n")
    await 一轮(存, "e1", () => 写(ws, "a.py", "v2 第一句\n"))
    await 一轮(存, "e2", () => {
      写(ws, "a.py", "v3 第二句改的\n")
      写(ws, "out/图.txt", "新的\n")
    })
    const r = await 存.计划(之后("e2"))
    expect(r).toEqual({ ok: true, restore: ["a.py"], remove: ["out/图.txt"], keep: [], cannot: [] })
  })

  it("这句之后 agent 没动过文件：空计划，不是「不知道」", async () => {
    const { 存 } = 新的()
    expect(await 存.计划(之后("e7"))).toEqual({ ok: true, restore: [], remove: [], keep: [], cannot: [] })
  })

  it("你在两轮之间改的（S 之前）不退；你在之后改的不动", async () => {
    const { ws, 存 } = 新的()
    写(ws, "a.py", "v1\n")
    写(ws, "notes.md", "n1\n")
    await 一轮(存, "e1", () => 写(ws, "a.py", "v2\n"))
    写(ws, "a.py", "你改的 v2+\n") // 两轮之间你改的
    await 一轮(存, "e2", () => {
      写(ws, "a.py", "v3\n")
      写(ws, "notes.md", "n2 agent\n")
    })
    写(ws, "notes.md", "n3 你后来又改\n")
    const r = await 存.计划(之后("e2"))
    expect(r).toEqual({ ok: true, restore: ["a.py"], remove: [], keep: [{ path: "notes.md", reason: "changed_after" }], cannot: [] })
  })

  it("存不了的：too_large 带大小；data/raw 被改了也只列不碰", async () => {
    const { ws, 存 } = 新的({ 单个上限: 8 })
    写(ws, "big.csv", "0123456789")
    写(ws, "data/raw/s.csv", "raw\n")
    await 一轮(存, "e1", () => {
      写(ws, "big.csv", "0123456789AB")
      写(ws, "data/raw/s.csv", "被改了\n")
    })
    const r = await 存.计划(之后("e1"))
    expect(r).toEqual({
      ok: true,
      restore: [],
      remove: [],
      keep: [],
      cannot: [
        { path: "big.csv", reason: "too_large", size: 10 },
        { path: "data/raw/s.csv", reason: "raw_data" },
      ],
    })
  })

  it("在存档之前 / 之后有断档：文件回退不了，说清是哪一种", async () => {
    const { ws, 存 } = 新的({ cap: 1 })
    写(ws, "a", "1")
    expect(await 存.计划({ 之后的用户: ["e1"], 在存档之前: true })).toEqual({ ok: false, reason: "before_archive" })
    写(ws, "b", "2")
    await 存.开轮("e1") // 两个文件 > cap 1 → 断档
    expect(await 存.计划(之后("e1"))).toEqual({ ok: false, reason: "gap" })
  })
})

describe("影子存档 · 回退", () => {
  it("一起做：改回去、挪进 .dawn/trash、权限位照设；工作区别的文件不动", async () => {
    const { ws, 存 } = 新的({ now: () => new Date("2026-09-27T10:00:00Z") })
    写(ws, "run.sh", "echo v1\n")
    ;(await import("node:fs")).chmodSync(join(ws, "run.sh"), 0o755)
    写(ws, "other.txt", "别动我\n")
    await 一轮(存, "e1", () => {
      写(ws, "run.sh", "echo v2 坏了\n")
      写(ws, "figures/fig1.png", "PNG")
    })
    const r = await 存.回退(之后("e1"))
    expect(r).toMatchObject({ restored: ["run.sh"], removed: ["figures/fig1.png"], failed: [] })
    expect(r.trash).toBe(".dawn/trash/rewind-2026-09-27T10-00-00-000Z")
    expect(读(ws, "run.sh")).toBe("echo v1\n")
    expect((await import("node:fs")).statSync(join(ws, "run.sh")).mode & 0o777).toBe(0o755)
    expect(existsSync(join(ws, "figures/fig1.png"))).toBe(false)
    expect(读(ws, `${r.trash}/figures/fig1.png`)).toBe("PNG")
    expect(读(ws, `${r.trash}/run.sh`), "换下来的那份也在废纸篓").toBe("echo v2 坏了\n")
    expect(existsSync(join(ws, "figures")), "目录不删").toBe(true)
    expect(读(ws, "other.txt")).toBe("别动我\n")
  })

  it("回退本身算「我们的」：只回退文件之后再往前退，不把它当成你改的", async () => {
    const { ws, 存 } = 新的()
    写(ws, "a.py", "v1\n")
    await 一轮(存, "e1", () => 写(ws, "a.py", "v2\n"))
    await 一轮(存, "e2", () => 写(ws, "a.py", "v3\n"))
    await 存.回退(之后("e2")) // 只回退文件：a.py 回到 v2
    expect(读(ws, "a.py")).toBe("v2\n")
    await 一轮(存, "e3", () => 写(ws, "b.py", "新\n"))
    const r = await 存.回退(之后("e1", "e2", "e3"))
    expect(r.keep).toEqual([])
    expect(读(ws, "a.py")).toBe("v1\n")
    expect(existsSync(join(ws, "b.py"))).toBe(false)
  })

  it("data/raw 一个字节都不动", async () => {
    const { ws, 存 } = 新的()
    写(ws, "data/raw/s.csv", "原始\n")
    await 一轮(存, "e1", () => 写(ws, "data/raw/s.csv", "agent 不该改的\n"))
    const r = await 存.回退(之后("e1"))
    expect(r.cannot).toEqual([{ path: "data/raw/s.csv", reason: "raw_data" }])
    expect(读(ws, "data/raw/s.csv")).toBe("agent 不该改的\n")
  })

  it("改回去失败（旧版本那份没了）：现在那份不丢，列进 failed", async () => {
    const { ws, 存档目录, 存 } = 新的()
    写(ws, "a.py", "v1\n")
    await 一轮(存, "e1", () => 写(ws, "a.py", "v2\n"))
    for (const f of readdirSync(join(存档目录, "objects"))) rmSync(join(存档目录, "objects", f))
    const r = await 存.回退(之后("e1"))
    expect(r.failed.map((x) => x.path)).toEqual(["a.py"])
    expect(读(ws, "a.py")).toBe("v2\n")
  })

  it("文件回退不了时抛「回退不了」，带缘故", async () => {
    const { 存 } = 新的()
    await expect(存.回退({ 之后的用户: ["e1"], 在存档之前: true })).rejects.toMatchObject({ reason: "before_archive" })
  })
})
