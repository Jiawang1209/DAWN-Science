# ACP 客户端的手 · T2（远端）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `AcpRuntime` 收下 `spec.remote`，claude-code-acp 的读/改/跑落在服务器上；本机会话行为不变。

**Architecture:** `hands.ts` 的后端多一个 `远端后端(executor)`，「门」抽成可注入的策略：本机复用 `src/policy/permissions.ts` 的 `看风险`，远端复用 `src/remote/tools.ts` 的 `解析远端路径`——与 native 的四个工具**同一套判据**，不另写。远端会话的适配器进程起在本机影子目录 `<sessionDir>/acp-shadow/`（空、总存在），`session/new` 的 `cwd` 也给它（SDK 要它在本机存在）；手收到的路径若以影子目录开头就换成 `remote.cwd`，命令字符串里的影子路径同样替换；不以影子开头的绝对路径原样放行。`_meta.systemPrompt.append` 把这件事告诉 agent。

**Tech Stack:** 同 T1。`RemoteLike`（`src/runtime/types.ts`）是执行器的最小接口，测试用假执行器。

**规格：** `docs/superpowers/specs/2026-08-20-acp-terminal-design.md` §二「claude」表（本机 cwd、路径翻译、给它说实话）+ §三 T2

**与 T1 的一处修正（规格说「与 native 同口径」，T1 做严了）：** native 的读不设门、写/改圈在工作区并保护 `data/raw`、bash 不按路径拦。T1 把读与终端 cwd 也圈进了工作区。T2 改为复用 `看风险`，读放开、终端 cwd 放开——**门只拦写**。远端默认无界（`界` 可选），与 `remote/tools.ts` 一致。

---

## 文件

| 文件 | 职责 |
|---|---|
| Modify `src/runtime/acp/hands.ts` | `门` 变成注入的策略；新增 `本机门`、`远端门`、`远端后端`、`影子翻译` |
| Modify `tests/runtime/acp-hands.test.ts` | 门的新口径；远端后端对假执行器；翻译 |
| Modify `src/runtime/acp/runtime.ts` | 有 `spec.remote` 时：影子目录、远端后端 + 门、翻译、`_meta.systemPrompt.append` |
| Modify `tests/runtime/acp-runtime.test.ts` | 假 agent + 假执行器走一轮：写落在「远端」，影子目录没动 |
| Modify `docs/DEVELOPMENT_HISTORY.md` | 一条 feat |

---

### Task 1: 门变成策略；本机门复用 `看风险`

**Files:**
- Modify: `src/runtime/acp/hands.ts`
- Test: `tests/runtime/acp-hands.test.ts`

- [ ] **Step 1: 改测试——读放开、终端 cwd 放开、写仍拦、`data/raw` 拦**

把 `describe("路径门：与 native 的 gatedTools 同口径")` 整段换成：

```ts
describe("路径门：复用 native 的 `看风险`", () => {
  it("**读不设门**——工作区外也读得到（native 就是这样，理由在 permissions.ts）", async () => {
    建()
    const 外 = join(tmpdir(), `dawn-hands-外面-${process.pid}.txt`)
    writeFileSync(外, "外面的")
    const r = await 手.处理("fs/read_text_file", { sessionId: "s", path: 外 })
    expect(r).toEqual({ content: "外面的" })
    rmSync(外)
  })

  it("写到工作区外拒绝，code 是 -32602，话里有那条路径", async () => {
    建()
    const 外 = join(tmpdir(), "dawn-hands-外面.txt")
    const e = await 抓(手.处理("fs/write_text_file", { sessionId: "s", path: 外, content: "" }))
    expect(e).toBeInstanceOf(手的错误)
    expect(e.code).toBe(-32602)
    expect(e.message).toContain("dawn-hands-外面.txt")
  })

  it("`..` 爬出去也拒绝", async () => {
    建()
    const e = await 抓(
      手.处理("fs/write_text_file", { sessionId: "s", path: join(工作区, "..", "爬.txt"), content: "" }),
    )
    expect(e.code).toBe(-32602)
  })

  it("`data/raw/` 是原始数据，不给写", async () => {
    建()
    const e = await 抓(
      手.处理("fs/write_text_file", { sessionId: "s", path: join(工作区, "data", "raw", "x.csv"), content: "" }),
    )
    expect(e.code).toBe(-32602)
    expect(e.message).toContain("原始")
  })

  it("相对路径拒绝——ACP 的路径一律绝对", async () => {
    建()
    const e = await 抓(手.处理("fs/read_text_file", { sessionId: "s", path: "a.txt" }))
    expect(e.code).toBe(-32602)
  })

  it("不认识的方法，code 是 -32601", async () => {
    建()
    const e = await 抓(手.处理("fs/delete", { sessionId: "s" }))
    expect(e.code).toBe(-32601)
  })
})
```

