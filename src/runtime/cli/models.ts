/**
 * 外部 CLI 的模型清单：**能发现就发现**（①-C 后续）。
 *
 * ## 这个模块存在，是因为我说过一句错话
 *
 * Spike H 的结论里我写着「两个 CLI 都没有『列出可选项』的接口，
 * 所以只能由配置声明」，并据此让用户手写清单——**然后自己在默认配置里
 * 编了一组名字，把作者的 codex 打成 400**
 * （`The 'gpt-5.1-codex' model is not supported when using Codex with a ChatGPT account.`）。
 *
 * 线索其实一直在眼前：codex **每一轮都往 stderr 打**
 * `codex_models_manager::cache: failed to load models cache`——
 * **它有模型缓存**，只是没写在 `--help` 里。
 *
 * > **「没有接口」与「我没找到接口」是两回事。**
 *
 * ## 两个 CLI 的实情不同，所以这里只有一半
 *
 * | | 有没有可发现的清单 |
 * |---|---|
 * | **codex** | ✅ `~/.codex/models_cache.json`，带 `visibility` 与 `priority` |
 * | **claude** | ❌ 没有这样的文件；别名写在 `--help` 里（`fable`/`opus`/`sonnet`），仍靠配置声明 |
 *
 * ## 这是个没有文档的内部文件
 *
 * 所以解析**一律防御**：读不到、解析不了、形状不认得——**统统返回 `undefined`**，
 * 让调用方退回配置声明。**不返回空数组**：缺省是「不知道」，
 * 空数组会被读成「这个 CLI 一个模型都没有」（与全项目同一条纪律）。
 */
import { readFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

interface CachedModel {
  slug?: unknown
  /** `list` 给用户选；`hide` 是内部的（实测有 `gpt-5.6-sol-wm` / `codex-auto-review`） */
  visibility?: unknown
  /** CLI 自己给的顺序，1 最靠前。**不该我们重排** */
  priority?: unknown
}

/**
 * 这个 CLI 能选哪些模型。
 *
 * @param family `familyOf(command)` 的结果：`claude` / `codex`
 * @param home 家目录。**可注入**——测试要造一份假缓存，而不是碰真的
 * @returns 清单；**发现不了时 `undefined`**（不是空数组）
 */
export function discoverCliModels(family: string, home = homedir()): string[] | undefined {
  if (family !== "codex") return undefined

  let raw: string
  try {
    raw = readFileSync(join(home, ".codex", "models_cache.json"), "utf8")
  } catch {
    // 文件不存在是正常的（没跑过 codex，或版本不同）。**不是错误，是「不知道」**
    return undefined
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return undefined
  }

  const models = (parsed as { models?: unknown } | null)?.models
  if (!Array.isArray(models)) return undefined

  const usable = models
    .filter((m): m is CachedModel => typeof m === "object" && m !== null)
    // **只要 `list`**：`hide` 是内部模型，给用户选会直接报错
    .filter((m) => m.visibility === "list" && typeof m.slug === "string")
    // **按 CLI 自己的 priority 排**，不按我们的偏好
    .sort((a, b) => num(a.priority) - num(b.priority))
    .map((m) => m.slug as string)

  // 一个都没有 → **「不知道」，不是「确认没有」**
  return usable.length > 0 ? usable : undefined
}

/** 没有 priority 的排到最后，而不是排到最前 */
const num = (v: unknown): number => (typeof v === "number" ? v : Number.MAX_SAFE_INTEGER)
