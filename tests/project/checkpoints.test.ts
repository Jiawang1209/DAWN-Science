/**
 * 回退这一轮的影子存档（2026-09-27，spec `2026-09-27-回退这一轮-design.md` §4.1）。
 * 真文件系统（临时目录），不 mock `fs`——克隆 / 拷贝 / 权限位这些只有真盘上才说得准。
 */
import { afterEach, describe, expect, it } from "vitest"
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { 检查点存档, 路径合法 } from "../../src/project/checkpoints.js"

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

/**
 * 回退挪的是你的科研文件（2026-09-27 审查复现的几条）：**不写到工作区外面、不在没留副本的情况下覆盖或挪走任何东西、
 * 做了什么（哪怕只做了一半）都要说出来**。
 */
describe("影子存档 · 回退的数据安全", () => {
  it("agent 把目录换成指向外面的链接：不跟进去写，外面的文件一个字节不动", async () => {
    const { ws, 存 } = 新的()
    const 外面 = join(dirname(ws), "outside")
    mkdirSync(外面)
    writeFileSync(join(外面, "r.csv"), "外面的宝贝")
    写(ws, "out/r.csv", "v1")
    await 一轮(存, "e1", () => {
      rmSync(join(ws, "out"), { recursive: true })
      symlinkSync(外面, join(ws, "out"))
    })
    const r = await 存.回退(之后("e1"))
    expect(r.restored).toEqual([])
    expect(r.failed.map((x) => x.path)).toEqual(["out/r.csv"])
    expect(r.failed[0]!.message).toMatch(/链接/)
    expect(readFileSync(join(外面, "r.csv"), "utf8")).toBe("外面的宝贝")
    expect(readdirSync(外面)).toEqual(["r.csv"])
  })

  it(".dawn 是指向外面的链接：不往那里挪，文件原地不动、列进 failed", async () => {
    const { ws, 存 } = 新的()
    const 外面 = join(dirname(ws), "outside")
    mkdirSync(外面)
    await 一轮(存, "e1", () => 写(ws, "new.txt", "agent 新建"))
    symlinkSync(外面, join(ws, ".dawn"))
    const r = await 存.回退(之后("e1"))
    expect(r.removed).toEqual([])
    expect(r.failed.map((x) => x.path)).toEqual(["new.txt"])
    expect(读(ws, "new.txt")).toBe("agent 新建")
    expect(readdirSync(外面)).toEqual([])
  })

  it("原处现在是悬空链接：不覆盖它，列进 failed", async () => {
    const { ws, 存 } = 新的()
    写(ws, "a.txt", "v1")
    await 一轮(存, "e1", () => {
      rmSync(join(ws, "a.txt"))
      symlinkSync("/nonexistent/target", join(ws, "a.txt"))
    })
    const r = await 存.回退(之后("e1"))
    expect(r.restored).toEqual([])
    expect(r.failed.map((x) => x.path)).toEqual(["a.txt"])
    expect(lstatSync(join(ws, "a.txt")).isSymbolicLink()).toBe(true)
  })

  it("文件被换成目录：不把整个目录挪进废纸篓，data/raw 原地不动", async () => {
    const { ws, 存 } = 新的()
    写(ws, "data", "一个叫 data 的文件")
    await 一轮(存, "e1", () => {
      rmSync(join(ws, "data"))
      写(ws, "data/x.csv", "agent")
    })
    写(ws, "data/raw/survey.csv", "原始数据")
    const r = await 存.回退(之后("e1"))
    expect(r.removed).toEqual(["data/x.csv"])
    expect(r.failed.map((x) => x.path)).toEqual(["data"])
    expect(r.failed[0]!.message).toMatch(/目录/)
    expect(读(ws, "data/raw/survey.csv")).toBe("原始数据")
  })

  it("目录被换成同名文件：挪走那个文件、目录建回来、里面的文件改回去", async () => {
    const { ws, 存 } = 新的()
    写(ws, "d/f.txt", "v1")
    await 一轮(存, "e1", () => {
      rmSync(join(ws, "d"), { recursive: true })
      写(ws, "d", "agent 写的文件")
    })
    const r = await 存.回退(之后("e1"))
    expect(r).toMatchObject({ restored: ["d/f.txt"], removed: ["d"], failed: [] })
    expect(读(ws, "d/f.txt")).toBe("v1")
    expect(读(ws, `${r.trash}/d`)).toBe("agent 写的文件")
  })

  it("只改了大小写的改名（大小写不敏感的盘）：名字和内容都回来", async () => {
    const { ws, 存 } = 新的()
    写(ws, "Fig.png", "v1")
    if (!existsSync(join(ws, "fig.png"))) return // 大小写敏感的盘：这条不适用
    await 一轮(存, "e1", () => {
      renameSync(join(ws, "Fig.png"), join(ws, "fig.png"))
      writeFileSync(join(ws, "fig.png"), "v2")
    })
    const r = await 存.回退(之后("e1"))
    expect(r.failed).toEqual([])
    expect(readdirSync(ws)).toContain("Fig.png")
    expect(readdirSync(ws)).not.toContain("fig.png")
    expect(读(ws, "Fig.png")).toBe("v1")
  })

  it("挪走时那里已经没有了：不列进 removed", async () => {
    const box: { ws?: string } = {}
    // 回退里扫的是此刻，所以用插一脚在扫完、开始挪之前删掉它
    const { ws, 存 } = 新的({ 插一脚: async (时机) => void (时机 === "开始挪" && rmSync(join(box.ws!, "gone.txt"))) })
    box.ws = ws
    await 一轮(存, "e1", () => 写(ws, "gone.txt", "x"))
    const r = await 存.回退(之后("e1"))
    expect(r.removed).toEqual([])
    expect(r.failed).toEqual([])
  })

  it("换下之后原处又冒出一个：它也先进废纸篓，不被覆盖", async () => {
    const box: { ws?: string } = {}
    const { ws, 存 } = 新的({ 插一脚: async (时机, p) => void (时机 === "换下之后" && writeFileSync(join(box.ws!, p), "半路冒出来的")) })
    box.ws = ws
    写(ws, "a.py", "v1")
    await 一轮(存, "e1", () => 写(ws, "a.py", "v2"))
    const r = await 存.回退(之后("e1"))
    expect(r).toMatchObject({ restored: ["a.py"], failed: [] })
    expect(r.appeared, "半路冒出来的那份也要交代给界面，不只写进清单").toEqual([{ path: "a.py", to: `${r.trash}/a.py~2` }])
    expect(读(ws, "a.py")).toBe("v1")
    const 篓里 = readdirSync(join(ws, r.trash!)).filter((f) => f.startsWith("a.py")).map((f) => 读(ws, `${r.trash}/${f}`))
    expect(篓里.sort()).toEqual(["v2", "半路冒出来的"].sort())
  })

  it("最后一步就位失败、放回也失败：failed 里写清现在那份在废纸篓的哪儿", async () => {
    const box: { ws?: string } = {}
    const { ws, 存 } = 新的({ 插一脚: async (时机) => void (时机 === "换下之后" && chmodSync(join(box.ws!, "sub"), 0o555)) })
    box.ws = ws
    写(ws, "sub/a.py", "v1")
    await 一轮(存, "e1", () => 写(ws, "sub/a.py", "v2"))
    try {
      const r = await 存.回退(之后("e1"))
      expect(r.restored).toEqual([])
      // sub 只读：临时名也删不掉，一并列出（2026-09-27 复审）——不再悄悄留在工作区里
      expect(r.failed.map((x) => x.path.replace(/\.dawn-rewind-[0-9a-f]+\.tmp$/, ".tmp")).sort()).toEqual(["sub/a.py", "sub/a.py.tmp"])
      expect(r.failed.find((x) => x.path === "sub/a.py")!.message).toContain(`${r.trash}/sub/a.py`)
      expect(读(ws, `${r.trash}/sub/a.py`)).toBe("v2")
    } finally {
      ;chmodSync(join(ws, "sub"), 0o755)
    }
  })

  it("回退收尾那张拍不上：已做的照样交代，段落以断档收住，之后你改的不会被当成回退的", async () => {
    let n = 0
    const { ws, 存, 喊了 } = 新的({
      now: () => {
        n++
        if (炸 && n === 炸) throw new Error("盘满了")
        return new Date(2026, 8, 27, 10, 0, 0, n)
      },
    })
    let 炸 = 0
    写(ws, "a.py", "v1")
    await 一轮(存, "e1", () => 写(ws, "a.py", "v2"))
    炸 = n + 3 // 回退：开头那张、废纸篓名、收尾那张 ← 第三次炸
    const r = await 存.回退(之后("e1"))
    expect(r.restored).toEqual(["a.py"])
    expect(读(ws, "a.py")).toBe("v1")
    expect(存.段落().at(-1)).toMatchObject({ kind: "gap", reason: "store_error" })
    expect(喊了.some((x) => x.includes("盘满了"))).toBe(true)
  })

  it("挪到一半抛了没料到的错：不 reject，已做的照列，这一段照样收住", async () => {
    const { ws, 存 } = 新的({
      插一脚: (时机) => {
        if (时机 === "换下之后") throw new Error("意外")
      },
    })
    写(ws, "a.py", "v1")
    await 一轮(存, "e1", () => {
      写(ws, "a.py", "v2")
      写(ws, "new.txt", "n")
    })
    const r = await 存.回退(之后("e1"))
    expect(r.removed).toEqual(["new.txt"])
    expect(r.failed.map((x) => x.path)).toEqual(["a.py"])
    expect(r.failed[0]!.message).toContain("放回原处")
    expect(读(ws, "a.py")).toBe("v2")
    expect(存.段落().at(-1)).toMatchObject({ kind: "rewind", end: expect.any(String) })
  })

  it("废纸篓里有一份清单：挪了什么、从哪儿、为什么", async () => {
    const { ws, 存 } = 新的()
    写(ws, "a.py", "v1")
    await 一轮(存, "e1", () => {
      写(ws, "a.py", "v2")
      写(ws, "new.txt", "n")
    })
    const r = await 存.回退(之后("e1"))
    const 单 = JSON.parse(读(ws, `${r.trash}/manifest.json`))
    expect(单.moved).toEqual([
      { path: "new.txt", to: `${r.trash}/new.txt`, why: "not_there_before" },
      { path: "a.py", to: `${r.trash}/a.py`, why: "replaced" },
    ])
    expect(单.done).toBe(true)
  })

  it("同一毫秒两次回退：废纸篓各用各的目录", async () => {
    const { ws, 存 } = 新的({ now: () => new Date("2026-09-27T10:00:00Z") })
    await 一轮(存, "e1", () => 写(ws, "a.txt", "1"))
    const r1 = await 存.回退(之后("e1"))
    await 一轮(存, "e2", () => 写(ws, "b.txt", "2"))
    const r2 = await 存.回退(之后("e2"))
    expect(r1.trash).toBeDefined()
    expect(r2.trash).toBeDefined()
    expect(r2.trash).not.toBe(r1.trash)
    expect(读(ws, `${r1.trash}/a.txt`)).toBe("1")
    expect(读(ws, `${r2.trash}/b.txt`)).toBe("2")
  })

  it("存档目录被动过手脚（路径带 .. / 绝对路径）：那几条不认，不往外写，喊一声", async () => {
    const { ws, 存档目录, 重开, 喊了 } = 新的()
    const 存 = 重开()
    写(ws, "a.txt", "v1")
    await 一轮(存, "e1", () => 写(ws, "a.txt", "v2"))
    const 账 = join(存档目录, "snapshots.jsonl")
    const 行 = readFileSync(账, "utf8").trim().split("\n").map((l) => JSON.parse(l))
    const 外 = join(dirname(ws), "escaped.txt")
    行[0].set["../escaped.txt"] = 行[0].set["a.txt"]
    行[0].set[外] = 行[0].set["a.txt"]
    行[1].del.push("../escaped.txt", 外)
    writeFileSync(账, 行.map((x) => JSON.stringify(x)).join("\n") + "\n")
    const r = await 重开().回退(之后("e1"))
    expect(r.restored).toEqual(["a.txt"])
    expect(existsSync(外)).toBe(false)
    expect(喊了.some((x) => x.includes("不认"))).toBe(true)
  })

  it("开轮 / 收尾真的永不 reject：账本写不进去也只喊一声", async () => {
    const { ws, 存档目录, 存, 喊了 } = 新的()
    写(ws, "a.txt", "1")
    rmSync(join(存档目录, "ledger.jsonl"), { force: true })
    mkdirSync(join(存档目录, "ledger.jsonl"))
    rmSync(join(存档目录, "snapshots.jsonl"), { force: true })
    mkdirSync(join(存档目录, "snapshots.jsonl"))
    await expect(存.开轮("e1")).resolves.toBeUndefined()
    await expect(存.收尾()).resolves.toBeUndefined()
    expect(喊了.length).toBeGreaterThan(0)
    expect(存.段落().at(-1)).toMatchObject({ kind: "gap" })
  })
})

