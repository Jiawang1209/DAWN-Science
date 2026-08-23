/**
 * 坞里的「团队」格（team-board，2026-08-22；**2026-08-23 照 dsh-agent-teams 的活动面板重画**——作者拿着它的截图说「我也要有这个类似的 team 页面」）。
 *
 * 自上而下六段，与它同一副骨架：
 * ① 标题行：团队名 · 已结束 · N 成员 / 完成 / 消息；
 * ② 队长卡：头像 · 「队长 拆解 · 派发 · 汇总」· 已派发几项给几人 · 右边在跑 / 已收齐；
 * ③ 总进度：**一任务一段**的分段条（在跑 / 等待依赖 / 已交付）+ 图例 + 一句总结；
 * ④ 成员树：左边一条竖线分叉到每个成员；头像（首字 + 按名字稳定取色）· 名字 · 人设 · 右边「已交付 2/2」；
 *    第二行一句状态；第三行「队长派发」的任务芯片。**点开一个成员仍是我们原来那份分层**（任务 + 消息 + 输出）——这块我们比它多；
 * ⑤ 任务依赖：按依赖深度分列的小 DAG，悬停高亮上下游、点击固定，下面一行选中任务的详情；
 * ⑥ 没人领的进「共享池」、队长自己做的归「队长」。
 *
 * 它是右上角能拖的浮层，**我们有坞**，照旧住坞里。头像它用美术图，我们用首字——它自己没图时也这么回落。
 * 画的是**磁盘真相的快照**，不轮询：快照随 `team` 更新推过来。没有团队就说没有，不画空壳。
 */
import { useEffect, useMemo, useRef, useState } from "react"
import { useStore } from "@nanostores/react"
import { $团队 } from "./state/index.js"
import { t, tf } from "./i18n/index.js"
import { Button } from "./primitives.js"
import { 三角图标 } from "./icons.js"
import type { TeamSnapshot } from "../protocol/index.js"
import { 任务的态, 分列布局, 相关任务, 短标题, 色号, 首字, 节点宽, 节点高, type 任务, type 任务态 } from "./team-dag.js"

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

function 态词(s: 任务态): string {
  switch (s) {
    case "running":
      return t("进行中")
    case "blocked":
      return t("等待依赖")
    case "open":
      return t("可领")
    case "completed":
      return t("已交付")
    case "dead":
      return t("未交付")
  }
}

function Avatar({ name, 队长 }: { name: string; 队长?: boolean }) {
  return (
    <span className={`team-avatar${队长 ? " captain" : ""}`} data-hue={队长 ? undefined : 色号(name)} aria-hidden="true">
      {队长 ? t("队") : 首字(name)}
    </span>
  )
}

/** ③ 总进度 */
function 总进度({ tasks }: { tasks: readonly 任务[] }) {
  const 态 = tasks.map((x) => 任务的态(x, tasks))
  const 数 = (s: 任务态) => 态.filter((x) => x === s).length
  const 完成 = 数("completed")
  const 总结 =
    tasks.length === 0
      ? t("还在拆任务")
      : 完成 === tasks.length
        ? tf("全部 {0} 项任务已交付", tasks.length)
        : 数("running") > 0
          ? tf("{0} 在做", tasks.filter((x, i) => 态[i] === "running").map((x) => x.id).join("、"))
          : 数("blocked") > 0
            ? tf("{0} 等着上游", tasks.filter((x, i) => 态[i] === "blocked").map((x) => x.id).join("、"))
            : 数("open") > 0
              ? tf("{0} 等人领", tasks.filter((x, i) => 态[i] === "open").map((x) => x.id).join("、"))
              : t("等队长安排")
  return (
    <section className="team-progress-block" aria-label={t("任务进度")}>
      <span className="team-progress-title">{t("总进度")}</span>
      {/* 一任务一段——6 项就 6 段，一眼数得出 */}
      <span className="team-segments" role="progressbar" aria-valuemin={0} aria-valuemax={tasks.length} aria-valuenow={完成}>
        {tasks.map((x, i) => (
          <span key={x.id} data-state={态[i]} title={`${x.id} · ${态词(态[i]!)}`} />
        ))}
      </span>
      <span className="team-legend">
        <span data-state="running">{tf("进行中 {0}", 数("running"))}</span>
        <span data-state="blocked">{tf("等待依赖 {0}", 数("blocked"))}</span>
        <span data-state="completed">{tf("已交付 {0}", 完成)}</span>
      </span>
      <span className="team-summary team-progress" data-state={数("blocked") > 0 ? "blocked" : 完成 === tasks.length && tasks.length > 0 ? "completed" : "running"}>
        <span className="team-summary-dot" />
        <span>
          {总结}
          {/* e2e 盯着「2 / 2 完成」这句，留着 */}
          <span className="sr-only">{tf("{0} / {1} 完成", 完成, tasks.length)}</span>
        </span>
      </span>
    </section>
  )
}

