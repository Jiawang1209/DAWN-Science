/**
 * `run_code`：在对话自己的内核里跑代码（②，2026-08-14）。
 *
 * 这一组盯的是**给模型的那段文字**——工具的价值全在它身上：
 * 报错要带 traceback（不然模型改不动代码）、图不能塞进去（烧 token 且多数模型
 * 在工具结果里看不到图）、而**不说清楚图去哪了，模型会以为没画出来反复重画**。
 */
import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { createRunCodeTool, 内核指引, 摘要 } from "../../src/tools/run-code.js"
import { 对话内核 } from "../../src/kernel/挂载.js"
import type { SessionId } from "../../src/runtime/types.js"

const 对话 = "c1" as SessionId

/** 一台按脚本吐输出的假内核 */
function 挂上(脚本: unknown[]) {
  const 听众 = new Map<string, (e: unknown) => void>()
  const runtime = {
    start: async (spec: { sessionId: string }) => ({ sessionId: spec.sessionId, pid: 0 }),
    attach: (id: string, sink: (e: unknown) => void) => {
      听众.set(id, sink)
      return () => 听众.delete(id)
    },
    write: (id: string) => {
      const 发 = 听众.get(id)!
      for (const entry of 脚本) 发({ kind: "kernel_output", entry })
      发({ kind: "kernel_output", entry: { kind: "status", state: "idle" } })
    },
    stop: async () => {},
  } as never
  const 内核 = new 对话内核({
    runtime,
    workspaceOf: () => "/w/proj",
    sessionDirOf: () => "/dir",
    interpreterOf: () => "/usr/bin/python3",
  })
  return createRunCodeTool({ 对话, 内核 })
}

const 跑 = (工具: ReturnType<typeof createRunCodeTool>, p: Record<string, unknown>) =>
  工具.execute("c1", p as { language?: unknown; code?: unknown })

describe("摘要 · 给模型的那段文字", () => {
  it("stdout 原样给，stderr 单独标 —— 混在一起会让人漏看报错", () => {
    const r = 摘要([
      { kind: "stream", stream: "stdout", text: "12438 rows" },
      { kind: "stream", stream: "stderr", text: "FutureWarning" },
    ])
    expect(r.文字).toContain("12438 rows")
    expect(r.文字).toContain("[stderr] FutureWarning")
    expect(r.出错了).toBe(false)
  })

  /** **只给 `ename: evalue` 的话模型改不动代码**——它要知道错在哪一行 */
  it("报错要带 traceback", () => {
    const r = 摘要([
      { kind: "error", ename: "KeyError", evalue: "'age'", traceback: ["line 3, in <module>"] },
    ])
    expect(r.出错了).toBe(true)
    expect(r.文字).toContain("KeyError: 'age'")
    expect(r.文字).toContain("line 3")
  })

  /**
   * **图不塞进去，但必须说它在哪。**
   * 不说的话，模型会以为自己没画出来，然后反复重画。
   */
  it("图只说「生成了一张」，并点明它已经在对话里", () => {
    const r = 摘要([{ kind: "display", mediaType: "image/png", data: "iVBORw0KGgo…" }])
    expect(r.文字).toContain("image/png")
    expect(r.文字).toContain("对话")
    expect(r.文字, "base64 不该进上下文").not.toContain("iVBORw0KGgo")
  })

  it("太大没渲染的那份，如实说太大", () => {
    expect(摘要([{ kind: "display", mediaType: "text/html", tooLarge: true }]).文字).toContain("太大")
  })

  it("**什么都没输出也要说一声** —— 一片空白会被读成「没跑」", () => {
    expect(摘要([{ kind: "status", state: "idle" }]).文字).toContain("没有产生任何输出")
  })

  it("`status` 不进摘要 —— 它是边界记号，不是内容", () => {
    expect(摘要([{ kind: "status", state: "busy" }, { kind: "stream", text: "x" }]).文字).toBe("x")
  })
})

