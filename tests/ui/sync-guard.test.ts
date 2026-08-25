/**
 * 加载器的会话身份守卫（审查 debug I3）。
 *
 * 场景：用户在 A 会话点了一下，`listRuns` / `getContextUsage` 飞出去了；他等不及切到 B。
 * A 的响应这时才回来——**它必须被丢掉**，否则 B 的概览会显示 A 的账本 / 用量。
 *
 * 这与 `resyncSession` 用的是同一道防线：比对这条响应属于的会话是否还是当前活跃的那个。
 */
import { describe, expect, it, beforeEach } from "vitest"
import { loadRuns, loadContextUsage } from "../../src/ui/state/sync.js"
import { $runs, $contextUsage, setRuns, setContextUsage } from "../../src/ui/state/catalog.js"
import { $activeSessionId } from "../../src/ui/state/view.js"
import type { RunSummary } from "../../src/protocol/index.js"

/** 一个可控延迟的假 client：get 返回一个我们手动 resolve 的 promise */
function 假client(payloadOf: (op: string) => unknown) {
  let 放行!: () => void
  const 闸 = new Promise<void>((r) => (放行 = r))
  return {
    client: {
      get: async (op: string) => {
        await 闸
        return payloadOf(op)
      },
    } as never,
    放行,
  }
}

const run = (id: string): RunSummary =>
  ({ runId: id, sessionId: "A", startedAt: "2026-08-25T00:00:00Z" }) as unknown as RunSummary

beforeEach(() => {
  setRuns([])
  setContextUsage(undefined)
  $activeSessionId.set(undefined)
})

describe("loadRuns —— 会话身份守卫", () => {
  it("**A 的账本回来晚了,人已切到 B —— 不许覆盖**", async () => {
    $activeSessionId.set("A")
    const { client, 放行 } = 假client(() => [run("r-A")])
    const p = loadRuns(client, "p1", "A")
    // 响应还没回来,用户切到 B
    $activeSessionId.set("B")
    放行()
    await p
    expect($runs.get()).toEqual([]) // A 的 run 被丢掉,没渗进 B
  })

  it("还是同一个会话时,照常应用", async () => {
    $activeSessionId.set("A")
    const { client, 放行 } = 假client(() => [run("r-A")])
    const p = loadRuns(client, "p1", "A")
    放行()
    await p
    expect($runs.get().map((r) => r.runId)).toEqual(["r-A"])
  })

  it("不带 sessionId(项目全量,审阅那格)—— 没有会话可比,照常应用", async () => {
    $activeSessionId.set("B")
    const { client, 放行 } = 假client(() => [run("r-proj")])
    const p = loadRuns(client, "p1")
    放行()
    await p
    expect($runs.get().map((r) => r.runId)).toEqual(["r-proj"])
  })
})

describe("loadContextUsage —— 会话身份守卫", () => {
  it("**A 的用量回来晚了,人已切到 B —— 不许覆盖**", async () => {
    $activeSessionId.set("A")
    const { client, 放行 } = 假client(() => ({ used: 111, total: 999 }))
    const p = loadContextUsage(client, "A")
    $activeSessionId.set("B")
    放行()
    await p
    expect($contextUsage.get()).toBeUndefined()
  })

  it("还是同一个会话时,照常应用", async () => {
    $activeSessionId.set("A")
    const { client, 放行 } = 假client(() => ({ used: 111, total: 999 }))
    const p = loadContextUsage(client, "A")
    放行()
    await p
    expect($contextUsage.get()).toMatchObject({ used: 111 })
  })
})
