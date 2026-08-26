/**
 * `并进登记新建`（2026-08-26，spec `2026-08-26-产物` §2）。
 *
 * 产物登记按 inode 身份记的「此前不存在、现在有」，与探针从 git/声明路径算出来的
 * facts 是两个互补的事实来源：git 看不见被忽略的文件，登记看不见没声明路径的
 * （bash 里的 `cp`）。这个纯函数负责把前者并进后者。
 */
import { describe, expect, it } from "vitest"
import { 并进登记新建 } from "../../src/runtime/provenance.js"

const base = { filesWritten: ["a.txt"], filesRead: [], mayIncludeUserEdits: true, filesCreated: [] }

describe("并进登记新建", () => {
  it("登记到的绝对路径换成相对路径，同时进 written 与 created", () => {
    const r = 并进登记新建(base, ["/w/outputs/x.png"], "/w")
    expect(r.filesCreated).toEqual(["outputs/x.png"])
    expect(r.filesWritten).toEqual(["a.txt", "outputs/x.png"])
  })

  it("工作区外的登记不进来", () => {
    expect(并进登记新建(base, ["/elsewhere/y"], "/w").filesCreated).toEqual([])
  })

  it("去重", () => {
    const r = 并进登记新建({ ...base, filesCreated: ["outputs/x.png"] }, ["/w/outputs/x.png"], "/w")
    expect(r.filesCreated).toEqual(["outputs/x.png"])
  })
})
