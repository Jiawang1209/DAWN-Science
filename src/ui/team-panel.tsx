/**
 * 坞里的「团队」格（team-board，2026-08-22，学自 dsh-agent-teams 的活动面板——它是右上角浮层，我们有坞）。
 *
 * **按层次分**（2026-08-22 作者看完第一版：「太乱了，要分层次，基于不同的层级分类」）：
 * 第一层是**成员**，第二层是挂在它名下的**任务**，第三层是与它有关的**消息**——看一个成员就知道它做了什么、收到过什么。
 * 没人领的任务进「共享池」，队长自己做的归「队长」。成员行只留名字 · 人设 · 模型 · 状态；角色描述展开后一行。
 *
 * 画的是**磁盘真相的快照**，不轮询：快照随 `team` 更新推过来。没有团队就说没有，不画空壳。
 */
import { useState } from "react"
import { useStore } from "@nanostores/react"
import { $团队 } from "./state/index.js"
import { t, tf } from "./i18n/index.js"
import { Button } from "./primitives.js"
import { 三角图标 } from "./icons.js"
import type { TeamSnapshot } from "../protocol/index.js"

type 任务 = TeamSnapshot["tasks"][number]
type 成员 = TeamSnapshot["members"][number]
type 消息 = TeamSnapshot["messages"][number]

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
  const [收起的, 设收起的] = useState<ReadonlySet<string>>(new Set())
  const [开着的任务, 设开着的任务] = useState<string | undefined>(undefined)
  // 结束了的团队：成员卡默认收起（回看历史不用翻）；人点开哪张算哪张
  const [展开的, 设展开的] = useState<ReadonlySet<string>>(new Set())
  if (!team) return <p className="hint team-empty">{t("这段会话没有团队。对模型说「用团队分工做…」，或在输入框打 /team。")}</p>

  const 完成 = team.tasks.filter((x) => x.status === "completed").length
  const 终 = team.tasks.filter((x) => ["completed", "failed", "cancelled"].includes(x.status)).length
  const 切 = (k: string) => {
    const 翻 = (前: ReadonlySet<string>) => {
      const 新 = new Set(前)
      if (新.has(k)) 新.delete(k)
      else 新.add(k)
      return 新
    }
    if (team.finishedAt) 设展开的(翻)
    else 设收起的(翻)
  }

  // 分组：成员 → 它名下的任务 + 与它有关的消息；队长；共享池
  const 组: { key: string; 成员?: 成员; 题: string; 任务: 任务[]; 消息: 消息[] }[] = team.members.map((m) => ({
    key: m.name,
    成员: m,
    题: m.name,
    任务: team.tasks.filter((x) => x.assignee === m.name),
    消息: team.messages.filter((x) => x.from === m.name || x.to === m.name),
  }))
  const 队长的 = team.tasks.filter((x) => x.assignee === "captain")
  if (队长的.length) 组.push({ key: "captain", 题: t("队长自己做的"), 任务: 队长的, 消息: [] })
  const 池 = team.tasks.filter((x) => !x.assignee)
  if (池.length) 组.push({ key: "pool", 题: t("共享池（还没人领）"), 任务: 池, 消息: [] })

  return (
    <div className="team-panel" data-team={team.id} data-finished={team.finishedAt ? "1" : "0"}>
      <header className={`team-head team-card${team.finishedAt ? " finished" : ""}`}>
        <div className="team-head-row">
          <h2 className="team-name" data-authored="1">{team.name}</h2>
          <span className="team-progress">
            {tf("{0} / {1} 完成", 完成, team.tasks.length)}
            {终 < team.tasks.length ? tf("，{0} 项未了", team.tasks.length - 终) : ""}
            {team.finishedAt ? ` · ${t("已结束")}` : ""}
          </span>
        </div>
        {team.finishedAt ? null : <p className="team-goal" data-authored="1">{team.goal}</p>}
        {/* 一条细进度：完成的绿、失败/取消的灰、还没的空 */}
        <div className="team-bar" role="progressbar" aria-valuemin={0} aria-valuemax={team.tasks.length} aria-valuenow={完成} aria-label={t("任务进度")}>
          <span className="team-bar-done" style={{ width: `${team.tasks.length ? (完成 / team.tasks.length) * 100 : 0}%` }} />
          <span className="team-bar-dead" style={{ width: `${team.tasks.length ? ((终 - 完成) / team.tasks.length) * 100 : 0}%` }} />
        </div>
      </header>

      {组.map((g) => {
        const 收 = team.finishedAt ? !展开的.has(g.key) : 收起的.has(g.key)
        const m = g.成员
        const 手上 = m ? g.任务.find((x) => x.status === "claimed" || x.status === "in_progress") : undefined
        return (
          <section key={g.key} className={`team-group team-card${m ? ` ${m.status}` : " pool"}`} data-member={g.key} {...(m ? { "data-status": m.status } : {})}>
            <Button variant="ghost" size="inline" className="team-group-head" aria-expanded={!收} onClick={() => 切(g.key)}>
              <三角图标 className={`twisty${收 ? "" : " open"}`} />
              <span className="team-group-name" data-authored="1">{g.题}</span>
              {m ? (
                <>
                  <span className="team-member-agent">{m.agent}</span>
                  {m.model ? <span className="team-member-model">{m.model}</span> : null}
                  <span className={`team-member-status ${m.status}`}>
                    {m.status === "working" ? t("在跑") : m.status === "idle" ? t("空闲") : t("已移除")}
                    {手上 ? ` · ${手上.id}` : ""}
                    {m.turns ? tf(" · {0} 轮", m.turns) : ""}
                  </span>
                </>
              ) : (
                <span className="team-member-status">{tf("{0} 项", g.任务.length)}</span>
              )}
            </Button>
            {!收 ? (
              <div className="team-group-body">
                {m?.role ? <p className="team-member-role" data-authored="1">{m.role}</p> : null}
                {g.任务.length ? (
                  <ol className="team-tasks">
                    {g.任务.map((x) => {
                      const 等 = x.dependencies.filter((d) => team.tasks.find((y) => y.id === d)?.status !== "completed")
                      const open = 开着的任务 === x.id
                      return (
                        <li key={x.id} className={`team-task ${x.status}`} data-task={x.id} data-status={x.status}>
                          <Button variant="ghost" size="inline" className="team-task-head" aria-expanded={open} onClick={() => 设开着的任务(open ? undefined : x.id)}>
                            <span className="team-task-id">{x.id}</span>
                            <span className="team-task-subject" data-authored="1">{x.subject}</span>
                            <span className={`team-task-status ${x.status}`}>{状态词(x.status)}</span>
                            {x.dependencies.length ? (
                              <span className="team-task-deps">
                                {tf("依赖 {0}", x.dependencies.join("、"))}
                                {等.length && x.status === "pending" ? tf("（等 {0}）", 等.join("、")) : ""}
                              </span>
                            ) : null}
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
                ) : (
                  <p className="hint team-none">{t("没有任务")}</p>
                )}
                {g.消息.length ? (
                  <ul className="team-mail">
                    {g.消息.map((x) => (
                      <li key={x.id} className="team-msg">
                        <span className="team-msg-who">{x.from === g.key ? tf("→ {0}", x.to) : tf("← {0}", x.from)}</span>
                        <span className="team-msg-text" data-authored="1">{x.content}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
          </section>
        )
      })}
    </div>
  )
}
