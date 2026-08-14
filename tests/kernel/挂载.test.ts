/**
 * 给对话挂内核（②，2026-08-14）。
 *
 * 这一层**不碰内核本身**，只回答「哪个对话有哪些内核」。
 * 所以它可以脱离真内核测——`FakeRuntime` 就够，跑得快、也不依赖机器上装没装 R。
 *
 * 六条定案里这个文件负责三条，逐条钉：**懒起**、**每种语言一个且可共存**、
 * **输出反查得到是哪个内核**。
 */
import { describe, expect, it } from "vitest"
import { FakeRuntime } from "../../src/runtime/fake.js"
import { 对话内核 } from "../../src/kernel/挂载.js"
import type { SessionId } from "../../src/runtime/types.js"

const 对话 = "c1" as SessionId

function 造(workspace = "/w/proj") {
  const runtime = new FakeRuntime()
  const 挂 = new 对话内核({
    runtime,
    workspaceOf: () => workspace,
    sessionDirOf: (c, 语言) => `/w/proj/.dawn/${c}/kernels/${语言}`,
  })
  return { runtime, 挂 }
}

describe("定案 1 · 懒起", () => {
  it("**没要过就不起** —— 只想聊两句不该占一个 Python 进程", () => {
    const { 挂 } = 造()
    expect(挂.列(对话)).toEqual([])
    expect(挂.有(对话, "python")).toBe(false)
  })

  it("第一次要才起，第二次拿的是同一台 —— 变量才留得住", async () => {
    const { 挂 } = 造()
    const a = await 挂.拿(对话, "python")
    const b = await 挂.拿(对话, "python")
    expect(b.内核会话).toBe(a.内核会话)
    expect(挂.列(对话)).toEqual(["python"])
  })

  /**
   * **没有工作目录就起不了，而且要说清为什么。**
   * 代码总得有个地方跑；这时抛出去让调用方原样告诉模型，
   * 比返回 undefined 强——「没设工作目录」与「内核崩了」是两回事。
   */
  it("没有工作目录时**抛，并说得出原因**", async () => {
    /**
     * **不能写 `造(undefined)`**：显式传 `undefined` 会触发默认参数
     * （JS 的经典坑，第一版就栽在这儿——用例绿不了，而代码是对的）。
     * 直接构造，把「取不到工作区」这件事说死。
     */
    const 挂 = new 对话内核({
      runtime: new FakeRuntime(),
      workspaceOf: () => undefined,
      sessionDirOf: () => "/dir",
    })
    await expect(挂.拿(对话, "python")).rejects.toThrow(/工作目录/)
  })
})

describe("定案 2 · 每种语言一个，可以共存", () => {
  /**
   * 我原先定的是「一个会话最多一个、换语言就换」，
   * 理由是「同时挂会让『我的 `df` 在哪个里』说不清」——**作者追问后改的**：
   * 送代码时本来就带着语言，而 R 与 Python 的命名空间本来就分开。
   */
  it("Python 与 R 同时挂着，互不顶替", async () => {
    const { 挂 } = 造()
    const py = await 挂.拿(对话, "python")
    const r = await 挂.拿(对话, "R")

    expect(py.内核会话).not.toBe(r.内核会话)
    expect(挂.列(对话).sort()).toEqual(["R", "python"])
    // 起完 R 之后再拿 Python，**还是原来那台**（否则 df 就没了）
    expect((await 挂.拿(对话, "python")).内核会话).toBe(py.内核会话)
  })

  it("两个对话各有各的，不串台", async () => {
    const { 挂 } = 造()
    const a = await 挂.拿("c1" as SessionId, "python")
    const b = await 挂.拿("c2" as SessionId, "python")
    expect(a.内核会话).not.toBe(b.内核会话)
    expect(挂.列("c2" as SessionId)).toEqual(["python"])
  })

  it("每个内核一个隔离目录 —— 与 per-session 隔离同一条纪律", async () => {
    const { runtime } = 造()
    const 记 = new 对话内核({
      runtime,
      workspaceOf: () => "/w/proj",
      sessionDirOf: (c, 语言) => `/dir/${c}/${语言}`,
    })
    await 记.拿(对话, "python")
    await 记.拿(对话, "R")
    // 目录不同才谈得上隔离
    expect(记.语言(`${对话}::python` as SessionId)).toBe("python")
    expect(记.语言(`${对话}::R` as SessionId)).toBe("R")
  })
})

describe("定案 3 · 输出要反查得到是哪个内核", () => {
  /**
   * **事件回来时只带内核自己的 sessionId。** 反查不到，
   * 两个内核的输出就只能混在转录里——
   * 而「两处长得一样的东西等于没有判据」是本项目咬过三次的。
   */
  it("按内核会话 id 查得到语言与归属", async () => {
    const { 挂 } = 造()
    const py = await 挂.拿(对话, "python")
    const r = await 挂.拿(对话, "R")

    expect(挂.语言(py.内核会话)).toBe("python")
    expect(挂.语言(r.内核会话)).toBe("R")
    expect(挂.归属(py.内核会话)).toBe(对话)
  })

  it("**不认识的会话 id 回 undefined** —— 不猜一个语言出来", () => {
    const { 挂 } = 造()
    expect(挂.语言("别的会话" as SessionId)).toBeUndefined()
    expect(挂.归属("别的会话" as SessionId)).toBeUndefined()
  })
})

describe("收内核", () => {
  it("收完之后这个对话就没有内核了", async () => {
    const { 挂 } = 造()
    await 挂.拿(对话, "python")
    await 挂.拿(对话, "R")

    const r = await 挂.收(对话)
    expect(r.收了.sort()).toEqual(["R", "python"])
    expect(挂.列(对话)).toEqual([])
    expect(挂.语言(`${对话}::python` as SessionId), "反查也该跟着清掉").toBeUndefined()
  })

  /**
   * **一台收不掉不该拦住其余的。**
   * 抛出去的话，第一个失败会把后面几台的清理整个吞掉，
   * 那些内核就变成了没人认识的孤儿进程。
   */
  it("**一台收不掉，其余照收**，并把没收掉的报出来", async () => {
    const { runtime, 挂 } = 造()
    await 挂.拿(对话, "python")
    await 挂.拿(对话, "R")

    const 原 = runtime.stop.bind(runtime)
    runtime.stop = async (id) => {
      if (id.endsWith("::python")) throw new Error("这台卡住了")
      return 原(id)
    }

    const r = await 挂.收(对话)
    expect(r.收了).toEqual(["R"])
    expect(r.没收掉).toEqual([{ 语言: "python", 原因: "这台卡住了" }])
    // **表里不能留着它**：留着的话下次「拿」会拿到一台已经不在的
    expect(挂.列(对话)).toEqual([])
  })

  it("收一个对话不影响另一个", async () => {
    const { 挂 } = 造()
    await 挂.拿("c1" as SessionId, "python")
    await 挂.拿("c2" as SessionId, "python")
    await 挂.收("c1" as SessionId)
    expect(挂.列("c2" as SessionId)).toEqual(["python"])
  })
})
