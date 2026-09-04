/**
 * 那台假服务器（②-B · R3）。
 *
 * ## 为什么 mock 自己也要测
 *
 * 它是准入规则 1 要的那个 mock：`dev:mock` 与 e2e 没有真服务器可连，
 * 没有它，「添加服务器 → 连接」这条主路径在 mock 模式下走不通。
 *
 * 但**一个说谎的 mock 比没有 mock 更坏**：它会让界面上所有失败路径都变绿，
 * 于是「口令没传到」「命令根本没跑」这类错误在 mock 模式下全都显示成成功。
 * 所以这里盯两件事：**认证真判**、**认不得的命令真报错**。
 *
 * 顺带，它是从 `RemoteExecutor` 打进去的——也就是说
 * 环境捕获、单引号转义、退出码这些**走的仍是真代码**，假的只有另一端。
 */
import { describe, expect, it } from "vitest"
import { RemoteExecutor } from "../../src/remote/ssh.js"
import { 假口令, 掐断所有假连接, 造一台假服务器 } from "../../src/remote/fake-ssh.js"
import { 内核文件名, 起远端内核, 停远端内核, 扫残留 } from "../../src/remote/kernel-launch.js"
import { 事实脚本 } from "../../src/remote/interpreters.js"

const 起 = (password = 假口令) =>
  new RemoteExecutor({
    config: { host: "h", username: "u", password },
    createClient: 造一台假服务器,
  })

describe("假服务器", () => {
  it("口令对就连上，**环境也捕获得到**", async () => {
    const r = 起()
    await r.connect()
    expect(r.loginEnv()["PATH"]).toContain("/usr/bin")
    r.close()
  })

  it("**口令不对就拒** —— 一律放行会把「口令没从钥匙串取到」全部吞掉", async () => {
    await expect(起("错的").connect()).rejects.toThrow(/authentication/)
  })

  it("**命令输出干净**：登录横幅不混进来", async () => {
    const r = 起()
    await r.connect()
    // 假服务器在登录 shell 那一条上会吐一段横幅（Spike F 的头号发现）,
    // 而普通命令这一条必须一个字节都不多
    expect((await r.exec("echo hello")).stdout).toBe("hello\n")
    r.close()
  })

  it("cwd 生效", async () => {
    const r = 起()
    await r.connect()
    expect((await r.exec("pwd", { cwd: "/home/dawn/数据" })).stdout.trim()).toBe("/home/dawn/数据")
    r.close()
  })

  it("**认不得的命令回 127** —— 一律回 0 的话，界面上的失败路径永远走不到", async () => {
    const r = 起()
    await r.connect()
    const out = await r.exec("bwa index 参考.fa")
    expect(out.code).toBe(127)
    expect(out.stderr).toContain("假服务器")
    r.close()
  })

  it("SFTP 读写通", async () => {
    const r = 起()
    await r.connect()
    await r.writeFile("/home/dawn/新的.txt", "写进去了\n")
    expect((await r.readFile("/home/dawn/新的.txt")).toString()).toBe("写进去了\n")
    r.close()
  })
})

/**
 * 假服务器上「真起本机内核」的那几条命令（任务 9，2026-09-03）。
 *
 * 这几条走的不是本文件上面那套小假文件系统 + 127 的老规矩——`fake-ssh-kernel.ts`
 * 认得它们，真的在本机 spawn 一台 ipykernel。`DAWN_FAKE_SSH_PYTHON` 没设时，
 * 探测事实那条仍然答得出来（写死答 `/usr/bin/python3`，多半打不开），
 * 只有真起一台内核那条 `skipIf`。
 */
describe("假服务器 · 内核那几条（远程内核，2026-09-03）", () => {
  const PY = process.env.DAWN_FAKE_SSH_PYTHON

  it("探测事实：列出 DAWN_FAKE_SSH_PYTHON（没设就只有一条起不来的 /usr/bin/python3）", async () => {
    const r = 起()
    await r.connect()
    const out = (await r.exec(事实脚本)).stdout
    expect(out).toContain("DAWNFACT_HOME=/home/dawn")
    expect(out).toContain(PY ? `DAWNFACT_PATH_python3=${PY}` : "DAWNFACT_PATH_python3=/usr/bin/python3")
    r.close()
  })

  it("扫残留答 0；kill/rm 对不存在的 pid 与文件不报错", async () => {
    const r = 起()
    await r.connect()
    expect((await 扫残留(r.exec.bind(r), "x")).清了).toBe(0)
    expect((await r.exec("kill -TERM 999999 2>/dev/null; true")).code).toBe(0)
    r.close()
  })

  it.skipIf(!PY)("真起一台本机 ipykernel：拿到 connection.json、forwardOut 直连、停掉后进程没了", async () => {
    const r = 起()
    await r.connect()
    const 起的 = await 起远端内核(r.exec.bind(r), {
      语言: "python",
      解释器路径: PY!,
      cwd: "/home/dawn",
      文件名: 内核文件名("t", "python"),
    })
    expect(起的.pid).toBeGreaterThan(0)
    const ch = await r.forwardOut(起的.连接信息.shell_port)
    expect(typeof ch.write).toBe("function")
    ch.destroy()
    await 停远端内核(r.exec.bind(r), 起的)
    expect(
      (
        await r.exec(
          `if kill -0 ${起的.pid} 2>/dev/null; then echo DAWNALIVE=1; else echo DAWNALIVE=0; fi`,
        )
      ).stdout,
    ).toContain("DAWNALIVE=0")
    r.close()
  }, 30_000)
})

/**
 * 掐线（`fakeSshControl{do:"dropLink"}`，接回 2026-09-04 定案 6）。
 *
 * **要紧的是它进的是 `disconnected` 而不是 `idle`**：那正是「意外掉线」与
 * 「人按了断开」的分界线，接回那条路只挂在前者上。假机器要是发 `end` 之类的、
 * 或者把 `自己关的` 旗立起来，执行器就会走成「未连」，而界面上「断了 + 原因」
 * 那半永远不出现——mock 悄悄偏离契约的老形状。
 */
describe("假服务器 · 掐线（测试开关）", () => {
  it("掐了就进 disconnected（不是 idle），登记表进出正确", async () => {
    const r = 起()
    await r.connect()
    expect(r.current().kind).toBe("ready")
    expect(掐断所有假连接()).toBe(1)
    expect(r.current().kind).toBe("disconnected")
    // 掐过的不再算一条：断了的链路不能被「再掐一次」
    expect(掐断所有假连接()).toBe(0)
  })

  it("人按了断开之后就不在登记表里了", async () => {
    const r = 起()
    await r.connect()
    r.close()
    expect(掐断所有假连接()).toBe(0)
    expect(r.current().kind).toBe("idle")
  })
})
