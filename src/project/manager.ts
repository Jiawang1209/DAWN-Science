/**
 * 项目管理器（Task 2.6）。
 *
 * **项目是用户切换的单位**：打开一个文件夹即一个项目，会话与 Run 都挂在它下面。
 * 这一层把三个 store 拼成协议实体，是 Workbench 后端的主要数据来源。
 */
import { randomUUID } from "node:crypto"
import { mkdirSync } from "node:fs"
import { basename, join, resolve, isAbsolute } from "node:path"
import type { ProviderRegistry } from "../config/schema.js"
import type { ProjectRecord, ProjectStore } from "../store/projects.js"
import type { RunStore } from "../store/runs.js"
import type { SessionStore, SessionRecord } from "../store/sessions.js"
import type { ProjectSummary, RunSummary, SessionSummary } from "../protocol/index.js"

export interface ProjectManagerOptions {
  projects: ProjectStore
  sessions: SessionStore
  runs: RunStore
  /** 有 registry 才能知道一个 agent 是 native 还是 pty；没有则回退 native */
  registry?: ProviderRegistry
}

export class ProjectManager {
  // 字段名与方法名必须错开：sessions()/runs() 是对外的查询方法
  private readonly projectStore: ProjectStore
  private readonly sessionStore: SessionStore
  private readonly runStore: RunStore
  private readonly registry: ProviderRegistry | undefined

  constructor(opts: ProjectManagerOptions) {
    this.projectStore = opts.projects
    this.sessionStore = opts.sessions
    this.runStore = opts.runs
    this.registry = opts.registry
  }

  /**
   * 打开一个文件夹为项目。**已存在则返回原项目，不新建**——
   * 否则重复打开同一目录会不断产生新项目，把历史切成碎片。
   *
   * 路径先规范化再比对：`/w` 与 `/w/` 必须命中同一项目。
   */
  open(workspace: string): ProjectRecord {
    if (!isAbsolute(workspace)) {  // 不是 startsWith("/")：Windows 的 C:\ 过不了那个判断，建任务直接失败（2026-08-28 CI 抓的）
      throw new Error(`项目路径必须是绝对路径，收到 "${workspace}"——相对路径在多窗口下会指向不同位置`)
    }
    const normalized = resolve(workspace)
    const existing = this.projectStore.findByWorkspace(normalized)
    if (existing) return existing

    const rec: ProjectRecord = {
      projectId: randomUUID(),
      name: basename(normalized) || normalized,
      workspace: normalized,
      createdAt: new Date().toISOString(),
    }
    this.projectStore.insert(rec)
    return rec
  }

  /**
   * 保证至少有一个项目可用。
   *
   * **作者的原话：「claude code, codex 其实上来也没有要求我一定要配置工作目录的。」**
   * 此前 DAWN 把「打开文件夹」做成了准入门槛——后端完全可用，界面却什么都不让做。
   * Hermes 的 DESIGN.md 早写明了正解：*"Reserve the full-screen boot/connecting
   * experience for a genuinely unusable backend."* 没有项目不属于那种情况。
   *
   * 注意它**不是**「总是创建默认项目」：
   *   - 已经有项目 ⇒ 什么都不做，返回第一个。不往用户的列表里塞东西，
   *     **也不创建那个目录**——用户没要它。
   *   - 一个都没有 ⇒ 建目录 + 建项目，幂等（`open()` 命中已有路径会复用）。
   */
  ensureDefault(workspace: string): ProjectRecord {
    // **临时项目不算数**：它是一次没指定项目的对话，不该被当成「默认项目」
    const existing = this.projectStore.list().filter((p) => !p.temporary)
    if (existing.length > 0) return existing[0]!
    mkdirSync(workspace, { recursive: true })
    return this.open(workspace)
  }

