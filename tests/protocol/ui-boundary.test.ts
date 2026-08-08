/**
 * 依赖边界的强制检查（Task 2.13）。
 *
 * Rho 的原则是「UI 只依赖版本化协议，不依赖实现内部」。
 * **但原则不写成测试就会被绕过，尤其在赶工时**——加一行 import 比走协议快得多，
 * 而代价要到几个月后想换掉某个实现时才显现。
 *
 * 这条测试扫描源码文本，不依赖构建工具或 lint 插件。
 */
import { describe, expect, it } from "vitest"
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"

const UI_DIR = "src/ui"

/** UI 不得直接依赖的内部层 */
const FORBIDDEN = ["runtime/", "session/", "store/", "workbench/", "project/", "config/", "electron/"]

function walk(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) out.push(...walk(full))
    else if (/\.(ts|tsx)$/.test(name)) out.push(full)
  }
  return out
}

/** 抓出所有 import / export-from 的模块说明符 */
function specifiers(source: string): string[] {
  const out: string[] = []
  const re = /(?:^|\n)\s*(?:import|export)[\s\S]*?from\s*["']([^"']+)["']/g
  let m: RegExpExecArray | null
  while ((m = re.exec(source))) out.push(m[1]!)
  const bare = /(?:^|\n)\s*import\s*["']([^"']+)["']/g
  while ((m = bare.exec(source))) out.push(m[1]!)
  return out
}

describe("UI 依赖边界", () => {
  const files = walk(UI_DIR)

  it("扫描到了 UI 源文件（否则这条测试是空转的）", () => {
    expect(files.length).toBeGreaterThan(0)
  })

  it("src/ui/** 不得 import runtime / session / store / workbench 等内部层", () => {
    const violations: string[] = []
    for (const file of files) {
      for (const spec of specifiers(readFileSync(file, "utf8"))) {
        if (!spec.startsWith(".")) continue // 第三方包与 node: 内置不管
        if (spec.includes("protocol/")) continue // 协议是唯一允许的跨层依赖
        for (const bad of FORBIDDEN) {
          if (spec.includes(bad)) violations.push(`${file} → ${spec}`)
        }
      }
    }
    expect(violations, `UI 只能经 src/protocol 取数：\n${violations.join("\n")}`).toEqual([])
  })

  it("UI 对 src/protocol 的依赖确实存在 —— 否则说明它在用别的路子取数", () => {
    const all = files.flatMap((f) => specifiers(readFileSync(f, "utf8")))
    expect(all.some((s) => s.includes("protocol/"))).toBe(true)
  })

  it("反向自检：把一个违规 import 喂给检查器，它必须报出来", () => {
    // 防止检查器本身写错了却一直「全绿」——那是最坏的一种假通过
    const fake = `import { SessionStore } from "../store/sessions.js"\n`
    const found = specifiers(fake).filter((s) => FORBIDDEN.some((b) => s.includes(b)))
    expect(found).toEqual(["../store/sessions.js"])
  })
})