并把 `terminal/*` 里「cwd 默认是工作区；给了 cwd 也得在工作区里」那条的最后三行（`tmpdir()` 那个 `抓` 与断言）删掉，标题改为「cwd 默认是工作区；给了 cwd 就用它」。

`建` 改成：

```ts
const 建 = () => {
  工作区 = mkdtempSync(join(tmpdir(), "dawn-hands-"))
  手 = new 客户端的手(本机后端(), { 门: 本机门(工作区), 默认cwd: 工作区, 记录: () => {} })
  return 手
}
```

import 加 `本机门`。超限那条用例里的 `new 客户端的手(...)` 同样改。

- [ ] **Step 2: 跑，确认红**

Run: `npx vitest run tests/runtime/acp-hands.test.ts`
Expected: 编译错（`本机门` 不存在 / 选项形状不对）

- [ ] **Step 3: 实现**

`hands.ts`：

```ts
import { 看风险 } from "../../policy/permissions.js"

/**
 * 门：收一条路径，回它该用的绝对路径，或抛 `手的错误`。
 * **按操作分**——native 的判据里读与写不是一回事（读不设门）。
 */
export interface 手的门 {
  读(path: string): string
  写(path: string): string
  /** 终端的 cwd。不按路径拦（native 的 bash 也不拦），只做形状检查 */
  cwd(path: string): string
}

/** 本机：复用 `看风险`——与 native 的 write/edit **同一个函数**，不另写一套 */
export function 本机门(工作区: string): 手的门 {
  const 绝对 = (p: string) => {
    if (!isAbsolute(p)) throw new 手的错误(-32602, `路径必须是绝对路径：${p}`)
    return resolve(p)
  }
  return {
    读: 绝对,
    写(p) {
      const 路 = 绝对(p)
      const 险 = 看风险("write", { path: 路 }, { workspace: 工作区 })
      if (险) throw new 手的错误(-32602, 险.说明)
      return 路
    },
    cwd: 绝对,
  }
}
```

`手的选项` 改为：

```ts
interface 手的选项 {
  门: 手的门
  /** `terminal/create` 不给 cwd 时在哪跑 */
  默认cwd: string
  记录: (text: string) => void
}
```

`读` 里 `this.门(p["path"])` → `this.路径(p["path"], "读")`；`写` 里 → `this.路径(p["path"], "写")`；`开终端` 里 `const cwd = p["cwd"] === undefined ? this.opts.默认cwd : this.路径(p["cwd"], "cwd")`。原 `private 门(raw)` 换成：

```ts
  private 路径(raw: unknown, 作: "读" | "写" | "cwd"): string {
    if (typeof raw !== "string") throw new 手的错误(-32602, `路径必须是字符串：${String(raw)}`)
    return this.opts.门[作](raw)
  }
```

`relative` 不再用，从 import 里去掉。

- [ ] **Step 4: 跑，确认绿；typecheck**

