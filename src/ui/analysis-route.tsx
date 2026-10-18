import { localizedRouteBlockers } from "./state/analysis-route.js"
import { useEffect, useRef, useState } from "react"
import {
  routeContinueBlockers,
  type AnalysisRoute,
  type AnalysisRouteReadResult,
  type AnalysisRouteEvidence,
  type RouteAction,
  type RouteStep,
} from "../protocol/analysis-route.js"
import { Button, EmptyState, Loader } from "./primitives.js"
import { FilePreview, type FileContent } from "./files.js"
import { 详情地址 } from "./case-cards.js"
import { t, tf } from "./i18n/index.js"

export const createRouteIntent =
  "请根据当前需求和数据条件建立会话分析路线。只规划，说明稳定步骤、输入、依赖、预期输出和候选案例，并等待我选步；本请求不批准执行、安装或科研文件写入，保留此前授权和方案门。"
const progress = (status: RouteStep["status"]) =>
  ({
    pending: t("待开始"),
    in_progress: t("进行中"),
    blocked: t("已阻塞"),
    delivered: t("已交付"),
    skipped: t("已跳过"),
  })[status]
const execution = (state: RouteStep["execution"]["state"]) =>
  ({ not_run: t("未运行"), partial: t("部分运行"), completed: t("记录为运行完成"), failed: t("运行失败") })[state]
const review = (state: RouteStep["verification"]["state"]) =>
  ({ unreviewed: t("未审查"), reviewed: t("记录为已审查"), issues: t("审查发现问题") })[state]
const fileFact = (state: AnalysisRouteEvidence["deliverables"][number]["state"]) =>
  ({ observed: t("观察到工具生成"), exists: t("文件存在"), missing: t("文件缺失"), unknown: t("存在性未知") })[state] ??
  t("存在性未知")
