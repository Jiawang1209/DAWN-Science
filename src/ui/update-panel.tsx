/**
 * 「有新版本」这件事在界面上的两处（规格 U1）：**侧栏底部一行** + **设置里的「关于」一格**。
 *
 * 两处读同一份状态（`更新回执`），没有一处自己算。
 *
 * ## 侧栏那一行为什么带文字
 *
 * 这个项目在 2026-08-10 一天之内栽过两次：「新建项目」是个没有标签的 `＋`，
 * 删除键是 `opacity: 0` 的裸 `×`——两次作者的反馈都是「没有这个功能」，而两次代码都是好的。
 * 所以这一行**常驻、带版本号、不靠悬停**。
 *
 * ## 为什么「不再提醒」之后侧栏没了、关于里还在
 *
 * 忽略的意思是「别在侧栏烦我」，不是「把这件事从世界上抹掉」。
 * 关于那一格里照样写着 0.0.3 已发布——人回头想找它时找得到。
 */
import { useState } from "react"
import { Button } from "./primitives.js"
import { 上箭头图标 } from "./icons.js"
import { t, tf } from "./i18n/index.js"
import type { 更新状态 } from "../protocol/index.js"

export interface 更新回执 {
  状态: 更新状态
  自动检查: boolean
}

export interface 更新动作 {
  检查(): void
  下载(): void
  取消(): void
  装(): void
  忽略(版本: string): void
  设自动(开: boolean): void
  开链接(url: string): void
}

/** `v0.0.3` → `0.0.3`。tag 上带 v，界面上不带 */
const 号 = (v: string) => v.replace(/^v/, "")

const 好读的大小 = (字节: number) => `${(字节 / 1e6).toFixed(0)} MB`

/* ── 侧栏底部那一行 ──────────────────────────────────────────────── */

/**
 * 只有**这三个阶段**才在侧栏出现：有新版、正在下、下好了。
 * `latest` 不出现（没事就别占地方）、`ignored` 不出现（人说了别烦）、
 * `failed` 不出现——**自动那次查失败不打扰人**（规格 U2），它在关于那一格里说。
 */
export function 更新侧栏行({ 回执, 动作 }: { 回执: 更新回执 | undefined; 动作: 更新动作 }) {
  const [开着, 设开着] = useState(false)
  const s = 回执?.状态
  /**
   * **人自己按过的那两步失败了，侧栏必须看得见**（2026-09-06 真机演练逼出来的）：
   * 那一次换包失败，而 `failed` 不在侧栏出现，于是屏幕上什么都没剩下——
   * 症状是「点了没反应」，这个项目最不该再犯的一种。
   *
   * 自动查失败照旧不出现（规格 U2）：没人要求过它，不该打扰。
   */
  const 人按过的失败 = s?.阶段 === "failed" && s.失败于 !== "检查"
  if (
    !s ||
    (s.阶段 !== "available" && s.阶段 !== "downloading" && s.阶段 !== "ready" && !人按过的失败)
  ) {
    return null
  }

  if (s.阶段 === "failed") {
    return (
      <div className="update-entry">
        <Button
          variant="ghost"
          size="inline"
          className="row update-row"
          onClick={动作.检查}
        >
          <上箭头图标 className="update-dot" />
          <span className="update-title">{tf("{0}没成，点这里重来", s.失败于)}</span>
        </Button>
        <p className="update-why">{s.原话}</p>
      </div>
    )
  }

  const 标题 =
    s.阶段 === "downloading"
      ? tf("正在下载 {0}", 号(s.版本))
      : s.阶段 === "ready"
        ? tf("{0} 已就绪", 号(s.版本))
        : tf("有新版本 {0}", 号(s.版本))

  return (
    <div className="update-entry">
      <Button
        variant="ghost"
        size="inline"
        className={`row update-row${开着 ? " active" : ""}`}
        aria-expanded={开着}
        onClick={() => 设开着((x) => !x)}
      >
        <上箭头图标 className="update-dot" />
        <span className="update-title">{标题}</span>
      </Button>
      {开着 ? <更新卡片 状态={s} 动作={动作} /> : null}
    </div>
  )
}

