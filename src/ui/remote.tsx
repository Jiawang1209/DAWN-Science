/**
 * 侧栏的「远端连接」区（②-B · R3/R4）。
 *
 * 作者：*「左边搞一个固定的『远端连接』，可以增加分组，分组里面是 ssh 的服务器，
 * 类似 XTerminal 的那种登陆效果。」*
 *
 * ## 三条纪律，两条是踩出来的
 *
 * 1. **入口一律常驻、带文字。** 本项目已经因为「悬停才出现的 `＋`」和
 *    「`opacity: 0` 的删除键」被作者报过两次「没有这个功能」，
 *    而两次代码都是好的。这里不玩悬停。
 * 2. **状态不能只靠颜色**（DESIGN.md：no meaning conveyed by color alone）——
 *    点是给一眼扫的，文字是给读的，无障碍树里读到的必须是文字。
 * 3. **断了要说清为什么。** 一个只写「未连接」的状态会让人以为是自己还没点，
 *    而实情可能是口令错了、主机不通、或者对端把连接掐了——
 *    三种要人去改的东西完全不同。
 */
import { useState } from "react"
import type { RemoteConnection, RemoteState, SessionSummary } from "../protocol/index.js"
import { Button, Field, Row } from "./primitives.js"
import { SessionRow, use现在 } from "./views.js"
import { 多久之前, 短路径 } from "./format.js"
import { 服务器图标, 三角图标 } from "./icons.js"

import { t } from "./i18n/index.js"
/**
 * **这一列写什么**（2026-08-16 定的三个词，2026-08-19 动了其中一个）。
 *
 * ```
 * alive        连着
 * connecting   正在连
 * <多久之前>   连过、此刻没连着——写「上次连上是多久前」
 * exited       从来没连上过（包括连不上）
 * ```
 *
 * 作者 2026-08-19：*「远端服务器也需要激活的时候 alive，
 * 非 alive 的话，就是显示时间。」* 以及**规则本身**：
 * *「连接不上为什么不直接写 exited 呢？连接过了，然后断连了，直接写时间不就好了？」*
 *
 * ## `exited` 让位给时间，但只让在「有时间可写」的时候
 *
 * 与会话那一列同一条理由：**`exited` 对任何一台没连着的机器都成立，
 * 所以它什么都没说**；而「上次用它是 2 天前 / 30 天前」是真信息——
 * 那是你判断「这台还在不在、口令还有效吗」的依据。
 *
 * **没连上过的那些没有时间可写**，那时 `exited` 就是准确的那个词。
 * （我一度在这里另造过一个「没连过」，作者当场否掉：*「在这里纠结什么呢？」*
 * 他是对的——`exited` 本来就是「没在跑」，而没连过正是没在跑。
 * 多一个词就多一套要解释的语义，而它没有多说任何事情。）
 *
 * **`connecting` 留着**：它是正在发生的事，且转瞬即逝。
 * 在人盯着看结果的那几秒里跟他说「上次是 3 天前」，是答非所问。
 *
 * ## 这三个词为什么不走 `t()`
 *
 * 作者 2026-08-16 定的：*「无论中文模式还是英文模式，我们都是
 * alive/connecting/exited」*。走 `t()` 的话英文表里要写自我映射
 * （`alive → alive`），那只是给扫描看的噪声。代价说清楚：
 * 它们对不读英文的人是行话——作者明确接受了这一点。
 *
 * （那一轮为此加过 gettext 的 `msgctxt`（`tc()`），随后没了调用点、一并撤掉。
 * 真需要 msgctxt 时按 `docs/DEVELOPMENT_HISTORY.md` 2026-08-16 那条捡回来。）
 *
 * ## 三种「没连着」仍然分得出来
 *
 * | | 这一格 | 原因行 | 点 |
 * |---|---|---|---|
 * | 刚加的、没试过 | `exited` | 无 | 灰 |
 * | 连不上（口令错等） | `exited` | **有** | 红 |
 * | 连过又断了 | **一个时间** | 无 | 灰 |
 */
function 状态文字(conn: RemoteConnection, 正在连: boolean, 现在: number): string {
  if (正在连) return "connecting"
  if (conn.state.kind === "ready") return "alive"
  // **没连上过就没有时间可写**，那时 `exited` 才是准确的那个词
  return conn.lastConnectedAt ? 多久之前(conn.lastConnectedAt, 现在) : "exited"
}

export interface ConnectionDraft {
  id?: string | undefined
  label: string
  group?: string | undefined
  host: string
  port?: number | undefined
  username: string
  privateKeyPath?: string | undefined
  secret?: string | undefined
}

