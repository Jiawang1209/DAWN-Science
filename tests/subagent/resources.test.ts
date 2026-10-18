import { afterEach, describe, expect, it } from "vitest"
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { MemoryStore, serializeEntries } from "../../src/memory/store.js"
import { createResourceHost, type ResourceHostOptions } from "../../src/subagent/resources.js"

const dirs: string[] = []
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, {recursive: true, force: true}) })
function setup() {
  const dir = mkdtempSync(join(tmpdir(), "dawn-resources-")); dirs.push(dir)
  const workspace = join(dir, "project"), memories = join(dir, "memories")
  mkdirSync(workspace); mkdirSync(memories)
  const roots = ["project", "global", "builtin"].map(scope => ({path: join(dir, scope + "-skills"), scope: scope as "project" | "global" | "builtin"}))
  roots.forEach(r => mkdirSync(r.path))
  const skill = (layer: number, name: string, text = "skill正文", flags = "") => {
    const base = join(roots[layer]!.path, name); mkdirSync(base, {recursive: true})
    writeFileSync(join(base, "SKILL.md"), `---\nname: ${name}\ndescription: ${name}用途\n${flags}---\n${text}`)
    return base
  }
  const opts: ResourceHostOptions = {workspace, roots, memory: {store: new MemoryStore(memories), enabled: true, branch: "main"}}
  const call = async (host: ReturnType<typeof createResourceHost>, name: string, args: object) => JSON.parse(await host.call(name, args))
  const search = (host: ReturnType<typeof createResourceHost>, args = {}) => call(host, "resource_search", args)
  return {dir, workspace, memories, roots, skill, opts, call, search}
}

