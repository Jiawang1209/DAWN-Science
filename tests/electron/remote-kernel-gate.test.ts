/**
 * 装配层那道闸：**连上 → 扫残留（带「别动」名单）→ 接回 → 才放行**（接回，2026-09-04 定案 9）。
 *
 * 这是那一轮改动里最险的一处，而在装配层一条判据都没有（审查 2026-09-04）：
 * `interpreterOf` 与 `接回门` 都 `await` 同一条 promise，顺序错一步的后果是
 * 「扫残留打死了正要接回的那台」或者「内核还没接回来就起了新的一台」——两种症状在界面上
 * 都只是「变量没了」，看不出是这里的错。
 *
 * 与 `remote-kernel.test.ts` 分一个文件：那份要一台真 python（`DAWN_FAKE_SSH_PYTHON`）才跑得动，
 * 而这两条只关心**次序与并发**，一台内核都不用起；且这里 `vi.mock` 了 `kernel-launch`，
 * 不该把那份的判据也拖进来。
 */
import { afterEach, describe, expect, it, vi } from "vitest"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

/**
 * 扫残留包一层，**开始与结束都记一笔**。
 *
 * 光看命令发出去的顺序证不了「扫完了才接回」（`remote-kernel.test.ts` 里那段说明同一个道理）：
 * 要的是「扫残留的**应答**回来之前，接回那一步一步都没走」。`vi.hoisted` 是因为 `vi.mock` 的
 * 工厂会在 `wiring.js` 被 import 的过程中就跑起来——那时模块体里的 `const` 还在 TDZ 里。
 */
const { 顺序 } = vi.hoisted(() => ({ 顺序: [] as string[] }))
vi.mock("../../src/remote/kernel-launch.js", async (原) => {
  const m = await 原<typeof import("../../src/remote/kernel-launch.js")>()
  return {
    ...m,
    扫残留: async (...a: Parameters<typeof m.扫残留>) => {
      顺序.push("扫:开始")
      try {
        return await m.扫残留(...a)
      } finally {
        顺序.push("扫:完")
      }
    },
  }
})

import { createWorkbench } from "../../src/electron/wiring.js"
import { KernelRuntime } from "../../src/runtime/kernel.js"
import { memoryCredentials } from "../helpers/credentials.js"
import { 假口令, 清空记录 } from "../../src/remote/fake-ssh.js"
import { 设扫残留延迟 } from "../../src/remote/fake-ssh-kernel.js"

/** 配置文件与它所在的临时目录——用完自己删（与 `remote-kernel.test.ts` 同一份写法） */
function configFile(): { file: string; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), "dawn-cfg-"))
  const file = join(dir, "providers.yaml")
  writeFileSync(
    file,
    `agents:
  ds-chat:
    kind: native
    provider: deepseek
    model: deepseek-v4-flash
    capabilities: [chat]
`,
  )
  return { file, dir }
}

function newDbPath(): { file: string; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), "dawn-db-"))
  return { file: join(dir, "dawn.db"), dir }
}

/** 一台连上的假服务器 + 一段挂在它上面的远端会话 */
async function 装一台() {
  const cfg = configFile()
  const db = newDbPath()
  const scratch = mkdtempSync(join(tmpdir(), "dawn-gate-"))
  清空记录()
  const wb = createWorkbench({
    configPath: cfg.file,
    dbPath: db.file,
    credentials: memoryCredentials({ deepseek: "sk-test" }),
    fakeSsh: true,
    scratchRoot: scratch,
  })
  const 收 = async () => {
    await wb.closeAsync(15_000).catch(() => {})
    rmSync(scratch, { recursive: true, force: true })
    rmSync(cfg.dir, { recursive: true, force: true })
    rmSync(db.dir, { recursive: true, force: true })
  }
  const saved = (await wb.server.handle("saveConnection", {
    label: "fake-gate",
    host: "h",
    username: "u",
    secret: 假口令,
  })) as { ok: boolean; data: { id: string } }
  expect(saved.ok, JSON.stringify(saved)).toBe(true)
  return { wb, 收, connectionId: saved.data.id }
}

const 一会儿 = (ms: number) => new Promise((r) => setTimeout(r, ms))

afterEach(() => {
  设扫残留延迟(0) // 模块级开关，别留给下一条用例
  顺序.length = 0
  vi.restoreAllMocks()
})