Run: `npx vitest run tests/runtime/acp-hands.test.ts && npm run typecheck`
Expected: 16 passed；typecheck 过（`runtime.ts` 那处 `new 客户端的手` 也要跟着改：`{ 门: 本机门(spec.workspace), 默认cwd: spec.workspace, 记录 }`）

- [ ] **Step 5: 整条路的测试也得仍绿**

Run: `npx vitest run tests/runtime/acp-runtime.test.ts`
Expected: 29 passed（假 agent 那条「越界读 `/etc/hostname`」现在**读得到或读不到都不是 -32602 了**——把假 agent 里那一步改成越界**写** `/etc/dawn-不给写.txt`，用例断言改成匹配 `【手·越界】{"error":{"code":-32602,"message":"[^"]*dawn-不给写`）

- [ ] **Step 6: 提交**

```bash
git add src/runtime/acp/hands.ts src/runtime/acp/runtime.ts tests/runtime/acp-hands.test.ts tests/runtime/acp-runtime.test.ts scripts/fake-acp-agent.mjs
git commit -m "refactor(acp): 手的门改为注入策略，本机复用 permissions.看风险——读不设门、写圈工作区并护 data/raw，与 native 同口径"
```

---

### Task 2: 远端后端 + 远端门 + 影子翻译

**Files:**
- Modify: `src/runtime/acp/hands.ts`
- Test: `tests/runtime/acp-hands.test.ts`

- [ ] **Step 1: 测试（假执行器）**

追加：

