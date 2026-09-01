/**
 * 本机解释器探测（首启向导，2026-08-27，spec `2026-08-27-首启向导与环境检测-design.md` §2）。
 *
 * 只做一件小事：**找出这台电脑上有哪些 Python / R、各自什么版本、内核包在不在**，列出来让人选。
 * 不装任何东西、不按环境分口径——作者定的：核心是配 API 调 pi，解释器只是帮你找路径。
 *
 * 全是纯函数：文件系统、PATH 查找、进程执行都由调用方注入，单测不碰真机。
 */
import { join, posix, win32 } from "node:path"

/** Windows 路径（带反斜杠或盘符）用 win32 那套算 basename / dirname——在 mac 上打单测也要对 */
const 路径 = (p: string) => (/^[A-Za-z]:\\|\\/.test(p) ? win32 : posix)

export type 语言 = "python" | "R"

export interface 候选 {
  /** 绝对路径 */
  path: string
  source: "settings" | "PATH" | "kernelspec" | "common"
  /** 起不来就没有 */
  version?: string
  /** ipykernel / IRkernel 在不在 */
  kernelPackage: "present" | "missing" | "unknown"
  /** 起不来时它自己说的末尾几行；超时写「8 秒没应答」 */
  problem?: string
}

export interface 枚举依赖 {
  platform: NodeJS.Platform
  home: string
  exists(p: string): boolean
  /** 只用于几条带 `*` 的常见目录；返回匹配到的绝对路径 */
  glob(pattern: string): string[]
  /** PATH 上所有同名可执行文件（`which -a` / `where`） */
  pathLookup(name: string): string[]
  settings: { python?: string | undefined; r?: string | undefined }
  kernelspecs: readonly { language?: string | undefined; executable?: string | undefined }[]
  /** uv / pixi 的目录能用环境变量挪走（`UV_PYTHON_INSTALL_DIR`、`PIXI_HOME`）；不给就读 `process.env`，单测传 `{}` 隔开真机 */
  env?: NodeJS.ProcessEnv | undefined
}

export const 超时毫秒 = 8_000

/** 同目录的 Rscript（探测用它跑；设置里填的、列出来的都是 R 本尊） */
export function R的Rscript(rPath: string): string {
  const P = 路径(rPath)
  const exe = P.basename(rPath).toLowerCase().endsWith(".exe") ? ".exe" : ""
  return P.join(P.dirname(rPath), `Rscript${exe}`)
}

/** Rscript 路径换回 R（PATH 上查到的是 Rscript） */
function Rscript的R(rscriptPath: string): string {
  const P = 路径(rscriptPath)
  const exe = P.basename(rscriptPath).toLowerCase().endsWith(".exe") ? ".exe" : ""
  return P.join(P.dirname(rscriptPath), `R${exe}`)
}

function 常见目录(语言: 语言, d: 枚举依赖): string[] {
  const h = d.home
  if (d.platform === "win32") {
    const local = win32.join(h, "AppData", "Local")
    return 语言 === "python"
      ? [
          ...d.glob(win32.join(local, "Programs", "Python", "Python3*", "python.exe")),
          ...["miniconda3", "anaconda3"].map((c) => win32.join(h, c, "python.exe")).filter((p) => d.exists(p)),
        ]
      : d.glob(win32.join("C:\\Program Files", "R", "R-*", "bin", "Rscript.exe")).map(Rscript的R)
  }
  if (语言 === "python") {
    const 固定 = ["/opt/homebrew/bin/python3", "/usr/local/bin/python3", "/usr/bin/python3"].filter((p) => d.exists(p))
    const conda = ["miniconda3", "anaconda3", "miniforge3"]
    const env = d.env ?? process.env
    // C22（2026-09-01）：只用 uv / pixi 装 Python 的人，向导里一条都看不见——这两家的目录以前没看。
    // uv 托管的 Python 在 `$UV_PYTHON_INSTALL_DIR`，缺省 `$XDG_DATA_HOME/uv/python` → `~/.local/share/uv/python`；
    // mac 上老版本落过 `~/Library/Application Support/uv`，两处都看，多问一次 glob 不花钱。
    const uv根 = env.UV_PYTHON_INSTALL_DIR
      ? [env.UV_PYTHON_INSTALL_DIR]
      : [
          join(env.XDG_DATA_HOME || join(h, ".local", "share"), "uv", "python"),
          ...(d.platform === "darwin" ? [join(h, "Library", "Application Support", "uv", "python")] : []),
        ]
    // pixi 全局环境在 `$PIXI_HOME/envs/<名字>`，缺省 `~/.pixi`；项目里的 `.pixi/envs` 与 uv 的 `.venv` 要知道工作区在哪，这里没有，不猜
    const pixi根 = env.PIXI_HOME || join(h, ".pixi")
    return [
      ...固定,
      ...d.glob(join(h, ".pyenv", "versions", "*", "bin", "python")),
      ...conda.map((c) => join(h, c, "bin", "python")).filter((p) => d.exists(p)),
      ...conda.flatMap((c) => d.glob(join(h, c, "envs", "*", "bin", "python"))),
      ...uv根.flatMap((r) => d.glob(join(r, "*", "bin", "python3"))),
      ...d.glob(join(pixi根, "envs", "*", "bin", "python")),
    ]
  }
  return ["/opt/homebrew/bin/Rscript", "/usr/local/bin/Rscript", "/Library/Frameworks/R.framework/Resources/bin/Rscript"]
    .filter((p) => d.exists(p))
    .map(Rscript的R)
}

