/** 导入技能的两阶段链路（skills-manage）。真磁盘、临时目录 */
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, existsSync, readFileSync, rmSync, readdirSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { 预检, 导入, 规整名 } from "../../src/skills/import.js"

let 箱: string
let 根: string
const 技能 = (dir: string, name: string, 正文 = "# hi\n") => {
  mkdirSync(join(dir, name), { recursive: true })
  writeFileSync(join(dir, name, "SKILL.md"), `---\nname: ${规整名(name)}\ndescription: d\n---\n${正文}`)
  return join(dir, name)
}
beforeEach(() => {
  箱 = mkdtempSync(join(tmpdir(), "dawn-skill-"))
  根 = join(箱, "skills")
})
afterEach(() => rmSync(箱, { recursive: true, force: true }))

describe("规整名", () => {
  it("camelCase / 空格 / 下划线 / 点 → kebab；规整不出回空串", () => {
    expect(规整名("PlotFigure")).toBe("plot-figure")
    expect(规整名("my skill_v2.final")).toBe("my-skill-v2-final")
    expect(规整名("画图")).toBe("")
  })
})

describe("预检", () => {
  it("一个含 SKILL.md 的目录：待导一条，名字规整过", async () => {
    const src = 技能(箱, "My Skill")
    const r = await 预检(src, 根)
    expect(r).toMatchObject({ kind: "single", 待导: [{ name: "my-skill", source: src }], 冲突: [], 失败: [] })
  })
  it("选中的是 SKILL.md 文件本身：用父目录", async () => {
    const src = 技能(箱, "abc")
    const r = await 预检(join(src, "SKILL.md"), 根)
    expect(r).toMatchObject({ kind: "single", 待导: [{ name: "abc" }] })
  })
  it("一筐：每个含 SKILL.md 的子目录一条；同名撞在一起的进失败", async () => {
    const 筐 = join(箱, "筐")
    技能(筐, "a-one")
    技能(筐, "a_one")
    技能(筐, "b-two")
    mkdirSync(join(筐, "不是技能"))
    const r = await 预检(筐, 根)
    if ("why" in r) throw new Error(r.why)
    expect(r.kind).toBe("batch")
    expect(r.待导.map((x) => x.name)).toEqual(["b-two"])
    expect(r.失败).toHaveLength(2)
  })
  it("目标里已有同名 → 冲突，不是失败", async () => {
    技能(根, "abc")
    const src = 技能(箱, "abc")
    const r = await 预检(src, 根)
    expect(r).toMatchObject({ 待导: [], 冲突: [{ name: "abc" }] })
  })
  it("来源里有符号链接 → 失败并说路径（预检就拒，不等实导）", async () => {
    const src = 技能(箱, "abc")
    symlinkSync(箱, join(src, "link"))
    const r = await 预检(src, 根)
    if ("why" in r) throw new Error(r.why)
    expect(r.失败[0]?.why).toContain("符号链接")
  })
  it("来源就在技能目录里 → 拒", async () => {
    const src = 技能(根, "abc")
    const r = await 预检(src, 根)
    if ("why" in r) throw new Error(r.why)
    expect(r.失败[0]?.why).toContain("自己删掉")
  })
  it("不存在 / 不是技能 / 空筐，各说各的话", async () => {
    expect(await 预检(join(箱, "没有"), 根)).toMatchObject({ why: expect.stringContaining("不存在") })
    writeFileSync(join(箱, "x.md"), "")
    expect(await 预检(join(箱, "x.md"), 根)).toMatchObject({ why: expect.stringContaining("不是技能") })
    mkdirSync(join(箱, "空"))
    expect(await 预检(join(箱, "空"), 根)).toMatchObject({ why: expect.stringContaining("没有技能") })
  })
  it("中文名规整不出 → 失败并说原名", async () => {
    const src = 技能(箱, "画图")
    const r = await 预检(src, 根)
    if ("why" in r) throw new Error(r.why)
    expect(r.失败[0]?.why).toContain("「画图」")
  })
})

describe("导入", () => {
  it("整个目录（含子目录与脚本）复制到位；目标目录不存在就建", async () => {
    const src = 技能(箱, "abc")
    mkdirSync(join(src, "scripts"))
    writeFileSync(join(src, "scripts", "run.py"), "print(1)\n")
    const r = await 导入(src, 根, false)
    if ("why" in r) throw new Error(r.why)
    expect(r.导了).toMatchObject([{ name: "abc", 覆盖了: false }])
    expect(readFileSync(join(根, "abc", "scripts", "run.py"), "utf8")).toBe("print(1)\n")
    // 临时目录不留
    expect(readdirSync(根).filter((n) => n.startsWith("."))).toEqual([])
  })
  it("冲突：不覆盖就跳过、旧的原样；覆盖就换新的、备份清掉", async () => {
    技能(根, "abc", "旧\n")
    const src = 技能(箱, "abc", "新\n")
    const 跳 = await 导入(src, 根, false)
    if ("why" in 跳) throw new Error(跳.why)
    expect(跳.跳过).toMatchObject([{ name: "abc" }])
    expect(readFileSync(join(根, "abc", "SKILL.md"), "utf8")).toContain("旧")
    const 覆 = await 导入(src, 根, true)
    if ("why" in 覆) throw new Error(覆.why)
    expect(覆.导了).toMatchObject([{ name: "abc", 覆盖了: true, 警告: [] }])
    expect(readFileSync(join(根, "abc", "SKILL.md"), "utf8")).toContain("新")
    expect(readdirSync(根)).toEqual(["abc"])
  })
  it("一筐：能导的导、冲突的按开关、失败的列出来，互不影响", async () => {
    const 筐 = join(箱, "筐")
    技能(筐, "a-one")
    技能(筐, "b-two")
    技能(筐, "画图")
    技能(根, "b-two", "旧\n")
    const r = await 导入(筐, 根, false)
    if ("why" in r) throw new Error(r.why)
    expect(r.导了.map((x) => x.name)).toEqual(["a-one"])
    expect(r.跳过.map((x) => x.name)).toEqual(["b-two"])
    expect(r.失败).toHaveLength(1)
    expect(existsSync(join(根, "a-one", "SKILL.md"))).toBe(true)
  })
})
