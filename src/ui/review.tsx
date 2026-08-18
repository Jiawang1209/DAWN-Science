/**
 * 审阅：**跟 `git HEAD` 比，这个项目改了什么**（2026-08-18）。
 *
 * 作者定的口径：*「和 Codex 一样，和 git HEAD 比」*。于是它答的是**累计**——
 * 从上次提交到现在，而不是「这一轮干了什么」。
 *
 * ## 为什么是两栏，而且必须分得开
 *
 * 上半是**仓库里的改动**（会被提交的），下半是**账本记得、git 看不见的产物**。
 * `out/`、`data/raw/` 这类目录写进 `.gitignore` 是科研仓库的常态，于是
 * 一次分析生成 40 张图，`git diff HEAD` 会说**什么都没变**——
 * **一个说「无变更」的审阅面板，而你刚跑完一整轮分析**，
 * 正是这个项目最忌讳的失效形状。
 *
 * 混成一张列表也不行：那样人判断不出哪些会进版本库。
 */
import { useEffect, useState } from "react"
import { Button, EmptyState, Loader } from "./primitives.js"
import { t, tf } from "./i18n/index.js"

export interface 审阅数据 {
  baseline: "head" | "none"
  mayIncludeUserEdits: boolean
  tracked: { path: string; status: "modified" | "added" | "deleted"; added: number; removed: number; binary?: true }[]
  produced: { path: string }[]
}

const 状态字 = (s: 审阅数据["tracked"][number]["status"]) =>
  s === "added" ? t("新增") : s === "deleted" ? t("已删") : t("改动")

/** 一段统一 diff。**逐行上色**，加与减分开——混在一起等于没上色 */
function Diff({ 原文 }: { 原文: string }) {
  const 行 = 原文.split("\n")
  return (
    <pre className="diff">
      {行.map((l, i) => (
        <span
          key={i}
          className={
            l.startsWith("+++") || l.startsWith("---")
              ? "diff-file"
              : l.startsWith("@@")
                ? "diff-hunk"
                : l.startsWith("+")
                  ? "diff-add"
                  : l.startsWith("-")
                    ? "diff-del"
                    : ""
          }
        >
          {l || " "}
          {"\n"}
        </span>
      ))}
    </pre>
  )
}

export function ReviewPanel({
  data,
  onReload,
  loadDiff,
}: {
  data: 审阅数据 | undefined
  onReload: () => void
  loadDiff: (path: string) => Promise<{ diff: string; truncated?: { keptLines: number; totalLines: number } }>
}) {
  const [选中, 设选中] = useState<string | undefined>(undefined)
  const [差异, 设差异] = useState<{ diff: string; truncated?: { keptLines: number; totalLines: number } } | undefined>(undefined)

  useEffect(() => {
    onReload()
  }, [onReload])

  useEffect(() => {
    if (!选中) return
    设差异(undefined)
    let 作废 = false
    void loadDiff(选中).then((d) => {
      if (!作废) 设差异(d)
    })
    return () => {
      作废 = true
    }
  }, [选中, loadDiff])

  if (!data) return <Loader label={t("正在算变更")} />

  /**
   * **没有基线要如实说「不知道」**，不画一个空列表。
   * 空列表读作「什么都没改」，而真相是我们答不上来。
   */
  if (data.baseline === "none") {
    return (
      <EmptyState
        title={t("这个工作区不是 git 仓库")}
        description={t("没有基线，DAWN 不替它猜「改了什么」。下面那半仍然来自账本。")}
      />
    )
  }

  return (
    <div className="review">
      {/**
        * **归属告知**：本阶段没有 worktree 隔离，这一屏混着你自己手改的东西。
        * 跟 HEAD 比是累计口径，这一句因此更要紧，不是更次要。
        */}
      {data.mayIncludeUserEdits ? (
        <p className="caveat">{t("跟上次提交比。这里可能包含你自己的修改——本阶段还分不清是谁改的。")}</p>
      ) : null}

      <h3 className="review-head">{t("仓库里的改动")}</h3>
      {data.tracked.length === 0 ? (
        <p className="hint">{t("跟上次提交比，仓库里没有改动。")}</p>
      ) : (
        <ul className="review-list">
          {data.tracked.map((f) => (
            <li key={f.path}>
              <Button
                variant="ghost"
                size="inline"
                className={`review-item${选中 === f.path ? " current" : ""}`}
                onClick={() => 设选中(f.path)}
              >
                <span className={`review-status ${f.status}`}>{状态字(f.status)}</span>
                <span className="review-path">{f.path}</span>
                {/* 二进制文件给不出行数——**说清是「二进制」，不写 +0 −0** */}
                <span className="review-num">
                  {f.binary ? t("二进制") : `+${f.added} −${f.removed}`}
                </span>
              </Button>
            </li>
          ))}
        </ul>
      )}

      <h3 className="review-head">{t("这次跑出来的产物")}</h3>
      {data.produced.length === 0 ? (
        <p className="hint">{t("账本里没有 git 看不见的产物。")}</p>
      ) : (
        <>
          <p className="caveat">{t("git 忽略了这些，所以上面那半看不到它们——账本记得。")}</p>
          <ul className="review-list">
            {data.produced.map((f) => (
              <li key={f.path}>
                <span className="review-item">
                  <span className="review-status produced">{t("产物")}</span>
                  <span className="review-path">{f.path}</span>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      {选中 ? (
        <div className="review-diff">
          <h3 className="review-head">{选中}</h3>
          {!差异 ? (
            <Loader label={t("正在算差异")} inline />
          ) : 差异.diff === "" ? (
            // **空 diff 是一个答案**，不是出错：内容没变（比如只改了权限）
            <p className="hint">{t("内容没有变化。")}</p>
          ) : (
            <>
              <Diff 原文={差异.diff} />
              {差异.truncated ? (
                <p className="caveat">
                  {tf("差异太长，只显示了前 {0} 行（一共 {1} 行）。", 差异.truncated.keptLines, 差异.truncated.totalLines)}
                </p>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </div>
  )
}
