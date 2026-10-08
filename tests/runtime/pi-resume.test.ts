/**
 * 续接读哪份 pi 记录（2026-09-29，普通对话选了文件夹之后上下文断掉）。
 *
 * 根因：pi 的 `continueRecent(cwd, 自己的目录)` 只认 header 里 `cwd` 等于**此刻**工作目录的记录；
 * `rehome` 把记录目录搬到新工作目录，header 里还是旧的临时目录 → 一份都对不上 → 悄悄新开一段。
 * 我们的记录目录是**一段对话一个**、跟着对话搬家，按 cwd 过滤没有要防的东西，只剩这个坑。
 */
import { afterEach, describe, expect, it } from "vitest"
import { mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { SessionManager } from "@earendil-works/pi-coding-agent"
import { 读最后模型切换, 续接哪份, 续接或新建 } from "../../src/runtime/pi-resume.js"
import { pi记录目录 } from "../../src/runtime/pi-record.js"
import { 写一段pi记录 } from "../helpers/pi-record.js"

const dirs: string[] = []
const 新目录 = () => {
  const d = mkdtempSync(join(tmpdir(), "dawn-piresume-"))
  dirs.push(d)
  return d
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

const 说过的 = (sm: SessionManager) =>
  sm.getBranch().flatMap((e) => {
    if (e.type !== "message") return []
    const c = (e.message as { content: unknown }).content
    return [typeof c === "string" ? c : (c as { type: string; text?: string }[]).map((b) => b.text ?? "").join("")]
  })

describe("续接 · 搬过家的对话接得上", () => {
  it("header 里是旧工作目录（rehome 之前）：照样续上这一份、上下文都在", () => {
    const d = 新目录()
    const 记录 = 写一段pi记录(d, [{ who: "user", text: "先聊一句" }, { who: "agent", text: "好的" }], { cwd: "/tmp/普通对话" })
    // 对照 pi 自己：它按 cwd 过滤，于是新开一段——这就是 bug
    expect(SessionManager.continueRecent("/proj/新项目", pi记录目录(d)).getSessionFile()).not.toBe(记录)

    const sm = 续接或新建("/proj/新项目", pi记录目录(d))
    expect(sm.getSessionFile()).toBe(记录)
    expect(说过的(sm)).toEqual(["先聊一句", "好的"])
    expect(sm.getCwd(), "此刻在哪干活按新目录").toBe("/proj/新项目")
  })

  it("挑 mtime 最新、header 读得出的那份；不是会话记录的跳过", () => {
    const d = 新目录()
    const 旧 = 写一段pi记录(d, [{ who: "user", text: "旧" }, { who: "agent", text: "旧" }], { cwd: "/a" })
    const 新 = 写一段pi记录(d, [{ who: "user", text: "新" }, { who: "agent", text: "新" }], { cwd: "/b" })
    utimesSync(旧, new Date("2026-08-01"), new Date("2026-08-01"))
    utimesSync(新, new Date("2026-09-01"), new Date("2026-09-01"))
    const 坏 = join(pi记录目录(d), "坏.jsonl")
    writeFileSync(坏, "不是 JSON\n")
    utimesSync(坏, new Date("2026-09-20"), new Date("2026-09-20"))
    writeFileSync(join(pi记录目录(d), "zzz.txt"), "不是记录")
    expect(续接哪份(pi记录目录(d))).toBe(新)
  })

  it("分叉时沿用当前分支最后一次显式切换的模型", () => {
    const d = 新目录()
    const path = 写一段pi记录(d, [{ who: "user", text: "先聊一句" }, { who: "agent", text: "好的" }], { cwd: "/a" })
    const sm = SessionManager.open(path)
    sm.appendModelChange("openai", "gpt-test")
    expect(读最后模型切换(path)).toEqual({ provider: "openai", model: "gpt-test" })
  })

  it("没有显式切换记录时，沿用最近一条模型回复的实际 provider/model", () => {
    const d = 新目录()
    const path = 写一段pi记录(d, [{ who: "user", text: "先聊一句" }, { who: "agent", text: "好的" }], { cwd: "/a" })
    SessionManager.open(path).appendMessage({
      role: "assistant",
      content: [{ type: "text", text: "实际模型回答" }],
      provider: "openai",
      model: "gpt-test",
      stopReason: "stop",
    } as never)
    expect(读最后模型切换(path)).toEqual({ provider: "openai", model: "gpt-test" })
  })

  it("没有目录 / 没有记录 → 新开一段（不抛）", () => {
    const d = 新目录()
    expect(续接哪份(pi记录目录(d))).toBeUndefined()
    const sm = 续接或新建("/w", pi记录目录(d))
    expect(说过的(sm)).toEqual([])
  })
})
