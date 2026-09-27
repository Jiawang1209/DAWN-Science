/**
 * 方案期的门（先出方案，2026-09-27，spec §4.1）。**默认拒**；只放看得懂的只读。
 *
 * 2026-09-28 收紧：方案期 **bash 一律拒**（审查找出二十来条绕过只读名单的写法，名单删了）；
 * 看目录与搜文件改用 pi 的 `ls` / `grep` / `find`（不过 shell）。已批准方案文件的保护：大小写、符号链接、看不清的 bash；
 * 外加指纹 + 存档 + 恢复（D3 的第二道）。
 */
import { afterEach, describe, expect, it } from "vitest"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  方案期判,
  方案期放行,
  方案指纹,
  存档方案,
  方案存档名,
  恢复后提醒,
  核对方案,
  恢复方案,
  核对并恢复,
} from "../../src/policy/plan-mode.js"

const 语境 = (over: Partial<Parameters<typeof 方案期判>[2]> = {}) => ({
  方案期: true,
  已批准: [] as string[],
  workspace: "/w/proj",
  ...over,
})
const 放 = { kind: "allow" }

describe("方案期：名单", () => {
  it("只读的几件放（含 pi 的 ls / grep / find：不过 shell）", () => {
    for (const n of ["read", "look_at_image", "read_main_session", "propose_plan", "inspect_data", "ls", "grep", "find"]) {
      expect(方案期判(n, {}, 语境()), n).toEqual(放)
    }
    expect([...方案期放行].sort()).toEqual(
      ["find", "grep", "inspect_data", "look_at_image", "ls", "propose_plan", "read", "read_main_session"].sort(),
    )
  })

  it("run_code 拒，理由指向 inspect_data", () => {
    const d = 方案期判("run_code", { language: "python", code: "df.head()" }, 语境())
    expect(d.kind).toBe("deny")
    expect(d.kind === "deny" && d.reason).toContain("inspect_data")
  })

  it("写与改、插件、子 agent、团队、没见过的：一律拒，理由说「生成方案」", () => {
    for (const n of ["write", "edit", "xlsx_write", "browser_click", "subagent", "team_create", "memory_propose", "新来的工具"]) {
      const d = 方案期判(n, { path: "a.txt" }, 语境())
      expect(d.kind, n).toBe("deny")
      expect(d.kind === "deny" && d.reason, n).toContain("生成方案")
    }
  })

  it("MCP：服务器声明只读的放，没声明的拒", () => {
    expect(方案期判("mlai__search_cases", {}, 语境({ mcp只读: true }))).toEqual(放)
    expect(方案期判("pg__query", {}, 语境()).kind).toBe("deny")
  })

  it("不在方案期：什么都不管（交给权限门）", () => {
    expect(方案期判("write", { path: "a.txt" }, 语境({ 方案期: false }))).toEqual(放)
    expect(方案期判("run_code", {}, 语境({ 方案期: false }))).toEqual(放)
    expect(方案期判("bash", { command: "rm a.csv" }, 语境({ 方案期: false }))).toEqual(放)
  })
})

describe("方案期：bash / powershell 一律拒（2026-09-28）", () => {
  it.each([
    // 看起来最无害的也拒：没有只读名单了
    "ls -la data/raw",
    "git status",
    "cat a.csv",
    // 审查找到的绕过（t.ts）：名单时代它们都放过去了
    `find . -name x "-delete"`,
    "find . -de''lete",
    "find . -\\delete",
    "find . $'-delete'",
    "find . -name '*.tmp' '-exec' rm -rf {} +",
    "find . -{delete,true}",
    "sort --o=pwned.txt a",
    'sort "-o" pwned a',
    "sort --compress-prog=sh a",
    "git log --outp=pwned",
    "git diff '--output=x'",
    "git log --ext-d",
    "rg --hostname-bin=touch x",
    "rg '--pre=sh' x .",
    "uniq - pwned.txt",
    "tree -R -H . -L 1",
    'tree "-o" x',
    "date 010100002030",
    "file --comp x",
    "ls 2>&1 >x",
    "cat <<<x",
    "ls\r rm x",
    "echo ${IFS}",
    "",
  ])("拒：%j", (cmd) => {
    const d = 方案期判("bash", { command: cmd }, 语境())
    expect(d.kind).toBe("deny")
    const why = d.kind === "deny" ? d.reason : ""
    expect(why).toContain("生成方案")
    // 告诉模型该用什么
    for (const t of ["ls", "grep", "find", "read", "inspect_data"]) expect(why).toContain(t)
  })

  it("powershell 同样拒；参数不是字符串也拒", () => {
    expect(方案期判("powershell", { command: "Get-ChildItem" }, 语境()).kind).toBe("deny")
    expect(方案期判("bash", {}, 语境()).kind).toBe("deny")
  })
})

