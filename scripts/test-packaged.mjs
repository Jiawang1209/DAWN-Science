/**
 * 起打包产物真点一下（打包 spec §6，硬规则 3：改了主路径必须自己验）。
 *
 * 先 `npm run pack`（出 `release/<平台>-unpacked/`），再跑这个。隔离的 `DAWN_*` 目录 + mock 推理服务器，
 * 四个原生模块各碰一次：better-sqlite3（开库）、pi 链路（发一句收假回复）、node-pty（开终端）、zeromq（列内核）。
 * 只验当前平台；mac 上跑绿只说明 mac 的包能用。
 */
import { _electron } from "@playwright/test"
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, readdirSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { startMockInferenceServer, mockModelsJson, CANNED_REPLY } from "./mock-inference-server.mjs"

const ROOT = resolve(import.meta.dirname, "..")
const NAME = "DAWN Science"
function 找可执行() {
  const 候选 = {
    darwin: [join(ROOT, "release", "mac-arm64", `${NAME}.app`, "Contents", "MacOS", NAME), join(ROOT, "release", "mac", `${NAME}.app`, "Contents", "MacOS", NAME)],
    linux: [join(ROOT, "release", "linux-unpacked", NAME), join(ROOT, "release", "linux-unpacked", "dawn-science")],
    win32: [join(ROOT, "release", "win-unpacked", `${NAME}.exe`)],
  }[process.platform] ?? []
  const 有 = 候选.find(existsSync)
  if (!有) {
    console.error(`没找到解包产物，先 npm run pack。找过：\n${候选.join("\n")}\nrelease/ 里有：${existsSync(join(ROOT, "release")) ? readdirSync(join(ROOT, "release")).join(", ") : "(没有 release/)"}`)
    process.exit(2)
  }
  return 有
}

const exe = 找可执行()
const server = await startMockInferenceServer()
const dir = mkdtempSync(join(tmpdir(), "dawn-packaged-"))
const workspace = join(dir, "workspace")
mkdirSync(workspace, { recursive: true })
const configPath = join(dir, "providers.yaml")
// 终端要一个 kind: pty 的 agent，没有它界面会如实说「开不了终端」（第一次冒烟就被这句拦住）
const 终端 = process.platform === "win32" ? { command: "powershell.exe", args: [] } : { command: "bash", args: ["-i"] }
writeFileSync(configPath, `agents:
  ds-chat:
    kind: native
    provider: deepseek
    model: deepseek-v4-flash
    capabilities: [exec, chat]
  shell:
    kind: pty
    command: ${终端.command}
    args: ${JSON.stringify(终端.args)}
    capabilities: [exec]
`)
const modelsPath = join(dir, "models.json")
writeFileSync(modelsPath, JSON.stringify(mockModelsJson(server.url), null, 2))

