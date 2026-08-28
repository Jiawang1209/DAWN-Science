/**
 * **全新电脑演练**（2026-08-28）。打包前跑一遍，回答「一台从没装过 DAWN 的机器上，从双击到跑通一段 Python 是什么样」。
 *
 * 与 `test-packaged.mjs` 的区别：那个用隔离的 `DAWN_*` 目录 + 假模型，验的是四个原生模块；这个**什么 DAWN_* 变量都不带**、
 * 临时 HOME（没有 ~/DAWN、没有 jupyter 目录）、干净 userData、用 `.env` 里的真 key 走真实链路：
 * 向导 → 填 key → 检测解释器 → 开始使用 → 真发一句 → 跑一段 Python → 终端 → 设置。每步截图，最后打印 startup.log。
 *
 * 先 `npm run pack`。界面语言跟系统（2026-08-28 起），所以中英文文案都认。
 *
 * 两种模式：
 *   - 默认（临时 HOME）：验「没有任何旧数据」那条路。**但 macOS 下临时 HOME 找不到登录钥匙串**，safeStorage 会等 5–35 秒后报「不可用」，
 *     期间主进程卡住——这一步在此模式下永远是悲观的；也没有 conda/uv 那些解释器，run_code 那步预期走不通。
 *   - `REHEARSE_REAL_HOME=1`（真实 HOME、只换 userData）：真机上的样子。钥匙串 ~20 ms，会挑到带 ipykernel 的解释器，run_code 真跑通。
 *   两个都跑：前者抓「首次没数据」的坑（比如默认项目与临时会话根同路径——恰恰只有真实 HOME 抓得到，见 2026-08-28 历史），后者抓真机的坑。
 * 2026-08-28 第一次跑就抓到：钥匙串同步调用把主进程卡 5–60 秒（窗口一片空白）、默认 agent 走 claude CLI、向导判据永远不亮。
 */
