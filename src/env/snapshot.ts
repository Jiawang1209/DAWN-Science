/**
 * 环境快照的两个种类（②-B · R5，2026-08-13）。
 *
 * ## 为什么是两个类型，不是一个加几个可空字段
 *
 * 内核快照记的是**「这个解释器里有什么」**（版本、库路径、包清单）；
 * shell 快照记的是**「这台机器是什么」**（发行版、内核、CPU、PATH 上有哪些工具）。
 *
 * **它们不可比。** 一台机器上装着三个 conda 环境，机器还是那台机器；
 * 同一个 conda 环境搬到另一台机器上，解释器还是那个解释器。
 * 把它们塞进一个类型、靠可空字段区分，第一个后果是
 * 「这两次运行的环境一样吗」有了一个**看起来能回答、其实答错**的答案。
 *
 * 计划 §3.4 把这条写成了纪律：*「两种环境快照，不共用一个名字。」*
 * 这里让它成为类型系统里的事实——判别式联合，`kind` 是判别子。
 *
 * ## 指纹：kernel 那一支的口径一个字节都不能动
 *
 * 指纹是主键。改了口径，**同一个环境会在老库里裂成两行**，
 * 而已经写进 Run 的那些 id 指向的是旧行——那就是用今天的口径改写昨天的证据。
 *
 * 所以 `kernelFingerprint` 与 R5 之前逐字节相同（不含 `kind`）。
 * 两支不会撞，靠的不是 `kind`，是**它们规范化之后的字段集完全不同**：
 * kernel 那份必有 `language` / `packages`，shell 那份一个都没有。
 *
 * ## 探不到就说探不到
 *
 * 每个字段都可能探不到（那台机器没有 `git`、`/etc/os-release` 不存在、
 * 权限不够）。**探不到的字段一律不给**，而不是填 `"unknown"` 或空串——
 * 「没这个字段」读作「不知道」，而 `"unknown"` 会被当成一个真的值参与比对。
 */
import { createHash } from "node:crypto"

/** PATH 上一个工具的事实。**版本是它自己报的，不是从路径猜的** */
export interface ToolRecord {
  /** 解析到的可执行文件路径（`command -v` 的结果） */
  path: string
  /**
   * 它自报的版本串。**探不到就不给这个字段**——
   * 有的工具压根不认 `--version`，那时「路径有、版本不知道」是实话
   */
  version?: string
}

/**
 * 一台机器的快照（本地或远端）。
 *
 * **字段全是可选的，除了 `kind` 与 `where`。** 这不是偷懒：
 * 远端那台机器可能是个精简容器，`/etc/os-release`、`nproc`、`free` 一个都没有。
 * 那时如实少几个字段，比编几个值出来诚实。
 */
export interface ShellEnvironment {
  kind: "shell"
  /**
   * 这台机器是谁。**本地就是 `local`，远端是那条连接的 id**——
   * 不用主机名当身份：两台机器可以同名，而连接 id 是我们自己发的。
   */
  where: "local" | { connectionId: string }
  /** `uname -s`：Linux / Darwin … */
  os?: string
  /** `uname -r`：内核版本 */
  osRelease?: string
  /** `/etc/os-release` 里的 `PRETTY_NAME`：发行版 */
  distro?: string
  /** `uname -m`：x86_64 / aarch64 */
  arch?: string
  /** 逻辑核数 */
  cpus?: number
  /** 内存总量（KiB）。**记原始数字不记「16 GB」**——单位换算是展示层的事 */
  memoryKib?: number
  /** PATH 上的工具。**键是工具名**，只收计划里点名的那三个 */
  tools?: Record<string, ToolRecord>
  /** 工作区路径。它是这次快照的观察点 */
  workspace?: string
  /** 那个工作区是不是一个 git 仓库。**不知道就不给**，别拿 false 冒充「不是」 */
  workspaceIsGitRepo?: boolean
}

/** 内核快照。字段定义在 `kernel/environment.ts`，那里也是它的探测代码 */
export type { EnvironmentSnapshot as KernelEnvironment } from "../kernel/environment.js"

/**
 * shell 快照的内容指纹。
 *
 * 与 kernel 那支一样：**不含时间戳**，否则同一台机器每次连都是一个新指纹，
 * 去重白做。规范化里显式写上 `kind`——它让这份指纹**自我描述**，
 * 而不是靠「字段集不同」这个隐含前提。
 *
 * `where` 参与指纹：**同样一套软件装在两台机器上，是两个环境。**
 * 这正是 ②-B 判据「同一段代码能在本地和一台 SSH 机器上跑」要区分的东西。
 */
export function shellFingerprint(snap: ShellEnvironment): string {
  const canonical = JSON.stringify({
    kind: "shell",
    where: typeof snap.where === "string" ? snap.where : snap.where.connectionId,
    os: snap.os ?? null,
    osRelease: snap.osRelease ?? null,
    distro: snap.distro ?? null,
    arch: snap.arch ?? null,
    cpus: snap.cpus ?? null,
    memoryKib: snap.memoryKib ?? null,
    // 工具按名字排序：`Object.keys` 的顺序取决于插入顺序，那会让
    // 同一台机器因为探测顺序不同而算出两个指纹
    tools: Object.entries(snap.tools ?? {})
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([名, t]) => [名, t.path, t.version ?? null]),
    workspace: snap.workspace ?? null,
    workspaceIsGitRepo: snap.workspaceIsGitRepo ?? null,
  })
  return createHash("sha256").update(canonical).digest("hex")
}

/**
 * 两份快照能不能比。
 *
 * **「不可比」是一个答案，不是一次失败。** 拿一份内核快照和一份 shell 快照
 * 去问「环境一样吗」，唯一诚实的回答是「这两个问题问的不是同一件事」——
 * 而不是「不一样」（那会被读成「换了环境」，然后有人去找根本不存在的差异）。
 *
 * 这条在计划 §3.4 里是一句纪律；放在这里是为了让它**有个可调用的形式**，
 * 界面与账本都从这儿取答案，而不是各自写一遍 `a.kind === b.kind`。
 */
export type Comparison =
  | { comparable: false; reason: string }
  | { comparable: true; same: boolean }

export function compareEnvironments(
  a: { kind?: string; id?: string },
  b: { kind?: string; id?: string },
): Comparison {
  /**
   * **老行没有 `kind`，它们全是内核快照**——R5 之前这张表里只可能有那一种。
   * 这不是「缺失当相同」那条错误：这里的默认值是**可证的**，
   * 不是猜的（迁移里也是照这个把老行补成 `kernel` 的）。
   */
  const ka = a.kind ?? "kernel"
  const kb = b.kind ?? "kernel"
  if (ka !== kb) {
    return {
      comparable: false,
      reason: `一份是${说人话(ka)}快照，另一份是${说人话(kb)}快照——它们记的不是同一类事实`,
    }
  }
  return { comparable: true, same: a.id !== undefined && a.id === b.id }
}

function 说人话(kind: string): string {
  return kind === "shell" ? "机器" : kind === "kernel" ? "解释器" : kind
}
