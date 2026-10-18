import { useStore } from "@nanostores/react"
import { $routeViews, emptyRouteView, routeViewKey, setRouteView } from "./state/route-navigation.js"
import { AnalysisRouteStep } from "./analysis-route-step.js"
import { 返回图标 } from "./icons.js"
import { AnalysisRouteMap } from "./analysis-route-map.js"
import { routeFocus } from "./route-map-model.js"
import { useEffect, useLayoutEffect, useRef, useState } from "react"
import {
  type AnalysisRoute,
  type AnalysisRouteReadResult,
  type RouteAction,
} from "../protocol/analysis-route.js"
import { Button, EmptyState, Loader } from "./primitives.js"
import { FilePreview, type FileContent } from "./files.js"
import { t, tf } from "./i18n/index.js"

export const createRouteIntent =
  "请根据当前需求和数据条件建立会话分析路线。只规划，说明稳定步骤、输入、依赖、预期输出和候选案例，并等待我选步；本请求不批准执行、安装或科研文件写入，保留此前授权和方案门。"
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
  /** Explicit session/connection/workspace identity; never share browsing position across it. */
  scopeKey: string
  result: AnalysisRouteReadResult | undefined
  busy?: boolean | undefined
  workingStepId?: string | undefined
  awaitingInput?: boolean | undefined
  readOnly?: boolean | undefined
  onReload: () => Promise<void>
  onAction: (stepId: string, action: RouteAction, selection?: Selection) => Promise<void>
  onCreate: () => Promise<void>
  readFile: (path: string) => Promise<FileContent>
  loadGalleryRoots: () => Promise<Record<string, string>>
  onOpenWeb: (url: string) => void
  onOpenExternally: (path: string) => void
  onPrepareDelivery?: ((paths: string[]) => void) | undefined
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
  const views = useStore($routeViews)
  const viewKey = routeViewKey(props.scopeKey, result?.route?.routeId)
  const view = views.get(viewKey) ?? emptyRouteView
  const { version, reading } = view
  const updateView = (next: Partial<typeof view>) => setRouteView(viewKey, { ...view, ...next })
  const selectedRoute = version === "current" ? result?.route : result?.history?.find(item => String(item.revision) === version)
  const workingId = busy ? props.workingStepId : undefined
  const focusStep = selectedRoute ? routeFocus(selectedRoute, version === "current" ? workingId : undefined) : undefined
  const selectedStep = selectedRoute?.steps.find(step => step.id === view.stepId) ?? focusStep
  const preview = selectedStep?.deliverables.some(file => file.path === view.path) ? view.path : undefined
  const pane = useRef<HTMLElement>(null)
  const previousLevel = useRef({ viewKey, stepId: selectedStep?.id, path: preview })
  useLayoutEffect(() => {
    const previous = previousLevel.current
    previousLevel.current = { viewKey, stepId: selectedStep?.id, path: preview }
    if (previous.viewKey !== viewKey) return
    const buttons = [...(pane.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])]
    if (previous.path && !preview && selectedStep) {
      const target=buttons.find(button => button.getAttribute('aria-label') === previous.path)
      // PDF variants are folded on remount; reveal the parent before restoring focus.
      for(let parent=target?.parentElement;parent&&parent!==pane.current;parent=parent.parentElement){
        if(parent instanceof HTMLDetailsElement)parent.open=true
      }
      target?.focus()
    } else if (previous.stepId && !selectedStep) {
      buttons.find(button => button.dataset.routeStep === previous.stepId)?.focus()
    } else if (preview) {
      pane.current?.querySelector<HTMLButtonElement>('.route-back')?.focus({preventScroll:true})
    } else if (selectedStep) {
      pane.current?.querySelector<HTMLButtonElement>('[role="tab"][aria-selected="true"]')?.focus({preventScroll:true})
      const lower=pane.current?.querySelector<HTMLElement>('.route-lower')
      if(lower)lower.scrollTop=0
    }
  }, [viewKey, selectedStep?.id, preview])
  const [optionsOpen, setOptionsOpen] = useState(false)
  const optionsRoot = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!optionsOpen) return
    const outside = (event: PointerEvent) => { if (!optionsRoot.current?.contains(event.target as Node)) setOptionsOpen(false) }
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { setOptionsOpen(false); optionsRoot.current?.querySelector<HTMLButtonElement>("button")?.focus() } }
    document.addEventListener("pointerdown", outside); document.addEventListener("keydown", escape)
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape) }
  }, [optionsOpen])
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string>()
  const [roots, setRoots] = useState<Record<string, string>>({})
  const [rootsError, setRootsError] = useState<string>()
  const [rootsRetry, setRootsRetry] = useState(0)
  const [content, setContent] = useState<FileContent>()
  const [fileError, setFileError] = useState<string>()
  const [retry, setRetry] = useState(0)
  const mounted = useRef(true)
  const readRef = useRef(readFile)
  readRef.current = readFile
  useEffect(() => {
    if (!selectedRoute) return
    if (view.stepId && !selectedRoute.steps.some(step => step.id === view.stepId)) {
      setRouteView(viewKey, { ...view, stepId: undefined, path: undefined, reading: false })
    } else if (view.path && !preview) {
      setRouteView(viewKey, { ...view, path: undefined, reading: false })
    }
  }, [selectedRoute, selectedStep, preview, view, viewKey])
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
  }, [preview, retry, version, viewKey])
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
  const route = selectedRoute
  const closePreview = () => {
    updateView({ path: undefined, reading: false })
    setContent(undefined)
  }
  if (!route) return <div className="analysis-route-pane">
    <p role="alert">{t("历史版本暂不可用，请刷新或查看当前路线")}</p>
    <Button size="sm" variant="ghost" onClick={() => void run(onReload)}>{t("刷新路线")}</Button>
    <Button size="sm" variant="ghost" onClick={() => updateView({ version: "current", stepId: undefined, path: undefined, reading: false })}>{t("查看当前路线")}</Button>
  </div>
  const locked = Boolean(busy || readOnly || pending || historical)
  return <section ref={pane} className={`analysis-route-pane route-map-pane${preview ? " route-file-level" : ""}${preview && reading ? " route-reading" : ""}`} aria-label={t("分析路线详情")}>
    <div className="route-overview">
    <header className="route-map-head"><h2>{route.title}</h2>
      <div className="route-options" ref={optionsRoot}>
        <Button variant="ghost" size="icon" aria-label={t("路线选项")} aria-expanded={optionsOpen} onClick={()=>setOptionsOpen(!optionsOpen)}>⋯</Button>
        <div className="route-options-body" hidden={!optionsOpen}>
          <h3>{t("路线调整记录")}</h3>
          <label className="route-version"><span>{t("路线版本")}</span>
          <select className="control" aria-label={t("路线版本")} value={version} onChange={e=>{updateView({version:e.target.value,stepId:undefined,path:undefined,reading:false,tab:"log"});setOptionsOpen(false)}}>
            <option value="current">{tf("当前 · 第 {0} 版",current.revision)}</option>
            {result.history?.map(item=><option key={item.revision} value={String(item.revision)}>{tf("历史 · 第 {0} 版",item.revision)} · {new Date(item.updatedAt).toLocaleString()}</option>)}
          </select></label>
          <p>{route.goal}</p>
          {route.dataContext.length?<details><summary>{t("数据条件")}</summary><ul>{route.dataContext.map((text,i)=><li key={i}>{text}</li>)}</ul></details>:null}
          <Button size="sm" variant="ghost" disabled={pending} onClick={()=>void run(onReload)}>{t("刷新路线")}</Button>
        </div>
      </div>
    </header>
    <AnalysisRouteMap route={route} selectedId={selectedStep?.id} workingStepId={historical?undefined:workingId} awaitingInput={Boolean(props.awaitingInput)} onSelect={stepId=>updateView({stepId,tab:"log",path:undefined,reading:false})}/>
    </div>
    <div className={`route-lower${preview?" route-preview-lower":""}`}>
      {historical?<p className="route-notice">{preview?t("历史预览：此处读取当前文件"):t("历史版本只读。历史文件预览读取当前路径，不保存旧文件字节。")}</p>:null}
      {busy&&!workingId?<p className="route-notice">{t("会话忙碌，请等当前回合结束")}</p>:readOnly?<p className="route-notice">{t("会话只读，仍可查看路线和文件")}</p>:null}
      {props.awaitingInput&&workingId?<p className="route-notice">{t("请在主对话完成提问或权限确认。")}</p>:null}
      {feedback}
      {selectedStep?<div className="route-detail-context"><span>{selectedStep.id===focusStep?.id?t("当前步骤"):t("正在查看")} · {tf("第 {0} 步",route.steps.indexOf(selectedStep)+1)}</span>
        {selectedStep.id!==focusStep?.id?<Button size="sm" variant="text" onClick={()=>updateView({stepId:undefined,path:undefined,reading:false,tab:"log"})}>{t("回到当前步骤")}</Button>:null}
      </div>:null}
      {preview?<>
        <Button className="route-back" size="sm" variant="ghost" onClick={closePreview}><返回图标/>{tf("返回{0}",selectedStep!.title)}</Button>
        <p className="route-preview-path" hidden={reading}>{preview}</p>
        <div className="route-file-preview">
          {fileError?<div className="route-file-error" role="alert"><h3>{preview.split("/").pop()}</h3><p>{fileError}</p>
            <Button size="sm" variant="ghost" onClick={()=>setRetry(value=>value+1)}>{t("重试")}</Button><Button size="sm" variant="ghost" onClick={closePreview}>{t("关闭预览")}</Button>
          </div>:<><FilePreview path={preview} content={content} fitContainer onOpenExternally={onOpenExternally} onClosePreview={closePreview} readingExpanded={reading} onToggleReading={()=>updateView({reading:!reading})}/>
            {!content?<Button size="sm" variant="ghost" onClick={closePreview}>{t("关闭预览")}</Button>:null}</>}
        </div>
      </>:selectedStep?<AnalysisRouteStep route={route} step={selectedStep} tab={view.tab} onTab={tab=>updateView({tab})} historical={historical} workingStepId={historical?undefined:workingId} awaitingInput={Boolean(props.awaitingInput)} locked={locked} evidence={result.evidence} roots={roots} rootsError={rootsError} onRetryRoots={()=>setRootsRetry(value=>value+1)}
        onAction={(action,selection)=>{updateView({stepId:selectedStep.id});void run(()=>onAction(selectedStep.id,action,selection))}}
        onPrepareDelivery={props.onPrepareDelivery}
        onFile={path=>{updateView({path,reading:false});setRetry(value=>value+1)}} onOpenWeb={onOpenWeb} onTool={onTool} canLocateTool={props.canLocateTool}/>:null}
    </div>
  </section>
}
