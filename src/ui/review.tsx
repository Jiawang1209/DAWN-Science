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
import { useEffect, useMemo, useState } from "react"
import { Button, EmptyState, Loader } from "./primitives.js"
import { 拆统一diff } from "./diff.js"
import { t, tf } from "./i18n/index.js"

export interface 审阅数据 {
  baseline: "head" | "none"
  mayIncludeUserEdits: boolean
  tracked: { path: string; status: "modified" | "added" | "deleted"; added: number; removed: number; binary?: true }[]
  produced: { path: string }[]
}

const 状态字 = (s: 审阅数据["tracked"][number]["status"]) =>
  s === "added" ? t("新增") : s === "deleted" ? t("已删") : t("改动")

/** `fileDiff` 回来的那一份。**跟 `protocol/operations.ts` 一字不差** */
export interface 差异结果 {
  diff: string
  truncated?: { keptLines: number; totalLines: number }
  table?:
    | {
        kind: "diff"
        rows: { before: number; after: number; added: number; removed: number }
        columns: { kind: "added" | "removed" | "renamed"; name: string; from?: string }[]
        scaled: { column: string; factor: number }[]
        cells: { row: number; column: string; from: string; to: string }[]
        cellsTotal: number
        reordered?: true
      }
    | { kind: "skipped"; reason: string }
}

/**
 * 因子写成人看的样子。
 *
 * 浮点算出来的 `1000.0000000000001` 不该原样摆到屏幕上——**六位有效数字**
 * 足够分辨 1000 与 1024，又不会把浮点噪声当成事实展示出来。
 */
const 因子字 = (f: number) => String(Number(f.toPrecision(6)))

/**
 * **表格文件先说结论，再看逐行差异**（2026-08-18，作者选的甲）。
 *
 * 顺序是有意的：**整列缩放排在最前**——它正是逐行 diff 最说不清的那件事
 * （`g → mg` 在逐行 diff 里是「每一行都变了」，而真相是一句「乘了 1000」）。
 * 其次是列的增删改名，再次是行数，最后才是逐格。
 *
 * **什么都没得说时不画这张卡**：一张写着「0 处变化」的卡片，
 * 与下面那份 diff 摆在一起只会让人怀疑自己看错了。
 */
function 表格摘要卡({ 摘要 }: { 摘要: NonNullable<差异结果["table"]> }) {
  if (摘要.kind === "skipped") {
    // **比不动就说比不动**，不假装这个文件没有表格这一面（规格 7.5）
    return <p className="caveat">{摘要.reason}</p>
  }

  const 话: string[] = []
  if (摘要.reordered) {
    // 这一条一出现，别的就不必说了：**没有任何数据变**，只是顺序
    话.push(t("一行都没少，只是顺序变了。"))
  } else {
    for (const s of 摘要.scaled) 话.push(tf("「{0}」整列乘了 {1}", s.column, 因子字(s.factor)))
    for (const c of 摘要.columns) {
      if (c.kind === "renamed") 话.push(tf("列「{0}」改名成「{1}」", c.from ?? "", c.name))
      else if (c.kind === "added") 话.push(tf("新增列「{0}」", c.name))
      else 话.push(tf("删除列「{0}」", c.name))
    }
    if (摘要.rows.added > 0 || 摘要.rows.removed > 0) {
      话.push(tf("行数 {0} → {1}", 摘要.rows.before, 摘要.rows.after))
    }
    if (摘要.cellsTotal > 0) 话.push(tf("另有 {0} 处单元格变化", 摘要.cellsTotal))
  }

  if (话.length === 0) return null
  return (
    <div className="table-diff">
      <h4 className="table-diff-head">{t("这是一张表 —— 先说结论")}</h4>
      <ul className="table-diff-list">
        {话.map((句, i) => (
          <li key={i}>{句}</li>
        ))}
      </ul>
      {/**
        * **摘要不代替 diff，只排在它前面。** 判定是我们写的，可能认错；
        * 下面那份逐行差异是 git 给的，是原始事实。两个都在，人自己决定信哪个。
        */}
      <p className="hint">{t("下面是逐行差异。")}</p>
    </div>
  )
}

/**
 * 一段统一 diff。**逐行上色 + 一列行号**（排版量自 Codex，见 `diff.ts` 头注）。
 *
 * 行号那一列**横向滚动时钉住**：diff 里一行长起来是常事，
 * 而滚出去之后「这是第几行」正是最需要还在眼前的东西。
 */
function Diff({ 原文 }: { 原文: string }) {
  const 行 = useMemo(() => 拆统一diff(原文), [原文])
  return (
    <div className="diff">
      {行.map((r, i) => (
        <div key={i} className={`diff-row diff-${r.类型}`}>
          {/**
            * 行号是**画上去的**，不属于 diff 正文——`user-select: none`
            * 让复制出来的仍然是一段能打的 patch（样式在 `.diff-num`）。
            */}
          <span className="diff-num">{r.行号 ?? ""}</span>
          <span className="diff-text">{r.文本 || " "}</span>
        </div>
      ))}
    </div>
  )
}

