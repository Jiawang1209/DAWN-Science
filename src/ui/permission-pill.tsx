/**
 * 输入卡附栏右侧那颗「权限」（2026-08-23，作者定的：放进对话框、和上传 / 选目录一行靠右、上拉菜单、
 * 和「优化输入」同一副样子；**替掉设置里的「工具权限」**）。
 *
 * 它是权限档的**唯一入口**：
 * - 有会话时改的是**这一段**（走会话开关 `dawn.permission`），空态屏改的是**默认**；
 * - 菜单底下一行「也作为以后新会话的默认」——默认值的入口留在这里，不另开一屏；
 * - 最底下一行灰字说边界：不是沙箱；硬拒清单任何档都拒；run_code 里的代码在远端一样不经这道门。
 */
import { useEffect, useRef, useState } from "react"
import { Button } from "./primitives.js"
import { t } from "./i18n/index.js"
import { 下拉图标, 勾图标, 手掌图标, 终端图标, 出错图标 } from "./icons.js"

export type 权限档 = "allow-all" | "ask-risky" | "deny-risky"
/** **由低到高**排（作者 2026-08-23 定的）：先拦、再问、最后全放 */
export const 全部权限档: readonly 权限档[] = ["deny-risky", "ask-risky", "allow-all"]

/**
 * 名字照作者给的那张图（2026-08-23）：「请求批准」「完全访问权限」。
 * 图上中间那档叫「帮我批准」——**我们这一档是拒，不是替你批**，叫那个名字就是名字比能力大，所以叫「自动拦截」。
 */
export function 档名(档: 权限档): string {
  return 档 === "allow-all" ? t("完全访问权限") : 档 === "ask-risky" ? t("请求批准") : t("自动拦截")
}
/** 扳机上的短名：附栏那一行容不下「完全访问权限」 */
function 短名(档: 权限档): string {
  return 档 === "allow-all" ? t("完全访问") : 档名(档)
}
/** 每一档一颗图标（作者给的图：问一句是手掌、拦下是终端、全放行是感叹号） */
function 档图标(档: 权限档) {
  return 档 === "allow-all" ? <出错图标 /> : 档 === "ask-risky" ? <手掌图标 /> : <终端图标 />
}
function 档说(档: 权限档): string {
  return 档 === "allow-all"
    ? t("可不受限制地读写文件、执行命令、访问互联网；只拦硬拒清单")
    : 档 === "ask-risky"
      ? t("改原始数据、写到工作区外、删旧文件、装包、联网时始终询问你")
      : t("检测到的风险操作直接拒绝，把理由回给模型让它改道")
}

export function PermissionPill({
  当前,
  跟随默认,
  onPick,
}: {
  当前: 权限档
  /** 这一段没单独设过，跟着默认走（只有会话里才有这个概念） */
  跟随默认?: boolean | undefined
  /** 选了一档；`也作为默认` = 顺手写进设置 */
  onPick: (档: 权限档, 也作为默认: boolean) => void
}) {
  const [开着, 设开着] = useState(false)
  const [也作为默认, 设也作为默认] = useState(false)
  const 盒 = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!开着) return
    const 关 = (e: MouseEvent) => {
      if (!盒.current?.contains(e.target as Node)) 设开着(false)
    }
    document.addEventListener("mousedown", 关)
    return () => document.removeEventListener("mousedown", 关)
  }, [开着])

  return (
    <div className="perm-pill" ref={盒} onKeyDown={(e) => e.key === "Escape" && 设开着(false)}>
      <Button variant="ghost" size="inline" className="perm-pill-trigger" data-tier={当前} aria-haspopup="menu" aria-expanded={开着} onClick={() => 设开着((v) => !v)}>
        {档图标(当前)}
        {短名(当前)}
        <下拉图标 />
      </Button>
      {开着 ? (
        <div className="menu perm-pill-menu" role="menu" aria-label={t("工具权限")}>
          {全部权限档.map((档) => (
            <Button
              key={档}
              variant="ghost"
              size="inline"
              role="menuitemradio"
              aria-checked={档 === 当前}
              className="perm-pill-item"
              data-tier={档}
              onClick={() => {
                onPick(档, 也作为默认)
                设开着(false)
              }}
            >
              <span className="perm-pill-item-icon" aria-hidden="true">{档图标(档)}</span>
              <span className="perm-pill-item-text">
                <span className="perm-pill-item-name">{档名(档)}</span>
                <span className="perm-pill-item-desc">{档说(档)}</span>
              </span>
              <span className="perm-pill-item-mark" aria-hidden="true">{档 === 当前 ? <勾图标 /> : null}</span>
            </Button>
          ))}
          {跟随默认 !== undefined ? (
            <label className="perm-pill-default">
              <input type="checkbox" checked={也作为默认} onChange={(e) => 设也作为默认(e.target.checked)} />
              <span>{t("也作为以后新会话的默认")}</span>
              {跟随默认 ? <span className="hint"> {t("（这一段现在跟着默认）")}</span> : null}
            </label>
          ) : null}
          <p className="hint perm-pill-note">{t("这是一道工具门，不是沙箱。硬拒清单（sudo、删到主目录 / 系统目录、带凭据出网、强推）任何档都拒；run_code 里的代码在远端同样不拦。")}</p>
        </div>
      ) : null}
    </div>
  )
}