describe("已批准的方案文件：谁都不许动（方案期内外都生效，D3）", () => {
  const 批过 = 语境({ 方案期: false, 已批准: ["analysis/plans/2026-09-27-x.md"] })
  it("write / edit 到它：拒；到别处：放", () => {
    expect(方案期判("write", { path: "analysis/plans/2026-09-27-x.md", content: "改" }, 批过).kind).toBe("deny")
    expect(方案期判("edit", { path: "/w/proj/analysis/plans/2026-09-27-x.md" }, 批过).kind).toBe("deny")
    expect(方案期判("edit", { file_path: "analysis/plans/2026-09-27-x.md" }, 批过).kind).toBe("deny")
    expect(方案期判("write", { path: "./a/../analysis/plans/2026-09-27-x.md" }, 批过).kind).toBe("deny")
    expect(方案期判("write", { path: "analysis/plans/other.md" }, 批过)).toEqual(放)
  })
  it("别的会写文件的工具（插件）带着指向它的路径参数：拒", () => {
    expect(方案期判("docx_write", { output: "analysis/plans/2026-09-27-x.md" }, 批过).kind).toBe("deny")
  })
  it("大小写：darwin / win32 上 `Analysis/Plans/…` 就是那个文件 → 拒；linux 上是另一个文件 → 放", () => {
    const 名 = { path: "Analysis/Plans/2026-09-27-X.md" }
    expect(方案期判("write", 名, { ...批过, 平台: "darwin" }).kind).toBe("deny")
    expect(方案期判("write", 名, { ...批过, 平台: "win32" }).kind).toBe("deny")
    expect(方案期判("write", 名, { ...批过, 平台: "linux" })).toEqual(放)
  })
  it("bash 重定向、tee、rm、mv 到它：拒", () => {
    for (const cmd of [
      "echo x >> analysis/plans/2026-09-27-x.md",
      "echo x | tee analysis/plans/2026-09-27-x.md",
      "rm analysis/plans/2026-09-27-x.md",
      "mv analysis/plans/2026-09-27-x.md /tmp/y.md",
    ]) {
      const d = 方案期判("bash", { command: cmd }, 批过)
      expect(d.kind, cmd).toBe("deny")
      expect(d.kind === "deny" && d.reason, cmd).toContain("已批准")
    }
  })
  it("bash 目标看不清、又提到 plans 或方案文件名：拒（通配、截断、sed -i、多目标、cd 进去）", () => {
    const 批p = 语境({ 方案期: false, 已批准: ["analysis/plans/p.md"] })
    for (const cmd of [
      "rm analysis/plans/*.md",
      "truncate -s 0 analysis/plans/p.md",
      "sed -i '' s/a/b/ analysis/plans/p.md",
      "sed -i s/a/b/ Analysis/PLANS/p.md",
      "rm -f analysis/plans/p.md analysis/plans/q.md",
      "git checkout -- analysis/plans/p.md",
      "cd analysis/plans && rm p.md",
      "cd analysis/plans; rm *",
      "cp /dev/null analysis/plans/p.md",
      "python3 -c \"open('analysis/plans/p.md','w')\"",
      "cat x > analysis/plans/\"p\".md",
    ]) {
      const d = 方案期判("bash", { command: cmd }, 批p)
      expect(d.kind, cmd).toBe("deny")
      expect(d.kind === "deny" && d.reason, cmd).toContain("已批准")
    }
  })
  it("读它、与它无关的 bash：放", () => {
    expect(方案期判("read", { path: "analysis/plans/2026-09-27-x.md" }, 批过)).toEqual(放)
    expect(方案期判("bash", { command: "cat analysis/plans/2026-09-27-x.md" }, 批过)).toEqual(放)
    expect(方案期判("bash", { command: "head -n 20 analysis/plans/2026-09-27-x.md | wc -l" }, 批过)).toEqual(放)
    expect(方案期判("bash", { command: "rm results/tmp/*.csv" }, 批过)).toEqual(放)
    expect(方案期判("bash", { command: "sed -i s/a/b/ analysis/notes.md" }, 批过)).toEqual(放)
  })
})

