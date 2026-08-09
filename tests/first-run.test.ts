/**
 * 全新安装的第一次启动（Task 3.4）。
 *
 * 作者的原话：**"claude code, codex 其实上来也没有要求我一定要配置工作目录的。"**
 *
 * 实测下来门槛不止一道，而且最严重的那道计划里没写：
 *
 *   1. **`providers.yaml` 不存在 ⇒ 应用直接起不来。** `loadRegistry` 用
 *      `readFileSync`，缺文件就抛 ENOENT；而默认路径是 `process.cwd()`——
 *      打包后的桌面应用，cwd 是个任意目录。**全新安装必然撞上这条。**
 *   2. 必须先打开项目文件夹，否则「新建会话」是禁用的
 *   3. 没填 key 时是死路，不是引导
 *
 * 这里验前两道。第三道在 `tests/ui/first-run-ui.test.tsx`。
 */
import { describe, expect, it } from "vitest"
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import Database from "better-sqlite3"
import { loadRegistryOrDefault, DEFAULT_CONFIG_YAML } from "../src/config/loader.js"
import { migrate } from "../src/store/schema.js"
import { ProjectStore } from "../src/store/projects.js"
import { RunStore } from "../src/store/runs.js"
import { SessionStore } from "../src/store/sessions.js"
import { ProjectManager } from "../src/project/manager.js"

const tmp = () => mkdtempSync(join(tmpdir(), "dawn-firstrun-"))

describe("门槛一 · 配置文件不存在时也要能起来", () => {
  it("缺文件时写出一份默认配置并加载，而不是抛 ENOENT", () => {
    const dir = tmp()
    const path = join(dir, "providers.yaml")
    expect(existsSync(path)).toBe(false)

    const reg = loadRegistryOrDefault(path)

    expect(existsSync(path)).toBe(true)
    expect(Object.keys(reg.agents).length).toBeGreaterThan(0)
    rmSync(dir, { recursive: true, force: true })
  })

  it("写出的默认配置**带注释**，是一份能改的模板而不是一坨机器产物", () => {
    const dir = tmp()
    const path = join(dir, "providers.yaml")
    loadRegistryOrDefault(path)
    const text = readFileSync(path, "utf8")
    expect(text).toContain("#")
    expect(text).toBe(DEFAULT_CONFIG_YAML)
    rmSync(dir, { recursive: true, force: true })
  })

  it("已存在的配置**绝不覆盖** —— 用户的文件比默认值重要", () => {
    const dir = tmp()
    const path = join(dir, "providers.yaml")
    loadRegistryOrDefault(path)
    const mine = "agents:\n  mine:\n    kind: native\n    provider: deepseek\n    model: deepseek-v4-flash\n    capabilities: [chat]\n"
    require("node:fs").writeFileSync(path, mine)
    const reg = loadRegistryOrDefault(path)
    expect(Object.keys(reg.agents)).toEqual(["mine"])
    expect(readFileSync(path, "utf8")).toBe(mine)
    rmSync(dir, { recursive: true, force: true })
  })

  it("默认配置本身必须合法 —— 否则第一次启动会撞进校验错误", () => {
    const dir = tmp()
    const path = join(dir, "providers.yaml")
    // 不抛就是合法：loadRegistryOrDefault 内部会跑 schema 与 provider 校验
    expect(() => loadRegistryOrDefault(path)).not.toThrow()
    rmSync(dir, { recursive: true, force: true })
  })
})

describe("门槛二 · 不打开文件夹也要有项目", () => {
  const makeManager = () => {
    const db = new Database(":memory:")
    migrate(db)
    return new ProjectManager({
      projects: new ProjectStore(db),
      sessions: new SessionStore(db),
      runs: new RunStore(db),
    })
  }

  it("一个项目都没有时，建出默认项目并创建目录", () => {
    const dir = tmp()
    const ws = join(dir, "scratch")
    const mgr = makeManager()
    expect(mgr.list()).toHaveLength(0)

    const rec = mgr.ensureDefault(ws)

    expect(existsSync(ws)).toBe(true)
    expect(mgr.list()).toHaveLength(1)
    expect(rec.workspace).toBe(ws)
    rmSync(dir, { recursive: true, force: true })
  })

  it("幂等 —— 重启不会每次都多一个项目", () => {
    const dir = tmp()
    const ws = join(dir, "scratch")
    const mgr = makeManager()
    const a = mgr.ensureDefault(ws)
    const b = mgr.ensureDefault(ws)
    expect(a.projectId).toBe(b.projectId)
    expect(mgr.list()).toHaveLength(1)
    rmSync(dir, { recursive: true, force: true })
  })

  it("**已经有项目时什么都不做** —— 不往用户的列表里塞东西", () => {
    const dir = tmp()
    const mine = join(dir, "my-project")
    require("node:fs").mkdirSync(mine, { recursive: true })
    const mgr = makeManager()
    mgr.open(mine)

    const rec = mgr.ensureDefault(join(dir, "scratch"))

    expect(mgr.list()).toHaveLength(1)
    expect(rec.workspace).toBe(mine)
    // 默认目录也不该被建出来——用户没要它
    expect(existsSync(join(dir, "scratch"))).toBe(false)
    rmSync(dir, { recursive: true, force: true })
  })
})

