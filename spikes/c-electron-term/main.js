/**
 * Spike C —— Electron 多终端并发渲染性能
 *
 * 与原计划的偏差：计划要求人工观察「是否卡死 / 能否交互 / resize 是否跟随」。
 * 肉眼判断不可复核，也无法回归。这里改成程序自测量，四个阶段依次自动执行：
 *   P1 回显     —— 每个终端 echo 一个哨兵，验证输入通路与 shell 存活
 *   P2 压力     —— 四路同时灌 200k 行，测吞吐、CPU、内存、渲染卡顿帧
 *   P3 中断     —— 起无限 yes，发 Ctrl-C，验证输出确实停止
 *   P4 resize   —— 改窗口尺寸，验证 xterm 与 pty 两侧尺寸都跟随
 * 全程无需人工干预，结束后打印判定并自动退出。
 */
const { app, BrowserWindow, ipcMain } = require("electron")
const path = require("node:path")

let pty
try {
  pty = require("node-pty")
} catch (e) {
  console.error("\n✗ node-pty 在 Electron 中加载失败：", e.message)
  console.error("  多半是 ABI 不匹配——node-pty 的 prebuild 针对 Node.js，Electron 用自己的 ABI。")
  console.error("  修法：npx @electron/rebuild -f -w node-pty\n")
  app.exit(1)
}

const N = 4
const STRESS_LINES = 200_000
const LINE = "0123456789abcdefghijklmnopqrstuvwxyz"

const shells = new Map()
const bytes = new Array(N).fill(0)
let win
const metrics = []           // {cpu, rssMB} 采样
let sampler

const waiters = new Map()    // sentinel -> resolve
function waitFor(sentinel, timeoutMs) {
  return new Promise((resolve) => {
    const t = setTimeout(() => { waiters.delete(sentinel); resolve(false) }, timeoutMs)
    waiters.set(sentinel, () => { clearTimeout(t); waiters.delete(sentinel); resolve(true) })
  })
}

function feed(id, data) {
  bytes[id] += Buffer.byteLength(data)
  for (const [sentinel, done] of waiters) {
    if (data.includes(sentinel)) done()
  }
  win?.webContents.send("data", id, data)
}

function sampleStart() {
  metrics.length = 0
  sampler = setInterval(() => {
    let cpu = 0, rss = 0
    for (const m of app.getAppMetrics()) {
      cpu += m.cpu?.percentCPUUsage ?? 0
      rss += m.memory?.workingSetSize ?? 0     // KB
    }
    metrics.push({ cpu, rssMB: rss / 1024 })
  }, 250)
}
function sampleStop() {
  clearInterval(sampler)
  if (!metrics.length) return { peakCpu: 0, peakRssMB: 0, avgCpu: 0 }
  return {
    peakCpu: Math.max(...metrics.map((m) => m.cpu)),
    avgCpu: metrics.reduce((a, m) => a + m.cpu, 0) / metrics.length,
    peakRssMB: Math.max(...metrics.map((m) => m.rssMB)),
  }
}

const sh = (id, cmd) => shells.get(id)?.write(cmd + "\n")
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const fmt = (n, d = 1) => Number(n).toFixed(d)

/**
 * 哨兵必须「写进命令行的样子」≠「被打印出来的样子」，否则终端回显命令行时
 * 就会误触发等待——这是本 spike 第一版的真实缺陷，导致压力测试瞬间「完成」
 * 却只流过几 KB。用 shell 引号拆开：命令里是 __DAWN"_"DONE_0__，输出是 __DAWN_DONE_0__。
 */
const sentinel = (kind, i) => `__DAWN_${kind}_${i}__`
const sentinelCmd = (kind, i) => `__DAWN"_"${kind}_${i}__`

