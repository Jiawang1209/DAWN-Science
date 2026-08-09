/**
 * Spike E —— pi 能不能会话中途换模型？（①-B″ · U2 的前置）
 *
 * 计划里 U2 标着「需要一个小 spike」。读类型声明已经能看到
 * `AgentSession.setModel(model): Promise<void>`，但**读到签名不等于验过行为**——
 * 本项目已经用七次缺陷证明了这件事。
 *
 * 四问：
 *   Q1 换了之后，**下一次请求真的打到新模型**吗？（从假后端记下的请求体证明，
 *      不是"调用没抛异常"）
 *   Q2 `setModel` 的文档写着 *"saves to session **and settings**"*——
 *      那么它**会不会把一个会话的选择写成全局默认**？
 *      作用域搞错，就是一个会话的东西渗进另一个（规格与 Hermes 同一条）。
 *   Q3 换到**没有配置凭证**的模型时是什么行为、什么错误信息？
 *      文档说 `@throws`，那么界面必须接得住并说人话。
 *   Q4 **正在流式输出时**换模型会怎样？
 *
 * 跑法：`npx tsx spikes/e-model-switch.ts`
 *
 * **不烧真 key**：全程用 `scripts/mock-inference-server.mjs`——
 * 它同时服务于 `npm run dev:mock` 与 e2e，是同一份假后端。
 * 而且假后端记下的请求体里带着 `model` 字段，**那是唯一能从外部证明切换发生了的东西**。
 *
 * **隔离纪律**（沿用 Spike A-2）：临时 agentDir 与 cwd，前后核对指纹。
 */
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, relative } from "node:path"
import { createAgentSession, ModelRuntime } from "@earendil-works/pi-coding-agent"
// @ts-expect-error -- .mjs 脚本无类型声明；它同时服务于 dev:mock 与 e2e
import { startMockInferenceServer, mockModelsJson } from "../scripts/mock-inference-server.mjs"

const PROVIDER = "deepseek"
const MODEL_A = "deepseek-v4-flash"
const MODEL_B = "deepseek-v4-deep"

/** agentDir 下每个文件的「相对路径 → 内容」，用来看 setModel 到底写了什么 */
function snapshot(dir: string): Map<string, string> {
  const out = new Map<string, string>()
  const walk = (d: string) => {
    for (const name of readdirSync(d)) {
      const p = join(d, name)
      if (statSync(p).isDirectory()) walk(p)
      else out.set(relative(dir, p), readFileSync(p, "utf8"))
    }
  }
  walk(dir)
  return out
}

function diff(before: Map<string, string>, after: Map<string, string>): string[] {
  const notes: string[] = []
  for (const [k, v] of after) {
    if (!before.has(k)) notes.push(`新增 ${k}`)
    else if (before.get(k) !== v) notes.push(`改写 ${k}`)
  }
  for (const k of before.keys()) if (!after.has(k)) notes.push(`删除 ${k}`)
  return notes
}

/**
 * 假后端记下的每次请求用的是哪个模型。
 *
 * **`body` 已经是解析过的对象**（见 mock-inference-server.mjs：`JSON.parse` 之后才 push）。
 * 第一版又 `JSON.parse` 了一遍，于是每条都抛、全被 filter 掉，
 * 结果是"一次请求都没有"——**而请求其实一直在正常发送**。
 * 又一次「探针坏了，不是被测对象坏了」。
 */
function modelsUsed(requests: { body?: { model?: string } }[]): string[] {
  return requests.map((r) => r.body?.model).filter((m): m is string => Boolean(m))
}