  /**
   * **那一个临时项目**（2026-08-11）。
   *
   * 作者：*「会话其实更倾向于，没有设置工作路径的、或者没有设置项目的临时会话。」*
   *
   * ## 为什么是**一个**项目，而不是每个临时会话一个
   *
   * 第一版是后者，理由是作者选了「每个临时会话一个独立目录」。
   * **但目录和项目不是一回事**——会话的工作目录是**按会话**给的
   * （`sessions.create(agentId, workspace, …)`），项目只是它的归属。
   *
   * 一个会话一个项目会让**置顶、上移、拖拽排序全部失效而且不出声**：
   * 那三样都是项目内的排序，而每个项目里只有一条会话。
   * e2e 当场抓到了这一点（「置顶：排到最前面」红了，列表纹丝不动）。
   *
   * 所以：**一个临时项目装所有临时会话，而每条会话仍然有自己的目录。**
   *
   * ## 根目录已经被一个**普通**项目占着时，复用它（2026-09-01 更新路径抓的）
   *
   * `projects.workspace` 是 UNIQUE。上一版的默认工作区就是 `~/DAWN/scratch`，`ensureDefault` 在那儿建过一个非临时项目；
   * 这一版把默认挪到 `~/DAWN/workspace`、临时根留在 scratch。更新之后 `ensureDefault` 见到已有项目就返回，
   * 装配处「默认 ≠ 临时根」那道闸比的是两个字符串、也过了——直到第一段临时会话来这里 insert 同一条 workspace，
   * 用户只看到「操作 createTask 执行失败」。手动把 scratch 打开成项目的人同样中招。
   *
   * 选复用而不是换个目录或报错：**会话必须开得出**，而目录是用户的。
   * **不把它改成临时的**——那是用户的项目，侧栏里突然搬到「会话」那一列、从项目列表消失，等于替他删了一个项目。
   *
   * 代价要说清楚（2026-09-01 终审抓的）：这些临时会话挂在那个普通项目名下。
   * 只按 `temporary` 列临时会话的话它们**哪一列都不在**——「会话」列不认这个项目，
   * 项目列又只在它恰好是当前项目时才列它的会话。所以列临时会话得走 `temporaryHosts`，
   * 把占着根的那个项目一起算上；它的会话可能两列都出现，看得见的重复比看不见强。
   */
  ensureTemporary(root: string): ProjectRecord {
    const 已有 = this.projectStore.list().find((p) => p.temporary)
    if (已有) return 已有
    const workspace = resolve(root)
    const 占着的 = this.projectStore.findByWorkspace(workspace)
    if (占着的) return 占着的
    mkdirSync(root, { recursive: true })
    const rec: ProjectRecord = {
      projectId: randomUUID(),
      name: "临时会话",
      workspace,
      createdAt: new Date().toISOString(),
      temporary: true,
    }
    this.projectStore.insert(rec)
    return rec
  }

  /**
   * 装着临时会话的那些项目——`ensureTemporary` 的只读镜像，**不建任何东西**。
   *
   * 标了 `temporary` 的全部算（第一版是每段临时会话一个项目，老库里可能有好几个），
   * 再加上**占着某个临时根的普通项目**：`ensureTemporary` 见根被占就复用它、不改标记，
   * 落在它名下的临时会话只有从这里才列得出来。判据与 `ensureTemporary` 同一处维护，
   * 两边才不会各说各话。
   */
  temporaryHosts(roots: readonly string[]): ProjectRecord[] {
    const 全部 = this.projectStore.list()
    const 根 = new Set(roots.map((r) => resolve(r)))
    return 全部.filter((p) => p.temporary || 根.has(p.workspace))
  }

  /**
   * 给一段临时会话开一个**自己的目录**（作者选的形态）。
   *
   * ## 路径为什么是 ASCII 且不带空格
   *
   * agent 会**自己写 shell 命令**去操作这个目录。一个带空格或中文的路径，
   * 只要它有一次忘了加引号就会散架，而那时的报错跟「路径里有空格」
   * 毫无关系。所以是 `<root>/<时间戳>-<四位随机>`。
   */
  temporaryWorkspace(root: string, now: Date = new Date()): string {
    const 时刻 = now.toISOString().replace(/[:.]/g, "-").slice(0, 19)
    const dir = resolve(root, `${时刻}-${randomUUID().slice(0, 4)}`)
    mkdirSync(dir, { recursive: true })
    return dir
  }

