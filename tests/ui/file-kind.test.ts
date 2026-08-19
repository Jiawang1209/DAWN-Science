/**
 * 文件树里一行配哪个图标（2026-08-20）。只看名字，纯函数。
 */
import { describe, expect, it } from "vitest"
import { 文件类按名字 } from "../../src/ui/file-kind.js"

describe("文件类按名字", () => {
  it("目录永远是 dir，不管叫什么", () => {
    expect(文件类按名字("notes.md", "dir")).toBe("dir")
  })
  it.each([
    ["README.md", "markdown"],
    ["analysis.Rmd", "markdown"],
    ["notes.txt", "text"],
    ["run.log", "text"],
    ["data.csv", "table"],
    ["table.xlsx", "table"],
    ["result.parquet", "table"],
    ["fig3.png", "image"],
    ["plot.SVG", "image"],
    ["paper.pdf", "pdf"],
    ["train.py", "code"],
    ["model.R", "code"],
    ["config.yaml", "code"],
    ["run.sh", "shell"],
    ["Makefile", "shell"],
    [".bashrc", "shell"],
    ["explore.ipynb", "notebook"],
    ["data.tar.gz", "archive"],
    ["raw.zip", "archive"],
    ["aquota.user", "other"],
    ["noext", "other"],
  ] as const)("%s → %s", (名, 类) => {
    expect(文件类按名字(名, "file")).toBe(类)
  })
  it("**多段后缀取最后一段**；以点开头只有一个点的没有后缀", () => {
    expect(文件类按名字("a.b.c.csv", "file")).toBe("table")
    expect(文件类按名字(".hidden", "file")).toBe("other")
  })
})