/** ⑤ 任务依赖 */
function 依赖图({ tasks }: { tasks: readonly 任务[] }) {
  const [开, 设开] = useState(true)
  const [悬, 设悬] = useState<string | undefined>(undefined)
  const [钉, 设钉] = useState<string | undefined>(undefined)
  const 计时 = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const 布局 = useMemo(() => 分列布局(tasks), [tasks])
  const 焦点 = 钉 ?? 悬
  const 相关 = useMemo(() => (焦点 ? 相关任务(焦点, tasks) : undefined), [焦点, tasks])
  useEffect(() => () => clearTimeout(计时.current), [])
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && 设钉(undefined)
    window.addEventListener("keydown", k)
    return () => window.removeEventListener("keydown", k)
  }, [])
  if (tasks.length === 0) return null
  const 悬一下 = (id: string | undefined) => {
    clearTimeout(计时.current)
    if (!id) {
      设悬(undefined)
      return
    }
    计时.current = setTimeout(() => 设悬(id), 180)
  }
  const 态们 = new Map(tasks.map((x) => [x.id, 任务的态(x, tasks)]))
  const 兜底 = tasks.find((x) => 态们.get(x.id) === "blocked") ?? tasks.find((x) => 态们.get(x.id) === "running") ?? tasks[0]!
  const 详 = tasks.find((x) => x.id === 焦点) ?? 兜底
  const 等 = 详.dependencies.filter((d) => tasks.find((x) => x.id === d)?.status !== "completed")
  const 下游 = tasks.filter((x) => x.dependencies.includes(详.id))
  return (
    <section className="team-deps" aria-label={t("任务依赖")}>
      <header className="team-section-head">
        <Button variant="ghost" size="inline" className="team-section-toggle" aria-expanded={开} onClick={() => 设开((v) => !v)}>
          <三角图标 className={`twisty${开 ? " open" : ""}`} />
          {布局.平行 ? t("任务（并行）") : t("任务依赖")}
        </Button>
        <span className="hint">{钉 ? tf("固定在 {0}，Esc 松开", 钉) : 布局.平行 ? t("彼此不依赖，可同时做") : t("悬停高亮链路 · 点击固定")}</span>
      </header>
      {开 ? (
        <>
          <div className="team-dag-viewport">
            <div className="team-dag" data-layout={布局.平行 ? "parallel" : "dag"} style={布局.平行 ? undefined : { width: 布局.width, height: 布局.height }}>
              {!布局.平行 ? (
                <svg className="team-dag-edges" width={布局.width} height={布局.height} aria-hidden="true">
                  {布局.edges.map((e) => {
                    const 亮 = Boolean(相关 && 相关.has(e.from) && 相关.has(e.to))
                    return <path key={`${e.from}:${e.to}`} d={e.path} data-active={亮 ? "1" : undefined} data-dimmed={相关 && !亮 ? "1" : undefined} />
                  })}
                </svg>
              ) : null}
              {布局.nodes.map(({ task, x, y }) => (
                <Button
                  key={task.id}
                  variant="ghost"
                  size="inline"
                  className="team-dag-node"
                  style={布局.平行 ? { height: 节点高 } : { left: x, top: y, width: 节点宽, height: 节点高 }}
                  data-task-id={task.id}
                  data-state={态们.get(task.id)}
                  data-focused={相关?.has(task.id) ? "1" : undefined}
                  data-dimmed={相关 && !相关.has(task.id) ? "1" : undefined}
                  aria-pressed={钉 === task.id}
                  aria-label={`${task.id} · ${task.subject}`}
                  onClick={() => 设钉((c) => (c === task.id ? undefined : task.id))}
                  onMouseEnter={() => 悬一下(task.id)}
                  onMouseLeave={() => 悬一下(undefined)}
                  onFocus={() => 设悬(task.id)}
                  onBlur={() => 设悬(undefined)}
                >
                  <span className="team-dag-node-head">
                    <span className="team-dag-dot" />
                    {task.id}
                  </span>
                  <span className="team-dag-node-label" data-authored="1">{短标题(task.subject)}</span>
                </Button>
              ))}
            </div>
          </div>
          <div className="team-task-detail" data-task-detail={详.id}>
            <span className="team-task-detail-head">
              <span className="team-task-id">{详.id}</span>
              <span className="team-task-detail-subject" data-authored="1">{详.subject}</span>
              <span className="team-badge" data-state={态们.get(详.id)}>{态词(态们.get(详.id)!)}</span>
            </span>
            <span className="hint">
              {详.assignee === "captain" ? t("队长") : (详.assignee ?? t("还没人领"))} ·{" "}
              {详.status === "completed" ? t("已完成") : 详.dependencies.length === 0 ? t("没有前置") : 等.length === 0 ? t("前置已齐，可以做") : tf("等 {0}", 等.join("、"))}
              {" · "}
              {下游.length === 0 ? t("后面没有人等它") : tf("做完解锁 {0}", 下游.map((x) => x.id).join("、"))}
            </span>
          </div>
        </>
      ) : null}
    </section>
  )
}

