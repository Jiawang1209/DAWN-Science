import { Button } from "./primitives.js"
import { 关闭图标 } from "./icons.js"
import { tf } from "./i18n/index.js"
import { dismissNote } from "./state/connection.js"

/** 历史操作提示与当前连接状态分开；关闭不表示故障已解决。 */
export function StatusNotices({ notes }: { notes: readonly string[] }) {
  return <>{notes.map((message) => (
    <span key={message} className="hint status-notice" role="status">
      <span className="status-notice-text">{message}</span>
      <Button variant="ghost" size="xs" aria-label={tf("关闭提示：{0}", message)} onClick={() => dismissNote(message)}>
        <关闭图标 className="row-icon" />
      </Button>
    </span>
  ))}</>
}
