/**
 * 外部 CLI 的模型清单：**能发现就发现，发现不了才问配置**（①-C 后续）。
 *
 * ## 我说过一句错话
 *
 * Spike H 的结论里我写着「两个 CLI 都没有『列出可选项』的接口，
 * 所以只能由配置声明」，并据此让用户手写清单——**然后自己在默认配置里
 * 编了一组名字，把作者的 codex 打成 400**。
 *
 * 作者一句「很明显 codex 的模型，不只是 gpt-5.6-sol, gpt-5.5」逼我回去找，
 * 线索其实一直在眼前：codex **每一轮都往 stderr 打**
 * `codex_models_manager::cache: failed to load models cache`——
 * **它有模型缓存**，只是没写在 `--help` 里。
 *
 * > **「没有接口」与「我没找到接口」是两回事。**
 *
 * ## 两个 CLI 的实情不同
 *
 * - **codex**：`~/.codex/models_cache.json` 有完整清单，
 *   带 `visibility`（list / hide）与 `priority`（顺序）
 *   - **claude**：没有这样的文件；别名写在 `--help` 里（`fable`/`opus`/`sonnet`），
 *   所以仍然由配置声明
 */
import { describe, expect, it } from "vitest"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { discoverCliModels } from "../../../src/runtime/cli/models.js"

/** 照实测的形状造一份缓存 */
function codexHome(models: unknown): string {
  const home = mkdtempSync(join(tmpdir(), "dawn-codexhome-"))
  mkdirSync(join(home, ".codex"), { recursive: true })
  writeFileSync(
    join(home, ".codex", "models_cache.json"),
    JSON.stringify({ fetched_at: "x", etag: "y", client_version: "z", models }),
  )
  return home
}

const M = (slug: string, visibility: string, priority: number) => ({
  slug,
  display_name: slug.toUpperCase(),
  visibility,
  priority,
})

describe("codex：从它自己的缓存里发现", () => {
  it("读得出来", () => {
    const home = codexHome([M("gpt-5.6-sol", "list", 1), M("gpt-5.5", "list", 7)])
    expect(discoverCliModels("codex", home)).toEqual(["gpt-5.6-sol", "gpt-5.5"])
    rmSync(home, { recursive: true, force: true })
  })

  it("**`visibility: hide` 的不给** —— 那是内部模型（codex-auto-review 之类）", () => {
    const home = codexHome([
      M("gpt-5.6-sol", "list", 1),
      M("gpt-5.6-sol-wm", "hide", 1),
      M("codex-auto-review", "hide", 43),
    ])
    expect(discoverCliModels("codex", home)).toEqual(["gpt-5.6-sol"])
    rmSync(home, { recursive: true, force: true })
  })

  it("**按 priority 排** —— 它是 CLI 自己给的顺序，不该我们重排", () => {
    const home = codexHome([M("慢的", "list", 23), M("快的", "list", 1), M("中间", "list", 7)])
    expect(discoverCliModels("codex", home)).toEqual(["快的", "中间", "慢的"])
    rmSync(home, { recursive: true, force: true })
  })
})

describe("发现不了时**返回 undefined，不返回空数组**", () => {
  /**
   * 与整个项目同一条纪律：**缺省是「不知道」，空数组是「确认没有」**。
   * 前者让调用方退回配置声明，后者会被读成「这个 CLI 一个模型都没有」。
   */
  it("文件不存在 —— 不知道", () => {
    const home = mkdtempSync(join(tmpdir(), "dawn-nohome-"))
    expect(discoverCliModels("codex", home)).toBeUndefined()
    rmSync(home, { recursive: true, force: true })
  })

  it("文件坏了 —— 不知道，且不抛异常", () => {
    const home = mkdtempSync(join(tmpdir(), "dawn-badhome-"))
    mkdirSync(join(home, ".codex"), { recursive: true })
    writeFileSync(join(home, ".codex", "models_cache.json"), "这不是 JSON")
    expect(discoverCliModels("codex", home)).toBeUndefined()
    rmSync(home, { recursive: true, force: true })
  })

  it("**形状变了 —— 不知道**：这是个没有文档的内部文件，它会变", () => {
    const home = codexHome({ 换成了对象: true })
    expect(discoverCliModels("codex", home)).toBeUndefined()
    rmSync(home, { recursive: true, force: true })
  })

  it("一个 list 都没有 —— 不知道，而不是空清单", () => {
    const home = codexHome([M("x", "hide", 1)])
    expect(discoverCliModels("codex", home)).toBeUndefined()
    rmSync(home, { recursive: true, force: true })
  })

  it("**claude 没有可发现的来源** —— 它的别名写在 --help 里，只能靠配置", () => {
    expect(discoverCliModels("claude", codexHome([M("x", "list", 1)]))).toBeUndefined()
  })

  it("不认识的 CLI —— 不知道", () => {
    expect(discoverCliModels("某个别的", "/tmp")).toBeUndefined()
  })
})