function 更新卡片({ 状态, 动作 }: { 状态: 更新状态; 动作: 更新动作 }) {
  if (状态.阶段 === "downloading") {
    const 百分 = 状态.共 > 0 ? Math.round((状态.已下 / 状态.共) * 100) : 0
    return (
      <div className="update-card">
        <progress className="update-bar" value={状态.已下} max={状态.共 || 1} />
        <p className="update-sub">
          {tf("{0}% · {1} / {2}", String(百分), 好读的大小(状态.已下), 好读的大小(状态.共))}
        </p>
        {/* 后台下，不挡着干活——这句是给人看的承诺，不是装饰 */}
        <p className="update-sub">{t("在后台下，你接着干活")}</p>
        <Button onClick={动作.取消}>{t("中止更新")}</Button>
      </div>
    )
  }
  if (状态.阶段 === "ready") {
    return <就绪卡 状态={状态} 动作={动作} />
  }
  if (状态.阶段 !== "available" && 状态.阶段 !== "ignored") return null
  return (
    <div className="update-card">
      <p className="update-head">{tf("{0} 已发布 · 你在 {1}", 号(状态.版本), 号(状态.当前))}</p>
      {状态.安装.能 ? (
        <Button variant="primary" onClick={动作.下载}>
          {tf("更新到 {0}", 号(状态.版本))}
        </Button>
      ) : (
        <>
          {/* 装不了时**主按钮换成下载页**，并且把原因原样摆出来——
              报成一句笼统的「更新失败」，人第一反应是去查网络，而问题在别处 */}
          <Button variant="primary" onClick={() => 动作.开链接(状态.页面)}>
            {t("打开发布页")}
          </Button>
          <p className="update-why">{状态.安装.因为}</p>
        </>
      )}
      <Button variant="ghost" size="inline" className="update-link" onClick={() => 动作.开链接(状态.页面)}>
        {t("查看发布说明")}
      </Button>
      {状态.阶段 === "available" ? (
        <Button variant="ghost" size="inline" className="update-link" onClick={() => 动作.忽略(状态.版本)}>
          {t("这一版不再提醒")}
        </Button>
      ) : null}
    </div>
  )
}

/**
 * 下好了那张卡。
 *
 * **点过之后按钮要当场变样**：解一个 223 MB 的 zip 要十几秒，
 * 这期间界面一动不动的话，人会以为没点上而再点一次——而两次换包同时跑，
 * 第二次的「备份旧的」会把刚换上去的新版挪走。后端也挡着这一下（服务里的 `装着`），
 * 但**让人看见正在发生什么**比挡住更重要。
 */
function 就绪卡({ 状态, 动作 }: { 状态: 更新状态 & { 阶段: "ready" }; 动作: 更新动作 }) {
  const [装着, 设装着] = useState(false)
  return (
    <div className="update-card">
      <p className="update-head">{tf("{0} 已下好，装上要重启一次", 号(状态.版本))}</p>
      {/* **不自动重启**（规格 U4）：这台机器上随时有内核跑着、有远端会话连着 */}
      <Button
        variant="primary"
        disabled={装着}
        onClick={() => {
          设装着(true)
          动作.装()
        }}
      >
        {装着 ? t("正在装，装完会自己重开…") : t("重启并更新")}
      </Button>
    </div>
  )
}

/* ── 设置 → 关于 ─────────────────────────────────────────────────── */

/**
 * **永远在**，没有新版时也在：它是「我装的是哪一版」唯一说得出口的地方，
 * 也是手动查一次的入口。手动那次失败**必须在这里出声**（规格 7.5）——
 * 那是人刚刚亲手要的。
 */
export function 关于一格({
  回执,
  动作,
  查着,
}: {
  回执: 更新回执 | undefined
  动作: 更新动作
  /** 正在查（按钮要变灰，不然人会连点） */
  查着?: boolean
}) {
  const s = 回执?.状态
  return (
    <div className="about-pane">
      <div className="about-row">
        <span className="about-name">{t("当前版本")}</span>
        <span className="about-ver">{s ? 号(s.当前) : "—"}</span>
        <Button onClick={动作.检查} disabled={查着 === true}>
          {查着 ? t("正在检查…") : t("检查更新")}
        </Button>
      </div>
      <p className="about-say">{一句话(s)}</p>
      <label className="about-auto">
        <input
          type="checkbox"
          checked={回执?.自动检查 ?? true}
          onChange={(e) => 动作.设自动(e.target.checked)}
        />
        {t("启动时自动检查更新")}
      </label>
      {s && (s.阶段 === "available" || s.阶段 === "ignored" || s.阶段 === "ready") ? (
        <Button variant="ghost" size="inline" className="update-link" onClick={() => 动作.开链接(s.页面)}>
          {t("查看发布说明")}
        </Button>
      ) : null}
    </div>
  )
}

function 一句话(s: 更新状态 | undefined): string {
  if (!s) return t("还没查过")
  switch (s.阶段) {
    case "idle":
      return t("还没查过")
    case "checking":
      return t("正在检查…")
    case "latest":
      return t("已是最新")
    case "available":
      return tf("{0} 已发布", 号(s.版本))
    // 忽略不是抹掉：这里照样说得出它存在
    case "ignored":
      return tf("{0} 已发布（你选择了这一版不再提醒）", 号(s.版本))
    case "downloading":
      return tf("正在下载 {0}", 号(s.版本))
    case "ready":
      return tf("{0} 已下好，等着重启", 号(s.版本))
    // **原话原样摆出来**：「查不到」和「查不到，因为 GitHub 回了 403」是两种东西
    case "failed":
      return tf("查不到：{0}", s.原话)
  }
}