describe("默认配置的形状（①-C · C5）", () => {
  /**
   * **这份 YAML 是发给每个新用户的东西**，所以它的形状该被钉住——
   * 改坏了不会有任何现有用户发现（他们的配置不会被覆盖），
   * **只有新装的人会撞上**。
   */
  const parsed = () => loadRegistryOrDefault(join(tmp(), "providers.yaml"))

  it("claude / codex 是 **cli**（对话形态），不是 pty", () => {
    const reg = parsed()
    expect(reg.agents["claude"]).toMatchObject({ kind: "cli", command: "claude" })
    expect(reg.agents["codex"]).toMatchObject({ kind: "cli", command: "codex" })
  })

  it("**有一个通用终端** —— 判据 ③：能跑任意命令，也能手动起那两个 CLI 的 TUI", () => {
    expect(parsed().agents["shell"]).toMatchObject({ kind: "pty", command: "bash" })
  })

  /**
   * **2026-08-09 反转过一次。**
   *
   * 上一版断言的是「`model` 与 `models` 都要有」，理由是「少一个选择器就不出现」。
   * **那个断言守着一条错的规则**：写 `model` 就等于给 CLI 传 `--model`，
   * 会**盖掉用户自己 CLI 的配置**——作者的 claude 默认是 `opus[1m]`、
   * codex 是 `gpt-5.6-sol`，都被我们盖掉，后者还直接 400。
   *
   * **默认配置绝不替用户钉模型。** 现在守的是这一条。
   */
  it("**默认配置不钉死任何模型** —— 钉了就盖掉用户自己 CLI 的选择", () => {
    const reg = parsed()
    for (const id of ["claude", "codex"]) {
      const a = reg.agents[id] as { model?: string }
      expect(a.model, `${id} 不该有 model：那会覆盖用户自己 CLI 的配置`).toBeUndefined()
    }
  })

  it("claude 给了模型清单 —— 别名取自 `claude --help`，不是编的", () => {
    const a = parsed().agents["claude"] as { models?: string[] }
    expect(a.models).toEqual(expect.arrayContaining(["opus", "sonnet"]))
  })

  /**
   * **2026-08-09 又反转了一次**，理由是找到了真正的来源。
   *
   * 上一版的理由是「codex 能用哪些因账号而异，我们无从得知」——**那句话是错的**：
   * codex 有 `~/.codex/models_cache.json`，只是没写在 `--help` 里。
   * 线索一直在眼前：它每轮都往 stderr 打 `failed to load models cache`。
   *
   * 现在默认配置仍然不写 models，但理由变了：**不是「不知道」，是「会自己去读」。**
   */
  it("**codex 不写清单** —— 它由 DAWN 自动发现，不该手写", () => {
    const a = parsed().agents["codex"] as { models?: string[] }
    expect(a.models).toBeUndefined()
    // 注释里要说清「不写 models 不是漏了，是它会自己读」
    expect(DEFAULT_CONFIG_YAML).toContain("models_cache.json")
  })

  it("内置 agent 仍在 —— 它是「先跑起来」的默认", () => {
    expect(parsed().agents["ds-chat"]).toMatchObject({ kind: "native", provider: "deepseek" })
  })

  it("**注释里说清三种 kind 的区别** —— 一份只有键值对的模板只会让人去翻文档", () => {
    expect(DEFAULT_CONFIG_YAML).toContain("kind: cli")
    expect(DEFAULT_CONFIG_YAML).toContain("kind: pty")
    // 对话形态与终端的区别必须写出来，否则用户不知道该选哪个
    expect(DEFAULT_CONFIG_YAML).toMatch(/对话形态/)
    expect(DEFAULT_CONFIG_YAML).toMatch(/终端/)
  })
})