export function AnalysisRouteSummary({ route, onOpen }: { route: AnalysisRoute; onOpen: () => void }) {
  const blocked = route.steps.find((step) => step.needsReview || step.blockers.length || step.status === "blocked")
  return (
    <Button variant="ghost" className="analysis-route-summary" onClick={onOpen}>
      <span className="route-summary-title">{route.title}</span>
      <span>
        {tf("已交付 {0} / {1}", route.steps.filter((step) => step.status === "delivered").length, route.steps.length)}
      </span>
      {blocked ? (
        <span className="route-summary-blocked">
          {blocked.id} · {blocked.needsReview ? t("需要复核") : t("有阻塞")}
        </span>
      ) : null}
    </Button>
  )
}
type Selection = { server: string; caseId: string }
export interface AnalysisRoutePanelProps {
  result: AnalysisRouteReadResult | undefined
  busy?: boolean | undefined
  readOnly?: boolean | undefined
  onReload: () => Promise<void>
  onAction: (stepId: string, action: RouteAction, selection?: Selection) => Promise<void>
  onCreate: () => Promise<void>
  readFile: (path: string) => Promise<FileContent>
  loadGalleryRoots: () => Promise<Record<string, string>>
  onOpenWeb: (url: string) => void
  onOpenExternally: (path: string) => void
  onTool?: ((id: string) => void) | undefined
  canLocateTool?: ((id: string) => boolean) | undefined
}
export function AnalysisRoutePanel(props: AnalysisRoutePanelProps) {
  const {
    result,
    busy,
    readOnly,
    onReload,
    onAction,
    onCreate,
    readFile,
    loadGalleryRoots,
    onOpenWeb,
    onOpenExternally,
    onTool,
  } = props
  const [expanded, setExpanded] = useState<string | undefined>(undefined)
  const [version, setVersion] = useState("current")
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string>()
  const [roots, setRoots] = useState<Record<string, string>>({})
  const [rootsError, setRootsError] = useState<string>()
  const [rootsRetry, setRootsRetry] = useState(0)
  const [preview, setPreview] = useState<string>()
  const [content, setContent] = useState<FileContent>()
  const [fileError, setFileError] = useState<string>()
  const [retry, setRetry] = useState(0)
  const [reading, setReading] = useState(false)
  const mounted = useRef(true)
  const readRef = useRef(readFile)
  readRef.current = readFile
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  useEffect(() => {
    let alive = true
    setRootsError(undefined)
    loadGalleryRoots().then(
      (value) => {
        if (alive) setRoots(value)
      },
      (err) => {
        if (alive) setRootsError(String(err))
      },
    )
    return () => {
      alive = false
    }
  }, [loadGalleryRoots, rootsRetry])
  useEffect(() => {
    let alive = true
    setContent(undefined)
    setFileError(undefined)
    setReading(false)
    if (preview)
      void readRef.current(preview).then(
        (value) => {
          if (alive) setContent(value)
        },
        (err) => {
          if (alive) setFileError(err instanceof Error ? err.message : String(err))
        },
      )
    return () => {
      alive = false
    }
  }, [preview, retry, version])
  async function run(action: () => Promise<void>): Promise<void> {
    setPending(true)
    setError(undefined)
    try {
      await action()
    } catch (err) {
      if (!mounted.current) return
      const code = (err as { details?: { code?: string } })?.details?.code
      setError(`${code ? `${code}: ` : ""}${err instanceof Error ? err.message : String(err)}`)
      if (code === "STALE_ROUTE") {
        try {
          await onReload()
        } catch (refreshError) {
          if (mounted.current) setError(`${t("刷新失败")}：${String(refreshError)}`)
        }
      }
    } finally {
      if (mounted.current) setPending(false)
    }
  }
  const failure = error ?? result?.error?.message
  const feedback = failure ? (
    <div className="route-error" role="alert">
      <p>{failure}</p>
      <Button size="sm" variant="ghost" onClick={() => void run(onReload)} disabled={pending}>
        {t("刷新路线")}
      </Button>
    </div>
  ) : null
  if (!result) return <Loader label={t("正在读取路线")} />
  if (!result.supported)
    return (
      <EmptyState title={t("此会话不支持分析路线")} description={result.reason ?? t("仅原生 API 主会话支持路线操作")} />
    )
  if (!result.route)
    return (
      <div className="analysis-route-pane">
        {feedback}
        <EmptyState
          title={t("先描述需求，再建立路线")}
          description={t("说明目标、数据与限制。路线将逐步列出输入、依赖和预期产物，等待你选步。")}
          action={
            <Button size="sm" disabled={pending || busy || readOnly} onClick={() => void run(onCreate)}>
              {t("建立分析路线")}
            </Button>
          }
        />
        {busy ? (
          <p className="caveat">{t("会话忙碌，请等当前回合结束")}</p>
        ) : readOnly ? (
          <p className="caveat">{t("会话只读，仍可查看路线和文件")}</p>
        ) : null}
      </div>
    )
  const current = result.route
  const historical = version !== "current"
  const route = historical ? result.history?.find((item) => String(item.revision) === version) : current
  if (!route)
    return (
      <div className="analysis-route-pane">
        <p role="alert">{t("历史版本暂不可用，请刷新或查看当前路线")}</p>
        <Button size="sm" variant="ghost" onClick={() => void run(onReload)}>
          {t("刷新路线")}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setVersion("current")}>
          {t("查看当前路线")}
        </Button>
      </div>
    )
  const locked = Boolean(busy || readOnly || pending || historical)
  const openId =
    expanded ??
    route.steps.find((step) => step.status !== "delivered" && step.status !== "skipped")?.id ??
    route.steps[0]?.id
  const closePreview = () => {
    setPreview(undefined)
    setContent(undefined)
    setReading(false)
  }
  return (
    <section className={`analysis-route-pane${reading ? " route-reading" : ""}`} aria-label={t("分析路线详情")}>
      <div className="route-navigation" hidden={reading}>
        <header className="route-head">
          <h2>{route.title}</h2>
          <Button size="sm" variant="ghost" disabled={pending} onClick={() => void run(onReload)}>
            {t("刷新路线")}
          </Button>
        </header>
        <label className="route-version">
          {t("路线版本")}
          <select
            className="control"
            aria-label={t("路线版本")}
            value={version}
            onChange={(e) => {
              setVersion(e.target.value)
              closePreview()
            }}
          >
            <option value="current">{tf("当前 · 第 {0} 版", current.revision)}</option>
            {result.history?.map((item) => (
              <option key={item.revision} value={String(item.revision)}>
                {tf("历史 · 第 {0} 版", item.revision)} · {new Date(item.updatedAt).toLocaleString()}
              </option>
            ))}
          </select>
        </label>
        <p className="route-time">
          {tf("第 {0} 版", route.revision)} · {new Date(route.updatedAt).toLocaleString()}
        </p>
        <p>{route.goal}</p>
        {historical ? (
          <p className="route-notice">{t("历史版本只读。历史文件预览读取当前路径，不保存旧文件字节。")}</p>
        ) : null}
        {busy ? (
          <p className="route-notice">{t("会话忙碌，请等当前回合结束")}</p>
        ) : readOnly ? (
          <p className="route-notice">{t("会话只读，仍可查看路线和文件")}</p>
        ) : null}
        {feedback}
        {route.dataContext.length ? (
          <details>
            <summary>{t("数据条件")}</summary>
            <ul>
              {route.dataContext.map((text, i) => (
                <li key={i}>{text}</li>
              ))}
            </ul>
          </details>
        ) : null}
        <ol className="route-steps">
          {route.steps.map((step) => {
            const open = openId === step.id
            const blockers = routeContinueBlockers(route, step.id)
            const act = (action: RouteAction, selection?: Selection) => {
              setExpanded(step.id)
              void run(() => onAction(step.id, action, selection))
            }
            const observed = (historical ? [] : (result.evidence?.tools ?? [])).filter(
              (tool) => tool.stepId === step.id,
            )
            const selected = step.cases.find(
              (candidate) =>
                candidate.server === step.selectedCase?.server && candidate.caseId === step.selectedCase?.caseId,
            )
            return (
              <li key={step.id} className="route-step">
                <Button
                  variant="ghost"
                  className="route-step-toggle"
                  aria-expanded={open}
                  aria-controls={`route-step-${step.id}`}
                  onClick={() => setExpanded(open ? "" : step.id)}
                >
                  <span className="route-step-id">{step.id}</span>
                  <span className="route-step-title">{step.title}</span>
                  <span className="route-step-status">
                    {progress(step.status)}
                    {step.needsReview ? ` · ${t("需要复核")}` : ""}
                  </span>
                </Button>
                {open ? (
                  <div id={`route-step-${step.id}`} className="route-step-body">
                    <p className="route-purpose">{step.purpose}</p>
                    {!historical ? (
                      <div className="route-actions">
                        <Button size="sm" variant="ghost" disabled={locked} onClick={() => act("view")}>
                          {t("查看步骤")}
                        </Button>
                        <Button size="sm" variant="ghost" disabled={locked} onClick={() => act("search")}>
                          {t("补找案例")}
                        </Button>
                        <Button size="sm" disabled={locked || blockers.length > 0} onClick={() => act("continue")}>
                          {t("继续这一步")}
                        </Button>
                      </div>
                    ) : null}
                    {blockers.length > 0 ? (
                      <div className="route-blockers">
                        <span>{t("继续前需处理")}</span>
                        <ul>
                          {localizedRouteBlockers(route, step.id).map((text) => (
                            <li key={text}>{text}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    <dl className="route-conditions">
                      <dt>{t("输入")}</dt>
                      <dd>{step.inputs.join("；") || t("尚未记录")}</dd>
                      <dt>{t("预期输出")}</dt>
                      <dd>{step.outputs.join("；") || t("尚未记录")}</dd>
                      <dt>{t("依赖步骤")}</dt>
                      <dd>{step.dependencies.join("、") || t("无前置步骤")}</dd>
                    </dl>
                    <p className="route-selected">
                      {t("你选的参考")}：
                      {selected ? `${selected.title} · ${selected.server} / ${selected.caseId}` : t("尚未选择")}
                    </p>
                    {step.cases.length ? (
                      <ul className="route-cases">
                        {step.cases.map((candidate) => {
                          const root = roots[candidate.server]
                          return (
                            <li key={JSON.stringify([candidate.server, candidate.caseId])}>
                              <strong>{candidate.title}</strong>
                              <p className="route-case-id">
                                {candidate.server} / {candidate.caseId}
                                {candidate.language ? ` · ${candidate.language}` : ""}
                              </p>
                              <p>{candidate.coverage}</p>
                              <span className="route-case-evidence">
                                {candidate.evidence === "content_checked" ? t("正文已读取") : t("仅元数据")}
                              </span>
                              <div className="route-actions">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  disabled={!root}
                                  onClick={() => root && onOpenWeb(详情地址(root, { case_id: candidate.caseId }))}
                                >
                                  {t("看案例详情")}
                                </Button>
                                {!historical ? (
                                  <Button
                                    size="sm"
                                    variant="secondary"
                                    disabled={locked || selected === candidate}
                                    onClick={() =>
                                      act("select", { server: candidate.server, caseId: candidate.caseId })
                                    }
                                  >
                                    {selected === candidate ? t("已选参考") : t("选为参考")}
                                  </Button>
                                ) : null}
                              </div>
                              {!root ? <span className="caveat">{t("案例图廊暂不可用")}</span> : null}
                            </li>
                          )
                        })}
                      </ul>
                    ) : (
                      <p className="caveat">{t("尚无候选案例，可补找案例")}</p>
                    )}
                    {rootsError ? (
                      <p className="caveat">
                        {rootsError}
                        <Button size="sm" variant="ghost" onClick={() => setRootsRetry((value) => value + 1)}>
                          {t("重新连接图廊")}
                        </Button>
                      </p>
                    ) : null}
                    <details className="route-evidence">
                      <summary>{t("证据详情")}</summary>
                      <h3>{t("Agent 执行记录")}</h3>
                      <p>
                        {execution(step.execution.state)} · {step.execution.note}
                      </p>
                      <h3>{t("审查记录")}</h3>
                      <p>
                        {review(step.verification.state)} · {step.verification.note}
                      </p>
                      {!historical ? (
                        <>
                          <h3>{t("应用观察到的工具事实")}</h3>
                          <p>
                            {observed.some((tool) => tool.execution === "ran" || tool.execution === "failed")
                              ? t("已观察到本步运行")
                              : t("未观察到本步运行")}
                          </p>
                          <ul>
                            {observed.map((tool) => (
                              <li key={tool.toolCallId}>
                                {tool.name} · {tool.status === "error" ? t("工具失败") : t("工具返回")} ·{" "}
                                {tool.execution === "ran"
                                  ? t("实际运行")
                                  : tool.execution === "failed"
                                    ? t("运行失败")
                                    : t("未观察到运行")}
                                <span className="route-tool-id">{tool.toolCallId}</span>
                                {onTool && props.canLocateTool?.(tool.toolCallId) ? (
                                  <Button size="sm" variant="ghost" onClick={() => onTool(tool.toolCallId)}>
                                    {t("定位工具记录")}
                                  </Button>
                                ) : null}
                              </li>
                            ))}
                          </ul>
                        </>
                      ) : null}
                      {step.execution.toolCallIds?.length || step.verification.toolCallIds?.length ? (
                        <p className="caveat">
                          {t("Agent 引用的工具索引")}：
                          {[
                            ...new Set([
                              ...(step.execution.toolCallIds ?? []),
                              ...(step.verification.toolCallIds ?? []),
                            ]),
                          ].join("、")}
                        </p>
                      ) : null}
                      <p className="caveat">{t("交付不代表已运行；工具运行不代表科学结论正确。")}</p>
                      {step.notes.map((note, i) => (
                        <p key={i}>{note}</p>
                      ))}
                    </details>
                    {!historical ? (
                      <div className="route-actions">
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={locked || step.status === "in_progress"}
                          onClick={() =>
                            act(step.status === "skipped" || step.status === "delivered" ? "restore" : "skip")
                          }
                        >
                          {step.status === "skipped" || step.status === "delivered" ? t("恢复此步") : t("跳过此步")}
                        </Button>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </li>
            )
          })}
        </ol>
      </div>
      <div className="route-deliverables" hidden={reading}>
        <h3>{t("交付文件")}</h3>
        {route.steps.every((step) => !step.deliverables.length) ? (
          <p className="caveat">{t("尚无交付文件")}</p>
        ) : (
          <ul>
            {route.steps.flatMap((step) =>
              step.deliverables.map((file) => (
                <li key={`${step.id}/${file.path}`}>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={file.path}
                    aria-pressed={preview === file.path}
                    onClick={() => {
                      setPreview(file.path)
                      setRetry((value) => value + 1)
                    }}
                  >
                    <span>
                      {step.id} · {file.path}
                    </span>
                  </Button>
                  <span className="route-file-fact">
                    {historical
                      ? t("历史文件引用（未保存当时文件事实）")
                      : fileFact(
                          result.evidence?.deliverables.find((fact) => fact.stepId === step.id && fact.path === file.path)
                            ?.state ?? "unknown",
                        )}
                  </span>
                  {file.note ? <p>{file.note}</p> : null}
                </li>
              )),
            )}
          </ul>
        )}
      </div>
      {preview ? (
        <div className="route-file-preview">
          {historical ? <p className="route-history-file-note">{t("历史预览：此处读取当前文件")}</p> : null}
          {fileError ? (
            <div role="alert">
              <p>{fileError}</p>
              <Button size="sm" variant="ghost" onClick={() => setRetry((value) => value + 1)}>
                {t("重试")}
              </Button>
              <Button size="sm" variant="ghost" onClick={closePreview}>
                {t("关闭预览")}
              </Button>
            </div>
          ) : (
            <>
              <FilePreview
                path={preview}
                content={content}
                onOpenExternally={onOpenExternally}
                onClosePreview={closePreview}
                readingExpanded={reading}
                onToggleReading={() => setReading((value) => !value)}
              />
              {!content ? (
                <Button size="sm" variant="ghost" onClick={closePreview}>
                  {t("关闭预览")}
                </Button>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </section>
  )
}
