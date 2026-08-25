/**
 * 用假推理服务器启动 DAWN —— 不需要任何真 API key。
 *
 * **学自 Hermes `apps/desktop/scripts/dev-mock.mjs`。**
 * 起一个本地 OpenAI 兼容服务器返回固定回复，写出隔离的配置与数据库，
 * 然后启动**已构建的真实 Electron 应用**。
 *
 * 它解决的是一个具体问题：**我改完界面之后，没法自己看它对不对。**
 * 此前每一版都得让作者打开、由作者告诉我哪里不对——三次全是这样。
 *
 * 关键是它跑的是真东西：协议、IPC、事件流、pi 的 agent loop、工具执行、
 * 渲染全都是真的，**只有模型回复是写死的**。
 * 把界面从后端摘下来单独看是另一回事，那样看到的是界面的幻觉。
 *
 * 用法：
 *   npm run build && npm run dev:mock
 *
 * 隔离：配置、models.json、数据库、工作区全部写在临时目录，
 * **不碰你的真实项目、真实凭证、真实数据库**。
 */
import { spawn } from "node:child_process"
import { mkdtempSync, writeFileSync, mkdirSync, existsSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { startMockInferenceServer, mockModelsJson, CANNED_REPLY } from "./mock-inference-server.mjs"
import { startFakeIlinkServer } from "./fake-ilink-server.mjs"
import { startFakeFeishuServer } from "./fake-feishu-server.mjs"

const ROOT = resolve(import.meta.dirname, "..")

if (!existsSync(join(ROOT, "dist", "electron", "main.js"))) {
  console.error("dist/ 不存在。先跑：npm run build")
  process.exit(1)
}

const server = await startMockInferenceServer()
/**
 * 假微信（远程助理）。扫码那一屏点「扫码绑定」之后，用下面这几条推进剧本：
 *   curl -X POST <url>/__fake/qr/scan      curl -X POST <url>/__fake/qr/confirm
 *   curl -X POST <url>/__fake/inbound -d '{"text":"在吗"}'      curl <url>/__fake/sent
 */
const weixin = await startFakeIlinkServer({ longPollMs: 25_000 })
const feishu = await startFakeFeishuServer({ longPollMs: 2000 })
console.log(`假微信：${weixin.url}（/__fake/qr/scan · /__fake/qr/confirm · /__fake/inbound · /__fake/sent）`)

const dir = mkdtempSync(join(tmpdir(), "dawn-mock-"))
const workspace = join(dir, "workspace")
mkdirSync(workspace, { recursive: true })

// 工作区里放点东西，好让 agent 有文件可读——**空工作区证明不了工具能用**
writeFileSync(join(workspace, "README.md"), "# Mock 工作区\n\n这是给 DAWN 的假模型演示用的目录。\n")
writeFileSync(join(workspace, "note.txt"), "暗号：DAWN-MOCK-1f7c\n")

const configPath = join(dir, "providers.yaml")
writeFileSync(
  configPath,
  `agents:
  ds-chat:
    kind: native
    provider: deepseek
    model: deepseek-v4-flash
    capabilities: [exec, chat]
`,
)

const modelsPath = join(dir, "models.json")
writeFileSync(modelsPath, JSON.stringify(mockModelsJson(server.url), null, 2))

console.log("─".repeat(64))
console.log("DAWN mock 模式")
console.log(`  假推理服务器  ${server.url}`)
console.log(`  固定回复      ${CANNED_REPLY}`)
console.log(`  隔离目录      ${dir}`)
console.log(`  演示工作区    ${workspace}`)
console.log("─".repeat(64))
console.log("提示：在 app 里「打开文件夹」时选上面那个演示工作区。")
console.log()

const child = spawn(
  process.execPath.includes("node") ? "npx" : "npx",
  ["electron", join(ROOT, "dist", "electron", "main.js")],
  {
    cwd: ROOT,
    stdio: "inherit",
    env: {
      ...process.env,
      DAWN_CONFIG: configPath,
      DAWN_DB: join(dir, "dawn.db"),
      DAWN_MEMORIES_DIR: join(dir, "memories"),
      DAWN_MODELS_JSON: modelsPath,
      DAWN_FAKE_ILINK: weixin.url,
      DAWN_FAKE_FEISHU: feishu.url,
    },
  },
)

const shutdown = async () => {
  await server.close()
  await weixin.close()
  await feishu.close()
  process.exit(0)
}
child.on("exit", shutdown)
process.on("SIGINT", () => {
  child.kill()
  void shutdown()
})