describe("已批准的方案文件：符号链接（真文件系统）", () => {
  let 根 = ""
  afterEach(() => 根 && rmSync(根, { recursive: true, force: true }))
  const 搭 = () => {
    根 = mkdtempSync(join(tmpdir(), "dawn-plan-gate-"))
    const ws = join(根, "ws")
    mkdirSync(join(ws, "analysis", "plans"), { recursive: true })
    writeFileSync(join(ws, "analysis", "plans", "p.md"), "方案")
    return ws
  }
  it("一个指向 analysis/plans 的目录链接：写穿过去 → 拒", () => {
    const ws = 搭()
    symlinkSync(join(ws, "analysis", "plans"), join(ws, "notes"))
    const d = 方案期判("write", { path: "notes/p.md" }, 语境({ 方案期: false, workspace: ws, 已批准: ["analysis/plans/p.md"] }))
    expect(d.kind).toBe("deny")
  })
  it("一个指向方案文件本身的链接：写它 → 拒", () => {
    const ws = 搭()
    symlinkSync(join(ws, "analysis", "plans", "p.md"), join(ws, "x.md"))
    expect(方案期判("edit", { path: "x.md" }, 语境({ 方案期: false, workspace: ws, 已批准: ["analysis/plans/p.md"] })).kind).toBe(
      "deny",
    )
  })
  it("工作区本身经过链接（/var → /private/var 那种）：照样认得出", () => {
    const ws = 搭()
    const 链 = join(根, "ws-link")
    symlinkSync(ws, 链)
    expect(方案期判("write", { path: join(ws, "analysis/plans/p.md") }, 语境({ 方案期: false, workspace: 链, 已批准: ["analysis/plans/p.md"] })).kind).toBe(
      "deny",
    )
    expect(方案期判("write", { path: "analysis/plans/q.md" }, 语境({ 方案期: false, workspace: 链, 已批准: ["analysis/plans/p.md"] }))).toEqual(放)
  })
})

