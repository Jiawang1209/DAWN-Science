/**
 * 方案期的门（先出方案，2026-09-27，spec §4.1）。**默认拒**；只放看得懂的只读。
 */
import { describe, expect, it } from "vitest"
import { 方案期判, 只读命令不成立, 方案期放行 } from "../../src/policy/plan-mode.js"

const 语境 = (over: Partial<Parameters<typeof 方案期判>[2]> = {}) => ({
  方案期: true,
  已批准: [] as string[],
  workspace: "/w/proj",
  ...over,
})
const 放 = { kind: "allow" }

describe("方案期：名单", () => {
  it("只读的几件放", () => {
    for (const n of ["read", "look_at_image", "read_main_session", "propose_plan", "inspect_data"]) {
      expect(方案期判(n, {}, 语境()), n).toEqual(放)
    }
    expect([...方案期放行].sort()).toEqual(["inspect_data", "look_at_image", "propose_plan", "read", "read_main_session"])
  })

  it("run_code 拒，理由指向 inspect_data", () => {
    const d = 方案期判("run_code", { language: "python", code: "df.head()" }, 语境())
    expect(d.kind).toBe("deny")
    expect(d.kind === "deny" && d.reason).toContain("inspect_data")
  })

  it("写与改、插件、子 agent、团队、没见过的：一律拒，理由说「先出方案」", () => {
    for (const n of ["write", "edit", "xlsx_write", "browser_click", "subagent", "team_create", "memory_propose", "新来的工具"]) {
      const d = 方案期判(n, { path: "a.txt" }, 语境())
      expect(d.kind, n).toBe("deny")
      expect(d.kind === "deny" && d.reason, n).toContain("先出方案")
    }
  })

  it("MCP：服务器声明只读的放，没声明的拒", () => {
    expect(方案期判("mlai__search_cases", {}, 语境({ mcp只读: true }))).toEqual(放)
    expect(方案期判("pg__query", {}, 语境()).kind).toBe("deny")
  })

  it("不在方案期：什么都不管（交给权限门）", () => {
    expect(方案期判("write", { path: "a.txt" }, 语境({ 方案期: false }))).toEqual(放)
    expect(方案期判("run_code", {}, 语境({ 方案期: false }))).toEqual(放)
  })
})

describe("方案期：bash 只读判定", () => {
  it.each([
    "ls -la data/raw",
    "head -n 5 data/raw/a.csv | cut -d, -f1-3",
    "wc -l data/raw/*.csv && du -sh data",
    "grep -c , data/raw/a.csv 2>/dev/null",
    "find data -name '*.csv'",
    "git status",
    "git log --oneline -5",
    "cut -f1 a.tsv | sort | uniq -c",
    "nvidia-smi",
    "nproc; free -h",
    "date -Iseconds",
    "ls data 2>&1 | head",
  ])("放：%s", (cmd) => {
    expect(只读命令不成立(cmd)).toBeUndefined()
    expect(方案期判("bash", { command: cmd }, 语境())).toEqual(放)
  })

  it.each([
    ["python -c 'print(1)'", "python"],
    ["head a.csv > b.csv", "写进文件"],
    ["cat $(ls)", "命令替换"],
    ["echo `id`", "命令替换"],
    ["find . -name '*.tmp' -delete", "find"],
    ["find . -exec rm {} ;", "find"],
    ["sort -o out.txt in.txt", "sort -o"],
    ["uniq in.txt out.txt", "uniq"],
    ["tree -o out.txt", "tree -o"],
    ["git checkout main", "git checkout"],
    ["rm a.csv", "rm"],
    ["FOO=1 ls", "环境变量"],
    ["rg --pre cat x", "rg --pre"],
    ["nvidia-smi -pm 1", "nvidia-smi"],
    ["", "空"],
    // 2026-09-28 实现时补的几条：计划里的判据漏掉了它们
    ["ls & rm a.csv", "rm"],
    ["sort -ro out.txt in.txt", "sort -o"],
    ["sort --compress-program=sh in.txt", "sort --compress-program"],
    ["grep x a 2>/dev/nullx", "写进文件"],
    ["git diff --output=patch.txt", "git --output"],
    ["git log --ext-diff", "git --ext-diff"],
    ["date -us 2020-01-01", "date -s"],
    ["file -C -m magic", "file -C"],
  ])("拒：%s（理由提到 %s）", (cmd, 词) => {
    const why = 只读命令不成立(cmd)
    expect(why).toBeDefined()
    expect(why).toContain(词)
    const d = 方案期判("bash", { command: cmd }, 语境())
    expect(d.kind).toBe("deny")
  })
})

describe("已批准的方案文件：谁都不许动（方案期内外都生效，D3）", () => {
  const 批过 = 语境({ 方案期: false, 已批准: ["analysis/plans/2026-09-27-x.md"] })
  it("write / edit 到它：拒；到别处：放", () => {
    expect(方案期判("write", { path: "analysis/plans/2026-09-27-x.md", content: "改" }, 批过).kind).toBe("deny")
    expect(方案期判("edit", { path: "/w/proj/analysis/plans/2026-09-27-x.md" }, 批过).kind).toBe("deny")
    expect(方案期判("write", { path: "analysis/plans/other.md" }, 批过)).toEqual(放)
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
  it("读它：放", () => {
    expect(方案期判("read", { path: "analysis/plans/2026-09-27-x.md" }, 批过)).toEqual(放)
    expect(方案期判("bash", { command: "cat analysis/plans/2026-09-27-x.md" }, 批过)).toEqual(放)
  })
})
