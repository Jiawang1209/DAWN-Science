import { describe, expect, it, vi } from "vitest"
import { mkdtempSync, mkdirSync, realpathSync, rmSync, symlinkSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { acquireDatabaseInstance } from "../../src/electron/single-instance.js"

describe("数据库单实例", () => {
  it("同一真实数据库路径共用锁，恢复业务 userData；不同数据库不互斥", () => {
    const dir = mkdtempSync(join(tmpdir(), "dawn-lock-test-"))
    try {
      mkdirSync(join(dir, "data"))
      symlinkSync(join(dir, "data"), join(dir, "alias"), "dir")
      let userData = join(dir, "profile")
      const paths: string[] = []
      const port = {
        getPath: (name: "userData" | "appData") => name === "userData" ? userData : dir,
        setPath: (_name: "userData", value: string) => { userData = value },
        requestSingleInstanceLock: vi.fn(() => { paths.push(userData); return true }),
      }
      expect(acquireDatabaseInstance(port, join(dir, "data", "db"))).toBe(true)
      expect(userData).toBe(join(dir, "profile"))
      acquireDatabaseInstance(port, join(dir, "alias", "db"))
      acquireDatabaseInstance(port, join(dir, "data", "other"))
      expect(paths[0]).toBe(paths[1])
      expect(paths[0]).not.toBe(paths[2])
      expect(realpathSync(paths[0]!)).toContain("dawn-science-locks")
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })

  it("锁失败仍还原 userData", () => {
    let userData = "/original"
    const port = {
      getPath: (name: "userData" | "appData") => name === "userData" ? userData : tmpdir(),
      setPath: (_name: "userData", value: string) => { userData = value },
      requestSingleInstanceLock: () => false,
    }
    expect(acquireDatabaseInstance(port, "/tmp/isolated-dawn-test.db")).toBe(false)
    expect(userData).toBe("/original")
  })
})
