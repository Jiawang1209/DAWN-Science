/**
 * MCP 的四个协议操作（5.7，2026-08-15）。
 *
 * 这一组盯的是**三条会变成「静默」的边界**：
 *   ① 密钥**只进不出**——任何响应里都不能出现它
 *   ② 「还没试过」与「试过、连不上」必须分得开
 *   ③ 列名单**不顺手去连**——打开一个设置屏不该悄悄拉起五个进程
 *
 * 走的是 `createWorkbench` 真装配出来的后端，对着一台**真 MCP 服务器**
 * （`scripts/mcp-test-server.mjs`）——不是替身：这一层要回答的正是
 * 「配好之后到底连不连得上」。
 */
import { describe, expect, it, afterEach } from "vitest"
import { mkdtempSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createWorkbench } from "../../src/electron/wiring.js"
import type { CredentialsPort } from "../../src/workbench/backend.js"

/**
 * **走服务端而不是后端对象**：`createWorkbench` 只暴露 `server`，
 * 而那也更真——**这条路经过协议校验**，形状不合会当场被挡下。
 */
type 服务器 = {
  handle(op: string, req: unknown): Promise<{ ok: boolean; data?: unknown; error?: { message: string } }>
}

/**
 * 拆信封。**失败就抛**——协议层的错误在这里变成异常，
 * 于是「它该拒绝」这类用例可以直接写 `rejects.toThrow()`。
 */
async function 叫(wb: { server: unknown }, op: string, req: unknown = {}): Promise<never | unknown> {
  const r = await (wb.server as 服务器).handle(op, req)
  if (!r.ok) throw new Error(r.error?.message ?? `${op} 失败`)
  return r.data
}

interface 一台的样子 {
  name: string
  env: string[]
  missingSecrets: string[]
  from: string
  trusted: boolean
  fingerprint?: string
  off: boolean
  state: string
  error?: string
  tools: { name: string }[]
}

const 列 = (wb: { server: unknown }, req: unknown = {}) =>
  叫(wb, "listMcpServers", req) as Promise<{ servers: 一台的样子[]; problems: string[] }>
const 试 = (wb: { server: unknown }, req: unknown) =>
  叫(wb, "testMcpServer", req) as Promise<{ ok: boolean; error?: string; tools: { name: string }[] }>
const 拨 = (wb: { server: unknown }, req: unknown) => 叫(wb, "setMcpFlag", req)
const 填 = (wb: { server: unknown }, req: unknown) => 叫(wb, "setMcpSecret", req)

const 脚本 = join(process.cwd(), "scripts", "mcp-test-server.mjs")
const cleanups: (() => void)[] = []
afterEach(() => {
  for (const c of cleanups.splice(0)) c()
})

function 内存凭证(): CredentialsPort {
  const m = new Map<string, string>()
  return {
    get: (k) => m.get(k),
    set: (k, v) => void m.set(k, v),
    delete: (k) => void m.delete(k),
    configured: () => [...m.keys()],
    isEncrypted: () => false,
  }
}

function 配置(mcp: string): string {
  const dir = mkdtempSync(join(tmpdir(), "dawn-mcpops-"))
  const file = join(dir, "providers.yaml")
  writeFileSync(
    file,
    `${mcp}agents:\n  ds-chat:\n    kind: native\n    provider: deepseek\n    model: m\n    capabilities: [chat]\n`,
  )
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }))
  return file
}

const 一台 = (名: string, 额外 = "") =>
  `mcp:\n  ${名}:\n    command: ${JSON.stringify(process.execPath)}\n    args: [${JSON.stringify(脚本)}]\n${额外}`

function 起一个(mcp: string, 凭证 = 内存凭证()) {
  const dbDir = mkdtempSync(join(tmpdir(), "dawn-mcpops-db-"))
  const wb = createWorkbench({
    configPath: 配置(mcp),
    dbPath: join(dbDir, "dawn.db"),
    credentials: 凭证,
  })
  cleanups.push(() => {
    wb.close()
    rmSync(dbDir, { recursive: true, force: true })
  })
  return { wb, 凭证 }
}

describe("listMcpServers", () => {
  it("列出配了哪几台，并说清它是全局还是项目带的", async () => {
    const { wb } = 起一个(一台("testbox"))
    const r = await 列(wb)
    expect(r.servers.map((s) => s.name)).toEqual(["testbox"])
    expect(r.servers[0]!.from).toBe("global")
  })

  /**
   * **「还没试过」不是「连不上」。**
   * 混成一件事的话，一个刚配好、还没连过的服务器会显示成故障。
   */
  it("**没连过的是 `unknown`，而且不带 error**", async () => {
    const { wb } = 起一个(一台("testbox"))
    const s = (await 列(wb)).servers[0]!
    expect(s.state).toBe("unknown")
    expect(s.error).toBeUndefined()
    expect(s.tools).toEqual([])
  })

  /** **列名单不该起进程**：打开设置屏就悄悄拉起五个服务器是不能接受的 */
  it("**列名单不会去连它**", async () => {
    const { wb } = 起一个(一台("testbox"))
    await 列(wb)
    const 池 = (wb.nativeRuntime as unknown as { opts?: { mcp?: { 池: { 连着的(): string[] } } } })
      .opts?.mcp?.池
    expect(池!.连着的(), "只是列了个名单，却把服务器起起来了").toEqual([])
  })

  /** **缺哪个密钥要点名**：笼统一句「没配好」会让人对着三个变量挨个试 */
  it("点名说还差哪个密钥", async () => {
    const { wb } = 起一个(一台("needskey", "    env: [PGURL]\n"))
    const s = (await 列(wb)).servers[0]!
    expect(s.missingSecrets).toEqual(["PGURL"])
    expect(s.env).toEqual(["PGURL"])
  })
})

