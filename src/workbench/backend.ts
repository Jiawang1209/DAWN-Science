/**
 * Workbench 的真实后端（补 Part 1 的收口）。
 *
 * Task 2.3 交付了 `WorkbenchBackend` 接口与服务端；本文件是它的真实现，
 * 把 ①-A 的 `SessionManager` / `LeaseManager` 与 ①-B 的 `ProjectManager` /
 * `RunStore` / git 事实拼起来。
 *
 * **业务性失败一律抛 `fault(code, message)`**，而不是让它变成 `internal_error`——
 * 否则「项目不存在」与「数据库炸了」在 UI 上会长得一模一样。
 */
import type { ProviderRegistry } from "../config/schema.js"
import { addNativeAgent, setProviderConnection } from "../config/writer.js"
import { homedir } from "node:os"
import { randomUUID } from "node:crypto"
import { fingerprintOf, type EnvironmentSnapshot } from "../kernel/environment.js"
import type { EnvironmentStore } from "../store/environments.js"
import { 探测机器, 本地执行 } from "../env/probe.js"
import { 科研目录, 约定正文, pi会读的指令文件, 我们写的指令文件 } from "../policy/science-layout.js"
import type { ShellEnvironment } from "../env/snapshot.js"
import { deriveSessionTitle } from "../session/title.js"
import { readFile } from "node:fs/promises"
import { extname } from "node:path"
import { resizeImage } from "@earendil-works/pi-coding-agent"
import type { ImageAttachment } from "../runtime/types.js"
import type { SessionManager } from "../session/manager.js"
import type { ProjectManager } from "../project/manager.js"
import type { RunStore } from "../store/runs.js"
import type { SettingsStore } from "../store/settings.js"
import { 本地日期 } from "../store/usage.js"
import { 合名单 } from "../mcp/名单.js"
import { loadSkills } from "@earendil-works/pi-coding-agent"
import { addMcpServer, removeMcpServer, 从JSON解出 } from "../config/mcp-writer.js"
import { diagnoseInterpreter } from "../kernel/specs.js"
import {
  listDirectory as listWorkspaceDirectory,
  readFileForPreview as readWorkspaceFile,
  分类预览,
  mediaTypeOf,
  resolveInWorkspace,
} from "../files/access.js"
import type { RunRecorder } from "../project/run-recorder.js"
import type { ProjectStore } from "../store/projects.js"
import { diffSince, snapshot, NotAGitRepoError, type GitBaseline } from "../project/git-facts.js"
import { discoverCliModels } from "../runtime/cli/models.js"
import { familyOf } from "../runtime/family.js"
import { UserFacingError } from "../errors.js"
import { fault, type WorkbenchBackend } from "./server.js"
import type { SessionTranscripts } from "./events.js"
import type { RestoredItem } from "../runtime/types.js"
import type { TranscriptItem } from "../protocol/events.js"
import type { ConnectionRecord, ConnectionStore } from "../store/connections.js"
import type { TaskStore } from "../store/tasks.js"
import type { RemoteConnections } from "../remote/connections.js"
import { discoverKernelSpecs } from "../kernel/specs.js"
import { AGENTS_DIR, loadSubagentDefinitions } from "../subagent/definitions.js"
import { join } from "node:path"
import { mkdirSync, existsSync, writeFileSync } from "node:fs"

/**
 * 一条恢复出来的历史 → 界面认识的条目（会话续接，2026-08-11）。
 *
 * **工具调用一律记成「已完成」**：结果就在记录里，
 * 而一条永远转圈的「执行中」会让人以为它还在跑。
 */
function 还原成条目(x: RestoredItem, i: number): TranscriptItem {
  if (x.kind === "text") {
    return { type: "turn", id: `r${i}`, who: x.who, text: x.text, final: true }
  }
  return {
    type: "tool",
    id: x.id || `rt${i}`,
    name: x.name,
    input: x.input,
    status: x.isError ? "error" : "ok",
    ...(x.result === undefined ? {} : { result: x.result }),
  }
}

/**
 * 凭证库的最小接口。后端只需要这四个动作，不关心它存在哪、怎么加密。
 *
 * **2026-08-08 返工 R2：键从 endpointId 改为 providerId。**
 * 配置里已经没有 endpoints 段了，凭证按 pi 的 provider 存。
 */
export interface CredentialsPort {
  get(providerId: string): string | undefined
  set(providerId: string, secret: string): void
  delete(providerId: string): void
  configured(): string[]
  isEncrypted(): boolean
}

export interface WorkbenchBackendOptions {
  projects: ProjectManager
  projectStore: ProjectStore
  runs: RunStore
  /**
   * 临时会话的目录根（2026-08-11）。**不给就开不了临时会话**，如实说，
   * 不偷偷退回某个猜出来的路径——那个路径上会真的落文件。
   */
  scratchRoot?: string
  /**
   * `providers.yaml` 的路径。**给了才能在界面里加 agent**——
   * 没给就如实说「本次运行没有装配」，不偷偷退回某个猜出来的路径。
   */
  configPath?: string
  /** 应用级设置。两个解释器路径住在这里（②-A 后续） */
  settings?: SettingsStore
  /**
   * 任务（T1）。**不给则那三个操作如实说「本次运行没有装配」**——
   * 不返回空名单假装「你还没建过任务」。
   */
  tasks?: TaskStore
  /**
   * 远端连接（②-B · R3）。**名单在库里，谁连着在管理器里。**
   *
   * **不给则那五个操作如实说「本次运行没有装配」**，不假装一个空名单——
   * 空名单会被读成「你还没加过服务器」，那和「这个功能没接上」是两回事。
   */
  remote?: {
    store: ConnectionStore
    manager: RemoteConnections
  }
  /** 环境快照的落库处（S17）。**没装配也能用**，只是快照不持久 */
  environments?: EnvironmentStore
  /**
   * 一个会话的环境在准入时冻结好了（②-B · R5）。
   *
   * **接线是单向的**：记账员比后端先造出来，所以由后端把 id **推**过去，
   * 而不是让记账员反过来问后端。
   */
  onEnvironmentFrozen?: (sessionId: string, snapshotId: string) => void
  /**
   * 交给系统打开一个**绝对路径**（②-A′ · F3）。
   *
   * **端口注入，不在后端里 import Electron**——后端要能在没有 Electron 的
   * 测试里跑。路径的合法性由后端自己保证（走 `resolveInWorkspace`），
   * 这个端口只负责「交给系统」。
   */
  openPath?: (absolutePath: string) => Promise<string>
  sessions: SessionManager
  credentials: CredentialsPort
  /**
   * MCP（2026-08-15）。**不给就没有那四个操作能答的东西**——
   * 那时它们如实说「本次运行没有装配 MCP」，不假装有一个空名单。
   */
  mcp?: {
    池: import("../mcp/客户端.js").MCP池
  }
  /**
   * 技能的三个位置（S20，2026-08-15）。**与运行时用的是同一份**——
   * 两处各写各的话，屏上列的与实际跑的会分家。
   */
  skills?: { 全局目录?: string; 项目目录名?: string; 自带目录?: string }
  /** 配置里的 provider 注册表，供界面列出可选 agent */
  registry: ProviderRegistry
  /** 会话事件中枢。界面靠它才能看见 agent 说了什么 */
  events: SessionTranscripts
  /**
   * 模型目录：该 provider 真正有哪些模型（①-B″ · U2）。
   *
   * **不给则 `available` 缺省**——缺省的含义是「不知道」，不是「没有」。
   * 界面因此不会把「后端没接这个端口」显示成「这个 provider 一个模型都没有」。
   */
  models?: {
    available(providerId: string): Promise<string[]>
    /** pi 认识的全部 provider。**「我能配谁」**，与 `getProviders` 的「我配过谁」不同 */
    known?(): Promise<string[]>
    /** 地址 pi 不自带的那几个。**界面据此给输入框** */
    needsBaseUrl?(): Promise<string[]>
    /**
     * provider 的显示名（`deepseek` → `DeepSeek`）。
     *
     * **不给则界面退回用 id**——缺省是「不知道」，那时用 id 至少是实话。
     */
    names?(): Promise<Record<string, string>>
  }
  /** provider 连接设置变了。装配层据此重新生成 `models.json` 并让下次用上 */
  onProvidersChanged?: (providers: ProviderRegistry["providers"]) => void
  /**
   * 去哪找外部 CLI 自己的配置（codex 的 `models_cache.json`）。
   *
   * **可注入的理由是测试隔离**：不注入时读开发机真实的家目录，
   * 而 e2e 的第一条原则是「每个用例一套全新的目录」——
   * 2026-08-09 加自动发现时捅了这个洞，当场补上。
   */
  cliHome?: string
  /** 凭证变更后让 pi 侧缓存失效。不给则不失效（测试场景） */
  invalidateCredentials?: (providerId: string) => void
  /**
   * Run 记账员。**不给则不记账**——但那意味着 Runs 面板永远是空的，
   * 只有不关心历史的测试才该省略它（不变式 3）。
   */
  runRecorder?: RunRecorder
}

/**
 * 扩展名 → MIME（协议 4.12）。
 *
 * **不去嗅探文件头**：那是另一件事，而且嗅错了的代价是把一个 PDF 当成图送出去。
 * 认不出来就报错——**「我们不知道这是什么」比「猜一个」诚实**。
 */
const 图片类型: Readonly<Record<string, string>> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".bmp": "image/bmp",
  ".tif": "image/tiff",
  ".tiff": "image/tiff",
}

/**
 * 一张图**不缩放也送得出去**的上限。
 *
 * 各家的内联图片上限普遍在 5MB（base64 之后），而 base64 会把体积撑大约 4/3。
 * 3.5MiB 的原始字节 ≈ 4.7MB 的 base64，留了一点余量。
 * **这个数是我们自己定的**，pi 没有把它的那份导出来。
 */
const 免缩上限 = 3.5 * 1024 * 1024

