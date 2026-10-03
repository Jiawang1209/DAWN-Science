/**
 * 方案卡与输入卡上的开关（先出方案，2026-09-27，spec `2026-09-27-先出方案-design.md` §2）。
 *
 * **三颗按钮常驻**（悬停才出现的等于不存在）；只有最新、还在等的那一版能按，agent 在说话时灰着（与案例卡片「照这篇做」同一个规矩）。
 * 「让它重写」不是按钮：开关还开着，人在输入框里说哪里不对——卡片底下一行字说清这条路。
 * 批准之后的「对照」是从产物清单现算的（`方案对照`），不存、不写回方案文件（D8）。
 * 工作区那份在两轮之间被人改过（`fileChanged`，2026-09-28 D3）→ 卡头写「你改过」，不恢复、不拦。
 */
import { useId, useRef, useState } from "react"
import type { TranscriptItem } from "../protocol/index.js"
import { 方案产物, 方案对照 } from "../protocol/index.js"
import type { ArtifactList } from "./state/catalog.js"
import { AgentMarkdown } from "./markdown.js"
import { Button } from "./primitives.js"
import { t, tf } from "./i18n/index.js"
import { 概览图标 } from "./icons.js"

type PlanItem = Extract<TranscriptItem, { type: "plan" }>

/** 超过这么多行就先折起来：一份方案可以很长，别让它把整段对话顶出屏幕 */
const 折起行数 = 24

export function 方案卡({
  item,
  能答,
  onAnswer,
  onOpenFile,
  artifacts,
  remote,
}: {
  item: PlanItem
  /** 此刻能不能按（agent 在说话 / 只读时 false）。按钮照画、灰着 */
  能答: boolean
  /** 批准（可带人改过的正文）/ 不做了。失败抛出来，卡片上说原因 */
  onAnswer?: ((action: "approve" | "discard", text?: string) => Promise<void>) | undefined
  onOpenFile?: ((path: string) => void) | undefined
  /** 这段会话的产物清单（主区才给）。批准之后画对照 */
  artifacts?: ArtifactList | undefined
  remote?: boolean | undefined
}) {
  const [改, 设改] = useState<string | undefined>(undefined)
  const [忙, 设忙] = useState(false)
  const [错, 设错] = useState<string | undefined>(undefined)
  const [全文, 设全文] = useState(false)
  const [清单, 设清单] = useState(false)
  const 等着 = item.status === "proposed"
  const 灰 = !能答 || 忙 || !onAnswer
  const 长 = item.markdown.split("\n").length > 折起行数
  /** 卡片本身：答完之后那几颗按钮卸掉，焦点落回这里（不落到 `<body>`，读屏与键盘都还在原处） */
  const 卡根 = useRef<HTMLElement>(null)
  /** 同一拍里按两下只算一次：`忙` 是 state，要等下一次渲染才灰；这把锁当场就上 */
  const 在答 = useRef(false)
  const 答 = (action: "approve" | "discard", text?: string) => {
    if (!onAnswer || 在答.current) return
    在答.current = true
    设忙(true)
    设错(undefined)
    onAnswer(action, text)
      .then(() => {
        设改(undefined)
        卡根.current?.focus()
      })
      .catch((e: unknown) => 设错(e instanceof Error ? e.message : String(e)))
      .finally(() => {
        在答.current = false
        设忙(false)
      })
  }
  const 态 =
    item.status === "proposed"
      ? t("等你看")
      : item.status === "approved"
        ? item.approvedAt
          ? tf("已批准 {0}", new Date(item.approvedAt).toLocaleString())
          : t("已批准")
        : item.status === "superseded"
          ? t("已被新的一版取代")
          : t("没采用")

  return (
    <section ref={卡根} tabIndex={-1} className="plan-card" data-status={item.status} aria-label={tf("方案第 {0} 版", item.version)}>
      <header className="plan-card-head">
        <span className="plan-card-kicker">
          <概览图标 />
          {tf("方案 · 第 {0} 版", item.version)}
        </span>
        <span className="plan-card-status">
          {item.edited ? <span className="tag">{t("批的是改过的")}</span> : null}
          {item.fileChanged ? <span className="tag tag-manual">{t("你改过")}</span> : null}
          {态}
        </span>
      </header>
      <h3 className="plan-card-title">{item.title}</h3>

      {改 !== undefined ? (
        <textarea
          className="control plan-card-edit"
          aria-label={t("方案原文")}
          value={改}
          onChange={(e) => 设改(e.target.value)}
          rows={16}
        />
      ) : (
        <div className="plan-card-body" data-folded={长 && !全文 ? "true" : "false"}>
          <AgentMarkdown text={item.markdown} streaming={false} />
        </div>
      )}
      {改 === undefined && 长 && !全文 ? (
        <Button variant="ghost" size="xs" onClick={() => 设全文(true)}>
          {t("看全文")}
        </Button>
      ) : null}

      {等着 ? (
        <div className="plan-card-actions">
          {改 === undefined ? (
            <>
              <Button variant="primary" size="sm" disabled={灰} onClick={() => 答("approve")}>
                {t("照这个做")}
              </Button>
              <Button variant="secondary" size="sm" disabled={灰} onClick={() => 设改(item.markdown)}>
                {t("改一改")}
              </Button>
              <Button variant="ghost" size="sm" disabled={灰} onClick={() => 答("discard")}>
                {t("不做了")}
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="primary"
                size="sm"
                disabled={灰}
                onClick={() => 答("approve", 改.trim() !== item.markdown.trim() ? 改 : undefined)}
              >
                {t("照改过的做")}
              </Button>
              {/* 不叫「不改了」：那是「修改这段话」的那颗，两颗同时在对话里 */}
              <Button variant="ghost" size="sm" disabled={忙} onClick={() => 设改(undefined)}>
                {t("不改方案了")}
              </Button>
            </>
          )}
        </div>
      ) : null}
      {等着 ? <p className="hint plan-card-hint">{t("想让它重写：直接在下面说，它会交新的一版。")}</p> : null}
      {错 ? (
        <p className="plan-card-error" role="alert">
          {tf("没办成：{0}", 错)}
        </p>
      ) : null}

      {item.status === "approved" ? (
        <div className="plan-compare">
          {item.savedPath && onOpenFile ? (
            <Button variant="ghost" size="xs" onClick={() => onOpenFile(item.savedPath!)}>
              {t("打开方案文件")}
            </Button>
          ) : null}
          {item.savedPath ? <code className="plan-compare-path">{item.savedPath}</code> : null}
          <对照 item={item} artifacts={artifacts} remote={remote} 开={清单} 设开={设清单} />
        </div>
      ) : null}
    </section>
  )
}