```ts
import type { RemoteLike } from "../../src/runtime/types.js"
import { 远端后端, 远端门, 影子翻译 } from "../../src/runtime/acp/hands.js"

/** 假执行器：文件放在内存里，exec 只认几条命令，并记下每一次调用 */
function 假执行器() {
  const 文件 = new Map<string, string>()
  const 调用: Array<{ command: string; cwd?: string }> = []
  const ex: RemoteLike = {
    async exec(command, options) {
      调用.push({ command, cwd: options?.cwd })
      if (command.startsWith("mkdir -p ")) return { code: 0, stdout: "", stderr: "" }
      if (command.includes("printf 远端") ) return { code: 0, stdout: "远端通了", stderr: "" }
      if (command.includes("exit 2")) return { code: 2, stdout: "出", stderr: "错" }
      return { code: 0, stdout: `ran:${command}@${options?.cwd ?? ""}`, stderr: "" }
    },
    async readFile(path) {
      const v = 文件.get(path)
      if (v === undefined) throw new Error(`No such file: ${path}`)
      return Buffer.from(v)
    },
    async writeFile(path, data) {
      文件.set(path, String(data))
    },
  }
  return { ex, 文件, 调用 }
}

describe("远端后端：手伸到服务器上", () => {
  const 远 = { get: () => "/home/u/proj", set: () => {} }

  it("读写走执行器；写之前 `mkdir -p` 父目录", async () => {
    const { ex, 文件, 调用 } = 假执行器()
    文件.set("/home/u/proj/a.txt", "服务器上的")
    手 = new 客户端的手(远端后端(ex), { 门: 远端门(远), 默认cwd: 远.get(), 记录: () => {} })
    expect(await 手.处理("fs/read_text_file", { sessionId: "s", path: "/home/u/proj/a.txt" })).toEqual({ content: "服务器上的" })
    await 手.处理("fs/write_text_file", { sessionId: "s", path: "/home/u/proj/深/b.txt", content: "写上去" })
    expect(文件.get("/home/u/proj/深/b.txt")).toBe("写上去")
    expect(调用.some((c) => c.command === "mkdir -p '/home/u/proj/深'")).toBe(true)
  })

  it("终端：在远端 cwd 里跑；env 变成命令前缀；退出码与合流输出都回来", async () => {
    const { ex, 调用 } = 假执行器()
    手 = new 客户端的手(远端后端(ex), { 门: 远端门(远), 默认cwd: 远.get(), 记录: () => {} })
    const { terminalId } = (await 手.处理("terminal/create", {
      sessionId: "s",
      command: "printf 出; exit 2",
      env: [{ name: "K", value: "v'1" }],
    })) as { terminalId: string }
    expect(await 手.处理("terminal/wait_for_exit", { sessionId: "s", terminalId })).toEqual({ exitCode: 2 })
    const 出 = (await 手.处理("terminal/output", { sessionId: "s", terminalId })) as { output: string }
    expect(出.output).toBe("出错")
    expect(调用.at(-1)).toEqual({ command: "export K='v'\\''1'; printf 出; exit 2", cwd: "/home/u/proj" })
  })

  it("远端门：默认无界（与 remote/tools 一致）；给了界就拦", async () => {
    const { ex } = 假执行器()
    手 = new 客户端的手(远端后端(ex), { 门: 远端门(远), 默认cwd: 远.get(), 记录: () => {} })
    await 手.处理("fs/write_text_file", { sessionId: "s", path: "/tmp/随便.txt", content: "" })
    const 圈 = new 客户端的手(远端后端(ex), {
      门: 远端门({ ...远, 界: "/home/u/proj" }),
      默认cwd: 远.get(),
      记录: () => {},
    })
    const e = await 抓(圈.处理("fs/write_text_file", { sessionId: "s", path: "/tmp/随便.txt", content: "" }))
    expect(e.code).toBe(-32602)
    expect(e.message).toContain("/tmp/随便.txt")
  })

  it("相对路径按远端 cwd 解析——`解析远端路径` 的口径", async () => {
    const { ex, 文件 } = 假执行器()
    文件.set("/home/u/proj/r.txt", "相对的")
    手 = new 客户端的手(远端后端(ex), { 门: 远端门(远), 默认cwd: 远.get(), 记录: () => {} })
    expect(await 手.处理("fs/read_text_file", { sessionId: "s", path: "r.txt" })).toEqual({ content: "相对的" })
  })
})

describe("影子翻译：agent 以为在本机影子目录，其实在远端", () => {
  const 译 = 影子翻译("/local/shadow", "/home/u/proj")

  it("以影子开头的路径换前缀；别的绝对路径原样放行", () => {
    expect(译.路径("/local/shadow/a/b.txt")).toBe("/home/u/proj/a/b.txt")
    expect(译.路径("/local/shadow")).toBe("/home/u/proj")
    expect(译.路径("/data/raw/x.csv")).toBe("/data/raw/x.csv")
    // **前缀相似不算**：/local/shadow2 不是影子目录
    expect(译.路径("/local/shadow2/x")).toBe("/local/shadow2/x")
  })

  it("命令字符串里出现的影子路径也换", () => {
    expect(译.命令("ls /local/shadow/data && cat /local/shadow/a.txt")).toBe("ls /home/u/proj/data && cat /home/u/proj/a.txt")
    expect(译.命令("ls /local/shadow2")).toBe("ls /local/shadow2")
  })

  it("包一层门：先翻译，再交给里面的门", () => {
    const 内 = 远端门({ get: () => "/home/u/proj", set: () => {}, 界: "/home/u/proj" })
    const 门 = 译.包(内)
    expect(门.写("/local/shadow/out.txt")).toBe("/home/u/proj/out.txt")
    expect(() => 门.写("/local/shadow/../x")).toThrow()
  })
})
```

- [ ] **Step 2: 跑，确认红**

- [ ] **Step 3: 实现**

`hands.ts` 追加：

