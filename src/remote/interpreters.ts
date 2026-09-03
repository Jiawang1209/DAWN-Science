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

/**
 * 一次吐完所有事实。**登录环境由执行器保证**（它捕获过一次 PATH），这里只管问。
 *
 * **已知的一处不精确**：`for p in $(which -a $n)` 会按空白切词，PATH 上那条可执行文件
 * 的路径里若真带空格就会被切成两段（服务器上极少见，而且带空格的 PATH 目录本身就会
 * 让一大堆脚本出事）。`[ -x "$d" ]` 那条不受影响——它比对的是我们自己写死的路径。
 * 真要治得换 `which -a` 为逐行读，那要多起一个进程，暂不值得；记在这儿免得下次当成新 bug 查。
 */
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

/**
 * 跑一次事实脚本。**探不出来要响亮地说**（规格 7.5：失败必须出声）。
 *
 * 没有这道闸的话，一次失败的 exec（shell 起不来、`bash` 不在、被 ForceCommand 拦掉、
 * 连接刚好断在这一刻）返回的是空 stdout，`解析事实` 会老老实实给出
 * `home:"/"`、零个候选——于是用户看到的是**「这台机器上没有装了 ipykernel 的 Python」**。
 * 那句话是假的，而且它指向的是完全错误的补救（去装包），排查会从这里绕很远。
 *
 * 判据用 `DAWNFACT_HOME` 在不在，不用退出码：脚本最后有个 `true`，
 * 而 MOTD / rc 文件里随便一句话都可能弄脏退出码。
 */
export async function 读远端事实(exec: 远端exec): Promise<远端事实> {
  const r = await exec(事实脚本, { timeoutSec: 20 })
  if (取值(r.stdout, "DAWNFACT_HOME") === undefined) {
    throw new Error(`探不了那台机器（退出码 ${r.code ?? "无"}）：${r.stderr.trim().slice(0, 200)}`)
  }
  return 解析事实(r.stdout)
}

/**
 * @param 事实 已经读过就传进来。**两门语言共用一次**——`读远端事实` 要起一条 SSH 通道，
 *   一次探测（python + R）没有理由问同一台机器两遍同样的问题。
 */
export async function 探测远端解释器(
  exec: 远端exec,
  语言: 语言,
  已配: { python?: string | undefined; r?: string | undefined },
  事实?: 远端事实,
): Promise<候选[]> {
  const 用的事实 = 事实 ?? (await 读远端事实(exec))
  const 全部 = new Set([...用的事实.exe, ...Object.values(用的事实.path).flat()])
  const d: 枚举依赖 = {
    platform: 用的事实.platform,
    home: 用的事实.home,
    exists: (p) => 全部.has(p),
    glob: (pattern) => [...全部].filter((p) => 匹配(pattern, p)),
    pathLookup: (name) => 用的事实.path[name] ?? [],
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

/**
 * 「零个」那句话后面要不要接一段「另有几条没探明白」。**空串 = 没有要补的**。
 *
 * 抽成函数是为了让这句话有地方被测：它长在 `wiring.ts` 的 `interpreterOf` 里，
 * 而那条路要一台真服务器 + 一台真内核才走得到（见 `tests/electron/remote-kernel.test.ts`）。
 */
export function 没探明白后缀(unknown: readonly Pick<候选, "path" | "problem">[]): string {
  if (unknown.length === 0) return ""
  return `；另有 ${unknown.length} 条没探明白：${unknown.map((c) => `${c.path}（${c.problem ?? "原因不明"}）`).join("、")}`
}

/**
 * 定案 1 的三条路。
 *
 * **`none` 要带上「没探明白的那几条」**（审查，2026-09-04）。`unknown` 的含义是
 * *「起了它一次，但没能判断包在不在」*——超时、退出码怪、报了个不认识的错。
 * 把它折进 `none` 之后，界面说的是**「这台机器上没有装了 ipykernel 的 Python」**，
 * 而事实可能是「有，只是那条 python 起不来 / 八秒没应答」。
 * **缺失不等于相同**：「没有」与「没探明白」要人做的事完全不同（去装包 vs 去看那条路径怎么了）。
 *
 * 泛型是为了让调用方拿回**自己那份**候选（带 `problem`），而不是被截成两个字段。
 */
export function 选定<T extends Pick<候选, "path" | "kernelPackage">>(
  候选: readonly T[],
): { kind: "one"; path: string } | { kind: "many"; n: number } | { kind: "none"; unknown: T[] } {
  const 能用 = 候选.filter((c) => c.kernelPackage === "present")
  if (能用.length === 1) return { kind: "one", path: 能用[0]!.path }
  if (能用.length > 1) return { kind: "many", n: 能用.length }
  return { kind: "none", unknown: 候选.filter((c) => c.kernelPackage === "unknown") }
}
