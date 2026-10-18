import { afterEach, describe, expect, it } from "vitest"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, relative, resolve } from "node:path"
import { formatSkillsForPrompt, loadSkills } from "@earendil-works/pi-coding-agent"
import { createResourceHost, type ResourceHost } from "../../src/subagent/resources.js"
import { loadSubagentsFrom } from "../../src/subagent/definitions.js"

const root = resolve(import.meta.dirname, "../.."), skills = join(root, "skills")
const entry = join(skills, "scientific-review/SKILL.md")
const text = (path: string) => readFileSync(join(root, path), "utf8")
const dirs: string[] = []
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, {recursive: true, force: true}) })
const call = async (host: ResourceHost, name: string, args: object) => JSON.parse(await host.call(name, args))
const host = () => createResourceHost({roots: [{path: skills, scope: "builtin"}]})

describe("共用科研审查规范", () => {
  it("规范包含临时产物边界及完整委派要求", () => {
    const body = readFileSync(entry, "utf8"), checklist = text("skills/scientific-review/references/checklist.md")
    expect(body).toContain("委派前逐项传递")
    expect(body).toContain("回收结果时")
    expect(checklist).toContain("TMPDIR")
    expect(checklist).toContain("清单、标准输出/错误、转换表和渲染图")
    expect(checklist).toContain("不清理固定目录")
    expect(checklist).toContain("符号链接")
    expect(checklist).toContain("包括版本/环境探测")
    expect(body).toContain("转录/JSON日志审计")
    expect(body).toContain("占位任务")
    expect(text("agents/reproducibility-reviewer.md")).toContain("临时文件")
    expect(text("skills/analysis-delivery/SKILL.md")).toContain("TMPDIR")
  })

  it("统计解释限定模型与检验，不能从设计单位数直接推出校正结论", () => {
    const checklist = text("skills/scientific-review/references/checklist.md")
    expect(checklist).toContain("独立性尚未验证")
    expect(checklist).toContain("自由度")
    expect(checklist).toContain("交换性")
    expect(checklist).toContain("方向")
    expect(checklist).toContain("CSV")
    expect(checklist).toContain("CRLF")
    expect(checklist).toContain("同键不同值不会被整行去重删除")
    expect(text("agents/stat-consultant.md")).toContain("自由度")
    expect(text("agents/stat-consultant.md")).toContain("交换性")
  })

  it("报告核对工具转录且不把重复复跑或证据缺口写成额外结论", () => {
    const reporting = text("skills/scientific-review/references/reporting.md")
    expect(reporting).toContain("工具转录")
    expect(reporting).toContain("没有单独日志")
    expect(reporting).toContain("曾经存在")
    expect(reporting).toContain("只读计数")
    expect(reporting).toContain("重复运行一致性")
    expect(reporting).toContain("df")
  })

  it("真实 loader 可发现，目录只有用途而不预先注入正文", () => {
    const loaded = loadSkills({cwd: root, agentDir: root, includeDefaults: false, skillPaths: [skills]})
    const found = loaded.skills.filter(s => s.name === "scientific-review")
    expect(found).toHaveLength(1)
    expect(found[0]!.disableModelInvocation).not.toBe(true)
    const prompt = formatSkillsForPrompt(found)
    expect(prompt).toContain("科研审查")
    expect(prompt).not.toContain("## 共用底线")
  })

  it("入口的参考可在子资源边界内完整分页读取，正文不进入搜索结果", async () => {
    const h = host(), found = await call(h, "resource_search", {kind: "skill", query: "scientific-review"})
    expect(found.total).toBe(1)
    const id = found.items[0].id
    expect(JSON.stringify(found)).not.toContain("## 共用底线")
    const body = readFileSync(entry, "utf8")
    const refs = [...body.matchAll(/\]\((references\/[^)]+\.md)\)/g)].map(m => m[1]!)
    expect(refs).toEqual(["references/checklist.md", "references/reporting.md"])
    for (const path of ["SKILL.md", ...refs]) {
      const target = resolve(skills, "scientific-review", path)
      expect(relative(join(skills, "scientific-review"), target)).not.toMatch(/^\.\./)
      let content = "", offset = 0, pages = 0
      for (;;) {
        const result = await call(h, "resource_read", {id, path, offset, limit: 97})
        content += result.content; pages++
        if (!result.truncated) break
        expect(result.nextOffset).toBeGreaterThan(offset)
        offset = result.nextOffset
      }
      expect(pages).toBeGreaterThan(1)
      expect(content).toBe(readFileSync(target, "utf8"))
    }
    await expect(h.call("resource_read", {id, path: "../analysis-delivery/SKILL.md"})).rejects.toThrow(/越界/)
  })

  it("项目优先于全局/自带，项目 manual/off 不回落；无项目时采用全局", async () => {
    const workspace = mkdtempSync(join(tmpdir(), "dawn-review-contract-")); dirs.push(workspace)
    const project = join(workspace, ".dawn/skills"), own = join(project, "scientific-review")
    mkdirSync(own, {recursive: true})
    const global = join(workspace, "global-skills"), globalSkill = join(global, "scientific-review")
    mkdirSync(globalSkill, {recursive: true})
    writeFileSync(join(globalSkill, "SKILL.md"), "---\nname: scientific-review\ndescription: 全局审查约定\n---\nGLOBAL_RULE\n")
    const resources = () => createResourceHost({workspace, roots: [{path: project, scope: "project"}, {path: global, scope: "global"}, {path: skills, scope: "builtin"}]})
    const make = (flags = "") => {
      writeFileSync(join(own, "SKILL.md"), `---\nname: scientific-review\ndescription: 项目审查约定\n${flags}---\nPROJECT_RULE\n`)
      return resources()
    }
    const h = make(), found = await call(h, "resource_search", {kind: "skill", query: "scientific-review"})
    expect(found.total).toBe(1)
    expect((await call(h, "resource_read", {id: found.items[0].id})).content).toContain("PROJECT_RULE")
    for (const flags of ["disable-model-invocation: true\n", "user-invocable: false\n"]) {
      expect((await call(make(flags), "resource_search", {kind: "skill", query: "scientific-review"})).total).toBe(0)
    }
    rmSync(own, {recursive: true})
    const globalHost = resources(), globalFound = await call(globalHost, "resource_search", {kind: "skill", query: "scientific-review"})
    expect(globalFound.total).toBe(1)
    expect((await call(globalHost, "resource_read", {id: globalFound.items[0].id})).content).toContain("GLOBAL_RULE")
  })

  it("自带规范关闭或只手动时不可自动发现，也不能用旧 ID 继续读参考", async () => {
    let mode: "model" | "manual" | "off" = "model"
    const h = createResourceHost({roots: [{path: skills, scope: "builtin"}], builtinMode: () => mode})
    const found = await call(h, "resource_search", {kind: "skill", query: "scientific-review"})
    expect(found.total).toBe(1)
    for (const disabled of ["manual", "off"] as const) {
      mode = disabled
      await expect(h.call("resource_read", {id: found.items[0].id, path: "references/checklist.md"})).rejects.toThrow(/停用|手动/)
      const fresh = createResourceHost({roots: [{path: skills, scope: "builtin"}], builtinMode: () => mode})
      expect((await call(fresh, "resource_search", {kind: "skill", query: "scientific-review"})).total).toBe(0)
    }
  })

  it("修掉可导致破坏当前状态、错误比较或伪精确评分的旧指令", () => {
    expect(text("skills/reproducible-analysis/SKILL.md")).not.toContain("（重启内核，从第一行开始）")
    const reviewer = text("agents/reproducibility-reviewer.md")
    expect(reviewer).not.toContain("第二次跑：结果是否逐字节一致")
    expect(reviewer).not.toContain("给一个「可复现性分数」")
    expect(text("agents/data-cleaner.md")).not.toContain("验证幂等：两次输出逐字节一致")
    expect(text("agents/reviewer-two.md")).not.toContain("附我重算的 GLMM 结果")
    expect(text("agents/data-auditor.md")).not.toContain("规则集已存")
    expect(reviewer).not.toMatch(/\| 时间依赖 \|[^\n]+\| 是 \|/)
    expect(reviewer).not.toContain("无写入工具时不借 bash 保存文件")
    expect(reviewer).not.toContain("| 用了随机方法没固定 | 并行下结果会变 |")
  })

  it("重点调用方有统一规范入口和不可绕过的执行/证据底线", () => {
    const files = ["stat-consultant", "reproducibility-reviewer", "reviewer-two", "data-auditor", "methods-writer", "data-cleaner"].map(n => `agents/${n}.md`)
    files.push(...["reproducible-analysis", "analysis-delivery", "analyze-like-case"].map(n => `skills/${n}/SKILL.md`))
    for (const file of files) {
      const body = text(file)
      expect(body, file).toContain("scientific-review")
      expect(body, file).toContain("只审不运行")
      expect(body, file).toMatch(/执行授权/)
      expect(body, file).toMatch(/未运行/)
    }
  })

  it("角色真实 loader 保留原工具范围；共用规范不增加执行能力", () => {
    const loaded = loadSubagentsFrom([{dir: join(root, "agents"), from: "builtin"}])
    expect(loaded.problems).toEqual([])
    for (const name of ["stat-consultant", "reproducibility-reviewer", "reviewer-two", "data-auditor", "methods-writer", "data-cleaner"]) {
      const role = loaded.agents.find(a => a.name === name)!
      expect(role.systemPrompt).toContain("scientific-review")
      const expected = name === "reviewer-two" || name === "methods-writer" ? ["read", "glob", "grep"]
        : name === "stat-consultant" ? undefined
        : name === "data-cleaner" ? ["read", "write", "edit", "bash", "glob", "grep"] : ["read", "bash", "glob", "grep"]
      expect(role.tools).toEqual(expected)
    }
  })
})
