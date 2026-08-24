/**
 * 概览里的「外部附件」一格（2026-08-25，学自 dsh-paste-input 的用量/清理，解读见
 * `ccb_hive_code_learn/dsh-paste-input-解读.md`）：本会话粘贴 / 拖拽落盘的批次、文件数与占用，
 * 加一颗两步确认的清理键。**只删带自家 marker 的批次**——清理逻辑在 src/files/attachments.ts。
 */
import { useCallback, useEffect, useState } from "react"
import { t, tf } from "./i18n/index.js"
import { Button } from "./primitives.js"

function 人字节(n: number): string {
  if (n < 1024) return `${n} B`
  const 单位 = ["KiB", "MiB", "GiB"]
  let v = n / 1024
  let u = 单位[0]!
  for (let i = 1; i < 单位.length && v >= 1024; i++) {
    v /= 1024
    u = 单位[i]!
  }
  return `${v >= 10 ? v.toFixed(0) : v.toFixed(1)} ${u}`
}

export function AttachUsagePanel({ workspace, sessionId }: { workspace: string; sessionId: string }) {
  const [用量, 设用量] = useState<{ 批次: number; 文件: number; 字节: number } | undefined>(undefined)
  const [出错, 设出错] = useState<string | undefined>(undefined)
  const [确认中, 设确认中] = useState(false)
  const 拉 = useCallback(() => {
    const u = window.dawn?.attachUsage
    if (!u) return
    u(workspace, sessionId).then(设用量).catch((e: unknown) => 设出错(e instanceof Error ? e.message : String(e)))
  }, [workspace, sessionId])
  useEffect(拉, [拉])
  if (!用量) return null
  return (
    <section className="panel">
      <h3 className="panel-title">{t("外部附件")}</h3>
      <div className="panel-body attach-usage">
        {用量.批次 === 0 ? (
          <p className="empty">{t("这段会话还没有落盘的外部附件。粘贴或拖入文件，发送时会复制进工作区。")}</p>
        ) : (
          <>
            <p className="attach-usage-line">{tf("{0} 批 · {1} 个文件 · {2}", 用量.批次, 用量.文件, 人字节(用量.字节))}</p>
            {/* 两步确认（学它的 confirm-twice）：第一下换文案，第二下才删 */}
            <Button
              variant="secondary"
              size="sm"
              className={确认中 ? "danger" : ""}
              onClick={() => {
                if (!确认中) {
                  设确认中(true)
                  return
                }
                设确认中(false)
                const c = window.dawn?.attachClean
                if (!c) return
                c(workspace, sessionId).then(拉).catch((e: unknown) => 设出错(e instanceof Error ? e.message : String(e)))
              }}
            >
              {确认中 ? t("再点一次：确认清理") : t("清理本会话附件")}
            </Button>
          </>
        )}
        {出错 ? <p className="caveat">{出错}</p> : null}
      </div>
    </section>
  )
}