export function ReviewPanel({
  data,
  onReload,
  loadDiff,
}: {
  data: 审阅数据 | undefined
  onReload: () => void
  loadDiff: (path: string) => Promise<差异结果>
}) {
  const [选中, 设选中] = useState<string | undefined>(undefined)
  const [差异, 设差异] = useState<差异结果 | undefined>(undefined)
  const [算差异出错, 设算差异出错] = useState<string | undefined>(undefined)

  useEffect(() => {
    onReload()
  }, [onReload])

  useEffect(() => {
    if (!选中) return
    设差异(undefined)
    设算差异出错(undefined)
    let 作废 = false
    void loadDiff(选中)
      .then((d) => {
        if (!作废) 设差异(d)
      })
      // **取不到 diff 要出声**（审查 debug J2）:不 catch 的话文件已删/git 报错时永久停在
      // 「正在算差异」的转圈上,外加一条 unhandled rejection。失败必须出声(规格 7.5)。
      .catch((e: unknown) => {
        if (!作废) 设算差异出错(e instanceof Error ? e.message : String(e))
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

  /** 选中那个文件在「仓库里的改动」里的那一条。文件头要用它的状态与增删行数 */
  const 选中的 = data.tracked.find((f) => f.path === 选中)

  return (
    /**
     * `picked` 那个类是**排版学 Codex 的那一半**（2026-08-18）：
     * 选中一个文件之后，上面那张文件表**限高并自己滚**，
     * 于是 diff 永远在**同一屏之内**，换一个文件不用把页面拖上去再拖下来。
     *
     * 没选中时不限高——那时整屏就该给那两张表。
     */
    <div className={`review${选中 ? " picked" : ""}`}>
      {/**
        * **归属告知**：本阶段没有 worktree 隔离，这一屏混着你自己手改的东西。
        * 跟 HEAD 比是累计口径，这一句因此更要紧，不是更次要。
        */}
      {/**
        * **归属告知只说一次**：旧的 `AttributionCaveat` 在同一个坞里
        * 说着同一件事，两处说同一件事正是本项目反复消除的东西。
        * 留这一句是因为**它离它解释的那些数最近**。
        */}
      {data.mayIncludeUserEdits ? (
        <p className="caveat">{t("跟上次提交比。这里可能包含你自己的修改——本阶段还分不清是谁改的。")}</p>
      ) : null}

      <div className="review-files">
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
        /**
         * **说清楚看不见的是哪一类**，不要只说「没有」。
         *
         * 这一栏的来源有两个：账本（内置工具记的）与科研约定目录里
         * 被 git 忽略的文件。**产物散在约定目录之外、又不是我们的工具写的**
         * ——那时它对两边都是隐形的，而人有权知道这个边界。
         */
        <p className="hint">{t("没有记到 git 看不见的产物。散在约定目录之外、又不是 DAWN 的工具写的东西，这里看不见。")}</p>
      ) : (
        <>
          <p className="caveat">{t("git 忽略了这些，所以上面那半看不到它们。它们来自账本，以及科研约定的那几个产物目录。")}</p>
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
      </div>

      {选中 ? (
        <section className="review-diff">
          {/**
            * **文件头**（排版学 Codex：`--codex-diffs-header-padding-*`
            * 与行共用同一个纵向内距）。
            *
            * 它与上面那张表用**同三个格子**：状态词、路径、`+n −m`——
            * 同一件事在两处只该有一种排法。
            *
            * **钉在顶上**：diff 长起来之后，「我在看哪个文件」是第一个滚没的东西。
            */}
          <header className="review-diff-head">
            {选中的 ? <span className={`review-status ${选中的.status}`}>{状态字(选中的.status)}</span> : null}
            <span className="review-path">{选中}</span>
            {选中的 ? (
              <span className="review-num">
                {选中的.binary ? t("二进制") : `+${选中的.added} −${选中的.removed}`}
              </span>
            ) : null}
          </header>
          {算差异出错 ? (
            <p className="caveat">{tf("算不出差异：{0}", 算差异出错)}</p>
          ) : !差异 ? (
            <Loader label={t("正在算差异")} inline />
          ) : 差异.diff === "" ? (
            // **空 diff 是一个答案**，不是出错：内容没变（比如只改了权限）
            <p className="hint">{t("内容没有变化。")}</p>
          ) : (
            <>
              {/** **表格的结论排在 diff 上面**：逐行 diff 在数据表上会骗人 */}
              {差异.table ? <表格摘要卡 摘要={差异.table} /> : null}
              <Diff 原文={差异.diff} />
              {差异.truncated ? (
                <p className="caveat">
                  {tf("差异太长，只显示了前 {0} 行（一共 {1} 行）。", 差异.truncated.keptLines, 差异.truncated.totalLines)}
                </p>
              ) : null}
            </>
          )}
        </section>
      ) : null}
    </div>
  )
}
