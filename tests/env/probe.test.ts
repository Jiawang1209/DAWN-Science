/**
 * 机器环境探测：脚本、解析、真链路（②-B · R5，2026-08-13）。
 *
 * 解析这一层的用例全部**故意把 MOTD 掺进去**。Spike F 的实测结论是
 * 横幅与我们的输出**交错到达**，不是「先横幅后正文」——
 * 所以「跳过前几行」那种解析法在真机上会随机地对或错，
 * 而**一个假「通过」比一个失败危险**。
 */
import { describe, expect, it } from "vitest"
import { 探测脚本, 解析探测, 探测机器, 本地执行 } from "../../src/env/probe.js"

/** 一段像真的 MOTD。**掺在输出中间**，不是开头 */
const 横幅 = [
  "Welcome to Ubuntu 24.04.1 LTS (GNU/Linux 6.8.0-45-generic x86_64)",
  " * Documentation:  https://help.ubuntu.com",
  "Last login: Wed Aug 13 09:00:00 2026 from 10.0.0.2",
].join("\n")

const 正常输出 = [
  "dawn_os=Linux",
  "dawn_osrelease=6.8.0-45-generic",
  "dawn_arch=x86_64",
  "dawn_distro=Ubuntu 24.04.1 LTS",
  "dawn_cpus=8",
  "dawn_memkib=16305432",
  "dawn_tool_python3_path=/usr/bin/python3",
  "dawn_tool_python3_ver=Python 3.12.3",
  "dawn_tool_r_path=",
  "dawn_tool_r_ver=",
  "dawn_tool_git_path=/usr/bin/git",
  "dawn_tool_git_ver=git version 2.43.0",
].join("\n")

/** 把横幅塞进正文中间——这才是真机上的样子 */
function 掺横幅(正文: string): string {
  const 行 = 正文.split("\n")
  const 半 = Math.floor(行.length / 2)
  return [...行.slice(0, 半), 横幅, ...行.slice(半)].join("\n")
}

describe("R5 · 解析（MOTD 掺在中间）", () => {
  it("该取到的都取到了", () => {
    const s = 解析探测(掺横幅(正常输出), { connectionId: "c1" }, "/home/u/proj")
    expect(s.os).toBe("Linux")
    expect(s.osRelease).toBe("6.8.0-45-generic")
    expect(s.arch).toBe("x86_64")
    expect(s.distro).toBe("Ubuntu 24.04.1 LTS")
    expect(s.cpus).toBe(8)
    expect(s.memoryKib).toBe(16_305_432)
  })

  /**
   * **`dawn_os` 不许吃掉 `dawn_osrelease`。**
   * 键前缀相互包含时，一个偷懒的正则会让前一个字段吞掉后一个的值——
   * 那种错不会报错，只会让快照里躺着一个看起来合理的错值。
   */
  it("前缀相互包含的键不串味", () => {
    const s = 解析探测("dawn_osrelease=6.8.0\ndawn_os=Linux", "local")
    expect(s.os).toBe("Linux")
    expect(s.osRelease).toBe("6.8.0")
  })

  it("横幅里的字不会被当成值 —— 它没有我们的键名", () => {
    const s = 解析探测(横幅, "local")
    expect(s.os).toBeUndefined()
    expect(s.distro).toBeUndefined()
  })

  it("**工具：路径有、版本探不到，就只记路径**", () => {
    const s = 解析探测(
      "dawn_tool_git_path=/usr/bin/git\ndawn_tool_git_ver=",
      "local",
    )
    expect(s.tools?.git).toEqual({ path: "/usr/bin/git" })
  })

  it("**这台机器没装 R，就一个字都不提 R**", () => {
    const s = 解析探测(掺横幅(正常输出), "local")
    expect(s.tools?.git).toBeDefined()
    expect(s.tools?.python3).toBeDefined()
    expect(Object.keys(s.tools ?? {})).not.toContain("R")
  })

  /**
   * **探不到 ≠ 探到了空。** 缺字段读作「不知道」；
   * 填 `"unknown"` 或空串会被当成一个真的值参与比对。
   */
  it("探不到的字段整个不出现，而不是空串", () => {
    const s = 解析探测("dawn_os=Linux\ndawn_arch=\ndawn_cpus=", "local")
    expect(s.os).toBe("Linux")
    expect("arch" in s, "arch 探不到就不该有这个键").toBe(false)
    expect("cpus" in s).toBe(false)
  })

  it("数字不合法就当没探到 —— 不把 `nproc: not found` 记成核数", () => {
    const s = 解析探测("dawn_cpus=nproc: command not found\ndawn_memkib=0", "local")
    expect(s.cpus).toBeUndefined()
    expect(s.memoryKib).toBeUndefined()
  })

  describe("工作区是不是 git 仓库", () => {
    it("明确是 → true", () => {
      const s = 解析探测("dawn_gitrepo=true", "local", "/w")
      expect(s.workspaceIsGitRepo).toBe(true)
    })

    it("明确不是 → false", () => {
      const s = 解析探测("dawn_gitrepo=false", "local", "/w")
      expect(s.workspaceIsGitRepo).toBe(false)
    })

    /**
     * **探不到就不给这个字段。** git 不存在、目录不存在、没权限——
     * 三种都会探不到，而它们都不等于「这不是一个 git 仓库」。
     * 写 `false` 上去就是把「不知道」记成了确定的事实。
     */
    it("**探不到 → 这个字段不存在**，不是 false", () => {
      const s = 解析探测("dawn_os=Linux", "local", "/w")
      expect(s.workspace).toBe("/w")
      expect("workspaceIsGitRepo" in s, "不知道就不该有这个键").toBe(false)
    })
  })

  it("`where` 与 `workspace` 是我们知道的，不是探来的 —— 机器同名也不会混", () => {
    const s = 解析探测(正常输出, { connectionId: "实验室-3" }, "/data/x")
    expect(s.where).toEqual({ connectionId: "实验室-3" })
    expect(s.workspace).toBe("/data/x")
  })
})

