/**
 * Spike D · Step 6 —— 在 Electron 主进程里验证 zeromq + Jupyter 内核。
 *
 * 验证问题：Node 与 Electron 的 V8 ABI 不同，原生模块通常需要为 Electron 单独编译。
 * zeromq 6.x 用的是 Node-API（N-API），理论上跨运行时 ABI 稳定、无需 rebuild——
 * 本脚本就是来证实或证伪这一点的。
 *
 * 跑法：cd spikes/d-electron-zmq && npx electron .
 */
const { app } = require("electron")

const KERNEL = process.env.DAWN_KERNEL || "dawn-spike"
const TIMEOUT_MS = 30_000

function fail(msg, err) {
  console.error(`\n❌ ${msg}`)
  if (err) console.error(err.stack || err.message || String(err))
  app.exit(1)
}

/**
 * 关停顺序很关键。直接 app.exit() 会让 zeromq 在 native 层抛 Napi::Error，
 * 进程以 SIGABRT 结束——第一版就是这样，结论虽然打印出来了，退出码却是崩溃。
 * 与 Spike C 里 node-pty 重复 kill 的 SIGABRT 是同一类问题：
 * **原生模块必须先自行关闭，才能让运行时退出。**
 * 顺序：先停内核进程 → 再 complete 通道（关 zmq socket）→ 留一拍给 native 层收尾。
 */
async function shutdown(channels, kernel) {
  try { kernel?.spawn.kill() } catch {}
  await new Promise((r) => setTimeout(r, 200))
  try { channels?.complete?.() } catch {}
  await new Promise((r) => setTimeout(r, 300))
}

app.whenReady().then(async () => {
  console.log(`Electron ${process.versions.electron} · Node ${process.versions.node} · V8 ABI ${process.versions.modules}`)

  // ── 第一关：原生模块能否在 Electron ABI 下加载 ──────────────────────
  let zmq
  try {
    zmq = require("zeromq")
    console.log(`✓ zeromq 加载成功（libzmq ${zmq.version}）—— 无需 electron-rebuild`)
  } catch (e) {
    return fail("zeromq 在 Electron 中加载失败 —— 需要 npx @electron/rebuild -f -w zeromq", e)
  }

  // ── 第二关：完整链路能否跑通 ────────────────────────────────────────
  let kernel
  const timer = setTimeout(() => {
    console.error("\n❌ 超时未收到内核输出")
    try { kernel?.spawn.kill() } catch {}
    app.exit(1)
  }, TIMEOUT_MS)

  try {
    const { launch } = require("spawnteract")
    const { createMainChannel } = require("enchannel-zmq-backend")
    const { executeRequest, kernelInfoRequest, childOf, ofMessageType } = require("@nteract/messaging")

    kernel = await launch(KERNEL)
    console.log(`✓ 内核已启动 pid=${kernel.spawn.pid}`)

    const channels = await createMainChannel(kernel.config)

    // 握手，确保内核就绪后再发执行请求（否则消息会被丢弃）
    await new Promise((resolve, reject) => {
      const info = kernelInfoRequest()
      const sub = channels.pipe(childOf(info), ofMessageType("kernel_info_reply")).subscribe((m) => {
        sub.unsubscribe()
        console.log(`✓ 内核就绪：${m.content.language_info?.name} ${m.content.language_info?.version || ""}`)
        resolve()
      })
      channels.next(info)
      setTimeout(() => { sub.unsubscribe(); reject(new Error("kernel_info 超时")) }, 20_000)
    })

    const msg = executeRequest('print("DAWN_ELECTRON_OK")')
    const sub = channels.pipe(childOf(msg), ofMessageType("stream")).subscribe(async (m) => {
      const text = JSON.stringify(m.content)
      if (text.includes("DAWN_ELECTRON_OK")) {
        clearTimeout(timer)
        sub.unsubscribe()
        console.log("\n✅ Electron 中 zeromq + Jupyter 链路工作正常")
        await shutdown(channels, kernel)
        app.exit(0)
      }
    })
    channels.next(msg)
  } catch (e) {
    clearTimeout(timer)
    try { kernel?.spawn.kill() } catch {}
    fail("Electron 中链路失败", e)
  }
})

app.on("window-all-closed", () => {})
