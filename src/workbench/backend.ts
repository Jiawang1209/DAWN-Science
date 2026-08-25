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
import { 插件册 } from "../tools/plugins.js"
import { 旁观, 截一帧 } from "../tools/browser/session.js"
import {
  addAcpAgent,
  addNativeAgent,
  removeAgent,
  setAcpRemoteCapable,
  setProviderConnection,
  setVision,
} from "../config/writer.js"
import { 描述图片 } from "../runtime/vision.js"
import { homedir } from "node:os"
import { randomUUID } from "node:crypto"
import { fingerprintOf, type EnvironmentSnapshot } from "../kernel/environment.js"
import type { EnvironmentStore } from "../store/environments.js"
import { 探测机器, 本地执行 } from "../env/probe.js"
import { 科研目录, 约定正文, pi会读的指令文件, 我们写的指令文件 } from "../policy/science-layout.js"
import type { ShellEnvironment } from "../env/snapshot.js"
import { deriveSessionTitle } from "../session/title.js"
import { readFile } from "node:fs/promises"
import { 展开引用, 剥掉粘贴标记, 规则的毛病, type 文件规则 } from "../files/mentions.js"
import { extname } from "node:path"
import { resizeImage } from "@earendil-works/pi-coding-agent"
import type { ImageAttachment } from "../runtime/types.js"
import type { SessionManager } from "../session/manager.js"
import type { ProjectManager } from "../project/manager.js"
import type { RunStore } from "../store/runs.js"
import type { SettingsStore, SettingKey } from "../store/settings.js"
import { 本地日期 } from "../store/usage.js"
import { 合名单 } from "../mcp/名单.js"
import { loadSkills } from "@earendil-works/pi-coding-agent"
import { addMcpServer, removeMcpServer, 从JSON解出 } from "../config/mcp-writer.js"
import { 是远端MCP, 能上服务器 } from "../config/schema.js"
import { WeixinChannel, type WeixinOps } from "../channels/weixin/channel.js"
import { FeishuChannel, type FeishuOps } from "../channels/feishu/channel.js"
import { fakeFeishuSdk, realFeishuSdk, type FeishuSdk } from "../channels/feishu/sdk.js"
import { 增强 } from "../enhance/enhance.js"
import { 搜文件名 } from "../files/search.js"
import { 转录成markdown, 导出文件名 } from "../session/export.js"
import { ScheduleStore } from "../store/schedules.js"
import { Scheduler, type 完成 as 定时完成 } from "../schedule/scheduler.js"
import { 下一次 as 计划下一次, 校验计划 } from "../schedule/recurrence.js"
import type { 定义 as 定时定义, 运行 as 定时运行 } from "../schedule/domain.js"
import type { 权限档 } from "../policy/permissions.js"
import { mcp指纹 } from "../policy/permissions.js"
import { 读调用策略, 写调用策略, type 调用档 } from "../skills/invocation.js"
import { 预检 as 预检技能, 导入 as 导入技能 } from "../skills/import.js"
import { 忽略目录 } from "../enhance/retrieve.js"
import { readdir, readFile as 读本地, writeFile, rename, rm, stat, copyFile } from "node:fs/promises"
import { join as 拼路径, relative as 相对, resolve, dirname, basename, sep } from "node:path"
import { IlinkClient } from "../channels/weixin/ilink.js"
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
import { diffSince, snapshot, changesAgainstHead, fileDiffAgainstHead, ignoredArtifacts, NotAGitRepoError, type GitBaseline } from "../project/git-facts.js"
import { 表格摘要 } from "../project/table-review.js"
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
import { AGENTS_DIR, loadSubagentsFrom, loadSubagentDefinitions } from "../subagent/definitions.js"
import { join } from "node:path"
import { mkdirSync, existsSync, writeFileSync, statSync, readdirSync, readFileSync, realpathSync } from "node:fs"

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
   * 记忆（2026-08-25，规格 2026-08-25-记忆-design.md）。**与运行时同一份**——
   * 另开一份的话，屏上确认的与会话里注入的会分家。不给就是没装配（操作如实拒）。
   */
  memory?: {
    store: import("../memory/store.js").MemoryStore
    queue: import("../memory/queue.js").SuggestionQueue
    pending: import("../memory/pending-skills.js").待装技能
  }
  /**
   * 系统的下载目录（批 4a，2026-08-17）。主进程给 `app.getPath("downloads")`。
   *
   * **不在这里按平台拼**：那类硬编码会坏在别人机器上，
   * 而且跟不上用户改过的系统设置。没给就退回家目录下的 `Downloads`。
   */
  downloadsDir?: string
  /**
   * 记一次上传（批 4b，2026-08-17）。**不变式 5**：
   * 上传是对那台机器的一次写入，与 agent 改一个文件没有性质区别。
   * 不记的话账本上有个洞——**数据是什么时候、从哪儿进去的，只有你自己记得**。
   *
   * 下载不给这个钩子：它只读，不改变任何东西。
   */
  记一次上传?: (connectionId: string, 目标: string, 字节: number, 出错?: string) => void
  /**
   * 记一次删除（批 5）。**同上：改变世界的操作要记一条 Run。**
   * 而且删除不可逆——它比上传更该留下痕迹。
   */
  记一次删除?: (connectionId: string | undefined, 路径: string, 进了废纸篓: boolean) => void
  /** 归档 / 取消归档落账（7.18）。**删除不落**——删除那条账本自己留着，见 `deleteSession` */
  记一次会话?: (event: "archive" | "unarchive", projectId: string | undefined, sessionId: string) => void
  /** 技能的改动也落账（7.17）：启停、导入、删除——都是对磁盘的一次写 */
  记一次技能?: (event: "invocation" | "import" | "import-overwrite" | "delete", 路径: string, 详情?: string) => void
  /**
   * 把一个本地文件扔进废纸篓。**只有主进程碰得到 `shell.trashItem`**，
   * 与 `openPath` 走同一条注入缝。
   */
  trashItem?: (absolutePath: string) => Promise<void>
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
  /** 子 agent 的三层（7.20）：自带（只读）与你写的；项目那一层固定 `<工作区>/.dawn/agents` */
  subagents?: { 全局目录?: string; 自带目录?: string; 自带停用?: ((name: string) => boolean) | undefined }
  /** 退出时要收的东西在这儿登记（2026-08-23 审查抓的：此前定时调度器的 timer、微信轮询没人停，每次退出都留孤儿） */
  注册收摊?: (f: () => Promise<void> | void) => void
  /** 定时任务的两张表（7.19）。**不给就没有定时**——界面如实说「本次运行没有装配」 */
  schedules?: ScheduleStore
  /** 定时任务的设置；不给用默认 */
  scheduleConfig?: { 补跑窗口分钟?: number; 最多并发?: number; 超时分钟?: number; 每条留几条记录?: number }
  /** 给某段会话定权限档（定时任务的会话按定义里存的档走）。不给就都跟全局设置 */
  设会话权限?: (sessionId: string, 档: 权限档 | undefined) => void
  /** 一次定时运行结束了（推微信用）。不给就不推 */
  定时结束了?: (d: 定时定义, r: 定时运行) => void
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
  /** 窗口在不在前台（远程助理：人在电脑前就不推通知）。不给 = 不知道 = 照推 */
  isForeground?: () => boolean
  /**
   * 用某段会话此刻的模型（或给定 provider + model）问一句（提示词增强，2026-08-21）。
   * 就是 `NativeRuntime.问一句`；不给 = 这次运行没有 native 运行时，增强操作会如实拒绝。
   */
  askOnce?: (
    目标: { sessionId: string } | { provider: string; model: string },
    req: { system?: string; user: string; maxTokens: number; signal?: AbortSignal },
  ) => Promise<{ text: string; model: string }>
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
  skills?: { 全局目录?: string; 项目目录名?: string; 自带目录?: string; 自带档?: ((name: string) => "model" | "manual" | "off" | undefined) | undefined }
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

/**
 * 一个文件的 diff 最多给多少行（2026-08-18）。
 *
 * 一个几十万行的生成文件能把渲染进程拖垮，而**看前两千行足够判断
 * 「这次改了什么性质的东西」**。超了要说清省了多少——不静默截断。
 */
const diff行上界 = 2000

/** 这几件是 `RemoteExecutor` 上我们用到的。**收窄成接口**，这一层不该认识整个执行器 */
interface RemoteExecutorLike {
  readdir(path: string): Promise<{ name: string; directory: boolean; size: number; mtimeMs: number }[]>
  unlink(path: string): Promise<void>
  rmdir(path: string): Promise<void>
}

/**
 * 「测试视觉模型」发的那张诊断图：**一块 32×32 的纯红色方块**（内置，
 * 不读磁盘）。答案唯一、肉眼可核对——端点回「红色方块」就是真通了。
 */
const 诊断图PNG =
  "iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAIAAAD8GO2jAAAAKklEQVR42mO4Y6NBU8QwasGoBaMWjFowasGoBaMWjFowasGoBaMWDBULAKMMAExsYKfaAAAAAElFTkSuQmCC"

