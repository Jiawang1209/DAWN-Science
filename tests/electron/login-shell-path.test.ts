import { describe, expect, it } from "vitest"
import { PATH起, PATH止, 合并PATH, 问PATH的命令 } from "../../src/electron/login-shell-path.js"

/** 把一段 PATH 包进两枚哨兵——模仿 `问PATH的命令` 在 sh/bash/zsh/fish 里真实的 stdout */
const 包 = (路径: string): string => `${PATH起}\n${路径}\n${PATH止}\n`

const launchd = "/usr/bin:/bin:/usr/sbin:/sbin"

describe("合并PATH：从登录 shell 的 stdout 里取 PATH 并并进现有 PATH", () => {
  it("bash/zsh：两枚哨兵之间那一行按冒号拆开，排在现有 PATH 前面，重复的只留一份", () => {
    const r = 合并PATH(包("/opt/homebrew/bin:/Users/me/.nvm/versions/node/v22/bin:/usr/bin:/bin"), launchd)
    expect(r.问题).toBeUndefined()
    expect(r.段).toEqual(["/opt/homebrew/bin", "/Users/me/.nvm/versions/node/v22/bin", "/usr/bin", "/bin"])
    expect(r.合并后).toBe("/opt/homebrew/bin:/Users/me/.nvm/versions/node/v22/bin:/usr/bin:/bin:/usr/sbin:/sbin")
    expect(r.弃).toEqual([])
  })

  it("fish（新命令 `string join : $PATH`）：输出形状与 bash 一致，照常并入", () => {
    const r = 合并PATH(包("/opt/homebrew/bin:/usr/local/bin:/usr/bin"), launchd)
    expect(r.问题).toBeUndefined()
    expect(r.段).toEqual(["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin"])
  })

  it("fish 老命令 `echo 前缀$PATH`：前缀被分发到每个元素、全在一行——必须整条拒掉，不能把带空格的假段并进 PATH", () => {
    // 2026-09-01 审出的：fish 里 $PATH 是列表，`echo __X__$PATH` 得到 `__X__/a __X__/b …`。
    // 旧实现 startsWith 命中、split(":") 得到一个含空格与字面标记的假段，还写日志说「1 段」。
    const 分发 = `${PATH起}/opt/homebrew/bin ${PATH起}/usr/bin ${PATH起}/bin\n`
    const r = 合并PATH(分发, launchd)
    expect(r.段).toEqual([])
    expect(r.合并后).toBe(launchd)
    expect(r.问题).toBeTruthy()
  })

  it("哨兵之间那一行混进了标记文字（同一种分发形状落在两枚哨兵之间）：那一段弃掉，弃了什么说出来", () => {
    const r = 合并PATH(包(`/opt/homebrew/bin __DAWN_PATH__/usr/bin`), launchd)
    expect(r.段).toEqual([])
    expect(r.弃).toEqual(["/opt/homebrew/bin __DAWN_PATH__/usr/bin"])
    expect(r.问题).toMatch(/弃/)
    expect(r.合并后).toBe(launchd)
  })

  it("段里混进任一枚哨兵文字也弃：分发形状的破绽是标记，不是空格", () => {
    const r = 合并PATH(包(`/opt/homebrew/bin:/x ${PATH起}/y:/z ${PATH止}:/usr/bin`), launchd)
    expect(r.段).toEqual(["/opt/homebrew/bin", "/usr/bin"])
    expect(r.弃).toEqual([`/x ${PATH起}/y`, `/z ${PATH止}`])
  })

  it("哨兵前后有 banner / MOTD：只认两枚哨兵之间的内容", () => {
    const out = `Welcome to zsh!\nLast login: Mon\n${包("/opt/homebrew/bin:/usr/bin")}Have a nice day\n`
    const r = 合并PATH(out, launchd)
    expect(r.问题).toBeUndefined()
    expect(r.段).toEqual(["/opt/homebrew/bin", "/usr/bin"])
  })

  it("Windows 风格换行（\\r\\n）也认得出哨兵", () => {
    const r = 合并PATH(`${PATH起}\r\n/opt/homebrew/bin:/usr/bin\r\n${PATH止}\r\n`, launchd)
    expect(r.段).toEqual(["/opt/homebrew/bin", "/usr/bin"])
  })

  it("空输出 / 只有 banner 没有哨兵：段为空、报「没找到标记」、现有 PATH 原样不动", () => {
    for (const out of ["", "\n", "Unknown option: `-lc'\nUsage: tcsh [ -bcdefilmnqstvVxX ] [ argument ... ].\n"]) {
      const r = 合并PATH(out, launchd)
      expect(r.段).toEqual([])
      expect(r.合并后).toBe(launchd)
      expect(r.问题).toMatch(/标记/)
    }
  })

  it("哨兵之间是空行：报「没回 PATH」", () => {
    const r = 合并PATH(包(""), launchd)
    expect(r.段).toEqual([])
    expect(r.问题).toBeTruthy()
  })

  it("只有一枚哨兵（输出被截断）：不算找到", () => {
    const r = 合并PATH(`${PATH起}\n/opt/homebrew/bin\n`, launchd)
    expect(r.段).toEqual([])
    expect(r.问题).toMatch(/标记/)
  })

  it("不以 / 开头的段（相对路径、~、空段）弃掉，其余照并；弃了的写进问题", () => {
    const r = 合并PATH(包("/opt/homebrew/bin::~/bin:relative/bin:/usr/bin"), launchd)
    expect(r.段).toEqual(["/opt/homebrew/bin", "/usr/bin"])
    expect(r.弃).toEqual(["~/bin", "relative/bin"])
    expect(r.问题).toMatch(/弃/)
    expect(r.合并后).toBe("/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin")
  })

  it("路径里带空格 / 制表符的段照并——macOS 的 PATH 里本来就有（VMware Fusion、JetBrains Toolbox），弃掉是倒退", () => {
    const r = 合并PATH(包("/opt/homebrew/bin:/Applications/VMware Fusion.app/Contents/Public:/Users/me/Library/Application Support/JetBrains/Toolbox/scripts:/a\tb:/usr/bin"), launchd)
    expect(r.问题).toBeUndefined()
    expect(r.弃).toEqual([])
    expect(r.段).toEqual([
      "/opt/homebrew/bin",
      "/Applications/VMware Fusion.app/Contents/Public",
      "/Users/me/Library/Application Support/JetBrains/Toolbox/scripts",
      "/a\tb",
      "/usr/bin",
    ])
  })

  it("段里有换行（哨兵之间多于一行）弃掉——PATH 里没有正经的换行", () => {
    const r = 合并PATH(`${PATH起}\n/opt/homebrew/bin:/bad\nline:/usr/bin\n${PATH止}\n`, launchd)
    expect(r.段).toEqual(["/opt/homebrew/bin", "/usr/bin"])
    expect(r.弃).toEqual(["/bad\nline"])
  })

  it("shell 自己给的重复段只留第一份", () => {
    const r = 合并PATH(包("/usr/bin:/opt/homebrew/bin:/usr/bin"), launchd)
    expect(r.段).toEqual(["/usr/bin", "/opt/homebrew/bin"])
  })

  it("现有 PATH 为空：合并后就是 shell 给的", () => {
    const r = 合并PATH(包("/opt/homebrew/bin:/usr/bin"), "")
    expect(r.合并后).toBe("/opt/homebrew/bin:/usr/bin")
  })
})