export function TeamPanel() {
  const team = useStore($团队)
  const [收起的, 设收起的] = useState<ReadonlySet<string>>(new Set())
  const [开着的任务, 设开着的任务] = useState<string | undefined>(undefined)
  const [展开的, 设展开的] = useState<ReadonlySet<string>>(new Set())
  const [成员开, 设成员开] = useState(true)
  if (!team) return <p className="hint team-empty">{t("这段会话没有团队。对模型说「用团队分工做…」，或在输入框打 /team。")}</p>

  const tasks = team.tasks
  const 完成 = tasks.filter((x) => x.status === "completed").length
  const 在跑的成员 = team.members.filter((m) => m.status === "working").length
  const 派了 = tasks.filter((x) => x.assignee && x.assignee !== "captain").length
  const 全交 = tasks.length > 0 && 完成 === tasks.length
  // 成员默认收起（它那张图就是这样：一行 + 派发芯片已经够看），点开才是任务 + 消息 + 输出；队长自己的 / 共享池默认开着
  const 切 = (k: string) => {
    const 翻 = (前: ReadonlySet<string>) => {
      const 新 = new Set(前)
      if (新.has(k)) 新.delete(k)
      else 新.add(k)
      return 新
    }
    if (k === "captain" || k === "pool") 设收起的(翻)
    else 设展开的(翻)
  }
  const 开着 = (k: string) => (k === "captain" || k === "pool" ? !收起的.has(k) : 展开的.has(k))

  const 任务列表 = (组任务: 任务[]) => (
    <ol className="team-tasks">
      {组任务.map((x) => {
        const 等 = x.dependencies.filter((d) => tasks.find((y) => y.id === d)?.status !== "completed")
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
  )
  const 消息列表 = (k: string, 消息们: 消息[]) =>
    消息们.length ? (
      <ul className="team-mail">
        {消息们.map((x) => (
          <li key={x.id} className="team-msg">
            <span className="team-msg-who">{x.from === k ? tf("→ {0}", x.to) : tf("← {0}", x.from)}</span>
            <span className="team-msg-text" data-authored="1">{x.content}</span>
          </li>
        ))}
      </ul>
    ) : null

  /** 成员那一行右边的短状态 + 第二行那句 */
  const 成员状态 = (m: 成员, 名下: 任务[]) => {
    const 手上 = 名下.find((x) => x.status === "claimed" || x.status === "in_progress")
    const 交 = 名下.filter((x) => x.status === "completed").length
    const 短 = m.status === "removed" ? t("已移除") : 手上 ? tf("在做 {0}", 手上.id) : 名下.length && 交 === 名下.length ? t("已交付") : m.status === "working" ? t("在跑") : t("空闲")
    const 长 =
      m.status === "removed"
        ? t("队长把它移出了队伍")
        : 手上
          ? 手上.subject
          : 名下.length === 0
            ? t("还没有派给它的任务")
            : 交 === 名下.length
              ? t("任务已交付")
              : tf("交付了 {0} 项，还有 {1} 项", 交, 名下.length - 交)
    return { 短, 长, 交 }
  }

  const 队长的 = tasks.filter((x) => x.assignee === "captain")
  const 池 = tasks.filter((x) => !x.assignee)

  return (
    <div className="team-panel" data-team={team.id} data-finished={team.finishedAt ? "1" : "0"}>
      {/* ① 标题行 */}
      <header className="team-head">
        <h2 className="team-name" data-authored="1">{team.name}</h2>
        {team.finishedAt ? <span className="team-pill">{t("已结束")}</span> : null}
        <span className="team-stats">
          <span>{tf("{0} 成员", team.members.length)}</span>
          <span>{tf("{0}/{1} 完成", 完成, tasks.length)}</span>
          <span>{tf("{0} 消息", team.messages.length)}</span>
        </span>
      </header>
      {team.finishedAt ? null : <p className="team-goal" data-authored="1">{team.goal}</p>}

      {/* ② 队长卡 */}
      <div className="team-captain">
        <Avatar name="captain" 队长 />
        <span className="team-captain-info">
          <span className="team-captain-line">
            <span className="team-captain-name">{t("队长")}</span>
            <span className="hint">{t("拆解 · 派发 · 汇总")}</span>
          </span>
          <span className="hint">{tf("已派发 {0} 项任务给 {1} 名成员", 派了, team.members.length)}</span>
        </span>
        <span className="team-captain-state" data-busy={在跑的成员 > 0 ? "1" : "0"}>
          {在跑的成员 > 0 ? tf("在跑 {0}", 在跑的成员) : 全交 ? t("已收齐") : t("等成员交付")}
        </span>
      </div>

      {/* ③ 总进度 */}
      <总进度 tasks={tasks} />

      {/* ④ 成员树 */}
      <Button variant="ghost" size="inline" className="team-members-toggle" aria-expanded={成员开} onClick={() => 设成员开((v) => !v)}>
        <span>
          <三角图标 className={`twisty${成员开 ? " open" : ""}`} />
          {tf("成员 {0}", team.members.length)}
        </span>
        <span className="hint">{成员开 ? t("收起") : t("展开")}</span>
      </Button>
      {成员开 ? (
        <div className="team-tree">
          {team.members.length === 0 ? <p className="hint team-none">{t("队长还没叫人")}</p> : null}
          {team.members.map((m) => {
            const 名下 = tasks.filter((x) => x.assignee === m.name)
            const 消息们 = team.messages.filter((x) => x.from === m.name || x.to === m.name)
            const { 短, 长, 交 } = 成员状态(m, 名下)
            const 展 = 开着(m.name)
            return (
              <section key={m.name} className={`team-group team-member ${m.status}`} data-member={m.name} data-status={m.status}>
                <span className="team-branch" aria-hidden="true" />
                <Button variant="ghost" size="inline" className="team-group-head team-member-row" aria-expanded={展} onClick={() => 切(m.name)}>
                  <Avatar name={m.name} />
                  <span className="team-member-info">
                    <span className="team-member-line">
                      <span className="team-group-name" data-authored="1">{m.name}</span>
                      <span className="team-member-agent">{m.agent}</span>
                      {m.model ? <span className="team-member-model">{m.model}</span> : null}
                    </span>
                    <span className="team-member-status-line hint" data-authored="1">{长}</span>
                  </span>
                  <span className={`team-member-status ${m.status}`}>
                    <span>{短}</span>
                    <span className="team-member-count">{名下.length ? `${交}/${名下.length}` : ""}</span>
                  </span>
                </Button>
                <div className="team-assign">
                  <span className="hint">{t("队长派发")}</span>
                  {名下.length === 0 ? (
                    <span className="hint">{t("—")}</span>
                  ) : (
                    名下.map((x) => (
                      <span key={x.id} className="team-chip" data-state={任务的态(x, tasks)} title={x.subject}>
                        {x.id}
                      </span>
                    ))
                  )}
                </div>
                {展 ? (
                  <div className="team-group-body">
                    <p className="team-member-role">
                      {m.role ? <span data-authored="1">{m.role}</span> : null}
                      {m.turns ? <span className="hint">{tf(" · {0} 轮", m.turns)}</span> : null}
                    </p>
                    {名下.length ? 任务列表(名下) : <p className="hint team-none">{t("没有任务")}</p>}
                    {消息列表(m.name, 消息们)}
                  </div>
                ) : null}
              </section>
            )
          })}
        </div>
      ) : null}

      {/* ⑥ 队长自己做的 / 共享池 */}
      {队长的.length ? (
        <section className="team-group team-side" data-member="captain">
          <Button variant="ghost" size="inline" className="team-group-head" aria-expanded={开着("captain")} onClick={() => 切("captain")}>
            <三角图标 className={`twisty${开着("captain") ? " open" : ""}`} />
            <span className="team-group-name">{t("队长自己做的")}</span>
            <span className="team-member-status">{tf("{0} 项", 队长的.length)}</span>
          </Button>
          {开着("captain") ? <div className="team-group-body">{任务列表(队长的)}</div> : null}
        </section>
      ) : null}
      {池.length ? (
        <section className="team-group team-side pool" data-member="pool">
          <Button variant="ghost" size="inline" className="team-group-head" aria-expanded={开着("pool")} onClick={() => 切("pool")}>
            <三角图标 className={`twisty${开着("pool") ? " open" : ""}`} />
            <span className="team-group-name">{t("共享池（还没人领）")}</span>
            <span className="team-member-status">{tf("{0} 项", 池.length)}</span>
          </Button>
          {开着("pool") ? <div className="team-group-body">{任务列表(池)}</div> : null}
        </section>
      ) : null}

      {/* ⑤ 任务依赖 */}
      <依赖图 tasks={tasks} />
    </div>
  )
}
