import { createHash } from "node:crypto"
import { mkdirSync, realpathSync } from "node:fs"
import { basename, dirname, join, resolve } from "node:path"

interface InstanceApp {
  getPath(name: "userData" | "appData"): string
  setPath(name: "userData", path: string): void
  requestSingleInstanceLock(): boolean
}

/** 锁按真实 DB 路径隔离；Chromium 单实例对象在请求时捕获路径，业务 userData 原样还原。 */
export function acquireDatabaseInstance(app: InstanceApp, database: string): boolean {
  let path = resolve(database)
  const rest: string[] = []
  // 新数据库尚未创建时，先规范化已有的父目录，避免符号链接路径绕过锁。
  for (;;) {
    try { path = join(realpathSync(path), ...rest); break } catch {
      const parent = dirname(path)
      if (parent === path) throw new Error("数据库路径无法确定")
      rest.unshift(basename(path)); path = parent
    }
  }
  const key = createHash("sha256").update(path).digest("hex")
  const profile = join(app.getPath("appData"), "dawn-science-locks", key)
  mkdirSync(profile, { recursive: true })
  const userData = app.getPath("userData")
  try {
    app.setPath("userData", profile)
    return app.requestSingleInstanceLock()
  } finally { app.setPath("userData", userData) }
}
