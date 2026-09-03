/**
 * `ConnectionStore` 的解释器路径读写（远程内核，2026-09-03）。
 *
 * 增删改查那五条已经有 `tests/workbench/connections.test.ts` 走 backend 盯着；
 * 这份文件只盯 store 这一层新加的东西——每台服务器各配一份解释器路径，
 * 且 `update()` 故意不碰这两列（它改的是连接信息，解释器另有入口）。
 */
import { describe, expect, it } from "vitest"
import Database from "better-sqlite3"
import { migrate } from "../../src/store/schema.js"
import { ConnectionStore, type ConnectionRecord } from "../../src/store/connections.js"

function 造一条(): ConnectionRecord {
  return {
    id: "conn-test-1",
    label: "测试服务器",
    host: "h.example",
    port: 22,
    username: "u",
    sortOrder: 1,
    createdAt: new Date().toISOString(),
  }
}

describe("ConnectionStore · 解释器路径", () => {
  it("每台服务器各配一份解释器路径；不配的不给字段；传 null 清除（远程内核）", () => {
    const db = new Database(":memory:")
    migrate(db)
    const store = new ConnectionStore(db)
    const rec = 造一条()
    store.insert(rec)
    expect(store.get(rec.id)?.interpreters).toBeUndefined()
    store.setInterpreter(rec.id, "python", "/opt/conda/bin/python")
    expect(store.get(rec.id)?.interpreters).toEqual({ python: "/opt/conda/bin/python" })
    store.setInterpreter(rec.id, "R", "/usr/bin/R")
    expect(store.get(rec.id)?.interpreters).toEqual({ python: "/opt/conda/bin/python", r: "/usr/bin/R" })
    store.setInterpreter(rec.id, "python", null)
    expect(store.get(rec.id)?.interpreters).toEqual({ r: "/usr/bin/R" })
    // update() 不动这两列——它更新的是连接信息，解释器另有入口
    store.update({ ...rec, label: "改名" })
    expect(store.get(rec.id)?.interpreters).toEqual({ r: "/usr/bin/R" })
    expect(() => store.setInterpreter("没有这台", "python", "/x")).toThrow(/没有这台服务器/)
  })
})
