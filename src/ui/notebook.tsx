/**
 * 笔记本（Task 6，2026-08-26）：把转录里「你自己敲的」与「agent 跑的」代码执行，
 * 派生成一叠 cell。
 *
 * 纯函数派生（`cells()`）2026-08-27 搬去了 `src/protocol/notebook-cells.ts`（后端导出 .ipynb 也要用它），
 * 这里只剩坐在它上面的面板（`NotebookPanel`，Task 7）；`cells` / `Cell` 从这里 re-export，调用点不动。
 */
import { useCallback, useEffect, useState, type KeyboardEvent } from "react"
import { StickToBottom } from "use-stick-to-bottom"
import type { KernelState } from "../protocol/index.js"
import { Button, EmptyState, 导出提示, type 导出提示态 } from "./primitives.js"
import { InterpreterPicker } from "./interpreter-picker.js"
import { KernelOutputRow } from "./views.js"
import { t, tf } from "./i18n/index.js"
/**
 * 探测结果的形状**只有一份**，住在首启向导里（它先有的）。这里是 `import type`——
 * 编译期就擦掉，笔记本格不会因此把向导拖进来。再抄一份结构一样的类型只会让两边慢慢走散。
 */
import type { 探测结果 } from "./setup-wizard.js"

export { cells, type Cell, type 语言 } from "../protocol/notebook-cells.js"
import type { Cell, 语言 } from "../protocol/notebook-cells.js"

// ───────────────────────── 面板（Task 7，spec §5/§6） ─────────────────────────

const 语言名: Record<语言, string> = { python: "Python", R: "R" }

/** 胶囊上的状态词。**「未起」不是一个状态**——没挂的内核压根不画胶囊 */
function 状态词(state: KernelState["state"]): string {
  switch (state) {
    case "starting":
      return t("正在起")
    case "idle":
      return t("空闲")
    case "busy":
      return t("运行中")
    case "exited":
      return t("已退出")
  }
}

function 时刻(ms: number): string {
  return new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
}

/**
 * 坞「笔记本」格。
 *
 * - 头：每台**挂着的**内核一颗胶囊；只有 `busy` 的旁边才有「中断」；右边「变量 →」交给外面切面板。
 * - 非 native 会话：整格一句「这种会话没有内核，笔记本不可用」，不画空清单也不画输入框。
 * - 没内核也没 cell：输入框上方一句「这段对话还没有内核」——输入框照常可用，敲一句就会起内核。
 * - 有 cell 但内核缺省 / 全退出：顶上提示条「内核已重起…」——上面 cell 的变量已经不在了，别让它们看起来像当前状态。
 * - 输出复用 `KernelOutputRow`，**不传 `currentKernel`**：笔记本里不标陈旧，胶囊已经说明了状态。
 * - 输入草稿与语言是本地状态，**按会话 key 重挂**（外面负责给 key），不持久化。
 */
