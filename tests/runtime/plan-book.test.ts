/**
 * 方案簿与写方案文件（先出方案，2026-09-27，spec §4.4）。
 */
import { describe, expect, it } from "vitest"
import { mkdtempSync, readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { 方案簿, 写方案文件, 方案存档正文 } from "../../src/runtime/plan-book.js"

const 临时 = () => mkdtempSync(join(tmpdir(), "dawn-plan-"))

describe("方案簿", () => {
  it("收：版本递增；之前还在等的那版标「已被取代」", () => {
    const 簿 = new 方案簿(undefined)
    expect(簿.收("c1", "t", "m1").新.version).toBe(1)
    const r = 簿.收("c2", "t", "m2")
    expect(r.新.version).toBe(2)
    expect(r.被取代.map((x) => [x.planId, x.status])).toEqual([["c1", "superseded"]])
  })

  it("可答：只认最新、还在等的那版；说清是哪种不能", () => {
    const 簿 = new 方案簿(undefined)
    簿.收("c1", "t", "m1")
    簿.收("c2", "t", "m2")
    expect(() => 簿.可答("c1")).toThrow(/不是最新/)
    expect(() => 簿.可答("nope")).toThrow(/没有这一版方案/)
    簿.批准("c2", { 正文: "m2", savedPath: "analysis/plans/a.md", 时刻: 5, 改过: false })
    expect(() => 簿.可答("c2")).toThrow(/已经批过/)
    expect(簿.已批准路径()).toEqual(["analysis/plans/a.md"])
  })

  it("指纹与存档记在簿里、不进公开的那份（事件、history）", () => {
    const 簿 = new 方案簿(undefined)
    簿.收("c1", "t", "m1")
    const x = 簿.批准("c1", { 正文: "m1", savedPath: "analysis/plans/a.md", 时刻: 5, 改过: false, sha256: "ab", 存档: "/s/plans/a.md" })
    expect(x).not.toHaveProperty("sha256")
    expect(x).not.toHaveProperty("存档")
    expect(簿.找("c1")).not.toHaveProperty("sha256")
    expect(簿.已批准存档()).toEqual([{ planId: "c1", 相对: "analysis/plans/a.md", sha256: "ab", 存档: "/s/plans/a.md" }])
  })

  it("设文件改过：变了才回、才记；改回来摘掉标记", () => {
    const 簿 = new 方案簿(undefined)
    簿.收("c1", "t", "m1")
    簿.批准("c1", { 正文: "m1", savedPath: "a.md", 时刻: 5, 改过: false })
    expect(簿.设文件改过("c1", false)).toBeUndefined()
    expect(簿.设文件改过("c1", true)).toMatchObject({ fileChanged: true })
    expect(簿.设文件改过("c1", true)).toBeUndefined()
    expect(簿.设文件改过("c1", false)).not.toHaveProperty("fileChanged")
  })

  it("只留（回退之后）：对话里没了的几版摘掉，批准过的留着；版本号从剩下最大的往上接", () => {
    const 簿 = new 方案簿(undefined)
    簿.收("c1", "t", "m1")
    簿.批准("c1", { 正文: "m1", savedPath: "a.md", 时刻: 5, 改过: false })
    簿.收("c2", "t", "m2")
    簿.收("c3", "t", "m3")
    // c3 摘掉之后 c2 又是最新的：回到「等你看」
    expect(簿.只留(new Set(["c2"]))).toEqual({ 摘: 1, 复原: expect.objectContaining({ planId: "c2", status: "proposed" }) })
    expect(簿.找("c3")).toBeUndefined()
    expect(() => 簿.可答("c2")).not.toThrow()
    expect(簿.找("c1")?.status).toBe("approved")
    expect(簿.收("c4", "t", "m4").新.version).toBe(3)
    expect(簿.只留(new Set(["c2", "c4"]))).toEqual({ 摘: 0 })
    // 全都不在分支上：批准过的仍在
    簿.只留(new Set())
    expect(簿.已批准路径()).toEqual(["a.md"])
    expect(() => 簿.可答("c2")).toThrow(/没有这一版方案/)
  })

  it("落盘：换一本从同一个文件读，阶段与每一版都在", () => {
    const f = join(临时(), "plans.json")
    const 簿 = new 方案簿(f)
    簿.设阶段("planning")
    簿.收("c1", "t", "m1")
    const 又 = new 方案簿(f)
    expect(又.阶段).toBe("planning")
    expect(又.找("c1")?.status).toBe("proposed")
  })

  it("文件坏了：当空簿开（不拦会话），并能说出来", () => {
    const d = 临时()
    const f = join(d, "plans.json")
    writeFileSync(f, "{坏")
    const 簿 = new 方案簿(f)
    expect(簿.阶段).toBe("off")
    expect(簿.读坏了).toMatch(/plans\.json/)
  })
})

describe("写方案文件（本机）", () => {
  it("建目录、写进去；重名加 -2，**不覆盖**", async () => {
    const ws = 临时()
    const a = await 写方案文件({ workspace: ws, 名: "2026-09-27-x.md", 正文: "一" })
    const b = await 写方案文件({ workspace: ws, 名: "2026-09-27-x.md", 正文: "二" })
    expect(a).toBe("analysis/plans/2026-09-27-x.md")
    expect(b).toBe("analysis/plans/2026-09-27-x-2.md")
    expect(readFileSync(join(ws, a), "utf8")).toBe("一")
    expect(readFileSync(join(ws, b), "utf8")).toBe("二")
  })
  it("目录是个文件（建不了）：原样抛", async () => {
    const ws = 临时()
    mkdirSync(join(ws, "analysis"))
    writeFileSync(join(ws, "analysis", "plans"), "我是文件")
    await expect(写方案文件({ workspace: ws, 名: "x.md", 正文: "一" })).rejects.toThrow()
    expect(existsSync(join(ws, "analysis", "plans", "x.md"))).toBe(false)
  })
})

describe("写方案文件（远端）", () => {
  /**
   * 假服务器：`set -C && : > 'p'` 按 noclobber 的语义占位（有了就失败），`test -e` 查在不在，`rm -f` 删。
   * 2026-09-28 审查：先 `test -e` 再写不是原子的——两次批准挤在一起会写到同一个名字上。
   */
  const 假远端 = (已有: Set<string>, o: { 写失败?: boolean; 占位坏?: boolean } = {}) => {
    const 写了: [string, string][] = []
    const 命令: string[] = []
    const 远端 = {
      async exec(cmd: string) {
        命令.push(cmd)
        let m = /^set -C && : > '(.+)'$/.exec(cmd)
        if (m) {
          if (o.占位坏) return { code: 1, stdout: "", stderr: "Permission denied" }
          if (已有.has(m[1]!)) return { code: 1, stdout: "", stderr: "cannot overwrite existing file" }
          已有.add(m[1]!)
          return { code: 0, stdout: "", stderr: "" }
        }
        m = /^test -e '(.+)'$/.exec(cmd)
        if (m) return { code: 已有.has(m[1]!) ? 0 : 1, stdout: "", stderr: "" }
        m = /^rm -f '(.+)'$/.exec(cmd)
        if (m) {
          已有.delete(m[1]!)
          return { code: 0, stdout: "", stderr: "" }
        }
        return { code: 0, stdout: "", stderr: "" }
      },
      async readFile() {
        return Buffer.from("")
      },
      async writeFile(p: string, d: string | Buffer) {
        if (o.写失败) throw new Error("断线了")
        写了.push([p, String(d)])
      },
    }
    return { 远端, 写了, 命令 }
  }

  it("走执行器：mkdir -p、noclobber 原子占位（有了的跳过）、writeFile", async () => {
    const 已有 = new Set(["/r/w/analysis/plans/x.md"])
    const { 远端, 写了, 命令 } = 假远端(已有)
    expect(await 写方案文件({ workspace: "/r/w", 远端, 名: "x.md", 正文: "一" })).toBe("analysis/plans/x-2.md")
    expect(写了).toEqual([["/r/w/analysis/plans/x-2.md", "一"]])
    expect(命令.some((c) => c.startsWith("set -C && : > "))).toBe(true)
  })

  it("两次挤在一起：各占一个名字，不写到同一份上", async () => {
    const { 远端, 写了 } = 假远端(new Set())
    const [a, b] = await Promise.all([
      写方案文件({ workspace: "/r/w", 远端, 名: "x.md", 正文: "一" }),
      写方案文件({ workspace: "/r/w", 远端, 名: "x.md", 正文: "二" }),
    ])
    expect(new Set([a, b])).toEqual(new Set(["analysis/plans/x.md", "analysis/plans/x-2.md"]))
    expect(写了).toHaveLength(2)
  })

  it("占位失败又不是因为已有：原样抛（不当成重名一直往后找）", async () => {
    const { 远端 } = 假远端(new Set(), { 占位坏: true })
    await expect(写方案文件({ workspace: "/r/w", 远端, 名: "x.md", 正文: "一" })).rejects.toThrow(/Permission denied/)
  })

  it("占到了却写不进去：把占位删掉再抛", async () => {
    const 已有 = new Set<string>()
    const { 远端 } = 假远端(已有, { 写失败: true })
    await expect(写方案文件({ workspace: "/r/w", 远端, 名: "x.md", 正文: "一" })).rejects.toThrow(/断线/)
    expect(已有.size).toBe(0)
  })
})

describe("存档正文", () => {
  it("YAML 头：标题、版本、批准时刻、会话、模型、改没改过", () => {
    const s = 方案存档正文({ title: "吸烟", version: 2, 正文: "## 问题与假设\n…", 改过: true, 时刻: new Date("2026-09-27T06:02:00Z"), sessionId: "s1", 模型: "deepseek/deepseek-flash" })
    expect(s).toMatch(/^---\ntitle: "吸烟"\nversion: 2\napproved_at: 2026-09-27T06:02:00.000Z\nsession: s1\nmodel: "deepseek\/deepseek-flash"\nedited_by_user: true\nstatus: approved\n---\n\n## 问题与假设/)
  })
})
