/**
 * R1 的真机 smoke —— `RemoteExecutor` 打在一台真服务器上。
 *
 * ## 为什么单元测试不够
 *
 * `tests/remote/ssh.test.ts` 注入的是**假客户端**：它能证明
 * 「我们发出去的命令长什么样」，证明不了「那台机器回给我们什么」。
 * 而这个模块存在的主要理由——**命令输出必须干净、不带欢迎横幅**——
 * 恰恰只有真机能验：假客户端里的 MOTD 是我自己编的。
 *
 * 本项目的规矩：**写「测试绿了」不等于「能用了」。**
 *
 * ```bash
 * DAWN_SSH_PASSWORD='…' DAWN_SSH_HOST=… DAWN_SSH_USER=… npm run smoke:remote
 * ```
 */
import { Client } from "ssh2"
import { RemoteExecutor } from "../src/remote/ssh.js"

const HOST = process.env["DAWN_SSH_HOST"]
const USER = process.env["DAWN_SSH_USER"]
const PASS = process.env["DAWN_SSH_PASSWORD"]

async function main() {
  if (!HOST || !USER) {
    console.error("用法：DAWN_SSH_HOST=主机 DAWN_SSH_USER=用户名 [DAWN_SSH_PASSWORD=…] npm run smoke:remote")
    process.exit(2)
  }

  const r = new RemoteExecutor({
    config: {
      host: HOST,
      username: USER,
      ...(PASS ? { password: PASS } : {}),
      ...(process.env["SSH_AUTH_SOCK"] ? { agentSock: process.env["SSH_AUTH_SOCK"] } : {}),
    },
    createClient: () => new Client() as never,
    onState: (s) => console.log(`   [状态] ${s.kind}${s.kind === "disconnected" ? `：${s.reason}` : ""}`),
  })

  const 结果: Record<string, boolean | string> = {}
  try {
    await r.connect()
    结果["连上"] = true
    const env = r.loginEnv()
    console.log(`✅ 环境捕获：PATH=${(env["PATH"] ?? "").slice(0, 80)}…`)
    结果["PATH 非空"] = Boolean(env["PATH"])

    /**
     * **这一条是全场的要害。**
     *
     * 登录 shell 会打欢迎横幅（作者那台是一排星号 + 课程链接）。
     * 如果它混进命令输出，agent 每跑一条命令都会收到一堆噪声，
     * 而**模型会照着噪声推理**。所以这里要求 stdout **一个字节都不多**。
     */
    const echo = await r.exec("echo hello")
    const 干净 = echo.stdout === "hello\n"
    结果["输出干净"] = 干净 ? true : `实收 ${JSON.stringify(echo.stdout)}`
    console.log(干净 ? "✅ 命令输出干净（没有欢迎横幅）" : `❌ 输出被污染：${JSON.stringify(echo.stdout)}`)

    // 登录 shell 看到的 python 与我们跑命令时看到的**必须是同一个**
    const 我们的 = (await r.exec("command -v python3 || echo 无")).stdout.trim()
    console.log(`   我们看到的 python3：${我们的}`)
    结果["python3 可见"] = 我们的 !== "无" ? true : "非登录 shell 里找不到"

    const bad = await r.exec("exit 7")
    结果["退出码"] = bad.code === 7 ? true : `实收 ${String(bad.code)}`
    console.log(bad.code === 7 ? "✅ 退出码如实带回" : `❌ 退出码是 ${String(bad.code)}`)

    const 家 = (await r.exec("pwd", { cwd: "/tmp" })).stdout.trim()
    结果["cwd 生效"] = 家 === "/tmp" ? true : `实收 ${家}`
    console.log(家 === "/tmp" ? "✅ cwd 生效" : `❌ cwd 没生效：${家}`)

    const 路径 = `/tmp/dawn-r1-${Math.random().toString(36).slice(2, 8)}.txt`
    await r.writeFile(路径, "远端写入 42\n")
    const 读回 = (await r.readFile(路径)).toString()
    结果["SFTP 读写"] = 读回 === "远端写入 42\n" ? true : `实收 ${JSON.stringify(读回)}`
    console.log(结果["SFTP 读写"] === true ? "✅ SFTP 读写（含中文）" : `❌ SFTP：${读回}`)

    const 列 = await r.readdir("/tmp")
    结果["列目录"] = 列.some((e) => 路径.endsWith(e.name)) ? true : "刚写的文件没列出来"
    await r.exec(`rm -f ${路径}`)
  } catch (e) {
    结果["异常"] = e instanceof Error ? e.message : String(e)
    console.error("❌", 结果["异常"])
  } finally {
    r.close()
  }

  console.log("\n—— 结论 ——")
  console.log(JSON.stringify(结果, null, 2))
  process.exit(Object.values(结果).every((v) => v === true) ? 0 : 1)
}

void main()