```ts
import type { RemoteCwd, RemoteLike } from "../types.js"
import { 解析远端路径 } from "../../remote/tools.js"

/**
 * 远端后端：读写走 SFTP，命令走一次 `exec`。
 *
 * **不流式**：`RemoteLike.exec` 是跑完整体回，所以 `terminal/output` 在命令结束前
 * 看到的是空。claude-code-acp 的用法是 `wait_for_exit` 之后再 `output`，正好够用；
 * 真要中途看输出，那是 `RemoteExecutor` 加流式接口的事，不在这里假装。
 *
 * `env` 变成 `export K='v'; ` 前缀——`RemoteLike.exec` 没有 env 参数，
 * 而 `RemoteExecutor` 自己也是这么给登录环境的（`ssh.ts` 里 `前缀` 那段）。
 */
export function 远端后端(ex: RemoteLike): 手的后端 {
  return {
    readFile: async (p) => (await ex.readFile(p)).toString("utf8"),
    async writeFile(p, content) {
      const 父 = p.replace(/\/[^/]*$/, "") || "/"
      const r = await ex.exec(`mkdir -p ${单引号(父)}`)
      if (r.code !== 0) throw new Error(`建不了目录 ${父}：${r.stderr || r.stdout}`)
      await ex.writeFile(p, content)
    },
    exec(command, { cwd, env }) {
      const 前缀 = Object.entries(env)
        .map(([k, v]) => `export ${k}=${单引号(v)}; `)
        .join("")
      const 控 = new AbortController()
      const 听众: Array<(c: Buffer) => void> = []
      const exited = ex.exec(前缀 + command, { cwd, signal: 控.signal }).then(
        (r) => {
          const 出 = Buffer.from(r.stdout + r.stderr)
          if (出.length > 0) 听众.forEach((f) => f(出))
          return r.signal ? { signal: r.signal } : { exitCode: r.code ?? 0 }
        },
        (e: unknown) => {
          听众.forEach((f) => f(Buffer.from(e instanceof Error ? e.message : String(e))))
          return { exitCode: 127 }
        },
      )
      return { onData: (cb) => 听众.push(cb), exited, kill: () => 控.abort() }
    },
  }
}

/** 远端门：复用 `解析远端路径`——与 native 的远端四工具同一个函数。默认无界 */
export function 远端门(cwd: RemoteCwd): 手的门 {
  const 解 = (p: string) => {
    try {
      return 解析远端路径(cwd.get(), p, cwd.界)
    } catch (e) {
      throw new 手的错误(-32602, e instanceof Error ? e.message : String(e))
    }
  }
  return { 读: 解, 写: 解, cwd: 解 }
}

/**
 * 影子翻译（T2）。
 *
 * claude-code-acp 要求 `session/new` 的 `cwd` 在本机存在（SDK 在那里 spawn），
 * 而远端会话的真目录在服务器上。于是给它一个空的本机影子目录，
 * 它说的 `<影子>/x` 我们听成 `<远端cwd>/x`。**不以影子开头的绝对路径原样放行**——
 * 用户说的 `/data/raw/x.csv` 就是服务器上的那个文件。
 */
export function 影子翻译(影子: string, 远端: string) {
  const 根 = 影子.replace(/\/+$/, "")
  const 路径 = (p: string) => (p === 根 ? 远端 : p.startsWith(`${根}/`) ? 远端 + p.slice(根.length) : p)
  const 命令 = (s: string) => s.split(根).reduce((acc, 段, i) => {
    if (i === 0) return 段
    // 只有后面紧跟 `/`、空白或结尾的才是影子路径；`/local/shadow2` 不是
    const 下一个 = 段[0]
    const 算 = 下一个 === undefined || 下一个 === "/" || /\s|['"`;&|)]/.test(下一个)
    return acc + (算 ? 远端 : 根) + 段
  }, "")
  const 包 = (内: 手的门): 手的门 => ({
    读: (p) => 内.读(路径(p)),
    写: (p) => 内.写(路径(p)),
    cwd: (p) => 内.cwd(路径(p)),
  })
  return { 路径, 命令, 包 }
}
```

`客户端的手` 加一个可选 `翻译命令?: (s: string) => string` 到 `手的选项`，`开终端` 里拼好 `command` 后 `const 命令串 = this.opts.翻译命令?.(command) ?? command`，传给后端。

- [ ] **Step 4: 跑，确认绿；typecheck；提交**

```bash
git add src/runtime/acp/hands.ts tests/runtime/acp-hands.test.ts
git commit -m "feat(acp): 远端后端、远端门（复用 解析远端路径）、影子翻译"
```

---

### Task 3: 运行时接上 `spec.remote`

**Files:**
- Modify: `src/runtime/acp/runtime.ts`
- Test: `tests/runtime/acp-runtime.test.ts`

- [ ] **Step 1: 测试（假 agent + 假执行器）**

```ts
describe("远端会话（T2）", () => {
  it("**写落在服务器上，影子目录没动**；session/new 的 cwd 是影子；system prompt 说了实话", async () => {
    const rt = 起一个({ FAKE_ACP_USE_HANDS: "1", FAKE_ACP_ECHO_NEW_PARAMS: "1" })
    const 工作区 = mkdtempSync(join(tmpdir(), "dawn-acp-remote-"))
    const 文件 = new Map<string, string>()
    const 调用: string[] = []
    const ex: import("../../src/runtime/types.js").RemoteLike = {
      async exec(command, o) {
        调用.push(`${command}@${o?.cwd}`)
        if (command.startsWith("mkdir")) return { code: 0, stdout: "", stderr: "" }
        return { code: 0, stdout: "终端通了", stderr: "" }
      },
      async readFile(p) {
        const v = 文件.get(p)
        if (v === undefined) throw new Error(`no ${p}`)
        return Buffer.from(v)
      },
      async writeFile(p, d) {
        文件.set(p, String(d))
      },
    }
    const s = {
      ...spec("r1"),
      workspace: 工作区,
      sessionDir: join(工作区, ".dawn", "sessions", "r1"),
      remote: { executor: ex, cwd: { get: () => "/home/u/proj", set: () => {} } },
    } as SessionSpec
    const 影子 = join(s.sessionDir, "acp-shadow")
    文件.set("/home/u/proj/手-读.txt", "服务器上读到的")
    await rt.start(s)
    关掉 = () => rt.stop(s.sessionId)
    const 收: AgentEvent[] = []
    rt.attach(s.sessionId, (e) => 收.push(e))
    rt.write(s.sessionId, "用手")
    await 等到(收, (e) => e.kind === "idle", "回合收口")
    const 话 = 收.filter((e): e is Extract<AgentEvent, { kind: "output" }> => e.kind === "output").map((e) => e.data).join("")

    // 假 agent 把 `<cwd>/手-读.txt` 发来，cwd 是影子 → 翻译成远端
    expect(话).toContain('【手·读】{"result":{"content":"服务器上读到的"}}')
    expect(文件.get("/home/u/proj/手-写.txt")).toBe("假 agent 写的")
    expect(existsSync(join(影子, "手-写.txt"))).toBe(false)
    expect(调用.some((c) => c.endsWith("@/home/u/proj") && c.includes("printf 终端通了"))).toBe(true)
    expect(话).toContain(`"cwd":${JSON.stringify(影子)}`)
    expect(话).toContain("/home/u/proj")
    expect(话).toMatch(/"systemPrompt":\{"append":"[^"]*服务器/)
  })
})
```

import 补 `existsSync`。

- [ ] **Step 2: 跑，确认红**

- [ ] **Step 3: 实现**

`runtime.ts`：

(a) import 改为 `import { 客户端的手, 本机后端, 本机门, 远端后端, 远端门, 影子翻译, 手的错误 } from "./hands.js"`，`import { mkdirSync } from "node:fs"`（与 `existsSync` 合并）。

(b) `start()` 开头、算 `cmd` 之后，决定适配器的本机 cwd 与手：

```ts
    /**
     * **远端会话的适配器仍起在本机**（T2）——脑子在本机、手在服务器。
     * claude-code-acp 要 `cwd` 在本机存在，于是给它一个空影子目录；
     * 它说的 `<影子>/x` 我们听成 `<远端cwd>/x`（`影子翻译`）。
     */
    const 影子 = spec.remote ? join(spec.sessionDir, "acp-shadow") : undefined
    if (影子) mkdirSync(影子, { recursive: true })
    const 本机cwd = 影子 ?? spec.workspace
    const 译 = spec.remote && 影子 ? 影子翻译(影子, spec.remote.cwd.get()) : undefined
    const 手 = spec.remote && 译
      ? new 客户端的手(远端后端(spec.remote.executor), {
          门: 译.包(远端门(spec.remote.cwd)),
          默认cwd: spec.remote.cwd.get(),
          翻译命令: 译.命令,
          记录: (text) => this.发(spec.sessionId, { kind: "notice", sessionId: spec.sessionId, text }),
        })
      : new 客户端的手(本机后端(), {
          门: 本机门(spec.workspace),
          默认cwd: spec.workspace,
          记录: (text) => this.发(spec.sessionId, { kind: "notice", sessionId: spec.sessionId, text }),
        })
