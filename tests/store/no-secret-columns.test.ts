/**
 * **库里不许有口令列**（②-B · R4）。
 *
 * 这是一条可判定的规则，所以它配一个扫描测试，而不是靠记性——
 * 准入规则 2：*「能判定的设计规则，配一个扫描测试。」*
 *
 * ## 它不是洁癖
 *
 * `models.json` 那次就是把 API key 写进了明文文件。**明文落盘的密钥等于没有密钥**：
 * 它会跟着数据库进备份、进云同步、进「把库发给我看看」的那次求助。
 * 秘密只住在系统钥匙串里，库里最多知道「配过没有」。
 *
 * ## 为什么扫的是整个 schema，不只是那张新表
 *
 * 今天只有 `remote_connections` 想放口令。**这条规则要管的是明天那张表。**
 * 扫全库的成本是零，而只盯一张表的话，下一个人加 `git_tokens` 时不会有人红。
 */
import { describe, expect, it } from "vitest"
import Database from "better-sqlite3"
import { migrate } from "../../src/store/schema.js"

/**
 * 看着像秘密的列名。
 *
 * ## 两条把规则**收紧**的判据，不是两个豁免
 *
 * 第一版写完就误报了两条，而**一条会误报的规则，很快就会被人加豁免，
 * 然后豁免会长大**。所以不加豁免，改成把规则说准：
 *
 * 1. **`*_path` 整类不算**。路径不是秘密，而且它**必须回显**——
 *    看不见自己配了什么等于没配（与两个解释器路径同一条理由）。
 *    真正不许存的是私钥的**内容**，下面单独有一条盯着。
 * 2. **按词段匹配，不按子串**。`cost_input_tokens` 里的 `tokens` 是**计数**，
 *    不是令牌。`token` 后面跟着 `s` 就不该算——
 *    代价是一张叫 `access_tokens` 的表逃得掉，那时得靠人；
 *    但那比「每次跑都红两条、然后大家学会忽略它」强得多。
 */
const 像秘密的 = [
  "password",
  "passwd",
  "secret",
  "token",
  "credential",
  "passphrase",
  "private_key",
  "api_?key",
]

/** 词段匹配：`api_key` / `apikey` / `user_password` 中；`cost_input_tokens` 不中 */
const 命中 = (列: string): boolean =>
  // 路径不是秘密（判据 1）
  !/_path$/.test(列) &&
  像秘密的.some((k) => new RegExp(`(^|_)${k}(_|$)`).test(列))

describe("库里不许有口令列", () => {
  const db = new Database(":memory:")
  migrate(db)

  const 表 = (
    db.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all() as { name: string }[]
  ).map((r) => r.name)

  it("扫到了表，不是空跑一场", () => {
    // **空集合会让这条测试永远绿。** 先确认它真的看到了东西
    expect(表).toContain("remote_connections")
    expect(表.length).toBeGreaterThan(5)
  })

  for (const t of 表) {
    it(`${t} 没有秘密列`, () => {
      const 列 = (db.prepare(`PRAGMA table_info(${t})`).all() as { name: string }[]).map((c) =>
        c.name.toLowerCase(),
      )
      const 撞上的 = 列.filter(命中)
      // 撞上时把列名写出来：一条只说「有秘密列」的失败，人还得自己去找
      expect(撞上的, `${t} 上这些列看起来在存秘密：${撞上的.join("、")}`).toEqual([])
    })
  }

  it("**私钥路径不算秘密**，它必须存得下 —— 看不见自己配了什么等于没配", () => {
    const 列 = (
      db.prepare(`PRAGMA table_info(remote_connections)`).all() as { name: string }[]
    ).map((c) => c.name)
    expect(列).toContain("private_key_path")
    // 但**内容**不许存：只有路径
    expect(列).not.toContain("private_key")
  })
})

/**
 * **这条规则自己也要被验一次。**
 *
 * 一条永远绿的扫描测试等于没有测试——而「永远绿」恰恰是它最可能的坏法：
 * 正则写错一个字符，它就再也抓不到任何东西，且**不会有任何症状**。
 */
describe("这条规则真的会红", () => {
  it("抓得住", () => {
    for (const 列 of ["password", "api_key", "apikey", "ssh_secret", "auth_token", "private_key"]) {
      expect(命中(列), `${列} 该被抓住`).toBe(true)
    }
  })

  it("不误伤", () => {
    for (const 列 of [
      "private_key_path", // 路径不是秘密，而且必须回显
      "cost_input_tokens", // 计数，不是令牌
      "key", // settings 表的主键，装的是设置项的名字
      "keychain_backed", // 「有没有进钥匙串」是事实，不是秘密
    ]) {
      expect(命中(列), `${列} 不该被抓`).toBe(false)
    }
  })
})
