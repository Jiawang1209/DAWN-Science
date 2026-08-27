/**
 * kernelspec 的发现与诊断（②-A · K2）。
 *
 * ## 为什么这件事值得单独一个文件
 *
 * 作者机器上有**五个 kernelspec**（`d2l` / `datascience` / `dawn-spike` / `ir` /
 * `python_learn`）。**不能假定只有一个 Python**——挑错一个的后果不是「跑不起来」，
 * 而是**跑起来了、但跑在另一个环境里**，人以为自己在用 A，实际在用 B。
 * 那比起不来坏得多，因为它不出声。
 *
 * ## 起不来时必须分清三种实情
 *
 * 这条是 2026-08-10 从一次**真实的误诊**里得来的：Spike D 把 `ir` 起不来记成
 * 「kernelspec 指向旧安装」，作者一句「我的 R 就是 `/usr/local/bin/R`」
 * 才查出那是一条**软链接**，指向的正是 kernelspec 里那个路径——同一个二进制。
 * kernelspec 一直是对的，唯一的原因是 **`IRkernel` 包没装**。
 *
 * | 实情 | 该说什么 | 人该做什么 |
 * |---|---|---|
 * | 没有这个 kernelspec | 本机没有注册这个内核 | 装内核 / 换一个 |
 * | 有，但 argv[0] 不存在 | 注册项指向的程序不存在 | 重装 kernelspec |
 * | 程序在，语言侧的包缺失 | 程序在，但它的内核包没装 | 装包 |
 *
 * **混成一句「内核起不来」，人就会去修一个没坏的东西。**
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { homedir, platform } from "node:os"
import { delimiter, join } from "node:path"

export interface KernelSpec {
  /** 目录名，也是 `spawnteract.launch()` 要的那个名字 */
  name: string
  displayName: string
  /** `python` / `R` / …。kernel.json 里没写就是 undefined，**不猜** */
  language?: string
  argv: string[]
  /** 这份 spec 是从哪个目录读出来的。**同名时用于说清用的是哪一份** */
  dir: string
  /** argv[0]。空 argv 时缺省 */
  executable?: string
  /**
   * 怎么中断这个内核。
   *
   * **kernel.json 不声明时默认 `signal`**——这是 Jupyter 自己的默认，
   * 也是本机 ipykernel 与 IRkernel 的实测值（两者都没声明这个字段）。
   * **不猜成 `message`**：走错路的症状是「点了停止什么也没发生」。
   */
  interruptMode: "signal" | "message"
}

/** 读不出来的那些。**不静默跳过**——一条坏的注册项要能被看见 */
export interface SpecProblem {
  dir: string
  reason: string
}

export interface DiscoverOptions {
  env?: NodeJS.ProcessEnv
  home?: string
  platform?: NodeJS.Platform
  /** 让测试注入固定的搜索根，绕开本机环境 */
  roots?: string[]
}

/**
 * kernelspec 的搜索路径。
 *
 * 顺序照 Jupyter 自己的：`JUPYTER_PATH` → 用户目录 → 系统目录，**先到先得**。
 * 同名时**先出现的赢**，但两份都会被记下来（见 `discoverKernelSpecs` 的 `shadowed`）。
 */
export function kernelSpecRoots(o: DiscoverOptions = {}): string[] {
  if (o.roots) return o.roots
  const env = o.env ?? process.env
  /**
   * **完全替换搜索路径的入口。**
   *
   * 与 `DAWN_CLI_HOME` 同一条理由（那个是为了让 e2e 不去读开发者真实的
   * `~/.codex`）：内核列表**随机器而变**，直接进视觉基线会有两个后果——
   * 基线在别的机器上必然红，以及**把开发者的个人路径以图片形式提交进仓库**。
   *
   * 它不是「测试后门」：将来「让用户自己指定去哪找内核」也走这条路。
   * 与 `JUPYTER_PATH` 的区别是**这个会替换掉默认目录，而不是追加**。
   */
  const override = env.DAWN_JUPYTER_ROOTS
  if (override) return override.split(delimiter).filter(Boolean)
  const home = o.home ?? homedir()
  const plat = o.platform ?? platform()

  const fromEnv = (env.JUPYTER_PATH ?? "")
    .split(delimiter)
    .filter(Boolean)
    .map((p) => join(p, "kernels"))

  const user =
    plat === "darwin"
      ? join(home, "Library", "Jupyter", "kernels")
      : plat === "win32"
        ? join(env.APPDATA ?? join(home, "AppData", "Roaming"), "jupyter", "kernels")
        : join(home, ".local", "share", "jupyter", "kernels")

  const system =
    plat === "win32"
      ? [join(env.PROGRAMDATA ?? "C:\\ProgramData", "jupyter", "kernels")]
      : ["/usr/local/share/jupyter/kernels", "/usr/share/jupyter/kernels"]

  return [...fromEnv, user, ...system]
}