```

`起适配器({ ..., cwd: spec.workspace })` → `cwd: 本机cwd`；`段` 里 `手` 用上面这个；`existsSync(spec.workspace)` 那个「工作目录不在了」判断照旧（影子目录刚建，必在）。

(c) `session/new` / `session/load` 的 `cwd: spec.workspace` → `cwd: 本机cwd`；`_meta` 改为 `this.会话meta(spec, 影子)`：

```ts
  /**
   * `_meta`：`claudeCode.options.disallowedTools` 见 `会话_META`；
   * 远端会话再加 `systemPrompt.append`——**给它说实话**：它的工作目录在服务器上，
   * 影子路径等价于远端路径。它用哪个写法都对（影子会被翻译，远端路径原样放行）。
   */
  private 会话meta(spec: SessionSpec, 影子: string | undefined) {
    if (!spec.remote || !影子) return 会话_META
    const 远 = spec.remote.cwd.get()
    return {
      ...会话_META,
      systemPrompt: {
        append:
          `你的工作目录实际在一台远端服务器上：${远}。` +
          `本机路径 ${影子} 只是它的影子——两种写法指向同一个地方，文件读写与命令都会在服务器上执行。` +
          `提到路径时优先用服务器上的路径（${远}）。`,
      },
    }
  }
