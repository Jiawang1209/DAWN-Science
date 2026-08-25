/**
 * 工具权限判据（2026-08-13）。
 *
 * ## 它补的是一个「看起来有、其实没接」的洞
 *
 * `runtime/native.ts` 里那个 `ToolGate` 写得很认真，它自己的注释说
 * *「授权门静默失效比没有还危险」*——而 `wiring.ts` 构造运行时时
 * **从来没传过 gate**。也就是说 `providers.yaml` 里那行
 * `capabilities: [chat, exec]` 至今是装饰品，没有任何东西在执行它。
 *
 * ## 这里只判「危险不危险」，不判「该怎么办」
 *
 * 两件事分开：
 *
 * - `看风险()` —— **纯函数**，回答「这次调用踩到了什么」。可以逐条测。
 * - `照这一档()` —— 拿着风险和当前档位，回答「放行还是拦」。
 *
 * 合成一个的话，加一档就要重写所有判据；而判据才是最该被逐条钉死的部分。
 *
 * ## 名字不许比能力大
 *
 * **这不是沙箱。** 沙箱是操作系统层的强制隔离（Codex 在 macOS 上走 seatbelt、
 * Linux 上走 landlock）；这里是我们自己代码里的一道门——模型走我们包装过的
 * 工具时拦得住，绕过去就拦不住。所以档位名里没有「沙箱」二字，
 * 界面上也不该出现——**不存在的能力不该看起来存在**。
 *
 * （能拦得住的前提是 `noTools: "builtin"`：不关掉 pi 的内置工具，
 * 等于门旁边留着一扇没锁的侧门。那条已经在 `native.ts` 里守着了。）
 */
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path"
import { realpathSync } from "node:fs"
import { homedir } from "node:os"
import { 原始数据目录 } from "./science-layout.js"

/**
 * 档位（2026-08-23 起三档，学自 NanmiCoder/dsh-auto-mode 的 allow / ask / deny）：
 * - `allow-all`  全放行：只拦硬拒清单；
 * - `ask-risky`  问一句：危险操作弹一张卡让人点「允许这一次」，拒绝 / 超时都把理由回给模型让它改道；
 * - `deny-risky` 拦下：危险操作直接拒。
 * 「问一句」此前做不了，因为缺一条从主进程到界面再回来的往返；ACP 的权限卡（2026-08-16）把那条路铺好了，
 * 现在原生会话复用它。
 */
export type 权限档 = "allow-all" | "ask-risky" | "deny-risky"
export const 全部权限档: readonly 权限档[] = ["allow-all", "ask-risky", "deny-risky"]

/** 危险的种类。**分类不是为了好看**，是因为拒绝理由必须说清是哪一种 */
export type 危险类别 =
  | "原始数据"
  | "工作区之外"
  | "删除"
  | "装包"
  | "联网"
  | "发布"
  /**
   * **外部工具**（MCP，2026-08-15）。
   *
   * 与上面六种不同：那六种是**我们看得懂这条命令在干什么**才判出来的。
   * 而一个 MCP 工具是从网上装来的第三方进程，**我们看不见它内部干什么**——
   * `query` 可能是只读查询，也可能是 `DROP TABLE`。
   *
   * 所以判据不在「这次调用危不危险」上，而在**「这台服务器你过没过目」**：
   * 作者定的默认是「一律当可疑，需要点头」，点头的形态是那一屏上的
   * 「这台我信得过」。
   */
  | "外部工具"
  /**
   * **硬拒**（2026-08-23，学自 dsh-auto-mode 的「单调硬拒」）：sudo、删到 Home / 根 / 系统目录、
   * 凭据外传、强推远端。**任何档都拒，后面的规则与「问一句」都盖不过它。**
   */
  | "硬拒"

export interface 风险 {
  类别: 危险类别
  /** 给模型看的话。**要能据此改道**，不是一句「拒绝」 */
  说明: string
  /**
   * 连问都不问，直接拒（但不是硬拒：全放行档仍放）。给「目标看不清」的删除用：
   * glob / 变量 / 多目标 / 管道——人在卡上也判不了它会删掉什么，问了等于把责任推给人。
   */
  不可问?: boolean
}