export function NotebookPanel({
  sessionKind,
  remoteLabel,
  remoteInterpreters,
  remoteProbe,
  onPickRemoteInterpreter,
  kernels,
  cells,
  running,
  error,
  onRun,
  onInterrupt,
  onOpenVariables,
  onExport,
}: {
  sessionKind: string | undefined
  /**
   * 远端会话时是服务器名（远程内核，2026-09-03）。内核**在那台服务器上**起，
   * 所以有值时胶囊要带上它——「Python · 空闲」在一台不是本机的机器上是句含糊话。
   */
  remoteLabel?: string | undefined
  /** 远端会话：这台服务器上配好的解释器路径（远程内核）。缺省当作都没配 */
  remoteInterpreters?: { python?: string | undefined; r?: string | undefined } | undefined
  remoteProbe?: (() => Promise<探测结果>) | undefined
  onPickRemoteInterpreter?: ((language: 语言, path: string) => void) | undefined
  kernels: readonly KernelState[] | undefined
  cells: readonly Cell[]
  running: boolean
  error: string | undefined
  onRun: (language: 语言, code: string) => Promise<void>
  onInterrupt: (language: 语言) => void
  onOpenVariables: () => void
  /** 导出 .ipynb / .md（2026-08-27）。不给就没有那两颗按钮 */
  onExport?: ((format: "ipynb" | "md") => Promise<{ path: string; cells: number }>) | undefined
}) {
  /** 语言缺省跟最近一个**语言已知**的 cell；没有就 Python。只在挂上时算一次 */
  const [language, setLanguage] = useState<语言>(() => {
    const 最近 = [...cells].reverse().find((c) => c.languageKnown && c.language !== undefined)
    return 最近?.language ?? "python"
  })
  const [draft, setDraft] = useState("")
  /** `onRun` 自己抛出来的错——跟外面传进来的 `error` 分开放，各说各的 */
  const [runError, setRunError] = useState<string | undefined>(undefined)
  /**
   * 按过「中断」、内核还没换状态的那几台（界面本地）。中断要走一趟运行时才见效，
   * 这一小段里胶囊还写着「运行中」、按钮还在——人会再按一次。内核状态一变就清掉。
   */
  const [中断中, 设中断中] = useState<ReadonlyMap<语言, string | undefined>>(() => new Map())
  /** 导出的浮出提示（成功带路径、失败红字）；`undefined` = 没在显示 */
  const [导出说, 设导出说] = useState<导出提示态 | undefined>(undefined)
  const [导出中, 设导出中] = useState(false)
  const 导出 = (format: "ipynb" | "md") => {
    if (!onExport) return
    设导出中(true)
    onExport(format)
      .then((r) => 设导出说((旧) => ({ text: tf("已导出 {0} 个 cell 到 {1}", r.cells, r.path), bad: false, nonce: (旧?.nonce ?? 0) + 1 })))
      .catch((e: unknown) => 设导出说((旧) => ({ text: tf("导不了：{0}", e instanceof Error ? e.message : String(e)), bad: true, nonce: (旧?.nonce ?? 0) + 1 })))
      .finally(() => 设导出中(false))
  }
  const 状态指纹 = kernels?.map((k) => `${k.language}:${k.state}`).join(",") ?? ""
  useEffect(() => {
    设中断中((旧) => (旧.size ? new Map() : 旧))
  }, [状态指纹])
  // 按下时在跑的那个 cell 收尾了（ok/error）也算见效——后面还排着段时内核状态一直是 busy，光等状态变永远等不到
  useEffect(() => {
    设中断中((旧) => {
      let 新: Map<语言, string | undefined> | undefined
      for (const [lang, id] of 旧) {
        if (id !== undefined && cells.some((c) => c.id === id && c.status !== "running")) {
          新 ??= new Map(旧)
          新.delete(lang)
        }
      }
      return 新 ?? 旧
    })
  }, [cells])

  // ── 远端会话的解释器（远程内核，2026-09-03） ──
  /** 这台服务器上**还没选**的那几门语言。本机会话恒为空表 */
  const 未配: 语言[] = remoteLabel
    ? (["python", "R"] as const).filter((l) => !(l === "python" ? remoteInterpreters?.python : remoteInterpreters?.r))
    : []
  const [探到, 设探到] = useState<探测结果 | undefined>(undefined)
  const [探测中, 设探测中] = useState(false)
  const [探测错, 设探测错] = useState<string | undefined>(undefined)
  const 探 = useCallback(() => {
    if (!remoteProbe) return
    设探测中(true)
    设探测错(undefined)
    remoteProbe()
      .then(设探到)
      .catch((e: unknown) => 设探测错(e instanceof Error ? e.message : String(e)))
      .finally(() => 设探测中(false))
  }, [remoteProbe])
  /**
   * 远端且有没配的：挂上时自动探一次（定案 1：不设就探测）。
   * 让人先按一颗「检测」才看得见候选，等于把一件本可以自己做的事变成一道题。
   */
  useEffect(() => {
    if (remoteLabel && 未配.length > 0 && 探到 === undefined && !探测中) 探()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remoteLabel, 未配.length])
  const 远端选择器 = (l: 语言) => (
    <InterpreterPicker
      key={l}
      language={l}
      where={remoteLabel}
      candidates={l === "python" ? 探到?.python : 探到?.r}
      probing={探测中}
      error={探测错}
      current={undefined}
      onPick={(p) => onPickRemoteInterpreter?.(l, p)}
      onProbe={探}
    />
  )

  if (remoteLabel && 未配.length === 2) {
    /**
     * 远端会话、两门都没选（远程内核，2026-09-03）：整格就是选择器，**不画输入框**。
     * 画了也跑不了——一敲就是一条红字，而红字不告诉人该去哪配。
     */
    return (
      <div className="nb nb-remote-setup">
        <p className="nb-notice">
          {tf("{0} 上还没选解释器。找到的列在下面，选一个就能在那台服务器上跑代码（内核在服务器上起，什么都不会装到那边）。", remoteLabel)}
        </p>
        {远端选择器("python")}
        {远端选择器("R")}
      </div>
    )
  }
  if (sessionKind === "kernel") {
    // 独立内核会话**有**内核——说「没有内核」是假话；它的输出走对话区的 Console，笔记本不管它
    return (
      <div className="nb">
        <EmptyState title={t("独立内核会话的输出就在对话区的 Console 里；笔记本只管普通对话")} />
      </div>
    )
  }
  if (sessionKind !== "native") {
    return (
      <div className="nb">
        <EmptyState title={t("这种会话没有内核，笔记本不可用")} />
      </div>
    )
  }

  // **空表等同缺省**：最后一台内核被回收之后，hub 发来的是 `[]` 而不是缺省
  const 没内核 = kernels === undefined || kernels.length === 0
  const 全退了 = !没内核 && kernels!.every((k) => k.state === "exited")
  /**
   * 「内核已重起」只在**内核真起来过**时才说（2026-08-27 探针抓到的）：解释器没配时一敲就有一条 error cell、
   * `kernels` 又是缺省——按「有 cell 且没内核」判会冒出「上面 cell 里的变量已经不在了」，可内核压根没起过。
   * 跑成过（status ok）或有过输出，才说明曾经有一台。
   */
  const 起来过 = cells.some((c) => c.status === "ok" || c.outputs.length > 0)
  const 内核重起过 = 起来过 && (没内核 || 全退了)

  const run = async () => {
    const code = draft
    if (running || code.trim() === "") return
    setRunError(undefined)
    try {
      await onRun(language, code)
      setDraft("")
    } catch (e) {
      // **失败必须出声，草稿不丢**（§6）：红字放在输入框上方，输入框里的字原样留着
      setRunError(e instanceof Error ? e.message : String(e))
    }
  }

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // 中文输入法组合中的回车是在选字，不是在下命令——放过去
    if (e.nativeEvent.isComposing) return
    // ⌘↩ / Ctrl↩ 跑；Shift↩ 与裸回车都是换行，交给 textarea 自己
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !e.shiftKey) {
      e.preventDefault()
      void run()
    }
  }

  return (
    <div className="nb">
      <div className="nb-head">
        {kernels?.map((k) => (
          <span key={k.language} className={`nb-pill nb-pill-${k.state}`}>
            <span className="nb-pill-label">
              {`${语言名[k.language]}${remoteLabel ? ` · ${remoteLabel}` : ""} · ${中断中.has(k.language) ? t("正在中断…") : 状态词(k.state)}`}
            </span>
            {k.state === "busy" && !中断中.has(k.language) ? (
              <Button
                size="sm"
                onClick={() => {
                  // 记下此刻这门语言在内核上跑的那个 cell——同一台串行，是**最早**那个 running 的；它收尾就换回状态词
                  const 在跑 = cells.find((c) => c.status === "running" && c.language === k.language)?.id
                  设中断中((旧) => new Map(旧).set(k.language, 在跑))
                  onInterrupt(k.language)
                }}
              >
                {t("中断")}
              </Button>
            ) : null}
          </span>
        ))}
        <Button size="sm" variant="ghost" className="nb-vars" onClick={onOpenVariables}>
          {t("变量 →")}
        </Button>
        {onExport && cells.length > 0 ? (
          /* 导出（2026-08-27，作者要的）：两种格式各一颗；没有 cell 时不画——没东西可导的按钮只会让人点了失望 */
          <span className="export-anchor nb-export">
            <Button size="sm" variant="ghost" disabled={导出中} onClick={() => 导出("ipynb")}>
              {t("导出 .ipynb")}
            </Button>
            <Button size="sm" variant="ghost" disabled={导出中} onClick={() => 导出("md")}>
              {t("导出 .md")}
            </Button>
            {导出说 ? <导出提示 {...导出说} onDone={() => 设导出说(undefined)} /> : null}
          </span>
        ) : null}
      </div>

      {内核重起过 ? <p className="nb-notice">{t("内核已重起，上面 cell 里的变量已经不在了；再跑一次即可")}</p> : null}

      {/**
        * 另一门语言还没在这台服务器上选（远程内核，2026-09-03）：**收起来，但看得见**。
        * 只配了 Python 的人不该每次都被 R 的选择器占掉半格；而完全不提，
        * 「R 在这台上怎么开」就成了一个没有入口的功能。
        */}
      {remoteLabel && 未配.length === 1 ? (
        <details className="nb-remote-other">
          <summary>{tf("{0} 还没在 {1} 上选；要用它就点开选一个", 语言名[未配[0]!], remoteLabel)}</summary>
          {远端选择器(未配[0]!)}
        </details>
      ) : null}

      {/* 贴底滚动与对话区同一个库：贴在底部时才跟随新 cell，用户上翻了就撒手（spec §5） */}
      <StickToBottom className="nb-cells" resize="smooth" initial="smooth">
        <StickToBottom.Content className="nb-cells-inner">
        {cells.map((c) => (
          <div key={c.id} className={`nb-cell nb-cell-${c.status}`}>
            <span className="nb-gutter">{`[${c.n}]`}</span>
            <div className="nb-body">
              <div className="nb-meta">
                {c.language !== undefined && c.languageKnown ? (
                  <span className={`nb-lang nb-lang-${c.language}`}>{语言名[c.language]}</span>
                ) : (
                  <span className="nb-lang nb-lang-unknown">{t("语言未知")}</span>
                )}
                <span className="nb-who">{c.who === "you" ? t("你") : t("agent")}</span>
                {c.startedAt !== undefined ? <span className="nb-time">{时刻(c.startedAt)}</span> : null}
                {c.status === "running" ? <span className="nb-running">{t("运行中")}</span> : null}
              </div>
              {c.orphan ? (
                <p className="nb-orphan">{t("（未记录代码）")}</p>
              ) : (
                <pre className="nb-code">{c.code}</pre>
              )}
              {c.outputs.map((o) => (
                <KernelOutputRow key={o.id} item={o} />
              ))}
              {c.interrupted ? <p className="nb-interrupted">{t("（已中断）")}</p> : null}
            </div>
          </div>
        ))}
        </StickToBottom.Content>
      </StickToBottom>

      <div className="nb-input">
        {没内核 && cells.length === 0 ? <p className="nb-hint">{t("这段对话还没有内核")}</p> : null}
        {error !== undefined ? <p className="field-error">{error}</p> : null}
        {runError !== undefined ? <p className="field-error">{runError}</p> : null}
        <div className="nb-input-row">
          <select
            className="control nb-lang-select"
            value={language}
            aria-label={t("语言")}
            disabled={running}
            onChange={(e) => setLanguage(e.target.value as 语言)}
          >
            <option value="python">Python</option>
            <option value="R">R</option>
          </select>
          <Button size="sm" variant="primary" disabled={running || draft.trim() === ""} onClick={() => void run()}>
            {running ? t("运行中…") : t("跑")}
          </Button>
        </div>
        <textarea
          className="control nb-textarea"
          rows={4}
          value={draft}
          disabled={running}
          placeholder={tf("在 {0} 内核里跑一句…（⌘↩ 运行）", 语言名[language])}
          aria-label={t("要跑的代码")}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <p className="nb-caption">{t("会记进对话，agent 下一轮知道")}</p>
      </div>
    </div>
  )
}