describe("已批准方案的指纹、存档、核对、恢复（D3 第二道，2026-09-28）", () => {
  let 根 = ""
  afterEach(() => 根 && rmSync(根, { recursive: true, force: true }))
  const 搭 = () => {
    根 = mkdtempSync(join(tmpdir(), "dawn-plan-int-"))
    const ws = join(根, "ws")
    const 会话 = join(根, "session")
    mkdirSync(join(ws, "analysis", "plans"), { recursive: true })
    mkdirSync(会话)
    writeFileSync(join(ws, "analysis", "plans", "p.md"), "## 问题与假设\n原文\n")
    return { ws, 会话 }
  }

  it("指纹：sha256 十六进制，字符串与字节一致", () => {
    expect(方案指纹("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad")
    expect(方案指纹(Buffer.from("abc"))).toBe(方案指纹("abc"))
  })

  it("存档：拷到会话目录 plans/ 下，回指纹与存档路径", async () => {
    const { ws, 会话 } = 搭()
    const r = await 存档方案({ workspace: ws, 相对: "analysis/plans/p.md", 会话目录: 会话, planId: "c-p" })
    expect(r.sha256).toBe(方案指纹("## 问题与假设\n原文\n"))
    expect(r.存档).toBe(join(会话, "plans", 方案存档名("c-p")))
    expect(readFileSync(r.存档, "utf8")).toBe("## 问题与假设\n原文\n")
  })

  it("存档按 planId 取名（不按方案文件名）：同名的两份不互相盖；planId 里的怪字符出不了目录", async () => {
    expect(方案存档名("c1")).not.toBe(方案存档名("c2"))
    expect(方案存档名("../../etc/passwd")).not.toMatch(/[/\\]|\.\./)
    expect(方案存档名("a/b")).not.toBe(方案存档名("a_b"))
    const { ws, 会话 } = 搭()
    const a = await 存档方案({ workspace: ws, 相对: "analysis/plans/p.md", 会话目录: 会话, planId: "c1" })
    writeFileSync(join(ws, "analysis", "plans", "p.md"), "同名的另一份")
    const b = await 存档方案({ workspace: ws, 相对: "analysis/plans/p.md", 会话目录: 会话, planId: "c2" })
    expect(a.存档).not.toBe(b.存档)
    expect(readFileSync(a.存档, "utf8")).toBe("## 问题与假设\n原文\n")
  })

  it("恢复的话里带出路：如果是你改的，再说一次或重新提方案", () => {
    expect(恢复后提醒).toContain("如果这是你改的，把改动再说一次或重新提方案")
  })

  it("核对：完好 / 被改过 / 不见了", async () => {
    const { ws, 会话 } = 搭()
    const { sha256 } = await 存档方案({ workspace: ws, 相对: "analysis/plans/p.md", 会话目录: 会话, planId: "c-p" })
    expect(await 核对方案({ workspace: ws, 相对: "analysis/plans/p.md", sha256 })).toBe("完好")
    writeFileSync(join(ws, "analysis", "plans", "p.md"), "偷改")
    expect(await 核对方案({ workspace: ws, 相对: "analysis/plans/p.md", sha256 })).toBe("被改过")
    rmSync(join(ws, "analysis", "plans", "p.md"))
    expect(await 核对方案({ workspace: ws, 相对: "analysis/plans/p.md", sha256 })).toBe("不见了")
  })

  it("恢复：从存档写回；被换成符号链接的，先摘链接、不顺着链接写到别处", async () => {
    const { ws, 会话 } = 搭()
    const { sha256, 存档 } = await 存档方案({ workspace: ws, 相对: "analysis/plans/p.md", 会话目录: 会话, planId: "c-p" })
    const 外面 = join(根, "外面.md")
    writeFileSync(外面, "别碰我")
    rmSync(join(ws, "analysis", "plans", "p.md"))
    symlinkSync(外面, join(ws, "analysis", "plans", "p.md"))
    await 恢复方案({ workspace: ws, 相对: "analysis/plans/p.md", 存档, sha256 })
    expect(readFileSync(外面, "utf8")).toBe("别碰我")
    expect(readFileSync(join(ws, "analysis", "plans", "p.md"), "utf8")).toBe("## 问题与假设\n原文\n")
    expect(await 核对方案({ workspace: ws, 相对: "analysis/plans/p.md", sha256 })).toBe("完好")
  })

  it("恢复：存档本身也对不上指纹 → 原样抛，不写", async () => {
    const { ws, 会话 } = 搭()
    const { sha256, 存档 } = await 存档方案({ workspace: ws, 相对: "analysis/plans/p.md", 会话目录: 会话, planId: "c-p" })
    writeFileSync(存档, "存档也被改了")
    writeFileSync(join(ws, "analysis", "plans", "p.md"), "偷改")
    await expect(恢复方案({ workspace: ws, 相对: "analysis/plans/p.md", 存档, sha256 })).rejects.toThrow(/存档/)
    expect(readFileSync(join(ws, "analysis", "plans", "p.md"), "utf8")).toBe("偷改")
  })

  it("核对并恢复：被改的、不见的都恢复并各出一句响亮的话；完好的不出声", async () => {
    const { ws, 会话 } = 搭()
    writeFileSync(join(ws, "analysis", "plans", "q.md"), "第二份")
    const a = await 存档方案({ workspace: ws, 相对: "analysis/plans/p.md", 会话目录: 会话, planId: "c-p" })
    const b = await 存档方案({ workspace: ws, 相对: "analysis/plans/q.md", 会话目录: 会话, planId: "c-q" })
    expect(
      await 核对并恢复(ws, [
        { 相对: "analysis/plans/p.md", ...a },
        { 相对: "analysis/plans/q.md", ...b },
      ]),
    ).toEqual([])
    writeFileSync(join(ws, "analysis", "plans", "p.md"), "偷改")
    rmSync(join(ws, "analysis", "plans", "q.md"))
    const 话 = await 核对并恢复(ws, [
      { 相对: "analysis/plans/p.md", ...a },
      { 相对: "analysis/plans/q.md", ...b },
    ])
    expect(话).toEqual([
      `批准过的方案被改动过，已从存档恢复：analysis/plans/p.md${恢复后提醒}`,
      `批准过的方案被改动过，已从存档恢复：analysis/plans/q.md${恢复后提醒}`,
    ])
    expect(readFileSync(join(ws, "analysis", "plans", "q.md"), "utf8")).toBe("第二份")
  })

  it("核对并恢复：恢复不了（存档丢了）→ 照样出声，说恢复不了", async () => {
    const { ws, 会话 } = 搭()
    const a = await 存档方案({ workspace: ws, 相对: "analysis/plans/p.md", 会话目录: 会话, planId: "c-p" })
    writeFileSync(join(ws, "analysis", "plans", "p.md"), "偷改")
    rmSync(a.存档)
    const 话 = await 核对并恢复(ws, [{ 相对: "analysis/plans/p.md", ...a }])
    expect(话).toHaveLength(1)
    expect(话[0]).toMatch(/批准过的方案被改动过.*恢复不了.*analysis\/plans\/p\.md/)
    expect(existsSync(join(ws, "analysis", "plans", "p.md"))).toBe(true)
  })
})