describe("连上之后那道闸（定案 9）", () => {
  /**
   * 定案 9 的整句话：**扫残留（带名单）在前、接回在后，两件事都完了才放 `run_code` 过**。
   *
   * 三处判据缺一不可：
   * ① 扫在接回之前——反过来的话，接回刚重建好隧道的那台会被扫残留的 `pkill` 打死；
   * ② 接回**跑完**了闸才开——没跑完就放行，起内核那条路会看到一台还在 `detached` 的内核，
   *    于是起第二台，变量在第一台里；
   * ③ 扫残留的**应答**回来之前接回一步都不许走（`设扫残留延迟` 就是为这个）。
   */
  it("先扫残留、再接回，两件都跑完了才放起内核那条路过", async () => {
    const 接回 = vi.spyOn(KernelRuntime.prototype, "接回远端").mockImplementation(async () => {
      顺序.push("接回:开始")
      await 一会儿(80)
      顺序.push("接回:完")
    })
    设扫残留延迟(300)
    const { wb, 收, connectionId } = await 装一台()
    try {
      const connected = await wb.server.handle("connectRemote", { id: connectionId })
      expect(connected.ok, JSON.stringify(connected)).toBe(true)

      const p = await wb.server.handle("getProviders", {})
      const agentId = (p as { data: { agents: { agentId: string; kind: string }[] } }).data.agents.find(
        (a) => a.kind === "native",
      )?.agentId
      const rs = (await wb.server.handle("createRemoteSession", { connectionId, agentId })) as {
        ok: boolean
        data: { sessionId: string }
      }
      expect(rs.ok, JSON.stringify(rs)).toBe(true)

      /**
       * `runInKernel` 必经 `接回门` 与 `interpreterOf`，两处都 `await` 那道闸。
       * **成不成功不重要**（这台假服务器上没有 python，多半是「没装 ipykernel」那句错）——
       * 要的是它**什么时候回来**：闸没开它就回不来。
       */
      await wb.server.handle("runInKernel", {
        sessionId: rs.data.sessionId,
        language: "python",
        code: "print(1)",
      })
      顺序.push("放行")

      expect(顺序, `实际顺序：${JSON.stringify(顺序)}`).toEqual(["扫:开始", "扫:完", "接回:开始", "接回:完", "放行"])
      expect(接回).toHaveBeenCalledWith(connectionId)
    } finally {
      await 收()
    }
  }, 30_000)

  /**
   * 「断→连→断→连」快来一遍（合盖、Wi-Fi 抖一下就是这个形状）。
   *
   * 每次 `ready` 都往 `扫过` 里写一条新链；不把新链接在旧链后面的话，同一台服务器上会有**两条链
   * 同时在飞**——两次扫残留、两次 `接回远端` 互相踩：一条正在重建隧道、另一条看到同一条 `分离的`
   * 记录也去认领同一个 pid。审查 2026-09-04 抓的。
   */
  it("断→连→断→连：同一台服务器上的接回不会两条并行", async () => {
    let 在飞 = 0
    let 峰值 = 0
    const 接回 = vi.spyOn(KernelRuntime.prototype, "接回远端").mockImplementation(async () => {
      在飞++
      峰值 = Math.max(峰值, 在飞)
      await 一会儿(200)
      在飞--
    })
    设扫残留延迟(300)
    const { wb, 收, connectionId } = await 装一台()
    try {
      const 连 = async () => {
        const r = await wb.server.handle("connectRemote", { id: connectionId })
        expect(r.ok, JSON.stringify(r)).toBe(true)
      }
      await 连()
      // 第一条链还卡在扫残留的应答上（延迟 300ms）时就断开、再连上：第二条链来了
      await wb.server.handle("disconnectRemote", { id: connectionId })
      await 连()

      // 等到两条链都尘埃落定（扫 300 + 接回 200，各留足余量）
      await 一会儿(1500)

      expect(峰值, "同一台服务器上不许有两个 `接回远端` 同时在飞").toBeLessThanOrEqual(1)
      expect(接回.mock.calls.length, "接回这件事总得真发生过一次，不然这条用例什么都没验").toBeGreaterThanOrEqual(1)
    } finally {
      await 收()
    }
  }, 30_000)
})
