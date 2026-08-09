/**
 * e2e 的启动夹具。
 *
 * **每个用例一套全新的配置目录、数据库、工作区。** 测试之间不许有暗管道——
 * 那正是 3.3 里模块级 atom 咬过我们一次的地方（一个用例留下的
 * `activeProjectId` 让下一个用例的按钮一直禁用，表现为「点了没反应」）。
 *
 * **假推理服务器与 `npm run dev:mock` 是同一个模块。**
 * Hermes 在 `dev-mock.mjs` 的文件头明确写下这条理由：
 * 两套 mock 会各自漂移，那时「本地是好的」就不再意味着什么。
 */
import { test as base, _electron, type ElectronApplication, type Page } from "@playwright/test"
import { execFileSync } from "node:child_process"
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
// @ts-expect-error -- .mjs 脚本无类型声明；它同时服务于 npm run dev:mock
import { startMockInferenceServer, mockModelsJson, CANNED_REPLY } from "../scripts/mock-inference-server.mjs"

const ROOT = resolve(import.meta.dirname, "..")

export { CANNED_REPLY }

export interface DawnFixture {
  app: ElectronApplication
  page: Page
  /** 隔离目录。用例可以读数据库验证副作用 */
  dir: string
  dbPath: string
  workspace: string
  /** 假服务器收到的请求。用来证明测试**不是空转通过** */
  requests: unknown[]
}

/**
 * 让假模型确定性地**调一次工具**。
 *
 * **刻意是声明式的，不是回调。** mock 那一侧的入口是
 * `(body) => {toolName, args} | undefined`，够灵活，但两件事让它不适合直接
 * 当夹具选项：一是 Playwright 的 `test.use()` 传函数要担心跨进程；
 * 二是用例真正要说的只有「调什么、带什么参数、调几次」，
 * **把闭包写进每个用例等于把同一段状态机抄一遍**。翻译在下面做一次。
 */
export interface MockToolCallSpec {
  toolName: string
  args: Record<string, unknown>
  /**
   * 只在第一次请求时触发。**默认 true，而且几乎总该是 true**——
   * 否则模型拿到工具结果后会再调一次，一路循环到撞上限，用例表现为超时。
   */
  once?: boolean
}

export interface DawnOptions {
  toolCall?: MockToolCallSpec
  /**
   * 把工作区变成 git 仓库并做一次初始提交。**默认 false。**
   *
   * 默认值是 false 而不是 true，有两条理由：
   * ① 现有用例（含八张视觉基线）都是在**非** git 工作区下存的，
   *   改默认值会让「产出」栏换一种说法，基线全红；
   * ② 非 git 恰好是溯源的「不知道」那一支，本身值得被守住。
   *
   * **想验「知道」那一支的用例必须显式打开它**：`git-facts.ts` 的
   * `snapshot()` 第一句是 `git rev-parse HEAD`，空仓库没有 HEAD 就抛错，
   * 探针于是返回 undefined——**用例会绿，但绿得毫无意义**，
   * 它走的是「无法确定」那一支。所以初始提交也不是可选的。
   */
  gitInit?: boolean
  /**
   * 预写一份 `providers.yaml`，而不是让 DAWN 写默认那份。
   *
   * **只给需要特殊 agent 的用例用**（例如托管一个 `bash` 当 PTY agent）。
   * 不给时保持原样——第一次启动自己写出默认配置那条路径必须被真的走一遍，
   * 那正是「装好了打不开」那个缺陷的所在。
   */
  providersYaml?: string
}

/** 声明式的 toolCall 规格 → mock 那一侧要的回调。**状态机只此一份** */
function toolCallHook(spec: MockToolCallSpec | undefined) {
  if (!spec) return undefined
  let fired = false
  return () => {
    if (fired && (spec.once ?? true)) return undefined
    fired = true
    return { toolName: spec.toolName, args: spec.args }
  }
}

function initRepo(workspace: string): void {
  const run = (...args: string[]) => execFileSync("git", args, { cwd: workspace, stdio: "pipe" })
  run("init", "-q")
  // **仓库级配置，不碰全局**：CI 与开发机上都可能没有 user.name
  run("config", "user.email", "e2e@example.com")
  run("config", "user.name", "dawn-e2e")
  run("add", "-A")
  run("commit", "-qm", "e2e 基线")
}

/**
 * 一份**固定的** kernelspec，给视觉基线用。
 *
 * 路径刻意写成不存在的 `/usr/bin/e2e-python`：这份夹具从不真的起内核，
 * 它只需要让「内核」面板有确定的内容可画。**假路径比真路径诚实**——
 * 真路径会随机器变，而这里要的恰恰是不变。
 */
function seedKernelSpec(dir: string): void {
  const d = join(dir, "jupyter", "kernels", "e2e-python")
  mkdirSync(d, { recursive: true })
  writeFileSync(
    join(d, "kernel.json"),
    JSON.stringify({
      argv: ["/usr/bin/e2e-python", "-m", "ipykernel_launcher", "-f", "{connection_file}"],
      display_name: "E2E Python",
      language: "python",
    }),
  )
}

