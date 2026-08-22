/**
 * 坞里的「团队」格（team-board，2026-08-22，学自 dsh-agent-teams 的活动面板——它是右上角浮层，我们有坞）。
 *
 * 画的是**磁盘真相的快照**：成员一行一个（状态、跑过几轮、手上的任务），任务一行一个（状态、负责人、依赖、
 * attempt、结果摘要，点开看全文），邮箱按时间列。没有团队就说没有，不画空壳。
 * 不轮询：快照随 `team` 更新推过来。
 */
import { useState } from "react"
import { useStore } from "@nanostores/react"
import { $团队 } from "./state/index.js"
import { t, tf } from "./i18n/index.js"
import { Button } from "./primitives.js"
import type { TeamSnapshot } from "../protocol/index.js"

type 任务 = TeamSnapshot["tasks"][number]

/** 逐个写成字面量：i18n 扫描只认调用点上的字符串字面量，查表式的 msgid 会被当成孤儿 */
function 状态词(s: 任务["status"]): string {
  switch (s) {
    case "pending":
      return t("待领")
    case "claimed":
      return t("已领")
    case "in_progress":
      return t("进行中")
    case "completed":
      return t("完成")
    case "failed":
      return t("失败")
    case "cancelled":
      return t("取消")
  }
}

export function TeamPanel() {
  const team = useStore($团队)
  const [开着的, 设开着的] = useState<string | undefined>(undefined)
  if (!team) return <p className="hint team-empty">{t("这段会话没有团队。对模型说「用团队分工做…」，或在输入框打 /team。")}</p>
  const 完成 = team.tasks.filter((x) => x.status === "completed").length
  const 终 = team.tasks.filter((x) => ["completed", "failed", "cancelled"].includes(x.status)).length
  const 信 = [...team.messages].sort((a, b) => b.ts - a.ts).slice(0, 30)
  return (
    <div className="team-panel" data-team={team.id} data-finished={team.finishedAt ? "1" : "0"}>
      <header className="team-head">
        <h2 className="team-name" data-authored="1">{team.name}</h2>
        {team.finishedAt ? <span className="hint"> {t("已结束")}</span> : null}
        <p className="team-goal" data-authored="1">{team.goal}</p>
        <p className="team-progress">
          {tf("{0} / {1} 完成", 完成, team.tasks.length)}
          {终 < team.tasks.length ? tf("，{0} 项未了", team.tasks.length - 终) : ""}
        </p>
      </header>

      <section className="team-members" aria-label={t("成员")}>
        <h3 className="team-section-title">{t("成员")}</h3>
        <ul>
          {team.members.map((m) => {
            const 手上 = team.tasks.find((x) => x.assignee === m.name && (x.status === "claimed" || x.status === "in_progress"))
            return (
              <li key={m.name} className={`team-member ${m.status}`} data-member={m.name} data-status={m.status}>
                <span className="team-member-name" data-authored="1">{m.name}</span>
                <span className="team-member-agent">{m.agent}{m.role ? ` · ${m.role}` : ""}{m.model ? ` · ${m.model}` : ""}</span>
                <span className={`team-member-status ${m.status}`}>
                  {m.status === "working" ? t("在跑") : m.status === "idle" ? t("空闲") : t("已移除")}
                  {手上 ? ` · ${手上.id}` : ""}
                  {m.turns ? tf(" · {0} 轮", m.turns) : ""}
                </span>
              </li>
            )
          })}
        </ul>
      </section>

      <section className="team-tasks" aria-label={t("任务")}>
        <h3 className="team-section-title">{t("任务")}</h3>
        <ol>
          {team.tasks.map((x) => {
            const 等 = x.dependencies.filter((d) => team.tasks.find((y) => y.id === d)?.status !== "completed")
            const open = 开着的 === x.id
            return (
              <li key={x.id} className={`team-task ${x.status}`} data-task={x.id} data-status={x.status}>
                <Button variant="ghost" size="inline" className="team-task-head" aria-expanded={open} onClick={() => 设开着的(open ? undefined : x.id)}>
                  <span className="team-task-id">{x.id}</span>
                  <span className="team-task-subject" data-authored="1">{x.subject}</span>
                  <span className={`team-task-status ${x.status}`}>{状态词(x.status)}</span>
                  {x.assignee ? <span className="team-task-who">@{x.assignee}</span> : null}
                  {x.dependencies.length ? <span className="team-task-deps">{tf("依赖 {0}", x.dependencies.join("、"))}{等.length && x.status === "pending" ? tf("（等 {0}）", 等.join("、")) : ""}</span> : null}
                  {x.attempt > 1 ? <span className="hint">{tf("第 {0} 次", x.attempt)}</span> : null}
                </Button>
                {open ? (
                  <div className="team-task-body">
                    {x.description ? <p className="team-task-desc" data-authored="1">{x.description}</p> : null}
                    {x.output ? <pre className="team-task-output" data-authored="1">{x.output}</pre> : <p className="hint">{t("还没有结果")}</p>}
                  </div>
                ) : null}
              </li>
            )
          })}
        </ol>
      </section>

      {信.length ? (
        <section className="team-mail" aria-label={t("消息")}>
          <h3 className="team-section-title">{t("消息")}</h3>
          <ul>
            {信.map((m) => (
              <li key={m.id} className="team-msg">
                <span className="team-msg-who">{m.from} → {m.to}</span>
                <span className="team-msg-text" data-authored="1">{m.content}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}
