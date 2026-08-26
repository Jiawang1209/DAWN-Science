/**
 * 文件系统探针（2026-08-26）。
 *
 * 临时会话住在 `~/DAWN/scratch/<ts>/`，不是 git 仓库；用户自己的目录也常常不是。
 * 此前探针在这两处一律「不知道」，作者第一次真用就撞上满屏「本轮产出未知」。
 * 没有 git 时，前后各扫一遍工作区，按 inode / mtime / size 对比——这是观察，不是转述。
 */
import { describe, expect, it } from "vitest"
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync, utimesSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fsSnapshot, fsDiff, FS_SKIP_DIRS, FS_SNAPSHOT_CAP } from "../../src/project/fs-facts.js"

function dir(): string {
  return mkdtempSync(join(tmpdir(), "dawn-fs-"))
}

describe("fsSnapshot", () => {
  it("跳过 .git / .dawn / node_modules / 虚拟环境与符号链接，只记文件", () => {
    const d = dir()
    writeFileSync(join(d, "a.txt"), "a")
    for (const skip of [".git", ".dawn", "node_modules", ".venv-py311"]) {
      mkdirSync(join(d, skip))
      writeFileSync(join(d, skip, "x"), "x")
    }
    mkdirSync(join(d, "sub"))
    writeFileSync(join(d, "sub", "b.txt"), "b")
    symlinkSync(join(d, "a.txt"), join(d, "link.txt"))
    symlinkSync(join(d, "sub"), join(d, "linkdir"))
    const s = fsSnapshot(d)
    expect(s).toBeDefined()
    expect([...s!.keys()].sort()).toEqual(["a.txt", "sub/b.txt"])
    expect(FS_SKIP_DIRS.has(".git")).toBe(true)
    expect(FS_SNAPSHOT_CAP).toBe(20_000)
    rmSync(d, { recursive: true, force: true })
  })

  it("**超过上限返回 undefined**（= 不知道），不许截断后装作知道", () => {
    const d = dir()
    for (let i = 0; i < 5; i++) writeFileSync(join(d, `f${i}.txt`), "x")
    expect(fsSnapshot(d, 3)).toBeUndefined()
    expect(fsSnapshot(d, 5)).toBeDefined()
    rmSync(d, { recursive: true, force: true })
  })

  it("嵌套路径用 `/` 分隔（相对工作区）", () => {
    const d = dir()
    mkdirSync(join(d, "outputs", "figs"), { recursive: true })
    writeFileSync(join(d, "outputs", "figs", "v.png"), "png")
    const s = fsSnapshot(d)!
    expect([...s.keys()]).toEqual(["outputs/figs/v.png"])
    expect(s.get("outputs/figs/v.png")?.size).toBe(3)
    rmSync(d, { recursive: true, force: true })
  })
})

describe("fsDiff", () => {
  it("新建 → created+written；改内容 → 只 written；没动 → 都不；删了 → 都不", () => {
    const d = dir()
    writeFileSync(join(d, "keep.txt"), "k")
    writeFileSync(join(d, "mod.txt"), "before")
    writeFileSync(join(d, "gone.txt"), "g")
    const before = fsSnapshot(d)!
    writeFileSync(join(d, "new.txt"), "n")
    writeFileSync(join(d, "mod.txt"), "after!!")
    rmSync(join(d, "gone.txt"))
    const after = fsSnapshot(d)!
    const r = fsDiff(before, after)
    expect(r.created).toEqual(["new.txt"])
    expect(r.written).toEqual(["mod.txt", "new.txt"])
    rmSync(d, { recursive: true, force: true })
  })

  it("同样大小、只有 mtime 变了也算 written", () => {
    const d = dir()
    writeFileSync(join(d, "t.txt"), "abc")
    utimesSync(join(d, "t.txt"), new Date(1_000_000_000_000), new Date(1_000_000_000_000))
    const before = fsSnapshot(d)!
    utimesSync(join(d, "t.txt"), new Date(1_500_000_000_000), new Date(1_500_000_000_000))
    const after = fsSnapshot(d)!
    expect(fsDiff(before, after).written).toEqual(["t.txt"])
    rmSync(d, { recursive: true, force: true })
  })
})
