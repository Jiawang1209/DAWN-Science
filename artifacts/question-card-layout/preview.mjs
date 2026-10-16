// Isolated, fake-model preview. No real project, credentials or downloads.
import { createRequire } from "node:module"
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { startMockInferenceServer, mockModelsJson } from "../../scripts/mock-inference-server.mjs"
const root = resolve(import.meta.dirname, "../..")
const { _electron } = createRequire(join(root, "package.json"))("playwright")
const question = { id: "download", header: "p1 跑完后", question: "p1_0027 完成、27 块全部 done 之后，下载要怎么办？", options: [
  { label: "p1 跑完就停（我来 touch STOP）", description: "立即在 ~/amplicon_reads/_work/STOP 建标记。当前块 p1_0027 会正常跑完并验收，之后循环在开始 p2_0001 前优雅退出，不会碰那 6.5 TB。这是「盯 p1 收尾」最干净的收法。" },
  { label: "不停，p1 完自动接着下 p2", description: "保持现状。p1 一完成循环立即开始 p2_0001。注意 6.556 TB 在限流下预计要数月，且只增不减直到完成或磁盘/STOP 干预。" },
  { label: "先别动，等 p1 快到时再决定", description: "不加 STOP。我继续报进度；等 p1 剩最后几十分钟时再喊你拍板。" },
] }
const server = await startMockInferenceServer({ toolCall: body => body.messages?.at(-1)?.role === "user" ? { toolName: "ask_user_question", args: { questions: [question] } } : undefined })
const dir = mkdtempSync(join(tmpdir(), "dawn-question-demo-"))
mkdirSync(join(dir, "workspace"))
writeFileSync(join(dir, "providers.yaml"), "agents:\n  ds-chat:\n    kind: native\n    provider: deepseek\n    model: deepseek-flash\n    capabilities: [chat, exec]\n")
writeFileSync(join(dir, "models.json"), JSON.stringify(mockModelsJson(server.url)))
const env = { ...process.env, DAWN_CONFIG: join(dir, "providers.yaml"), DAWN_DB: join(dir, "dawn.db"), DAWN_MODELS_JSON: join(dir, "models.json"), DAWN_DEFAULT_WORKSPACE: join(dir, "workspace"), DAWN_SKIP_CREDENTIAL_GATE: "1", DAWN_FAKE_NOTIFY: "1", DAWN_HIDE_WINDOW: "1", DAWN_NO_EXTERNAL: "1" }
for (const [key, subdir] of Object.entries({ DAWN_CLI_HOME: "cli-home", DAWN_SKILLS_DIR: "skills", DAWN_MEMORIES_DIR: "memories", DAWN_AGENTS_DIR: "agents", DAWN_SCRATCH_ROOT: "scratch", DAWN_DOWNLOADS: "downloads", DAWN_JUPYTER_ROOTS: "jupyter/kernels" })) env[key] = join(dir, subdir)
const app = await _electron.launch({ args: [join(root, "dist/electron/main.js"), `--user-data-dir=${join(dir, "electron-user-data")}`, "--force-color-profile=srgb"], env })
const page = await app.firstWindow()
await page.addInitScript(() => { localStorage.setItem("dawn.global.lang", "zh"); localStorage.setItem("dawn.global.setupSkipped", "1") })
await page.reload()
await page.evaluate(async () => await window.dawn.invoke("setCredential", { providerId: "deepseek", secret: "isolated-ui-mock-key" }))
const input = page.getByPlaceholder(/今天帮你做些什么/)
await input.fill("预览：p1 完成后的下载安排"); await input.press("Enter")
const card = page.locator(".question-card")
await card.waitFor()
await card.getByRole("radio").nth(1).check()
await card.locator("h3").click()
const geometry = await card.evaluate(el => {
  const body = el.querySelector(".question-card-body"), rect = el.getBoundingClientRect()
  return { clip: { x: Math.floor(rect.x), y: Math.floor(rect.y), width: Math.ceil(rect.width), height: Math.ceil(rect.height) }, bodyOverflow: body.scrollHeight - body.clientHeight, outerOverflow: el.scrollHeight - el.clientHeight }
})
if (geometry.bodyOverflow > 1 || geometry.outerOverflow > 1) throw new Error(JSON.stringify(geometry))
const capture = clip => app.evaluate(async ({ BrowserWindow }, clip) => {
  const win = BrowserWindow.getAllWindows()[0], size = win.getContentSize()
  return (await win.capturePage(clip ?? undefined)).resize({ width: clip?.width ?? size[0], height: clip?.height ?? size[1], quality: "best" }).toPNG()
}, clip)
writeFileSync(join(import.meta.dirname, "normal-card.png"), await capture(geometry.clip))
writeFileSync(join(import.meta.dirname, "normal-window.png"), await capture(null))
writeFileSync(join(import.meta.dirname, "preview-geometry.json"), JSON.stringify(geometry, null, 2))
await app.evaluate(({ BrowserWindow }) => { const win = BrowserWindow.getAllWindows()[0]; win.setTitle("DAWN · 询问框效果预览（隔离演示）"); win.show(); win.focus() })
console.log(`预览就绪：${dir}\n${JSON.stringify(geometry)}`)
app.on("close", () => server.close().then(() => process.exit(0)))
process.on("SIGTERM", async () => { await app.close(); await server.close(); process.exit(0) })
