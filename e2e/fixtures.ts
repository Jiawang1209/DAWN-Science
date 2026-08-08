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

export const test = base.extend<{ dawn: DawnFixture }>({
  dawn: async ({}, use) => {
    const server = await startMockInferenceServer()
    const dir = mkdtempSync(join(tmpdir(), "dawn-e2e-"))
    const workspace = join(dir, "workspace")
    mkdirSync(workspace, { recursive: true })
    writeFileSync(join(workspace, "README.md"), "# e2e 工作区\n")

    const modelsPath = join(dir, "models.json")
    writeFileSync(modelsPath, JSON.stringify(mockModelsJson(server.url), null, 2))
    const dbPath = join(dir, "dawn.db")

    const app = await _electron.launch({
      args: [join(ROOT, "dist", "electron", "main.js")],
      env: {
        ...process.env,
        // **不写 DAWN_CONFIG 指向已有文件**：第一次启动应当自己写出默认配置。
        // 这条路径正是「装好了打不开」那个缺陷的所在，必须被真的走一遍
        DAWN_CONFIG: join(dir, "providers.yaml"),
        DAWN_DB: dbPath,
        DAWN_DEFAULT_WORKSPACE: workspace,
        DAWN_MODELS_JSON: modelsPath,
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