async function main(): Promise<void> {
  const server = await startMockInferenceServer()
  const root = mkdtempSync(join(tmpdir(), "dawn-spike-e-"))
  const agentDir = join(root, "agent")
  const cwd = join(root, "workspace")
  mkdirSync(agentDir, { recursive: true })
  mkdirSync(cwd, { recursive: true })

  const modelsPath = join(agentDir, "models.json")
  const { writeFileSync } = await import("node:fs")
  writeFileSync(modelsPath, JSON.stringify(mockModelsJson(server.url, PROVIDER, [MODEL_A, MODEL_B]), null, 2))

  // **不传 authPath**：生产代码（src/runtime/native.ts）就不传，
  // 传了之后 pi 会去那个空文件里找 key，而不用 models.json 里内联的那把。
  // 第一版栽在这里——一次请求都没发出去，而且没有任何声音
  const modelRuntime = await ModelRuntime.create({ modelsPath })

  const a = modelRuntime.getModel(PROVIDER, MODEL_A)
  const b = modelRuntime.getModel(PROVIDER, MODEL_B)
  if (!a || !b) {
    console.error("假后端没有提供两个模型，spike 无从谈起")
    process.exit(1)
  }

  const { session } = await createAgentSession({ cwd, agentDir, model: a, modelRuntime })

  // **失败必须出声。** 第一版没有收事件，于是 prompt 一次都没打出去却一片安静
  const errors: string[] = []
  ;(session as { on?: (ev: string, cb: (p: unknown) => void) => void }).on?.("error", (p) =>
    errors.push(JSON.stringify(p)),
  )

  // ── Q1：换了之后请求真的换了吗 ─────────────────────────────────
  console.log("模型 A：", JSON.stringify({ id: a.id, provider: (a as {provider?:string}).provider, baseUrl: (a as {baseUrl?:string}).baseUrl, api: (a as {api?:string}).api }))
  await session.prompt("说一句话")
  console.log("第一次 prompt 之后，假后端收到的原始请求：", JSON.stringify(server.requests.map((r: {url:string}) => r.url)))
  await session.waitForIdle()
  const afterFirst = modelsUsed(server.requests).length

  const before = snapshot(agentDir)
  await session.setModel(b)
  const after = snapshot(agentDir)

  await session.prompt("再说一句")
  await session.waitForIdle()

  const used = modelsUsed(server.requests)
  console.log("\n=== Q1 每次请求用的模型 ===")
  console.log(used.join("  →  "))
  const switched = used.slice(afterFirst).every((m) => m === MODEL_B) && used[0] === MODEL_A
  console.log(switched ? "✅ 中途换模型生效，且下一次请求确实打到新模型" : "❌ 没有生效")
  console.log(`   session.model 现在是：${session.model?.id ?? "(未选择)"}`)

  // ── Q2：写到哪儿去了 ───────────────────────────────────────────
  console.log("\n=== Q2 setModel 改动了 agentDir 里的哪些文件 ===")
  const changed = diff(before, after)
  console.log(changed.length ? changed.join("\n") : "（没有改动 agentDir 里的任何文件）")
  for (const f of changed) {
    const name = f.replace(/^(新增|改写) /, "")
    if (/settings|config/i.test(name)) {
      console.log(`   ⚠ ${name} 看起来是 agentDir 级的共享设置——`)
      console.log(`     若两个会话共用同一个 agentDir，A 里换模型会改掉 B 的默认值`)
      console.log(`     内容：${after.get(name)?.slice(0, 300)}`)
    }
  }

  // ── Q3：换到没配凭证的模型 ─────────────────────────────────────
  console.log("\n=== Q3 换到没有凭证的模型 ===")
  const orphan = { ...b, provider: "provider-that-does-not-exist" } as typeof b
  try {
    await session.setModel(orphan)
    console.log("⚠ 没有抛错——那么界面无法靠异常发现问题，得自己检查")
  } catch (e) {
    console.log(`✅ 抛错了。信息：${e instanceof Error ? e.message : String(e)}`)
    console.log("   → 界面必须把它翻成人话，并给出「去设置」的出路")
  }

  // ── Q4：流式进行中换模型 ───────────────────────────────────────
  console.log("\n=== Q4 正在流式输出时换模型 ===")
  const pending = session.prompt("这一句用来占住流式状态")
  console.log(`   发起后 isStreaming=${session.isStreaming}`)
  try {
    await session.setModel(a)
    console.log(`   ⚠ 流式中途 setModel **没有被拒绝**。session.model=${session.model?.id}`)
    console.log("   → 那么「正在说话时不许换」这条得由我们自己把住")
  } catch (e) {
    console.log(`   ✅ 被拒绝：${e instanceof Error ? e.message : String(e)}`)
  }
  await pending
  await session.waitForIdle()
  if (errors.length) {
    console.log("\n=== 会话报出的错误 ===")
    console.log(errors.join("\n"))
  }
  console.log("\n=== 全部请求 ===")
  console.log(modelsUsed(server.requests).join("  →  "))

  console.log("\n=== 会话 jsonl 里与模型有关的行 ===")
  for (const [name, body] of snapshot(agentDir)) {
    if (!name.endsWith(".jsonl")) continue
    for (const line of body.split("\n").filter(Boolean)) {
      if (/model/i.test(line)) console.log(`  ${line.slice(0, 220)}`)
    }
  }

  session.dispose()
  await server.close()
  rmSync(root, { recursive: true, force: true })
}

main().catch((e: unknown) => {
  console.error(e)
  process.exit(1)
})
