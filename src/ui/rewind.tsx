/**
 * 回退确认框正文（2026-09-27，spec §2.2）。内核那句用 `.caveat`：它是这张框里最不能被略过的一句。
 * 每个文件单独一行、标签在前——跳过的、退不回的逐条点名，不合成一个数字。
 */
import type { 回退确认内容 } from "./state/rewind.js"
import { t } from "./i18n/index.js"

export function RewindDetail({ 内容 }: { 内容: 回退确认内容 }) {
  return (
    <>
      {内容.行们.length ? (
        <>
          <p className="hint">{t("这句和它之后，agent 动过的文件：")}</p>
          <ul className="rewind-list">
            {内容.行们.map((x) => (
              <li key={`${x.标}:${x.path}`}>
                <span className="rewind-tag">{x.标}</span>
                <span className="rewind-path">{x.path}</span>
                {x.注 ? <span className="rewind-note">{x.注}</span> : null}
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {内容.内核 ? <p className="caveat">{内容.内核}</p> : null}
      {内容.说明.map((s) => (
        <p key={s} className="hint">
          {s}
        </p>
      ))}
    </>
  )
}