export function RemoteSection({
  connections,
  open,
  onToggle,
  onAdd,
  onEdit,
  onConnect,
  onDisconnect,
  onNewSession,
  activeSessionId,
  busyId,
  problem,
}: {
  connections: readonly RemoteConnection[]
  open: boolean
  onToggle: () => void
  onAdd: () => void
  onEdit: (c: RemoteConnection) => void
  onConnect: (c: RemoteConnection) => void
  onDisconnect: (c: RemoteConnection) => void
  /** 这台机器上已经开着的对话。**副行显示它此刻在哪个目录** */
  /** 在这台机器上开一段新对话。起点是它的家目录——**服务端定** */
  onNewSession: (c: RemoteConnection) => void
  activeSessionId?: string | undefined
  /**
   * 删除 / 改名 / 置顶 / 挪位置。
   *
   * **与上面那两列共用 `SessionRow`**，不做第二份实现：作者报过
   * *「在服务器的对话，不能删除，也不能挪动顺序」*——
   * 那正是因为这里当初图省事画了一个只能点的行。
   * 一个动作有两个家，迟早有一个落后于另一个。
   */
  /** 正在连的那台。**只有它显示进行态**，不是整块变灰 */
  busyId?: string | undefined
  /** 上一次操作失败了。**要在这一区里说**，不是丢进状态栏 */
  problem?: string | undefined
}) {
  /**
   * **一分钟走一格**（2026-08-19）。没连着的那些行写的是相对时间，
   * 不给心跳的话它会停在打开那一刻的数上——**一个不动的相对时间比没有更骗人**。
   *
   * 与侧栏共用同一个钩子（`use现在`）：抄第二份的代价不是那几行，
   * 是**两份心跳迟早各自漂移**，那时人只会觉得「这个数有时候不准」。
   */
  const 现在 = use现在()

  /**
   * 按分组归拢。**没分组的排在前面，且不造一个叫「未分组」的假分组**——
   * 那个假分组会让「我明明没分组」变成「我在一个叫未分组的组里」。
   */
  const 分组: { name: string | undefined; list: RemoteConnection[] }[] = []
  for (const c of connections) {
    const g = 分组.find((x) => x.name === c.group)
    if (g) g.list.push(c)
    else 分组.push({ name: c.group, list: [c] })
  }

  return (
    <section className="remote-section">
      {/**
        * **它不是 `.side-action`。**
        *
        * 那个类的意思是「新建一个 X」——侧栏顶上两颗就是它。
        * 这一行是**一个区的开关**，长得像但不是同一种东西。
        * 借用那个类的代价是：`sidebar-layout.spec.ts` 数的是
        * 「顶层有哪几块」，混进来一个开关会让那条断言失去意思。
        */}
      {/**
        * **与上面那些行同一副长相**（2026-08-12，作者提：
        * *「现在的远端连接，和上面的新建任务其实没有对齐，并且也没有图标。」*）。
        *
        * 上一版行首是一个 `▸` 字符：**它比一个 16px 图标窄**，
        * 于是名字比「新建任务」往左挪了一截——一列扫下来那条竖线是歪的。
        * 现在与别的行一样：**图标在前，展开标记退到行尾**。
        */}
      <Row className="remote-head" aria-expanded={open} onClick={onToggle}>
        <服务器图标 className="row-icon" />
        <span className="name">{t("远端服务器")}</span>
        {/* **收起时也要说有几台**：否则收起等于把它们藏没了 */}
        {connections.length > 0 ? (
          <span className="remote-count">{connections.length}</span>
        ) : null}
        <三角图标 className={`caret${open ? " open" : ""}`} />
      </Row>

      {open ? (
        <div className="remote-body">
          {problem ? (
            // **失败必须出声**（规格 7.5），且就在动作发生的地方
            <p className="remote-problem" role="alert">
              {problem}
            </p>
          ) : null}

          {connections.length === 0 ? (
            <p className="hint pad">{t("还没有服务器")}</p>
          ) : (
            分组.map((g) => (
              <div className="remote-group" key={g.name ?? t("＿无分组")}>
                {g.name ? <p className="remote-group-name">{g.name}</p> : null}
                <ul className="remote-list">
                  {g.list.map((c) => (
                    <ConnectionRow
                      key={c.id}
                      conn={c}
                      busy={busyId === c.id}
                      现在={现在}
                      onEdit={() => onEdit(c)}
                      onConnect={() => onConnect(c)}
                      onDisconnect={() => onDisconnect(c)}
                      onNewSession={() => onNewSession(c)}
                      {...(activeSessionId ? { activeSessionId } : {})}
                    />
                  ))}
                </ul>
              </div>
            ))
          )}

          {/**
           * **加服务器这颗常驻、带文字。**
           *
           * 它曾经在别处是一个没有标签的 `＋`，作者的反馈是「没有这个功能」。
           */}
          <Button variant="text" size="sm" className="remote-add" onClick={onAdd}>
            {t("＋ 添加服务器")}
          </Button>
        </div>
      ) : null}
    </section>
  )
}

