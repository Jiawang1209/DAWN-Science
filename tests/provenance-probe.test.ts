/**
 * 逐次工具调用的溯源（①-B″ · R3）。
 *
 * **不变式 5 的物理载体。**
 *
 * 此前 `git-facts.ts` 只能回答「**这个会话**从开始到现在改了哪些文件」。
 * 那个粒度回答不了真正要紧的问题：**是哪一次工具调用改的。**
 * 没有这一层，「产出从 git 事实算，不听 agent 声明」就只是一句口号——
 * 你能证明"有人改了 a.ts"，但证明不了"是那次 write 改的"。
 *
 * ## 钩子挂在哪：包装工具定义，不用 pi 的文件扩展
 *
 * Spike A-2 已经记录过理由：
 * > *pi 的扩展只能从 `<agentDir>/extensions/*.ts` 加载，靠 jiti 在运行时转译
 * > TypeScript。打包进 asar 后这条路是否还通，无法先验断言——
 * > 而授权门若在生产构建里静默失效，比没有还危险。*
 *
 * 包装器的 `execute` 恰好是 before/after 的**精确**位置，
 * 而且对并行执行的工具同样成立（每次调用各有一个包装器实例）。
 */
import { describe, expect, it } from "vitest"
import { execFileSync } from "node:child_process"
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { ProvenanceProbe, isProducing, PRODUCING_TOOLS } from "../src/runtime/provenance.js"

function repo(): string {
  const dir = mkdtempSync(join(tmpdir(), "dawn-prov-"))
  const run = (...args: string[]) => execFileSync("git", args, { cwd: dir, stdio: "pipe" })
  run("init", "-q")
  run("config", "user.email", "t@example.com")
  run("config", "user.name", "t")
  writeFileSync(join(dir, "seed.txt"), "seed\n")
  run("add", "-A")
  run("commit", "-qm", "seed")
  return dir
}

describe("成本控制在入口", () => {
  it("只观察会产出的工具", () => {
    expect(isProducing("write")).toBe(true)
    expect(isProducing("edit")).toBe(true)
    expect(isProducing("bash")).toBe(true)
  })

  it("**只读工具一律不拍** —— 大仓库上 git status 不便宜", () => {
    for (const t of ["read", "grep", "find", "ls"]) {
      expect(isProducing(t), `${t} 不该被观察`).toBe(false)
    }
  })

  it("不认识的工具名不观察 —— 保守优于昂贵", () => {
    expect(isProducing("某个未来的工具")).toBe(false)
    expect(PRODUCING_TOOLS.size).toBeGreaterThan(0)
  })
})

describe("单次调用的文件事实", () => {
  it("新建文件被记为 written", async () => {
    const dir = repo()
    const probe = new ProvenanceProbe(dir)
    const h = await probe.begin("write")
    expect(h).toBeDefined()
    writeFileSync(join(dir, "新文件.ts"), "x\n")
    const facts = await h!.finish()
    expect(facts.filesWritten).toContain("新文件.ts")
    rmSync(dir, { recursive: true, force: true })
  })

  it("修改已有文件被记为 written", async () => {
    const dir = repo()
    const probe = new ProvenanceProbe(dir)
    const h = await probe.begin("edit")
    writeFileSync(join(dir, "seed.txt"), "改过了\n")
    const facts = await h!.finish()
    expect(facts.filesWritten).toContain("seed.txt")
    rmSync(dir, { recursive: true, force: true })
  })

  it("**什么都没改就是空** —— 不能凭工具名推断它改了东西", async () => {
    const dir = repo()
    const probe = new ProvenanceProbe(dir)
    const h = await probe.begin("bash")
    const facts = await h!.finish()
    expect(facts.filesWritten).toEqual([])
    rmSync(dir, { recursive: true, force: true })
  })

  it("**只算这一次调用改的**，不把上一次的算进来", async () => {
    const dir = repo()
    const probe = new ProvenanceProbe(dir)

    const h1 = await probe.begin("write")
    writeFileSync(join(dir, "第一次.ts"), "1\n")
    await h1!.finish()

    const h2 = await probe.begin("write")
    writeFileSync(join(dir, "第二次.ts"), "2\n")
    const facts = await h2!.finish()

    expect(facts.filesWritten).toContain("第二次.ts")
    // 第一次的改动已经是「基线的一部分」，不该再算到第二次头上
    expect(facts.filesWritten).not.toContain("第一次.ts")
    rmSync(dir, { recursive: true, force: true })
  })

  it("作者自己的脏改动不算 agent 的", async () => {
    const dir = repo()
    // 观察开始之前就已经脏了 —— 那是作者的
    writeFileSync(join(dir, "作者改的.txt"), "human\n")
    const probe = new ProvenanceProbe(dir)
    const h = await probe.begin("write")
    writeFileSync(join(dir, "agent改的.txt"), "agent\n")
    const facts = await h!.finish()
    expect(facts.filesWritten).toContain("agent改的.txt")
    expect(facts.filesWritten).not.toContain("作者改的.txt")
    rmSync(dir, { recursive: true, force: true })
  })
})

describe("不是 git 仓库时", () => {
  it("**不报错，也不假装知道** —— 返回 undefined，让 Run 上没有这个事实", async () => {
    const dir = mkdtempSync(join(tmpdir(), "dawn-nogit-"))
    mkdirSync(join(dir, "sub"), { recursive: true })
    const probe = new ProvenanceProbe(dir)
    const h = await probe.begin("write")
    // 拿不到事实时留空，比编一个空数组诚实——空数组会被读成「确认没改任何文件」
    expect(h).toBeUndefined()
    rmSync(dir, { recursive: true, force: true })
  })
})

describe("只读工具直接跳过", () => {
  it("begin 对 read 返回 undefined，连快照都不拍", async () => {
    const dir = repo()
    const probe = new ProvenanceProbe(dir)
    expect(await probe.begin("read")).toBeUndefined()
    rmSync(dir, { recursive: true, force: true })
  })
})

describe("中文文件名不能变成乱码", () => {
  /**
   * **2026-08-09 由这份测试撞出来的生产缺陷。**
   *
   * git 默认把非 ASCII 路径写成 `"\346\226\260..."` 八进制转义，
   * 于是产出事实里的路径是一串反斜杠，**用户看到的不是他刚建的那个文件**。
   * 修法是所有 git 调用都带 `-c core.quotePath=false`。
   *
   * 它同时修掉了**会话级**产出事实里同样的乱码——那一处从 ①-B 起就带着这个缺陷。
   * 本项目界面全中文，这不是边角情况。
   */
  it("中文路径原样返回，不是八进制转义", async () => {
    const dir = repo()
    const probe = new ProvenanceProbe(dir)
    const h = await probe.begin("write")
    writeFileSync(join(dir, "中文名称.ts"), "x\n")
    const facts = await h!.finish()
    expect(facts.filesWritten).toContain("中文名称.ts")
    expect(facts.filesWritten.join("")).not.toMatch(/\\3\d\d/)
    rmSync(dir, { recursive: true, force: true })
  })

  it("带空格的路径也不被引号包住", async () => {
    const dir = repo()
    const probe = new ProvenanceProbe(dir)
    const h = await probe.begin("write")
    writeFileSync(join(dir, "有 空格.txt"), "x\n")
    const facts = await h!.finish()
    expect(facts.filesWritten).toContain("有 空格.txt")
    rmSync(dir, { recursive: true, force: true })
  })
})
