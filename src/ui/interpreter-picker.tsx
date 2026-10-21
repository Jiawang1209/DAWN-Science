/**
 * 本机解释器候选列表（首启向导，2026-08-27，spec §3）。向导与设置「内核」屏共用这一个。
 *
 * 三态：还没探（一颗「检测本机解释器」）/ 探过为空（说清 + 手动填）/ 有候选（单选，选中即回调）。
 * 2026-09-03 起它也用在**服务器**上（远程内核）：`where` 一给，那三句话里的「这台电脑」就换成服务器名。
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
  where,
  candidates,
  probing,
  error,
  current,
  onPick,
  onProbe,
  layout = "picker",
}: {
  language: 语言
  /**
   * 探的是**哪台机器**（远程内核，2026-09-03）：给了服务器名就说「{名} 上」，
   * 不给就是本机。**必须说清**——同一个组件现在出现在两处，
   * 一句「这台电脑上没找到 Python」出现在远端会话里就是一句假话。
   */
  where?: string | undefined
  /** `undefined` = 还没探过 */
  candidates: readonly InterpreterCandidate[] | undefined
  probing: boolean
  error?: string | undefined
  /** 设置里现在填的那条 */
  current: string | undefined
  onPick: (path: string) => void
  onProbe?: (() => void) | undefined
  /** 设置页：一个路径草稿，检测和手填都在保存后生效；其他入口保持选中即用。 */
  layout?: "picker" | "setting"
}) {
  const [手动, 设手动] = useState(false)
  const [草稿, 设草稿] = useState("")
  const [路径草稿, 设路径草稿] = useState<string | undefined>(undefined)
  useEffect(() => 设路径草稿(undefined), [current])
  const 设置布局 = layout === "setting"
  const 路径 = 路径草稿 ?? current ?? ""
  const 待保存 = 路径.trim() !== (current ?? "")
  /**
   * 选中项本地先亮（2026-08-27 e2e 抓的）：`current` 是设置里回写的值，`onPick` 走一趟后端才回来——
   * 纯受控的话点完那一瞬又弹回未选，人（和 Playwright）都会以为「点了没反应」。设置回写后以它为准。
   */
  const [选了, 设选了] = useState(current)
  useEffect(() => 设选了(current), [current])
  const 名 = 语言名[language]
  const 选择路径 = 设置布局 ? 路径.trim() : 选了
  const 选中 = candidates?.find((c) => c.path === 选择路径)
  const 挑 = (path: string) => {
    if (设置布局) {
      设路径草稿(path)
      return
    }
    设选了(path)
    onPick(path)
  }

  return (
    <div className={`ip-picker ip-${language}${设置布局 ? " ip-setting" : ""}`} role={设置布局 ? "group" : undefined} aria-label={设置布局 ? (language === "python" ? t("Python 解释器") : t("R 解释器")) : undefined}>
      <div className="ip-head">
        <span className="ip-lang">{名}</span>
        {设置布局 ? <span className={`ip-config-state${待保存 ? " is-draft" : ""}`}>{待保存 ? t("尚未保存") : current ? t("已配置") : t("还没配置")}</span> : null}
        {onProbe ? <Button size="sm" variant={设置布局 ? "outline" : "ghost"} disabled={probing} onClick={onProbe} aria-label={设置布局 ? tf("检测 {0} 解释器", 名) : undefined}>
          {probing
            ? t("正在检测…")
            : candidates === undefined
              ? 设置布局 ? t("检测本机解释器") : where
                ? tf("检测 {0} 上的解释器", where)
                : t("检测本机解释器")
              : t("重新检测")}
        </Button> : null}
      </div>
      {设置布局 ? (
        <>
          <form className="ip-path-editor" onSubmit={(e) => {
            e.preventDefault()
            if (待保存) onPick(路径.trim())
          }}>
            <input className="control" aria-label={language === "python" ? t("Python 解释器") : t("R 解释器")} value={路径} onChange={(e) => 设路径草稿(e.target.value)} placeholder={t("输入解释器的完整路径")} spellCheck={false} />
            <Button variant="primary" size="sm" type="submit" disabled={!待保存}>{t("保存")}</Button>
          </form>
          <p className="ip-setting-hint">{language === "python" ? t("需已安装 ipykernel。") : t("需已安装 IRkernel。")}</p>
        </>
      ) : null}
      {error ? <p className="field-error">{tf("检测失败：{0}", error)}</p> : null}
      {candidates !== undefined && candidates.length === 0 ? (
        <p className="hint">
          {where
            ? tf("{0} 上没找到 {1}；装了之后点重新检测，或手动填。", where, 名)
            : tf("这台电脑上没找到 {0}；装了之后点重新检测，或手动填。", 名)}
        </p>
      ) : null}
      {candidates && candidates.length > 0 ? (
        <ul className="ip-list" role="radiogroup" aria-label={tf("{0} 解释器候选", 名)}>
          {candidates.map((c) => (
            <li key={c.path} className={`ip-item${c.path === 选择路径 ? " active" : ""}`}>
              <label>
                <input type="radio" name={`ip-${language}`} value={c.path} checked={c.path === 选择路径} onChange={() => 挑(c.path)} />
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
      {!设置布局 ? <div className="ip-manual">
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
            {t("手动填写路径")}
          </Button>
        )}
      </div> : null}
    </div>
  )
}
