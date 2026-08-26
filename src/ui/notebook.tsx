/**
 * 笔记本（Task 6，2026-08-26）：把转录里「你自己敲的」与「agent 跑的」代码执行，
 * 派生成一叠 cell。
 *
 * 上半是纯函数派生（`cells()`），下半是坐在它上面的面板（`NotebookPanel`，Task 7）。
 */
import { useEffect, useState, type KeyboardEvent } from "react"
import { StickToBottom } from "use-stick-to-bottom"
import type { KernelState, TranscriptItem } from "../protocol/index.js"
import { Button, EmptyState } from "./primitives.js"
import { KernelOutputRow } from "./views.js"
import { t, tf } from "./i18n/index.js"

/** 一格代码 + 它的输出。派生自转录，不是持久化状态 */
export interface Cell {
  n: number
  id: string
  who: "agent" | "you"
  /**
   * 语言。**孤儿 cell（没有 `kernelOutput.language`）可以没有这个字段**——
   * 那时我们真的不知道，不能替它猜一个 `"python"` 出来（见 `languageKnown`）。
   */
  language?: "python" | "R"
  /**
   * 语言是不是真的记录下来的，还是我们兜底猜的。
   *
   * `run_code` 认不出语言时仍落 `language: "python"`（代码前加注「语言未记录」，
   * 界面要有个语言可显示），但那是**猜的**——`languageKnown: false`。
   * 孤儿 cell 没有 `language` 字段时同理为 `false`；`kernelOutput` 带了 `language`
   * 或者是你自己敲的 `cell` 项时才是 `true`。
   */
  languageKnown: boolean
  code: string
  status: "running" | "ok" | "error"
  startedAt?: number
  runId?: string
  /** 被人按「中断」停下的（协议 7.27）。没被中断就没有这个键 */
  interrupted?: true
  outputs: Extract<TranscriptItem, { type: "kernelOutput" }>[]
  /**
   * 孤儿输出兜底出来的 cell——没有对应的 `run_code` 或 `cell` 条目，
   * 只有飘过来的 `kernelOutput`。界面据此显示「（未记录代码）」，而不是假装有代码。
   */
  orphan?: true
}

const 已知语言 = new Set(["python", "R"])

function 是已知语言(v: unknown): v is "python" | "R" {
  return typeof v === "string" && 已知语言.has(v)
}

/** push() 的输入：内部用，允许显式 undefined（exactOptionalPropertyTypes 下的写法） */
interface 待开cell {
  id: string
  who: "agent" | "you"
  language?: "python" | "R" | undefined
  languageKnown: boolean
  code: string
  status: "running" | "ok" | "error"
  startedAt?: number | undefined
  runId?: string | undefined
  interrupted?: true | undefined
  orphan?: true
}

/**
 * 把转录派生成一叠 cell。
 *
 * - `tool` 且 `name === "run_code"` → 开一个新 cell（who: agent）。
 *   语言认不出就落 `"python"`（`languageKnown: false`），代码前面加一行
 *   注明「语言未记录」——**别猜，但界面总得有个语言可显示**。
 * - `cell` → 开一个新 cell（who: you），status/runId 原样带过去，语言已知。
 * - `kernelOutput` → 挂到当前打开的 cell；但**两台内核并存**时（当前打开的 cell
 *   语言已知，且这条输出自带的 `language` 跟它不一样），改成挂到「自上一条
 *   `turn` 以来开过的 cell」里最近那个语言匹配的——不是硬塞进当前打开的那个。
 *   找不到匹配、或者压根没有打开的 cell，就开一个孤儿 cell（`orphan: true`，
 *   code 为空；`language` 取输出自带的那个，没带就没有这个字段），输出不丢。
 * - `turn`，或者不是 `run_code` 的 `tool` → 关掉当前 cell；`turn` 还清空
 *   「本轮开过的 cell」这个窗口。
 * - 别的条目类型（`notice`、`subagents`）既不开也不关。
 */