/** 去重、按 settings > kernelspec > PATH > common 排；同一路径只留第一次出现的来源 */
export function 枚举候选(语言: 语言, d: 枚举依赖): { path: string; source: 候选["source"] }[] {
  const 出: { path: string; source: 候选["source"] }[] = []
  const 见过 = new Set<string>()
  const 收 = (path: string | undefined, source: 候选["source"]) => {
    if (!path || 见过.has(path)) return
    见过.add(path)
    出.push({ path, source })
  }
  收(语言 === "python" ? d.settings.python : d.settings.r, "settings")
  for (const k of d.kernelspecs) {
    if (!k.executable) continue
    const lang = (k.language ?? "").toLowerCase()
    // kernelspec 指向的环境常常已经删了（作者机器上三条 miniconda 的就是）——死路径不列；设置里那条例外，人得看见自己配的没了
    if ((语言 === "python" ? lang === "python" : lang === "r") && d.exists(k.executable)) 收(k.executable, "kernelspec")
  }
  if (语言 === "python") {
    for (const n of ["python3", "python"]) for (const p of d.pathLookup(n)) 收(p, "PATH")
  } else {
    for (const p of d.pathLookup("Rscript")) 收(Rscript的R(p), "PATH")
  }
  for (const p of 常见目录(语言, d)) 收(p, "common")
  return 出
}

/**
 * 起一次解释器的命令。
 * Python：先 print 版本再 import——缺包时版本仍拿得到。R：退出码 3 专指「IRkernel 没装」。
 */
export const 探测命令: Record<语言, (path: string) => { cmd: string; args: string[] }> = {
  python: (path) => ({ cmd: path, args: ["-c", "import sys;print(sys.version.split()[0]);import ipykernel"] }),
  R: (path) => ({
    cmd: R的Rscript(path),
    args: ["-e", 'cat(paste(R.version$major,R.version$minor,sep="."));quit(status=if(requireNamespace("IRkernel",quietly=TRUE))0 else 3)'],
  }),
}

export interface 执行结果 {
  code: number | null
  stdout: string
  stderr: string
  timedOut?: boolean
}

export function 解析探测(语言: 语言, r: 执行结果): Pick<候选, "version" | "kernelPackage" | "problem"> {
  if (r.timedOut) return { kernelPackage: "unknown", problem: `${超时毫秒 / 1000} 秒没应答` }
  const 版本 = r.stdout.trim().split("\n")[0]?.trim() || undefined
  const 带版本 = (x: Pick<候选, "kernelPackage" | "problem">): Pick<候选, "version" | "kernelPackage" | "problem"> =>
    版本 ? { version: 版本, ...x } : x
  if (r.code === 0) return 带版本({ kernelPackage: "present" })
  if (语言 === "python" && /No module named ['"]?ipykernel/.test(r.stderr)) return 带版本({ kernelPackage: "missing" })
  if (语言 === "R" && r.code === 3) return 带版本({ kernelPackage: "missing" })
  const 尾 = r.stderr.trim().split("\n").slice(-5).join("\n")
  return 带版本({ kernelPackage: "unknown", problem: 尾 || `退出码 ${r.code}` })
}

export type 执行 = (cmd: string, args: string[]) => Promise<执行结果>

/** 每个候选起一次，并发 4，结果按枚举顺序 */
export async function 探测解释器(语言: 语言, d: 枚举依赖, run: 执行): Promise<候选[]> {
  const 列 = 枚举候选(语言, d)
  const 出: 候选[] = new Array(列.length)
  let i = 0
  const 工人 = async () => {
    for (;;) {
      const n = i++
      if (n >= 列.length) return
      const c = 列[n]!
      const { cmd, args } = 探测命令[语言](c.path)
      let r: 执行结果
      try {
        r = await run(cmd, args)
      } catch (e) {
        r = { code: null, stdout: "", stderr: e instanceof Error ? e.message : String(e) }
      }
      出[n] = { ...c, ...解析探测(语言, r) }
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, 列.length) }, 工人))
  // 内核包在的浮到前面（稳定排序，组内仍按枚举顺序）：二十多条候选里人要找的是能直接用的那几条
  const 序 = { present: 0, missing: 1, unknown: 2 } as const
  return 出.slice().sort((a, b) => 序[a.kernelPackage] - 序[b.kernelPackage])
}
