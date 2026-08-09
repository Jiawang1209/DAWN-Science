/**
 * 子 agent 执行器（①-B″ · S1 第二片）。
 *
 * ## 这份测试**不把进程 mock 掉**
 *
 * 注入的只有「起哪个命令」，跑起来的是**真的 `node` 子进程**。
 * 退出码、stdout 的 NDJSON、stderr、kill 全部真实走一遍。
 *
 * 理由是计划 §6 那句话：*"进程隔离恰好是不变式 1 的最强实现——
 * 验证者拿不到生产者的上下文，不是因为我们过滤了，而是因为**它在另一个进程里**。
 * 过滤会漏，进程边界不会。"* **把进程 mock 掉，测的就正好不是那个边界。**
 */
import { describe, expect, it } from "vitest"
import { SubagentExecutor, SUBAGENT_LIMITS, type ChildFactory } from "../../src/subagent/executor.js"
import type { SubagentDefinition } from "../../src/subagent/definitions.js"

const def = (name: string): SubagentDefinition => ({
  name,
  description: `${name} 的描述`,
  systemPrompt: `你是 ${name}。`,
  filePath: `/fake/${name}.md`,
})

const DEFS = [def("scout"), def("planner"), def("worker")]

/** 一个立刻回一行 done 的子进程。`task` 原样回显，用来验参数真的传下去了 */
const echoChild = () => ({
  command: process.execPath,
  args: [
    "-e",
    `let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{` +
      `const spec=JSON.parse(s);` +
      `process.stdout.write(JSON.stringify({type:"done",ok:true,output:` +
      `"["+spec.agent+"] "+spec.task})+"\\n")})`,
  ],
})

/**
 * `childOf` 的形参写成 `ChildFactory`，**不是 `() => ChildCommand`**。
 * 后者能编译过大多数用例（它们确实不看参数），但会把
 * 「按 task 决定子进程行为」的那两条挡在门外——而那正是最要紧的两条：
 * chain 的失败传播、parallel 的完成顺序。
 */
/**
 * 测试用的上下文桩。
 *
 * 它是**必填**的，这是刻意的：少了它子进程收到的是半个规格，
 * 而失败方式是「每个子 agent 都说模型不存在」——要跨进程才查得出来。
 * 这里的假子进程不看这些字段，但类型逼着每个调用点想一遍。
 */
const CTX = {
  provider: "deepseek",
  model: "deepseek-v4-flash",
  cwd: "/tmp/w",
  agentDirOf: (i: number) => `/tmp/w/.dawn/sub-${i}`,
}

function exec(childOf: ChildFactory = echoChild, limits?: Partial<typeof SUBAGENT_LIMITS>) {
  return new SubagentExecutor({ childOf, context: CTX, ...(limits ? { limits } : {}) })
}

describe("single —— 一个 agent 一个任务", () => {
  it("跑得起来，输出回得来", async () => {
    const r = await exec().run({ mode: "single", agent: "scout", task: "找认证代码" }, DEFS)
    expect(r.results).toHaveLength(1)
    expect(r.results[0]!.ok).toBe(true)
    expect(r.results[0]!.output).toBe("[scout] 找认证代码")
  })

  it("**没有这个 agent 就出声** —— 不静默降级到某个默认 agent", async () => {
    const r = await exec().run({ mode: "single", agent: "不存在", task: "t" }, DEFS)
    expect(r.results[0]!.ok).toBe(false)
    expect(r.results[0]!.error).toContain("不存在")
    // 出错也要说清有哪些可选，否则用户只能去翻目录
    expect(r.results[0]!.error).toContain("scout")
  })
})

