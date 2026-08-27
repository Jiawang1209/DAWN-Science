/**
 * 首启一次性迁移旧数据目录（2026-08-27，打包 spec §4）。
 *
 * 用 `electron dist/electron/main.js` 跑时 `userData` 叫 `Electron/`；打包后叫 `DAWN Science/`。
 * 作者机器上所有会话、配置、凭证都在旧目录——第一次打开打包版发现一片空白，等于把人的东西弄丢了。
 *
 * **拷，不移**：旧目录留着，出了岔子还能回去用开发版。**新目录已有 `dawn.db` 就什么都不做**——
 * 只迁一次，之后两边各走各的。
 */
import { cpSync, existsSync } from "node:fs"
import { join } from "node:path"

/** 要带过去的东西：数据库三件、provider 配置、凭证、模型目录、每台内核的隔离目录 */
export const 迁移清单 = ["dawn.db", "dawn.db-wal", "dawn.db-shm", "providers.yaml", "credentials.json", "models.generated.json", "kernels"] as const

export interface 迁移结果 {
  做了: boolean
  拷了: string[]
  原因?: "新目录已有数据库" | "旧目录没有数据库"
}

export function 迁旧数据(旧: string, 新: string): 迁移结果 {
  if (existsSync(join(新, "dawn.db"))) return { 做了: false, 拷了: [], 原因: "新目录已有数据库" }
  if (!existsSync(join(旧, "dawn.db"))) return { 做了: false, 拷了: [], 原因: "旧目录没有数据库" }
  const 拷了: string[] = []
  for (const 名 of 迁移清单) {
    const 从 = join(旧, 名)
    if (!existsSync(从)) continue
    cpSync(从, join(新, 名), { recursive: true })
    拷了.push(名)
  }
  return { 做了: true, 拷了 }
}