describe("问PATH的命令：按 shell 的文件名选一条能在那个 shell 里跑的命令", () => {
  it("sh/bash/zsh：printf 包哨兵，$PATH 直接当字符串", () => {
    for (const shell of ["/bin/bash", "/bin/zsh", "/bin/sh", "/usr/local/bin/bash"]) {
      const cmd = 问PATH的命令(shell)
      expect(cmd).toContain(PATH起)
      expect(cmd).toContain(PATH止)
      expect(cmd).toContain('"$PATH"')
      expect(cmd).not.toContain("string join")
    }
  })

  it("fish：$PATH 是列表，得先 `string join :` 成一条", () => {
    for (const shell of ["/opt/homebrew/bin/fish", "/usr/local/bin/fish", "fish"]) {
      const cmd = 问PATH的命令(shell)
      expect(cmd).toContain("(string join : $PATH)")
      expect(cmd).toContain(PATH起)
      expect(cmd).toContain(PATH止)
    }
  })

  it("两条命令在真实 shell 里跑得出可解析的形状（本机有哪个 shell 就验哪个）", async () => {
    const { execFileSync } = await import("node:child_process")
    const { existsSync } = await import("node:fs")
    for (const shell of ["/bin/bash", "/bin/zsh", "/bin/sh", "/opt/homebrew/bin/fish", "/usr/local/bin/fish"]) {
      if (!existsSync(shell)) continue
      // 不用 -l：登录 shell 会跑用户的 rc，测试不该依赖它；命令本身对 -l 无感
      const out = execFileSync(shell, ["-c", 问PATH的命令(shell)], { encoding: "utf8", timeout: 5_000 })
      const r = 合并PATH(out, "")
      expect(r.问题, `${shell} → ${JSON.stringify(out)}`).toBeUndefined()
      expect(r.段.length).toBeGreaterThan(0)
      expect(r.段).toContain("/usr/bin")
    }
  })
})