export interface Discovery {
  specs: KernelSpec[]
  problems: SpecProblem[]
  /** 被同名的前一份挡住的。**不是丢掉**——「为什么我改了配置没生效」全靠它回答 */
  shadowed: KernelSpec[]
}

/** 扫出本机所有 kernelspec。**没有目录不是错误**，是「这台机器没装内核」 */
export function discoverKernelSpecs(o: DiscoverOptions = {}): Discovery {
  const specs: KernelSpec[] = []
  const problems: SpecProblem[] = []
  const shadowed: KernelSpec[] = []
  const seen = new Set<string>()

  for (const root of kernelSpecRoots(o)) {
    let entries: string[]
    try {
      if (!existsSync(root) || !statSync(root).isDirectory()) continue
      entries = readdirSync(root)
    } catch {
      // 权限不足之类。**记下来，不当作没有**
      problems.push({ dir: root, reason: "目录读不了（权限？）" })
      continue
    }
    for (const name of entries.sort()) {
      const dir = join(root, name)
      const file = join(dir, "kernel.json")
      if (!existsSync(file)) continue
      let parsed: unknown
      try {
        parsed = JSON.parse(readFileSync(file, "utf8"))
      } catch (err) {
        problems.push({ dir, reason: `kernel.json 解析不了：${message(err)}` })
        continue
      }
      const j = parsed as { argv?: unknown; display_name?: unknown; language?: unknown }
      if (!Array.isArray(j.argv) || j.argv.length === 0 || typeof j.argv[0] !== "string") {
        // **argv 是这份 spec 的全部意义**，没有它就不是一条能用的注册项
        problems.push({ dir, reason: "kernel.json 里没有可用的 argv" })
        continue
      }
      const spec: KernelSpec = {
        name,
        displayName: typeof j.display_name === "string" ? j.display_name : name,
        ...(typeof j.language === "string" ? { language: j.language } : {}),
        argv: j.argv as string[],
        dir,
        executable: j.argv[0],
        // 只认 `message`，其余（含缺省、含写错）一律 signal —— 那是 Jupyter 的默认
        interruptMode: (j as { interrupt_mode?: unknown }).interrupt_mode === "message" ? "message" : "signal",
      }
      if (seen.has(name)) shadowed.push(spec)
      else {
        seen.add(name)
        specs.push(spec)
      }
    }
  }
  return { specs, problems, shadowed }
}

/** 三种实情。**它们要人做的事完全不同** */
export type LaunchDiagnosis =
  | { kind: "no-spec"; message: string; available: string[] }
  | { kind: "missing-executable"; message: string; executable: string }
  | { kind: "missing-kernel-package"; message: string; executable: string; evidence: string }
  | { kind: "unknown"; message: string; evidence: string }

/**
 * 起不来时说人话。
 *
 * `stderr` 是内核进程真吐出来的东西。**只在真失败时用它做判据**——
 * 很多内核平时就往 stderr 打噪声（codex 那条教训）。
 */
export function diagnoseLaunch(
  name: string,
  discovery: Discovery,
  stderr = "",
  exists: (p: string) => boolean = existsSync,
): LaunchDiagnosis | undefined {
  const spec = discovery.specs.find((s) => s.name === name)

  if (!spec) {
    const available = discovery.specs.map((s) => s.name)
    return {
      kind: "no-spec",
      available,
      // **列出有哪些**，否则人只能自己去翻目录
      message:
        `本机没有注册名为「${name}」的内核。` +
        (available.length > 0 ? `已注册的是：${available.join(" / ")}` : "本机一个内核都没有注册。"),
    }
  }

  const exe = spec.executable ?? ""
  // **绝对路径才检查存在性**：`python3` 这种要靠 PATH 找，这里判不了
  if (exe.startsWith("/") && !exists(exe)) {
    return {
      kind: "missing-executable",
      executable: exe,
      message:
        `内核「${name}」的注册项指向 ${exe}，但那个程序不存在。` +
        `这条注册项过期了——重装它（例如 R 里 \`IRkernel::installspec()\`，Python 里 \`python -m ipykernel install --user\`）。`,
    }
  }

  const 缺包 = matchMissingPackage(stderr)
  if (缺包) {
    return {
      kind: "missing-kernel-package",
      executable: exe,
      evidence: 缺包.line,
      message:
        `${exe} 在，但它的内核包「${缺包.pkg}」没装——` +
        `**注册项本身没问题，要装的是包**（${缺包.how}）。`,
    }
  }

  if (stderr.trim()) {
    // **认不出就如实说认不出，并把原话带上**，不编一个原因
    return {
      kind: "unknown",
      evidence: stderr.trim().split("\n").slice(-5).join("\n"),
      message: `内核「${name}」没能起来，原因认不出。它自己说的是（末尾几行）：`,
    }
  }
  return undefined
}

