/**
 * **交接演练**（2026-09-06，规格 `2026-09-06-应用内更新-design.md` §U5）：
 * 回答「应用里点了更新之后，API key 还在不在」。
 *
 * `rehearse-update.mjs` 验的是**没有交接**时的那条路（上一版的密文解不开 → 界面说要重填），
 * 那条判据要留着。这一条验的是新长出来的那条：
 *
 *   1. 干净装一次，填真 key，发一句 → 成
 *   2. 假发布源 + 假安装器：在应用里点「更新到 9.9.9」→「重启并更新」
 *      → **生产代码**把 `handoff.json` 写出来（这一步不是脚本模拟的）
 *   3. 把 `credentials.json` 的密文改成乱码 —— 等价于「新二进制的钥匙串解不开上一版加的东西」
 *   4. 再起一次 → 应该**自己接上**：不出现「解不开」，不重填就能发一句
 *
 * 先 `npm run pack`。需要 `.env` 里的 DEEPSEEK_API_KEY。
 */
import { _electron } from "@playwright/test"
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { startFakeReleaseFeed } from "./fake-release-feed.mjs"

const ROOT = resolve(import.meta.dirname, "..")
const key = ((readFileSync(join(ROOT, ".env"), "utf8").match(/^DEEPSEEK_API_KEY=(.+)$/m) ?? [])[1] ?? "").trim()
if (!key) { console.error("需要 .env 里的 DEEPSEEK_API_KEY（真链路）"); process.exit(2) }

const EXE = join(ROOT, "release/mac-arm64/DAWN Science.app/Contents/MacOS/DAWN Science")
if (!existsSync(EXE)) { console.error(`没有打包产物：${EXE}\n先跑 npm run pack`); process.exit(2) }

const tmp = mkdtempSync(join(tmpdir(), "dawn-handoff-"))
const ud = join(tmp, "ud"); mkdirSync(ud)
const feed = startFakeReleaseFeed({ version: "9.9.9", packageBytes: 512 * 1024 })
await new Promise((r) => setTimeout(r, 200))

const 失败 = []
const 判 = (名, ok, 详) => { if (!ok) 失败.push(名); console.log(`  ${ok ? "✓" : "✗"} ${名}${详 ? "：" + 详 : ""}`) }
const 查 = async (名, fn) => { try { await fn(); console.log(`  ✓ ${名}`) } catch (e) { 失败.push(名); console.log(`  ✗ ${名}：${String(e.message ?? e).split("\n")[0]}`) } }

const 起 = async () => {
  const env = { ...process.env }
  for (const k of Object.keys(env)) if (k.startsWith("DAWN_") || k.endsWith("_API_KEY")) delete env[k]
  Object.assign(env, {
    DAWN_HIDE_WINDOW: "1",
    DAWN_UPDATE_FEED: feed.url,
    DAWN_FAKE_UPDATE_INSTALL: "1",
    DAWN_NO_EXTERNAL: "1",
  })
  const app = await _electron.launch({ executablePath: EXE, args: [`--user-data-dir=${ud}`], env })
  const page = await app.firstWindow()
  await page.locator(".app-shell").waitFor({ timeout: 20_000 })
  return { app, page }
}
const 发一句 = async (page) => {
  const box = page.getByPlaceholder(/What can I do|今天帮你/)
  await box.fill("Reply with exactly one word: OK")
  await box.press("Enter")
  await page.locator(".conv-title").waitFor({ timeout: 20_000 })
  await page.locator(".turns .turn.agent").last().waitFor({ timeout: 90_000 })
  await page.waitForTimeout(1500)
  return (await page.locator(".turns .turn.agent").last().textContent()).replace(/\s+/g, " ").slice(0, 60)
}

console.log("① 干净装一次，填 key，发一句")
{
  const { app, page } = await 起()
  const W = page.locator(".setup-wizard")
  await 查("填 key → Saved", async () => {
    await W.getByLabel("API key").fill(key)
    await W.getByRole("button", { name: /^(Save|保存)$/ }).click()
    await W.getByText(/Saved|已填/).waitFor({ timeout: 60_000 })
  })
  await 查("Get started", async () => {
    await W.getByRole("button", { name: /Get started|开始使用/ }).click()
    await W.waitFor({ state: "detached", timeout: 10_000 })
  })
  await 查("真发一句", async () => console.log("    回复 =", await 发一句(page)))

  console.log("② 在应用里点更新（假安装器，不真换包）")
  await 查("侧栏那一行出现", () => page.locator(".update-row").waitFor({ timeout: 30_000 }))
  await 查("下载 → 就绪 → 重启并更新", async () => {
    await page.locator(".update-row").click()
    await page.getByRole("button", { name: "更新到 9.9.9" }).click()
    await page.getByRole("button", { name: "重启并更新" }).click({ timeout: 60_000 })
    await page.waitForTimeout(2000)
  })
  await app.close().catch(() => {})
}
判("生产代码写出了 handoff.json", existsSync(join(ud, "handoff.json")))
判("换包那一步真的走到了", existsSync(join(ud, "update", "假装换包了.json")))

console.log("③ 把密文改成乱码（等价于新二进制的钥匙串解不开上一版加的东西）")
{
  const f = join(ud, "credentials.json")
  const j = JSON.parse(readFileSync(f, "utf8"))
  判("凭证文件是加密的", j.encrypted === true)
  for (const k of Object.keys(j.entries)) j.entries[k] = Buffer.from("v10:not-this-key").toString("base64")
  writeFileSync(f, JSON.stringify(j, null, 2), { mode: 0o600 })
}

console.log("④ 再起一次——应该自己接上")
{
  const { app, page } = await 起()
  await 查("**不出现「解不开，需要重新填写」**", async () => {
    await page.waitForTimeout(12_000) // 交接挂在钥匙串预热之后（首帧 + 5 秒）
    const 有 = await page.getByText(/解不开|decrypted/i).count()
    if (有) throw new Error("界面还在要求重填 key —— 交接没接上")
  })
  await 查("**不重填就能发一句**", async () => console.log("    回复 =", await 发一句(page)))
  判("handoff.json 用完删掉了", !existsSync(join(ud, "handoff.json")))
  await app.close().catch(() => {})
}

const log = readFileSync(join(ud, "startup.log"), "utf8")
console.log("[startup.log 里的交接行]")
for (const l of log.split("\n").filter((l) => l.includes("更新交接"))) console.log("  " + l.slice(25))
判("日志里说了重新加密", /重新加密/.test(log))
await feed.close()
console.log(`\n目录：${tmp}`)
if (失败.length) { console.log(`\n${失败.length} 项没过：${失败.join("；")}`); process.exitCode = 1 } else console.log("\n全部通过")
