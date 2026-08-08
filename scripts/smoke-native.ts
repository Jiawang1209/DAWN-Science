/**
 * NativeRuntime 冒烟验证（实施计划 Task 1.10 Step 4）。
 *
 * 真的向 DeepSeek 发一轮对话，验证 started → output → exited 的完整事件链。
 * 单元测试只覆盖契约层（不打网络），这条链只能靠真请求验证。
 *
 * 跑法：npm run smoke:native
 */
import { NativeRuntime } from "../src/runtime/native.js"

const MODEL = process.env.DAWN_SMOKE_MODEL ?? "deepseek-v4-flash"

async function main(): Promise<void> {
  const key = process.env.DEEPSEEK_API_KEY
  if (!key) {
    console.error("缺少 DEEPSEEK_API_KEY —— 请在 .env 里配置（见 .env.example）")
    process.exit(1)
  }

  const rt = new NativeRuntime()
  const kinds: string[] = []
  let text = ""

  rt.attach("n1", (e) => {
    kinds.push(e.kind)
    if (e.kind === "output") {
      text += e.data
      process.stdout.write(e.data)
    } else {
      console.log(`\n[event] ${JSON.stringify(e)}`)
    }
  })

  const handle = await rt.start({
    sessionId: "n1",
    workspace: process.cwd(),
    sessionDir: "/tmp/dawn-smoke-n1",
    endpoint: { baseUrl: "https://api.deepseek.com/v1", apiKey: key, model: MODEL },
  })
  console.log(`started pid=${handle.pid}  model=${MODEL}\n--- 模型回答 ---`)

  rt.write("n1", "用一句话说明你是谁")
  await rt.waitForIdle("n1")
  await rt.stop("n1")

  const ok =
    kinds.includes("started") &&
    kinds.includes("output") &&
    kinds.includes("exited") &&
    text.trim().length > 0

  console.log(`\n--- 判定 ---`)
  console.log(`事件种类     : ${[...new Set(kinds)].join(", ")}`)
  console.log(`收到正文长度 : ${text.trim().length}`)
  console.log(`${ok ? "✅" : "❌"} 冒烟${ok ? "通过" : "失败"}`)
  process.exit(ok ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