export interface 语境 {
  /** 这段会话的工作区绝对路径 */
  workspace: string
  /**
   * 这是不是一台远端机器（计划 §3.2）。
   *
   * *「本地跑错一条命令，代价是你自己的工作区；**在共享集群上跑错，
   * 代价是别人的**。」* 所以远端的拒绝理由要指名这一点。
   */
  remote?: boolean
  /** 哪段会话在调（2026-08-22）。定时任务的会话按它自己存的档走，不跟全局设置 */
  sessionId?: string
  /**
   * **这段会话自己创建的文件**（2026-08-23，学自 dsh-auto-mode 的产物登记）：
   * 删它们是可重来的低风险，不问；删会话之前就有的才算「删除」。
   * 给绝对路径，答「是不是本会话建的且身份没变」。不给 = 一律当「之前就有的」。
   */
  本会话创建?: (绝对路径: string) => boolean
}

/**
 * **原始数据目录**（作者 2026-08-13 定的科研目录约定）。
 *
 * 这条判据此前我不敢做——`data/raw/` 是我猜作者的布局，猜错了要么形同虚设、
 * 要么拦错东西。**现在这个布局是作者自己声明的**，它就不是猜了。
 *
 * 覆盖原始数据是**不可撤销**的：模型可以重跑，那份数据不能。
 *
 * **从 `science-layout.ts` 取，不在这里再写一遍**：那份约定同时要写进
 * 工作区的 `AGENTS.md`（给模型看）。两处各写各的，改一处忘一处时，
 * **门拦的目录和文档写的目录会对不上**，而那种错没有任何东西会报警。
 */

