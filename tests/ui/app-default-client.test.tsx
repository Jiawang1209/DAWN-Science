/**
 * App 的**默认 client 路径**（2026-08-08 真机抓到的缺陷）。
 *
 * `export function App({ client = createClient() })` —— 默认参数**每次渲染都求值**，
 * 于是每次渲染都得到一个新的 client 身份，每个依赖 `client` 的 effect 就每次渲染都重跑：
 * 重新订阅（累积 IPC 监听器）+ 重新取数（setState）→ 再渲染 → **无限循环**。
 *
 * 真机后果：渲染进程 18 秒吃满 4 GB，`<--- Near heap limit --->`。
 * 界面画得出来，但里面在空转。
 *
 * **419 个测试一个都没拦住，因为它们全都显式传了 client。**
 * 那条默认路径——也就是生产环境唯一走的那条——从来没被跑过。
 * 这与「叶子组件测试证明不了有没有人给它数据」是同一类漏洞：
 * **被测的形态和真实运行的形态不是同一个。**
 */
import { afterEach, describe, expect, it, vi } from "vitest"
import { act, render } from "@testing-library/react"
import { App } from "../../src/ui/App.js"
import { WORKBENCH_PROTOCOL_VERSION, OPERATIONS } from "../../src/protocol/index.js"

const original = window.dawn
type Bridge = NonNullable<typeof window.dawn>

afterEach(() => {
  if (original) window.dawn = original
  else delete window.dawn
})

/** 计数用的假桥接。挂在 window 上，走 App 的默认 client 路径 */
function installBridge() {
  const invokes: string[] = []
  const listeners = new Set<(raw: unknown) => void>()
  window.dawn = {
    invoke: async (op: string) => {
      invokes.push(op)
      const data =
        op === "getCapabilities"
          ? {
              workbenchProtocolVersion: WORKBENCH_PROTOCOL_VERSION,
              operations: Object.keys(OPERATIONS),
              entityTypes: [],
              maxPageSize: 200,
              readOnly: false,
            }
          : op === "listCredentials"
            ? { configured: [], encrypted: true }
            : op === "getProviders"
              ? { agents: [], providers: [] }
              : []
      return { ok: true, workbenchProtocolVersion: WORKBENCH_PROTOCOL_VERSION, data, warnings: [] }
    },
    onEvent: (cb: (raw: unknown) => void) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    pickDirectory: async () => null,
  }
  return { invokes, listeners }
}

const settle = async () => {
  // 若存在渲染→取数→再渲染的回路，这几轮足够让它把计数顶穿
  for (let i = 0; i < 20; i++) {
    await act(async () => {
      await Promise.resolve()
    })
  }
}

describe("App · 默认 client 路径（生产环境唯一走的那条）", () => {
  it("不传 client 时也不空转 —— 取数次数必须收敛", async () => {
    const { invokes } = installBridge()
    render(<App />)
    await settle()
    // 启动只需握手 + listProjects + listCredentials + getProviders 这几发。
    // 上不封顶地重复 = client 身份每次渲染都变，effect 跟着无限重跑
    // （2026-08-25 +1：记忆角标的 memoryOverview 随名册那发一起取——预算如实上调，不是放松）
    expect(invokes.length).toBeLessThan(16)
  })

  it("IPC 监听器只注册一次 —— 每次渲染都注册会把内存吃穿", async () => {
    const { listeners } = installBridge()
    render(<App />)
    await settle()
    expect(listeners.size).toBeLessThanOrEqual(1)
  })

  it("重渲染不产生新的取数风暴", async () => {
    const { invokes } = installBridge()
    const { rerender } = render(<App />)
    await settle()
    const after = invokes.length
    rerender(<App />)
    await settle()
    // 父组件重渲染不该让整套启动取数再来一遍
    expect(invokes.length - after).toBeLessThan(5)
  })

  it("显式传入的 client 仍然被采用 —— 修复不能把注入点弄丢", async () => {
    installBridge()
    const get = vi.fn(async (op: string) =>
      op === "getProviders"
        ? { agents: [], providers: [] }
        : op === "listCredentials"
          ? { configured: [], encrypted: true }
          : [],
    )
    const injected = {
      get,
      raw: async () => ({ data: [], warnings: [] }),
      handshake: async () => ({ readOnly: false, operations: [] }),
      subscribeUpdates: () => () => {},
      expectRevision: () => {},
      forgetRevision: () => {},
      pickDirectory: async () => null,
    } as unknown as NonNullable<Parameters<typeof App>[0]["client"]>

    render(<App client={injected} />)
    await settle()
    expect(get).toHaveBeenCalled()
  })
})
