/**
 * 远端内核在装配层的那几处接线（远程内核，审查 2026-09-04）。
 *
 * **与 `wiring.test.ts` 分开一个文件**：那份正在被任务 9 改，而这几条是任务 8 的收尾。
 */
import { describe, expect, it } from "vitest"
import { mkdtempSync, rmSync, existsSync, readdirSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { 没探明白后缀, 选定 } from "../../src/remote/interpreters.js"
import { KERNEL_PACKAGE } from "../../src/protocol/kernel-package.js"
import { createWorkbench } from "../../src/electron/wiring.js"
import { memoryCredentials } from "../helpers/credentials.js"
import { 假口令, 跑过的命令, 清空记录 } from "../../src/remote/fake-ssh.js"
import { 设扫残留延迟 } from "../../src/remote/fake-ssh-kernel.js"

/** @returns 配置文件路径**与它所在的临时目录**——调用方要在用完之后自己删掉那个目录（审查反馈） */
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

/** @returns db 路径与它所在的临时目录——同上 */
function newDbPath(): { file: string; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), "dawn-db-"))
  return { file: join(dir, "dawn.db"), dir }
}

/**
 * 「一条都没有」那句话（`interpreterOf` 的 none 分支）。
 *
 * 它长在 `wiring.ts` 里、要一台真服务器才走得到，所以判据抽在 `没探明白后缀` 上，
 * 这里按 wiring 拼它的同一种方式拼一遍，盯住**那条路径必须出现在话里**。
 */
describe("没配解释器又一条都没探到时说的那句话", () => {
  const 那句话 = (unknown: { path: string; problem?: string }[]) =>
    `gs191 上没有装了 ipykernel 的 Python。装法：${KERNEL_PACKAGE.python.how}。装好后再试${没探明白后缀(unknown)}`

  it("干干净净一条都没有 → 不多说一个字", () => {
    expect(那句话([])).toBe(`gs191 上没有装了 ipykernel 的 Python。装法：${KERNEL_PACKAGE.python.how}。装好后再试`)
  })

  /**
   * **「没有」与「没探明白」要分开说**。八秒没应答的那条 python 很可能装着 ipykernel，
   * 只是它自己起不来——把人支去 `pip install` 是让他修一个没坏的东西。
   */
  it("有没探明白的 → 路径与原因都要出现，人才知道去看哪条", () => {
    const 话 = 那句话([{ path: "/opt/py/bin/python", problem: "8 秒没应答" }])
    expect(话).toContain("另有 1 条没探明白")
    expect(话).toContain("/opt/py/bin/python")
    expect(话).toContain("8 秒没应答")
  })

  it("说不出原因也要把路径说出来——「原因不明」仍然比只字不提有用", () => {
    expect(那句话([{ path: "/usr/bin/python3" }])).toContain("/usr/bin/python3（原因不明）")
  })

  /** `选定` 与这句话是同一件事的两半：它挑出来的那几条，正是这里要念出来的 */
  it("`选定` 交出来的 unknown 直接就能喂给它", () => {
    const 定 = 选定([
      { path: "/a", source: "PATH" as const, kernelPackage: "missing" as const },
      { path: "/b", source: "PATH" as const, kernelPackage: "unknown" as const, problem: "退出码 2" },
    ])
    expect(定.kind).toBe("none")
    expect(没探明白后缀(定.kind === "none" ? 定.unknown : [])).toContain("/b（退出码 2）")
  })
})

/**
 * 扫残留与起内核抢同一个装机 id（审查 2026-09-04 抓的）。
 *
 * `扫残留` 的 `pkill -9 -f '[d]awn-<装机id>-.*\.json'` 分不出「上次留下的」与「这一秒刚起的」，
 * 所以 `interpreterOf` 里加了一句 `await 扫过.get(cid)`。**要真验它得有一台会起内核的假服务器**
 * （任务 9 的 `fake-ssh-kernel.ts`），现在还没有——写下来的判据比记在脑子里的多活一天。
 */