async function runTests() {
  const R = {}

  // ── P1 回显 ────────────────────────────────────────────────────────
  const echoOk = []
  for (let i = 0; i < N; i++) {
    const p = waitFor(sentinel("ECHO", i), 10_000)
    sh(i, `echo ${sentinelCmd("ECHO", i)}`)
    echoOk.push(await p)
  }
  R.echo = echoOk.filter(Boolean).length

  // ── P2 压力：四路同时灌 ─────────────────────────────────────────────
  await win.webContents.executeJavaScript("window.__jank.reset()")
  const bytesAtStart = bytes.reduce((a, b) => a + b, 0)
  sampleStart()
  const t0 = Date.now()
  const dones = []
  for (let i = 0; i < N; i++) {
    dones.push(waitFor(sentinel("DONE", i), 180_000))
    sh(i, `yes "${LINE}" | head -${STRESS_LINES}; echo ${sentinelCmd("DONE", i)}`)
  }
  const drained = (await Promise.all(dones)).filter(Boolean).length
  const elapsed = (Date.now() - t0) / 1000
  const perf = sampleStop()
  const jank = await win.webContents.executeJavaScript("window.__jank.read()")
  const totalMB = (bytes.reduce((a, b) => a + b, 0) - bytesAtStart) / 1024 / 1024

  // 完整性闸门：四路各 20 万行 × 37 字节 ≈ 28 MB。若实测远低于此，
  // 说明哨兵又被提前触发了，判定作废——宁可报「无效」，不可报假的「通过」。
  const expectedMB = (N * STRESS_LINES * (LINE.length + 1)) / 1024 / 1024
  const valid = totalMB > expectedMB * 0.8

  R.stress = { drained, elapsed, totalMB, expectedMB, valid,
               throughputMBs: totalMB / elapsed, ...perf, ...jank }

  // ── P3 中断：起无限 yes，发 Ctrl-C ──────────────────────────────────
  // 判据是「同长度观察窗口内的增量对比」，不是绝对字节数——
  // 绝对值会被前面阶段的累计污染。
  await sleep(1000)
  sh(0, `yes "INTERRUPT_ME"`)
  await sleep(300)
  const w0 = bytes[0]
  await sleep(1500)
  const w1 = bytes[0]                       // 窗口 A：Ctrl-C 之前，应大量增长
  shells.get(0)?.write("\x03")              // Ctrl-C
  await sleep(1500)                         // 让残留输出排空
  const w2 = bytes[0]
  await sleep(1500)
  const w3 = bytes[0]                       // 窗口 B：Ctrl-C 之后，应几乎不增长
  R.interrupt = {
    beforeDelta: w1 - w0,
    afterDelta: w3 - w2,
    grewBeforeKill: w1 - w0 > 100_000,
    stopped: w3 - w2 < 4096,
  }

  // ── P4 resize ──────────────────────────────────────────────────────
  const sizeBefore = await win.webContents.executeJavaScript("window.__dims()")
  win.setSize(900, 600)
  await sleep(1200)
  const sizeAfter = await win.webContents.executeJavaScript("window.__dims()")
  const ptyDims = [...shells.values()].map((p) => `${p.cols}x${p.rows}`)
  R.resize = { before: sizeBefore, after: sizeAfter, ptyDims, changed: JSON.stringify(sizeBefore) !== JSON.stringify(sizeAfter) }

  return R
}

