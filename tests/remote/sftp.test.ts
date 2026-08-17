/**
 * 远端文件那一层（`feat/远端文件` · 批 0，2026-08-17）。
 *
 * ## 为什么这一批第一件事是「让它跑起来」
 *
 * `RemoteExecutor` 上的 `readFile` / `writeFile` / `readdir` 是 ②-B 时写下的，
 * **到今天一个调用点都没有**——从没跑过。而假 SSH 那边的 `attrs` 是个字面量
 * `{ mode, size }`，**没有 `isDirectory()`**，`readdir` 却正在调它：
 * **这条路一跑就抛 TypeError**。没人发现，因为没人跑过。
 *
 * 开工前我还说过「传输这一层基本是现成的」。**写下来的代码不等于跑过的代码**——
 * 这条在本项目已经是第三次了（419 个测试全绿却点不动、
 * 1647 个测试全绿而菜单没有底板）。
 *
 * ## 假的只有「另一端是谁」
 *
 * 这些用例全部从 `RemoteExecutor` 打进去，所以 part 文件、原子改名、
 * 取消清理这些**要紧的逻辑走的仍是真代码**。
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { mkdtempSync, readdirSync, rmSync, writeFileSync, readFileSync, existsSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { RemoteExecutor } from "../../src/remote/ssh.js"
import { 假口令, 假家目录, 造一台假服务器, 重置假机器 } from "../../src/remote/fake-ssh.js"

const 起 = () =>
  new RemoteExecutor({
    config: { host: "h", username: "u", password: 假口令 },
    createClient: 造一台假服务器,
  })

let 临时: string
beforeEach(() => {
  重置假机器()
  临时 = mkdtempSync(join(tmpdir(), "dawn-sftp-"))
})
afterEach(() => {
  rmSync(临时, { recursive: true, force: true })
})

async function 连上() {
  const r = 起()
  await r.connect()
  return r
}

describe("列目录", () => {
  /**
   * **这条就是「让它真的跑起来」那一条。**
   * 修之前它抛 `attrs.isDirectory is not a function`。
   */
  it("目录与文件分得开", async () => {
    const r = await 连上()
    const 条目 = await r.readdir(`${假家目录}/数据`)
    const 表 = new Map(条目.map((e) => [e.name, e]))
    expect(表.get("样本.csv")?.directory, "文件被当成了目录").toBe(false)
    expect(表.get("大文件.bin")?.size).toBe(4096)
    r.close()
  })

  it("子目录报成目录，且不报大小", async () => {
    const r = await 连上()
    const 条目 = await r.readdir(假家目录)
    const 数据 = 条目.find((e) => e.name === "数据")
    expect(数据?.directory, "目录没被认出来").toBe(true)
    r.close()
  })

  it("**目录不存在要响亮失败**，不是回一个空列表", async () => {
    const r = await 连上()
    await expect(r.readdir(`${假家目录}/没有这个`)).rejects.toThrow()
    r.close()
  })
})

describe("stat", () => {
  it("认得出目录，也给得出大小", async () => {
    const r = await 连上()
    expect((await r.stat(`${假家目录}/数据`)).directory).toBe(true)
    expect((await r.stat(`${假家目录}/数据/大文件.bin`)).size).toBe(4096)
    r.close()
  })
})

describe("下载", () => {
  it("内容一字不差", async () => {
    const r = await 连上()
    const 到 = join(临时, "样本.csv")
    await r.download(`${假家目录}/数据/样本.csv`, 到)
    expect(readFileSync(到, "utf8")).toBe("id,值\n1,3.14\n2,2.72\n")
    r.close()
  })

  /**
   * **进度要报不止一次。** 只在结尾报一次的话，进度条会从 0 直接跳到 100，
   * 而那与「卡住了」在屏幕上长得一模一样。
   */
  it("进度报了不止一次，而且最后一次等于总大小", async () => {
    const r = await 连上()
    const 报的: number[] = []
    let 总共 = 0
    await r.download(`${假家目录}/数据/大文件.bin`, join(临时, "大.bin"), {
      进度: (已传, 总) => {
        报的.push(已传)
        总共 = 总 ?? 0
      },
    })
    expect(报的.length, "进度只报了一次，进度条会从 0 跳到 100").toBeGreaterThan(1)
    expect(报的.at(-1)).toBe(4096)
    expect(总共).toBe(4096)
    r.close()
  })

  /**
   * **取消之后那半个文件必须消失。**
   *
   * 留着的话，下载目录里躺着一个半截文件，**它跟完整的那个长得一模一样**——
   * 哪天拿它去跑分析都不会发现。
   */
  it("取消：既不留成品，**也不留 part 文件**", async () => {
    const r = await 连上()
    const ac = new AbortController()
    const 到 = join(临时, "大.bin")
    const p = r.download(`${假家目录}/数据/大文件.bin`, 到, {
      signal: ac.signal,
      // 传到一半就掐
      进度: (已传) => {
        if (已传 >= 512) ac.abort()
      },
    })
    await expect(p).rejects.toThrow()
    expect(existsSync(到), "取消了却留下了成品").toBe(false)
    expect(readdirSync(临时), "取消了却留下了半截的 part 文件").toEqual([])
    r.close()
  })

  it("远端没这个文件时，本地不留任何东西", async () => {
    const r = await 连上()
    await expect(r.download(`${假家目录}/不存在`, join(临时, "x"))).rejects.toThrow()
    expect(readdirSync(临时)).toEqual([])
    r.close()
  })
})