describe("子任务只读资源", () => {
  it("先按项目/全局/自带去重，再按开关过滤；上层停用不会回落", async () => {
    const s = setup()
    s.skill(2, "shared", "builtin"); s.skill(1, "shared", "global"); s.skill(0, "shared", "project")
    s.skill(2, "blocked"); s.skill(0, "blocked", "不可见", "user-invocable: false\n")
    s.skill(0, "manual", "不可见", "disable-model-invocation: true\n")
    s.skill(2, "setting-off"); s.opts.builtinMode = n => n === "setting-off" ? "off" : undefined
    const h = createResourceHost(s.opts)
    const found = await s.search(h, {kind: "skill"})
    expect(found.items.map((i: {name: string}) => i.name)).toEqual(["shared"])
    expect(found.items[0].source).toContain("project-skills")
    expect(JSON.stringify(found)).not.toContain("project正文")
    const read = await s.call(h, "resource_read", {id: found.items[0].id})
    expect(read.content).toContain("project")
    await expect(h.call("resource_read", {id: "skill:manual"})).rejects.toThrow(/未知|不可见/)
  })

  it("仅包含活动、已确认和当前项目/分支记忆；未知分支隐藏专属条目", async () => {
    const s = setup()
    writeFileSync(join(s.memories, "USER.md"), serializeEntries(["用户偏好"]))
    writeFileSync(join(s.memories, "MEMORY.md"), serializeEntries(["全局经验"]))
    writeFileSync(join(s.memories, "MEMORY-archive.md"), serializeEntries(["已归档秘密"]))
    writeFileSync(join(s.memories, "SUGGESTIONS.jsonl"), "待确认秘密")
    mkdirSync(join(s.workspace, ".dawn", "memory"), {recursive: true})
    writeFileSync(join(s.workspace, ".dawn", "memory", "KEY.md"), serializeEntries(["项目共用", "[branch:main] 主线经验", "[branch:other] 其他分支秘密"]))
    const h = createResourceHost(s.opts)
    const found = await s.search(h, {kind: "memory"})
    expect(found.total).toBe(4)
    expect(JSON.stringify(found)).not.toMatch(/已归档秘密|待确认秘密|其他分支秘密/)
    expect((await s.search(createResourceHost({...s.opts, workspace: undefined}), {kind: "memory"})).total).toBe(2)
    expect((await s.search(createResourceHost({...s.opts, memory: {...s.opts.memory!, branch: undefined}}), {kind: "memory"})).total).toBe(3)
    expect((await s.search(createResourceHost({...s.opts, memory: {...s.opts.memory!, enabled: false}}), {kind: "memory"}))).toMatchObject({total: 0, available: false})
  })

  it("索引与正文分页明确续读位置，全文不进入短目录", async () => {
    const s = setup(); const body = "秘密正文🙂".repeat(1000)
    s.skill(0, "long-skill", body); s.skill(0, "another")
    const h = createResourceHost(s.opts)
    const page = await s.search(h, {kind: "skill", limit: 1})
    expect(page).toMatchObject({total: 2, nextOffset: 1})
    expect(JSON.stringify(page)).not.toContain("秘密正文")
    const id = (await s.search(h, {kind: "skill", query: "long-skill"})).items[0].id
    const first = await s.call(h, "resource_read", {id, limit: 200})
    const second = await s.call(h, "resource_read", {id, offset: first.nextOffset, limit: 200})
    expect(first.truncated).toBe(true); expect(second.offset).toBe(200)
    expect(first.content + second.content).not.toContain("�")
    await expect(h.call("resource_search", {offset: -1})).rejects.toThrow(/offset/)
    await expect(h.call("resource_read", {id, extra: "bad"})).rejects.toThrow(/参数/)
  })

  it("技能参考只读可见技能目录内的文本，拒绝穿越、越界链接及二进制", async () => {
    const s = setup(); const base = s.skill(0, "reference")
    writeFileSync(join(base, "notes.md"), "参考内容")
    writeFileSync(join(s.dir, "secret.txt"), "不可读")
    symlinkSync(join(s.dir, "secret.txt"), join(base, "escape.md"))
    writeFileSync(join(base, "binary.bin"), Buffer.from([0, 1, 2]))
    const h = createResourceHost(s.opts), id = (await s.search(h, {kind: "skill"})).items[0].id
    expect((await s.call(h, "resource_read", {id, path: "notes.md"})).content).toBe("参考内容")
    for (const path of ["../../secret.txt", join(s.dir, "secret.txt"), "escape.md", "binary.bin"]) {
      await expect(h.call("resource_read", {id, path})).rejects.toThrow(/越界|相对|二进制/)
    }
    await expect(h.call("resource_write", {id, content: "改写"})).rejects.toThrow(/只读|不支持/)
    const denied = createResourceHost({...s.opts, authorize: () => "读取被权限门拒绝"})
    await expect(denied.call("resource_search", {kind: "skill"})).rejects.toThrow(/权限门拒绝/)
  })
  it("根目录平铺技能不能借参考路径读取同目录下被停用的其他技能", async () => {
    const s = setup(), root = s.roots[0]!.path
    writeFileSync(join(root, "visible.md"), "---\nname: visible\ndescription: 可见\n---\n可见正文")
    const hidden = s.skill(0, "hidden", "隐藏正文", "user-invocable: false\n")
    writeFileSync(join(hidden, "notes.md"), "隐藏参考正文")
    const h = createResourceHost(s.opts)
    const id = (await s.search(h, {kind: "skill"})).items[0].id
    expect(JSON.parse(await h.call("resource_read", {id})).content).toContain("可见正文")
    await expect(h.call("resource_read", {id, path: "hidden/SKILL.md"})).rejects.toThrow(/其他技能|不可见/)
    await expect(h.call("resource_read", {id, path: "hidden/notes.md"})).rejects.toThrow(/其他技能|不可见/)
  })
  it("个别技能读取失败明确报告，仍可找到其他健康技能；长描述用全文匹配", async () => {
    const s = setup()
    s.skill(0, "oversized", "大".repeat(100_000))
    const healthy = s.skill(0, "healthy", "正常正文")
    writeFileSync(join(healthy, "SKILL.md"), `---\nname: healthy\ndescription: ${"a".repeat(250)}尾部匹配词\n---\n正常正文`)
    const found = await s.search(createResourceHost(s.opts), {kind: "skill", query: "尾部匹配词"})
    expect(found.items.map((i: {name: string}) => i.name)).toEqual(["healthy"])
    expect(found.warnings.join(" ")).toMatch(/oversized.*上限/)
    expect(found.items[0].description.length).toBeLessThanOrEqual(240)
  })
})