/**
 * **模块名不等于包名。**
 *
 * `python -m ipykernel_launcher` 找不到时报的是模块名 `ipykernel_launcher`，
 * 而要装的包叫 **`ipykernel`**。照模块名给建议，人就会去装一个不存在的包——
 * 那比不给建议更坏。**认得出的做映射，认不出的照原样说**。
 */
const MODULE_TO_PACKAGE: Record<string, string> = {
  ipykernel_launcher: "ipykernel",
}

/**
 * 从 stderr 里认出「语言侧的包没装」。**认得出才说，认不出返回 undefined**。
 *
 * 两种 Python 写法都要认（2026-08-10 实测）：
 * ```
 * ModuleNotFoundError: No module named 'ipykernel'     ← import 失败，带引号
 * /opt/.../python3.13: No module named ipykernel_launcher  ← `-m` 失败，**不带引号**
 * ```
 * 第一版只写了带引号那种，**真机上跑出来的恰好是不带引号的那种**，整条漏掉。
 */
function matchMissingPackage(stderr: string): { pkg: string; how: string; line: string } | undefined {
  for (const line of stderr.split("\n")) {
    // R：there is no package called 'IRkernel'（引号可能是直角引号）
    const r = /there is no package called ['"\u2018]([^'"\u2019]+)['"\u2019]/i.exec(line)
    if (r?.[1]) return { pkg: r[1], how: `R 里跑 install.packages("${r[1]}")`, line: line.trim() }
    // Python：带引号与不带引号两种都要认
    const p = /No module named ['"]?([A-Za-z0-9_.]+)['"]?/i.exec(line)
    if (p?.[1]) {
      const mod = p[1]
      const pkg = MODULE_TO_PACKAGE[mod] ?? mod
      return { pkg, how: `python -m pip install ${pkg}`, line: line.trim() }
    }
  }
  return undefined
}

const message = (err: unknown): string => (err instanceof Error ? err.message : String(err))

/* ── 直接由解释器路径起内核（2026-08-10，作者定的机制）────────────── */

export type KernelLanguage = "python" | "R"

/**
 * 由解释器路径拼出 argv。**不经 kernelspec。**
 *
 * ## 为什么这是主路径
 *
 * 作者 2026-08-10：*「我不是要求你扫描整个电脑，而是直接提供一个 R 解释器
 * 和 Python 解释器的路径即可。只有配置了，我们才能调用。」*
 *
 * 这比 kernelspec 更可控：**你指哪个解释器，就一定跑在哪个解释器上**。
 * 走 kernelspec 时会出现「名字叫 `datascience`，实际是另一个 conda 环境」
 * 这种事——挑错的后果不是报错，是**跑在了另一个环境里而不自知**。
 *
 * `{connection_file}` 是 Jupyter 的占位符，由 `spawnteract` 替换。
 */
export function argvForInterpreter(language: KernelLanguage, path: string): string[] {
  return language === "python"
    ? [path, "-m", "ipykernel_launcher", "-f", "{connection_file}"]
    : // `--slave` 让 R 不打招呼横幅；`--args` 之后的东西留给 IRkernel 自己解析
      [path, "--slave", "-e", "IRkernel::main()", "--args", "{connection_file}"]
}

/** 这个语言的内核包叫什么、怎么装。**报错要能直接照着做** */
export { KERNEL_PACKAGE } from "../protocol/kernel-package.js"

/**
 * 由路径起不来时说人话。**三种实情仍然要分清**，只是第二种换了形状：
 * 没有 kernelspec 这回事了，取而代之的是「这个路径上没有程序」。
 */
export function diagnoseInterpreter(
  language: KernelLanguage,
  path: string,
  stderr = "",
  exists: (p: string) => boolean = existsSync,
): LaunchDiagnosis | undefined {
  if (!path.trim()) {
    return {
      kind: "no-spec",
      available: [],
      message: `还没有配置 ${language === "python" ? "Python" : "R"} 解释器路径——到「设置 → 内核」填一个。`,
    }
  }
  if (path.startsWith("/") && !exists(path)) {
    return {
      kind: "missing-executable",
      executable: path,
      message: `${path} 不存在。**这条路径是你自己填的**，到「设置 → 内核」改一下。`,
    }
  }
  const 缺包 = matchMissingPackage(stderr)
  if (缺包) {
    return {
      kind: "missing-kernel-package",
      executable: path,
      evidence: 缺包.line,
      message: `${path} 在，但它的内核包「${缺包.pkg}」没装——**路径没问题，要装的是包**（${缺包.how}）。`,
    }
  }
  if (stderr.trim()) {
    return {
      kind: "unknown",
      evidence: stderr.trim().split("\n").slice(-5).join("\n"),
      message: `${language === "python" ? "Python" : "R"} 内核没能起来，原因认不出。它自己说的是（末尾几行）：`,
    }
  }
  return undefined
}
