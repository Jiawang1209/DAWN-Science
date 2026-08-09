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
