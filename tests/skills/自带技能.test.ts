/**
 * **随应用发布的那几份技能本身**（2026-09-07）。
 *
 * `tests/skills/` 此前只验解析器（调用档怎么读怎么写），**没有一条盯着技能的内容**。
 * 而技能是**给模型读的规格**：写坏了不会有任何报错，只会让模型在某一次悄悄跑偏——
 * 与「界面上看不见的能力」是同一类沉默失败，所以按准入规则 2 配一条扫描。
 *
 * 只扫**可判定**的东西：frontmatter 齐不齐、名字对不对得上、有没有那节「什么时候不要用」。
 * 内容好不好不在这里判——那要人读。
 */
import { describe, expect, it } from "vitest"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"

const 技能根 = join(import.meta.dirname, "../../skills")
const 每一份 = () =>
  readdirSync(技能根)
    .filter((名) => statSync(join(技能根, 名)).isDirectory())
    .map((名) => ({ 名, 文本: readFileSync(join(技能根, 名, "SKILL.md"), "utf8") }))

/** frontmatter 里某个顶层键的值（只取一行的那种） */
const 取 = (文本: string, 键: string): string | undefined => {
  const m = new RegExp(`^${键}:\\s*(.+)$`, "m").exec(文本.split("---")[1] ?? "")
  return m?.[1]?.trim()
}

describe("自带技能", () => {
  it("有几份就扫几份（别把新加的漏在扫描之外）", () => {
    expect(每一份().length).toBeGreaterThanOrEqual(4)
  })

  it("**每份都有 frontmatter，且 name 与目录名一致**", () => {
    const 坏的: string[] = []
    for (const { 名, 文本 } of 每一份()) {
      if (!文本.startsWith("---\n")) 坏的.push(`${名}：没有 frontmatter`)
      else if (取(文本, "name") !== 名) 坏的.push(`${名}：name 是 ${取(文本, "name")}，与目录名对不上`)
    }
    // name 与目录名分家的后果：技能列表里叫一个名字，`/` 菜单里调的是另一个
    expect(坏的).toEqual([])
  })

  it("**每份都有 description**——技能列表与 `/` 菜单靠它被人和模型认出来", () => {
    const 缺的 = 每一份()
      .filter(({ 文本 }) => !(取(文本, "description") ?? "").length)
      .map(({ 名 }) => 名)
    expect(缺的).toEqual([])
  })

  it("**每份都写了「什么时候不要用」**", () => {
    /**
     * 这一条不是形式主义。技能是给模型读的，而模型最容易犯的错是
     * **把一份技能套在不该套的场合上**——「什么时候用」写得再好也拦不住它，
     * 拦得住的是明确的排除条件。
     */
    const 缺的 = 每一份()
      .filter(({ 文本 }) => !文本.includes("什么时候不要用"))
      .map(({ 名 }) => 名)
    expect(缺的).toEqual([])
  })
})
