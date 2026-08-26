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
import {
  ProvenanceProbe,
  isProducing,
  PRODUCING_TOOLS,
  并进登记新建,
  type ProvenanceHandle,
  type ToolFileFacts,
} from "../src/runtime/provenance.js"

/**
 * `finish()` 有两种结局，**返回 undefined 是其中之一**（算不出来 = 不知道）。
 *
 * 下面这些用例验的都是「算得出来」那一支，所以在这里一次性断言它非空——
 * 比在每个断言上撒一个 `!` 更能说明意图：**它不是在绕过类型，是在声明前提。**
 */
async function factsOf(h: ProvenanceHandle | undefined): Promise<ToolFileFacts> {
  expect(h, "这一支应当拍得到基线").toBeDefined()
  const facts = await h!.finish()
  expect(facts, "这一支应当算得出事实").toBeDefined()
  return facts!
}

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
    const facts = await factsOf(h)
    expect(facts.filesWritten).toContain("新文件.ts")
    rmSync(dir, { recursive: true, force: true })
  })

  it("修改已有文件被记为 written", async () => {
    const dir = repo()
    const probe = new ProvenanceProbe(dir)
    const h = await probe.begin("edit")
    writeFileSync(join(dir, "seed.txt"), "改过了\n")
    const facts = await factsOf(h)
    expect(facts.filesWritten).toContain("seed.txt")
    rmSync(dir, { recursive: true, force: true })
  })

  it("**什么都没改就是空** —— 不能凭工具名推断它改了东西", async () => {
    const dir = repo()
    const probe = new ProvenanceProbe(dir)
    const h = await probe.begin("bash")
    const facts = await factsOf(h)
    expect(facts.filesWritten).toEqual([])
    rmSync(dir, { recursive: true, force: true })
  })

  it("**只算这一次调用改的**，不把上一次的算进来", async () => {
    const dir = repo()
    const probe = new ProvenanceProbe(dir)

    const h1 = await probe.begin("write")
    writeFileSync(join(dir, "第一次.ts"), "1\n")
    await factsOf(h1)

    const h2 = await probe.begin("write")
    writeFileSync(join(dir, "第二次.ts"), "2\n")
    const facts = await factsOf(h2)

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
    const facts = await factsOf(h)
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

describe("拍到了、但算不出来", () => {
  /**
   * **2026-08-09（①-B″ · U4 补验）由 e2e 那一片顺手查出来的缺陷。**
   *
   * `finish()` 的 catch 分支注释写着「这一次的事实就是"不知道"」，
   * **返回的却是 `filesWritten: []`**——而空数组在变更 pane 上被渲染成
   * 「没有改动文件」（`panels.tsx` 那一支）。
   *
   * 那正是本模块开头第 20-23 行自己写下的禁令：
   * *「返回空数组会被读成『确认没改任何文件』，那是编造」*。
   * 它只在 diff 失败这条罕见路径上触发，所以一直没被看见。
   *
   * **「不知道」的唯一诚实表达是不发这个事实**，与非 git 仓库那一支一致。
   */
  it("**diff 算不出来时返回 undefined** —— 空数组会被读成「确认没改」", async () => {
    const dir = repo()
    const probe = new ProvenanceProbe(dir)
    const h = await probe.begin("write")
    expect(h).toBeDefined()
    writeFileSync(join(dir, "写了一个文件.ts"), "x\n")
    // 拍完之后仓库没了：before 有、after 算不出来。**这一次的事实就是"不知道"**
    rmSync(join(dir, ".git"), { recursive: true, force: true })
    expect(await h!.finish()).toBeUndefined()
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
    const facts = await factsOf(h)
    expect(facts.filesWritten).toContain("中文名称.ts")
    expect(facts.filesWritten.join("")).not.toMatch(/\\3\d\d/)
    rmSync(dir, { recursive: true, force: true })
  })

  it("带空格的路径也不被引号包住", async () => {
    const dir = repo()
    const probe = new ProvenanceProbe(dir)
    const h = await probe.begin("write")
    writeFileSync(join(dir, "有 空格.txt"), "x\n")
    const facts = await factsOf(h)
    expect(facts.filesWritten).toContain("有 空格.txt")
    rmSync(dir, { recursive: true, force: true })
  })
})

describe("filesCreated（产物条，2026-08-26）", () => {
  it("write 新建一个文件：filesCreated 只有它；改旧文件只进 filesWritten", async () => {
    const dir = repo()
    const probe = new ProvenanceProbe(dir)
    const h = await probe.begin("write", { path: "outputs/a.csv" })
    mkdirSync(join(dir, "outputs"), { recursive: true })
    writeFileSync(join(dir, "outputs", "a.csv"), "1\n")
    writeFileSync(join(dir, "seed.txt"), "changed\n")
    const facts = await factsOf(h)
    expect(facts.filesCreated).toEqual(["outputs/a.csv"])
    expect(facts.filesWritten).toEqual(["outputs/a.csv", "seed.txt"])
    rmSync(dir, { recursive: true, force: true })
  })

  it("被 .gitignore 忽略、但工具声明了要写且此前不在：仍算新建", async () => {
    const dir = repo()
    writeFileSync(join(dir, ".gitignore"), "figures/\n")
    const probe = new ProvenanceProbe(dir)
    const h = await probe.begin("write", { path: "figures/f.png" })
    mkdirSync(join(dir, "figures"), { recursive: true })
    writeFileSync(join(dir, "figures", "f.png"), "png")
    const facts = await factsOf(h)
    expect(facts.filesCreated).toEqual(["figures/f.png"])
    rmSync(dir, { recursive: true, force: true })
  })

  it("声明了却没真写出来：不算", async () => {
    const dir = repo()
    const probe = new ProvenanceProbe(dir)
    const h = await probe.begin("write", { path: "never.txt" })
    const facts = await factsOf(h)
    expect(facts.filesCreated).toEqual([])
    rmSync(dir, { recursive: true, force: true })
  })

  it("覆盖此前就存在的声明路径：不算新建", async () => {
    const dir = repo()
    const probe = new ProvenanceProbe(dir)
    const h = await probe.begin("write", { path: "seed.txt" })
    writeFileSync(join(dir, "seed.txt"), "v2\n")
    const facts = await factsOf(h)
    expect(facts.filesCreated).toEqual([])
    expect(facts.filesWritten).toEqual(["seed.txt"])
    rmSync(dir, { recursive: true, force: true })
  })

  it("声明路径是绝对的：换算成相对路径，不重复出现", async () => {
    const dir = repo()
    const probe = new ProvenanceProbe(dir)
    const h = await probe.begin("write", { path: join(dir, "abs.txt") })
    writeFileSync(join(dir, "abs.txt"), "1\n")
    const facts = await factsOf(h)
    expect(facts.filesCreated).toEqual(["abs.txt"])
    expect(facts.filesWritten.filter((p) => p === "abs.txt")).toHaveLength(1)
    rmSync(dir, { recursive: true, force: true })
  })

  /**
   * **`bash` 的重定向目标，探针单独看不见**（2026-08-26 code review）。
   *
   * `声明的路径` 只认 `write`/`edit`/`multiedit`/`apply_patch`——`bash` 不在
   * `会报路径的` 里（本文件开头第 55 行注释：「它的参数是一条命令，写到哪儿
   * 只有它自己知道」）。而 `out/` 又被 `.gitignore` 挡在 `git status` 外，
   * 于是 `diffSince`/`createdSince` 也看不见。两条路都不通，
   * **这不是缺陷，是探针这一层已知的能力边界**——`重定向目标` 解析 `>` 之后，
   * 真正让这类文件进账的是产物登记那条路（`并进登记新建`），不是探针本身。
   */
  it("bash 的 `>` 重定向目标：探针单独看不见（不在 会报路径的 里，又被 .gitignore 挡住）", async () => {
    const dir = repo()
    writeFileSync(join(dir, ".gitignore"), "out/\n")
    const probe = new ProvenanceProbe(dir)
    const h = await probe.begin("bash", { command: "echo hi > out/x.txt" })
    mkdirSync(join(dir, "out"), { recursive: true })
    writeFileSync(join(dir, "out", "x.txt"), "hi\n")
    const facts = await factsOf(h)
    expect(facts.filesCreated).not.toContain("out/x.txt")
    rmSync(dir, { recursive: true, force: true })
  })

  it("……但产物登记看得见——并进 并进登记新建 之后，filesCreated 就有它了", async () => {
    const dir = repo()
    writeFileSync(join(dir, ".gitignore"), "out/\n")
    const probe = new ProvenanceProbe(dir)
    const h = await probe.begin("bash", { command: "echo hi > out/x.txt" })
    mkdirSync(join(dir, "out"), { recursive: true })
    writeFileSync(join(dir, "out", "x.txt"), "hi\n")
    const facts = await factsOf(h)
    // 上一条已确认探针自己看不见它；这里模拟 native.ts 里那一步：
    // 产物登记记的是绝对路径，`并进登记新建` 换算成相对工作区的再并进去
    const merged = 并进登记新建(facts, [join(dir, "out", "x.txt")], dir)
    expect(merged.filesCreated).toEqual(["out/x.txt"])
    rmSync(dir, { recursive: true, force: true })
  })
})