  summary(projectId: string): ProjectSummary | undefined {
    return this.projectStore.summary(projectId)
  }

  list(): ProjectSummary[] {
    return this.projectStore
      .list()
      .map((p) => this.projectStore.summary(p.projectId))
      .filter((s): s is ProjectSummary => s !== undefined)
  }

  /**
   * agent 的 kind 来自 registry。**取不到时回退 native 并且这是显式行为**——
   * 不是猜测，而是「没有配置依据时的已声明默认值」。
   */
  private kindOf(agentId: string): "native" | "pty" | "cli" | "kernel" | "acp" {
    return this.registry?.agents[agentId]?.kind ?? "native"
  }

  /** 列出项目下的会话（协议实体形态） */
  sessions(projectId: string, remoteLabel?: (id: string) => string | undefined): SessionSummary[] {
    /**
     * **一次查完整个项目的「最后活动时刻」**（2026-08-19）。
     *
     * 侧栏一次要显示几十行，逐行去查就是几十次 SQL——
     * 而这是一次 `GROUP BY` 能答完的问题。见 `RunStore.最后活动时刻`。
     */
    const 活动 = this.runStore.最后活动时刻(projectId)
    return this.sessionStore
      .listByProject(projectId)
      .map((s) => this.toSummary(projectId, s, remoteLabel, 活动.get(s.id)))
  }

  /**
   * 一条会话记录 → 协议摘要。
   *
   * **`remoteLabel` 不给就退回连接 id**：那不好看，但**是实话**；
   * 编一个「未知服务器」出来会让人以为真有这么一台。
   */
  toSummary(
    projectId: string,
    s: SessionRecord,
    remoteLabel?: (id: string) => string | undefined,
    lastActiveAt?: string,
  ): SessionSummary {
    return {
      sessionId: s.id,
      projectId,
      agentId: s.agentId,
      kind: this.kindOf(s.agentId),
      state: s.state,
      createdAt: s.createdAt,
      /**
       * **没干过活就不给这个字段**（2026-08-19）。
       * 不拿 `createdAt` 顶上——那样「建了没说话」与「刚说完话」
       * 在协议这一层就分不开了，而它们是两件事。退回哪个值由界面决定。
       */
      ...(lastActiveAt === undefined ? {} : { lastActiveAt }),
      // **没有标题就不给这个字段**，不给空串——界面据此显示「新会话」
      ...(s.title === undefined ? {} : { title: s.title }),
      pinned: s.pinned,
      sortOrder: s.sortOrder,
      ...(s.archivedAt === undefined ? {} : { archivedAt: s.archivedAt }),
      ...(s.pid === undefined ? {} : { pid: s.pid }),
      ...(s.exitCode === undefined ? {} : { exitCode: s.exitCode }),
      // **这段对话长在哪台机器的哪个目录**（②-B · R4′）。缺省 = 本地
      ...(s.connectionId
        ? {
            remote: {
              connectionId: s.connectionId,
              label: remoteLabel?.(s.connectionId) ?? s.connectionId,
              cwd: s.remoteCwd ?? "/",
            },
          }
        : {}),
    }
  }

  /** 会话此刻在远端的哪个目录（②-B · R4′）。**列表要显示它** */
  setRemoteCwd(sessionId: string, cwd: string): void {
    this.sessionStore.setRemoteCwd(sessionId, cwd)
  }

  /**
   * 第一句话定名字。**只在还没有标题时写**——判空在 SQL 里，不在调用方，
   * 先读后写的窗口会让「第二句话把标题改掉」，症状是侧栏上的名字自己变了。
   */
  setSessionTitle(sessionId: string, title: string): void {
    this.sessionStore.setTitleIfAbsent(sessionId, title)
  }

  /** 列出项目下的 Run，最近的在前——项目面板的历史栏要的就是这个顺序 */
  runs(projectId: string, opts: { sessionId?: string; limit?: number; after?: string } = {}): RunSummary[] {
    return this.runStore.listByProject(projectId, opts)
  }
}