console.log(`[packaged] 起 ${exe}`)
const app = await _electron.launch({
  executablePath: exe,
  args: [`--user-data-dir=${join(dir, "electron-user-data")}`],
  env: {
    ...process.env,
    DAWN_CONFIG: configPath, DAWN_DB: join(dir, "dawn.db"), DAWN_DEFAULT_WORKSPACE: workspace,
    DAWN_MODELS_JSON: modelsPath, DAWN_SKIP_CREDENTIAL_GATE: "1",
    DAWN_CLI_HOME: join(dir, "cli-home"), DAWN_SKILLS_DIR: join(dir, "skills"), DAWN_MEMORIES_DIR: join(dir, "memories"),
    DAWN_AGENTS_DIR: join(dir, "agents"), DAWN_SCRATCH_ROOT: join(dir, "scratch"), DAWN_DOWNLOADS: join(dir, "downloads"),
  },
})
let 失败 = 0
const 查 = async (名, fn) => {
  try { await fn(); console.log(`  ✓ ${名}`) } catch (e) {
    失败++
    console.error(`  ✗ ${名}：${e instanceof Error ? e.message.split("\n")[0] : e}`)
    // 失败时留一张截图：光一句 timeout 查不出是哪儿卡住的
    try { const p = join(dir, `fail-${失败}.png`); await (await app.firstWindow()).screenshot({ path: p }); console.error(`    截图：${p}`) } catch {}
  }
}
try {
  const page = await app.firstWindow()
  await page.addInitScript(() => { try { localStorage.setItem("dawn.global.lang", "zh") } catch {} })
  await page.reload()
  await 查("窗口起来、数据库开了（better-sqlite3）", () => page.locator(".app-shell").waitFor({ timeout: 60_000 }))
  await 查("自带技能与子 agent 从磁盘读到了（/ 菜单有条目）", async () => {
    await page.evaluate(async () => { const p = await window.dawn.invoke("getProviders", {}); await window.dawn.invoke("createTask", { agentId: p.data.agents[0].agentId }) })
    await page.reload()
    await page.locator(".session-list .sess-item .row").first().click()
    const box = page.getByPlaceholder(/今天帮你做些什么/)
    await box.waitFor({ timeout: 30_000 })
    await box.fill("/")
    await page.locator('.slash-menu [role="option"]').first().waitFor({ timeout: 10_000 })
    const n = await page.locator('.slash-menu [role="option"]').count()
    if (n < 20) throw new Error(`只有 ${n} 条，自带的 22 份子 agent 没读到`)
    await box.fill("")
  })
  await 查("发一句收到假回复（pi 链路 + 子进程）", async () => {
    const box = page.getByPlaceholder(/今天帮你做些什么/)
    await box.fill("打包冒烟"); await box.press("Enter")
    await page.locator(".turns .turn.agent").last().waitFor({ timeout: 60_000 })
    const t = await page.locator(".turns .turn.agent").last().textContent()
    if (!t.includes(CANNED_REPLY)) throw new Error(`回复不对：${t}`)
  })
  await 查("终端起得来（node-pty spawn-helper）", async () => {
    await page.getByRole("button", { name: "终端", exact: true }).click()
    const host = page.locator(".dock .term-host")
    await host.waitFor({ timeout: 60_000 })
    // 光有格子不算：敲一句、等回显，才证明 spawn-helper 真把 shell 起起来了
    await host.locator(".xterm-helper-textarea").first().waitFor({ state: "attached", timeout: 30_000 }) // xterm 的辅助输入框本来就是隐藏的，等「可见」永远等不到
    await page.waitForTimeout(1500)
    await host.locator(".xterm-helper-textarea").first().focus()
    await page.keyboard.type("echo DAWN_PTY_OK\n")
    await page.locator(".dock .term-host").getByText(/DAWN_PTY_OK/).first().waitFor({ timeout: 30_000 })
  })
  await 查("探测本机解释器不炸（首启向导用；走登录 shell 的 which）", async () => {
    const r = await page.evaluate(async () => (await window.dawn.invoke("probeInterpreters", {})).data)
    if (!r || !Array.isArray(r.python)) throw new Error(`回的不是候选清单：${JSON.stringify(r).slice(0, 200)}`)
    console.log(`    python 候选 ${r.python.length} 条，R 候选 ${r.r.length} 条`)
  })
  await 查("设置 → 内核 列得出来（zeromq / kernelspec 扫描不炸）", async () => {
    await page.getByRole("button", { name: "设置", exact: true }).click()
    await page.locator(".settings-nav").getByRole("button", { name: "内核", exact: true }).click()
    await page.getByRole("textbox", { name: "Python 解释器" }).waitFor({ timeout: 15_000 })
  })
  await page.screenshot({ path: join(dir, "packaged.png") })
  console.log(`[packaged] 截图：${join(dir, "packaged.png")}`)
} finally {
  await app.close()
  await server.close()
}
console.log(失败 ? `[packaged] ${失败} 项失败` : "[packaged] 全部通过")
process.exit(失败 ? 1 : 0)