export function cells(items: readonly TranscriptItem[]): Cell[] {
  const result: Cell[] = []
  let open: Cell | undefined
  /** 自上一条 turn 以来开过的 cell，最旧的在前——两台内核并存时靠它找回正确的那个 */
  let 本轮窗口: Cell[] = []
  let n = 0

  const push = (input: 待开cell) => {
    n += 1
    const c: Cell = {
      n,
      id: input.id,
      who: input.who,
      languageKnown: input.languageKnown,
      code: input.code,
      status: input.status,
      outputs: [],
    }
    if (input.language !== undefined) c.language = input.language
    if (input.startedAt !== undefined) c.startedAt = input.startedAt
    if (input.runId !== undefined) c.runId = input.runId
    if (input.interrupted) c.interrupted = true
    if (input.orphan) c.orphan = true
    open = c
    本轮窗口.push(c)
    result.push(c)
  }
  const close = () => {
    open = undefined
  }

  for (const item of items) {
    switch (item.type) {
      case "tool": {
        if (item.name === "run_code") {
          const input = item.input as { language?: unknown; code?: unknown } | undefined
          const 认得语言 = 是已知语言(input?.language)
          const 原始代码 = typeof input?.code === "string" ? input.code : ""
          push({
            id: item.id,
            who: "agent",
            language: 认得语言 ? (input!.language as "python" | "R") : "python",
            languageKnown: 认得语言,
            code: 认得语言 ? 原始代码 : `# （语言未记录）\n${原始代码}`,
            status: item.status,
            startedAt: item.startedAt,
          })
        } else {
          close()
        }
        break
      }
      case "cell": {
        push({
          id: item.id,
          who: "you",
          language: item.language,
          languageKnown: true,
          code: item.code,
          status: item.status,
          startedAt: item.startedAt,
          runId: item.runId,
          interrupted: item.interrupted,
        })
        break
      }
      case "kernelOutput": {
        // 当前打开的 cell 语言已知、且跟这条输出自带的语言对不上 → 两台内核并存，
        // 别硬塞给它——去本轮窗口里找最近那个语言匹配的
        if (open && open.languageKnown && item.language !== undefined && open.language !== item.language) {
          // 从后往前找最近那个语言匹配的——不复制、不 reverse：
          // 你自己敲的 `cell` 项不带 `turn`，两台内核并存的笔记本会话里这个窗口不会重置，
          // 每条输出都拷一遍窗口就是 O(n²)
          let 匹配: Cell | undefined
          for (let i = 本轮窗口.length - 1; i >= 0; i--) {
            const c = 本轮窗口[i]!
            if (c.languageKnown && c.language === item.language) {
              匹配 = c
              break
            }
          }
          if (匹配) {
            匹配.outputs.push(item)
            break
          }
          push({
            id: item.id,
            who: "agent",
            language: item.language,
            languageKnown: true,
            code: "",
            status: "ok",
            orphan: true,
          })
          open!.outputs.push(item)
          break
        }
        if (!open) {
          push({
            id: item.id,
            who: "agent",
            language: item.language,
            languageKnown: Boolean(item.language),
            code: "",
            status: "ok",
            orphan: true,
          })
        }
        open!.outputs.push(item)
        break
      }
      case "turn": {
        close()
        本轮窗口 = []
        break
      }
      default:
        // notice / subagents：既不开也不关
        break
    }
  }

  return result
}

// ───────────────────────── 面板（Task 7，spec §5/§6） ─────────────────────────

/** 笔记本能跑的语言。`App.tsx` 也用它——别再抄一份 */
export type 语言 = "python" | "R"

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
  kernels,
  cells,
  running,
  error,
  onRun,
  onInterrupt,
  onOpenVariables,
}: {
  sessionKind: string | undefined
  kernels: readonly KernelState[] | undefined
  cells: readonly Cell[]
  running: boolean
  error: string | undefined
  onRun: (language: 语言, code: string) => Promise<void>
  onInterrupt: (language: 语言) => void
  onOpenVariables: () => void
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
  const [中断中, 设中断中] = useState<ReadonlySet<语言>>(() => new Set())
  const 状态指纹 = kernels?.map((k) => `${k.language}:${k.state}`).join(",") ?? ""
  useEffect(() => {
    设中断中((旧) => (旧.size ? new Set() : 旧))
  }, [状态指纹])

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
  const 内核重起过 = cells.length > 0 && (没内核 || 全退了)

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
              {`${语言名[k.language]} · ${中断中.has(k.language) ? t("正在中断…") : 状态词(k.state)}`}
            </span>
            {k.state === "busy" && !中断中.has(k.language) ? (
              <Button
                size="sm"
                onClick={() => {
                  设中断中((旧) => new Set(旧).add(k.language))
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
      </div>

      {内核重起过 ? <p className="nb-notice">{t("内核已重起，上面 cell 里的变量已经不在了；再跑一次即可")}</p> : null}

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