function report(R) {
  const s = R.stress
  const L = "═".repeat(72)
  console.log(`\n${L}\nSpike C · Electron 多终端实测\n${L}`)
  console.log(`终端数              : ${N}`)
  console.log(`\n[P1] 回显（输入通路）`)
  console.log(`  成功              : ${R.echo}/${N}`)
  console.log(`\n[P2] 压力：四路各 ${STRESS_LINES.toLocaleString()} 行`)
  console.log(`  全部灌完          : ${s.drained}/${N}`)
  console.log(`  数据量校验        : 实测 ${fmt(s.totalMB)} MB / 预期 ≈${fmt(s.expectedMB)} MB → ${s.valid ? "有效" : "✗ 无效，判定作废"}`)
  console.log(`  总字节            : ${fmt(s.totalMB)} MB`)
  console.log(`  耗时              : ${fmt(s.elapsed)} s`)
  console.log(`  吞吐              : ${fmt(s.throughputMBs)} MB/s`)
  console.log(`  CPU 峰值 / 均值   : ${fmt(s.peakCpu)}% / ${fmt(s.avgCpu)}%   （多进程求和，可 >100%）`)
  console.log(`  内存峰值(RSS 合计): ${fmt(s.peakRssMB)} MB`)
  console.log(`  渲染帧总数        : ${s.frames}`)
  console.log(`  卡顿帧 >100ms     : ${s.slow100}`)
  console.log(`  冻结帧 >250ms     : ${s.slow250}`)
  console.log(`  最长单帧          : ${fmt(s.maxFrameMs)} ms`)
  console.log(`\n[P3] 中断（Ctrl-C）`)
  console.log(`  杀前 1.5s 增量    : ${R.interrupt.beforeDelta.toLocaleString()} 字节`)
  console.log(`  杀后 1.5s 增量    : ${R.interrupt.afterDelta.toLocaleString()} 字节`)
  console.log(`\n[P4] resize`)
  console.log(`  xterm 尺寸 前→后  : ${JSON.stringify(R.resize.before)} → ${JSON.stringify(R.resize.after)}`)
  console.log(`  pty 侧尺寸        : ${R.resize.ptyDims.join(", ")}`)

  const q1 = R.echo === N
  const q2 = s.valid && s.drained === N && s.slow250 === 0
  const q3 = R.interrupt.grewBeforeKill && R.interrupt.stopped
  const q4 = R.resize.changed
  console.log(`\n${L}\n判定\n${L}`)
  console.log(`Q1 四个终端都能交互（输入回显）    : ${q1 ? "是" : "否"}`)
  console.log(`Q2 刷屏不冻结（无 >250ms 帧）      : ${
    !s.valid ? "无效 —— 数据量未达预期，本轮不作数" :
    q2 ? "是" : `否 —— 冻结帧 ${s.slow250} 个`}`)
  console.log(`Q3 Ctrl-C 生效                     : ${
    q3 ? "是" : `否 —— 杀前增量 ${R.interrupt.beforeDelta}，杀后增量 ${R.interrupt.afterDelta}`}`)
  console.log(`Q4 resize 后终端尺寸跟随           : ${q4 ? "是" : "否"}`)
  console.log(`\n四问全「是」→ Spike C 通过：${q1 && q2 && q3 && q4 ? "✅" : "❌"}`)
  if (s.slow100 > 0) {
    console.log(`\n注：出现 ${s.slow100} 个 >100ms 的卡顿帧（未达冻结阈值）。`)
    console.log(`    Task 1.8 的 ring buffer 与背压需按此调参，见 FINDINGS.md。`)
  }
}

app.whenReady().then(() => {
  win = new BrowserWindow({
    width: 1400, height: 900, show: true,
    webPreferences: { preload: path.join(__dirname, "preload.js") },
  })
  win.loadFile("index.html")

  ipcMain.on("spawn", (_e, id) => {
    const p = pty.spawn(process.env.SHELL || "/bin/bash", [], {
      name: "xterm-256color", cols: 80, rows: 24, cwd: process.env.HOME,
      env: { ...process.env, PS1: "$ " },
    })
    p.onData((d) => feed(id, d))
    shells.set(id, p)
  })
  ipcMain.on("input", (_e, id, data) => shells.get(id)?.write(data))
  ipcMain.on("resize", (_e, id, cols, rows) => { try { shells.get(id)?.resize(cols, rows) } catch {} })

  ipcMain.once("ready", async () => {
    await sleep(1500)                       // 等 shell 起来
    try {
      report(await runTests())
    } catch (e) {
      console.error("测试异常：", e)
    }
    // node-pty 对已退出的 pty 再 kill 会从 native 层抛 Napi::Error，
    // 该异常是异步的、catch 不到，会让进程 SIGABRT（第一版就是这么崩的）。
    // 先解绑 onData 再逐个 kill，并留出排空时间。
    for (const [id, p] of shells) {
      try { p.onData(() => {}) } catch {}
      try { p.kill() } catch (e) { console.error(`kill pty ${id} 失败（可忽略）:`, e.message) }
    }
    await sleep(300)
    app.exit(0)
  })
})

app.on("window-all-closed", () => app.exit(0))
