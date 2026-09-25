/**
 * 「到坞里问」的顺序与失败规矩（Task 6 审查：抽成纯流程，把整张失败表走一遍）。
 */
import { describe, it, expect, beforeEach, vi } from "vitest"
import { 到坞里问, type 到坞里问的依赖, type 撤回的话 } from "../../../src/ui/state/ask-in-dock.js"
import { $lang } from "../../../src/ui/i18n/index.js"

beforeEach(() => $lang.set("zh"))

const 那句: 撤回的话 = { text: "换个角度看看", images: [{ from: "path", path: "/tmp/a.png" }] }

function 造(改: Partial<到坞里问的依赖> = {}) {
  const 记: string[] = []
  const dep = {
    取回: vi.fn(async () => (记.push("取回"), 那句)),
    另开: vi.fn(async () => (记.push("另开"), "新段")),
    打开: vi.fn(() => void 记.push("打开")),
    取写权: vi.fn(async (id: string) => void 记.push(`取写权:${id}`)),
    写: vi.fn(async (id: string, text: string) => void 记.push(`写:${id}:${text}`)),
    退回: vi.fn((话: 撤回的话) => void 记.push(`退回:${话.text}`)),
    说: vi.fn((m: string) => void 记.push(`说:${m}`)),
    发完: vi.fn(() => void 记.push("发完")),
    ...改,
  }
  return { dep, 记 }
}

describe("到坞里问", () => {
  it("顺序：取回 → 另开 → 打开 → 取写权 → 写（带原图）→ 发完；不退回、不出声", async () => {
    const { dep, 记 } = 造()
    await 到坞里问(dep)
    expect(记).toEqual(["取回", "另开", "打开", "取写权:新段", "写:新段:换个角度看看", "发完"])
    expect(dep.写).toHaveBeenCalledWith("新段", "换个角度看看", 那句.images)
    expect(dep.退回).not.toHaveBeenCalled()
    expect(dep.说).not.toHaveBeenCalled()
  })

  it("没处另开：退回一次（连图），真正的原因只说一种话——全局提示与抛给待发条的是同一句；不打开、不写", async () => {
    const { dep } = 造({ 另开: vi.fn(async () => Promise.reject(new Error("还没选项目，坞里没处另开"))) })
    const err = (await 到坞里问(dep).catch((e: unknown) => e)) as Error
    expect(dep.退回).toHaveBeenCalledTimes(1)
    expect(dep.退回).toHaveBeenCalledWith(那句)
    expect(dep.说).toHaveBeenCalledTimes(1)
    expect(dep.说).toHaveBeenCalledWith(err.message)
    expect(err.message).toContain("已放回输入框")
    expect(err.message).toContain("还没选项目，坞里没处另开")
    expect(err.message).not.toContain("空着")
    expect(dep.打开).not.toHaveBeenCalled()
    expect(dep.写).not.toHaveBeenCalled()
    expect(dep.发完).not.toHaveBeenCalled()
  })

  it("另开时抛（服务器断了之类）：同样退回、出声一次、不写", async () => {
    const { dep } = 造({ 另开: vi.fn(async () => Promise.reject(new Error("连不上"))) })
    await expect(到坞里问(dep)).rejects.toThrow(/已放回输入框.*连不上/)
    expect(dep.退回).toHaveBeenCalledTimes(1)
    expect(dep.说).toHaveBeenCalledTimes(1)
    expect(dep.写).not.toHaveBeenCalled()
  })

  it("第一句写失败：退回、出声，并说明坞里新开的那段还空着（它留在坞里：已经打开过）", async () => {
    const { dep } = 造({ 写: vi.fn(async () => Promise.reject(new Error("写入被拒"))) })
    const err = (await 到坞里问(dep).catch((e: unknown) => e)) as Error
    expect(dep.打开).toHaveBeenCalledTimes(1)
    expect(dep.退回).toHaveBeenCalledWith(那句)
    expect(err.message).toContain("空着")
    expect(err.message).toContain("写入被拒")
    expect(dep.说).toHaveBeenCalledWith(err.message)
    expect(dep.发完).not.toHaveBeenCalled()
  })

  it("取写权失败：与写失败同一个处理", async () => {
    const { dep } = 造({ 取写权: vi.fn(async () => Promise.reject(new Error("租约被占"))) })
    await expect(到坞里问(dep)).rejects.toThrow(/空着.*租约被占/)
    expect(dep.写).not.toHaveBeenCalled()
    expect(dep.退回).toHaveBeenCalledTimes(1)
  })

  it("取回拿到空：不静默走掉，抛一句；后面什么都不做、也没有可退回的", async () => {
    const { dep } = 造({ 取回: vi.fn(async () => undefined) })
    await expect(到坞里问(dep)).rejects.toThrow(/不在待发单上/)
    expect(dep.另开).not.toHaveBeenCalled()
    expect(dep.退回).not.toHaveBeenCalled()
  })

  it("取回本身抛（not_found）：原样抛出，不退回（这句本来就不在我们手里）", async () => {
    const { dep } = 造({ 取回: vi.fn(async () => Promise.reject(new Error("not_found"))) })
    await expect(到坞里问(dep)).rejects.toThrow("not_found")
    expect(dep.退回).not.toHaveBeenCalled()
    expect(dep.另开).not.toHaveBeenCalled()
  })
})