describe("parallel —— 并发跑，上界钉死", () => {
  it("结果**按输入顺序**返回，不按完成顺序", async () => {
    // 第一个故意慢，若按完成顺序就会跑到后面去
    const slowFirst = (s: { task: string }) => ({
      command: process.execPath,
      args: [
        "-e",
        `const ms=${JSON.stringify(s.task)}==="慢"?120:0;` +
          `setTimeout(()=>process.stdout.write(JSON.stringify(` +
          `{type:"done",ok:true,output:${JSON.stringify(s.task)}})+"\\n"),ms)`,
      ],
    })
    const r = await exec(slowFirst).run(
      {
        mode: "parallel",
        tasks: [
          { agent: "scout", task: "慢" },
          { agent: "scout", task: "快1" },
          { agent: "scout", task: "快2" },
        ],
      },
      DEFS,
    )
    expect(r.results.map((x) => x.output)).toEqual(["慢", "快1", "快2"])
  })

  it(`**同时在跑的不超过 ${SUBAGENT_LIMITS.maxConcurrent} 个**`, async () => {
    /**
     * 峰值从**进度回调**数，不从子进程数。
     *
     * 第一版我在 childOf 的返回值里塞了个 `onExit` 让测试能减计数——
     * **那是给测试开的后门**。进度回调不是脚手架：界面的 chip 组
     * （⏳ 运行中 / ✓ 完成）本来就要它，计划 §6 写明了那个形态。
     */
    let live = 0
    let peak = 0
    const slow = () => ({
      command: process.execPath,
      args: [
        "-e",
        `setTimeout(()=>process.stdout.write(JSON.stringify({type:"done",ok:true,output:"x"})+"\\n"),60)`,
      ],
    })
    const ex = new SubagentExecutor({
      childOf: slow,
      context: CTX,
      onProgress: (p) => {
        if (p.type === "started") peak = Math.max(peak, ++live)
        else live--
      },
    })
    const tasks = Array.from({ length: 8 }, (_, i) => ({ agent: "scout", task: `t${i}` }))
    await ex.run({ mode: "parallel", tasks }, DEFS)
    expect(peak).toBeLessThanOrEqual(SUBAGENT_LIMITS.maxConcurrent)
    expect(peak).toBeGreaterThan(1) // 真的并发了，不是串行跑完的
    expect(live).toBe(0) // 每个 started 都配了一个 settled
  })

  it("**进度回调按任务序号报到** —— 界面要靠它认出是哪一条", async () => {
    const seen: string[] = []
    const ex = new SubagentExecutor({
      childOf: echoChild,
      context: CTX,
      onProgress: (p) => seen.push(`${p.type}:${p.index}`),
    })
    await ex.run(
      {
        mode: "parallel",
        tasks: [
          { agent: "scout", task: "a" },
          { agent: "planner", task: "b" },
        ],
      },
      DEFS,
    )
    expect(seen.filter((s) => s.startsWith("started")).sort()).toEqual(["started:0", "started:1"])
    expect(seen.filter((s) => s.startsWith("settled")).sort()).toEqual(["settled:0", "settled:1"])
  })

  it(`**超过 ${SUBAGENT_LIMITS.maxTasks} 个任务要出声拒绝** —— 不静默截断成前 8 个`, async () => {
    const tasks = Array.from({ length: 9 }, (_, i) => ({ agent: "scout", task: `t${i}` }))
    const r = await exec().run({ mode: "parallel", tasks }, DEFS)
    expect(r.rejected).toBeDefined()
    expect(r.rejected).toContain("9")
    expect(r.rejected).toContain(String(SUBAGENT_LIMITS.maxTasks))
    // 一个都没跑：**要么按你说的做，要么说做不了**，不做一半
    expect(r.results).toEqual([])
  })
})

describe("chain —— 顺序执行，{previous} 传结果", () => {
  it("{previous} 被替换成上一步的输出", async () => {
    const r = await exec().run(
      {
        mode: "chain",
        chain: [
          { agent: "scout", task: "踏勘" },
          { agent: "planner", task: "基于：{previous}" },
        ],
      },
      DEFS,
    )
    expect(r.results[1]!.output).toBe("[planner] 基于：[scout] 踏勘")
  })

  it("**第一步就是原样的任务** —— 第一步没有 previous 可用", async () => {
    const r = await exec().run(
      { mode: "chain", chain: [{ agent: "scout", task: "开头 {previous} 结尾" }] },
      DEFS,
    )
    // 没有上一步时，占位符替换成空串而不是留着字面量吓人
    expect(r.results[0]!.output).toBe("[scout] 开头  结尾")
  })

  it("**一步失败就停，并说清是第几步** —— 拿失败的结果往下传是编造", async () => {
    const failSecond = (s: { task: string }) =>
      s.task.startsWith("[") || s.task === "第二步"
        ? { command: process.execPath, args: ["-e", "process.exit(3)"] }
        : echoChild()
    const r = await exec(failSecond).run(
      {
        mode: "chain",
        chain: [
          { agent: "scout", task: "第一步" },
          { agent: "planner", task: "第二步" },
          { agent: "worker", task: "第三步" },
        ],
      },
      DEFS,
    )
    expect(r.results).toHaveLength(2)
    expect(r.results[0]!.ok).toBe(true)
    expect(r.results[1]!.ok).toBe(false)
    expect(r.stoppedAtStep).toBe(2)
  })
})

