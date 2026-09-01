/**
 * 本机解释器候选列表（首启向导，2026-08-27，spec §3）。向导与设置「内核」屏共用这一个。
 *
 * 三态：还没探（一颗「检测本机解释器」）/ 探过为空（说清 + 手动填）/ 有候选（单选，选中即回调）。
 * 缺内核包的选中项下面一句现成的装法（`KERNEL_PACKAGE.how`）——**只引导，不执行**（作者定的）。
 */
import { useEffect, useState } from "react"
import { KERNEL_PACKAGE, type InterpreterCandidate } from "../protocol/index.js"
import { Button } from "./primitives.js"
import { t, tf } from "./i18n/index.js"

export type 语言 = "python" | "R"
const 语言名: Record<语言, string> = { python: "Python", R: "R" }
const 包名: Record<语言, string> = { python: "ipykernel", R: "IRkernel" }

/**
 * 装法那句里的程序名是一条真实路径，**带空格就得引起来**（2026-09-01 终审）：`/Users/x/My Env/bin/python -m pip …`
 * 原样贴进终端会把 `Env/bin/python` 当成第二个参数。这个组件拿不到运行平台（候选项里只有路径），
 * 只能从路径本身认：盘符开头（`C:\…`）是 Windows，cmd 不认单引号、双引号 cmd/PowerShell 都收；
 * 其余按 POSIX 用单引号（路径里的 `$`、反引号都不会被展开）。没空格的一个字符都不动——那是绝大多数情况。
 */
export function 引起路径(path: string): string {
  if (!/\s/.test(path)) return path
  if (/^[A-Za-z]:[\\/]/.test(path)) return `"${path}"`
  return `'${path.replaceAll("'", "'\\''")}'`
}

export function InterpreterPicker({
  language,
  candidates,
  probing,
  error,
  current,
  onPick,
  onProbe,
}: {
  language: 语言
  /** `undefined` = 还没探过 */
  candidates: readonly InterpreterCandidate[] | undefined
  probing: boolean
  error?: string | undefined
  /** 设置里现在填的那条 */
  current: string | undefined
  onPick: (path: string) => void
  onProbe: () => void
}) {
  const [手动, 设手动] = useState(false)
  const [草稿, 设草稿] = useState("")
  /**
   * 选中项本地先亮（2026-08-27 e2e 抓的）：`current` 是设置里回写的值，`onPick` 走一趟后端才回来——
   * 纯受控的话点完那一瞬又弹回未选，人（和 Playwright）都会以为「点了没反应」。设置回写后以它为准。
   */
  const [选了, 设选了] = useState(current)
  useEffect(() => 设选了(current), [current])
  const 名 = 语言名[language]
  const 选中 = candidates?.find((c) => c.path === 选了)
  const 挑 = (path: string) => {
    设选了(path)
    onPick(path)
  }

  return (
    <div className={`ip-picker ip-${language}`}>
      <div className="ip-head">
        <span className="ip-lang">{名}</span>
        <Button size="sm" variant="ghost" disabled={probing} onClick={onProbe}>
          {probing ? t("正在检测…") : candidates === undefined ? t("检测本机解释器") : t("重新检测")}
        </Button>
      </div>
      {error ? <p className="field-error">{tf("检测失败：{0}", error)}</p> : null}
      {candidates !== undefined && candidates.length === 0 ? (
        <p className="hint">{tf("这台电脑上没找到 {0}；装了之后点重新检测，或手动填。", 名)}</p>
      ) : null}
      {candidates && candidates.length > 0 ? (
        <ul className="ip-list" role="radiogroup" aria-label={tf("{0} 解释器候选", 名)}>
          {candidates.map((c) => (
            <li key={c.path} className={`ip-item${c.path === 选了 ? " active" : ""}`}>
              <label>
                <input type="radio" name={`ip-${language}`} value={c.path} checked={c.path === 选了} onChange={() => 挑(c.path)} />
                <code className="ip-path">{c.path}</code>
                <span className="ip-ver">{c.version ?? "?"}</span>
                <span className={`ip-pkg ip-pkg-${c.kernelPackage}`}>
                  {c.kernelPackage === "present" ? `${包名[language]} ✓` : c.kernelPackage === "missing" ? `${包名[language]} ✗` : `${包名[language]} ?`}
                </span>
              </label>
              {c.problem ? <pre className="ip-problem">{c.problem}</pre> : null}
            </li>
          ))}
        </ul>
      ) : null}
      {选中?.kernelPackage === "missing" ? (
        /* 装法里的程序名换成选中的那条路径：「<你的 python>」这种占位词过不了 i18n（B16），而这里恰恰知道是哪个。
           `replace` 第二参用函数：路径里的 `$&`/`$1` 会被字符串形式当成替换模式 */
        <p className="hint ip-how">{tf("这个 {0} 没装 {1}：{2}。装完回来点重新检测。", 名, 包名[language], KERNEL_PACKAGE[language].how.replace(/^\S+/, () => 引起路径(选中.path)))}</p>
      ) : null}
      <div className="ip-manual">
        {手动 ? (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (草稿.trim()) 挑(草稿.trim())
              设手动(false)
            }}
          >
            <input className="control" aria-label={tf("{0} 解释器路径", 名)} value={草稿} onChange={(e) => 设草稿(e.target.value)} placeholder={language === "python" ? "/usr/local/bin/python3" : "/usr/local/bin/R"} />
            <Button size="sm" type="submit">{t("用这个")}</Button>
          </form>
        ) : (
          <Button size="sm" variant="text" onClick={() => { 设草稿(选了 ?? ""); 设手动(true) }}>
            {t("手动填…")}
          </Button>
        )}
      </div>
    </div>
  )
}