function 对照({
  item,
  artifacts,
  remote,
  开,
  设开,
}: {
  item: PlanItem
  artifacts: ArtifactList | undefined
  remote: boolean | undefined
  开: boolean
  设开: (v: boolean) => void
}) {
  if (remote) return <p className="hint plan-compare-sum">{t("远端会话的产物记不下来，对照不了")}</p>
  if (!artifacts) return null
  if (artifacts.error) return <p className="hint plan-compare-sum">{tf("产物清单取不到，对照不了：{0}", artifacts.error)}</p>
  const 计划 = 方案产物(item.markdown)
  if (计划.length === 0) return <p className="hint plan-compare-sum">{t("方案的「产物」一节里没有写路径，没什么可对照的")}</p>
  const r = 方案对照(计划, artifacts.artifacts, item.approvedAt ?? 0)
  const 已生成 = r.计划.filter((x) => x.生成了.length > 0).length
  return (
    <>
      <p className="plan-compare-sum">
        {tf("对照：计划的产物 {0} 项 · 已生成 {1} · 计划外 {2}", 计划.length, 已生成, r.计划外.length)}
      </p>
      <Button variant="ghost" size="xs" aria-expanded={开} onClick={() => 设开(!开)}>
        {t("看清单")}
      </Button>
      {开 ? (
        <ul className="plan-compare-list">
          {r.计划.map((x) => (
            <li key={x.路径} data-done={x.生成了.length > 0 ? "true" : "false"}>
              <code>{x.路径}</code>
              <span className="hint"> {x.生成了.length > 0 ? t("（已生成）") : t("（还没有）")}</span>
            </li>
          ))}
          {r.计划外.map((p) => (
            <li key={p} data-extra="true">
              <code>{p}</code> <span className="hint">{t("（计划外）")}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </>
  )
}

/**
 * 附栏上那颗「生成方案」（spec §2.1；2026-09-28 由「先出方案」改名）。**在附栏里、紧跟「优化输入」**（2026-09-28 作者要的，
 * 取代 09-27 放在模型那一行最左边的做法；对话格 ≤720 时附栏折成两行，见 styles.css「窄了附栏折成两行」）。**常驻**；不支持时灰着，旁边一行字说原因——不是悬停提示（D7）。
 * 按下态用 `aria-pressed`，开着时另有输入卡顶上那条带子用文字说清（形状不够，扫一眼与读屏都读不出含义）。
 *
 * **坞里那么窄时只留图标**（`.plan-toggle-word` 由容器查询藏掉，与「优化输入」同一条），
 * 所以名字挂在 `aria-label` 上——藏掉可见字不改它的名字。
 */
export function 先出方案开关({
  on,
  不能的原因,
  onToggle,
}: {
  on: boolean
  不能的原因?: string | undefined
  onToggle?: ((on: boolean) => void) | undefined
}) {
  const 原因id = useId()
  return (
    <span
      className="plan-toggle-wrap"
      data-unavailable={不能的原因 ? "true" : undefined}
      tabIndex={不能的原因 ? 0 : undefined}
      aria-describedby={不能的原因 ? 原因id : undefined}
    >
      <Button
        variant="ghost"
        size="sm"
        className="plan-toggle"
        aria-label={t("生成方案")}
        // 有原因就不显示按下：「按下 + 灰着」自相矛盾（空态按下之后换了 agent 就会走到这里）
        aria-pressed={on && !不能的原因}
        {...(不能的原因 ? { "aria-describedby": 原因id } : {})}
        disabled={!onToggle || Boolean(不能的原因)}
        onClick={() => onToggle?.(!on)}
      >
        <概览图标 />
        <span className="plan-toggle-word">{t("生成方案")}</span>
      </Button>
      {不能的原因 ? <span id={原因id} role="tooltip" className="hint plan-toggle-why">{不能的原因}</span> : null}
    </span>
  )
}