/**
 * 把路径读成能直接送进模型的附件（协议 4.12，2026-08-13）。
 *
 * ## 依赖决策：坐在 `resizeImage` 上，而不是 `processImage`
 *
 * ① **用到的导出符号**：`resizeImage(bytes, mimeType, opts)` →
 *    `{ data /* 已经是 base64 *\/, mimeType, … } | null`。
 * ② **放弃了什么**：pi 内部那个 `processImage` 更合身（它就返回
 *    `{ok, data, mimeType, hints}`），但**它不在 pi 的公开出口里**，
 *    而 package.json 的 exports 只放行 `.` / `./rpc-entry` / `./client`——
 *    深引会在打包时炸，而且那是踩进别人内部结构。
 *    代价是拿不到它的 `hints`（那几句给模型的尺寸说明）。
 * ③ **我们的不变式挂在哪**：`resizeImage` 在 Photon(WASM) 起不来时
 *    **返回 null**——照抄它的话，一台没有 WASM 的机器上每一张图都会失败。
 *    所以**小图根本不进缩放**（直接 base64），只有真的超上限才交给它；
 *    那时 null 是一个诚实的失败，点名是哪一张（规格 7.5）。
 */
/**
 * 把要送进模型的那几张缩成**转录里存的预览**（协议 4.14）。
 *
 * **失败就跳过这一张，不抛**：预览只是给人看的，
 * 而这一刻那句话已经发出去了——为了一张缩略图把整轮对话弄失败是本末倒置。
 */
async function 缩成预览(附图: readonly ImageAttachment[]): Promise<string[]> {
  const 出: string[] = []
  for (const one of 附图) {
    try {
      const bytes = Buffer.from(one.data, "base64")
      const r = await resizeImage(bytes, one.mimeType, { maxWidth: 320, maxHeight: 320 })
      出.push(r ? `data:${r.mimeType};base64,${r.data}` : `data:${one.mimeType};base64,${one.data}`)
    } catch {
      // 缩不动就原样给：**看得见比省内存重要，而这里只有几张**
      出.push(`data:${one.mimeType};base64,${one.data}`)
    }
  }
  return 出
}

async function 读成附件(
  来源: readonly ({ from: "path"; path: string } | { from: "bytes"; data: string; mimeType: string })[],
): Promise<ImageAttachment[]> {
  const 出: ImageAttachment[] = []
  for (const one of 来源) {
    /**
     * **粘贴进来的直接就位**：渲染进程手上已经是字节了，
     * 这一层没有任何可做的——不读盘、不改形状。
     *
     * 缩放这里也不做：剪贴板里的截图是屏幕尺寸的，通常远在上限之内；
     * 真的超了的话由下面那条路一样的判断接住——**但那要有字节长度，
     * 而 base64 的长度换算成原始字节是 ×3/4**。
     */
    if (one.from === "bytes") {
      const 原始字节 = Math.floor((one.data.length * 3) / 4)
      if (原始字节 > 免缩上限) {
        throw fault(
          "invalid_request",
          `粘贴的这张图太大了（约 ${Math.round(原始字节 / 1024 / 1024)}MB，上限 3.5MB）`,
        )
      }
      出.push({ data: one.data, mimeType: one.mimeType })
      continue
    }
    const p = one.path
    const mime = 图片类型[extname(p).toLowerCase()]
    if (!mime) {
      throw fault(
        "invalid_request",
        `不认识这个图片格式：${p}（认得 png / jpg / gif / webp / bmp / tiff）`,
      )
    }
    let bytes: Buffer
    try {
      bytes = await readFile(p)
    } catch (e) {
      throw fault(
        "invalid_request",
        `读不了这张图：${p}——${e instanceof Error ? e.message : String(e)}`,
      )
    }
    if (bytes.byteLength <= 免缩上限) {
      出.push({ data: bytes.toString("base64"), mimeType: mime })
      continue
    }
    const r = await resizeImage(bytes, mime, { maxBytes: 免缩上限 })
    if (!r) {
      throw fault(
        "invalid_request",
        `这张图太大且缩不下来：${p}（${Math.round(bytes.byteLength / 1024 / 1024)}MB）`,
      )
    }
    出.push({ data: r.data, mimeType: r.mimeType })
  }
  return 出
}

/**
 * 远端预览的上界（批 3，2026-08-17）。
 *
 * 比本地那几档小得多：远端每一个字节都要过网络，
 * 而**一个默默拉半天的预览与「卡住了」在屏幕上没有区别**。
 * 「要不要传过来看」那一问连同进度条在批 4 做。
 */
const 远端预览上界 = 16 * 1024 * 1024