function ConnectionRow({
  conn,
  busy,
  onEdit,
  onConnect,
  onDisconnect,
  onNewSession,
  activeSessionId,
  现在,
}: {
  conn: RemoteConnection
  busy: boolean
  /**
   * 「现在」是几点。**由上面统一给，不在这一行里读时钟**——
   * 与会话行同一条理由：每行各读一次的话，同一屏上的相对时间来自
   * 几十个不同的瞬间，而且那个一分钟一跳的心跳没地方挂。
   */
  现在: number
  onEdit: () => void
  onConnect: () => void
  onDisconnect: () => void
  onNewSession: () => void
  activeSessionId?: string | undefined
}) {
  const 连着 = conn.state.kind === "ready"
  const 连着中 = busy || conn.state.kind === "connecting"
  const 状态 = 状态文字(conn, 连着中, 现在)
  return (
    <li className={`remote-row ${连着 ? "on" : ""}`} data-state={busy ? "connecting" : conn.state.kind}>
      <div className="remote-main">
        <span className="remote-label">{conn.label}</span>
        {/**
          * 点是给一眼扫的；**文字才是那个意思本身**。
          * **挪到了行尾**（2026-08-21）：它原先在名字前面、占 16px，是为了跟会话行
          * 前面那颗图标对齐；会话行的图标撤了，点再留在前面就是一列里两条起跑线。
          */}
        <span className="remote-dot" aria-hidden="true" />
        {/**
          * `data-when` 让判据与将来的悬停卡拿得到原文——
          * 屏幕上那一截是「2d」，从文本里读不出是哪一天。
          */}
        <span className="remote-status" data-when={conn.lastConnectedAt ?? conn.createdAt}>
          {状态}
        </span>
      </div>
      <p className="remote-sub">
        {conn.username}@{conn.host}
        {conn.port === 22 ? "" : `:${conn.port}`}
      </p>
      {/**
       * **断了要说清为什么，写在屏幕上。**
       *
       * 口令错、主机不通、对端掐断——三种在界面上都长成「连不上」，
       * 但要人去改的东西完全不同。
       */}
      {conn.state.kind === "disconnected" ? (
        <p className="remote-reason">{conn.state.reason}</p>
      ) : null}
      {/**
       * **这台机器上的对话，就在它下面。**
       *
       * 每条的副行是**它此刻在哪个目录**——那不是装饰：
       * *你以为在 A 目录、实际在 B 目录，然后说一句「把这里的文件都删了」*。
       */}
      {/**
        * **这里不再列这台机器上的对话**（2026-08-14，作者定的）。
        *
        * 作者：*「固定的远程服务器里面，只有服务器的新对话、连接、编辑，
        * 不再有会话记录了，因为和下面重复了。」*
        *
        * 它们现在落在侧栏的「服务器」收纳里（服务器 → 每台机器 → 会话）。
        * **两处都列就是同一个东西有两个家**：改个名、删一条，得记得另一处也会变。
        *
        * **顺序不能反**：我上一轮先撤了这里、而收纳当时还收不到
        * （远端会话不是任务），于是那些对话两处都不在，比改之前更坏。
        * 现在收纳先收得全了（`b399f49`），撤这里才是安全的。
        */}

      <div className="remote-actions">
        {/**
         * **「新对话」常驻**，而且连不连得上都能点：没连上就先连
         * （人点的是「在这台机器上干活」，不该让他先按连接再按新建）。
         */}
        <Button variant="text" size="inline" onClick={onNewSession}>
          {t("＋ 新对话")}
        </Button>
        {连着 ? (
          <Button variant="text" size="inline" onClick={onDisconnect}>
            {t("断开")}
          </Button>
        ) : (
          <Button variant="text" size="inline" disabled={busy} onClick={onConnect}>
            {busy ? t("连接中…") : t("连接")}
          </Button>
        )}
        <Button variant="text" size="inline" onClick={onEdit}>
          {t("编辑")}
        </Button>
      </div>
    </li>
  )
}

/**
 * 添加 / 编辑一台服务器。
 *
 * ## 口令那个框**永远是空的**
 *
 * 它不回显——回显一次，它就落进了截图、日志和录屏（与模型 key 同一条纪律）。
 * 但空框有个坏处：人会以为「我没配」。所以配过的时候，
 * 占位符要明说**「已配置 · 留空则不改」**——
 * 否则「改一次分组顺手把口令清了」这条路就通了。
 */
