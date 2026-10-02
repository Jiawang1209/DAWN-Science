/**
 * `run_code`：在对话自己的内核里跑代码（②，2026-08-14）。
 *
 * 这一组盯的是**给模型的那段文字**——工具的价值全在它身上：
 * 报错要带 traceback（不然模型改不动代码）、图不能塞进去（烧 token 且多数模型
 * 在工具结果里看不到图）、而**不说清楚图去哪了，模型会以为没画出来反复重画**。
 */
import { describe, expect, it, vi } from "vitest"
import { readFileSync } from "node:fs"
import { createRunCodeTool, 内核指引, 摘要 } from "../../src/tools/run-code.js"
import { translateOutput } from "../../src/kernel/outputs.js"
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
  it("表达式的 text/plain 结果直接交给模型", () => {
    expect(摘要([{ kind: "result", mediaType: "text/plain", data: "42" }]).文字).toBe("42")
    expect(摘要([{ kind: "display", mediaType: "application/json", data: '{"mean": 3.14}' }]).文字).toContain('"mean": 3.14')
  })

  it("富表格保留纯文字回退，界面继续拿 HTML", () => {
    const output = translateOutput({
      message: { header: { msg_id: "m", msg_type: "execute_result" }, parent_header: {}, metadata: {}, content: {
        data: { "text/html": "<table><tr><td>3.14</td></tr></table>", "text/plain": ["mean\n", "3.14"] },
      } },
      provenance: { kernelInstanceId: "k", kernelRevision: 1 },
    })
    expect(output[0]).toMatchObject({ mediaType: "text/html", data: "<table><tr><td>3.14</td></tr></table>" })
    expect(摘要(output).文字).toBe("mean\n3.14")
  })

  it("超大 HTML 不渲染，但纯文字回退仍给模型并说明截断", () => {
    const output = translateOutput({
      message: { header: { msg_id: "large", msg_type: "execute_result" }, parent_header: {}, metadata: {}, content: {
        data: { "text/html": "x".repeat(5 * 1024 * 1024 + 1), "text/plain": "mean 3.14" },
      } },
      provenance: { kernelInstanceId: "k", kernelRevision: 1 },
    })
    expect(output[0]).toMatchObject({ tooLarge: true, data: "", textFallback: { text: "mean 3.14" } })
    expect(摘要(output).文字).toContain("mean 3.14")
    expect(摘要(output).文字).toContain("太大没有渲染")
    expect(摘要([{ kind: "display", mediaType: "text/html", tooLarge: true,
      textFallback: { text: "mean 3.14", truncated: { originalBytes: 200000, keptBytes: 102400 } },
    }]).文字).toContain("原始 200000 字节，保留 102400 字节")
    expect(摘要([{ kind: "display", mediaType: "image/png", tooLarge: true,
      data: "image bytes", textFallback: { text: "image fallback" },
    }]).文字).toBe("（一份 image/png 输出，太大没有渲染）")
  })

  it("表达式结果也受工具输出上限约束", () => {
    const r = 摘要([{ kind: "result", mediaType: "text/plain", data: "数值\n".repeat(20000) }])
    expect(r.文字).toContain("数值")
    expect(r.文字).toContain("省略约")
    expect(Buffer.byteLength(r.文字)).toBeLessThan(52 * 1024)
  })

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

  /**
   * **给模型的那份有上限**（2026-09-27，上下文用量与压缩 spec D6）：与 pi 自带 bash 同一个数（50 KB）。
   * 头尾各留一半——报错与最后一行结论在尾巴上；中间一行说省了多少、怎么取窄。**不写盘**：变量还在内核里，取窄比读文件对
   * （远端会话的模型根本读不到本机路径）。
   */
  it("超过 50 KB：头尾各留、中间说省了多少，并指路「在内核里取窄」", () => {
    const 行 = Array.from({ length: 20_000 }, (_, i) => `row ${i}`).join("\n")
    const r = 摘要([{ kind: "stream", stream: "stdout", text: 行 }])
    expect(Buffer.byteLength(r.文字, "utf8")).toBeLessThan(52 * 1024)
    expect(r.文字).toContain("row 0\n")
    expect(r.文字).toContain("row 19999")
    expect(r.文字).toMatch(/省略约 \d+ 字节/)
    expect(r.文字).toContain("变量还在内核里")
  })

  it("50 KB 以内：一个字不动", () => {
    const r = 摘要([{ kind: "stream", stream: "stdout", text: "12438 rows" }])
    expect(r.文字).toBe("12438 rows")
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

/**
 * 一台「慢」内核：写进去只吐两行、**不回 idle**；中断时回 KeyboardInterrupt + idle——真内核被 SIGINT 就是这样。
 * `会停: false` 演「装聋」：卡在不理 SIGINT 的 C 扩展里。听众按集合存：常驻监听与每段自己那只耳朵要同时在。
 */
function 慢内核(会停 = true) {
  const 听众 = new Map<string, Set<(e: unknown) => void>>()
  const 记: string[] = []
  const 发给 = (id: string, e: unknown) => {
    for (const f of [...(听众.get(id) ?? [])]) f(e)
  }
  const runtime = {
    start: async (spec: { sessionId: string }) => ({ sessionId: spec.sessionId, pid: 0 }),
    attach: (id: string, sink: (e: unknown) => void) => {
      const 这台 = 听众.get(id) ?? new Set<(e: unknown) => void>()
      这台.add(sink)
      听众.set(id, 这台)
      return () => {
        这台.delete(sink)
      }
    },
    write: (id: string, code: string) => {
      记.push(`write:${code}`)
      发给(id, { kind: "kernel_output", entry: { kind: "stream", stream: "stdout", text: "1\n2\n" } })
    },
    abort: async (id: string) => {
      记.push("interrupt")
      if (!会停) return
      发给(id, { kind: "kernel_output", entry: { kind: "error", ename: "KeyboardInterrupt", evalue: "", traceback: [] } })
      发给(id, { kind: "kernel_output", entry: { kind: "status", state: "idle" } })
    },
    stop: async () => {},
  } as never
  const 内核 = new 对话内核({
    runtime,
    workspaceOf: () => "/w/proj",
    sessionDirOf: () => "/dir",
    interpreterOf: () => "/usr/bin/python3",
  })
  return { 内核, 记 }
}

const 等一拍 = () => new Promise((r) => setTimeout(r, 0))

describe("中止（2026-09-25，调整方向 §4.1）：pi 的中止信号 → 那台内核的中断", () => {
  it("跑到一半被中止：给那台内核发一次中断；结果照实写「已中断」+ 已有输出", async () => {
    const { 内核, 记 } = 慢内核()
    const ctrl = new AbortController()
    const 跑着 = createRunCodeTool({ 对话, 内核 }).execute(
      "c1",
      { language: "python", code: "for i in range(100): print(i)" },
      ctrl.signal,
    )
    await vi.waitFor(() => expect(记).toContain("write:for i in range(100): print(i)"))
    ctrl.abort()
    const r = await 跑着
    expect(记.filter((x) => x === "interrupt")).toHaveLength(1)
    const 文 = r.content[0]!.text
    expect(文).toContain("已中断")
    expect(文, "已经吐出来的输出留着").toContain("1\n2")
    expect(文).toContain("KeyboardInterrupt")
  })

  it("还没开始就已中止：一个字都不写进内核，也不起内核", async () => {
    const { 内核, 记 } = 慢内核()
    const ctrl = new AbortController()
    ctrl.abort()
    const r = await createRunCodeTool({ 对话, 内核 }).execute("c1", { language: "python", code: "1" }, ctrl.signal)
    expect(r.isError).toBe(true)
    expect(r.content[0]!.text).toContain("没有跑")
    expect(记).toEqual([])
  })

  it("排在别的段后面时被中止：马上交还，不去打断前面那段；轮到它时也不写进去", async () => {
    const { 内核, 记 } = 慢内核()
    void 内核.执行(对话, "python", "你在笔记本里敲的").catch(() => {})
    await vi.waitFor(() => expect(记).toContain("write:你在笔记本里敲的"))
    const ctrl = new AbortController()
    const 跑着 = createRunCodeTool({ 对话, 内核 }).execute("c1", { language: "python", code: "排着的" }, ctrl.signal)
    ctrl.abort()
    const r = await 跑着
    expect(r.content[0]!.text).toContain("没有跑")
    expect(记.filter((x) => x === "interrupt"), "排着的不该去打断别人的那段").toEqual([])
    // 前面那段收尾：排着的这段轮到了，也不写
    await 内核.中断(对话, "python")
    await 等一拍()
    await 等一拍()
    expect(记).not.toContain("write:排着的")
  })

  it("中断发了、内核迟迟不停：到点先交还 pi（这一轮要能停下来），并如实说内核可能还在跑", async () => {
    const { 内核, 记 } = 慢内核(false)
    const ctrl = new AbortController()
    const 跑着 = createRunCodeTool({ 对话, 内核, 中断等待毫秒: 20 }).execute(
      "c1",
      { language: "python", code: "卡住" },
      ctrl.signal,
    )
    await vi.waitFor(() => expect(记).toContain("write:卡住"))
    ctrl.abort()
    const r = await 跑着
    expect(记).toContain("interrupt")
    expect(r.isError).toBe(true)
    expect(r.content[0]!.text).toContain("还没停下")
  })

  it("给了信号但没中止：照旧，不多发中断", async () => {
    const r = await 挂上([{ kind: "stream", stream: "stdout", text: "42" }]).execute(
      "c1",
      { language: "python", code: "print(42)" },
      new AbortController().signal,
    )
    expect(r.content[0]!.text).toBe("[python 内核]\n42")
  })
})
