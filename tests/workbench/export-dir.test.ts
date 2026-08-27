import { describe, expect, it } from "vitest"
import { 导出目录 } from "../../src/workbench/export-dir.js"

describe("导出目录（2026-08-27 作者定的）", () => {
  const 基 = { workspace: "/w/proj", temporary: false, remote: false, downloadDir: "/dl" }
  it("项目会话 → <项目>/docs", () => expect(导出目录(基)).toBe("/w/proj/docs"))
  it("普通会话（临时项目）→ 下载路径", () => expect(导出目录({ ...基, temporary: true })).toBe("/dl"))
  it("远端会话 → 下载路径（docs/ 不往服务器写）", () => expect(导出目录({ ...基, remote: true })).toBe("/dl"))
  it("显式 dir 优先", () => expect(导出目录({ ...基, dir: "/x" })).toBe("/x"))
})