describe("连上就跑：扫残留不该杀掉刚起的那一台", () => {
  const PY = process.env.DAWN_FAKE_SSH_PYTHON

  // **不静默跳过**：没设这条环境变量时如实说一声，而不是安静地什么都没验证
  it.runIf(!PY)("跳过：没设 DAWN_FAKE_SSH_PYTHON", () => {
    console.error("[跳过] 没设 DAWN_FAKE_SSH_PYTHON，跳过「扫残留先于起内核」这条真起内核的用例")
  })

  /**
   * 1. 假 SSH 加一台、连上——`onState` 的 ready 分支同步把 `扫残留(...)` 挂进 `扫过`
   *    （`RemoteExecutor.connect()` 里 `this.设状态({kind:"ready"})` 先于 `await 捕获环境()`）。
   * 2. `interpreterOf` 是起内核的必经之路，第一句就是 `await 扫过.get(cid)`。
   *
   *    **只看「谁先被发出去」证明不了这一句在生效**（审查反馈）：`跑()` 认命令的顺序、
   *    `interpreterOf` 发命令的顺序都是写死的，不管这句 `await` 在不在，两条命令抵达
   *    假服务器的先后都不会变——命令记录里永远是「扫在前」。真正要测的是**没等扫残留
   *    跑完就把下一条发出去了**，那只有让扫残留的**响应**明显滞后才会露出来：
   *    `设扫残留延迟(400)` 把 `DAWNSWEPT` 那条回声拖后约 400ms；这句 `await` 在的话，
   *    `interpreterOf` 会老老实实等它，起内核那条自然排在后面；`await` 没了的话，
   *    起内核那条会在扫残留还没応答时就被送出去，抢在它前面进命令记录——**这条我已经
   *    临时删过一次 `wiring.ts` 里那句 `await 扫过.get(cid)` 验证过会红，验完照原样恢复**
   *    （见任务报告）。
   * 3. 立刻 `runInKernel`：断言假服务器收到命令的顺序里，那条带 `DAWNSWEPT` 的
   *    （`扫残留`）排在带 `ipykernel_launcher` 的（起内核）前面。
   */
  it.skipIf(!PY)("扫完了才起内核，起来的那一台不会被自己人杀掉", async () => {
    const cfg = configFile()
    const db = newDbPath()
    const scratch = mkdtempSync(join(tmpdir(), "dawn-remote-kernel-sweep-"))
    清空记录()
    设扫残留延迟(400)
    const wb = createWorkbench({
      configPath: cfg.file,
      dbPath: db.file,
      credentials: memoryCredentials({ deepseek: "sk-test" }),
      fakeSsh: true,
      scratchRoot: scratch,
    })

    try {
      const saved = (await wb.server.handle("saveConnection", {
        label: "fake-sweep", host: "h", username: "u", secret: 假口令,
      })) as { ok: boolean; data: { id: string } }
      expect(saved.ok, JSON.stringify(saved)).toBe(true)
      const connectionId = saved.data.id

      // 连上——这一步同步触发扫残留（`装机 id` 第一次用要生成，扫的是它自己的残留，这台假机器上不会有）
      const connected = await wb.server.handle("connectRemote", { id: connectionId })
      expect(connected.ok, JSON.stringify(connected)).toBe(true)

      const p = await wb.server.handle("getProviders", {})
      const agentId = (p as { data: { agents: { agentId: string; kind: string }[] } }).data.agents
        .find((a) => a.kind === "native")?.agentId
      const rs = (await wb.server.handle("createRemoteSession", { connectionId, agentId })) as {
        ok: boolean
        data: { sessionId: string }
      }
      expect(rs.ok, JSON.stringify(rs)).toBe(true)

      // 起内核（触发探测 + 起）：这条完成之前，`interpreterOf` 已经 await 过 `扫过.get(cid)`
      const r = await wb.server.handle("runInKernel", {
        sessionId: rs.data.sessionId, language: "python", code: "print(1)",
      })
      expect(r.ok, JSON.stringify(r)).toBe(true)

      // 断言顺序：扫残留那条命令（含 DAWNSWEPT）先于起内核那条（含 ipykernel_launcher）到达假服务器
      const 命令 = 跑过的命令()
      const 扫的位置 = 命令.findIndex((c) => c.includes("DAWNSWEPT"))
      const 起的位置 = 命令.findIndex((c) => c.includes("ipykernel_launcher"))
      expect(扫的位置, `没见到扫残留那条命令：${JSON.stringify(命令)}`).toBeGreaterThanOrEqual(0)
      expect(起的位置, `没见到起内核那条命令：${JSON.stringify(命令)}`).toBeGreaterThanOrEqual(0)
      expect(起的位置, "起内核必须排在扫残留之后——否则刚起的那台会被自己人的 pkill 误杀").toBeGreaterThan(扫的位置)

      /**
       * **只认这次装配自己的装机 id**（审查反馈）：整个 tmpdir 前后 diff 会把并发跑的
       * 别的 worker 也在写的 `dawn-<别的id>-python-*.json` 算成「这条用例的残留」，
       * 或者把 `configFile()`/`newDbPath()` 自己那些 `dawn-cfg-*`/`dawn-db-*` 临时目录
       * 也算进去——那是误判不是真相。装机 id 落在 `settings` 表的 `install.id` 键。
       */
      const id = (wb.db.prepare("SELECT value FROM settings WHERE key = 'install.id'").get() as
        | { value: string }
        | undefined)?.value
      expect(id, "起过内核就该有装机 id 了").toBeDefined()
      const 内核文件模式 = new RegExp(`^dawn-${id}-(python|R)-[a-z0-9]+\\.json(\\.log)?$`)
      const 新增的 = readdirSync(tmpdir()).filter((f) => 内核文件模式.test(f))
      expect(新增的.length, "这条用例应该真起过一台内核，tmp 里理应多出 connection.json / .log").toBeGreaterThan(0)

      // 停掉——`closeAsync` 等 `对话的内核.收全部()`，那条走 `停远端内核`（真 kill + 真 rm）
      await wb.closeAsync(15_000)
      for (const f of 新增的) {
        expect(existsSync(join(tmpdir(), f)), `残留没清干净：${f}`).toBe(false)
      }
    } finally {
      await wb.closeAsync(15_000).catch(() => {})
      设扫残留延迟(0) // 不留给下一条用例——它是模块级的开关
      rmSync(scratch, { recursive: true, force: true })
      rmSync(cfg.dir, { recursive: true, force: true })
      rmSync(db.dir, { recursive: true, force: true })
    }
  }, 30_000)
})