describe("run_code · 工具本身", () => {
  it("跑通时**标明是哪门语言的内核**（定案 3）", async () => {
    const r = await 跑(挂上([{ kind: "stream", stream: "stdout", text: "hi" }]), {
      language: "python",
      code: "print('hi')",
    })
    expect(r.isError).toBeFalsy()
    expect(r.content[0]!.text).toContain("[python 内核]")
    expect(r.content[0]!.text).toContain("hi")
  })

  /**
   * **代码报错不是工具失败。** 标成 `isError` 会让有些实现直接中断这一轮，
   * 而模型本该看着 traceback 改代码继续。
   */
  it("代码报错时不标 isError，但要说清「代码报错」", async () => {
    const r = await 跑(挂上([{ kind: "error", ename: "ValueError", evalue: "x", traceback: [] }]), {
      language: "python",
      code: "raise ValueError('x')",
    })
    expect(r.isError).toBeFalsy()
    expect(r.content[0]!.text).toContain("代码报错")
    expect(r.content[0]!.text).toContain("ValueError")
  })

  it("两门语言各标各的", async () => {
    const r = await 跑(挂上([{ kind: "stream", text: "1" }]), { language: "R", code: "1+1" })
    expect(r.content[0]!.text).toContain("[R 内核]")
  })

  it("**language 只认这两门** —— 不猜一个默认出来", async () => {
    const r = await 跑(挂上([]), { language: "julia", code: "1" })
    expect(r.isError).toBe(true)
    expect(r.content[0]!.text).toContain("python")
  })

  it("空代码不送进内核", async () => {
    const r = await 跑(挂上([]), { language: "python", code: "   " })
    expect(r.isError).toBe(true)
  })

  /**
   * **起不来的原因要原样说出来**：「没配解释器」与「内核崩了」是两回事，
   * 笼统回一句「跑不了」会让模型反复试同一条死路。
   */
  it("内核起不来时，把原因原样交给模型", async () => {
    const 内核 = new 对话内核({
      runtime: { start: async () => ({ sessionId: "x", pid: 0 }) } as never,
      workspaceOf: () => undefined,
      sessionDirOf: () => "/dir",
      interpreterOf: () => "/usr/bin/python3",
    })
    const r = await 跑(createRunCodeTool({ 对话, 内核 }), { language: "python", code: "1" })
    expect(r.isError).toBe(true)
    expect(r.content[0]!.text).toContain("工作目录")
  })

  it("**对话是绑死的，不由模型指定** —— 它不该能往别的对话里跑代码", () => {
    const 工具 = 挂上([])
    expect(Object.keys((工具.parameters as { properties: object }).properties).sort()).toEqual([
      "code",
      "language",
    ])
  })
})

/**
 * 「笔记本」就是 `run_code`（2026-08-27，fix-notebook）。
 *
 * 作者 `tmp_20260819` 那段项目会话：agent 一直 write 脚本再 bash 跑，作者说「在笔记本里面显示一下」，
 * 它去 pip install nbformat 了——**它不知道笔记本指的是坞里那一格**。这两段文字锁住引导。
 */
describe("提示词：笔记本就是 run_code", () => {
  it("工具描述告诉模型「笔记本」= 这个工具，别去装 jupyter", () => {
    const tool = 挂上([])
    expect(tool.description).toContain("笔记本")
    expect(tool.description).toContain("不要去装 jupyter")
    expect(tool.description).toContain(".ipynb")
  })

  it("系统提示那句：探索用 run_code，只有要可复用文件才写 analysis/scripts/", () => {
    expect(内核指引).toContain("run_code")
    expect(内核指引).toContain("analysis/scripts/")
    expect(内核指引).toContain("笔记本")
  })

  it("native 运行时只在装配给了 kernels 时才追加这句（源码扫描——装配整份运行时太重）", () => {
    const src = readFileSync(new URL("../../src/runtime/native.ts", import.meta.url), "utf8")
    expect(src).toContain("this.opts.kernels ? [内核指引] : []")
  })
})