describe("上传", () => {
  it("传上去，内容一字不差", async () => {
    const r = await 连上()
    const 从 = join(临时, "新的.txt")
    writeFileSync(从, "上传的内容\n")
    await r.upload(从, `${假家目录}/新的.txt`)
    expect((await r.readFile(`${假家目录}/新的.txt`)).toString()).toBe("上传的内容\n")
    r.close()
  })

  /**
   * **服务器上也不许留半截文件。** 别人的机器上留垃圾比自己机器上更糟——
   * 你未必会回去清。
   */
  it("取消：服务器上不留 part 文件", async () => {
    const r = await 连上()
    const 从 = join(临时, "大的.bin")
    writeFileSync(从, "y".repeat(4096))
    const ac = new AbortController()
    await expect(
      r.upload(从, `${假家目录}/大的.bin`, {
        signal: ac.signal,
        进度: (已传) => {
          if (已传 >= 512) ac.abort()
        },
      }),
    ).rejects.toThrow()
    const 剩下的 = (await r.readdir(假家目录)).map((e) => e.name)
    expect(剩下的.some((n) => n.includes("dawn-part")), "服务器上留下了 part 文件").toBe(false)
    expect(剩下的).not.toContain("大的.bin")
    r.close()
  })

  /**
   * **SFTP v3 的 `rename` 在目标已存在时会失败**，不是 POSIX 那种覆盖。
   * 所以「覆盖」得先 `unlink` 再改名——不写这一段的话，
   * 覆盖一个已有文件在真服务器上必然失败。
   */
  it("目标已存在：不给 `覆盖` 就失败，给了就成", async () => {
    const r = await 连上()
    const 从 = join(临时, "样本.csv")
    writeFileSync(从, "新内容\n")
    const 目标 = `${假家目录}/数据/样本.csv`
    await expect(r.upload(从, 目标)).rejects.toThrow()
    // 失败之后也不许留 part
    expect((await r.readdir(`${假家目录}/数据`)).some((e) => e.name.includes("dawn-part"))).toBe(false)

    await r.upload(从, 目标, { 覆盖: true })
    expect((await r.readFile(目标)).toString()).toBe("新内容\n")
    r.close()
  })

  /**
   * **「权限不够」要说得出是权限不够。** 一句笼统的「上传失败」
   * 会让人去查网络、查路径、查磁盘，就是想不到是权限。
   */
  it("只读目录：报的是权限", async () => {
    const r = await 连上()
    const 从 = join(临时, "x.txt")
    writeFileSync(从, "x")
    await expect(r.upload(从, `${假家目录}/只读/x.txt`)).rejects.toThrow(/Permission denied/)
    r.close()
  })
})

describe("删除", () => {
  it("删掉之后列目录里就没有了", async () => {
    const r = await 连上()
    await r.unlink(`${假家目录}/读我.md`)
    expect((await r.readdir(假家目录)).map((e) => e.name)).not.toContain("读我.md")
    r.close()
  })

  it("删一个不存在的要响亮失败", async () => {
    const r = await 连上()
    await expect(r.unlink(`${假家目录}/没有这个`)).rejects.toThrow()
    r.close()
  })

  it("只读目录里的删不掉，报的是权限", async () => {
    const r = await 连上()
    await expect(r.unlink(`${假家目录}/只读/别动我.txt`)).rejects.toThrow(/Permission denied/)
    r.close()
  })

  /**
   * **`rmdir` 只删空目录**——真 SFTP 就是这样。
   * 递归删除是调用方的事，这一层不替它决定（批 5 再做）。
   */
  it("非空目录 `rmdir` 删不动", async () => {
    const r = await 连上()
    await expect(r.rmdir(`${假家目录}/数据`)).rejects.toThrow(/not empty/i)
    r.close()
  })
})

describe("测试之间不许互相渗透", () => {
  /**
   * 那张假文件表是**模块级**的。不重置的话，上一条用例传上去的文件会漏给下一条——
   * `FAKE_ACP_*` 那张手打清单已经用同一个形状咬过我两次，
   * 而且第二次更难查：被泄漏的用例**单独跑是绿的**。
   */
  it("上一条传上去的文件，这一条看不见", async () => {
    const r = await 连上()
    expect((await r.readdir(假家目录)).map((e) => e.name)).not.toContain("新的.txt")
    r.close()
  })
})
