/**
 * **真更新演练**（2026-09-06，规格 `2026-09-06-应用内更新-design.md` §U7）——
 * 这条是整轮唯一算数的判据：**两个真包，在应用里点一下，真的换过去，key 还在。**
 *
 * 假的只有「线上有哪一版」这一件（本地 http 的假发布源，但它吐的是**真的 zip**）。
 * 下载、解包、版本核对、备份、替换、重启、交接——全是生产代码。
 *
 * 先准备两个真包：
 *   for V in 0.0.90 0.0.91; do  改 package.json 的 version → npm run build →
 *     npx electron-builder --mac zip --arm64 --publish never  ; done
 * 然后：
 *   node scripts/rehearse-real-update.mjs <旧包.zip> <新包.zip>
 *
 * 需要 `.env` 里的 DEEPSEEK_API_KEY（要真发一句才算数）。
 */
import { _electron } from "@playwright/test"
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { startFakeReleaseFeed } from "./fake-release-feed.mjs"

const ROOT = resolve(import.meta.dirname, "..")
const [旧包, 新包] = process.argv.slice(2)
if (!旧包 || !新包 || !existsSync(旧包) || !existsSync(新包)) {
  console.error("用法：node scripts/rehearse-real-update.mjs <旧包.zip> <新包.zip>")
  process.exit(2)
}
const 版本 = (p) => /DAWN-Science-([0-9][^-]*)-mac/.exec(p)?.[1] ?? "?"
const 旧版 = 版本(旧包)
const 新版 = 版本(新包)
const key = ((readFileSync(join(ROOT, ".env"), "utf8").match(/^DEEPSEEK_API_KEY=(.+)$/m) ?? [])[1] ?? "").trim()
if (!key) { console.error("需要 .env 里的 DEEPSEEK_API_KEY"); process.exit(2) }

const 失败 = []
const 判 = (名, ok, 详) => { if (!ok) 失败.push(名); console.log(`  ${ok ? "✓" : "✗"} ${名}${详 ? "：" + 详 : ""}`) }
const 查 = async (名, fn) => { try { await fn(); console.log(`  ✓ ${名}`) } catch (e) { 失败.push(名); console.log(`  ✗ ${名}：${String(e.message ?? e).split("\n")[0]}`) } }

const tmp = mkdtempSync(join(tmpdir(), "dawn-real-update-"))
const APPS = join(tmp, "Applications"); mkdirSync(APPS)
const ud = join(tmp, "ud"); mkdirSync(ud)

console.log(`① 把 ${旧版} 装进 ${APPS}`)
execFileSync("/usr/bin/ditto", ["-x", "-k", 旧包, APPS])
const APP = join(APPS, "DAWN Science.app")
const 包内版本 = (app) => JSON.parse(readFileSync(join(app, "Contents/Resources/app/package.json"), "utf8")).version
判(`装上的是 ${旧版}`, 包内版本(APP) === 旧版, 包内版本(APP))

const feed = startFakeReleaseFeed({ version: 新版, packageFile: 新包 })
// 等真的 listening —— 这里原本睡 200ms，那是赌赢的概率高一点，不是修好
await feed.已就绪

const 起 = async () => {
  const env = { ...process.env }
  for (const k of Object.keys(env)) if (k.startsWith("DAWN_") || k.endsWith("_API_KEY")) delete env[k]
  Object.assign(env, { DAWN_HIDE_WINDOW: "1", DAWN_UPDATE_FEED: feed.url, DAWN_NO_EXTERNAL: "1" })
  const app = await _electron.launch({
    executablePath: join(APP, "Contents/MacOS/DAWN Science"),
    args: [`--user-data-dir=${ud}`],
    env,
  })
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
  return (await page.locator(".turns .turn.agent").last().textContent()).replace(/\s+/g, " ").slice(0, 50)
}

console.log(`② 起 ${旧版}，填 key，发一句，然后点更新`)
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
  await 查(`侧栏说有 ${新版}`, () => page.locator(".update-row").waitFor({ timeout: 30_000 }))
  await 查("下载真包 → 就绪", async () => {
    await page.locator(".update-row").click()
    await page.getByRole("button", { name: `更新到 ${新版}` }).click()
    await page.getByRole("button", { name: "重启并更新" }).waitFor({ timeout: 180_000 })
  })
  /**
   * 这一下之后应用自己换包并重启。
   *
   * **不许按固定秒数等**（2026-09-06 第一次跑就栽在这儿）：解一个 223 MB 的 zip
   * 要十几秒，等 15 秒就 `app.close()` 会把 `ditto` 一起杀掉——
   * 于是「换包没成功」，而根因在演练脚本里，不在产品里。盯盘。
   */
  await page.getByRole("button", { name: "重启并更新" }).click().catch(() => {})
  const 换好了 = async () => {
    for (let i = 0; i < 120; i += 1) {
      try {
        if (包内版本(APP) === 新版) return true
      } catch {
        // 换的那一瞬间 `.app` 正在被 rename，读不到是正常的
      }
      await new Promise((r) => setTimeout(r, 1000))
    }
    return false
  }
  判("**盘上真的换过去了**（最多等 120 秒）", await 换好了())
  await new Promise((r) => setTimeout(r, 3000))
  await app.close().catch(() => {})
}

console.log("③ 盘上到底换了没有")
判(`Applications 里那个 .app 现在是 ${新版}`, 包内版本(APP) === 新版, 包内版本(APP))
判(`旧的备份还在（.old-${旧版}）`, existsSync(`${APP}.old-${旧版}`), readdirSync(APPS).join("、"))

// 换包之后系统会把新版拉起来（app.relaunch）。它可能还活着，先收干净再自己起一次
try { execFileSync("/usr/bin/pkill", ["-f", `${APPS}/DAWN Science.app`]) } catch { /* 没在跑 */ }
await new Promise((r) => setTimeout(r, 2000))

console.log(`④ 起换上去的 ${新版}——key 应该还在`)
{
  const { app, page } = await 起()
  await 查("**没有向导拦路（key 还在）**", async () => {
    await page.waitForTimeout(12_000)
    const 要重填 = await page.getByText(/解不开|decrypted/i).count()
    if (要重填) throw new Error("界面在要求重填 key —— 交接没接上")
  })
  await 查("**不重填就能发一句**", async () => console.log("    回复 =", await 发一句(page)))
  判("handoff.json 用完删掉了", !existsSync(join(ud, "handoff.json")))
  await app.close().catch(() => {})
}

const log = readFileSync(join(ud, "startup.log"), "utf8")
console.log("[startup.log 里的交接行]")
for (const l of log.split("\n").filter((l) => l.includes("更新交接"))) console.log("  " + l.slice(25))
await feed.close()
console.log(`\n目录：${tmp}`)
if (失败.length) { console.log(`\n${失败.length} 项没过：${失败.join("；")}`); process.exitCode = 1 } else console.log("\n全部通过")
