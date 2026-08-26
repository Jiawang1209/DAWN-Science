/**
 * 工作区路径守卫（2026-08-26，审查 D）：三处判「越界」的口径合成一份。
 * 要害是 `..foo` 这种名字——它是合法文件名，不是越界。
 */
import { describe, expect, it } from "vitest"
import { sep } from "node:path"
import { 工作区内相对路径 } from "../../src/files/paths.js"

const ws = sep === "/" ? "/w/proj" : "C:\\w\\proj"

describe("工作区内相对路径", () => {
  it("相对路径原样归一；绝对路径落在工作区里的换成相对", () => {
    expect(工作区内相对路径(ws, "outputs/a.csv")).toBe(["outputs", "a.csv"].join(sep))
    expect(工作区内相对路径(ws, "./outputs/a.csv")).toBe(["outputs", "a.csv"].join(sep))
    expect(工作区内相对路径(ws, [ws, "out", "x.txt"].join(sep))).toBe(["out", "x.txt"].join(sep))
  })
  it("恰好 `..` 与 `../…` 是越界；工作区自身（空相对路径）也不算", () => {
    expect(工作区内相对路径(ws, "..")).toBeUndefined()
    expect(工作区内相对路径(ws, "../sibling/a.csv")).toBeUndefined()
    expect(工作区内相对路径(ws, "outputs/../../a.csv")).toBeUndefined()
    expect(工作区内相对路径(ws, ".")).toBeUndefined()
  })
  it("`..foo` 是个合法名字，不是越界", () => {
    expect(工作区内相对路径(ws, "..foo")).toBe("..foo")
    expect(工作区内相对路径(ws, "..foo/bar.csv")).toBe(["..foo", "bar.csv"].join(sep))
  })
  it("换算之后仍是绝对路径的（别的根）→ 越界", () => {
    expect(工作区内相对路径(ws, sep === "/" ? "/elsewhere/a.csv" : "D:\\x\\a.csv")).toBeUndefined()
  })
})