describe("testMcpServer", () => {
  it("**当场连一次并把工具列出来**", async () => {
    const { wb } = 起一个(一台("testbox"))
    const r = await 试(wb, { name: "testbox" })
    expect(r.ok, `没连上：${r.error}`).toBe(true)
    /**
     * **盯「它们在」，不盯「一共几个」**（2026-08-19 改，同 `客户端.test.ts` 那条）。
     * 那份共用的假服务器 2026-08-19 加了第四个工具（远端那条要用它作证），
     * 而这条想验的是「列得出来」——加一个不该让它红，少一个必须让它红。
     */
    for (const 名 of ["boom", "echo", "写一行"]) {
      expect(r.tools.map((t) => t.name), `少了 ${名}`).toContain(名)
    }
    await wb.closeAsync(3000)
  })

  /** 连不上时**必须带原因**——不带原因的失败等于没报 */
  it("连不上时带着原因", async () => {
    const { wb } = 起一个(
      `mcp:\n  crashy:\n    command: ${JSON.stringify(process.execPath)}\n    args: ["-e", "process.exit(1)"]\n`,
    )
    const r = await 试(wb, { name: "crashy" })
    expect(r.ok).toBe(false)
    expect(r.error, "失败了却没有原因").toBeTruthy()
  })

  it("名单里没有这台时如实报错，不静静回一个空清单", async () => {
    const { wb } = 起一个(一台("testbox"))
    await expect(试(wb, { name: "nosuch" })).rejects.toThrow()
  })
})

describe("setMcpSecret / setMcpFlag", () => {
  /**
   * **只进不出。** 这是整组里最要紧的一条：
   * 密钥一旦出现在某个响应里，它就会流进日志、流进界面状态、流进截图。
   */
  it("**填进去的密钥，任何响应里都读不到**", async () => {
    const { wb, 凭证 } = 起一个(一台("needskey", "    env: [PGURL]\n"))
    await 填(wb, { name: "needskey", varName: "PGURL", secret: "postgres://秘密" })

    const r = await 列(wb)
    expect(JSON.stringify(r), "密钥出现在了响应里").not.toContain("秘密")
    // 但它确实存下来了——**「没回传」不等于「没存上」**
    expect(凭证.get("mcp:needskey:PGURL")).toBe("postgres://秘密")
    expect(r.servers[0]!.missingSecrets, "填了之后不该还说缺").toEqual([])
  })

  /** 空串 = 清除。**「不想配了」与「配了个空值」是两回事** */
  it("传空串是清除", async () => {
    const { wb, 凭证 } = 起一个(一台("needskey", "    env: [PGURL]\n"))
    await 填(wb, { name: "needskey", varName: "PGURL", secret: "x" })
    await 填(wb, { name: "needskey", varName: "PGURL", secret: "" })
    expect(凭证.get("mcp:needskey:PGURL")).toBeUndefined()
  })

  it("信任开关拨得动，也读得回来（按名字+指纹，审查 debug G6）", async () => {
    const { wb } = 起一个(一台("testbox"))
    const fp = (await 列(wb)).servers[0]!.fingerprint
    expect(fp).toBeTruthy()
    expect((await 列(wb)).servers[0]!.trusted).toBe(false)
    await 拨(wb, { name: "testbox", flag: "trusted", value: true, fingerprint: fp })
    expect((await 列(wb)).servers[0]!.trusted).toBe(true)
    await 拨(wb, { name: "testbox", flag: "trusted", value: false, fingerprint: fp })
    expect((await 列(wb)).servers[0]!.trusted).toBe(false)
  })

  it("**信任按指纹隔离**：拨的是别的指纹,这台(真实指纹)不被点亮(审查 debug G6)", async () => {
    const { wb } = 起一个(一台("testbox"))
    // 模拟「同名但不同命令的另一台」的信任——用一把不是这台真实指纹的指纹去拨
    await 拨(wb, { name: "testbox", flag: "trusted", value: true, fingerprint: "别的一台的指纹" })
    // 名单里这台的真实指纹与刚才那把不同 → 它不该被继承为 trusted
    expect((await 列(wb)).servers[0]!.trusted).toBe(false)
  })

  /** 关掉的那台**仍然列出来**——不列的话人会以为配置丢了 */
  it("关掉之后仍然在名单上，只是标着关了", async () => {
    const { wb } = 起一个(一台("testbox"))
    await 拨(wb, { name: "testbox", flag: "off", value: true })
    const s = (await 列(wb)).servers[0]!
    expect(s.name).toBe("testbox")
    expect(s.off).toBe(true)
  })
})
