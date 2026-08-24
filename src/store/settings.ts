/**
 * 应用级设置的读写（②-A 后续，2026-08-10）。
 *
 * 目前只有两个键：Python 与 R 的解释器路径。
 *
 * ## 这两个路径是**机制**，不是提示
 *
 * 作者 2026-08-10：*「我不是要求你扫描整个电脑，而是直接提供一个 R 解释器
 * 和 Python 解释器的路径即可。**只有配置了，我们才能调用** R 或者 Python。」*
 *
 * 所以它们不是「扫描结果的一个补充」——**没配就是不能用**，
 * 而界面要明说「还没配」，不是悄悄退回某个猜出来的默认。
 * 猜一个的后果不是跑不起来，是**跑在了另一个环境里而不自知**。
 */
import type Database from "better-sqlite3"

/** 认得的设置键。**闭集**——写进一个拼错的键等于静默丢配置 */
export type SettingKey =
  /**
   * 远程助理 · 微信（2026-08-21）。**token 不在这儿**——它进钥匙串（`weixin:botToken`）。
   * 这几个都不是秘密：绑定的 bot / 用户 id、账号基址、长轮询游标、最近一条的
   * `context_token`、绑着的会话、通知开关（json）。设计文档里写的是新表，
   * 做的时候改成这几把键：七个标量不值得一张表。
   */
  | "weixin.botId"
  | "weixin.userId"
  | "weixin.baseUrl"
  | "weixin.cursor"
  | "weixin.contextToken"
  | "weixin.sessionId"
  | "weixin.boundAt"
  | "weixin.notify"
  | "interpreter.python"
  | "interpreter.r"
  /**
   * 下载目录（批 4a，2026-08-17）。**空串 = 恢复系统默认**，
   * 默认值来自 Electron 的 `app.getPath("downloads")`。
   */
  | "download.dir"
  /**
   * 工具权限档位（2026-08-13）。取值见 `policy/permissions.ts` 的 `权限档`。
   *
   * **默认（没配）= `allow-all`**，也就是今天的行为。默认改成拦截会让
   * 一个正在干活的人**在毫无预兆的情况下开始撞墙**，而这一版还没有
   * 「问一句、你点允许」那条路——撞了也没法放行。
   * 等询问那条通了，默认再往紧里调。
   */
  | "permission.mode"
  /**
   * `@` 引用（2026-08-23，学自 dsh-at-file 第二档）：粘贴进来的 `@` 算不算（"0" = 算；没配 = 不算）；
   * 文件名过滤规则（json 数组）——全局一套，按工作区一套（键后面跟工作区绝对路径）。
   */
  /**
   * 自带的技能 / 子 agent 的开关（2026-08-23，作者：「自带的内容都是已启用，现在没有取消启用的按钮」）。
   * 自带的文件在应用包里只读，所以档位不能写进 frontmatter，落在这儿：`skill.mode.<名>` 取值 model / manual / off；
   * `subagent.off.<名>` = "1" 停用。运行时与设置屏读的是同一把键（都经 `技能位置.自带档` / `子agent位置.自带停用`）。
   */
  | `skill.mode.${string}`
  | `subagent.off.${string}`
  | "atfile.ignorePasted"
  | "atfile.rules"
  | `atfile.rules.${string}`
  /**
   * 「这台 MCP 服务器我过目了」（2026-08-15）。键是 `mcp.trusted.<服务器名>`。
   *
   * ## 为什么它不在 `providers.yaml` 里
   *
   * 我第一版把 `trusted` 写进了配置——**那是个漏洞**：
   * 项目级名单住在 `.dawn/mcp.yaml`，**会跟着仓库被 clone 下来**，
   * 于是别人的仓库可以声明「我信得过」，而那台服务器是他写的。
   *
   * 信任只能由**坐在这台机器前的人**拨，所以它落在本机的库里，
   * 而不是任何一份会被分享的文件里。
   */
  | `mcp.trusted.${string}`
  /** 「这台先别连」（2026-08-15）。键是 `mcp.off.<服务器名>`。与上面同一个理由 */
  | `mcp.off.${string}`
  /**
   * **App 的默认工作目录**（2026-08-12，作者要的）。
   *
   * 作者：*「设置里面，其实要增加一个就是 App 默认设置的工作目录，
   * 也就是初始化的目录，windows 的话就默认设置在桌面，
   * mac 默认家目录下设置一个 `DAWN` 的目录就行。」*
   *
   * 两处用它：**没给工作目录的那些对话落在这儿**（此前落在应用数据目录里，
   * 那是个用户永远找不到的地方），以及**选文件夹时从这儿起步**。
   */
  | "workspace.default"
  /**
   * Office 插件（2026-08-25，学自 dsh-office）：`plugin.office.off` = "1" 整个关；
   * `plugin.office.<xlsx|pdf|ppt|docx>` = "0" 关那一族。**没记过 = 开着**——
   * 插件随应用自带，装好即可用，这个默认写在插件卡上。
   */
  | `plugin.office.${string}`

export class SettingsStore {
  constructor(private readonly db: Database.Database) {}

  /** 读一个。**没配就是 `undefined`**，不给空串——空串会被读成「配了一个空路径」 */
  get(key: SettingKey): string | undefined {
    const row = this.db.prepare(`SELECT value FROM settings WHERE key = ?`).get(key) as
      | { value: string }
      | undefined
    const v = row?.value?.trim()
    return v ? v : undefined
  }

  /**
   * 写一个。**传空串等于清除**——那是「我不想配了」，
   * 与「配了一个空路径」是两回事，后者根本不该存在。
   */
  set(key: SettingKey, value: string, now: string): void {
    const v = value.trim()
    if (!v) {
      this.db.prepare(`DELETE FROM settings WHERE key = ?`).run(key)
      return
    }
    this.db
      .prepare(
        `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      )
      .run(key, v, now)
  }

  /** 两个解释器路径。**没配的那个不给字段**，而不是给空串 */
  interpreters(): { python?: string; r?: string } {
    const python = this.get("interpreter.python")
    const r = this.get("interpreter.r")
    return { ...(python ? { python } : {}), ...(r ? { r } : {}) }
  }
}