describe("子进程出问题时，必须说清楚", () => {
  it("非 0 退出 —— 带上退出码与 stderr", async () => {
    const bad = () => ({
      command: process.execPath,
      args: ["-e", `process.stderr.write("模型没配好");process.exit(3)`],
    })
    const r = await exec(bad).run({ mode: "single", agent: "scout", task: "t" }, DEFS)
    expect(r.results[0]!.ok).toBe(false)
    expect(r.results[0]!.error).toContain("3")
    expect(r.results[0]!.error).toContain("模型没配好")
  })

  it("**退出码 0 但没给结果** —— 这也是失败，不是空结果", async () => {
    const silent = () => ({ command: process.execPath, args: ["-e", "process.exit(0)"] })
    const r = await exec(silent).run({ mode: "single", agent: "scout", task: "t" }, DEFS)
    expect(r.results[0]!.ok).toBe(false)
    expect(r.results[0]!.error).toMatch(/没有|未给出/)
  })

  it("子进程说自己失败了，父侧照实转述", async () => {
    const failing = () => ({
      command: process.execPath,
      args: [
        "-e",
        `process.stdout.write(JSON.stringify({type:"done",ok:false,error:"上下文超了"})+"\\n")`,
      ],
    })
    const r = await exec(failing).run({ mode: "single", agent: "scout", task: "t" }, DEFS)
    expect(r.results[0]!.ok).toBe(false)
    expect(r.results[0]!.error).toContain("上下文超了")
  })

  it("起不来的命令 —— 不抛异常，记成这条任务失败", async () => {
    const missing = () => ({ command: "这个命令不存在-dawn", args: [] })
    const r = await exec(missing).run({ mode: "single", agent: "scout", task: "t" }, DEFS)
    expect(r.results[0]!.ok).toBe(false)
    expect(r.results[0]!.error).toBeTruthy()
  })
})

describe("输出上限：截断可以，不出声不行", () => {
  it("**超限时说清省了多少** —— 规格 7.5", async () => {
    const huge = () => ({
      command: process.execPath,
      args: [
        "-e",
        `process.stdout.write(JSON.stringify({type:"done",ok:true,output:"x".repeat(300000)})+"\\n")`,
      ],
    })
    const r = await exec(huge, { maxOutputBytes: 1024 }).run(
      { mode: "single", agent: "scout", task: "t" },
      DEFS,
    )
    const got = r.results[0]!
    expect(got.ok).toBe(true)
    expect(got.outputTruncated).toBe(true)
    // 真数，不是「已截断」四个字
    expect(got.outputBytes).toBe(300000)
    expect(got.output.length).toBeLessThanOrEqual(1024)
  })

  it("没超限时**不许标成截断了**", async () => {
    const r = await exec().run({ mode: "single", agent: "scout", task: "短" }, DEFS)
    expect(r.results[0]!.outputTruncated).toBe(false)
  })
})

describe("中止", () => {
  it("**abort 之后子进程要真的死掉** —— 不是父侧不看了而已", async () => {
    const forever = () => ({
      command: process.execPath,
      args: ["-e", "setInterval(()=>{},1000)"],
    })
    const ac = new AbortController()
    const p = exec(forever).run({ mode: "single", agent: "scout", task: "t" }, DEFS, ac.signal)
    setTimeout(() => ac.abort(), 50)
    const r = await p
    expect(r.results[0]!.ok).toBe(false)
    expect(r.results[0]!.error).toMatch(/中止|abort/i)
  })
})
