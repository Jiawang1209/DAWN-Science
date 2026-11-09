import {useCollaborationView} from './state/collaboration-view.js'
/** User confirmation records planning metadata only; execution keeps the existing approval path. */
import {useEffect,useRef,useState} from 'react'
import type {WorkbenchClient} from './client.js'
import {PlanningContractSelectionSchema,PlanningSourceStateSchema,type PlanningContractSelection,type PlanningSourceState} from '../protocol/planning-contract-source.js'
import {AnalysisRouteReadResultSchema,type AnalysisRoute} from '../protocol/analysis-route.js'
import {Button} from './primitives.js'
import {t,tf} from './i18n/index.js'
type Props={cancelVersion?:number|undefined;client:WorkbenchClient;ownerSessionId:string;disabled:boolean;onConfirm:(selection:PlanningContractSelection|null,revision:number,signal:AbortSignal)=>Promise<PlanningSourceState>}
export function PlanningContractSourceForm(props:Props){return <SourceForm key={props.ownerSessionId} {...props}/>}
function SourceForm({client,ownerSessionId,disabled,onConfirm,cancelVersion=0}:Props){
 const view=useCollaborationView(ownerSessionId),cached=useRef(view.planningConstraints?.draft)
 const[state,setState]=useState<PlanningSourceState>(),[route,setRoute]=useState<AnalysisRoute>(),[step,setStep]=useState(''),[error,setError]=useState(''),[unsupported,setUnsupported]=useState(''),[pending,setPending]=useState(false),[saved,setSaved]=useState(false),[cleared,setCleared]=useState(false)
 const[inputs,setInputs]=useState(''),[root,setRoot]=useState(''),[method,setMethod]=useState(''),[units,setUnits]=useState(''),[missing,setMissing]=useState(''),[execute,setExecute]=useState(true),[review,setReview]=useState(false)
 const[numeric,setNumeric]=useState(false),[dataPath,setDataPath]=useState(''),[column,setColumn]=useState(''),[metric,setMetric]=useState<'mean'|'sum'|'min'|'max'>('mean'),[missingRule,setMissingRule]=useState<''|'drop'|'block'>('')
 const current=useRef<AbortController|undefined>(undefined),[reload,setReload]=useState(0),[tolerance,setTolerance]=useState('1e-9'),readClient=useRef(client),readCancel=useRef(cancelVersion)
 useEffect(()=>{let active=true
  if(readClient.current!==client||readCancel.current!==cancelVersion){cached.current=view.planningConstraints?.draft;readClient.current=client;readCancel.current=cancelVersion}
  setUnsupported('');setState(undefined);setRoute(undefined);setPending(false);setSaved(false)
  void client.get('getPlanningContractSource',{sessionId:ownerSessionId}).then(raw=>{
   if(!active)return;const next=PlanningSourceStateSchema.parse(raw);setState(next);const source=next.source
   const draft=cached.current
   if(draft?.revision===next.revision){setInputs(draft.inputs);setRoot(draft.root);setMethod(draft.method);setUnits(draft.units);setMissing(draft.missing);setExecute(draft.execute);setReview(draft.review);setStep(draft.step);setNumeric(draft.numeric);setDataPath(draft.dataPath);setColumn(draft.column);setMetric(draft.metric);setMissingRule(draft.missingRule);setTolerance(draft.absoluteTolerance??String(source?.template.validation?.absoluteTolerance??1e-9))}
   else if(source){setInputs(source.inputs.join('\n'));setRoot(source.outputRoot);setMethod(source.template.method);setUnits(source.template.units);setMissing(source.template.missingValues);setExecute(source.requireExecution);setReview(source.independentReview);setStep(source.route?.stepId??'');setNumeric(!!source.template.validation);setDataPath(source.dataPath??'');if(source.template.validation){setColumn(source.template.validation.column);setMetric(source.template.validation.metric);setMissingRule(source.template.validation.missing);setTolerance(String(source.template.validation.absoluteTolerance))}}
  }).catch(e=>{if(active)setUnsupported(e instanceof Error?e.message:String(e))})
  void client.get('getAnalysisRoute',{sessionId:ownerSessionId}).then(raw=>{if(active){const read=AnalysisRouteReadResultSchema.safeParse(raw);if(read.success)setRoute(read.data.route)}}).catch(()=>{})
  return()=>{active=false;current.current?.abort();current.current=undefined}
 },[client,ownerSessionId,reload,cancelVersion])
 useEffect(()=>{
  if(!state)return
  view.update({planningConstraints:{open:view.planningConstraints?.open??false,draft:{absoluteTolerance:tolerance,revision:state.revision,inputs,root,method,units,missing,execute,review,numeric,dataPath,column,metric,missingRule,step}}})
 },[state?.revision,inputs,root,method,units,missing,execute,review,numeric,dataPath,column,metric,missingRule,step,tolerance])
 useEffect(()=>{setSaved(false)},[inputs,root,method,units,missing,execute,review,numeric,dataPath,column,metric,missingRule,step,tolerance])
 const chosen=route?.steps.find(s=>s.id===step)
 const routeBinding=chosen&&route?{routeId:route.routeId,revision:route.revision,stepId:chosen.id}:state?.source?.route?.stepId===step?state.source.route:undefined
 const inputPaths=inputs.split('\n').map(s=>s.trim()).filter(Boolean)
 const activeDataPath=numeric?dataPath:state?.source?.dataPath&&inputPaths.includes(state.source.dataPath)?state.source.dataPath:undefined
 const candidate=PlanningContractSelectionSchema.safeParse({template:{id:'tabular-ecology',version:1,language:'python',method,units,missingValues:missing,...(numeric?{validation:{version:1,column,metric,unit:units,missing:missingRule,absoluteTolerance:Number(tolerance)}}:{})},inputs:inputPaths,outputRoot:root,requireExecution:execute,independentReview:review,...(activeDataPath?{dataPath:activeDataPath}:{}),...(routeBinding?{route:routeBinding}:{})})
 const source=state?.source
 const confirmed=source?PlanningContractSelectionSchema.parse({template:source.template,inputs:source.inputs,outputRoot:source.outputRoot,requireExecution:source.requireExecution,independentReview:source.independentReview,...(source.dataPath?{dataPath:source.dataPath}:{}),...(source.route?{route:source.route}:{})}):undefined
 const dirty=!!confirmed&&(!candidate.success||JSON.stringify(candidate.data)!==JSON.stringify(confirmed))
 const draftOnly=!source&&!!(inputs.trim()||root.trim()||method.trim()||units.trim()||missing.trim()||numeric||review||!execute||step)
 const saveSource=async(clear=false)=>{
  if(disabled||current.current||!state||unsupported)return
  let selection:PlanningContractSelection|null=null
  if(!clear){
   if(step&&(!route||!chosen||chosen.status==='skipped')){setError(t("关联路线暂不可用，请重新读取并核对；不会自动取消路线绑定。"));return}
   if(!inputs.trim()||!root.trim()||!method.trim()||!units.trim()||!missing.trim()||numeric&&(!column.trim()||!dataPath.trim()||!missingRule)){setError(t("请补齐输入、产物目录、方法、单位和缺失值处理；数值核验还需要数据文件、列名和规则。"));return}
   if(numeric&&!tolerance.trim()){setError(t("请填写有效的数值绝对误差上限。"));return}
   if(!candidate.success){setError(candidate.error.issues.map(i=>i.message).join('；'));return}selection=candidate.data
  }
  const controller=new AbortController();current.current=controller;setPending(true);setError('');setSaved(false)
  try{const next=await onConfirm(selection,state.revision,controller.signal);if(!controller.signal.aborted){setState(PlanningSourceStateSchema.parse(next));setCleared(clear);setSaved(true)}}
  catch(e){if(!controller.signal.aborted)setError(e instanceof Error?e.message:String(e))}
  finally{if(current.current===controller){current.current=undefined;if(!controller.signal.aborted)setPending(false)}}
 }
 const locked=disabled||pending||!state||!!unsupported
 const field=(name:string,value:string,set:(value:string)=>void,multiline=false)=><label>{name}{multiline?
    <textarea className="control" aria-label={name} rows={2} value={value} onChange={e=>set(e.target.value)} disabled={locked}/>:
    <input className="control" aria-label={name} value={value} maxLength={2000} onChange={e=>set(e.target.value)} disabled={locked}/>}</label>
 return <details className="planning-contract-source" open={view.planningConstraints?.open??false} onToggle={e=>{if(e.currentTarget.open!==(view.planningConstraints?.open??false))view.update({planningConstraints:{...view.planningConstraints,open:e.currentTarget.open}})}}><summary onClick={e=>{e.preventDefault();view.update({planningConstraints:{...view.planningConstraints,open:!(view.planningConstraints?.open??false)}})}}>{t("科研任务约束")}{state?.source?` · ${tf("第 {0} 版",state.revision)}`:''}</summary>
  <p className="hint">{t("表格科研 · Python。确认方法、单位和交付要求后，模型可查询可信契约目录；任务数量仍由具体任务决定。")}</p>
  <Button variant="ghost" size="sm" disabled={disabled||pending} onClick={()=>{cached.current=undefined;setSaved(false);setError('');setReload(v=>v+1)}}>{t("重新读取约束")}</Button>
  {unsupported?<p role="status">{unsupported} · {t("仍可使用普通自动安排。")}</p>:<>
   {route?<label>{t("关联分析路线步骤")}
    <select className="control" aria-label={t("关联分析路线步骤")} value={step} disabled={locked} onChange={e=>{setStep(e.target.value);const chosen=route.steps.find(s=>s.id===e.target.value);if(chosen)setInputs(chosen.inputs.join('\n'))}}><option value="">{t("不关联路线")}</option>{route.steps.filter(s=>s.status!=='skipped').map(s=><option key={s.id} value={s.id}>{s.title}</option>)}</select></label>:null}
   <div className="planning-contract-grid">
    {field(t("输入文件（每行一个）"),inputs,setInputs,true)}{field(t("产物目录"),root,setRoot)}{field(t("分析方法"),method,setMethod)}{field(t("数据单位"),units,setUnits)}{field(t("缺失值处理"),missing,setMissing)}
   </div>
   <label>
    <input className="control" type="checkbox" checked={numeric} disabled={locked} onChange={e=>setNumeric(e.target.checked)}/>{t("增加独立数值核验")}</label>
   {numeric?<div className="planning-contract-grid">{field(t("核验数据文件"),dataPath,setDataPath)}{field(t("核验列名"),column,setColumn)}{field(t("数值绝对误差上限"),tolerance,setTolerance)}<label>{t("核验指标")}
    <select className="control" aria-label={t("核验指标")} value={metric} disabled={locked} onChange={e=>setMetric(e.target.value as typeof metric)}>{['mean','sum','min','max'].map(s=><option key={s}>{s}</option>)}</select></label><label>{t("数值缺失规则")}
    <select className="control" aria-label={t("数值缺失规则")} value={missingRule} disabled={locked} onChange={e=>setMissingRule(e.target.value as typeof missingRule)}><option value="">{t("请选择")}</option><option value="block">{t("遇到缺失时停止")}</option><option value="drop">{t("排除缺失值后计算")}</option></select></label></div>:null}
   <div className="planning-contract-options"><label>
    <input className="control" type="checkbox" checked={execute} disabled={locked} onChange={e=>setExecute(e.target.checked)}/>{t("要求真实执行证据")}</label><label>
    <input className="control" type="checkbox" checked={review} disabled={locked} onChange={e=>setReview(e.target.checked)}/>{t("要求独立审阅")}</label></div>
   <p className="hint">{t("产物：analysis.py、result.json、report.md，保存在指定目录。确认只保存约束，不运行任务。")}</p>
   <div className="orchestration-advisor-actions"><Button size="sm" variant="outline" disabled={locked} onClick={()=>{void saveSource()}}>{pending?t("正在保存…"):t("确认约束")}</Button>{state&&state.revision>0?<Button size="sm" variant="ghost" disabled={locked} onClick={()=>{void saveSource(true)}}>{t("清除约束")}</Button>:null}</div>
   {dirty?<p role="status">{tf("存在尚未确认的修改；自动安排仍使用已确认的第 {0} 版约束。请先确认修改或重新读取。",state!.revision)}</p>:saved&&cleared?<p role="status">{t("已清除科研约束，请重新安排；已批准任务仍保留原冻结快照。")}</p>:draftOnly&&!saved?<p role="status">{t("约束草稿尚未确认，普通自动安排不会采用这些字段。")}</p>:saved?<p role="status">{t("约束已保存，请重新安排；旧方案需重新生成，已批准任务保持原冻结快照。")}</p>:state?.source?<p role="status">{tf("已确认第 {0} 版约束。生成安排后，仍需单独采纳方案。",state.revision)}</p>:null}
   {state?.issue?<p role="alert">{state.issue}</p>:null}
  </>}
  {error?<p role="alert">{error}</p>:null}
 </details>
}
