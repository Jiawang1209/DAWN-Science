import { t, tf } from "./i18n/index.js"
import { 文件夹描边图标, 上传图标 } from "./icons.js"

/** Transfer intent only; no stream or task lifetime belongs to this dialog. */
export function TransferConfirmationDetails({ sources, server, target, folder = false }: { sources: readonly string[]; server: string; target: string; folder?: boolean }) {
  const name = (path: string) => path.replace(/[\\/]+$/, "").split(/[\\/]/).pop() ?? path
  return <div className="upload-intent">
    <div className="upload-selection">
      <span className="upload-selection-icon" aria-hidden="true">{folder ? <文件夹描边图标 /> : <上传图标 />}</span>
      <div><strong>{sources.length === 1 ? name(sources[0]!) : tf("已选择 {0} 个文件", sources.length)}</strong>
        {sources.length > 1 ? <span className="upload-selection-names">{sources.slice(0, 3).map(name).join("、")}{sources.length > 3 ? "…" : ""}</span> : null}
      </div>
    </div>
    <dl className="upload-destination"><dt>{t("目标服务器")}</dt><dd>{server}</dd><dt>{t("上传到")}</dt><dd><code>{target.length > 96 ? `${target.slice(0, 32)}…${target.slice(-60)}` : target}</code>
      {target.length > 96 ? <details className="upload-sources"><summary>{t("完整目标路径")}</summary><code>{target}</code></details> : null}
    </dd></dl>
    <details className="upload-sources"><summary>{t("查看本机来源路径")}</summary>{sources.map((path, index) => <code key={`${path}-${index}`}>{path}</code>)}</details>
    <p className="upload-copy-note">{t("上传是复制，本机文件会保留。")}</p>
  </div>
}
