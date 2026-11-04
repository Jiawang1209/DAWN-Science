import type {TeamSnapshot} from '../protocol/index.js'
const states={running:'进行中',blocked:'受阻',interrupted:'已中断，待核对恢复',completed:'交付检查通过',cancelled:'已取消'} as const
const stages={check:'数据核查',analyze:'分析执行',review:'审阅'} as const
export function SciencePipelineStatus({pipeline:p,tasks=[]}:{pipeline?:TeamSnapshot['pipeline'];tasks?:TeamSnapshot['tasks']}){
 if(!p)return null
 const observations=tasks.filter(t=>p.taskIds.includes(t.id)).flatMap(t=>t.observation?[t.observation]:[])
 const attempts=observations.reduce((n,o)=>n+o.submissionAttempts,0),invalid=observations.reduce((n,o)=>n+o.invalidSubmissions,0)
 const tokens=observations.reduce((n,o)=>n+(o.usage?.input??0)+(o.usage?.output??0),0)
 const hasUsage=observations.some(o=>o.usage?.input!==undefined||o.usage?.output!==undefined)
 return <p className="hint science-pipeline-status" role="status">科研流程：{stages[p.stage]} · 修正 {p.round}/{p.maxRevisions} · {states[p.status]}{p.routeSync==='conflict'?' · 路线版本冲突，结果待核对合并':''}{observations.length?<span> · 阶段耗时 {Math.round(observations.reduce((n,o)=>n+o.elapsedMs,0))} ms · 提交 {attempts} 次 · 格式退回 {invalid} 次{hasUsage?` · 可见 token ${tokens}`:' · token 未知'}</span>:null}{p.reason?<span> · {p.reason}</span>:null}</p>
}