export const test = base.extend<{ dawnOptions: DawnOptions; dawn: DawnFixture }>({
  // 用例侧：`test.use({ dawnOptions: { … } })`。**不写就是现状**，
  // 这是现有 10 个 spec 一行都不用改的原因
  dawnOptions: [{}, { option: true }],

  dawn: async ({ dawnOptions }, use) => {
    const server = await startMockInferenceServer({ toolCall: toolCallHook(dawnOptions.toolCall) })
    const dir = mkdtempSync(join(tmpdir(), "dawn-e2e-"))
    const workspace = join(dir, "workspace")
    mkdirSync(workspace, { recursive: true })
    seedKernelSpec(dir)
    writeFileSync(join(workspace, "README.md"), "# e2e 工作区\n")
    if (dawnOptions.gitInit) initRepo(workspace)
    const configPath = join(dir, "providers.yaml")
    if (dawnOptions.providersYaml) writeFileSync(configPath, dawnOptions.providersYaml)

    const modelsPath = join(dir, "models.json")
    writeFileSync(modelsPath, JSON.stringify(mockModelsJson(server.url), null, 2))
    const dbPath = join(dir, "dawn.db")

    const app = await _electron.launch({
      args: [
        join(ROOT, "dist", "electron", "main.js"),
        /**
         * **userData 也要隔离。**
         *
         * 2026-08-09 做主题时发现的洞：夹具的注释写着「每个用例一套全新的配置目录、
         * 数据库、工作区」，但 `localStorage` 不住在这三样里的任何一个，它住在
         * `app.getPath("userData")`——而那个路径此前一直是**开发机上真实的那一份**。
         *
         * 后果有两层：用例之间有暗管道；跑一次 e2e 会改掉作者自己应用里的设置。
         * 前者是这份文件开头就明令禁止的，后者更糟——测试不该有副作用溢出到测试之外。
         */
        `--user-data-dir=${join(dir, "electron-user-data")}`,
        /**
         * **把色彩配置钉死在 sRGB。**
         *
         * 2026-08-09 做视觉基线时撞出来的：把逐像素阈值收紧之后，八张基线开始
         * 随机红一两张，每次 3000–5000 像素。diff 图指得很清楚——
         * **只有饱和色的区域在变，所有中性灰一个像素都没动**，
         * 而且按钮的整块底色都在变，不只是文字边缘，所以不是抗锯齿。
         *
         * 那是 macOS 广色域屏上的行为：Chromium 有时按 sRGB 合成、有时按显示器的
         * P3 合成。**这不是应用的问题，是采集环境的问题**，所以修在这里，
         * 而不是靠调大容差把真实的颜色漂移一起放过去。
         */
        "--force-color-profile=srgb",
      ],
      env: {
        ...process.env,
        // **不写 DAWN_CONFIG 指向已有文件**：第一次启动应当自己写出默认配置。
        // 这条路径正是「装好了打不开」那个缺陷的所在，必须被真的走一遍
        DAWN_CONFIG: configPath,
        DAWN_DB: dbPath,
        DAWN_DEFAULT_WORKSPACE: workspace,
        DAWN_MODELS_JSON: modelsPath,
        // **外部 CLI 的配置也要隔离**：不指的话会去读开发机真实的 ~/.codex，
        // 那正是这份文件开头明令禁止的暗管道（2026-08-09 加模型自动发现时捅的洞）
        DAWN_CLI_HOME: join(dir, "cli-home"),
        /**
         * **内核搜索路径也要隔离**，理由与上一条完全一样，只是后果更难看：
         * 内核列表随机器而变，进了视觉基线就等于
         * ① 基线在别的机器上必然红，② **把开发者的个人路径以图片形式提交进仓库**。
         * 这里指向夹具里那一份固定的 kernelspec（见下面的 `seedKernelSpec`）。
         */
        DAWN_JUPYTER_ROOTS: join(dir, "jupyter", "kernels"),
      },
    })
    const page = await app.firstWindow()
    // 渲染进程的报错要能被看见——这条通路本身就是 2026-08-08 补的
    page.on("console", (m) => {
      if (m.type() === "error") console.error("[渲染进程]", m.text())
    })

    await use({ app, page, dir, dbPath, workspace, requests: server.requests })

    await app.close().catch(() => {})
    await server.close()
    rmSync(dir, { recursive: true, force: true })
  },
})

export { expect } from "@playwright/test"

/** 读数据库验证副作用。**界面说发生了，账本上也得有** */
export async function readRuns(dbPath: string): Promise<Record<string, unknown>[]> {
  const { default: Database } = await import("better-sqlite3")
  const db = new Database(dbPath, { readonly: true })
  try {
    return db.prepare("SELECT request_type, origin, status FROM runs ORDER BY started_at").all() as Record<
      string,
      unknown
    >[]
  } finally {
    db.close()
  }
}