```

指纹 `AcpRuntime.指纹(cmd, spec.workspace)` 不变。

- [ ] **Step 4: 跑全部 ACP 测试、typecheck、`npm test`**

- [ ] **Step 5: 提交**

```bash
git add src/runtime/acp/runtime.ts tests/runtime/acp-runtime.test.ts
git commit -m "feat(acp): 远端会话——影子目录、路径翻译、手打到 RemoteExecutor、system prompt 说实话"
```

---

### Task 4: 真机验证（准入规则 3）

- [ ] **Step 1: 假服务器**——`npm run dev:mock` 里有 `造一台假服务器`（`src/remote/fake-ssh.ts`）：建一个远端会话、选 claude 那条 ACP agent（mock 模式下是假 agent 置 `FAKE_ACP_USE_HANDS`？否——mock 的 ACP agent 是假 agent，手动发话看它回「手·读」即可）。
- [ ] **Step 2: 真服务器**——需要作者放行 ssh 或在会话里 `! ssh …`。用 `scratchpad/real/run.mts` 的思路，把 `spec.remote` 接上真 `RemoteExecutor`，跑四步任务；判据：服务器目录里出现文件、影子目录空、对话里路径是服务器路径。
- [ ] **Step 3: 红了先怀疑自己**。

---

### Task 5: 开发历史

- [ ] 回填上一条 hash；顶部追加 T2 条目（Type feat；What 列 Task 1–3；Impact 写清「T1 的门按 native 口径放宽：读不设门、终端 cwd 不拦」；Verification 列测试数与真机结果——真机没验就**如实写没验**）。