/** 一条命令里出现这些就算装包。**它会改掉环境快照记下的那个环境** */
const 装包命令 =
  /\b(pip3?|uv|conda|mamba|npm|pnpm|yarn|apt|apt-get|brew)\s+(install|add|remove|uninstall)\b|\bR\s+-e\s+.*install\.packages|\binstall\.packages\s*\(|\brenv::(install|restore)\b/

/** 联网。**不含 `git push`**——那个是「发布」，性质不同，理由也该说得不同 */
const 联网命令 = /\b(curl|wget|scp|rsync|ssh|nc|ftp)\b/

/** 删掉东西。`mv` 也算——它能悄悄覆盖掉一个已有文件 */
const 删除命令 = /\brm\s|\brmdir\b|\bshred\b|\bmv\s|\btruncate\b|>\s*\/dev\/sd|\bfind\b.*-delete\b|\bxargs\b.*\brm\b/

const 发布命令 = /\bgit\s+push\b/

/**
 * 这次调用踩到了什么。**没踩到就是 undefined。**
 *
 * 只认四个工具名（`bash` / `edit` / `read` / `write`），那是 pi 内置工具的**真名字**
 * ——键错名字的判据永远不命中，而那比没有门更坏：门看起来在那儿。
 */
export function 看风险(
  工具名: string,
  参数: Record<string, unknown>,
  语境: 语境,
): 风险 | undefined {
  const 远端补一句 = (s: string) =>
    语境.remote ? `${s}（**这是一台远端机器**，跑错的代价可能是别人的）` : s

  if (工具名 === "read") {
    // **读不改东西。** 读到工作区外面确实有信息泄露的问题，但那要连着
    // 「哪些路径算敏感」一起想；现在拦它只会让人以为门在干活，而它在拦错东西
    return undefined
  }

  if (工具名 === "write" || 工具名 === "edit") {
    const p = typeof 参数.path === "string" ? 参数.path : undefined
    if (!p) return undefined
    // **root 与目标必须用同一套 realpath 基准**(审查 debug A4,连带修 A4 的回归):
    // macOS 上 workspace 常在 /var/folders,而 /var→/private/var。若只 realpath root、
    // 目标却基于原 workspace 解析,两者前缀(/private/var vs /var)对不上 → 误判「工作区之外」。
    // 所以:先 realpath root,再以它为基准解析相对路径,最后 realpath 父目录挡符号链接逃逸。
    // **只对本地会话做**:远端路径在本机 realpath 毫无意义(远端 /etc 与本机不是一回事)。
    let root = 语境.workspace
    if (!语境.remote) {
      try {
        root = realpathSync(语境.workspace)
      } catch {
        /* 工作区路径不存在(测试里常见):用字符串判 */
      }
    }
    let 绝对 = isAbsolute(p) ? resolve(p) : resolve(root, p)
    // 符号链接逃逸(`ln -s /etc ws/link` 后写 `link/passwd`)+ /var→/private/var 这类对齐:
    // realpath **目标存在的最长前缀**,拼上还不存在的尾段。这样目标与 root 用同一套真实路径基准,
    // 既挡住软链逃逸,又不会因 macOS 的 /var 软链把工作区内的路径误判成外面(A4 回归的根因)。
    if (!语境.remote) 绝对 = realpath存在前缀(绝对)
    const 相对 = relative(root, 绝对)
    const 在工作区里 = !(相对.startsWith("..") || isAbsolute(相对))
    // 工作区里的东西不走硬拒（工作区可能就在 /var/folders 这类地方——那是它自己的地盘）
    const 硬 = 在工作区里 ? undefined : 受保护路径理由(绝对, 语境.remote)
    if (硬) return { 类别: "硬拒", 说明: 远端补一句(`拒绝写入 ${p}：${硬}`) }

    // **`..` 开头 = 逃出了工作区**；绝对路径不在工作区下时 relative 也会这样开头
    if (!在工作区里) {
      return {
        类别: "工作区之外",
        说明: 远端补一句(
          `拒绝写入 ${p}：它在这段会话的工作区（${语境.workspace}）之外。请把产出写到工作区里面。`,
        ),
      }
    }

    if (相对 === 原始数据目录 || 相对.startsWith(`${原始数据目录}/`)) {
      return {
        类别: "原始数据",
        说明: 远端补一句(
          `拒绝写入 ${相对}：\`${原始数据目录}/\` 是原始输入，按本项目的目录约定**不修改**。` +
            `衍生数据请写到 \`data/processed/\`。`,
        ),
      }
    }
    return undefined
  }

  if (工具名 === "bash") {
    const cmd = typeof 参数.command === "string" ? 参数.command : ""
    if (!cmd) return undefined
    // ── 硬拒：任何档都拒，谁也盖不过（学自 dsh-auto-mode 的 hardDenyShellReason）──
    const 硬 = 硬拒理由(cmd)
    if (硬) return { 类别: "硬拒", 说明: 远端补一句(硬) }
    // 写入 / 删除目标的路径风险（审查 debug A1/A2/A3/A5）：受保护 → 硬拒，工作区外 → 可问。
    // 带语境(相对按 workspace 解析、认 cd、远端语义),补上 bash 这条最常用工具此前完全不看「写到哪」的洞。
    const 路 = bash路径风险(cmd, 语境)
    if (路) return { ...路, 说明: 远端补一句(路.说明) }
    /**
     * **顺序是有讲究的**：一条命令可能同时踩几样
     * （`pip install` 也会联网），报**最要紧的那个**——
     * 理由笼统的话，人和模型都不知道该改哪里。
     */
    if (发布命令.test(cmd)) {
      return { 类别: "发布", 说明: 远端补一句(`拒绝执行 \`${cmd}\`：推送到远端仓库是对外可见的动作，需要人来决定。`) }
    }
    if (装包命令.test(cmd)) {
      return {
        类别: "装包",
        说明: 远端补一句(
          `拒绝执行 \`${cmd}\`：装包会改变这段会话准入时记下的那个环境，` +
            `**已经记下的运行会因此变得不可复现**。需要装的话请让人来装。`,
        ),
      }
    }
    if (删除命令.test(cmd)) {
      const 目标 = 删除目标(cmd)
      // 目标看不清（glob / 变量 / 管道 / 多目标）：连问都不问——人在卡上也判不了它会删掉什么
      if (目标 === "看不清") {
        return {
          类别: "删除",
          不可问: true,
          说明: 远端补一句(`拒绝执行 \`${cmd}\`：删除的目标里有通配符、变量、管道或多个目标，看不清会删掉什么。请改成**每次一个可见的字面目标**再试。`),
        }
      }
      // 全是本会话自己建的：可重来的低风险，放
      if (目标.length > 0 && 语境.本会话创建 && 目标.every((t) => 语境.本会话创建!(isAbsolute(t) ? t : resolve(语境.workspace, t)))) return undefined
      return { 类别: "删除", 说明: 远端补一句(`拒绝执行 \`${cmd}\`：它会删除或覆盖会话之前就有的文件，而那不可撤销。能移动到 .dawn/trash/ 或用 git rm 就别直接删。`) }
    }
    if (联网命令.test(cmd)) {
      return { 类别: "联网", 说明: 远端补一句(`拒绝执行 \`${cmd}\`：它要访问网络。需要的话请人来确认。`) }
    }
    return undefined
  }

  // **不认识的工具一律放行。**
  //
  // 这是一个刻意的选择，也是一个已知的缺口：子 agent、MCP 带进来的工具
  // 都不在这四个名字里。**默认拒绝会让「加一个工具」变成「悄悄坏掉一个功能」**，
  // 而现在我们还没有能力说清每一个外来工具在干什么。
  // 缺口写在这里，不藏在「反正没人会用」里。
  return undefined
}

/** 门的答复（2026-08-23 起三态；`ToolGate` 的契约随之改） */
export type 门的决定 = { kind: "allow" } | { kind: "deny"; reason: string } | { kind: "ask"; reason: string; 类别: 危险类别 }

/**
 * 三态（学自 dsh-auto-mode）：硬拒任何档都拒；全放行只拦硬拒；拦下档直接拒；
 * 问一句档把危险操作交给人——但「目标看不清」的删除连问都不问。
 */
export function 照这一档(档: 权限档, 风险: 风险 | undefined): 门的决定 {
  if (!风险) return { kind: "allow" }
  if (风险.类别 === "硬拒") return { kind: "deny", reason: 风险.说明 }
  if (档 === "allow-all") return { kind: "allow" }
  if (档 === "deny-risky" || 风险.不可问) return { kind: "deny", reason: 风险.说明 }
  return { kind: "ask", reason: 风险.说明, 类别: 风险.类别 }
}

/**
 * 造一个门。**这就是 `wiring.ts` 要传给 `NativeRuntime` 的那个东西。**
 *
 * 档位用取的（`取档()`）而不是传值：档位在会话中途可以改，
 * 而门是建会话时装上去的——传值的话，改完档要等下次建会话才生效，
 * 那是「设置里改了、界面上没反应」的经典形状。
 *
 * 语境反过来是**运行时传进来的**：一个门服务所有会话，而工作区各不相同。
 */
/**
 * 一台 MCP 服务器的工具该不该放行（2026-08-15）。
 *
 * **`trusted` 不是「我信任这家公司」，是「我已经过目了这台有哪些工具」**——
 * 所以它按服务器给，不按工具给：工具清单会随服务器版本变，
 * 而按工具记住的话，服务器悄悄多出一个 `delete_all` 就自动是被允许的。
 *
 * 拒绝时**必须说清怎么才能允许**。一句「被拒了」会让模型反复重试同一条路，
 * 而人根本不知道开关在哪。
 */
export function 看MCP风险(服务器名: string, 信得过: boolean | undefined): 风险 | undefined {
  if (信得过) return undefined
  return {
    类别: "外部工具",
    说明:
      `这是外部 MCP 服务器「${服务器名}」提供的工具，还没有被过目。` +
      `当前是「拦下危险操作」档，所以没有执行。` +
      `要用它：去「MCP 服务器」那一屏，把「${服务器名}」的「这台我信得过」打开；` +
      `或者把权限档切成「全部允许」。`,
  }
}

/**
 * 造一个 MCP 的门。与 `造门` 同一副做法：**两样都用取的**，因为它们中途会变。
 *
 * `取信得过` 由装配注入（读本机的设置库）。**判据不读配置文件**——
 * 项目级名单会跟着仓库被 clone，让它声明自己可信等于没有门。
 */
export function 造MCP门(取档: () => 权限档, 取信得过: (服务器名: string) => boolean) {
  return (服务器名: string): 门的决定 => 照这一档(取档(), 看MCP风险(服务器名, 取信得过(服务器名)))
}

export function 造门(取档: (sessionId?: string) => 权限档) {
  return (工具名: string, 参数: Record<string, unknown>, 语境: 语境): 门的决定 =>
    照这一档(取档(语境.sessionId), 看风险(工具名, 参数, 语境))
}

// ── 硬拒清单与删除目标（2026-08-23，照 dsh-auto-mode 的 shell.ts / paths.ts 重写成我们的规则）──

const HOME = homedir()
/** 受保护的根：删到、写到这些地方任何档都拒 */
const 受保护前缀 = [
  "/", "/etc", "/usr", "/bin", "/sbin", "/var", "/System", "/Library", "/private/etc", "/Applications",
  HOME,
  join(HOME, ".ssh"), join(HOME, ".aws"), join(HOME, ".gnupg"), join(HOME, ".kube"), join(HOME, ".config"),
  join(HOME, "Library"), join(HOME, "Desktop"), join(HOME, "Documents"),
]

/**
 * realpath **存在的最长前缀**,拼回还不存在的尾段（审查 debug A4）。
 * write 的目标文件常还不存在(是创建),无法整段 realpath;但要挡符号链接逃逸、
 * 又要与 realpath 后的工作区根用同一套真实路径基准(macOS 的 /var→/private/var),
 * 只能 realpath 目标里已经存在的那部分。全程不存在(如纯虚构绝对路径)则原样返回。
 */
function realpath存在前缀(p: string): string {
  let cur = resolve(p)
  const 尾: string[] = []
  for (;;) {
    try {
      return 尾.length > 0 ? join(realpathSync(cur), ...尾) : realpathSync(cur)
    } catch {
      const 父 = dirname(cur)
      if (父 === cur) return resolve(p) // 到根都不存在:原样
      尾.unshift(basename(cur))
      cur = 父
    }
  }
}

/** 路径本身（不含子项）就是受保护的根，或者在凭据目录底下。
 *
 * `remote`（审查 debug A5）:远端会话里路径是**远端**机器的,本机 HOME/`/Users` 的概念
 * 不适用——旧实现把本机清单套到远端,导致远端用户自己的家目录 `/home/<user>` 被误判
 * 「系统目录」写不进(任何档),而别人的 `/data` 反倒放行。远端改用**跨机器通用**的判据:
 * 系统目录(/etc /usr /root …)+ 任意用户的凭据目录(`/home/<任意>/.ssh`、`/root/.ssh`),
 * 不碰「家目录顶层点文件」这类依赖本机 HOME 的规则(那要知道远端是谁,我们不知道)。
 */
export function 受保护路径理由(绝对: string, remote?: boolean): string | undefined {
  const p = resolve(绝对).replace(/\/+$/, "") || "/"
  if (remote) {
    // 远端:系统目录(含 /home /Users 顶层本身,但不含其下的用户目录)
    const 远端系统 = ["/etc", "/usr", "/bin", "/sbin", "/boot", "/sys", "/proc", "/dev", "/lib", "/lib64", "/root", "/var/lib", "/var/spool"]
    if (p === "/") return `/ 是根目录,不碰。`
    if (远端系统.some((r) => p === r || p.startsWith(`${r}/`))) return `${p} 是远端机器的系统目录,不碰。`
    // 任意用户的凭据目录:/home/<user>/.ssh、/root/.ssh 等
    if (/^\/(home\/[^/]+|root)\/\.(ssh|aws|gnupg|kube)(\/|$)/.test(p)) return `${p} 是凭据目录,不碰。`
    return undefined
  }
  if (受保护前缀.some((r) => (r.replace(/\/+$/, "") || "/") === p)) return `${p} 是系统目录、你的主目录或它的顶层目录，不碰。`
  // 系统目录**连里面的一起**（2026-08-23 审查抓的：此前只比根本身，`rm -rf /usr/lib`、`write ~/.zshrc` 只算「工作区外」）；主目录只拦顶层文件，子目录让给工作区判
  // `/var` 不整棵算（macOS 的临时目录在 /var/folders），只拦 /var 的顶层；`/Users` `/home` 拦到别人的主目录
  const 系统根 = ["/etc", "/usr", "/bin", "/sbin", "/System", "/Library", "/private/etc", "/Applications", "/Users", "/home"]
  if (系统根.some((r) => p === r || p.startsWith(`${r}/`)) && !p.startsWith(`${HOME}/`)) return `${p} 在系统目录里，不碰。`
  if (p.startsWith(`${HOME}/`) && !p.slice(HOME.length + 1).includes("/") && /^\./.test(p.slice(HOME.length + 1))) return `${p} 是主目录顶层的点文件（shell / 工具的配置），不碰。`
  const 凭据 = [".ssh", ".aws", ".gnupg", ".kube"].map((d) => join(HOME, d))
  if (凭据.some((d) => p === d || p.startsWith(`${d}/`))) return `${p} 在凭据目录里，不碰。`
  return undefined
}

/**
 * 一条 bash 命令的**写入目标**（审查 debug A1/A2）:抓明确指向文件的写——
 * 重定向 `> >> N> &>`、`tee [-a]`、`cp/mv/install/rsync 的目的地`、`dd of=`。
 * **只抓字面目标**:含变量/glob/命令替换的目标不进清单(大量合法用法是 `echo x > $TMP`、
 * `> out-*.log`,硬判会误伤;它们不指向明确的受保护路径,交给别处)。
 */
export function 写入目标(原cmd: string): string[] {
  const cmd = 原cmd.replace(/\\\r?\n/g, " ")
  const 出: string[] = []
  const 干净 = (t: string) => t.replace(/^["']|["']$/g, "")
  const 字面 = (t: string) => Boolean(t) && !/[|`$*?{}[\]]/.test(t) && !t.startsWith("-") && !/^\/dev\//.test(t)
  // 重定向:>file >>file 1>file 2>file &>file(排除 >&1 这类 fd 复制)
  for (const m of cmd.matchAll(/(?:^|[\s;&|(])(?:\d*|&)>>?\s*("[^"]+"|'[^']+'|[^\s;&|()<>]+)/g)) {
    const t = 干净(m[1]!)
    if (字面(t) && t !== "&1" && t !== "&2") 出.push(t)
  }
  // tee [-a] file
  for (const m of cmd.matchAll(/\btee\s+(?:-a\s+)?("[^"]+"|'[^']+'|[^\s;&|()<>]+)/g)) {
    const t = 干净(m[1]!)
    if (字面(t)) 出.push(t)
  }
  const 段 = cmd.split(/&&|\|\||;|\n|\|/).map((x) => x.trim()).filter(Boolean)
  for (const 句 of 段) {
    const ddm = 句.match(/\bdd\b[^\n]*\bof=("[^"]+"|'[^']+'|[^\s;&|()]+)/)
    if (ddm) {
      const t = 干净(ddm[1]!)
      if (字面(t)) 出.push(t)
    }
    if (/^(cp|mv|install|rsync)\b/.test(句) || /\s(cp|mv|install|rsync)\s/.test(句)) {
      if (/[|`$*?{}[\]]/.test(句)) continue // 含变量/glob:看不清,跳过
      const 词 = 句.split(/\s+/).filter(Boolean)
      const i = 词.findIndex((w) => /^(cp|mv|install|rsync)$/.test(w))
      if (i < 0) continue
      const 参 = 词.slice(i + 1).filter((w) => !w.startsWith("-"))
      if (参.length >= 2) {
        const t = 干净(参[参.length - 1]!)
        if (字面(t)) 出.push(t)
      }
    }
  }
  return 出
}

