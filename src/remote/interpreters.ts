/**
 * 远端探测解释器（远程内核，2026-09-03，spec 定案 1）。
 *
 * **复用 `kernel/probe.ts`**：枚举候选、探测命令、结果解析一个都不重写；这里只换「事实从哪来」——
 * 一段脚本在登录环境里一次吐完 HOME / uname / `which -a` / 几处常见目录，之后每个候选起一次拿版本与包。
 * 输出一律 `键=值`（Spike F 纪律 ②），横幅爱怎么打怎么打。
 */
import { 探测解释器, 超时毫秒, type 候选, type 枚举依赖, type 执行, type 语言 } from "../kernel/probe.js"
import { 单引号, 取值 } from "./ssh.js"

const 常见 = [
  '"$HOME"/miniconda3/bin/python', '"$HOME"/anaconda3/bin/python', '"$HOME"/miniforge3/bin/python',
  '"$HOME"/miniconda3/envs/*/bin/python', '"$HOME"/anaconda3/envs/*/bin/python', '"$HOME"/miniforge3/envs/*/bin/python',
  '"$HOME"/.pyenv/versions/*/bin/python', '"$HOME"/.local/share/uv/python/*/bin/python3', '"$HOME"/.pixi/envs/*/bin/python',
  "/opt/homebrew/bin/python3", "/usr/local/bin/python3", "/usr/bin/python3",
  "/opt/homebrew/bin/Rscript", "/usr/local/bin/Rscript", "/usr/bin/Rscript",
]

/** 一次吐完所有事实。**登录环境由执行器保证**（它捕获过一次 PATH），这里只管问 */
export const 事实脚本 =
  `echo "DAWNFACT_HOME=$HOME"; echo "DAWNFACT_OS=$(uname -s)"; ` +
  `for n in python3 python Rscript; do for p in $(which -a $n 2>/dev/null); do echo "DAWNFACT_PATH_$n=$p"; done; done; ` +
  `for d in ${常见.join(" ")}; do [ -x "$d" ] && echo "DAWNFACT_EXE=$d"; done; true`

export interface 远端事实 {
  home: string
  platform: NodeJS.Platform
  /** `which -a <名>` 的命中，按名 */
  path: Record<string, string[]>
  /** 常见目录里真在的可执行文件 */
  exe: Set<string>
}

export function 解析事实(out: string): 远端事实 {
  const path: Record<string, string[]> = {}
  const exe = new Set<string>()
  for (const 行 of out.split("\n")) {
    const p = /^DAWNFACT_PATH_([A-Za-z0-9]+)=(.+)$/.exec(行.trim())
    if (p) (path[p[1]!] ??= []).push(p[2]!.trim())
    const e = /^DAWNFACT_EXE=(.+)$/.exec(行.trim())
    if (e) exe.add(e[1]!.trim())
  }
  const os = 取值(out, "DAWNFACT_OS") ?? ""
  return { home: 取值(out, "DAWNFACT_HOME") ?? "/", platform: os === "Darwin" ? "darwin" : "linux", path, exe }
}

/** glob 只认 `*`（与 `常见目录` 里的写法一致） */
function 匹配(pattern: string, p: string): boolean {
  const re = new RegExp(`^${pattern.split("*").map((s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join("[^/]*")}$`)
  return re.test(p)
}

export type 远端exec = (
  command: string,
  options?: { timeoutSec?: number },
) => Promise<{ code: number | undefined; signal?: string | undefined; stdout: string; stderr: string }>

export async function 探测远端解释器(
  exec: 远端exec,
  语言: 语言,
  已配: { python?: string | undefined; r?: string | undefined },
): Promise<候选[]> {
  const 事实 = 解析事实((await exec(事实脚本, { timeoutSec: 20 })).stdout)
  const 全部 = new Set([...事实.exe, ...Object.values(事实.path).flat()])
  const d: 枚举依赖 = {
    platform: 事实.platform,
    home: 事实.home,
    exists: (p) => 全部.has(p),
    glob: (pattern) => [...全部].filter((p) => 匹配(pattern, p)),
    pathLookup: (name) => 事实.path[name] ?? [],
    settings: 已配,
    kernelspecs: [],
    // **不给 `process.env`**：那是我们这台电脑的环境，与那台服务器无关
    env: {},
  }
  const run: 执行 = async (cmd, args) => {
    // 路径与参数都单引号包死：`-c` 后面那串代码里有引号、分号、括号，交给远端 shell 再解释一遍就散了
    const r = await exec(`${单引号(cmd)} ${args.map(单引号).join(" ")}`, { timeoutSec: 超时毫秒 / 1000 })
    return r.code === undefined && r.signal
      ? { code: null, stdout: r.stdout, stderr: r.stderr, timedOut: true }
      : { code: r.code ?? null, stdout: r.stdout, stderr: r.stderr }
  }
  return 探测解释器(语言, d, run)
}

/** 定案 1 的三条路 */
export function 选定(
  候选: readonly Pick<候选, "path" | "kernelPackage">[],
): { kind: "one"; path: string } | { kind: "many"; n: number } | { kind: "none" } {
  const 能用 = 候选.filter((c) => c.kernelPackage === "present")
  if (能用.length === 1) return { kind: "one", path: 能用[0]!.path }
  if (能用.length > 1) return { kind: "many", n: 能用.length }
  return { kind: "none" }
}