import { _electron } from "@playwright/test"
import { mkdtempSync, mkdirSync, readFileSync, existsSync, readdirSync } from "node:fs"; import { tmpdir } from "node:os"; import { join } from "node:path"
import { resolve } from "node:path"
const ROOT=resolve(import.meta.dirname, "..")
const key=((readFileSync(join(ROOT,".env"),"utf8").match(/^DEEPSEEK_API_KEY=(.+)$/m)??[])[1]??"").trim()
if(!key) { console.error("需要 .env 里的 DEEPSEEK_API_KEY（真链路）"); process.exit(2) }
const home=mkdtempSync(join(tmpdir(),"dawn-freshv2-")); const ud=join(home,"ud"); mkdirSync(ud)
// REHEARSE_REAL_HOME=1：保留真实 HOME、只换 userData——临时 HOME 会让 macOS 找不到登录钥匙串，safeStorage 超时后报「不可用」，
// 把钥匙串那一步量得比真机慢得多；真机上的样子要用这个模式看。
const env={...process.env,...(process.env.REHEARSE_REAL_HOME==="1"?{}:{HOME:home})}; for(const k of Object.keys(env)) if(k.startsWith("DAWN_")||k.endsWith("_API_KEY")) delete env[k]
// 窗口藏起来（与 e2e 同一个开关）：演练跑在作者桌面上，弹出来的窗口会抢焦点——作者这时在别处敲的字全进了向导的 key 框，
// 回车还会把它提交掉。2026-08-28 追了半天的「key 被清空」就是这个，不是应用的 bug。
env.DAWN_HIDE_WINDOW="1"
const t0=Date.now(); let n=0; const shots=[]
const app=await _electron.launch({executablePath:join(ROOT,"release/mac-arm64/DAWN Science.app/Contents/MacOS/DAWN Science"),args:[`--user-data-dir=${ud}`],env})
const page=await app.firstWindow(); const errs=[];  page.on("pageerror",e=>errs.push(e.message.slice(0,200))); page.on("console",m=>{ if(m.type()==="error") errs.push(m.text().slice(0,200)) })
const shot=async(名)=>{ const p=join(home,`${++n}-${名}.png`); await page.screenshot({path:p}); shots.push(p) }
const 查=async(名,fn)=>{ try{ await fn(); console.log(`  ✓ ${名}  (${Date.now()-t0}ms)`) }catch(e){ console.log(`  ✗ ${名}：${String(e.message??e).split("\n")[0]}`); await shot("fail-"+名.slice(0,10)).catch(()=>{}) } }
try{
  await 查("窗口有内容（app-shell）", ()=>page.locator(".app-shell").waitFor({timeout:30_000}))
  await 查("向导 5 秒内出现", ()=>page.locator(".setup-wizard").waitFor({timeout:5_000}))
  await shot("wizard")
  const W=page.locator(".setup-wizard")
  await 查("敲 key，10 秒后还在", async()=>{ await W.getByLabel("API key").click(); await page.keyboard.type(key); await page.waitForTimeout(10_000); const v=await W.getByLabel("API key").inputValue(); if(v.length!==key.length) throw new Error(`被清成了 ${v.length} 字符`) })
  await 查("Save → Saved", async()=>{ await W.getByRole("button",{name:/^(Save|保存)$/}).click(); await W.getByText(/Saved|已填/).waitFor({timeout:60_000}) })
  await 查("Detect interpreters", async()=>{ await W.getByRole("button",{name:/Detect interpreters|检测本机解释器/}).first().click(); await W.locator(".ip-python .ip-item").first().waitFor({timeout:60_000}); console.log("    python 候选",await W.locator(".ip-python .ip-item").count()); const 带内核=W.locator(".ip-python .ip-item",{hasText:/ipykernel ✓/}).first(); if(await 带内核.count()){ await 带内核.getByRole("radio").check(); console.log("    选了带 ipykernel 的那个") } else console.log("    没有带 ipykernel 的候选，run_code 那步预期走不通") })
  await shot("wizard-filled")
  await 查("Get started", async()=>{ await W.getByRole("button",{name:/Get started|开始使用/}).click(); await W.waitFor({state:"detached",timeout:10_000}) })
  await shot("empty")
  await 查("空态 pill 是 DeepSeek", async()=>{ const t=await page.locator(".empty-conv").innerText(); if(!/deepseek/i.test(t)) throw new Error("看到的是："+t.replace(/\s+/g," ").slice(0,120)) })
  await 查("Polish 按钮在且没灰", async()=>{ const b=page.getByRole("button",{name:/Polish|优化/}); await b.waitFor({timeout:5000}); const why=await b.getAttribute("aria-label")??""; if(await b.isDisabled() && !/先写点什么|Write something|Type something/.test(why)) throw new Error("灰着："+why) })
  await 查("真发一句（真 API）", async()=>{ const box=page.getByPlaceholder(/What can I do|今天帮你/); await box.fill("Reply with exactly one word: OK"); await box.press("Enter"); await page.locator(".conv-title").waitFor({timeout:15_000}); await page.locator(".turns .turn.agent").last().waitFor({timeout:90_000}); await page.waitForTimeout(2000); console.log("    回复 =",(await page.locator(".turns .turn.agent").last().textContent()).replace(/\s+/g," ").slice(0,80)) })
  await shot("chat")
  await 查("跑 python（内核）", async()=>{ const box=page.getByPlaceholder(/What can I do|今天帮你/); await box.fill("Use run_code to run python: print(6*7). Report only the output."); await box.press("Enter"); await page.waitForTimeout(45_000); const t=(await page.locator(".turns").innerText()).replace(/\s+/g," "); console.log("    末尾 =",t.slice(-160)); if(!/42/.test(t)) throw new Error("没看到 42") })
  await shot("code")
  await 查("Terminal", async()=>{ await page.getByRole("button",{name:/^(Terminal|终端)$/}).click(); await page.locator(".dock .term-host").waitFor({timeout:30_000}); await page.waitForTimeout(2000); await page.locator(".dock .term-host .xterm-helper-textarea").first().focus(); await page.keyboard.type("echo FRESH_OK\n"); await page.locator(".dock .term-host").getByText(/FRESH_OK/).first().waitFor({timeout:20_000}) })
  await shot("terminal")
  await 查("Settings → Kernel", async()=>{ await page.getByRole("button",{name:/^(Settings|设置)$/}).click(); await page.locator(".settings-nav").getByRole("button",{name:/^(Kernel|内核)$/}).click(); await page.getByRole("textbox",{name:/Python interpreter|Python 解释器/}).waitFor({timeout:15_000}) })
  await shot("settings")
} finally { await app.close().catch(()=>{}) }
console.log("[startup.log]\n"+readFileSync(join(ud,"startup.log"),"utf8").split("\n").map(l=>"  "+l.slice(11,23)+" "+l.slice(25)).join("\n"))
console.log("[渲染错误]", errs.length? "\n  "+[...new Set(errs)].slice(0,8).join("\n  "):"无")
console.log("[~/DAWN]", existsSync(join(home,"DAWN"))?readdirSync(join(home,"DAWN")).join(", "):"(没有)")
console.log("[截图]\n  "+shots.join("\n  "))