export function createWorkbenchBackend(opts: WorkbenchBackendOptions): WorkbenchBackend {
  const { skills, mcp, projects, projectStore, runs, sessions, credentials, registry, events, invalidateCredentials, runRecorder, models, cliHome, settings, openPath, environments, configPath, onProvidersChanged, scratchRoot, remote, tasks, onEnvironmentFrozen } = opts

  /**
   * 远端那一套装配好了没有。**没装配就如实说**，不返回一个空名单——
   * 空名单会被读成「你还没加过服务器」，那和「这个功能没接上」是两回事。
   */
  /**
   * 拿一台**连着的**服务器的执行器（批 3，2026-08-17）。
   *
   * **没连上就说没连上**，不替人去连：一次「看看文件」不该顺带
   * 拨一个可能要输密码、可能要等十几秒的连接。
   */
  const 连着的 = (connectionId: string) => {
    const e = 远端().manager.executorOf(connectionId)
    if (!e) throw fault("invalid_request", "这台服务器还没连上——先连上再看它的文件")
    return e
  }

  /**
   * 列远端一层目录。
   *
   * **没有守卫**，这是有意的：本地那条守的不是用户，是**渲染进程**
   * （一开读文件的口子，它就能问后端要任意路径）；而远端你就是那个账号本人，
   * SFTP 已经能碰它能碰的一切，再画一条我们自己的线是演戏。
   */
  const 远端列目录 = async (connectionId: string, path: string) => {
    const 目录 = path || "."
    const 条目 = await 连着的(connectionId).readdir(目录).catch((e: unknown) => {
      // **原样说清楚是哪个路径、什么错**，不笼统地说「读不了」
      throw fault("invalid_request", `读不了 ${目录}：${e instanceof Error ? e.message : String(e)}`)
    })
    return {
      path: 目录,
      entries: 条目
        .map((e) => ({
          name: e.name,
          kind: e.directory ? ("dir" as const) : ("file" as const),
          // **目录不报大小**——目录的「大小」是个误导（与本地那条同一份口径）
          ...(e.directory ? {} : { size: e.size }),
          /**
           * SFTP 的 `readdir` 不给修改时间。**如实给一个占位而不是编一个**——
           * 协议要求这一格，但我们没有它。批 4 走 `stat` 时再补。
           */
          modifiedAt: new Date(0).toISOString(),
        }))
        .sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === "dir" ? -1 : 1)),
      ignored: 0,
      omitted: 0,
    }
  }

  /**
   * 读一个远端文件供预览。**分类与本地共用同一份**（`分类预览`）——
   * 两份的话，本地和远端会对同一个 `.csv` 说两种话。
   */
  const 远端读文件 = async (connectionId: string, path: string) => {
    const e = 连着的(connectionId)
    const st = await e.stat(path).catch((err: unknown) => {
      throw fault("invalid_request", `读不了 ${path}：${err instanceof Error ? err.message : String(err)}`)
    })
    if (st.directory) throw fault("invalid_request", `${path} 是目录，不是文件`)
    /**
     * **超过上界就不传**（批 3）。
     *
     * 远端预览本质上是一次下载；一个 800 MB 的文件默默拉半天，
     * 与「卡住了」在屏幕上没有区别。**先说清多大**，
     * 「要不要传过来看」那一问连同进度条在批 4 一起做。
     */
    if (st.size > 远端预览上界) {
      return {
        kind: "other" as const,
        mediaType: mediaTypeOf(path),
        bytes: st.size,
        reason: `这个文件有 ${Math.round(st.size / 1024 / 1024)} MB，超过 ${远端预览上界 / 1024 / 1024} MB 没有传过来`,
      }
    }
    // 一次取回，按需切片。**SFTP 没有便宜的部分读**，而上界已经挡在前面了
    const buf = await e.readFile(path)
    return 分类预览(path, st.size, (最多) => (最多 === undefined ? buf : buf.subarray(0, 最多)))
  }

  const 远端 = () => {
    if (!remote) throw fault("internal_error", "本次运行没有装配远端连接")
    return remote
  }

  /**
   * 那台服务器叫什么。**查不到就返回 undefined**——
   * 上层会退回连接 id，那不好看但是实话；编一个「未知服务器」出来
   * 会让人以为真有这么一台。
   */
  const 服务器名 = (id: string) => remote?.store.get(id)?.label

  /**
   * 任务那一套装配好了没有。**没装配就如实说**——
   * 不返回空名单假装「你还没建过任务」。
   */
  const 任务库 = () => {
    if (!tasks) throw fault("internal_error", "本次运行没有装配任务")
    return tasks
  }

  /**
   * 临时会话的目录根。**没装配就如实说**，不偷偷退回一个猜出来的路径——
   * 那个路径上会真的落文件。
   */
  const 要有临时根 = () => {
    /**
     * **设置里那个说了算**（2026-08-12）。
     *
     * 作者要的「App 默认工作目录」不只是选文件夹的起点——
     * **没给工作目录的那些对话就落在它下面**。装配时定死的那个
     * （`wiring.ts` 的 `~/DAWN/scratch`）只是没配过时的兜底：
     * 每次现读，改完设置**下一段对话立刻生效**，不用重启。
     */
    const 配的 = settings?.get("workspace.default")
    if (配的) return join(配的, "scratch")
    if (!scratchRoot) throw fault("internal_error", "本次运行没有装配临时会话的目录根")
    return scratchRoot
  }

  /**
   * 系统给的默认工作目录（2026-08-12，作者定的两个平台各一个）。
   *
   * 作者：*「windows 的话就默认设置在桌面吧，mac 默认家目录下设置一个
   * `DAWN` 的目录就行。」*
   *
   * **不是 app data 目录**：那儿是给应用自己放数据的，用户永远找不到，
   * 而这个目录里会真的落下他的文件。
   */
  const 系统默认工作目录 = () =>
    process.platform === "win32" ? join(homedir(), "Desktop") : join(homedir(), "DAWN")

  /** 钥匙串里的键。**加前缀**：SSH 口令与模型 key 共用一个凭证库，撞名就是串号 */
  const 密钥名 = (id: string) => `ssh:${id}`

  /**
   * 库里那条记录 + 此刻的状态 → 协议实体。
   *
   * **口令不在这里出现**，只有 `hasSecret`。状态也不从库里读——
   * 库里存状态的话，应用崩一次，下次打开会看到一台「连着」的服务器。
   */
  const 装配 = (rec: ConnectionRecord) => ({
    ...rec,
    hasSecret: credentials.get(密钥名(rec.id)) !== undefined,
    state: remote ? remote.manager.stateOf(rec.id) : ({ kind: "idle" } as const),
  })

  /** 会话开始时的 git 基线，用于算「这次会话改了什么」。进程重启后丢失——见下方注释。 */
  const baselines = new Map<string, GitBaseline>()

  const requireProject = (projectId: string) => {
    const s = projects.summary(projectId)
    if (!s) throw fault("not_found", `项目 "${projectId}" 不存在`)
    return s
  }

  /**
   * **填了 key 就够了**（2026-08-10）。
   *
   * 作者：*「我明明设置 kimi 的 key 就好了，为什么还会多一个新建 agent
   * 这种奇怪的东西呢？其实配置 kimi 的方法，不应该和新建 deepseek 是一回事儿吗？」*
   *
   * 他是对的。deepseek 之所以「填个 key 就能用」，**唯一的原因是它碰巧写在
   * 默认配置里**——而 kimi 没有。同一件事被做成了两种，
   * 差别还落在一个用户根本不该知道的概念（agent）上。
   *
   * 所以：**配了凭证的 provider，自动就有一个同名 agent。**
   *
   * 两条边界：
   *   - **只在内存里**，不写进 `providers.yaml`——那是用户的文件，
   *     我们不该因为他填了个 key 就去改它。
   *   - **绝不覆盖已声明的**：某个 provider 已经有 agent 在用就不再自动加，
   *     否则用户精心写的 model 会被我们挑的那个顶掉。
   */
  async function 确保配过key的都能用(): Promise<void> {
    if (!models?.available) return
    const 已被用 = new Set(
      Object.values(registry.agents)
        .filter((d): d is Extract<typeof d, { kind: "native" }> => d.kind === "native")
        .map((d) => d.provider),
    )
    /**
     * **写下了连接设置的也算。**
     *
     * 一个自建的 vLLM / Ollama 往往**根本不需要 key**——只按「填过 key」来算，
     * 它会在设置里配得好好的，却在对话里选不到，
     * 而那正是作者反复撞上的那件事的另一个版本。
     */
    const 该有的 = [
      ...new Set([...credentials.configured(), ...Object.keys(registry.providers ?? {})]),
    ]
    for (const providerId of 该有的) {
      if (已被用.has(providerId) || registry.agents[providerId]) continue
      /**
       * **挑不出模型就不造这个 agent。** 一个模型是空串的 agent
       * 会在建会话时才炸，而那时错误与「你填了个 key」毫无关系。
       */
      const list = await models.available(providerId).catch(() => [] as string[])
      const model = list[0]
      if (!model) continue
      registry.agents[providerId] = {
        kind: "native",
        provider: providerId,
        model,
        capabilities: ["chat", "exec"],
      }
    }
  }

  /**
   * 起一个会话（登记 + 接线 + 记基线）。
   *
   * **抽出来是因为它有好几个调用点**——终端会话、任务、远端会话都从这儿起。
   * 每多一份复制粘贴的接线代码，就多一份「忘了挂记账员或忘了记 git 基线」的机会，
   * 而那种漏是不出声的。
   *
   * （T4，2026-08-13：原注释点名的那两个调用点是 `createSession` 与
   * `createTemporarySession`，它们在协议 5.0 里摘掉了。**抽出来的理由没变**，
   * 只是名单换了人。）
   */
  async function 起一个会话(
    projectId: string,
    agentId: string,
    workspaceOverride?: string,
    remoteSpec?: NonNullable<Parameters<SessionManager["create"]>[2]>["remote"],
  ) {
    const project = requireProject(projectId)
    /**
     * **会话的工作目录可以与项目的不同**（2026-08-11）。
     * 临时会话就是这样：它们同属一个「临时会话」项目（那样置顶与排序才成立），
     * 但**每条各有一个自己的目录**——那是作者选的形态。
     */
    const workspace = workspaceOverride ?? project.workspace
    /**
     * **把「打算给用户看的失败」翻成 fault，其余照旧归一成 internal_error。**
     *
     * 服务端只把 `fault()` 的消息原样交给界面，其余只进日志——那条策略是对的
     * （消息里可能有路径、连接串、密钥片段）。所以要让一句话到达用户，
     * **必须在抛出的一侧显式声明它是给用户看的**，而不是让下游去猜哪条安全。
     */
    /**
     * **先探机器，再建会话**（②-B · R5）。见 `探一台机器` 的说明：
     * 顺序反过来的话，PTY 那条在会话起来那一刻就产生的 Run 会缺环境。
     * 内核会话不探——它报的是内核那份，探了也没有地方能诚实地摆。
     */
    const 机器的 =
      environments && registry.agents[agentId]?.kind !== "kernel"
        ? await 探一台机器(workspace, remoteSpec?.connectionId)
        : undefined

    const rec = await sessions
      .create(agentId, workspace, { projectId, ...(remoteSpec ? { remote: remoteSpec } : {}) })
      .catch((err: unknown) => {
      if (err instanceof UserFacingError) throw fault("invalid_request", err.message)
      throw err
    })

    // **环境要在接线之前记好**：attach 之后随时可能来事件，而事件会造 Run
    记下环境(rec.id, 机器的)

    // 先登记再接线：attach 的回调可能同步就来一条事件
    const kind = registry.agents[agentId]?.kind ?? "native"
    events.track(rec.id, kind)
    sessions.attach(rec.id, (e) => {
      events.ingest(rec.id, e)
      // **记账与呈现是两件事，各走各的。**
      runRecorder?.ingest(e)
    })
    // PTY 的「命令」不可观测（只有字节流），可观测的是会话本身
    if (kind === "pty") runRecorder?.beginPtySession(rec.id)

    // 记下 git 基线。拿不到（非 git 仓库）就不记——后续 getRun 因此不返回
    // fileChanges，这比返回一个空数组诚实
    try {
      baselines.set(rec.id, await snapshot(workspace))
    } catch (err) {
      if (!(err instanceof NotAGitRepoError)) throw err
    }

    /**
     * **在准入时刻冻结一份机器快照**（②-B · R5，2026-08-13）。
     *
     * 「这个结果是在什么环境跑出来的」此前只有内核会话答得上来。
     * 而 pty、cli、native 三种会话同样在一台真实的机器上读写文件、跑命令——
     * 它们的 Run 此前在账本上**没有环境这一格**。
     *
     * 为什么在这里而不是第一次执行时：S17 的第一条禁令是**不得回头探测**。
     * 会话跑到一半有人装了个包，事后再探到的就不是它起来时那套。
     * 会话起来的这一刻就是它的准入时刻。
     *
     * **探不到不让建会话失败**：`探测机器` 自己吞掉异常返回 undefined，
     * 那时这个会话的 Run 就没有环境这一格——**读作「不知道」，不是「没有环境」**。
     */

    return projects.sessions(projectId, 服务器名).find((s) => s.sessionId === rec.id)!
  }

  /**
   * 会话 → 它准入时那份环境快照的 id（R5）。
   *
   * **`getEnvironment` 与账本读的是同一份**——两处各自判断「该报哪一个」
   * 的话，界面上说的和账本里记的迟早会是两件事。
   */
  const 机器环境 = new Map<string, string>()

  /**
   * 探一份机器快照并入库，记在 `机器环境` 里。
   *
   * **远端没连上就不探**：那时探到的不是那台机器，而是一次失败——
   * 记一个本地快照冒充远端，是这条路上最坏的一种错。
   */
  /**
   * 探一台机器。**在建会话之前跑**——机器是什么与这段会话是谁无关。
   *
   * 为什么非要提前：探测是异步的，而会话一接上线就可能有事件涌进来
   * （PTY 会话在起来的那一刻就有一条 Run）。**先探完再接线**，
   * 就不存在「事件已经开始来、环境还没冻好」那个窗口——
   * 那个窗口里的 Run 会缺环境，而它看起来与「这台机器探不到」一模一样。
   * （2026-08-13 接线用例当场红出来的。）
   */
  async function 探一台机器(
    workspace: string,
    connectionId?: string,
  ): Promise<ShellEnvironment | undefined> {
    let 执行 = 本地执行
    let 谁: ShellEnvironment["where"] = "local"
    if (connectionId) {
      const ex = remote?.manager.executorOf(connectionId)
      // **没连上就不探**：那时探到的不是那台机器，而是本机——
      // 拿一份本地快照冒充远端，是这条路上最坏的一种错
      if (!ex) return undefined
      执行 = (cmd) => ex.exec(cmd)
      谁 = { connectionId }
    }
    return 探测机器(执行, 谁, workspace)
  }

  /**
   * 把这段会话的环境冻下来，并把 id 推给记账员。
   *
   * **内核会话报内核那份**：它是更具体的事实——「哪个解释器、装了哪些包」
   * 比「哪台机器」更接近「这个结果是怎么来的」。
   *
   * **一个 Run 只指一份环境**：两份不可比，同时摆出来等于把
   * 「该看哪一个」推给了看的人。
   */
  function 记下环境(sessionId: string, 机器的: ShellEnvironment | undefined): void {
    if (!environments) return
    const 内核的 = sessions.environment(sessionId) as EnvironmentSnapshot | undefined
    const rec = sessions.get(sessionId)
    const id = 内核的
      ? environments.put(内核的, rec?.createdAt ?? new Date().toISOString())
      : 机器的
        ? environments.putShell(机器的, new Date().toISOString())
        : undefined
    if (!id) return
    机器环境.set(sessionId, id)
    onEnvironmentFrozen?.(sessionId, id)
  }


  /**
   * 连上那台机器，并造出起会话要用的那份远端参数（2026-08-14 抽出来的）。
   *
   * **此前这段只长在 `createRemoteSession` 里**，于是走 `createTask`
   * 那条路的远端任务拿不到它——`connectionId` 被收下却没往下传，
   * 建出来的是一段**本地**会话：任务上标着「远端」，活跑在本机上。
   * 作者报「新建的对话没收录到服务器收纳里」，根子就在这儿。
   *
   * 抽成一处而不是复制一份：两处长得一样的东西迟早各自漂移，
   * 而这段里每一步都是踩出来的（登录环境取家目录、`cd` 要落库并推给界面）。
   */
  async function 造远端参数(connectionId: string) {
    const { store, manager } = 远端()
    const rec = store.get(connectionId)
    if (!rec) throw fault("not_found", `没有这台服务器：${connectionId}`)
    try {
      await manager.connect(rec)
    } catch (e) {
      throw fault("internal_error", e instanceof Error ? e.message : String(e))
    }
    const ex = manager.executorOf(connectionId)
    if (!ex) throw fault("internal_error", `刚连上就没了：${rec.label}`)

    /**
     * **起点是那台机器的家目录。**
     *
     * 从登录环境里拿（`connect()` 时已经捕获过一次），不再多问一次。
     * **拿不到就明说**，不退回 `/`——那是根目录，
     * `rm -rf *` 在那儿的后果与在家目录完全是两件事。
     */
    const 家 = ex.loginEnv()["HOME"]
    if (!家) throw fault("internal_error", `问不出 ${rec.label} 上的家目录，没法决定从哪儿开始`)

    let 现在在 = 家
    let 会话id: string | undefined
    const spec = {
      connectionId,
      executor: ex as never,
      cwd: {
        get: () => 现在在,
        set: (v: string) => {
          现在在 = v
          /**
           * **落库 + 推给界面。** 头上那一条要立刻跟上，否则人看到的是上一个目录——
           * 「以为在 A 目录、其实在 B 目录」就是这么来的。
           */
          if (!会话id) return
          projects.setRemoteCwd(会话id, v)
          events.setCwd(会话id, v)
        },
      },
    }
    // **会话建出来之后要认领它**，否则上面那个 `set` 永远找不到 id
    return { spec, 认领: (id: string) => void (会话id = id) }
  }

  /**
   * 这一次写入在账本上该叫什么。
   *
   * **只有内核会话与众不同**：它送进去的是代码，不是话。
   * 拿不到语言时退回 `kernel_execute`——**不猜**（写死 python 的话，
   * 一个 R 会话的账本会指着一门它没用过的语言）。
   */
  function 这一轮叫什么(sessionId: string): string | undefined {
    const rec = sessions.get(sessionId)
    const agentId = rec?.agentId
    const def = agentId ? registry.agents[agentId] : undefined
    if (def?.kind !== "kernel") return undefined
    return def.language === "R" ? "execute_r" : def.language === "python" ? "execute_python" : "kernel_execute"
  }

  return {
    listProjects: async () => projects.list(),

    /**
     * 界面要列出可选 agent 才能新建会话，要列出 provider 才能填凭证。
     *
     * **2026-08-08 返工 R2**：`endpoints` 段没了，改为回传**本配置实际用到的
     * provider 集合**——不是 pi 内置的全部 39 个。理由：设置界面该问的是
     * 「你声明要用的这些 provider，凭证配了吗」，而不是把 39 个都列出来让人挑。
     *
     * **不回传任何凭证**。
     */
    getProviders: async () => {
      await 确保配过key的都能用()
      /**
       * 显示名一次问全，不在循环里一家一家问。
       * **拿不到就整份缺省**，界面退回用 id——见 `models.names` 的注释。
       */
      const 显示名: Record<string, string> = models?.names
        ? await models.names().catch(() => ({}))
        : {}
      const nativeAgents = Object.values(registry.agents).filter(
        (d): d is Extract<typeof d, { kind: "native" }> => d.kind === "native",
      )
      const used = [...new Set(nativeAgents.map((d) => d.provider))].sort()
      return {
        agents: Object.entries(registry.agents).map(([agentId, def]) => ({
          agentId,
          kind: def.kind,
          ...(def.kind === "native"
            ? { provider: def.provider, model: def.model }
            : {
                command: def.command,
                /**
                 * cli 的模型清单：**配置声明优先，其次自动发现**。
                 *
                 * - 配置里写了 `models` → 用它（**显式压过推断**，这是通则）
                 * - 没写 → 问 CLI 自己（codex 有 `models_cache.json`；claude 没有）
                 * - 都没有 → **不给这个字段**：缺省是「不知道」，
                 *   空数组会被读成「确认一个都没有」
                 *
                 * `model`（钉死当前用哪个）**几乎总该不写**：写了就等于给 CLI 传
                 * `--model`，会盖掉用户自己 CLI 的配置（2026-08-09 作者两个 CLI 都撞上了）。
                 */
                ...(def.kind === "cli" && def.model ? { model: def.model } : {}),
                ...(def.kind === "cli"
                  ? (() => {
                      const list =
                        def.models ??
                        discoverCliModels(familyOf(def.command) ?? "", cliHome)
                      return list ? { models: list } : {}
                    })()
                  : {}),
              }),
        })),
        providers: await Promise.all(
          used.map(async (providerId) => ({
            providerId,
            // 配置里声明过的（凭证界面看这一份）
            models: [...new Set(nativeAgents.filter((d) => d.provider === providerId).map((d) => d.model))],
            // 目录里真正有的（模型选择器看这一份）。**取不到就不给字段**——
            // 缺省是「不知道」，空数组是「确认没有」，两者不能混
            ...(models ? { available: await models.available(providerId) } : {}),
            // pi 给的显示名。**没有就不给字段**，界面退回用 id
            ...(显示名[providerId] ? { name: 显示名[providerId]! } : {}),
          })),
        ),
      }
    },

    /** **只回报配没配，绝不回报凭证本身**——界面不需要知道值 */
    listCredentials: async () => ({
      configured: credentials.configured(),
      encrypted: credentials.isEncrypted(),
    }),

    setCredential: async ({ providerId, secret }) => {
      credentials.set(providerId, secret)
      // 凭证变了必须让 pi 侧的缓存失效，否则刚填的 key 不会生效
      // （缓存的存在理由见 credential-store.ts：一次会话 202 次 read）
      invalidateCredentials?.(providerId)
      return {}
    },

    deleteCredential: async ({ providerId }) => {
      credentials.delete(providerId)
      invalidateCredentials?.(providerId)
      return {}
    },

    listSessions: async ({ projectId }) => {
      requireProject(projectId)
      return projects.sessions(projectId, 服务器名)
    },

    listRuns: async ({ projectId, sessionId, pageSize }) => {
      requireProject(projectId)
      return projects.runs(projectId, {
        ...(sessionId ? { sessionId } : {}),
        limit: pageSize,
      })
    },

    getRun: async ({ runId }) => {
      const run = runs.get(runId)
      if (!run) throw fault("not_found", `Run "${runId}" 不存在`)

      // 产出：只有拿得到基线才算得出。基线在进程重启后丢失——
      // 那时**不返回 fileChanges 字段**，而不是返回一个空数组。
      // 空数组会被读成「什么都没改」，那是错的；缺字段读成「不知道」，才对。
      const project = projectStore.get(run.projectId)
      const baseline = baselines.get(run.sessionId)
      let fileChanges
      if (project && baseline) {
        try {
          fileChanges = await diffSince(project.workspace, baseline)
        } catch (err) {
          if (!(err instanceof NotAGitRepoError)) throw err
          // 非 git 仓库：同样不编造，留空
        }
      }

      return { ...run, ...(fileChanges ? { fileChanges } : {}) }
    },

    getProvenance: async ({ resourceId }) => {
      const link = runs.getProvenance(resourceId)
      if (!link) throw fault("not_found", `资源 "${resourceId}" 没有溯源记录`)
      return link
    },

    subscribeSession: async ({ sessionId }) => {
      /**
       * **点进一段旧对话，就把它续起来**（会话续接，2026-08-11）。
       *
       * 作者：*「之前聊过的，也无法连续上。」*
       *
       * 关掉应用之后 agent 进程没了，对话内容也只活在内存里，
       * 于是重开之后点进去是一片空白、且不能说话。
       *
       * 续接放在**订阅**这一步，而不是另开一个操作让界面去调：
       * 「我要看这段对话」与「我要接着聊」在人那里是同一个动作。
       *
       * **续不上不算错**——CLI / 终端 / 内核那些本来就续不了，
       * 旧记录也可能已经没了。那时照旧回一份空的记录，
       * 界面显示「已退出」，与从前完全一致。**不假装续上了。**
       */
      if (!sessions.isLive(sessionId) && sessions.get(sessionId)) {
        try {
          await sessions.resume(sessionId)
          events.track(sessionId, "native")
          sessions.attach(sessionId, (e) => {
            events.ingest(sessionId, e)
            runRecorder?.ingest(e)
          })
          const 历史 = await sessions.history(sessionId)
          if (历史.length > 0) events.restore(sessionId, 历史.map(还原成条目))
        } catch {
          // 续不上就照旧：下面那句会如实抛「不在本进程中活动」
        }
      }
      try {
        return events.subscribe(sessionId)
      } catch (err) {
        // 「会话不在本进程中活动」是业务性失败——进程重启后旧会话就是这个状态，
        // 界面要能分辨它和「数据库炸了」
        throw fault("not_found", err instanceof Error ? err.message : String(err))
      }
    },

    unsubscribeSession: async ({ sessionId }) => {
      events.unsubscribe(sessionId)
      return {}
    },

    createTerminalSession: async ({ agentId, projectId }) => {
      if (projectId) return 起一个会话(projectId, agentId)
      if (!scratchRoot) throw fault("internal_error", "本次运行没有装配临时会话的目录根")
      const 归属 = projects.ensureTemporary(scratchRoot)
      return 起一个会话(归属.projectId, agentId, homedir())
    },

    /**
     * 全部临时会话。**跨项目**——每个临时会话自带一个项目，
     * 按项目一个个问会变成 N 次调用。
     */
    listTemporarySessions: async () =>
      projects
        .list()
        .filter((p) => p.temporary)
        .flatMap((p) => projects.sessions(p.projectId, 服务器名)),

    /**
     * ── 远端连接（②-B · R3/R4）─────────────────────────────────────────
     *
     * **口令一律不出这一层。** 请求里的 `secret` 转手进钥匙串，
     * 响应里只有 `hasSecret`。回显一次，它就落进了截图、日志和录屏。
     */

    /**
     * ── 任务（T1）────────────────────────────────────────────────
     *
     * **这一批只做「记下来」。** 任务与会话的绑定（点进去能聊）是 T3——
     * 分开做是为了让每一批都能自己验证：这里验的是
     * 「路径设了没有、取消得掉吗、列表对不对」，不牵扯会话生命周期。
     */
    listTasks: async () => 任务库().list(),

    createTask: async ({ agentId, workspace, connectionId }) => {
      const store = 任务库()
      if (!scratchRoot) throw fault("internal_error", "本次运行没有装配临时会话的目录根")

      /**
       * **不设路径时给它一个自己的目录**（T3）。
       *
       * 作者：*「如果在任务里面不设置任何工作目录的话，
       * 那么其实就是我们的普通对话。」*
       *
       * 「普通对话」不等于「无处落脚」——agent 仍然要能读写文件。
       * 所以服务端给一个独立目录，**但它不进 `TaskSummary`**：
       * 摆出来只会让人看见一个自己从没选过的路径，
       * 而那正是此前「临时会话」让人困惑的地方。
       */
      /**
       * **给了路径，就归到那个路径的项目下**（T3-a，2026-08-12）。
       *
       * 作者定的：*「在对话窗口选择文件夹之后，就属于是一个项目管理，
       * 那么就会归类到左边侧边栏的项目里面。」*
       * 以及第一条硬规则：**文件夹即项目身份**——`open()` 本来就是
       * 「同一路径复用同一条」，两段对话选同一个目录就落在同一个项目里。
       *
       * **这不只是侧栏分组的事**：账本、产出、git 事实全都按项目归集。
       * 上一版这里无条件走 `ensureTemporary`，于是「选了文件夹」之后
       * **那个文件夹的项目概览永远是空的**——三条 e2e 当场抓到
       * （成本栏停在「尚未记录」、变更 pane 里没有文件名）。
       */
      const 归属 = workspace ? projects.open(workspace) : projects.ensureTemporary(scratchRoot)
      /**
       * **给了服务器就真的连上去起**（2026-08-14 修）。
       *
       * 此前 `connectionId` 只被记进任务、没往下传，会话起在本机——
       * 任务上标着「远端」而活跑在本地，是两件事对不上。
       */
      const 远端参数 = connectionId ? await 造远端参数(connectionId) : undefined
      const 会话 = await 起一个会话(
        归属.projectId,
        agentId,
        workspace,
        远端参数?.spec as never,
      )
      远端参数?.认领(会话.sessionId)

      const rec = {
        taskId: `task-${randomUUID()}`,
        ...(workspace ? { workspace } : {}),
        ...(connectionId ? { connectionId } : {}),
        sessionId: 会话.sessionId,
        pinned: false,
        sortOrder: store.nextSortOrder(),
        createdAt: new Date().toISOString(),
      }
      store.insert(rec)
      return rec
    },

    /**
     * 给这段对话设一个工作目录（T3-b，2026-08-12）。
     *
     * 作者：*「点击完新建任务后，在对话窗口选择文件夹之后，就属于是一个
     * 项目管理，那么就会归类到左边侧边栏的项目里面。」*
     *
     * **它不只是记一个字段**——记完而 agent 的手还在原地，那是最坏的一种：
     * 界面说在 A，实际在 B。所以这里做三件事：
     *
     *   1. `projects.open()`：**文件夹即项目身份**，同一路径复用同一条
     *   2. `sessions.rehome()`：把运行时**真的搬过去**（连 pi 的历史一起）
     *   3. 往对话里留一条 notice：**它会自己从「会话」栏跳到「项目」栏，
     *      看得见的东西自己动了就必须出声**
     */
    setTaskWorkspace: async ({ taskId, workspace }) => {
      const store = 任务库()
      const t = store.get(taskId)
      if (!t) throw fault("not_found", `没有这个任务：${taskId}`)

      if (t.sessionId) {
        /**
         * **不给 = 退回普通对话**。那是一个明确的动作，不是「忘了填」——
         * 但同样要**真的搬回去**：只清字段的话，界面说「这是一段普通对话」
         * 而 agent 还在用户那个目录里写文件。
         */
        const 去处 = workspace ?? projects.temporaryWorkspace(要有临时根())
        const 归属 = workspace ? projects.open(workspace) : projects.ensureTemporary(要有临时根())
        try {
          await sessions.rehome(t.sessionId, 去处, 归属.projectId)
        } catch (e) {
          throw fault("invalid_request", e instanceof Error ? e.message : String(e))
        }
        events.notice(
          t.sessionId,
          workspace
            ? `已归入项目「${workspace}」——接下来它在这个目录里干活`
            : "已退回普通对话——工作目录换回了这段对话自己的临时目录",
        )
      }

      try {
        store.setWorkspace(taskId, workspace)
      } catch (e) {
        throw fault("not_found", e instanceof Error ? e.message : String(e))
      }
      return store.get(taskId)!
    },

    /**
     * 这个工作区里有哪些技能（4.10，2026-08-12）。
     *
     * 技能 = `.dawn/agents/*.md` 的子 agent 定义。**加载器只有一份**
     * （`loadSubagentDefinitions`），与建会话时读的是同一条——
     * 两份解析规则会在边角情形上悄悄分家，而这些文件是用户手写的。
     *
     * **读不进来的也端出来**：一个格式写错的定义静静地不出现，
     * 人只会以为「我写的技能没生效」而找不到原因（规格 7.5）。
     */
    /**
     * MCP 名单与状态（协议 5.7，2026-08-15）。
     *
     * **一次回清楚三件事**：配了哪几台、此刻连没连上、连不上是为什么。
     *
     * **列名单不顺手去连**：打开一个设置屏就悄悄拉起五个进程是不能接受的。
     * 所以没连过的一律 `unknown`——**「还没试过」与「试过、连不上」
     * 必须分得开**，后者才带 `error`。要连就按那颗「试一次」。
     */
    listMcpServers: async ({ projectId }) => {
      const 工作区 = projectId ? projects.summary(projectId)?.workspace : undefined
      const 名单 = 合名单(registry.mcp, 工作区)
      return {
        servers: 名单.服务器.map((台) => {
          const cwd = 台.服务器.cwd ?? 工作区
          const 已连 = mcp?.池.查(台.名, cwd)
          const 缺 = (台.服务器.env ?? []).filter(
            (v) => credentials.get(`mcp:${台.名}:${v}`) === undefined,
          )
          return {
            name: 台.名,
            command: 台.服务器.command,
            args: [...(台.服务器.args ?? [])],
            env: [...(台.服务器.env ?? [])],
            missingSecrets: 缺,
            ...(台.服务器.cwd ? { cwd: 台.服务器.cwd } : {}),
            from: 台.来自 === "全局" ? ("global" as const) : ("project" as const),
            trusted: settings?.get(`mcp.trusted.${台.名}`) === "1",
            off: settings?.get(`mcp.off.${台.名}`) === "1",
            state: 已连 ? ("ready" as const) : ("unknown" as const),
            tools: (已连?.工具 ?? []).map((t) => ({ name: t.工具名, description: t.描述 })),
          }
        }),
        problems: 名单.问题,
        ...(configPath ? { configPath } : {}),
      }
    },

    /**
     * 现在就连一次（协议 5.7）。**配完必须能当场验**——
     * 不能验的话人只能回对话里试一句，而试不出来时分不清是
     * 「没配对」还是「模型没想用它」。
     */
    testMcpServer: async ({ name, projectId }) => {
      if (!mcp) throw fault("invalid_request", "本次运行没有装配 MCP")
      const 工作区 = projectId ? projects.summary(projectId)?.workspace : undefined
      const 名单 = 合名单(registry.mcp, 工作区)
      const 台 = 名单.服务器.find((x) => x.名 === name)
      if (!台) throw fault("not_found", `名单里没有这台：${name}`)
      // **先断开再连**：改完配置按「试一次」，要试的是新配置而不是旧连接
      await mcp.池.关(name, 台.服务器.cwd ?? 工作区)
      const r = await mcp.池.备好(name, 台.服务器, 工作区)
      return {
        ok: !r.失败,
        ...(r.失败 ? { error: r.失败 } : {}),
        tools: r.工具.map((t) => ({ name: t.工具名, description: t.描述 })),
      }
    },

    /**
     * 加一台（协议 5.8）。**存完立刻生效，不用重启**——
     * 与加模型那条路同一副做法：写文件 → 重新解析 → **原地更新**内存里那一份
     * （`registry` 被多处按引用持有，替换引用没用）。
     *
     * 不做这一步的话，界面会说「已保存」而那台其实要等下次启动才存在——
     * **那是一句半真的话**。
     */
    saveMcpServer: async ({ json, name }) => {
      if (!configPath) throw fault("invalid_request", "本次运行没有装配配置文件，加不了")
      let 解出: ReturnType<typeof 从JSON解出>
      try {
        解出 = 从JSON解出(json)
      } catch (e) {
        throw fault("invalid_request", e instanceof Error ? e.message : String(e))
      }
      const 名 = name ?? 解出.台.名
      if (!名) {
        throw fault(
          "invalid_request",
          "这段 JSON 里没有服务器的名字（只有 command），请另外给它起一个",
        )
      }
      let 新的: ProviderRegistry
      try {
        新的 = addMcpServer(configPath, { ...解出.台, 名 })
      } catch (e) {
        if (e instanceof UserFacingError) throw fault("invalid_request", e.message)
        throw e
      }
      registry.mcp = 新的.mcp
      return { name: 名, needsSecrets: 解出.密钥名 }
    },

    /** 删一台。**只动全局那份**——项目级的属于那个仓库 */
    removeMcpServer: async ({ name }) => {
      if (!configPath) throw fault("invalid_request", "本次运行没有装配配置文件，删不了")
      try {
        registry.mcp = removeMcpServer(configPath, name).mcp
      } catch (e) {
        if (e instanceof UserFacingError) throw fault("invalid_request", e.message)
        throw e
      }
      // **连接也要断掉**：不断的话，删掉的那台还在池子里活着、工具还挂着
      await mcp?.池.关(name)
      return { ok: true as const }
    },

    /** 拨本机那两个开关。**它们不写进任何会被分享的文件**（见 schema 的说明） */
    setMcpFlag: async ({ name, flag, value }) => {
      if (!settings) throw fault("invalid_request", "本次运行没有设置存储")
      const key = flag === "trusted" ? (`mcp.trusted.${name}` as const) : (`mcp.off.${name}` as const)
      settings.set(key, value ? "1" : "", new Date().toISOString())
      return { ok: true as const }
    },

    /** 填一个密钥。**只进不出**：任何响应里都没有它 */
    setMcpSecret: async ({ name, varName, secret }) => {
      const 键 = `mcp:${name}:${varName}`
      if (secret) credentials.set(键, secret)
      else credentials.delete(键)
      return { ok: true as const }
    },

    /**
     * **Agent Skills**（协议 6.0，2026-08-15）。
     *
     * 三个位置合起来问一次：自带（随应用发布）、全局（`~/DAWN/skills`）、
     * 项目（`<工作区>/.dawn/skills`）。**顺序即优先级**——
     * pi 按名字先到先得，所以项目 > 全局 > 自带（同名时你写的那份赢）。
     *
     * **发现这件事整个交给 pi**（`loadSkills`）：它就是那个标准的实现，
     * 我们自己再解析一遍 frontmatter 只会在边角情形上与它分家。
     */
    listAgentSkills: async ({ projectId }) => {
      const 工作区 = projectId ? projects.summary(projectId)?.workspace : undefined
      const 位置 = skills ?? {}
      const 项目目录 = 工作区 && 位置.项目目录名 ? join(工作区, 位置.项目目录名) : undefined
      /** 顺序 = 优先级，与运行时那边必须一致（两处分家就会「屏上是这个、跑的是那个」） */
      const 按序 = [
        ...(项目目录 ? [{ path: 项目目录, from: "project" as const }] : []),
        ...(位置.全局目录 ? [{ path: 位置.全局目录, from: "global" as const }] : []),
        ...(位置.自带目录 ? [{ path: 位置.自带目录, from: "builtin" as const }] : []),
      ]
      const r = loadSkills({
        cwd: 工作区 ?? homedir(),
        agentDir: join(homedir(), ".pi"),
        skillPaths: 按序.map((x) => x.path),
        includeDefaults: false,
      })
      /** 一个技能来自哪儿：按它的文件落在哪个目录下判 */
      const 判来处 = (filePath: string): "builtin" | "global" | "project" =>
        按序.find((x) => filePath.startsWith(x.path))?.from ?? "global"
      return {
        skills: r.skills.map((s) => ({
          name: s.name,
          description: s.description,
          filePath: s.filePath,
          from: 判来处(s.filePath),
          manualOnly: s.disableModelInvocation,
        })),
        problems: r.diagnostics.map((d) => ({
          path: String((d as { path?: unknown }).path ?? ""),
          reason: String((d as { message?: unknown }).message ?? ""),
        })),
        dirs: {
          ...(位置.自带目录 ? { builtin: 位置.自带目录 } : {}),
          ...(位置.全局目录 ? { global: 位置.全局目录 } : {}),
          ...(项目目录 ? { project: 项目目录 } : {}),
        },
      }
    },

    listSubagents: async ({ projectId }) => {
      const p = requireProject(projectId)
      const 读到的 = loadSubagentDefinitions(p.workspace)
      return {
        agents: 读到的.agents.map((a) => ({
          name: a.name,
          description: a.description,
          ...(a.tools ? { tools: a.tools } : {}),
          ...(a.model ? { model: a.model } : {}),
          filePath: a.filePath,
        })),
        problems: 读到的.problems,
        dir: join(p.workspace, AGENTS_DIR),
      }
    },

    listConnections: async () => 远端().store.list().map(装配),

    saveConnection: async (req) => {
      const { store } = 远端()
      const 端口 = req.port ?? 22
      const 旧的 = req.id ? store.get(req.id) : undefined
      if (req.id && !旧的) throw fault("not_found", `没有这台服务器：${req.id}`)

      const rec: ConnectionRecord = {
        id: 旧的?.id ?? `conn-${randomUUID()}`,
        label: req.label,
        ...(req.group ? { group: req.group } : {}),
        host: req.host,
        port: 端口,
        username: req.username,
        ...(req.privateKeyPath ? { privateKeyPath: req.privateKeyPath } : {}),
        sortOrder: 旧的?.sortOrder ?? store.nextSortOrder(req.group),
        createdAt: 旧的?.createdAt ?? new Date().toISOString(),
      }
      if (旧的) store.update(rec)
      else store.insert(rec)

      /**
       * **不传 `secret` = 不动原来那个**（不是「清空」）。
       *
       * 改一次分组就把口令弄丢，是这类表单最经典的坏法：
       * 界面上那个框永远是空的（因为绝不回显），于是每次保存都会"顺手"清掉。
       * 传空串才是清除——那是明确的「我不要它了」。
       */
      if (req.secret !== undefined) {
        if (req.secret) credentials.set(密钥名(rec.id), req.secret)
        else credentials.delete(密钥名(rec.id))
      }
      return 装配(rec)
    },

    removeConnection: async ({ id }) => {
      const { store, manager } = 远端()
      if (!store.get(id)) throw fault("not_found", `没有这台服务器：${id}`)
      // 先断开：留着一条连着的连接，它的状态推送会指向一台已经不存在的机器
      manager.disconnect(id)
      store.remove(id)
      // **钥匙串里那份也删掉**——留着就是一份没人认领的秘密
      credentials.delete(密钥名(id))
      return {}
    },

    connectRemote: async ({ id }) => {
      const { store, manager } = 远端()
      const rec = store.get(id)
      if (!rec) throw fault("not_found", `没有这台服务器：${id}`)
      try {
        await manager.connect(rec)
      } catch (e) {
        /**
         * **连不上要说清楚是为什么。**
         *
         * 认证失败、主机不通、私钥读不到——在界面上都长成「连不上」，
         * 但要人去改的东西完全不同。原样把底层的话带上去。
         */
        throw fault("internal_error", e instanceof Error ? e.message : String(e))
      }
      return 装配(rec)
    },

    /**
     * **在一台远端服务器上开一段对话**（②-B · R4′）。
     *
     * 作者：*「连上就默认用家目录，先聊起来，需要换地方再换。」*
     *
     * 三件事按顺序：没连就先连 → 起点取那台机器的家目录 → 起会话。
     * **没连就先连**是有意的：人点的是「在这台机器上干活」，
     * 让他先按一次「连接」再按一次「新对话」，是把我们的实现顺序摊给他看。
     */
    /**
     * 在一台服务器上开一段对话。
     *
     * **它现在与 `createTask` 走同一条路**（2026-08-14）：连接、取家目录、
     * 构造远端参数那段抽在 `造远端参数` 里，两处共用。
     * 此前这段只长在这里，于是 `createTask({connectionId})` 建出来的是
     * 一段本地会话——任务标着「远端」而活跑在本机上。
     *
     * **它不建任务**，这是与 `createTask` 仍然不同的地方：
     * 保留它是为了不动既有调用点；界面那颗「新对话」应当改走 `createTask`，
     * 那样这段会话才会出现在侧栏的「服务器」收纳里（作者报的那个现象）。
     */
    createRemoteSession: async ({ connectionId, agentId }) => {
      if (!scratchRoot) throw fault("internal_error", "本次运行没有装配临时会话的目录根")
      const 远端参数 = await 造远端参数(connectionId)
      /**
       * 会话得有个归属（会话表要 project_id）。挂在那个隐藏的容器项目下——
       * **用户不需要知道它存在**：他要的是「在 gs191 上聊一段」，不是一个项目。
       */
      const 归属 = projects.ensureTemporary(scratchRoot)
      const 建好的 = await 起一个会话(归属.projectId, agentId, undefined, 远端参数.spec as never)
      远端参数.认领(建好的.sessionId)
      return 建好的
    },

    disconnectRemote: async ({ id }) => {
      const { store, manager } = 远端()
      const rec = store.get(id)
      if (!rec) throw fault("not_found", `没有这台服务器：${id}`)
      manager.disconnect(id)
      return 装配(rec)
    },

    writeToSession: async ({ sessionId, data, as, images, behavior }) => {
      /**
       * **图片在这一层读盘、缩放、转 base64**（协议 4.12，2026-08-13）。
       *
       * 渲染进程只送路径。理由写在协议里：给渲染进程开一条读文件的通道，
       * **那条通道就不只能用来读图片**。
       *
       * 缩放交给 pi 的 `processImage`——它知道各家 provider 的内联上限，
       * 而那是个会变的数，我们不该自己抄一份。
       *
       * **读不出来要当场说清是哪一张**（规格 7.5）：一句笼统的「附件失败」
       * 会让人对着三张图挨个试。
       */
      const 附图 = await 读成附件(images ?? [])
      try {
        sessions.write(sessionId, data, as, 附图, behavior)
        // 用户的发言回灌进事件流，**界面不做本地乐观追加**——
        // 事件流是对话的唯一事实来源，两条路各写一半迟早对不上。
        // PTY 会话由中枢自行忽略：终端本来就会回显，再补一条是重复。
        if (as === "user") {
          /**
           * **第一句话定名字**（2026-08-10）。写在这里而不是运行时里：
           * 这是「会话」这个记录的属性，与哪种运行时无关——
           * 内核会话第一段代码同样能当名字。
           *
           * `setTitleIfAbsent` 在 SQL 里判空，不在这里先读后写：
           * 先读后写有窗口，而「第二句话把标题改掉了」的症状是
           * 侧栏上的名字会自己变，人会以为点错了会话。
           */
          const title = deriveSessionTitle(data)
          if (title) projects.setSessionTitle(sessionId, title)
          /**
           * **转录里存缩略图，不存原图**（协议 4.14，2026-08-13）。
           *
           * 附图这时已经在 `附图` 里（base64 的原始尺寸）。直接塞进转录的话，
           * **每次切回这个会话、每次拉快照，都要把那几 MB 再搬一遍**。
           * 这里要回答的只是「附的是哪几张」，一张 320px 的缩略图就够。
           */
          events.userTurn(sessionId, data, await 缩成预览(附图))
          /**
           * 运行时没有 turn_start 事件——回合的起点只有这里知道。
           * PTY 会话由记账员自己忽略（那是按键，不是发话），见 run-recorder.ts
           *
           * **内核会话记的是「执行了一段代码」**（2026-08-11）：
           * 账本上一段 R 代码不该和一次模型对话长得一模一样。
           * 名字用路线图 S16 早就写下的 `execute_python` / `execute_r`。
           */
          runRecorder?.beginTurn(sessionId, 这一轮叫什么(sessionId))
        }
      } catch (err) {
        // 写权被拒是业务性失败，不是内部错误——UI 要能分辨并提示用户去抢租约
        throw fault("conflict", err instanceof Error ? err.message : String(err))
      }
      return {}
    },

    stopSession: async ({ sessionId }) => {
      await sessions.stop(sessionId)
      baselines.delete(sessionId)
      return {}
    },

    abortSession: async ({ sessionId }) => {
      try {
        await sessions.abort(sessionId)
      } catch (err) {
        // 「运行时不支持中止」是业务性失败，界面要能分辨并提示去终端按 Ctrl-C
        throw fault("conflict", err instanceof Error ? err.message : String(err))
      }
      return {}
    },

    /**
     * 回答一次权限询问（A2，2026-08-16）。
     *
     * **两件事都要做，顺序也要对**：先把答案递给 agent（它在等），
     * 再把那张卡从快照上摘掉。反过来的话，卡先没了而 agent 还等着，
     * 中间那一拍屏幕上什么都没有——人会以为自己点漏了。
     */
    answerPermission: async ({ sessionId, requestId, optionId }) => {
      sessions.answerPermission(sessionId, requestId, optionId)
      events.清权限询问(sessionId)
      return {}
    },

    /** 改一个会话开关（A3）。**广播由运行时发**，这里只管转达 */
    setSessionConfigOption: async ({ sessionId, configId, value }) => {
      await sessions.setConfigOption(sessionId, configId, value)
      return {}
    },

    getContextUsage: async ({ sessionId }) => {
      const u = sessions.contextUsage(sessionId)
      // 拿不到时给一个**三档全零、且没有上限**的结果：
      // 上限缺省的含义是"不知道"，界面据此显示「尚未采集」而不是「用了 0%」
      return u ?? { bytes: { system: 0, tools: 0, history: 0 } }
    },

    setSessionModel: async ({ sessionId, provider, model }) => {
      try {
        // **provider 对 cli 会话没有意义**（外部 CLI 没这个概念），
        // 放宽之后这里给空串——运行时那边也只是为了签名一致才留着这个参数
        await sessions.setModel(sessionId, provider ?? "", model)
      } catch (err) {
        // **全是业务性失败**：模型不存在、没配 key、这一轮还没说完。
        // 界面要原样把理由说给人听，所以不能吞成一句「操作失败」
        throw fault("conflict", err instanceof Error ? err.message : String(err))
      }
      return {}
    },

    listKernels: async () => {
      const d = discoverKernelSpecs()
      return {
        kernels: d.specs.map((k) => ({
          name: k.name,
          displayName: k.displayName,
          ...(k.language ? { language: k.language } : {}),
          ...(k.executable ? { executable: k.executable } : {}),
          dir: k.dir,
        })),
        problems: d.problems,
        shadowed: d.shadowed.map((k) => ({ name: k.name, dir: k.dir })),
      }
    },

    /**
     * 变量面板（②-A · K5 · S14）。
     *
     * **不支持与「真没有」必须分开**：前者是「我们没去问」，
     * 后者是「问了，确实一个都没有」。混成一个空列表，
     * 用户会以为自己的变量丢了。
     */
    listVariables: async ({ sessionId }) => {
      const v = (await sessions.variables(sessionId)) as
        | { supported: false; reason: string }
        | { supported: true; variables: unknown[] }
        | undefined
      if (!v) {
        // 不是内核会话，或会话不在。**如实说，不返回空列表**
        return { supported: false as const, reason: "这个会话没有内核，看不到变量" }
      }
      return v as never
    },

    /**
     * 准入时刻的环境快照（②-B · S17）。
     *
     * **返回冻结的那一份，不重新探。** 「现在装的是什么」与「当时装的是什么」
     * 是两个问题——拿前者回答后者就是用今天的环境伪造昨天的证据。
     */
    getEnvironment: async ({ sessionId }) => {
      const rec = sessions.get(sessionId)
      if (!rec) throw fault("not_found", `没有这个会话：${sessionId}`)
      const snap = sessions.environment(sessionId) as EnvironmentSnapshot | undefined
      if (!snap) {
        /**
         * **不是内核会话，不等于没有环境**（R5 补上的）。
         *
         * pty / cli / native 三种会话同样跑在一台真实的机器上，
         * 它们的环境是**那台机器**（本地或那条连接）。此前这里一律回
         * 「没有快照」，于是「这个结果是在什么环境跑出来的」只有内核会话答得上来。
         */
        const 机器id = 机器环境.get(sessionId)
        const 机器的 = 机器id ? environments?.get(机器id) : undefined
        if (机器的?.kind === "shell") {
          const { id, capturedAt: _时间, kind: _种, ...其余 } = 机器的
          return { captured: true as const, kind: "shell" as const, id, ...其余 }
        }
        /**
         * **几种「没有」说的话不同**，混成一句就等于什么都没说：
         * 不是内核会话 / 语言不支持 / 探测没成功 / 远端还没连上。
         */
        return {
          captured: false as const,
          reason:
            "这个会话还没有环境快照（不是内核会话、内核语言不是 Python/R、准入时探测失败、或远端还没连上）",
        }
      }
      // **入库即冻结**，并且同一个环境只存一行（内容寻址）
      const id = environments?.put(snap, rec.createdAt) ?? fingerprintOf(snap)
      return { captured: true as const, kind: "kernel" as const, id, ...snap }
    },

    /**
     * 两个解释器路径（2026-08-10，作者定的机制）。
     * **没配的那个不给字段**——「还没配」与「配了一个空路径」在界面上要说不同的话。
     */
    /**
     * 工具权限档位（2026-08-13）。
     *
     * **没配 = `allow-all`**，也就是今天的行为。默认改成拦截会让一个正在干活的人
     * 毫无预兆地开始撞墙，而这一版还没有「问一句、你点允许」那条路——撞了也没法放行。
     */
    /**
     * 按科研目录结构初始化这个项目（2026-08-14，作者定的约定）。
     *
     * 做两件事：**建目录骨架** + **把约定写进 `AGENTS.md`**。
     * 后者不是我们自己发明的注入路——pi 的 `DefaultResourceLoader` 本来就读
     * 工作区里的 `AGENTS.md` / `CLAUDE.md`，写成文件模型自然看得到，
     * 而且**你能直接改它**。硬编码进系统提示词的话，它既看不见也改不动。
     *
     * **已经有指令文件的项目一个字都不动。** 那份文件里可能是这个仓库
     * 攒了很久的约定（这个仓库自己就有一份 `CLAUDE.md`）——
     * 覆盖掉是不可撤销的，而「我们帮你加了个约定」远不值这个代价。
     * 那时如实说没写、说清为什么，并把该贴的内容给出去。
     */
    initScienceLayout: async ({ projectId }) => {
      const p = requireProject(projectId)
      const 建了: string[] = []
      for (const d of 科研目录) {
        const 全 = join(p.workspace, d)
        if (!existsSync(全)) {
          mkdirSync(全, { recursive: true })
          建了.push(d)
        }
      }

      const 已有 = pi会读的指令文件.find((f) => existsSync(join(p.workspace, f)))
      if (已有) {
        return {
          created: 建了,
          instructions: "skipped" as const,
          existingFile: 已有,
          reason: `这个项目已经有 ${已有}，没有动它。把下面这段贴进去即可。`,
          snippet: 约定正文,
        }
      }
      writeFileSync(join(p.workspace, 我们写的指令文件), `${约定正文}`, "utf8")
      return {
        created: 建了,
        instructions: "written" as const,
        file: 我们写的指令文件,
      }
    },

    getPermissionMode: async () => ({
      mode: settings?.get("permission.mode") === "deny-risky" ? ("deny-risky" as const) : ("allow-all" as const),
    }),

    setPermissionMode: async ({ mode }) => {
      if (!settings) throw fault("internal_error", "本次运行没有装配设置")
      settings.set("permission.mode", mode, new Date().toISOString())
      return { mode }
    },

    getDefaultWorkspace: async () => {
      const 配的 = settings?.get("workspace.default")
      return { path: 配的 ?? 系统默认工作目录(), isDefault: !配的 }
    },

    setDefaultWorkspace: async ({ path }) => {
      if (!settings) throw fault("internal_error", "本次运行没有装配设置")
      const p = path.trim()
      /**
       * **空串 = 恢复系统默认**，不是「设了一个空路径」。
       * 与解释器那两条同一条规矩。
       */
      if (p && !p.startsWith("/") && !/^[A-Za-z]:[\\/]/.test(p)) {
        throw fault("invalid_request", `工作目录要写绝对路径，收到「${p}」`)
      }
      settings.set("workspace.default", p, new Date().toISOString())
      /** **建出来**：设了一个不存在的目录，第一段对话才炸就太晚了 */
      if (p) mkdirSync(p, { recursive: true })
      const 现在 = settings.get("workspace.default")
      return { path: 现在 ?? 系统默认工作目录(), isDefault: !现在 }
    },

    /**
     * Token 用量（S21，2026-08-16）。
     *
     * **一次给全四块要的数**：统计条、进度条、日历、饼图看的是同一份事实，
     * 拆成四次查询会让它们在同一屏上互相矛盾。
     *
     * 「今天」在这里算一次并传下去——**不让汇总函数自己去问时钟**，
     * 那样「连续天数」这条判据就没法钉住日期了。
     */
    getUsage: async () => {
      const 今天 = 本地日期(new Date())
      return runs.usage(今天)
    },

    getInterpreters: async () => settings?.interpreters() ?? {},

    setInterpreter: async ({ language, path }) => {
      if (!settings) throw fault("internal_error", "本次运行没有装配设置存储")
      settings.set(language === "python" ? "interpreter.python" : "interpreter.r", path, new Date().toISOString())
      /**
       * **当场验，不等到建会话才炸。**
       *
       * 填完路径就该知道它行不行——「保存成功」然后建会话时才报错，
       * 中间隔着的那段时间会让人以为是别的东西坏了。
       *
       * 这里只做**静态**判断（路径存不存在）：包缺没缺要真起一次才知道，
       * 那是建会话时的事，届时同一套诊断会说清楚。
       */
      const now = settings.interpreters()
      const configured = language === "python" ? now.python : now.r
      const d = configured ? diagnoseInterpreter(language, configured) : undefined
      return { ...now, ...(d ? { problem: d.message } : {}) }
    },

    /**
     * 列一层工作区目录（②-A′ · F2）。
     *
     * **工作区从项目取，不从请求取**——让调用方传工作区，
     * 等于把路径守卫的起点也交给它，那守卫就形同虚设。
     */
    listDirectory: async ({ projectId, connectionId, path, includeIgnored }) => {
      if (connectionId) return 远端列目录(connectionId, path)
      const p = projectStore.get(projectId!)
      if (!p) throw fault("not_found", `没有这个项目：${projectId}`)
      return listWorkspaceDirectory(p.workspace, path, {
        ...(includeIgnored === undefined ? {} : { includeIgnored }),
      })
    },

    /** 读一个文件供预览。**只读**，且路径守卫在 `files/access.ts` 里 */
    readFile: async ({ projectId, connectionId, path }) => {
      if (connectionId) return 远端读文件(connectionId, path)
      const p = projectStore.get(projectId!)
      if (!p) throw fault("not_found", `没有这个项目：${projectId}`)
      return readWorkspaceFile(p.workspace, path)
    },

    openExternally: async ({ projectId, path }) => {
      const p = projectStore.get(projectId)
      if (!p) throw fault("not_found", `没有这个项目：${projectId}`)
      // **守卫在这里，不在调用方**：解析失败会抛，越界也会抛
      const abs = resolveInWorkspace(p.workspace, path)
      if (!openPath) return { problem: "本次运行没有装配「用系统程序打开」的能力" }
      const err = await openPath(abs)
      // Electron 的 `shell.openPath` 成功时返回空串，失败时返回原因
      return err ? { problem: err } : {}
    },

    listKnownProviders: async () => {
      /** 已经写下的连接设置。**只回写过的**，没写过的不给键 */
      const connections: Record<string, { baseUrl?: string; api?: string; models?: string[] }> = {}
      for (const [id, c] of Object.entries(registry.providers ?? {})) {
        connections[id] = {
          ...(c.baseUrl ? { baseUrl: c.baseUrl } : {}),
          ...(c.api ? { api: c.api } : {}),
          ...(c.models ? { models: c.models } : {}),
        }
      }
      /**
       * **目录取不到时也要把连接设置回出去。** 那是用户自己写下的东西，
       * 与「pi 认识谁」无关——不回的话，设置页会把已经填好的地址显示成空的，
       * 看起来像被清掉了。
       */
      const 写过的 = Object.keys(connections).length > 0 ? { connections } : {}
      if (!models?.known) {
        return { providers: [], ...写过的, problem: "本次运行没有装配模型目录" }
      }
      try {
        const ids = await models.known()
        /**
         * 顺带把每个 provider 的模型带上。**建 agent 时要在这里面挑**，
         * 而 `getProviders` 的 `available` 只覆盖配置里用到的那几个。
         */
        const table: Record<string, string[]> = {}
        for (const id of ids) table[id] = await models.available(id)
        return {
          providers: ids,
          models: table,
          // **地址 pi 不自带的那几个**：界面据此给输入框
          ...(models.needsBaseUrl ? { needsBaseUrl: await models.needsBaseUrl() } : {}),
          ...写过的,
        }
      } catch (err) {
        /**
         * **取不到就说取不到。** 返回一个空清单会被读成「pi 一个都不支持」，
         * 而实情是「我们没问到」（规格 7.5：失败必须出声）。
         */
        return {
          providers: [],
          ...写过的,
          problem: err instanceof Error ? err.message : String(err),
        }
      }
    },

    reorderSessions: async ({ projectId, orderedIds }) => {
      requireProject(projectId)
      return { reordered: sessions.reorder(projectId, orderedIds) }
    },

    setProviderConnection: async ({ providerId, baseUrl, api, models: 模型 }) => {
      if (!configPath) throw fault("internal_error", "本次运行没有装配配置文件路径")
      let 新的
      try {
        新的 = setProviderConnection(configPath, providerId, {
          ...(baseUrl === undefined ? {} : { baseUrl }),
          ...(api === undefined ? {} : { api }),
          ...(模型 === undefined ? {} : { models: 模型 }),
        })
      } catch (err) {
        if (err instanceof UserFacingError) throw fault("invalid_request", err.message)
        throw err
      }
      // 原地更新那一个被多处持有的对象（同 createAgent 的理由）
      for (const k of Object.keys(registry.agents)) delete registry.agents[k]
      Object.assign(registry.agents, 新的.agents)
      registry.providers = 新的.providers
      /**
       * **重新生成 `models.json` 并让下一次用上它。**
       * 不做这一步的话，地址写进了配置却要重启才生效——
       * 而界面会说「已保存」，那是一句半真的话。
       */
      onProvidersChanged?.(新的.providers)
      return {}
    },

    renameSession: async ({ sessionId, title }) => {
      // **空串等于清掉**，回到自动标题——不是存一个空标题
      if (!sessions.rename(sessionId, title)) throw fault("not_found", `没有这个会话：${sessionId}`)
      return {}
    },

    setSessionPinned: async ({ sessionId, pinned }) => {
      if (!sessions.setPinned(sessionId, pinned)) {
        throw fault("not_found", `没有这个会话：${sessionId}`)
      }
      return {}
    },

    moveSession: async ({ sessionId, direction }) => {
      if (!sessions.get(sessionId)) throw fault("not_found", `没有这个会话：${sessionId}`)
      /**
       * **已经在头/尾就如实回 `false`**，不抛也不假装成功。
       * 「没得动了」是一个正常结果，界面据此什么都不做即可。
       */
      return { moved: sessions.move(sessionId, direction) }
    },

    /**
     * 删掉一个任务（4.9，2026-08-12）。
     *
     * 作者：*「历史遗留的对话……我现在无法删除。」*
     * 根因在界面：它手上只有「当前项目 + 临时」两拨会话摘要，
     * 迁移过来的任务指向别的项目，于是那些行连删除键都没有。
     *
     * **所以删除只收 taskId**——服务端本来就知道它挂在哪段会话上。
     *
     * **会话没了也要能删**（`sessionId` 缺省，或那条记录已经不在）：
     * 那正是「历史遗留」的形状，删不掉就永远卡在列表里。
     */
    deleteTask: async ({ taskId }) => {
      const store = 任务库()
      const t = store.get(taskId)
      if (!t) throw fault("not_found", `没有这个任务：${taskId}`)

      let kept = 0
      if (t.sessionId) {
        const rec = sessions.get(t.sessionId)
        if (rec) {
          await sessions.remove(t.sessionId)
          events.forget(t.sessionId)
          baselines.delete(t.sessionId)
          kept = rec.projectId ? runs.countByProject(rec.projectId) : 0
        }
      }
      store.remove(taskId)
      /**
       * **账本留着，并且把还剩多少说出来**（与 `deleteSession` 同一条）。
       * 一句「已删除」会让人以为历史也一起没了——而它没有，
       * 这正是这个产品与一个聊天窗口的区别（不变式 5）。
       */
      return { ledgerKept: kept }
    },

    deleteSession: async ({ sessionId }) => {
      const rec = sessions.get(sessionId)
      if (!rec) throw fault("not_found", `没有这个会话：${sessionId}`)
      const removed = await sessions.remove(sessionId)
      if (!removed) throw fault("not_found", `没有这个会话：${sessionId}`)
      // 转录只活在内存里，跟着走
      events.forget(sessionId)
      baselines.delete(sessionId)
      /**
       * **任务跟着走**（T3-a，2026-08-12）。
       *
       * 任务是「一段对话 + 一个可选的路径」——会话没了，那段对话就没了。
       * 不删的话侧栏上会挂着一行指向死会话的「新任务」，
       * 而且**那一行还会把整个项目撑在那儿**（项目是从任务的路径长出来的）。
       */
      任务库().removeBySessions([sessionId])
      /**
       * **账本留着，并且把还剩多少说出来。**
       * 一句「已删除」会让人以为历史也一起没了——而它没有，
       * 这正是这个产品与一个聊天窗口的区别（不变式 5）。
       */
      const kept = rec.projectId ? runs.countByProject(rec.projectId) : 0
      return { ledgerKept: kept }
    },

    deletionImpact: async ({ projectId }) => {
      const p = projectStore.get(projectId)
      if (!p) throw fault("not_found", `没有这个项目：${projectId}`)
      // **摆真数字**：界面手里的会话列表与账本都是分页/局部的，猜不出来
      return {
        sessions: sessions.countByProject(projectId),
        runs: runs.countByProject(projectId),
        workspace: p.workspace,
      }
    },

    deleteProject: async ({ projectId }) => {
      const p = projectStore.get(projectId)
      if (!p) throw fault("not_found", `没有这个项目：${projectId}`)

      /**
       * **先把活着的会话停掉**，再删记录。反过来的话进程还活着
       * 而我们已经忘了它是谁的——一个没人认领的孤儿进程。
       */
      for (const rec of sessions.listByProject(projectId)) {
        if (rec.state !== "exited") await sessions.stop(rec.id).catch(() => {})
        events.forget(rec.id)
        baselines.delete(rec.id)
      }
      /**
       * **先记下有哪些会话，再删**：删完就查不到了，
       * 而任务是按 sessionId 挂着的（T3-a）。
       */
      const 它的会话 = sessions.listByProject(projectId).map((r) => r.id)
      任务库().removeBySessions(它的会话)
      const sessionsDeleted = sessions.deleteByProject(projectId)
      const runsDeleted = runs.deleteByProject(projectId)
      projectStore.delete(projectId)
      /**
       * **磁盘上的文件夹一个字节都没动。** 回它的路径，让人一眼确认
       * ——「移除的是工作台里的记录，不是我的数据」。
       */
      return { sessionsDeleted, runsDeleted, workspace: p.workspace }
    },

    acquireLease: async ({ sessionId, holder }) => {
      try {
        return sessions.leases.acquire(sessionId, holder)
      } catch (err) {
        throw fault("conflict", err instanceof Error ? err.message : String(err))
      }
    },
  }
}