/** 2026-09-27 复审（4dccf18 之后）的几条小的 */
describe("影子存档 · 复审补的几条", () => {
  it("路径合法：反斜杠、`x:` 开头在 macOS / Linux 上是合法文件名；`..`、绝对路径、NUL 哪儿都不认", () => {
    const 真平台 = process.platform
    try {
      Object.defineProperty(process, "platform", { value: "darwin" })
      expect(路径合法("a\\b.csv")).toBe(true)
      expect(路径合法("x:foo")).toBe(true)
      for (const p of ["../a", "a/../b", "/etc/passwd", "a\0b", "", "a//b", "./a"]) expect(路径合法(p), p).toBe(false)
      Object.defineProperty(process, "platform", { value: "win32" })
      expect(路径合法("a\\b.csv")).toBe(false)
      expect(路径合法("x:foo")).toBe(false)
      expect(路径合法("C:/x")).toBe(false)
    } finally {
      Object.defineProperty(process, "platform", { value: 真平台 })
    }
  })

  it.skipIf(process.platform === "win32")("agent 建了 a\\b.csv、x:foo：回退照样挪走，不说「存档被改过」", async () => {
    const { ws, 存, 喊了 } = 新的()
    await 一轮(存, "e1", () => {
      写(ws, "a\\b.csv", "1")
      写(ws, "x:foo", "2")
    })
    const r = await 存.回退(之后("e1"))
    expect(r.failed).toEqual([])
    expect([...r.removed].sort()).toEqual(["a\\b.csv", "x:foo"].sort())
    expect(existsSync(join(ws, "a\\b.csv"))).toBe(false)
    expect(喊了.some((x) => x.includes("不认"))).toBe(false)
  })

  it("就位之后临时名删不掉：它还硬链在工作区里，要列出来", async () => {
    const box: { ws?: string } = {}
    const { ws, 存 } = 新的({ 插一脚: async (时机) => void (时机 === "链上之后" && chmodSync(join(box.ws!, "sub"), 0o555)) })
    box.ws = ws
    写(ws, "sub/a.py", "v1")
    await 一轮(存, "e1", () => 写(ws, "sub/a.py", "v2"))
    try {
      const r = await 存.回退(之后("e1"))
      expect(r.restored).toEqual(["sub/a.py"])
      expect(读(ws, "sub/a.py")).toBe("v1")
      const 残 = readdirSync(join(ws, "sub")).filter((f) => f.endsWith(".tmp"))
      expect(残).toHaveLength(1)
      expect(r.failed).toEqual([{ path: `sub/${残[0]}`, message: expect.stringContaining("临时文件") }])
    } finally {
      chmodSync(join(ws, "sub"), 0o755)
    }
  })

  it("改回去失败：这次为它建的父目录收掉（由里往外），原先就在的目录不动", async () => {
    const { ws, 存档目录, 存 } = 新的()
    写(ws, "p/q/r/a.txt", "v1")
    await 一轮(存, "e1", () => rmSync(join(ws, "p/q"), { recursive: true }))
    for (const f of readdirSync(join(存档目录, "objects"))) rmSync(join(存档目录, "objects", f))
    const r = await 存.回退(之后("e1"))
    expect(r.failed.map((x) => x.path)).toEqual(["p/q/r/a.txt"])
    expect(existsSync(join(ws, "p/q")), "这次建的 p/q、p/q/r 收掉").toBe(false)
    expect(existsSync(join(ws, "p")), "原先就在的 p 不动").toBe(true)
  })

  it("原处现在是个空目录：收掉它（不递归）再改回去；目录不进废纸篓", async () => {
    const { ws, 存 } = 新的()
    写(ws, "a.txt", "v1")
    await 一轮(存, "e1", () => {
      rmSync(join(ws, "a.txt"))
      mkdirSync(join(ws, "a.txt"))
    })
    const r = await 存.回退(之后("e1"))
    expect(r).toMatchObject({ restored: ["a.txt"], failed: [] })
    expect(读(ws, "a.txt")).toBe("v1")
  })
})