/**
 * bash 命令里写入 / 删除目标的**路径风险**（审查 debug A1/A2/A3/A5）——带语境:
 * 相对路径按 workspace 解析(不是 process.cwd,那是 A3 的洞);命令里若先 `cd` 到
 * ~ / 绝对目录,后续相对路径以它为基准(`cd ~ && rm .ssh/id_rsa` 因此被正确解析成 `~/.ssh/id_rsa`);
 * 远端会话用远端受保护判据。指向受保护路径 → 硬拒;明确写到工作区之外 → 工作区之外(可问)。
 */
function bash路径风险(cmd: string, 语境: 语境): 风险 | undefined {
  const cd基准 = ((): string | undefined => {
    const m = cmd.match(/\bcd\s+("[^"]+"|'[^']+'|[^\s;&|()]+)/)
    if (!m) return undefined
    const d = m[1]!.replace(/^["']|["']$/g, "")
    if (d === "~" || d === "$HOME" || d === "${HOME}") return HOME
    if (d.startsWith("~/")) return join(HOME, d.slice(2))
    if (isAbsolute(d)) return resolve(d)
    return undefined // 相对 cd 判不准,不特殊处理
  })()
  const 解析 = (t: string): string => {
    if (t === "~") return HOME
    if (t.startsWith("~/")) return join(HOME, t.slice(2))
    if (isAbsolute(t)) return resolve(t)
    return resolve(cd基准 ?? 语境.workspace, t)
  }
  const 写 = 写入目标(cmd)
  const 删 = 删除目标(cmd)
  const 删目标 = 删 === "看不清" ? [] : 删
  // 受保护 → 硬拒(写与删都算)
  for (const t of [...写, ...删目标]) {
    const 理由 = 受保护路径理由(解析(t), 语境.remote)
    if (理由) return { 类别: "硬拒", 说明: `拒绝执行 \`${cmd}\`：${理由}` }
  }
  // 明确写到工作区之外(非受保护) → 工作区之外(可问)
  for (const t of 写) {
    const abs = 解析(t)
    const rel = relative(语境.workspace, abs)
    if (rel.startsWith("..") || isAbsolute(rel)) {
      return { 类别: "工作区之外", 说明: `拒绝执行 \`${cmd}\`：它写到 ${t}，在这段会话的工作区（${语境.workspace}）之外。请写到工作区里面。` }
    }
  }
  return undefined
}

const 凭据形状 = /(BEGIN (RSA |OPENSSH )?PRIVATE KEY|\b(sk|ghp|github_pat|xox[baprs])[-_][A-Za-z0-9_-]{8,}\b|Bearer\s+[A-Za-z0-9._~+/-]{8,}|\.ssh\/(id_|config)|\.aws\/credentials|\$\{?[A-Z_]*(TOKEN|SECRET|API_KEY|PASSWORD)[A-Z_]*\}?)/i

export function 硬拒理由(原cmd: string): string | undefined {
  // 行续接先接回一行（2026-08-23 审查抓的）：`rm -rf \` + 换行 + `/` 被按行切开后目标成了 `\`，而 shell 执行的是 `rm -rf /`
  const cmd = 原cmd.replace(/\\\r?\n/g, " ")
  if (/(^|[\s;&|(])(sudo|doas|su)(\s|$)/.test(cmd)) return `拒绝执行 \`${cmd}\`：提权（sudo / su）任何档都不放。`
  if (/\bgit\b.*\bpush\b.*(--force\b|\s-f\b|\s\+[^\s]+(:|\s|$))/.test(cmd)) return `拒绝执行 \`${cmd}\`：强推会覆盖远端历史，任何档都不放。`
  if (/\b(curl|wget|nc|scp|rsync|ssh|ftp|sftp|telnet)\b/.test(cmd) && 凭据形状.test(cmd)) return `拒绝执行 \`${cmd}\`：命令里带着私钥 / token 形状的东西还要出网，这是凭据外传的形状，任何档都不放。`
  if (/\b(mkfs|diskutil\s+erase|dd\s+if=.*of=\/dev\/|shutdown|reboot|launchctl\s+unload|chmod\s+-R\s+777\s+\/)/.test(cmd)) return `拒绝执行 \`${cmd}\`：它会动系统或整块盘，任何档都不放。`
  // `find / -delete`、`find ~ -delete`：目标是算出来的，但起点已经说明了一切
  if (/\bfind\s+(\/(\s|$)|\/(Users|home|etc|usr|var|bin|System|Library)\b|\$\{?HOME\}?|~(\/|\s|$))[^\n]*-delete\b/.test(cmd)) return `拒绝执行 \`${cmd}\`：从根或主目录起 find -delete，任何档都不放。`
  if (删除命令.test(cmd)) {
    const 目标 = 删除目标(cmd)
    if (目标 !== "看不清") {
      for (const t of 目标) {
        const 理由 = 受保护路径理由(t.startsWith("~") ? join(HOME, t.slice(1)) : t)
        if (理由) return `拒绝执行 \`${cmd}\`：${理由}`
      }
    } else if (/\b(rm|rmdir|shred)\b.*(\$\{?HOME\}?|~(\/|\s|$)|\s\/(\s|$|\*)|\s\/(Users|home|etc|usr|var|bin|System|Library)(\/|\s|$)|\$\([^)]*\/[^)]*\))/.test(cmd)) {
      // 看不清的删除里只要出现根 / 主目录 / 系统目录 / 命令替换里带斜杠——宁可多拒（2026-08-23 审查抓的：`\rm -rf /`、`rm -rf ${HOME}`、`rm -rf $(echo /)` 此前都漏过）
      return `拒绝执行 \`${cmd}\`：删除的目标指向主目录、根或系统目录，任何档都不放。`
    }
  }
  return undefined
}

/**
 * 一条 rm / rmdir / shred / mv 的目标。**看不清就说看不清**（学自它的「动态目标直接拒」）：
 * 有通配符、变量、命令替换、管道进来的、或者一条命令里多个删除——都算看不清。
 * 只处理最常见的形状；不认识的形状一律「看不清」，宁可多拒不可漏放。
 */
export function 删除目标(原cmd: string): string[] | "看不清" {
  const cmd = 原cmd.replace(/\\\r?\n/g, " ")
  // find -delete / xargs rm：目标是算出来的，整条都看不清
  if (/\bfind\b.*-delete\b|\bxargs\b/.test(cmd)) return "看不清"
  const 段 = cmd.split(/&&|\|\||;|\n/).map((x) => x.trim()).filter(Boolean)
  const 删段 = 段.filter((x) => /^(rm|rmdir|shred|mv|truncate)\b/.test(x) || /\s(rm|rmdir|shred|mv|truncate)\s/.test(x))
  if (删段.length !== 1) return "看不清"
  const 句 = 删段[0]!
  if (/[|`$*?{}\[\]]/.test(句) || /\bxargs\b|\bfind\b/.test(句)) return "看不清"
  const 词 = 句.split(/\s+/).filter(Boolean)
  const i = 词.findIndex((w) => /^(rm|rmdir|shred|mv|truncate)$/.test(w))
  if (i < 0) return "看不清"
  const 目标 = 词.slice(i + 1).filter((w) => !w.startsWith("-"))
  if (目标.length === 0) return "看不清"
  // mv：最后一个是去处，前面的是被覆盖 / 挪走的；只有「两个」才看得清
  if (词[i] === "mv") return 目标.length === 2 ? [目标[0]!] : "看不清"
  if (目标.length > 1) return "看不清"
  return 目标.map((t) => t.replace(/^["']|["']$/g, ""))
}