export function createWorkbenchBackend(opts: WorkbenchBackendOptions): WorkbenchBackend {
  const { skills, mcp, projects, projectStore, runs, sessions, credentials, registry, events, invalidateCredentials, runRecorder, models, cliHome, settings, openPath, environments, configPath, onProvidersChanged, scratchRoot, remote, tasks, onEnvironmentFrozen, 记一次上传, 记一次删除, 记一次技能, 记一次会话, trashItem, schedules: 定时库, scheduleConfig: 定时设置, 设会话权限, 定时结束了, subagents: 子agent位置, isForeground, askOnce, memory } = opts

  /** 记忆没装配就如实拒（与 scratchRoot 同一条：不猜路径、不静默降级） */
  const 要记忆 = () => {
    if (!memory) throw fault("internal_error", "本次运行没有装配记忆")
    return memory
  }

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
          // 真值（2026-08-19 起）。此前是个 1970 占位，理由见 `ssh.ts` 的 `readdir`
          modifiedAt: new Date(e.mtimeMs).toISOString(),
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

  /**
   * 正在跑的那些传输（批 4a，2026-08-17）。
   *
   * **只在内存里**：传输不跨进程重启活着，应用一关它就该没了。
   * 存进库的话，下次打开会看到一条「传了 37%」的僵尸记录。
   */
  interface 传输记录 {
    已传: number
    总共?: number
    状态: "running" | "done" | "failed" | "cancelled"
    错?: string
    ac: AbortController
    目标: string
  }
  const 传输们 = new Map<string, 传输记录>()
  /**
   * 传输到终态后延时回收(审查 debug F10)。此前 `传输们` 只增不减——每传一个文件留一条,
   * 长时间跑一堆传输后内存里全是 done/failed 的僵尸记录。保留一小段(客户端还在轮 `transferStatus`,
   * 要读到最终态),之后删掉。用 unref 定时器,不拦着进程退出。
   */
  const 传输保留MS = 60_000
  const 终结传输 = (id: string) => {
    const t = setTimeout(() => 传输们.delete(id), 传输保留MS)
    t.unref?.()
  }

  /**
   * 系统的下载目录。**由主进程注入**（`app.getPath("downloads")`）。
   *
   * 没注入时退回家目录下的 `Downloads`——**并且这不是猜**：
   * 那是三个平台上都存在的约定名。真要紧的是**不按平台写死整条路径**，
   * 那类东西会坏在别人机器上（ACP 那条 `launch.ts` 刚栽过同一类）。
   */
  const 默认下载目录 = () => opts.downloadsDir ?? join(homedir(), "Downloads")

  /**
   * 重名就加一个序号。**批 4a 只做「另存一份」这一支**——
   * 「覆盖 / 另存一份 / 取消」那个三选一要问人，连同上传一起在 4b 做。
   *
   * 默默覆盖是这里唯一不能选的：**你可能正在覆盖昨天那一版结果**。
   */
  const 不覆盖的名字 = (p: string) => {
    if (!existsSync(p)) return p
    const 点 = p.lastIndexOf(".")
    const 主 = 点 > p.lastIndexOf("/") ? p.slice(0, 点) : p
    const 尾 = 点 > p.lastIndexOf("/") ? p.slice(点) : ""
    for (let i = 1; i < 1000; i++) {
      const 试 = `${主} (${i})${尾}`
      if (!existsSync(试)) return 试
    }
    throw fault("invalid_request", `${p} 这个名字已经有上千份了，换个下载目录吧`)
  }

  /**
   * 遍历的上界（批 5 之二）。
   *
   * **远端每一层都是一次往返**，一个几万文件的目录能数上好几分钟。
   * 到界就停，并如实说「至少这么多（还没数完）」——
   * **编一个数字比不给数字更坏**。
   */
  const 数到这儿为止 = 5000

  const 数一个本地目录 = (dir: string) => {
    let files = 0
    let bytes = 0
    const 待办 = [dir]
    while (待办.length > 0 && files < 数到这儿为止) {
      const 这层 = 待办.pop()!
      for (const e of readdirSync(这层, { withFileTypes: true })) {
        if (files >= 数到这儿为止) break
        const 全 = join(这层, e.name)
        if (e.isDirectory()) 待办.push(全)
        else {
          files += 1
          try {
            bytes += statSync(全).size
          } catch {
            // 读不到大小就不加：**少算比编一个数好**
          }
        }
      }
    }
    return { files, bytes, counted: (files >= 数到这儿为止 ? "partial" : "complete") as "partial" | "complete" }
  }

  const 数一个远端目录 = async (e: RemoteExecutorLike, dir: string) => {
    let files = 0
    let bytes = 0
    const 待办 = [dir]
    while (待办.length > 0 && files < 数到这儿为止) {
      const 这层 = 待办.pop()!
      const 条目 = await e.readdir(这层).catch(() => [])
      for (const x of 条目) {
        if (files >= 数到这儿为止) break
        if (x.directory) 待办.push(`${这层}/${x.name}`)
        else {
          files += 1
          bytes += x.size
        }
      }
    }
    return { files, bytes, counted: (files >= 数到这儿为止 ? "partial" : "complete") as "partial" | "complete" }
  }

  /** 递归删一个远端目录。**先删干净里面，再 `rmdir` 自己** */
  const 递归删远端 = async (e: RemoteExecutorLike, dir: string): Promise<void> => {
    for (const x of await e.readdir(dir)) {
      const 全 = `${dir}/${x.name}`
      if (x.directory) await 递归删远端(e, 全)
      else await e.unlink(全)
    }
    await e.rmdir(dir)
  }

  /** 钥匙串里的键。**加前缀**：SSH 口令与模型 key 共用一个凭证库，撞名就是串号 */
  /**
   * 视觉服务此刻的状态（2026-08-20）。**缺失不等于能用**：
   * `enabled: true` 但缺地址/模型/密钥的任何一样，`ready` 就是 false，
   * 且说清缺哪样——界面照着这句写「未配置」的原因。
   */
  const 视觉状态 = () => {
    const v = registry.vision
    const hasSecret = credentials.get("vision:apiKey") !== undefined
    const 缺 = [
      ...(v?.baseUrl ? [] : ["API 地址"]),
      ...(v?.model ? [] : ["模型名称"]),
      ...(hasSecret ? [] : ["API 密钥"]),
    ].join("、")
    return {
      enabled: v?.enabled ?? false,
      api: v?.api ?? "openai-completions",
      ...(v?.baseUrl ? { baseUrl: v.baseUrl } : {}),
      ...(v?.model ? { model: v.model } : {}),
      hasSecret,
      ready: (v?.enabled ?? false) && 缺 === "",
      缺: 缺 ? `缺 ${缺}` : "",
    }
  }

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
    // 开关那份在 attach 之前就 emit 过了、没人听见——接好线再问一次（codex-polish 第二档）
    const 开关 = sessions.configOptions(rec.id)
    if (开关 && 开关.length > 0) events.ingest(rec.id, { kind: "config_options", sessionId: rec.id, options: 开关 })
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
   *
   * @param 起点 从哪个目录开始。**只有续接才给**（2026-08-19）：
   *   新建一段对话从家目录开始，而**接着上一次聊要接在上一次那个目录里**——
   *   记录里存 `remoteCwd` 正是为了这个。退回家目录的话，
   *   界面上那条路径与 agent 实际所在的目录会对不上。
   */
  async function 造远端参数(connectionId: string, 起点?: string) {
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

    let 现在在 = 起点 ?? 家
    let 会话id: string | undefined
    const spec = {
      connectionId,
      // **句柄，不是实例**：断线重连之后这段会话还要能接着用（`handleOf` 的说明）
      executor: manager.handleOf(connectionId, rec.label),
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
  /** `@` 引用的设置（7.23）。规则存 json；坏掉的（手改过库）当空 */
  function 读艾特设置(workspace: string | undefined): { ignorePasted: boolean; globalRules: 文件规则[]; workspaceRules?: 文件规则[] } {
    const 读规则 = (key: "atfile.rules" | `atfile.rules.${string}`): 文件规则[] => {
      try {
        const v = JSON.parse(settings?.get(key) ?? "[]") as unknown
        return Array.isArray(v) ? (v as 文件规则[]).filter((r) => r && typeof r.pattern === "string" && (r.kind === "exact" || r.kind === "regex")).map((r) => ({ kind: r.kind, pattern: r.pattern, caseSensitive: Boolean(r.caseSensitive) })) : []
      } catch {
        return []
      }
    }
    return {
      ignorePasted: settings?.get("atfile.ignorePasted") !== "0",
      globalRules: 读规则("atfile.rules"),
      ...(workspace ? { workspaceRules: 读规则(`atfile.rules.${workspace}`) } : {}),
    }
  }

  async function 附上引用(sessionId: string, text: string): Promise<{ text: string; refs: { path: string; kind: "file" | "directory" }[] }> {
    if (!text.includes("@")) return { text, refs: [] }
    const rec = sessions.get(sessionId)
    if (!rec) return { text, refs: [] }
    if (rec.connectionId) {
      const e = 远端().manager.executorOf(rec.connectionId)
      const 根 = rec.remoteCwd ?? rec.workspace
      if (!e || !根) return { text, refs: [] }
      return 展开引用(
        text,
        async (rel) => {
          const st = await e.stat(`${根.replace(/\/+$/, "")}/${rel}`)
          return st.directory ? "directory" : "file"
        },
        rec.connectionId,
      )
    }
    return 展开引用(text, async (rel) => {
      // 守卫在 `resolveInWorkspace`：越界直接抛 → 当不存在
      const st = await stat(resolveInWorkspace(rec.workspace, rel))
      return st.isDirectory() ? "directory" : st.isFile() ? "file" : undefined
    })
  }

  function 这一轮叫什么(sessionId: string): string | undefined {
    const rec = sessions.get(sessionId)
    const agentId = rec?.agentId
    const def = agentId ? registry.agents[agentId] : undefined
    if (def?.kind !== "kernel") return undefined
    return def.language === "R" ? "execute_r" : def.language === "python" ? "execute_python" : "kernel_execute"
  }

  /**
   * 远程助理 · 微信（2026-08-21）。**通道只调下面这些操作，不碰任何内部对象**——
   * 微信里说一句与界面上按发送走的是同一条路。`ops` 是懒取的：通道建在操作表之前，
   * 第一次真用到时表已经在了。
   *
   * `DAWN_FAKE_ILINK=<url>`：e2e / dev:mock 把微信那头指到假服务器（与 `DAWN_FAKE_SSH` 同一套惯例）。
   */
  const 假微信 = process.env["DAWN_FAKE_ILINK"]
  const 微信 = new WeixinChannel({
    client: (baseUrl) =>
      new IlinkClient(
        假微信 ? { baseUrl: baseUrl ?? 假微信, qrBaseUrl: 假微信, cdnBaseUrl: `${假微信}/c2c` } : { ...(baseUrl ? { baseUrl } : {}) },
      ),
    settings: {
      get: (k) => settings?.get(k),
      set: (k, v, now) => settings?.set(k, v, now),
    },
    credentials,
    events,
    // 操作表的返回类型是按协议推导的宽类型；这几个操作的真实返回形状就是 `WeixinOps` 写的那几种
    ops: () => backend as unknown as WeixinOps,
    ...(isForeground ? { isForeground } : {}),
    defaultAgentId: () => Object.entries(registry.agents).find(([, d]) => d.kind === "native")?.[0],
    whereIs: (sessionId) => {
      const rec = sessions.get(sessionId)
      if (!rec?.connectionId) return undefined
      const c = remote?.store.get(rec.connectionId)
      return { ...(c?.label ? { label: c.label } : {}), ...(rec.remoteCwd ? { cwd: rec.remoteCwd } : {}) }
    },
    log: (line) => console.error(line),
  })
  /**
   * 飞书（2026-08-25，规格 2026-08-25-飞书通道-design.md）：与微信同构的第二格。
   * `DAWN_FAKE_FEISHU=<url>`：e2e / dev:mock 把飞书那头指到假服务器（与 DAWN_FAKE_ILINK 同惯例）。
   */
  const 假飞书 = process.env["DAWN_FAKE_FEISHU"]
  // **同一个 sdk 实例复用**(审查 debug D8):real SDK 把 create 出的 reaction_id 记在实例内的
  // Map 里,撤 OnIt 要用它。此前 `sdk()` 每调一次都新建实例,create 记在一个实例、delete 在另一个空 Map 里
  // 找不到——线上 OnIt 一次都撤不掉(fake 因状态在假服务器上验不出)。记忆化成单实例。
  let 飞书sdk实例: FeishuSdk | undefined
  const 飞书 = new FeishuChannel({
    sdk: () => (飞书sdk实例 ??= 假飞书 ? fakeFeishuSdk(假飞书) : realFeishuSdk()),
    settings: {
      get: (k) => settings?.get(k),
      set: (k, v, now) => settings?.set(k, v, now),
    },
    credentials,
    events,
    ops: () => backend as unknown as FeishuOps,
    ...(isForeground ? { isForeground } : {}),
    defaultAgentId: () => Object.entries(registry.agents).find(([, d]) => d.kind === "native")?.[0],
    whereIs: (sessionId) => {
      const rec = sessions.get(sessionId)
      if (!rec?.connectionId) return undefined
      const c = remote?.store.get(rec.connectionId)
      return { ...(c?.label ? { label: c.label } : {}), ...(rec.remoteCwd ? { cwd: rec.remoteCwd } : {}) }
    },
    log: (line) => console.error(line),
  })
  const 要设置 = () => {
    if (!settings) throw fault("invalid_request", "本次运行没有设置存储，接不了微信")
  }

  /** 删一个会话：停进程 → 删记录 → 删任务 → **最后**会话目录进废纸篓（顺序见里面）。`deleteSession` 与「删掉全部归档」共用 */
  const 删一个会话 = async (sessionId: string): Promise<{ ledgerKept: number; transcriptTrashed: boolean; problem?: string }> => {
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
      // **tasks 未装配时不抛**(审查 debug F13):这一步在 sessions.remove 之后,若 `任务库()` 因未装配
      // 抛出,会话已经删了、任务清理与目录进废纸篓却没做,留下半完成态。未装配 = 本就没有任务可删,跳过即可。
      tasks?.removeBySessions([sessionId])
      设会话权限?.(sessionId, undefined)
      /**
       * **账本留着，并且把还剩多少说出来。**
       * 一句「已删除」会让人以为历史也一起没了——而它没有，
       * 这正是这个产品与一个聊天窗口的区别（不变式 5）。
       */
      const kept = rec.projectId ? runs.countByProject(rec.projectId) : 0
      /**
       * **最后才碰磁盘**（2026-08-22，学自 dsh-archive-manager 的删除顺序）：上面记账那些失败了，
       * 目录还在、可以重试；目录进了废纸篓之后再失败就什么都找不回来了。
       * 此前这个操作**根本不删目录**——`<workspace>/.dawn/sessions/<id>`（pi 的 jsonl、工具输出转储）
       * 一直留在用户的仓库里，而界面说的是「删掉对话记录」。进废纸篓而不是 rm：与删文件同一口径，删错了能捞。
       */
      let transcriptTrashed = false
      let problem: string | undefined
      if (!existsSync(rec.sessionDir)) problem = undefined
      else if (!trashItem) problem = "本次运行没有装配废纸篓，会话目录留在原处"
      else {
        try {
          await trashItem(rec.sessionDir)
          transcriptTrashed = true
        } catch (e) {
          problem = `会话目录没删掉，留在 ${rec.sessionDir}：${e instanceof Error ? e.message : String(e)}`
          console.error(`[会话] ${problem}`)
        }
      }
      return { ledgerKept: kept, transcriptTrashed, ...(problem ? { problem } : {}) }
  }

  /* ── 技能管理的守卫（7.17）：只许碰「你写的」与「这个项目带的」两个目录里的 SKILL.md ── */
  const 技能目标根 = (to: "global" | "project", projectId: string | undefined): string => {
    const 位置 = skills ?? {}
    if (to === "global") {
      if (!位置.全局目录) throw fault("internal_error", "本次运行没有装配全局技能目录")
      return 位置.全局目录
    }
    if (!projectId) throw fault("invalid_request", "导进项目要先说是哪个项目")
    const p = projectStore.get(projectId)
    if (!p) throw fault("not_found", `没有这个项目：${projectId}`)
    if (!位置.项目目录名) throw fault("internal_error", "本次运行没有装配项目技能目录")
    return join(p.workspace, 位置.项目目录名)
  }
  /** 自带的技能 / 子 agent 的开关读的是设置里那把键（2026-08-23）——与运行时（wiring 里的闭包）同一把 */
  const 自带技能档 = (name: string): "model" | "manual" | "off" | undefined => {
    const v = settings?.get(`skill.mode.${name}`)
    return v === "model" || v === "manual" || v === "off" ? v : undefined
  }
  const 自带子agent停用 = (name: string): boolean => settings?.get(`subagent.off.${name}`) === "1"
  /** frontmatter 里的 `name:`——自带的技能 / 子 agent 用它当设置键（目录名可能与它不同） */
  const 读定义名 = (filePath: string): string | undefined => {
    try {
      const 头 = readFileSync(filePath, "utf8").slice(0, 4000)
      const m = /^---\r?\n[\s\S]*?^name:\s*["']?([^"'\r\n]+)["']?\s*$/m.exec(头)
      return m?.[1]?.trim() || undefined
    } catch {
      return undefined
    }
  }
  /** 路径必须是某个可改目录下一层的 `<name>/SKILL.md`；自带目录里的、别处的、深层的都拒 */
  const 技能文件必须可改 = (filePath: string): string => {
    const 位置 = skills ?? {}
    const 文件 = resolve(filePath)
    if (basename(文件) !== "SKILL.md") throw fault("invalid_request", "只改技能的 SKILL.md")
    const 可改根 = [
      ...(位置.全局目录 ? [resolve(位置.全局目录)] : []),
      ...(位置.项目目录名 ? projectStore.list().map((p) => resolve(p.workspace, 位置.项目目录名!)) : []),
    ]
    const 根 = 可改根.find((r) => dirname(dirname(文件)) === r)
    if (!根) {
      if (位置.自带目录 && 文件.startsWith(resolve(位置.自带目录) + sep)) throw fault("invalid_request", "自带的技能在应用包里，只读；想改就复制一份到你自己的目录")
      throw fault("invalid_request", `${文件} 不在任何一个可改的技能目录里`)
    }
    return 文件
  }
  /** 同目录临时文件 + rename：中断不会留下半截 SKILL.md */
  const 原子写 = async (文件: string, 内容: string) => {
    const 临 = join(dirname(文件), `.SKILL.md.dawn-${process.pid}-${Date.now()}.tmp`)
    try {
      await writeFile(临, 内容, "utf8")
      await rename(临, 文件)
    } catch (e) {
      await rm(临, { force: true }).catch(() => undefined)
      throw e
    }
  }

  /* ── 子 agent 名册的守卫与导入（7.20） ── */
  const 子agent层 = (workspace: string | undefined) => [
    ...(workspace ? [{ dir: join(workspace, AGENTS_DIR), from: "project" as const }] : []),
    ...(子agent位置?.全局目录 ? [{ dir: 子agent位置.全局目录, from: "global" as const }] : []),
    ...(子agent位置?.自带目录 ? [{ dir: 子agent位置.自带目录, from: "builtin" as const }] : []),
  ]
  const 子agent目标根 = (to: "global" | "project", projectId: string | undefined): string => {
    if (to === "global") {
      if (!子agent位置?.全局目录) throw fault("internal_error", "本次运行没有装配全局子 agent 目录")
      return 子agent位置.全局目录
    }
    if (!projectId) throw fault("invalid_request", "导进项目要先说是哪个项目")
    const p = projectStore.get(projectId)
    if (!p) throw fault("not_found", `没有这个项目：${projectId}`)
    return join(p.workspace, AGENTS_DIR)
  }
  /** 路径必须是「你写的」或某个项目 `.dawn/agents` 下一层的 `.md`；自带的拒 */
  const 子agent文件必须可改 = (filePath: string): string => {
    const 文件 = resolve(filePath)
    if (!文件.endsWith(".md")) throw fault("invalid_request", "只改 .md 的定义文件")
    const 可改根 = [
      ...(子agent位置?.全局目录 ? [resolve(子agent位置.全局目录)] : []),
      ...projectStore.list().map((p) => resolve(p.workspace, AGENTS_DIR)),
    ]
    if (!可改根.includes(dirname(文件))) {
      if (子agent位置?.自带目录 && 文件.startsWith(resolve(子agent位置.自带目录) + sep)) throw fault("invalid_request", "自带的子 agent 在应用包里，只读；想改就复制一份到你自己的目录")
      throw fault("invalid_request", `${文件} 不在任何一个可改的子 agent 目录里`)
    }
    return 文件
  }
  /** 停用 = frontmatter 里 `disabled: true` 一行；启用 = 把那一行删掉。文本级替换，别的不动 */
  const 写停用 = (text: string, 停: boolean): string | undefined => {
    const bom = text.charCodeAt(0) === 0xfeff ? "\ufeff" : ""
    const 正 = bom ? text.slice(1) : text
    const 换行 = 正.includes("\r\n") ? "\r\n" : "\n"
    const 行们 = 正.split(/\r?\n/)
    if (行们[0]?.trim() !== "---") return undefined
    const end = 行们.findIndex((l, i) => i > 0 && l.trim() === "---")
    if (end < 0) return undefined
    const 头 = 行们.slice(1, end).filter((l) => !/^disabled\s*:/.test(l))
    if (停) 头.push("disabled: true")
    return bom + ["---", ...头, "---", ...行们.slice(end + 1)].join(换行)
  }
  /** 导入 `.md` 定义（一个或一筐）。同名冲突先问；覆盖前备份、失败回滚 */
  const 导入定义文件 = async (source: string, 根: string, 覆盖: boolean, 只预检: boolean) => {
    const st = await stat(source).catch(() => undefined)
    if (!st) return { why: `路径不存在：${source}` }
    const 文件们 = st.isDirectory() ? (await readdir(source)).filter((n) => n.endsWith(".md")).map((n) => join(source, n)) : source.endsWith(".md") ? [source] : []
    if (文件们.length === 0) return { why: `这里没有 .md 的定义文件：${source}` }
    const pending: { name: string; source: string }[] = []
    const conflicts: { name: string; source: string }[] = []
    const failed: { source: string; why: string }[] = []
    for (const f of 文件们) {
      const r = loadSubagentsFrom([{ dir: dirname(f), from: "global" }]).agents.find((a) => resolve(a.filePath) === resolve(f))
      if (!r) {
        failed.push({ source: f, why: "读不进来（frontmatter 缺 name / description，或正文为空）" })
        continue
      }
      const dest = join(根, `${r.name}.md`)
      if (resolve(dest) === resolve(f)) {
        failed.push({ source: f, why: "来源就是目标" })
        continue
      }
      ;(existsSync(dest) ? conflicts : pending).push({ name: r.name, source: f })
    }
    if (只预检) return { pending, conflicts, imported: [], skipped: [], failed }
    const imported: { name: string; dest: string; overwritten: boolean }[] = []
    const skipped: { name: string; source: string }[] = []
    if (pending.length + (覆盖 ? conflicts.length : 0) > 0) mkdirSync(根, { recursive: true })
    for (const c of pending) {
      const dest = join(根, `${c.name}.md`)
      try {
        await copyFile(c.source, dest)
        imported.push({ name: c.name, dest, overwritten: false })
      } catch (e) {
        failed.push({ source: c.source, why: e instanceof Error ? e.message : String(e) })
      }
    }
    for (const c of conflicts) {
      if (!覆盖) {
        skipped.push(c)
        continue
      }
      const dest = join(根, `${c.name}.md`)
      const 备份 = `${dest}.dawn-backup-${Date.now()}`
      try {
        await rename(dest, 备份)
        await copyFile(c.source, dest)
        await rm(备份, { force: true })
        imported.push({ name: c.name, dest, overwritten: true })
      } catch (e) {
        await rename(备份, dest).catch(() => undefined)
        failed.push({ source: c.source, why: e instanceof Error ? e.message : String(e) })
      }
    }
    return { pending: [], conflicts: [], imported, skipped, failed }
  }

  /* ── 提示词增强的工作区读法：本地走 fs，远端走那台机器的 find / cat ── */
  const 增强中 = new Map<string, AbortController>()
  async function 列工作区(rec: { workspace: string; connectionId?: string | undefined; remoteCwd?: string | undefined }, 后缀: RegExp, 最深: number): Promise<string[]> {
    if (rec.connectionId) {
      const ex = 远端().manager.executorOf(rec.connectionId)
      if (!ex) throw new Error("服务器没连着")
      const 根 = rec.remoteCwd ?? rec.workspace
      const 排除 = [...忽略目录].map((d) => `-name ${JSON.stringify(d)} -prune -o`).join(" ")
      const r = await ex.exec(`find . -maxdepth ${最深} \( ${排除} -type f -print \) 2>/dev/null | head -2000`, { cwd: 根, timeoutSec: 5 })
      return r.stdout
        .split("\n")
        .map((l) => l.replace(/^\.\//, ""))
        .filter((l) => l && 后缀.test(l))
    }
    const 出: string[] = []
    const 走 = async (dir: string, 深: number) => {
      if (深 > 最深 || 出.length >= 2000) return
      let 条: import("node:fs").Dirent[]
      try {
        条 = await readdir(dir, { withFileTypes: true })
      } catch {
        return
      }
      for (const d of 条) {
        const 全 = 拼路径(dir, d.name)
        if (d.isDirectory()) {
          if (!忽略目录.has(d.name)) await 走(全, 深 + 1)
        } else if (后缀.test(d.name)) 出.push(相对(rec.workspace, 全))
      }
    }
    await 走(rec.workspace, 1)
    return 出
  }
  async function 读工作区(rec: { workspace: string; connectionId?: string | undefined; remoteCwd?: string | undefined }, p: string): Promise<string> {
    if (rec.connectionId) {
      const ex = 远端().manager.executorOf(rec.connectionId)
      if (!ex) throw new Error("服务器没连着")
      const 根 = rec.remoteCwd ?? rec.workspace
      return (await ex.readFile(`${根.replace(/\/$/, "")}/${p}`)).toString("utf8").slice(0, 200_000)
    }
    return (await 读本地(拼路径(rec.workspace, p), "utf8")).slice(0, 200_000)
  }

  /* ── 定时任务（7.19）：执行器 = 开一段任务 → 写任务说明 → 等 agent 这一轮结束 ── */
  const 要定时 = (): ScheduleStore => {
    if (!定时库) throw fault("internal_error", "本次运行没有装配定时任务")
    return 定时库
  }
  const 运行摘要 = (r: 定时运行) => ({
    id: r.id, scheduleId: r.scheduleId, revision: r.revision, trigger: r.trigger, scheduledFor: r.scheduledFor, status: r.status,
    ...(r.sessionId ? { sessionId: r.sessionId } : {}), ...(r.startedAt ? { startedAt: r.startedAt } : {}), ...(r.finishedAt ? { finishedAt: r.finishedAt } : {}),
    ...(r.summary ? { summary: r.summary } : {}), ...(r.error ? { error: r.error } : {}),
  })
  const 定时摘要 = (d: 定时定义) => {
    const 最近 = 定时库?.runs(d.id, 1)[0]
    const next = d.status === "active" ? 计划下一次(d.schedule, new Date().toISOString()) : null
    return {
      id: d.id, revision: d.revision, name: d.name, prompt: d.prompt, status: d.status, schedule: d.schedule, agentId: d.agentId,
      ...(d.workspace ? { workspace: d.workspace } : {}), ...(d.connectionId ? { connectionId: d.connectionId } : {}),
      where: d.connectionId ? (服务器名(d.connectionId) ?? d.connectionId) : (d.workspace ?? ""),
      permission: d.permission,
      createdAt: d.createdAt, updatedAt: d.updatedAt,
      ...(next ? { nextAt: next } : {}), ...(最近 ? { lastRun: 运行摘要(最近) } : {}),
    }
  }
  /**
   * 跑一次。**全新会话、不继承任何对话**（照 dsh-automation）：`createTask` 开一段，标题「<任务名> · <时刻>」，
   * 以用户身份写进任务说明，等 agent 这一轮的 `final` 那条——那段文字就是摘要。
   * 会话退出 / 超时 / 被取消都各自落一个码。无人值守，权限用设置里的档，问不到人的一律拒（门本来就是这么做的）。
   */
  const 定时执行器 = async (d: 定时定义, r: 定时运行, signal: AbortSignal): Promise<定时完成> => {
    const 超时毫秒 = (定时设置?.超时分钟 ?? 60) * 60_000
    const t = (await backend.createTask({ agentId: d.agentId, ...(d.workspace ? { workspace: d.workspace } : {}), ...(d.connectionId ? { connectionId: d.connectionId } : {}) })) as { sessionId?: string }
    const sessionId = t.sessionId
    if (!sessionId) return { status: "failed", error: { code: "no_session", message: "开任务时没有拿到会话" } }
    // 这段会话按定义里存的档走（门每次调用都问，所以建好会话、写话之前定就来得及）
    设会话权限?.(sessionId, d.permission)
    projects.setSessionTitle(sessionId, `${d.name} · ${new Date(r.scheduledFor).toLocaleString("zh-CN", { hour12: false })}`)
    let 收外: ((v: 定时完成) => void) | undefined
    const 等结束 = new Promise<定时完成>((resolve) => {
      let 完了 = false
      const 收 = (v: 定时完成) => {
        if (完了) return
        完了 = true
        clearTimeout(计时)
        退订()
        signal.removeEventListener("abort", 取消)
        resolve({ ...v, sessionId })
      }
      const 退订 = events.onAnyUpdate((u) => {
        if (u.sessionId !== sessionId) return
        if (u.type === "state" && u.state === "exited") 收({ status: "failed", error: { code: "session_exited", message: `会话在这一轮结束前退出了（exit ${u.exitCode ?? "?"}）` } })
        if (u.type === "item" && u.item.type === "turn" && u.item.who === "agent" && u.item.final) 收({ status: "succeeded", summary: u.item.text.trim().slice(0, 2000) })
      })
      const 计时 = setTimeout(() => {
        void sessions.abort(sessionId).catch(() => {})
        收({ status: "failed", error: { code: "timeout", message: `跑了 ${定时设置?.超时分钟 ?? 60} 分钟还没结束，停了` } })
      }, 超时毫秒)
      const 取消 = () => {
        void sessions.abort(sessionId).catch(() => {})
        收({ status: "cancelled", error: { code: "cancelled", message: "DAWN 停了，这一次取消" } })
      }
      signal.addEventListener("abort", 取消)
      收外 = 收
    })
    try {
      sessions.leases.acquire(sessionId, "user")
      await backend.writeToSession({ sessionId, data: r.prompt, as: "user" })
    } catch (e) {
      // 写话失败也要把监听、计时、abort 钩子收干净（2026-08-23 审查抓的：此前留到 60 分钟超时才触发一次无谓的 abort）
      const 失败: 定时完成 = { status: "failed", sessionId, error: { code: "write_failed", message: e instanceof Error ? e.message : String(e) } }
      收外?.(失败)
      return 失败
    }
    return 等结束
  }
  const 调度器 = 定时库
    ? new Scheduler({
        store: 定时库,
        now: () => new Date().toISOString(),
        执行: async (d, r, signal) => {
          const 完 = await 定时执行器(d, r, signal)
          const 结果 = { ...r, status: 完.status, ...(完.summary ? { summary: 完.summary } : {}), ...(完.error ? { error: 完.error } : {}), ...(完.sessionId ? { sessionId: 完.sessionId } : {}) }
          定时结束了?.(d, 结果)
          // 推微信：绑了才发；跟「跑完 / 出错」两个开关走
          void 微信.定时跑完了(d.name, 完.status, 完.summary ?? 完.error?.message, new Date().toLocaleString("zh-CN", { hour12: false })).catch(() => {})
          void 飞书.定时跑完了(d.name, 完.status, 完.summary ?? 完.error?.message, new Date().toLocaleString("zh-CN", { hour12: false })).catch(() => {})
          return 完
        },
        补跑窗口毫秒: (定时设置?.补跑窗口分钟 ?? 15) * 60_000,
        最多并发: 定时设置?.最多并发 ?? 2,
        每条留几条记录: 定时设置?.每条留几条记录 ?? 200,
        log: (m) => console.error(`[定时] ${m}`),
      })
    : undefined

  const backend: WorkbenchBackend = {
    listProjects: async () => projects.list(),

    /**
     * **把一个文件夹认成项目**（2026-08-19，作者要的）。
     *
     * 作者：*「我在选择文件夹后，立刻进入项目，文件tree也转入。」*
     *
     * **只认领，不建会话**：「开口那一刻才建」那条决定管的是任务/会话。
     * 侧栏那一列由任务分组而来，**一个没有任务的项目在界面上不出现**。
     *
     * **幂等**由 `ProjectManager.open` 保证：同一个文件夹永远命中同一条记录，
     * 所以人选错了再选一次不会堆积出一串项目。
     */
    openProject: async ({ workspace }) => {
      let rec
      try {
        rec = projects.open(workspace)
      } catch (e) {
        // 相对路径这类是**请求本身不合法**，不是内部故障——两者在界面上不该长得一样
        throw fault("invalid_request", e instanceof Error ? e.message : String(e))
      }
      const 摘要 = projectStore.summary(rec.projectId)
      if (!摘要) throw fault("internal_error", `刚打开的项目取不到摘要：${rec.projectId}`)
      return 摘要
    },

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
          ...(def.kind === "acp" ? { remoteCapable: def.remoteCapable } : {}),
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

    listRuns: async ({ projectId, sessionId, pageSize, after }) => {
      requireProject(projectId)
      return projects.runs(projectId, {
        ...(sessionId ? { sessionId } : {}),
        limit: pageSize,
        // 游标透传(审查 debug F9):此前 after 被接收却丢弃,分页永远回第一页
        ...(after ? { after } : {}),
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
      const 记录 = sessions.get(sessionId)
      /** 续接为什么没成。**留着**，下面那句订阅失败时要拿它说话 */
      let 没续上因为: string | undefined
      if (!sessions.isLive(sessionId) && 记录) {
        try {
          /**
           * **长在服务器上的那些，要连回那台机器再续**（2026-08-19 修）。
           *
           * 作者：*「点击服务器里面以前的会话的时候，连接不上之前的历史会话。」*
           *
           * 此前这里是光秃秃一个 `resume(sessionId)`——而 `resume()` 的第二个
           * 参数恰恰是那台机器的执行器。不传的话，这段对话被拿到**本机**拉起，
           * 工作目录是一条远端路径、本地根本不存在，于是必然失败。
           * 与 2026-08-14 那次「任务标着远端、活跑在本机」是同一种错，
           * 只是这一次发生在**续接**而不是**新建**。
           */
          const 远端参数 = 记录.connectionId
            ? await 造远端参数(记录.connectionId, 记录.remoteCwd)
            : undefined
          await sessions.resume(sessionId, 远端参数?.spec as never)
          远端参数?.认领(sessionId)
          events.track(sessionId, "native")
          sessions.attach(sessionId, (e) => {
            events.ingest(sessionId, e)
            runRecorder?.ingest(e)
          })
          const 历史 = await sessions.history(sessionId)
          if (历史.length > 0) events.restore(sessionId, 历史.map(还原成条目))
          const 开关 = sessions.configOptions(sessionId)
          if (开关 && 开关.length > 0) events.ingest(sessionId, { kind: "config_options", sessionId, options: 开关 })
        } catch (e) {
          /**
           * **不再静默吞掉**（规格 7.5，2026-08-19）。
           *
           * 从前这里是个空的 `catch {}`，于是无论「这类会话本来就续不了」
           * 还是「那台服务器连不上」，界面看到的都是同一句
           * 「不在本进程中活动」——那句话对**任何**原因都成立，
           * 所以它其实什么都没说。作者报的正是这个：点了，一片空白，没人告诉他为什么。
           *
           * **也不在这里直接抛**：续不上未必意味着这次订阅要失败
           * （本来就活着的、或者根本没记录的，下面那句照样成得了），
           * 所以把原因记下来，交给真正失败的那一处去说。
           */
          没续上因为 = e instanceof Error ? e.message : String(e)
        }
      }
      try {
        return events.subscribe(sessionId)
      } catch (err) {
        // 「会话不在本进程中活动」是业务性失败——进程重启后旧会话就是这个状态，
        // 界面要能分辨它和「数据库炸了」
        //
        // **知道真原因就说真原因**：那一句泛泛的话留给「确实只是没活着」。
        throw fault("not_found", 没续上因为 ?? (err instanceof Error ? err.message : String(err)))
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
       * **远端任务只收手能到服务器的 agent**（T3，2026-08-21）。
       *
       * 此前这里什么都收：codex-acp / cli / kernel 的运行时不认 `spec.remote`，
       * 建出来的任务标着「远端」、活跑在本机——静默错位。
       * 在**连服务器之前**拒（连一次要好几秒，拒绝不该先让人等）。
       */
      if (connectionId) {
        const def = registry.agents[agentId]
        // **不认识的 agentId 也在这儿拒**：放它过去，要先连一次服务器才失败
        if (!def) throw fault("invalid_request", `配置里没有叫「${agentId}」的 agent`)
        if (!能上服务器(def)) {
          throw fault(
            "invalid_request",
            `「${agentId}」的手到不了服务器——它自己读写文件、跑命令，都在本机。` +
              `远端会话请用 API 模型，或标了「能上服务器」的 ACP 适配器（如 claude-code-acp）。`,
          )
        }
      }

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
      /**
       * **没给工作目录的对话各自一个目录**（2026-08-23 审查抓的）：此前传 `undefined` 下去，`起一个会话` 退回临时项目的根——
       * 所有散的对话共用一个目录，文件互相可见、互相覆盖；而 `setTaskWorkspace(undefined)` 那条路早就是各自一个子目录。两条路现在一样。
       */
      const 去处 = workspace ?? (connectionId ? undefined : projects.temporaryWorkspace(要有临时根()))
      const 会话 = await 起一个会话(
        归属.projectId,
        agentId,
        去处,
        远端参数?.spec as never,
      )
      远端参数?.认领(会话.sessionId)

      const rec = {
        taskId: `task-${randomUUID()}`,
        ...(workspace ? { workspace } : {}),
        // 临时会话把 scratch 落点说出来（协议 entities 里那一格的注）；远端没有本机落点
        ...(!workspace && 去处 ? { scratchWorkspace: 去处 } : {}),
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
          /**
           * **两种形态各答各的**（2026-08-19）：本机那种有 `command` / `cwd`，
           * 远端那种有 `url` / `transport`。**要的密钥共用一格**——
           * 本机是环境变量名、远端是请求头名，而「还差哪个没填」是同一个问题。
           */
          // **先落到一个 `const` 上**：类型守卫窄不动属性链（`台.服务器`）
          const 服务器 = 台.服务器
          const 远端 = 是远端MCP(服务器)
          const 指纹 = mcp指纹(服务器 as { command?: string; args?: readonly string[]; url?: string })
          const cwd = 远端 ? 工作区 : (服务器.cwd ?? 工作区)
          const 已连 = mcp?.池.查(台.名, cwd)
          const 要的 = 远端 ? (服务器.headers ?? []) : (服务器.env ?? [])
          const 缺 = 要的.filter((v) => credentials.get(`mcp:${台.名}:${v}`) === undefined)
          return {
            name: 台.名,
            ...(远端
              ? { url: 服务器.url, transport: 服务器.type }
              : { command: 服务器.command }),
            args: [...(远端 ? [] : (服务器.args ?? []))],
            env: [...要的],
            missingSecrets: 缺,
            ...(!远端 && 服务器.cwd ? { cwd: 服务器.cwd } : {}),
            from: 台.来自 === "全局" ? ("global" as const) : ("project" as const),
            // 信任按「名字+指纹」查(审查 debug G6):同名换了命令/地址 = 另一台,不继承信任
            trusted: settings?.get(`mcp.trusted.${台.名}:${指纹}`) === "1",
            fingerprint: 指纹,
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
      /**
       * **先断开再连**：改完配置按「试一次」，要试的是新配置而不是旧连接。
       *
       * `cwd` 只有本机那种才有——远端那种我们连它的进程都看不见（2026-08-19）。
       */
      const 那台 = 台.服务器
      await mcp.池.关(name, 是远端MCP(那台) ? 工作区 : (那台.cwd ?? 工作区))
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

    /**
     * 加一个 ACP 适配器（2026-08-19）。
     *
     * 作者：*「你现在要在选择模型的地方加上我们之前开发 ACP 的东西，
     * 否则岂不是白开发了。」* ——代码全在，缺的只是一个入口。
     *
     * **加完当场就能在模型选择器里选到**：与 `setProviderConnection`
     * 同一条纪律，原地更新那个被多处按引用持有的 `registry.agents`。
     * 只写文件不更新内存的话，界面会说「已添加」而它要等重启才存在——
     * **那是一句半真的话**。
     *
     * **不生成 `models.json`**（那是 native 那条路的事）：
     * ACP 的模型由适配器自己广播。
     */
    addAcpAgent: async ({ agentId, command, args, remoteCapable }) => {
      if (!configPath) throw fault("invalid_request", "本次运行没有装配配置文件，加不了")
      let 新的: ProviderRegistry
      try {
        新的 = addAcpAgent(configPath, { agentId, command, args, ...(remoteCapable ? { remoteCapable } : {}) })
      } catch (e) {
        if (e instanceof UserFacingError) throw fault("invalid_request", e.message)
        throw e
      }
      for (const k of Object.keys(registry.agents)) delete registry.agents[k]
      Object.assign(registry.agents, 新的.agents)
      return { agentId }
    },

    /**
     * 删一个 agent（2026-08-19）。
     *
     * **加得进去就得删得掉**——加错一次之后还得回去打开那个 yaml 的话，
     * `config/writer.ts` 这一整个文件就白写了。
     *
     * **正在用它的会话不动。** 那些会话已经起来了，删掉配置不该把它们掐掉；
     * 而重启之后它们本来就续不上（`resume` 会说「未知的 agent」，
     * 那句话是准确的）。悄悄把活着的进程杀掉才是意外。
     */
    removeAgent: async ({ agentId }) => {
      if (!configPath) throw fault("invalid_request", "本次运行没有装配配置文件，删不了")
      let 新的: ProviderRegistry
      try {
        新的 = removeAgent(configPath, agentId)
      } catch (e) {
        if (e instanceof UserFacingError) throw fault("invalid_request", e.message)
        throw e
      }
      for (const k of Object.keys(registry.agents)) delete registry.agents[k]
      Object.assign(registry.agents, 新的.agents)
      return { ok: true as const }
    },

    /** 给已接入的 ACP 标上／摘掉「能上服务器」。**与加／删同一套：写文件，再原地换内存里那份** */
    setAcpRemoteCapable: async ({ agentId, remoteCapable }) => {
      if (!configPath) throw fault("invalid_request", "本次运行没有装配配置文件，改不了")
      let 新的: ProviderRegistry
      try {
        新的 = setAcpRemoteCapable(configPath, agentId, remoteCapable)
      } catch (e) {
        if (e instanceof UserFacingError) throw fault("invalid_request", e.message)
        throw e
      }
      for (const k of Object.keys(registry.agents)) delete registry.agents[k]
      Object.assign(registry.agents, 新的.agents)
      return { ok: true as const }
    },

    /** 拨本机那两个开关。**它们不写进任何会被分享的文件**（见 schema 的说明） */
    setMcpFlag: async ({ name, flag, value, fingerprint }) => {
      if (!settings) throw fault("invalid_request", "本次运行没有设置存储")
      // **信任按「名字+指纹」记**(审查 debug G6):界面带上这台此刻的指纹,拨的就是这一台,
      // 同名换了命令/地址不继承。指纹缺席(旧界面/远端无 command)时退回按名字,不硬拒——但那条会有 G6 的弱点。
      const key: SettingKey =
        flag === "trusted"
          ? fingerprint
            ? `mcp.trusted.${name}:${fingerprint}`
            : `mcp.trusted.${name}`
          : `mcp.off.${name}`
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
        // 带分隔符比（`/a/skills` 不该认成 `/a/skills-old` 下面的）
        按序.find((x) => filePath === x.path || filePath.startsWith(x.path.replace(/\/+$/, "") + sep))?.from ?? "global"
      return {
        skills: r.skills.map((s) => {
          const from = 判来处(s.filePath)
          let invocation: 调用档 = s.disableModelInvocation ? "manual" : "model"
          try {
            invocation = 读调用策略(readFileSync(s.filePath, "utf8"))
          } catch {
            /* 读不了就按 pi 给的那一档 */
          }
          // 自带的档位记在设置里（文件只读）
          if (from === "builtin") invocation = 自带技能档(s.name) ?? invocation
          return {
            name: s.name,
            description: s.description,
            filePath: s.filePath,
            from,
            manualOnly: s.disableModelInvocation,
            invocation,
            // 自带的在应用包里，只读
            mutable: from !== "builtin",
          }
        }),
        problems: r.diagnostics
          // **目录还不存在不算「写坏了」**：项目还没建 `.dawn/skills` 是常态，列出来只会把真问题淹了
          .filter((d) => !(/skill path does not exist/i.test(String((d as { message?: unknown }).message ?? "")) && 按序.some((x) => x.path === String((d as { path?: unknown }).path ?? ""))))
          .map((d) => ({
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

    /* ── 技能管理（7.17，skills-manage） ── */

    /* ── 插件（2026-08-25，承载体 v1，学自 dsh-office） ── */

    listPlugins: async () => ({
      plugins: 插件册.map((p) => ({
        id: p.id,
        name: p.名,
        on: settings?.get(`${p.键}.off` as never) !== "1",
        families: p.族们().map((f) => ({
          key: f.key,
          name: f.name,
          on: settings?.get(`${p.键}.${f.key}` as never) !== "0",
          tools: f.tools,
        })),
      })),
    }),

    setPluginFlag: async ({ pluginId, family, on }) => {
      const p = 插件册.find((x) => x.id === pluginId)
      if (!p) throw fault("invalid_request", `没有叫「${pluginId}」的插件。有的是：${插件册.map((x) => x.id).join("、")}`)
      if (!settings) throw fault("internal_error", "本次运行没有装配设置")
      const now = new Date().toISOString()
      if (!family) {
        // 整包开关存「off」一把键：默认开着，只记「关」这个偏离
        settings.set(`${p.键}.off` as never, on ? "" : "1", now)
        return { on }
      }
      const 族们 = p.族们()
      if (!族们.some((f) => f.key === family)) {
        throw fault("invalid_request", `「${p.名}」插件没有「${family}」这一族。有的是：${族们.map((f) => f.key).join("、")}`)
      }
      settings.set(`${p.键}.${family}` as never, on ? "" : "0", now)
      return { on }
    },

    /* ── agent 浏览器旁观（2026-08-25，规格 2026-08-25-agent浏览器旁观-design.md）──
     * 浏览器插件的会话层与工具同进程，这里直接读它的模块级状态——
     * 不新开 IPC 通道，主进程不认识浏览器插件的内部。 */

    browserObserve: async () => await 旁观(),

    browserFrame: async () => {
      try {
        return { png: await 截一帧() }
      } catch (e) {
        throw fault("invalid_request", e instanceof Error ? e.message : String(e))
      }
    },

    /* ── 记忆（2026-08-25，规格 2026-08-25-记忆-design.md）── */

    memoryOverview: async ({ workspace }) => {
      const m = 要记忆()
      const ctx = workspace ? { workspace } : undefined
      const 轨数 = (target: "user" | "memory" | "key") => {
        // key 没有 workspace 时如实报 0，不猜路径
        if (target === "key" && !workspace) return { target, count: 0, archived: 0 }
        try {
          return { target, count: m.store.entries(target, ctx).length, archived: m.store.archived(target, ctx).length }
        } catch {
          return { target, count: 0, archived: 0 }
        }
      }
      return {
        pending: m.queue.list().length + m.pending.list().length,
        tracks: [轨数("user"), 轨数("memory"), 轨数("key")],
      }
    },

    memorySuggestions: async () => {
      const m = 要记忆()
      return {
        suggestions: m.queue.list().map((e) => ({
          id: e.id,
          target: e.target,
          content: e.content,
          reason: e.reason,
          hits: e.hits,
          time: e.time,
          ...(e.workspace ? { workspace: e.workspace } : {}),
        })),
        pendingSkills: m.pending.list(),
      }
    },

    memoryResolve: async ({ kind, id, decision, content, target, workspace }) => {
      const m = 要记忆()
      if (kind === "skill") {
        if (decision === "archive") return { ok: false, message: "技能没有归档一说：批准装进技能库，或拒绝" }
        const r = decision === "approve" ? m.pending.approve(id) : m.pending.reject(id)
        return { ok: r.ok, message: r.message }
      }
      // 记忆建议：先取出，失败放回（不丢建议）
      const 条 = m.queue.take(id)
      if (!条) return { ok: false, message: "队列里没有这条建议（可能已被处理）" }
      if (decision === "reject") return { ok: true, message: "已拒绝" }
      const 终轨 = target ?? 条.target
      const 终文 = (content ?? 条.content).trim()
      const ws = workspace ?? 条.workspace
      const ctx = {
        ...(ws ? { workspace: ws } : {}),
        ...(条.branches && 条.branches.length > 0 ? { branches: 条.branches } : {}),
      }
      if (终轨 === "key" && !ws) {
        m.queue.putBack(条)
        return { ok: false, message: "key 建议需要项目工作区——带上 workspace 再采纳（建议留在队列里）" }
      }
      const r =
        decision === "approve"
          ? m.store.add(终轨, 终文, ctx)
          // 归档一条建议 = **一步直落归档文件**（审查 debug Cx）。此前是 add 到主轨→archive 两步非原子:
          // archive 按前 40 字匹配,撞多条就失败,而那时条目已经在主轨上、会被注入——与「归档=不注入」相反。
          : m.store.addArchived(终轨, 终文, ctx)
      if (!r.ok && !r.duplicate) {
        m.queue.putBack(条)
        return { ok: false, message: `${r.message}（建议留在队列里）` }
      }
      return { ok: true, message: decision === "approve" ? `已写入 ${终轨}（下一段会话生效）` : "已归档（不注入，可转正）" }
    },

    memoryEntries: async ({ target, workspace, archived }) => {
      const m = 要记忆()
      const ctx = workspace ? { workspace } : undefined
      try {
        return { entries: archived === true ? m.store.archived(target, ctx) : m.store.entries(target, ctx) }
      } catch (e) {
        throw fault("invalid_request", e instanceof Error ? e.message : String(e))
      }
    },

    memoryWrite: async ({ action, target, workspace, content, match, branches }) => {
      const m = 要记忆()
      const ctx = {
        ...(workspace ? { workspace } : {}),
        ...(branches && branches.length > 0 ? { branches } : {}),
      }
      const r =
        action === "add"
          ? m.store.add(target, String(content ?? ""), ctx)
          : action === "update"
            ? m.store.updateBody(target, String(match ?? ""), String(content ?? ""), ctx)
            : action === "remove"
              ? m.store.remove(target, String(match ?? ""), ctx)
              : action === "archive"
                ? m.store.archive(target, String(match ?? ""), ctx)
                : m.store.promote(target, String(match ?? ""), ctx)
      return { ok: r.ok, message: r.message }
    },

    setSkillInvocation: async ({ filePath, mode }) => {
      // 自带的：文件只读，档位落到设置里（2026-08-23）
      const 自带根 = skills?.自带目录
      if (自带根 && resolve(filePath).startsWith(resolve(自带根) + sep)) {
        if (!settings) throw fault("internal_error", "本次运行没有装配设置")
        const 名 = 读定义名(filePath) ?? basename(dirname(filePath))
        settings.set(`skill.mode.${名}`, mode, new Date().toISOString())
        记一次技能?.("invocation", resolve(filePath), mode)
        return { mode }
      }
      const 文件 = 技能文件必须可改(filePath)
      const 原 = await 读本地(文件, "utf8")
      const 新 = 写调用策略(原, mode)
      if (新 === undefined) throw fault("invalid_request", `${文件} 没有完整的 frontmatter（开头结尾各一行 ---），不敢改`)
      if (新 !== 原) await 原子写(文件, 新)
      记一次技能?.("invocation", 文件, mode)
      return { mode }
    },

    importSkill: async ({ source, to, projectId, overwrite, dryRun }) => {
      const 根 = 技能目标根(to, projectId)
      if (dryRun) {
        const r = await 预检技能(source, 根)
        if ("why" in r) throw fault("invalid_request", r.why)
        return { kind: r.kind, pending: r.待导, conflicts: r.冲突, imported: [], skipped: [], failed: r.失败 }
      }
      const r = await 导入技能(source, 根, overwrite === true)
      if ("why" in r) throw fault("invalid_request", r.why)
      for (const x of r.导了) 记一次技能?.(x.覆盖了 ? "import-overwrite" : "import", x.dest, source)
      return {
        kind: r.kind,
        pending: [],
        conflicts: [],
        imported: r.导了.map((x) => ({ name: x.name, dest: x.dest, overwritten: x.覆盖了, warnings: x.警告 })),
        skipped: r.跳过,
        failed: r.失败,
      }
    },

    deleteSkill: async ({ filePath }) => {
      const 文件 = 技能文件必须可改(filePath)
      const 目录 = dirname(文件)
      if (!trashItem) throw fault("internal_error", "本次运行没有装配废纸篓")
      await trashItem(目录).catch((err: unknown) => {
        throw fault("invalid_request", `删不掉 ${目录}：${err instanceof Error ? err.message : String(err)}`)
      })
      记一次删除?.(undefined, 目录, true)
      记一次技能?.("delete", 目录)
      return { trashed: true as const }
    },

    listSubagents: async ({ projectId }) => {
      const p = projectId ? projectStore.get(projectId) : undefined
      if (projectId && !p) throw fault("not_found", `没有这个项目：${projectId}`)
      const 层 = 子agent层(p?.workspace)
      const 读到的 = loadSubagentsFrom(层, { 自带停用: 自带子agent停用 })
      return {
        agents: 读到的.agents.map((a) => ({
          name: a.name,
          description: a.description,
          ...(a.tools ? { tools: a.tools } : {}),
          ...(a.model ? { model: a.model } : {}),
          filePath: a.filePath,
          from: a.from ?? "project",
          ...(a.title ? { title: a.title } : {}),
          ...(a.group ? { group: a.group } : {}),
          disabled: Boolean(a.disabled),
          mutable: a.from !== "builtin",
        })),
        problems: 读到的.problems,
        dir: p ? join(p.workspace, AGENTS_DIR) : "",
        dirs: {
          ...(子agent位置?.自带目录 ? { builtin: 子agent位置.自带目录 } : {}),
          ...(子agent位置?.全局目录 ? { global: 子agent位置.全局目录 } : {}),
          ...(p ? { project: join(p.workspace, AGENTS_DIR) } : {}),
        },
      }
    },

    /* ── 子 agent 名册（7.20） ── */

    setSubagentEnabled: async ({ filePath, enabled }) => {
      // 自带的：文件只读，停用落到设置里（2026-08-23）
      const 自带根 = 子agent位置?.自带目录
      if (自带根 && resolve(filePath).startsWith(resolve(自带根) + sep)) {
        if (!settings) throw fault("internal_error", "本次运行没有装配设置")
        const 名 = 读定义名(filePath) ?? basename(filePath, ".md")
        settings.set(`subagent.off.${名}`, enabled ? "0" : "1", new Date().toISOString())
        return { enabled }
      }
      const 文件 = 子agent文件必须可改(filePath)
      const 原 = await 读本地(文件, "utf8")
      const 新 = 写停用(原, !enabled)
      if (新 === undefined) throw fault("invalid_request", `${文件} 没有完整的 frontmatter，不敢改`)
      if (新 !== 原) await 原子写(文件, 新)
      return { enabled }
    },

    importSubagents: async ({ source, to, projectId, overwrite, dryRun }) => {
      const 根 = 子agent目标根(to, projectId)
      const r = await 导入定义文件(source, 根, overwrite === true, dryRun === true)
      if ("why" in r) throw fault("invalid_request", r.why)
      return r
    },

    deleteSubagent: async ({ filePath }) => {
      const 文件 = 子agent文件必须可改(filePath)
      if (!trashItem) throw fault("internal_error", "本次运行没有装配废纸篓")
      await trashItem(文件).catch((err: unknown) => {
        throw fault("invalid_request", `删不掉 ${文件}：${err instanceof Error ? err.message : String(err)}`)
      })
      记一次删除?.(undefined, 文件, true)
      return { trashed: true as const }
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
      const rec = store.get(id)
      if (!rec) throw fault("not_found", `没有这台服务器：${id}`)
      // 先断开：留着一条连着的连接，它的状态推送会指向一台已经不存在的机器
      manager.disconnect(id)
      store.remove(id)
      // **钥匙串里那份也删掉**——留着就是一份没人认领的秘密
      credentials.delete(密钥名(id))
      // 记下的主机公钥也清掉(审查 debug A6):这是「合法换了密钥后怎么恢复」的路径——
      // 删掉这台机器再重新添加,TOFU 会当新机器重新记一次,而不是卡在「公钥变了」拒连。
      settings?.set(`ssh.hostkey.${rec.host}:${rec.port ?? 22}`, "", new Date().toISOString())
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
         *
         * **认证失败是 `invalid_request` 不是 `internal_error`**（审查 debug F8):
         * 密码/私钥不对是**用户给错了输入**,不是系统内部故障。ssh2 的认证失败带
         * `level: "client-authentication"`,消息是「All configured authentication methods failed」。
         * 报成 internal_error 会让「密码错」显示成「系统出错了」,人不知道该去改密码。
         */
        const 消息 = e instanceof Error ? e.message : String(e)
        const level = (e as { level?: string })?.level
        const 是认证失败 = level === "client-authentication" || /authentication method|auth.*fail/i.test(消息)
        throw fault(是认证失败 ? "invalid_request" : "internal_error", 消息)
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
      /**
       * `@路径` 引用（2026-08-23，学自 dsh-at-file）：**发送前只验存在**，把存在的拼成
       * `<workspace-reference path kind />` 附在人这句话后面；内容不读、目录不列——模型要看自己用工具读，
       * 那一步过权限门、进账本。转录里存的仍是人写的原文（`events.userTurn` 收的是 `data`）。
       * 本地 `stat` 相对工作区、远端相对那段会话的当前目录；本地会话对远端路径、远端会话对本地路径都不认。
       */
      // 粘贴标记只活在草稿里：引用扫完（带标记的不算）就剥掉，模型与转录都不该见到它
      const 发出去的 = 剥掉粘贴标记(as === "user" ? (await 附上引用(sessionId, data)).text : data)
      data = 剥掉粘贴标记(data)
      try {
        sessions.write(sessionId, 发出去的, as, 附图, behavior)
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
        /**
         * **按原因分错误码,别一律压成 conflict**(审查 debug F6)。此前 `sessions.write` 抛的三类
         * ——租约被别人拿着、会话未在本进程激活、这段会话收不下图片——全被报成 `conflict`,
         * 而同样「会话不在」的状态 `subscribeSession` 报的是 `not_found`,两个操作对同一状态给两个码。
         *   - 未持有租约 → `conflict`:去抢租约就能写(UI 据此提示);
         *   - 会话未激活/不存在 → `not_found`:与 subscribeSession 一致,没有可写的对象;
         *   - 其余(图片收不下等)→ `invalid_request`:是这次请求本身的问题。
         */
        const 消息 = err instanceof Error ? err.message : String(err)
        if (/未持有|租约/.test(消息)) throw fault("conflict", 消息)
        if (/未在本进程中活动|不存在|没有这个会话/.test(消息)) throw fault("not_found", 消息)
        throw fault("invalid_request", 消息)
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

    getAtFileSettings: async ({ workspace }) => 读艾特设置(workspace),

    setAtFileSettings: async ({ ignorePasted, globalRules, workspace, workspaceRules }) => {
      if (!settings) throw fault("internal_error", "本次运行没有装配设置")
      const now = new Date().toISOString()
      for (const r of [...(globalRules ?? []), ...(workspaceRules ?? [])]) {
        const 病 = 规则的毛病(r)
        if (病) throw fault("invalid_request", `这条规则不成立（${r.pattern}）：${病}`)
      }
      if (ignorePasted !== undefined) settings.set("atfile.ignorePasted", ignorePasted ? "1" : "0", now)
      if (globalRules) settings.set("atfile.rules", JSON.stringify(globalRules), now)
      if (workspaceRules && workspace) settings.set(`atfile.rules.${workspace}`, JSON.stringify(workspaceRules), now)
      return 读艾特设置(workspace)
    },

    getPermissionMode: async () => ({
      mode: ((v) => (v === "deny-risky" || v === "ask-risky" ? v : "allow-all"))(settings?.get("permission.mode")) as "allow-all" | "ask-risky" | "deny-risky",
    }),

    setPermissionMode: async ({ mode }) => {
      if (!settings) throw fault("internal_error", "本次运行没有装配设置")
      settings.set("permission.mode", mode, new Date().toISOString())
      return { mode }
    },

    getDownloadDir: async () => {
      const 配的 = settings?.get("download.dir")
      return { path: 配的 || 默认下载目录(), isDefault: !配的 }
    },

    setDownloadDir: async ({ path }) => {
      if (!settings) throw fault("internal_error", "本次运行没有装配设置")
      const p = path.trim()
      // **空串 = 恢复系统默认**，与工作目录那两条同一条规矩
      if (p && !p.startsWith("/") && !/^[A-Za-z]:[\\/]/.test(p)) {
        throw fault("invalid_request", `下载目录要写绝对路径，收到「${p}」`)
      }
      settings.set("download.dir", p, new Date().toISOString())
      /** **建出来**：设了一个不存在的目录，第一次下载才炸就太晚了 */
      if (p) mkdirSync(p, { recursive: true })
      const 现在 = settings.get("download.dir")
      return { path: 现在 || 默认下载目录(), isDefault: !现在 }
    },

    startDownload: async ({ connectionId, path }) => {
      const e = 连着的(connectionId)
      const 目录 = settings?.get("download.dir") || 默认下载目录()
      mkdirSync(目录, { recursive: true })
      const name = path.split("/").filter(Boolean).at(-1) ?? "下载"
      const 目标 = 不覆盖的名字(join(目录, name))
      const id = `tr-${randomUUID()}`
      const ac = new AbortController()
      const 一条: 传输记录 = { 已传: 0, 状态: "running", ac, 目标 }
      传输们.set(id, 一条)
      /**
       * **不等它传完**。返回 id，进度由 `transferStatus` 轮询。
       *
       * 半截文件的清理在 `RemoteExecutor.download` 自己身上（批 0）——
       * 它是唯一知道「传完没有」的那一层。
       */
      void e
        .download(path, 目标, {
          signal: ac.signal,
          进度: (已传, 总共) => {
            一条.已传 = 已传
            if (总共 !== undefined) 一条.总共 = 总共
          },
        })
        .then(() => {
          一条.状态 = "done"
        })
        .catch((err: unknown) => {
          // **取消与失败要分得开**：前者是人按的，后者是出了问题
          一条.状态 = ac.signal.aborted ? "cancelled" : "failed"
          一条.错 = err instanceof Error ? err.message : String(err)
        })
        .finally(() => 终结传输(id)) // 终态后延时回收(F10)
      return { transferId: id, name, target: 目标 }
    },

    reviewChanges: async ({ projectId }) => {
      const p = projectStore.get(projectId)
      if (!p) throw fault("not_found", `没有这个项目：${projectId}`)

      let tracked: Awaited<ReturnType<typeof changesAgainstHead>> = []
      let baseline: "head" | "none" = "head"
      try {
        tracked = await changesAgainstHead(p.workspace)
      } catch (e) {
        /**
         * **不是 git 仓库就如实说「没有基线」**，不返回一个空列表——
         * 空列表读作「什么都没改」，而真相是「我们不知道」。
         * 账本那一半照旧给：它不依赖 git。
         */
        if (e instanceof NotAGitRepoError) baseline = "none"
        else throw e
      }

      /**
       * 账本记得、而 git 看不见的那些（`.gitignore` 里的 `out/`、`data/raw/`）。
       *
       * **这一半是这一屏的立身之本**：只看 git 的话，一次分析生成 40 张图，
       * 屏幕上会说「什么都没变」。
       */
      const 仓库里有的 = new Set(tracked.map((x) => x.path))
      /**
       * 产物那一半有**两个来源**，缺一不可（2026-08-18）：
       *
       * ① **账本**——内置工具的包装器记的（连它自己声称写的路径一起，
       *    且事后 `stat` 确认过）。这条覆盖你日常那条路。
       * ② **约定目录里被 git 忽略的文件**——外部 agent（ACP / CLI）
       *    用它自己的 bash 写东西，根本不经过我们的包装器；
       *    它们的产物只能这么捞。
       *
       * 第一版只有 ①，而 ① 当时也是从 git 算的——**于是这一栏永远是空的**，
       * 而屏幕上还写着「账本记得」。那是在骗人。
       */
      const 忽略里的产物 =
        baseline === "head" ? await ignoredArtifacts(p.workspace, 科研目录) : []
      const produced = [...new Set([...runs.writtenFilesOf(projectId), ...忽略里的产物])]
        .filter((f) => !仓库里有的.has(f))
        .sort()
        .map((path) => ({ path }))

      return {
        baseline,
        // **本阶段没有 worktree 隔离**，分不清是 agent 改的还是作者自己改的
        mayIncludeUserEdits: true,
        tracked,
        produced,
      }
    },

    fileDiff: async ({ projectId, path }) => {
      const p = projectStore.get(projectId)
      if (!p) throw fault("not_found", `没有这个项目：${projectId}`)
      // **先过守卫**（2026-08-23 审查抓的）：此前直接交给 `git diff --no-index`，`../x` 或绝对路径能把工作区外的文件当 diff 读回来
      resolveInWorkspace(p.workspace, path)
      const 原文 = await fileDiffAgainstHead(p.workspace, path).catch((e: unknown) => {
        throw fault("invalid_request", `算不出 ${path} 的差异：${e instanceof Error ? e.message : String(e)}`)
      })
      /**
       * **表格文件在 diff 上方多一句结构化的话**（2026-08-18，作者选的甲）。
       *
       * 算不出来不该连逐行差异一起赔进去——**摘要是加分项，diff 是主路径**。
       * 所以这里接住异常并如实说一句，而不是让整个 `fileDiff` 失败。
       */
      const table = await 表格摘要(p.workspace, path).catch((e: unknown) => ({
        kind: "skipped" as const,
        reason: `算不出表格摘要：${e instanceof Error ? e.message : String(e)}`,
      }))
      const 行 = 原文.split("\n")
      if (行.length <= diff行上界) return { diff: 原文, ...(table ? { table } : {}) }
      // **截断要说清省了多少**（规格 7.5）
      return {
        diff: 行.slice(0, diff行上界).join("\n"),
        truncated: { keptLines: diff行上界, totalLines: 行.length },
        ...(table ? { table } : {}),
      }
    },

    pathInfo: async ({ projectId, connectionId, path }) => {
      if (connectionId) {
        const e = 连着的(connectionId)
        const st = await e.stat(path).catch((err: unknown) => {
          throw fault("invalid_request", `找不到 ${path}：${err instanceof Error ? err.message : String(err)}`)
        })
        if (!st.directory) return { directory: false, files: 1, bytes: st.size, counted: "complete" as const }
        const 数 = await 数一个远端目录(e, path)
        return { directory: true, ...数 }
      }
      const p = projectStore.get(projectId!)
      if (!p) throw fault("not_found", `没有这个项目：${projectId}`)
      const 全 = resolveInWorkspace(p.workspace, path)
      let st: ReturnType<typeof statSync>
      try {
        st = statSync(全)
      } catch (err) {
        throw fault("invalid_request", `找不到 ${path}：${err instanceof Error ? err.message : String(err)}`)
      }
      if (!st.isDirectory()) return { directory: false, files: 1, bytes: st.size, counted: "complete" as const }
      return { directory: true, ...数一个本地目录(全) }
    },

    deletePath: async ({ projectId, connectionId, path }) => {
      /**
       * **本地与远端不是同一个操作**，所以这两支从头到尾分开写。
       *
       * 本地走废纸篓（**后悔得回来**），远端只有 `unlink`（**没了就是没了**）。
       * 写成一支再分叉的话，迟早有人把「删」当成一件事来改。
       */
      if (connectionId) {
        const e = 连着的(connectionId)
        const st = await e.stat(path).catch((err: unknown) => {
          throw fault("invalid_request", `找不到 ${path}：${err instanceof Error ? err.message : String(err)}`)
        })
        /**
         * **目录要自己递归**：SFTP 的 `rmdir` 只删空目录。
         *
         * 半路失败**不回滚**——删掉的就是删掉了，假装回滚只会让人
         * 以为什么都没发生。如实把失败那一句抛出去。
         */
        await (st.directory ? 递归删远端(e, path) : e.unlink(path)).catch((err: unknown) => {
          // **权限不够要说得出是权限不够**，不笼统地说「删不掉」
          throw fault("invalid_request", `删不掉 ${path}：${err instanceof Error ? err.message : String(err)}`)
        })
        记一次删除?.(connectionId, path, false)
        return { trashed: false }
      }

      const p = projectStore.get(projectId!)
      if (!p) throw fault("not_found", `没有这个项目：${projectId}`)
      /**
       * **守卫照旧**：本地这条守的不是用户，是**渲染进程**——
       * 一旦开了这个口子，它就能要求删任意路径。远端没有对应物
       * （你就是那个账号本人），这个不对称是有意的。
       */
      const 全 = resolveInWorkspace(p.workspace, path)
      // **工作区根本身不许删**（2026-08-23 审查抓的）：守卫允许 `real === root`，`""` / `.` 会把整个工作区丢进废纸篓
      if (全 === realpathSync(p.workspace)) throw fault("invalid_request", "不能删工作区本身——要删就删里面的东西")
      if (!trashItem) throw fault("internal_error", "本次运行没有装配废纸篓")
      await trashItem(全).catch((err: unknown) => {
        throw fault("invalid_request", `删不掉 ${path}：${err instanceof Error ? err.message : String(err)}`)
      })
      记一次删除?.(undefined, 全, true)
      return { trashed: true }
    },

    startUpload: async ({ connectionId, dir, localPath, onConflict }) => {
      const e = 连着的(connectionId)
      const name = localPath.split(/[\\/]/).filter(Boolean).at(-1) ?? "上传"
      const 根 = dir.replace(/\/+$/, "")
      let 目标 = `${根}/${name}`

      /**
       * **撞名要问人，不默默覆盖**——你可能正在覆盖昨天那一版数据。
       *
       * `stat` 抛错就当它不存在：那正是「没有这个文件」的样子。
       * 而**判错方向的代价不对称**：误判成「存在」只是多问一句，
       * 误判成「不存在」是直接覆盖。
       */
      const 已经有了 = await e
        .stat(目标)
        .then(() => true)
        .catch(() => false)
      if (已经有了) {
        if (onConflict === "ask") return { kind: "conflict" as const, name }
        if (onConflict === "keepBoth") {
          const 点 = name.lastIndexOf(".")
          const 主 = 点 > 0 ? name.slice(0, 点) : name
          const 尾 = 点 > 0 ? name.slice(点) : ""
          let 找到 = false
          for (let i = 1; i < 1000 && !找到; i++) {
            const 试 = `${根}/${主} (${i})${尾}`
            const 有 = await e.stat(试).then(() => true).catch(() => false)
            if (!有) {
              目标 = 试
              找到 = true
            }
          }
          if (!找到) throw fault("invalid_request", `${name} 这个名字在那台机器上已经有上千份了`)
        }
      }

      const 本地大小 = statSync(localPath).size
      const id = `tr-${randomUUID()}`
      const ac = new AbortController()
      const 一条: 传输记录 = { 已传: 0, 总共: 本地大小, 状态: "running", ac, 目标 }
      传输们.set(id, 一条)
      void e
        .upload(localPath, 目标, {
          signal: ac.signal,
          覆盖: 已经有了 && onConflict === "overwrite",
          进度: (已传) => {
            一条.已传 = 已传
          },
        })
        .then(() => {
          一条.状态 = "done"
          /**
           * **上传进账本**（不变式 5）。
           *
           * 它是对那台机器的一次写入，与 agent 改一个文件在性质上没有区别。
           * 不记的话，账本上有个洞：**数据是什么时候、从哪儿进去的，
           * 只有你自己记得**。下载不记——它只读，不改变任何东西。
           */
          记一次上传?.(connectionId, 目标, 本地大小, undefined)
        })
        .catch((err: unknown) => {
          一条.状态 = ac.signal.aborted ? "cancelled" : "failed"
          一条.错 = err instanceof Error ? err.message : String(err)
          // **失败也记**：「它试过往一个只读目录传东西」本身就是事实
          记一次上传?.(connectionId, 目标, 本地大小, 一条.错)
        })
        .finally(() => 终结传输(id)) // 终态后延时回收(F10)
      return { kind: "started" as const, transferId: id, target: 目标 }
    },

    transferStatus: async ({ transferId }) => {
      const 一条 = 传输们.get(transferId)
      // **查不到就说查不到**，不回一个「跑着呢」——那会让进度条永远转下去
      if (!一条) throw fault("not_found", `没有这次传输：${transferId}`)
      return {
        transferred: 一条.已传,
        // **取不到就缺席**，不拿 0 冒充：0 会让进度条一直是满的
        ...(一条.总共 === undefined ? {} : { total: 一条.总共 }),
        state: 一条.状态,
        ...(一条.错 ? { error: 一条.错 } : {}),
      }
    },

    cancelTransfer: async ({ transferId }) => {
      传输们.get(transferId)?.ac.abort()
      return {}
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

    /** 按文件名搜（7.16）。本地走 fs、远端走 SFTP，**同一个走法**（`files/search.ts`） */
    searchFiles: async ({ projectId, connectionId, path, query }) => {
      if (connectionId) {
        const e = 连着的(connectionId)
        return 搜文件名(
          async (dir) => (await e.readdir(dir || ".")).map((x) => ({ name: x.name, kind: x.directory ? ("dir" as const) : ("file" as const) })),
          path || ".",
          query,
        )
      }
      const p = projectStore.get(projectId!)
      if (!p) throw fault("not_found", `没有这个项目：${projectId}`)
      // 起点也要过守卫：越界的 path 在这里就抛。
      // **根用人给的相对路径，不用守卫回来的绝对路径**——那是 realpath，
      // macOS 上 `/var` 会变成 `/private/var`，再 `relative()` 回去就是一串 `..`
      resolveInWorkspace(p.workspace, path || ".")
      const 起点 = (path || "").replace(/^\.\//, "").replace(/\/+$/, "").replace(/^\.$/, "")
      const r = await 搜文件名(
        async (dir) => {
          const 条 = await readdir(resolveInWorkspace(p.workspace, dir || "."), { withFileTypes: true })
          return 条.map((d) => ({
            name: d.name,
            // 符号链接不进去；它指向的是不是目录都无所谓——走法只看 `kind === "dir" && !symlink`
            kind: d.isDirectory() ? ("dir" as const) : ("file" as const),
            symlink: d.isSymbolicLink(),
          }))
        },
        起点,
        query,
      )
      return r
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

    /**
     * 视觉服务（协议 7.12，2026-08-20）。设计定案见
     * `specs/2026-08-20-视觉服务-design.md`。密钥键名 `vision:apiKey`，
     * **只进钥匙串**；响应里只有 `hasSecret`（回显一次就落进截图和录屏）。
     */
    getVision: async () => {
      // `缺` 是给 testVision 的内部字段——协议响应是 strict 的，带上就握不了手
      const { 缺: _缺, ...对外 } = 视觉状态()
      return 对外
    },

    saveVision: async ({ enabled, baseUrl, model, secret }) => {
      if (!configPath) throw fault("invalid_request", "本次运行没有配置文件，视觉服务没地方保存")
      let 新的: typeof registry
      try {
        新的 = setVision(configPath, {
          enabled,
          ...(baseUrl === undefined ? {} : { baseUrl }),
          ...(model === undefined ? {} : { model }),
        })
      } catch (err) {
        if (err instanceof UserFacingError) throw fault("invalid_request", err.message)
        throw err
      }
      // 原地更新那一个被多处持有的对象（同 saveProviderConnection 的理由）
      registry.vision = 新的.vision
      // **留空 = 不改动已存的那份**；给了才换（照作者截图那句占位语）
      if (secret !== undefined && secret !== "") credentials.set("vision:apiKey", secret)
      return { ready: 视觉状态().ready }
    },

    testVision: async () => {
      const 态 = 视觉状态()
      if (!态.ready) return { ok: false, text: `视觉服务未就绪：${态.缺 || "未启用"}` }
      try {
        const 描述 = await 描述图片(
          { baseUrl: 态.baseUrl!, model: 态.model!, apiKey: credentials.get("vision:apiKey")! },
          [{ data: 诊断图PNG, mimeType: "image/png" }],
          "这是一张诊断图片。用一句话说出你看到的形状与颜色。",
        )
        return { ok: true, text: 描述 }
      } catch (e) {
        // **原样回**：失败的那句话就是全部诊断依据，不替人转写
        return { ok: false, text: e instanceof Error ? e.message : String(e) }
      }
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
      if (t.sessionId && sessions.get(t.sessionId)) {
        // **与 `deleteSession` 同一条路**（2026-08-23 审查抓的：此前不走 `删一个会话`，会话目录留在磁盘上，与「删会话真删目录」不一致）
        const r = await 删一个会话(t.sessionId)
        kept = r.ledgerKept
      }
      store.remove(taskId)
      /**
       * **账本留着，并且把还剩多少说出来**（与 `deleteSession` 同一条）。
       * 一句「已删除」会让人以为历史也一起没了——而它没有，
       * 这正是这个产品与一个聊天窗口的区别（不变式 5）。
       */
      return { ledgerKept: kept }
    },

    deleteSession: async ({ sessionId }) => 删一个会话(sessionId),

    /* ── 定时任务（7.19，schedule，学自 dsh-automation） ── */

    listSchedules: async () => {
      const 库 = 要定时()
      const now = new Date().toISOString()
      return {
        schedules: 库.list().map(定时摘要),
        ...(调度器 ? (() => { const n = 调度器.下一次到期(now); return n ? { nextDueAt: n } : {} })() : {}),
      }
    },

    createSchedule: async ({ name, prompt, schedule, agentId, workspace, connectionId, permission }) => {
      const 库 = 要定时()
      const 毛病 = 校验计划(schedule)
      if (毛病) throw fault("invalid_request", 毛病)
      if (!registry.agents[agentId]) throw fault("invalid_request", `配置里没有叫「${agentId}」的 agent`)
      if (connectionId && !远端().store.get(connectionId)) throw fault("not_found", `没有这台服务器：${connectionId}`)
      const now = new Date().toISOString()
      const d: 定时定义 = {
        id: `sch-${randomUUID()}`, revision: 1, name: name.trim(), prompt: prompt.trim(), status: "active", schedule, agentId,
        ...(workspace ? { workspace } : {}), ...(connectionId ? { connectionId } : {}),
        permission: permission ?? "deny-risky", createdAt: now, updatedAt: now,
      }
      库.put(d)
      void 调度器?.requestPump()
      return 定时摘要(d)
    },

    updateSchedule: async ({ id, name, prompt, schedule, status, permission }) => {
      const 库 = 要定时()
      const 旧 = 库.get(id)
      if (!旧) throw fault("not_found", `没有这条定时任务：${id}`)
      if (schedule) {
        const 毛病 = 校验计划(schedule)
        if (毛病) throw fault("invalid_request", 毛病)
      }
      // **版本号 +1、updatedAt 往前**：已排队的那次按旧的跑；改之前的到期也不再认领
      const d: 定时定义 = {
        ...旧, revision: 旧.revision + 1, updatedAt: new Date().toISOString(),
        ...(name !== undefined ? { name: name.trim() } : {}), ...(prompt !== undefined ? { prompt: prompt.trim() } : {}),
        ...(schedule ? { schedule } : {}), ...(status ? { status } : {}), ...(permission ? { permission } : {}),
      }
      库.put(d)
      void 调度器?.requestPump()
      return 定时摘要(d)
    },

    deleteSchedule: async ({ id }) => {
      const 库 = 要定时()
      if (!库.delete(id)) throw fault("not_found", `没有这条定时任务：${id}`)
      void 调度器?.requestPump()
      return {}
    },

    runScheduleNow: async ({ id }) => {
      要定时()
      if (!调度器) throw fault("internal_error", "本次运行没有装配调度器")
      const r = await 调度器.立即运行(id).catch((e: unknown) => { throw fault("not_found", e instanceof Error ? e.message : String(e)) })
      return 运行摘要(r)
    },

    listScheduleRuns: async ({ id, limit }) => ({ runs: 要定时().runs(id, limit).map(运行摘要) }),

    exportSession: async ({ sessionId, dir }) => {
      const rec = sessions.get(sessionId)
      if (!rec) throw fault("not_found", `没有这个会话：${sessionId}`)
      const items = events.peekItems(sessionId)
      if (items.length === 0) throw fault("invalid_request", "这段对话在本次运行里没有转录可导（重启之前的对话要先点开、让它重新加载）")
      const 目录 = dir ?? (settings?.get("download.dir") || 默认下载目录())
      mkdirSync(目录, { recursive: true })
      const 名 = 导出文件名(rec.title ?? "新对话", rec.id)
      const 路径 = join(目录, 名)
      const 文 = 转录成markdown({ title: rec.title ?? "新对话", agentId: rec.agentId, createdAt: rec.createdAt, workspace: rec.workspace }, items)
      await writeFile(路径, 文, "utf8")
      return { path: 路径, turns: items.filter((x) => x.type === "turn" && x.who === "user").length }
    },

    /* ── 归档（7.18） ── */

    setSessionArchived: async ({ sessionId, archived }) => {
      const rec = sessions.get(sessionId)
      if (!rec) throw fault("not_found", `没有这个会话：${sessionId}`)
      sessions.setArchived(sessionId, archived)
      记一次会话?.(archived ? "archive" : "unarchive", rec.projectId, sessionId)
      // **归档了绑着它的 IM 通道要出声 + 解会话绑定**(审查 debug F5):否则下一条微信/飞书消息
      // 静默落进新会话,上下文断了却没人说一声。只处理归档(不是取消归档);通道各自判「是不是绑的这一段」。
      if (archived) {
        await 微信.会话归档了(sessionId).catch(() => {})
        await 飞书.会话归档了(sessionId).catch(() => {})
      }
      return {}
    },

    listArchivedSessions: async () => ({
      sessions: sessions.listArchived().flatMap((r) => {
        const p = r.projectId ? projectStore.get(r.projectId) : undefined
        if (!p || !r.projectId) return []
        return [{ ...projects.toSummary(r.projectId, r, 服务器名), projectName: p.name, workspace: p.workspace }]
      }),
    }),

    deleteArchivedSessions: async () => {
      let deleted = 0
      let transcriptsTrashed = 0
      const problems: string[] = []
      for (const r of sessions.listArchived()) {
        try {
          const 回 = await 删一个会话(r.id)
          deleted += 1
          if (回.transcriptTrashed) transcriptsTrashed += 1
          else if (回.problem) problems.push(`${r.title ?? r.id}：${回.problem}`)
        } catch (e) {
          problems.push(`${r.title ?? r.id}：${e instanceof Error ? e.message : String(e)}`)
        }
      }
      return { deleted, transcriptsTrashed, problems }
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
      // **连已归档的一起**（2026-08-23 审查抓的）：`listByProject` 不列归档的，它们的会话不停、任务不清，行却被 `deleteByProject` 删了——侧栏留一条指向不存在会话的「新任务」
      const 全部会话 = [...sessions.listByProject(projectId), ...sessions.listArchived().filter((r) => r.projectId === projectId)]
      for (const rec of 全部会话) {
        if (rec.state !== "exited") await sessions.stop(rec.id).catch(() => {})
        events.forget(rec.id)
        baselines.delete(rec.id)
      }
      /**
       * **先记下有哪些会话，再删**：删完就查不到了，
       * 而任务是按 sessionId 挂着的（T3-a）。
       */
      const 它的会话 = 全部会话.map((r) => r.id)
      tasks?.removeBySessions(它的会话) // tasks 未装配不抛(审查 debug F13):否则删项目半途而废
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

    /* ── 提示词增强（7.15） ── */
    enhancePrompt: async ({ text, mode, sessionId, requestId }) => {
      if (!askOnce) throw fault("invalid_request", "这次运行没有 native 运行时，做不了提示词增强")
      const rec = sessionId ? sessions.get(sessionId) : undefined
      if (sessionId && !rec) throw fault("not_found", `没有这个会话：${sessionId}`)
      const kind = rec ? registry.agents[rec.agentId]?.kind : undefined
      if (rec && kind !== "native") throw fault("invalid_request", "这段会话的模型不在我们手里（ACP / CLI），增强只对 API 会话可用")
      // 没会话（空态屏）：用配置里第一个 native agent 的模型
      const 目标 = rec
        ? { sessionId: rec.id }
        : (() => {
            const first = Object.values(registry.agents).find((d): d is Extract<typeof d, { kind: "native" }> => d.kind === "native")
            if (!first) throw fault("invalid_request", "配置里没有 API 模型，做不了增强")
            return { provider: first.provider, model: first.model }
          })()
      const 控 = new AbortController()
      增强中.set(requestId, 控)
      const 超时 = setTimeout(() => 控.abort(), mode === "basic" ? 30_000 : mode === "standard" ? 60_000 : 90_000)
      let 用的模型 = ""
      try {
        const r = await 增强(text, mode, {
          问: async (req) => {
            const a = await askOnce(目标, { ...req, signal: 控.signal })
            用的模型 = a.model
            return a.text
          },
          历史: async () =>
            rec
              ? events
                  .peekItems(rec.id)
                  .filter((i): i is Extract<typeof i, { type: "turn" }> => i.type === "turn" && i.final && i.text.trim() !== "")
                  .map((i) => ({ who: i.who, text: i.text }))
              : [],
          列文件: async (后缀, 最深) => (rec ? 列工作区(rec, 后缀, 最深) : []),
          读文件: async (p) => (rec ? 读工作区(rec, p) : ""),
          signal: 控.signal,
        })
        return { text: r.text, usedContext: r.usedContext, ...(r.note ? { note: r.note } : {}), model: 用的模型 }
      } catch (e) {
        if (控.signal.aborted) throw fault("invalid_request", 增强中.has(requestId) ? "增强超时了，这次没改" : "已取消")
        throw fault("internal_error", e instanceof Error ? e.message : String(e))
      } finally {
        clearTimeout(超时)
        增强中.delete(requestId)
      }
    },
    cancelEnhance: async ({ requestId }) => {
      const 控 = 增强中.get(requestId)
      增强中.delete(requestId)
      控?.abort()
      return { ok: true as const }
    },

    /* ── 远程助理 · 微信 ── */
    weixinGetStatus: async () => {
      const st = 微信.status()
      return {
        state: st.state,
        ...(st.login ? { login: st.login } : {}),
        ...(st.botId ? { botId: st.botId } : {}),
        ...(st.userId ? { userId: st.userId } : {}),
        ...(st.boundAt ? { boundAt: st.boundAt } : {}),
        ...(st.sessionId ? { sessionId: st.sessionId } : {}),
        ...(st.lastError ? { lastError: st.lastError } : {}),
        contactName: st.contactName,
      }
    },
    weixinStartLogin: async () => {
      要设置()
      try {
        await 微信.startLogin()
      } catch (e) {
        throw fault("internal_error", `要不到二维码：${e instanceof Error ? e.message : String(e)}`)
      }
      return { ok: true as const }
    },
    weixinSubmitCode: async ({ code }) => {
      try {
        微信.submitVerifyCode(code)
      } catch (e) {
        throw fault("invalid_request", e instanceof Error ? e.message : String(e))
      }
      return { ok: true as const }
    },
    weixinCancelLogin: async () => {
      微信.cancelLogin()
      return { ok: true as const }
    },
    weixinUnbind: async () => {
      await 微信.unbind()
      return { ok: true as const }
    },
    weixinBindSession: async ({ sessionId }) => {
      if (!sessions.get(sessionId)) throw fault("not_found", `没有这个会话：${sessionId}`)
      await 微信.bindSession(sessionId)
      return { ok: true as const }
    },
    weixinGetNotify: async () => 微信.notifySettings(),
    weixinSetNotify: async (patch) => {
      要设置()
      return 微信.setNotifySettings(patch)
    },

    /* ── 远程助理 · 飞书 ── */
    feishuGetStatus: async () => {
      const st = 飞书.status()
      return {
        state: st.state,
        ...(st.login ? { login: st.login } : {}),
        ...(st.openId ? { openId: st.openId } : {}),
        ...(st.boundAt ? { boundAt: st.boundAt } : {}),
        ...(st.sessionId ? { sessionId: st.sessionId } : {}),
        ...(st.lastError ? { lastError: st.lastError } : {}),
        contactName: st.contactName,
      }
    },
    feishuStartLogin: async () => {
      要设置()
      try {
        await 飞书.startLogin()
      } catch (e) {
        throw fault("internal_error", `设备流没起来：${e instanceof Error ? e.message : String(e)}`)
      }
      return { ok: true as const }
    },
    feishuCancelLogin: async () => {
      飞书.cancelLogin()
      return { ok: true as const }
    },
    feishuUnbind: async () => {
      await 飞书.unbind()
      return { ok: true as const }
    },
    feishuBindSession: async ({ sessionId }) => {
      if (!sessions.get(sessionId)) throw fault("not_found", `没有这个会话：${sessionId}`)
      await 飞书.bindSession(sessionId)
      return { ok: true as const }
    },
    feishuGetNotify: async () => 飞书.notifySettings(),
    feishuSetNotify: async (patch) => {
      要设置()
      return 飞书.setNotifySettings(patch)
    },
  }

  // 上次绑过的话，启动就开始听
  微信.start()
  飞书.start()
  // 定时：收拾上次没跑完的，然后按下一次到期设 timer
  调度器?.start()
  opts.注册收摊?.(() => 微信.stop())
  opts.注册收摊?.(() => 飞书.stop())
  if (调度器) opts.注册收摊?.(() => 调度器.stop())
  return backend
}
