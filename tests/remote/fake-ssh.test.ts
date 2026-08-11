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
import { 假口令, 造一台假服务器 } from "../../src/remote/fake-ssh.js"

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
