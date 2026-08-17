/**
 * ACP 适配器怎么起（A1，2026-08-16）。
 *
 * 作者：*「我这个 App 是要打包为 windows, mac, linux 三个平台的本地软件的。」*
 *
 * **这一组的存在理由就是那句话。** 三条跨平台的坑各自都会在
 * 「另一台机器上」才发作，而那时症状是「加了 agent，一点就说起不来」——
 * 没人会想到是三个字母（`.cmd`）的事。
 *
 * 算命令是**纯函数**，平台可注入，所以三个平台都能在这一台机器上验。
 */
import { describe, expect, it } from "vitest"
import { 算命令, 滤环境 } from "../../src/runtime/acp/launch.js"

const 基 = { cwd: "/w", execPath: "/Applications/DAWN.app/Contents/MacOS/DAWN" }

describe("npx：Windows 上要补 .cmd", () => {
  /**
   * **`spawn` 不走 shell**（走 shell 是命令注入的门），而 PATHEXT 是 shell 的事。
   * 于是 `spawn("npx")` 在 Windows 上直接 ENOENT。
   */
  it("win32 上是 npx.cmd", () => {
    const c = 算命令({ ...基, command: "npx", args: ["-y", "@agentclientprotocol/codex-acp"], platform: "win32" })
    expect(c.command).toBe("npx.cmd")
    expect(c.args).toEqual(["-y", "@agentclientprotocol/codex-acp"])
  })

  it("mac / linux 上原样", () => {
    for (const p of ["darwin", "linux"] as const) {
      expect(算命令({ ...基, command: "npx", args: [], platform: p }).command).toBe("npx")
    }
  })

  /** npm / pnpm / yarn / bun 同理——它们在 Windows 上都是批处理包装器 */
  it("同类的包管理器也补", () => {
    for (const 名 of ["npm", "pnpm", "yarn", "bun"]) {
      expect(算命令({ ...基, command: 名, args: [], platform: "win32" }).command).toBe(`${名}.cmd`)
    }
  })

  /** **不该乱补**：一个叫 `codex` 的可执行文件不是批处理包装器 */
  it("别的命令不补后缀", () => {
    expect(算命令({ ...基, command: "codex", args: [], platform: "win32" }).command).toBe("codex")
  })
})

describe("`node` 是记号：换成我们自己带的那个", () => {
  /**
   * **这一条是三条里最重要的**：一个打包好的桌面应用不能假设用户装过 Node，
   * 那是开发者才有的东西。Electron 自己带着 Node——
   * `ELECTRON_RUN_AS_NODE=1` + `process.execPath` 就是一个纯 Node。
   */
  it("三个平台都换成 execPath，并带上 ELECTRON_RUN_AS_NODE", () => {
    for (const p of ["darwin", "linux", "win32"] as const) {
      const c = 算命令({ ...基, command: "node", args: ["/x/adapter.js"], platform: p })
      expect(c.command, `${p} 上没换成我们带的 Node`).toBe(基.execPath)
      expect(c.args).toEqual(["/x/adapter.js"])
      expect(c.env["ELECTRON_RUN_AS_NODE"]).toBe("1")
    }
  })

  /** **不给 `node` 补 `.exe` 之类**：换掉之后它已经是绝对路径了 */
  it("win32 上也不再动它", () => {
    const c = 算命令({ ...基, command: "node", args: [], platform: "win32" })
    expect(c.command).toBe(基.execPath)
  })
})

/**
 * **宿主自己的会话身份不往下传**（2026-08-17）。
 *
 * 这条不是理论：`@zed-industries/claude-code-acp` 在继承了
 * `CLAUDECODE` / `CLAUDE_CODE_*` 的环境里 `session/new` 直接回
 * `-32603 Internal error: "Query closed before response received"`，
 * 而那句话看起来像我们坏了。会中招的场合很具体：
 * **从一个 Claude Code 终端里 `npm run app`**。
 */
describe("环境：宿主的会话身份不往下传", () => {
  it("剔掉 CLAUDECODE / CLAUDE_CODE_* / CLAUDE_PID / CLAUDE_EFFORT", () => {
    const 出 = 滤环境({
      CLAUDECODE: "1",
      CLAUDE_CODE_ENTRYPOINT: "cli",
      CLAUDE_CODE_SESSION_ID: "abc",
      CLAUDE_PID: "123",
      CLAUDE_EFFORT: "high",
      PATH: "/usr/bin",
    })
    expect(Object.keys(出)).toEqual(["PATH"])
  })

  /**
   * **凭据一个都不能剔。** `ANTHROPIC_API_KEY` 剔掉的表现是「登不上」，
   * 而那与「没配 key」在屏幕上一模一样——比原来的毛病更难查。
   */
  it("凭据照传：ANTHROPIC_* 与其余一律不动", () => {
    const 出 = 滤环境({
      ANTHROPIC_API_KEY: "sk-x",
      ANTHROPIC_BASE_URL: "https://x",
      OPENAI_API_KEY: "sk-y",
      HOME: "/Users/x",
      CLAUDECODE: "1",
    })
    expect(出["ANTHROPIC_API_KEY"]).toBe("sk-x")
    expect(出["ANTHROPIC_BASE_URL"]).toBe("https://x")
    expect(出["OPENAI_API_KEY"]).toBe("sk-y")
    expect(出["HOME"]).toBe("/Users/x")
    expect(出["CLAUDECODE"]).toBeUndefined()
  })

  /**
   * **前缀要挡住整串。** 只挡等号完全相等的话，
   * `CLAUDE_CODE_ENTRYPOINT` 这种带后缀的会漏过去——
   * 而漏一个就足以让适配器起不来。
   */
  it("挡的是前缀，不是完全相等", () => {
    expect(Object.keys(滤环境({ CLAUDE_CODE_随便什么: "x" }))).toEqual([])
    // 不误伤：别的以 CLAUDE 开头但不在名单上的照传
    expect(Object.keys(滤环境({ CLAUDE_CONFIG_DIR: "x" }))).toEqual(["CLAUDE_CONFIG_DIR"])
  })
})

describe("不该有的副作用", () => {
  it("普通命令不带 ELECTRON_RUN_AS_NODE", () => {
    /**
     * 带上就坏了：那个变量会让**任何** Electron 二进制退化成纯 Node，
     * 而适配器自己可能就是个 Electron 应用。
     */
    expect(算命令({ ...基, command: "npx", args: [], platform: "darwin" }).env).toEqual({})
  })

  it("参数原样传，不做任何拼接", () => {
    // 拼成一个字符串再交给 shell 是命令注入的经典入口
    const args = ["-y", "@a/b", "--flag", "值 带空格"]
    expect(算命令({ ...基, command: "npx", args, platform: "linux" }).args).toEqual(args)
  })
})