describe("R5 · 探测机器", () => {
  it("什么都没探到 → undefined，**不返回一个空快照顶上**", async () => {
    const s = await 探测机器(async () => ({ stdout: 横幅 }), "local")
    expect(s).toBeUndefined()
  })

  it("执行本身炸了 → undefined，不往上抛 —— 探不到环境不该让「连上」失败", async () => {
    const s = await 探测机器(async () => {
      throw new Error("connection reset")
    }, "local")
    expect(s).toBeUndefined()
  })

  it("探到了就给一份带 where 的快照", async () => {
    const s = await 探测机器(async () => ({ stdout: 掺横幅(正常输出) }), { connectionId: "c1" })
    expect(s?.kind).toBe("shell")
    expect(s?.where).toEqual({ connectionId: "c1" })
  })
})

describe("R5 · 脚本本身", () => {
  it("一个环境变量都不采 —— 快照是要被分享出去的", () => {
    const 脚本 = 探测脚本("/w")
    // 采环境变量的写法长这样：`echo "k=$PATH"` / `env` / `printenv`
    expect(脚本).not.toMatch(/\benv\b|printenv|\$PATH|\$HOME/)
  })

  it("工作区路径是单引号包起来的 —— 带空格或引号的路径不能变成第二条命令", () => {
    expect(探测脚本("/w/a b")).toContain(`'/w/a b'`)
    expect(探测脚本("/w/it's")).toContain(`'/w/it'\\''s'`)
  })

  it("不给工作区就不问 git —— 没有观察点时那个问题没有意义", () => {
    expect(探测脚本()).not.toContain("dawn_gitrepo")
  })
})

/**
 * **真链路：在这台机器上真的跑一遍。**
 *
 * 上面那些验的是解析，而解析对着一份我自己写的输出。**脚本本身跑不跑得通，
 * 只有跑一次才知道**——一个 `awk` 写错、一个引号少一个，
 * 上面全绿而真机上一个字段都探不到。
 */
describe("R5 · 本地真链路", () => {
  it("**真的探到了这台机器** —— 至少有 os 与 arch", async () => {
    const s = await 探测机器(本地执行, "local", process.cwd())
    expect(s, "本地探测返回了 undefined —— 脚本在真机上没跑通").toBeDefined()
    expect(s!.os, `探到的是：${JSON.stringify(s)}`).toBeTruthy()
    expect(s!.arch).toBeTruthy()
  }, 30_000)

  it("**这个仓库是 git 仓库，快照要说得出来**", async () => {
    const s = await 探测机器(本地执行, "local", process.cwd())
    expect(s!.workspaceIsGitRepo).toBe(true)
  }, 30_000)

  /**
   * **脚本自己的输出必须整齐是 `键=值`，一行都不许多**（2026-08-13 加的）。
   *
   * 这条是从一个真 bug 里长出来的：`distro` 那支在 macOS 上产出了两行
   * （`sw_vers` 的名字与版本各一行），于是 `取值` 只拿到「macOS」——
   * **版本号被悄悄截掉，而多出来的那一行漏进了输出**。
   * 上面所有解析用例都绿着，因为它们对着的是我手写的输出。
   *
   * 判据故意挑得与平台无关：**多出来的行是什么内容不重要，重要的是不该有。**
   * 本地跑没有 MOTD，所以这里可以要求「每一行都是我们自己的键」。
   */
  it("**脚本的输出没有一行是多余的** —— 多行的值会被悄悄截断", async () => {
    const { stdout } = await 本地执行(探测脚本(process.cwd()))
    const 多余 = stdout
      .split("\n")
      .filter((l) => l.trim() !== "")
      .filter((l) => !/^dawn_[a-z0-9_]+=/.test(l))
    expect(多余, `这些行不是 键=值，说明某个值里带了换行：${JSON.stringify(多余)}`).toEqual([])
  }, 30_000)

  it("核数与内存探得到，且是正整数", async () => {
    const s = await 探测机器(本地执行, "local")
    expect(s!.cpus, `cpus 没探到：${JSON.stringify(s)}`).toBeGreaterThan(0)
    expect(s!.memoryKib, `内存没探到：${JSON.stringify(s)}`).toBeGreaterThan(0)
  }, 30_000)
})
