/**
 * **更新演练**（2026-08-29）：回答「一个装过上一版、存过 key 的人，装上新包看到什么」。
 *
 * `rehearse-fresh-install.mjs` 验的是没有任何旧数据的那条路，抓不到这一条：未签名包每换一个二进制，钥匙串就不认上一版
 * 加密的 `credentials.json`——而核验「解不解得开」要进钥匙串，钥匙串不能在启动路径上碰（2026-08-28 那次几十秒的空白）。
 * 审查（2026-08-29）抓到第一版把解密塞回了 `listCredentials`，单测与 e2e 都看不出来（假 safeStorage 零耗时）——只有这一条演练看得到。
 *
 * 做法：真实 HOME、干净 userData，预先放一份 `encrypted: true` 但密文是乱码的 credentials.json（等价于上一版钥匙加的）。
 * 预期：窗口 3 秒内有内容（没进钥匙串）；预热后界面说「解不开，需要重新填写」；重填之后能保存、能开口。
 * 先 `npm run pack`。需要 `.env` 里的 DEEPSEEK_API_KEY。
 */
import { _electron } from "@playwright/test"
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"; import { tmpdir } from "node:os"; import { join, resolve } from "node:path"
const ROOT=resolve(import.meta.dirname, "..")
const key=((readFileSync(join(ROOT,".env"),"utf8").match(/^DEEPSEEK_API_KEY=(.+)$/m)??[])[1]??"").trim()
if(!key) { console.error("需要 .env 里的 DEEPSEEK_API_KEY（真链路）"); process.exit(2) }
const tmp=mkdtempSync(join(tmpdir(),"dawn-update-")); const ud=join(tmp,"ud"); mkdirSync(ud)
// 「上一版存的」：加密标记为真，密文却是这把钥匙解不开的——真实的更新后正是这样
writeFileSync(join(ud,"credentials.json"),JSON.stringify({encrypted:true,entries:{deepseek:Buffer.from("v10:not-this-key").toString("base64"),"ssh:old":Buffer.from("v10:pw").toString("base64")}},null,2),{mode:0o600})
const env={...process.env}; for(const k of Object.keys(env)) if(k.startsWith("DAWN_")||k.endsWith("_API_KEY")) delete env[k]
env.DAWN_HIDE_WINDOW="1"
const t0=Date.now(); let n=0; const shots=[]
const app=await _electron.launch({executablePath:join(ROOT,"release/mac-arm64/DAWN Science.app/Contents/MacOS/DAWN Science"),args:[`--user-data-dir=${ud}`],env})
const page=await app.firstWindow(); const errs=[]; page.on("pageerror",e=>errs.push(e.message.slice(0,200))); page.on("console",m=>{ if(m.type()==="error") errs.push(m.text().slice(0,200)) })
const shot=async(名)=>{ const p=join(tmp,`${++n}-${名}.png`); await page.screenshot({path:p}); shots.push(p) }
// 失败要记下来、最后让进程退 1——此前 ✗ 只是打印，`npm run rehearse:update` 永远退 0，什么都门禁不了（2026-09-01 审查抓的）
const 失败=[]
const 查=async(名,fn)=>{ try{ await fn(); console.log(`  ✓ ${名}  (${Date.now()-t0}ms)`) }catch(e){ 失败.push(名); console.log(`  ✗ ${名}：${String(e.message??e).split("\n")[0]}`); await shot("fail-"+名.slice(0,10)).catch(()=>{}) } }
const 判=(名,ok,详)=>{ if(!ok) 失败.push(名); console.log(`  ${ok?"✓":"✗"} ${名}${详?"："+详:""}`) }
try{
  await 查("窗口 3 秒内有内容（没进钥匙串）", ()=>page.locator(".app-shell").waitFor({timeout:3_000}))
  await shot("shell")
  await 查("预热后说「解不开，需要重新填写」（向导亮起）", ()=>page.locator(".setup-wizard").getByText(/解不开|decrypted/i).waitFor({timeout:20_000}))
  await shot("broken")
  const W=page.locator(".setup-wizard")
  await 查("重填 → Saved", async()=>{ await W.getByLabel("API key").fill(key); await W.getByRole("button",{name:/^(Save|保存)$/}).click(); await W.getByText(/Saved|已填/).waitFor({timeout:60_000}) })
  await 查("「解不开」那句消失", ()=>W.getByText(/解不开|decrypted/i).waitFor({state:"detached",timeout:10_000}))
  await shot("refilled")
  await 查("Get started", async()=>{ await W.getByRole("button",{name:/Get started|开始使用/}).click(); await W.waitFor({state:"detached",timeout:10_000}) })
  await 查("真发一句（真 API）", async()=>{ const box=page.getByPlaceholder(/What can I do|今天帮你/); await box.fill("Reply with exactly one word: OK"); await box.press("Enter"); await page.locator(".conv-title").waitFor({timeout:15_000}); await page.locator(".turns .turn.agent").last().waitFor({timeout:90_000}); await page.waitForTimeout(2000); console.log("    回复 =",(await page.locator(".turns .turn.agent").last().textContent()).replace(/\s+/g," ").slice(0,80)) })
  await shot("chat")
} finally { await app.close().catch(()=>{}) }
const log=readFileSync(join(ud,"startup.log"),"utf8")
console.log("[startup.log]\n"+log.split("\n").map(l=>"  "+l.slice(11,23)+" "+l.slice(25)).join("\n"))
// main.ts 写的是 `IPC <操作> 用了 <ms> ms`（超过 200 ms 才写）——此前这里匹配的「启动阶段」从没出现在日志里，这一栏永远印「无」
const 慢=log.split("\n").filter(l=>/IPC .* 用了 \d+ ms/.test(l)); console.log("[启动阶段慢 IPC]",慢.length?慢.join("\n"):"无")
console.log("[凭证行数]",log.split("\n").filter(l=>l.includes("凭证：")).length)
// 判据：预热与「无法解密」**都得出现**，且预热在前。
//   种下的 credentials.json 密文就是解不开的，所以「无法解密」必须出现——它不出现不是好事，是解密根本没发生（`broken()` 退化）。
//   此前的判据「首次解密===-1 就算 ✓」正是这样给过假绿；缺预热那一行同样是假绿（没预热就没法说「在预热之后」）。
{ const lines=log.split("\n"); const 预热=lines.findIndex(l=>l.includes("钥匙串预热")); const 首次解密=lines.findIndex(l=>l.includes("无法解密"))
  const 位置=`预热=第 ${预热+1} 行，首次解密=第 ${首次解密+1} 行（0 = 没出现）`
  判("钥匙串预热出现在日志里", 预热!==-1, 位置)
  判("预热后核验到「无法解密」（种下的密文本来就解不开）", 首次解密!==-1, 位置)
  判("解密在预热之后（启动路径上没人解密）", 预热!==-1&&首次解密!==-1&&预热<首次解密, 位置) }
console.log("[渲染错误]", errs.length? "\n  "+[...new Set(errs)].slice(0,8).join("\n  "):"无")
console.log("[截图]\n  "+shots.join("\n  "))
if(失败.length){ console.log(`\n${失败.length} 项没过：${失败.join("；")}`); process.exitCode=1 } else console.log("\n全部通过")
