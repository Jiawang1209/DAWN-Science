import { describe, expect, it } from "vitest"
import { 清洗记忆, 读记忆, 记记忆, 立刻写完 } from "../../src/ui/state/files-memory.js"

function 假存储() {
  const m = new Map<string, string>()
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m }
}

describe("文件面板的记忆", () => {
  it("清洗：坏形状退回默认、绝对路径与 .. 扔掉、根永远展开、最多 300 个", () => {
    expect(清洗记忆(null)).toEqual({ expanded: [""] })
    expect(清洗记忆("x")).toEqual({ expanded: [""] })
    expect(清洗记忆({ expanded: ["a", "../x", "a/../b", 3, "a"], selected: "../abs" })).toEqual({ expanded: ["", "a"] })
    expect(清洗记忆({ expanded: ["b"], selected: "b/c.txt" })).toEqual({ expanded: ["", "b"], selected: "b/c.txt" })
    // 远端：根是绝对路径，展开的也是绝对路径，照收；根收起来了要记得
    expect(清洗记忆({ expanded: ["/home/u/data"] }, "/home/u")).toEqual({ expanded: ["/home/u", "/home/u/data"] })
    expect(清洗记忆({ expanded: [], rootClosed: true }, "/home/u")).toEqual({ expanded: [] })
    expect(清洗记忆({ expanded: Array.from({ length: 500 }, (_, i) => `d${i}`) }).expanded.length).toBe(301)
  })
  it("读：没有 / 坏 JSON 都是默认；写：防抖，同一引用不写，key 里带作用域", () => {
    const s = 假存储()
    expect(读记忆("本机:p1", "", s)).toEqual({ expanded: [""] })
    s.setItem("dawn.files.本机:p1.memory", "{not json")
    expect(读记忆("本机:p1", "", s)).toEqual({ expanded: [""] })
    const m = { expanded: ["", "src"], selected: "src/a.ts" }
    记记忆("本机:p1", m, "", s)
    记记忆("本机:p1", m, "", s) // 同一引用
    立刻写完()
    expect(读记忆("本机:p1", "", s)).toEqual(m)
    // 根收起来了：写 rootClosed，读回来不给它展开
    记记忆("本机:p2", { expanded: [] }, "", s)
    立刻写完()
    expect(读记忆("本机:p2", "", s)).toEqual({ expanded: [] })
    expect([...s.m.keys()]).toEqual(["dawn.files.本机:p1.memory", "dawn.files.本机:p2.memory"])
  })
  it("两棵树各自防抖，互不取消", () => {
    const s = 假存储()
    记记忆("本机:a", { expanded: ["", "x"] }, "", s)
    记记忆("远端:c1:/home", { expanded: ["/home", "/home/y"] }, "/home", s)
    立刻写完()
    expect(读记忆("本机:a", "", s).expanded).toEqual(["", "x"])
    expect(读记忆("远端:c1:/home", "/home", s).expanded).toEqual(["/home", "/home/y"])
  })
})
