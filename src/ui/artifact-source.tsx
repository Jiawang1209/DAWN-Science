import { useState, type ReactNode } from "react"
import type {
  ArtifactExecution,
  ArtifactObservation,
} from "../protocol/artifact-history.js"
import { $lang, t, tf } from "./i18n/index.js"

export type ArtifactSource = {
  observation: ArtifactObservation
  execution?: ArtifactExecution | undefined
  inputs?: ArtifactObservation[] | undefined
}
export function artifactTime(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.valueOf())
    ? value
    : date.toLocaleString($lang.get() === "zh" ? "zh-CN" : "en-GB", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
}
/** Mount detail bodies only when requested: the default result view stays small. */
export function ArtifactDisclosure({
  label,
  children,
  onOpenChange,
}: {
  label: string
  children: ReactNode
  onOpenChange?: ((open: boolean) => void) | undefined
}) {
  const [open, setOpen] = useState(false)
  return (
    <details
      className="artifact-disclosure"
      onToggle={(e) => {
        setOpen(e.currentTarget.open)
        onOpenChange?.(e.currentTarget.open)
      }}
    >
      <summary>{label}</summary>
      {open ? children : null}
    </details>
  )
}
export function artifactSourceSummary(
  source: ArtifactSource | undefined,
): string {
  if (!source) return t("正在读取来源记录")
  if (source.observation.relation === "late_capture")
    return t("生成过程未记录，已保存当前文件")
  const e = source.execution
  const label =
    e?.language === "python"
      ? t("Python 分析")
      : e?.language === "R"
        ? t("R 分析")
        : e?.tool === "write" || e?.tool === "edit"
          ? t("文件写入")
          : t("文件变化记录")
  return tf("{0} · {1}", label, artifactTime(source.observation.createdAt))
}
export function ArtifactSourceDetails({
  source,
}: {
  source: ArtifactSource | undefined
}) {
  if (!source) return <p className="hint">{t("未记录历史来源")}</p>
  const { observation: o, execution: e, inputs } = source
  return (
    <div className="artifact-source-details">
      <p>
        {o.relation === "late_capture"
          ? t("后补留存，原始生成来源未经确认")
          : o.attribution === "direct"
            ? t("已观察到此调用写入")
            : t("运行期间观察到变化，归属可能不完整")}
      </p>
      {e?.dispatch === "failed" || e?.status === "failed" ? (
        <p className="caveat">{t("这次执行未成功，可能只有部分结果")}</p>
      ) : null}
      <p>
        {t("内容身份")}：<code>{o.sha256 ?? t("未记录完整哈希")}</code>
      </p>
      {e?.runId ? (
        <p>
          Run：<code>{e.runId}</code>
        </p>
      ) : null}
      {e?.dispatchedAt ? (
        <p>
          {t("实际执行时间")}：{artifactTime(e.dispatchedAt)}
        </p>
      ) : null}
      {e?.code ? (
        <>
          <strong>
            {["run_code", "notebook", "bash"].includes(e.tool)
              ? t("实际提交代码")
              : t("实际工具参数")}
          </strong>
          <pre>{e.code}</pre>
        </>
      ) : null}
      <strong>{t("已知输入")}</strong>
      {inputs?.length ? (
        inputs.map((input) => (
          <div key={input.id}>
            <p>
              {input.path} ·{" "}
              {input.relation === "read" ? t("工具读取") : t("声明输入")}
            </p>
            <code>{input.sha256 ?? t("未记录完整哈希")}</code>
            {input.gaps.map((gap, i) => (
              <p className="hint" key={i}>
                {gap}
              </p>
            ))}
          </div>
        ))
      ) : (
        <p className="hint">{t("未捕获完整输入依赖，不代表没有输入")}</p>
      )}
      {e?.environment ? (
        <ArtifactDisclosure label={t("已采集环境")}>
          <pre>{JSON.stringify(e.environment, null, 2)}</pre>
        </ArtifactDisclosure>
      ) : null}
      {e?.log ? (
        <ArtifactDisclosure label={t("执行日志摘要")}>
          <pre>
            {e.log.head}
            {e.log.omittedBytes
              ? tf("\n省略 {0} 字节\n", e.log.omittedBytes)
              : ""}
            {e.log.tail}
          </pre>
        </ArtifactDisclosure>
      ) : null}
      {[...o.gaps, ...(e?.gaps ?? [])].map((gap, i) => (
        <p className="caveat" key={i}>
          {gap}
        </p>
      ))}
    </div>
  )
}