export function ConnectionDialog({
  draft,
  onCancel,
  onSave,
  onRemove,
  saving,
  problem,
}: {
  draft: ConnectionDraft & { hasSecret?: boolean }
  onCancel: () => void
  onSave: (d: ConnectionDraft) => void
  /** 删掉这一台。**新建时不给**——没有的东西不该有删除键 */
  onRemove?: (() => void) | undefined
  saving?: boolean | undefined
  problem?: string | undefined
}) {
  const [d, setD] = useState<ConnectionDraft>(draft)
  const 改 = (k: keyof ConnectionDraft, v: string) =>
    setD((x) => ({ ...x, [k]: v === "" ? undefined : v }))

  const 能存 = Boolean(d.host?.trim() && d.username?.trim())

  return (
    <div
      className="confirm-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={draft.id ? t("编辑服务器") : t("添加服务器")}
      onKeyDown={(e) => {
        if (e.key === "Escape") onCancel()
      }}
    >
      <div className="confirm conn-dialog">
        <h2 className="confirm-title">{draft.id ? t("编辑服务器") : t("添加服务器")}</h2>

        {problem ? (
          <p className="remote-problem" role="alert">
            {problem}
          </p>
        ) : null}

        <Field id="conn-host" label={t("主机")} hint={t("域名或 IP。不读 ~/.ssh/config —— 这里写什么就连什么")}>
          <input
            id="conn-host"
            className="control"
            autoFocus
            value={d.host}
            onChange={(e) => setD((x) => ({ ...x, host: e.target.value }))}
            placeholder="gs191.example.com"
          />
        </Field>

        <Field id="conn-user" label={t("用户名")}>
          <input
            id="conn-user"
            className="control"
            value={d.username}
            onChange={(e) => setD((x) => ({ ...x, username: e.target.value }))}
          />
        </Field>

        <Field id="conn-port" label={t("端口")} hint={t("留空就是 22")}>
          <input
            id="conn-port"
            className="control"
            inputMode="numeric"
            value={d.port === undefined ? "" : String(d.port)}
            onChange={(e) =>
              setD((x) => ({
                ...x,
                port: e.target.value.trim() === "" ? undefined : Number(e.target.value),
              }))
            }
          />
        </Field>

        <Field id="conn-label" label={t("名字")} hint={t("留空就用 用户名@主机")}>
          <input
            id="conn-label"
            className="control"
            value={d.label}
            onChange={(e) => setD((x) => ({ ...x, label: e.target.value }))}
          />
        </Field>

        <Field id="conn-group" label={t("分组")} hint={t("比如「实验室」。留空就不分组")}>
          <input id="conn-group" className="control" value={d.group ?? ""} onChange={(e) => 改("group", e.target.value)} />
        </Field>

        <Field
          id="conn-key"
          label={t("私钥路径")}
          hint={t("留空就用口令登录。路径不是秘密，所以它会显示出来")}
        >
          <input
            id="conn-key"
            className="control"
            value={d.privateKeyPath ?? ""}
            onChange={(e) => 改("privateKeyPath", e.target.value)}
            placeholder="~/.ssh/id_ed25519"
          />
        </Field>

        <Field
          id="conn-secret"
          label={d.privateKeyPath ? t("私钥口令") : t("登录口令")}
          hint={
            draft.hasSecret
              ? t("已配置。留空则不改 —— 这个框永远不回显已存的口令")
              : t("存进系统钥匙串，不写进数据库")
          }
        >
          <input
            id="conn-secret"
            className="control"
            type="password"
            value={d.secret ?? ""}
            onChange={(e) => setD((x) => ({ ...x, secret: e.target.value }))}
            placeholder={draft.hasSecret ? t("已配置 · 留空则不改") : ""}
          />
        </Field>

        <div className="confirm-actions">
          {onRemove ? (
            <Button variant="danger" size="sm" className="conn-remove" onClick={onRemove}>
              {t("删除")}
            </Button>
          ) : null}
          <Button variant="secondary" size="sm" onClick={onCancel}>
            {t("取消")}
          </Button>
          <Button
            variant="primary"
            size="sm"
            disabled={!能存 || saving === true}
            onClick={() =>
              onSave({
                ...d,
                // 名字留空就用 `用户名@主机`——**不留一个空标签**，那在列表里是一行空白
                label: d.label.trim() || `${d.username}@${d.host}`,
              })
            }
          >
            {saving ? t("保存中…") : "保存"}
          </Button>
        </div>
      </div>
    </div>
  )
}
