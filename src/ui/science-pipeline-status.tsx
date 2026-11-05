import type {TeamSnapshot} from '../protocol/index.js'
const states={running:'进行中',blocked:'受阻',interrupted:'已中断，待核对恢复',completed:'交付检查通过',cancelled:'已取消'} as const
const stages={check:'数据核查',analyze:'分析执行',review:'审阅'} as const
export function SciencePipelineStatus({pipeline:p,tasks=[],batch:b}:{pipeline?:TeamSnapshot['pipeline'];tasks?:TeamSnapshot['tasks'];batch?:TeamSnapshot['scienceBatch']}){
 if(!p)return null
 const observations=tasks.filter(t=>!t.reusedFrom&&(b||p.taskIds.includes(t.id))).flatMap(t=>t.observation?[t.observation]:[])
 const attempts=observations.reduce((n,o)=>n+o.submissionAttempts,0),invalid=observations.reduce((n,o)=>n+o.invalidSubmissions,0)
 const tokens=observations.reduce((n,o)=>n+(o.usage?.input??0)+(o.usage?.output??0),0)
 const hasUsage=observations.some(o=>o.usage?.input!==undefined||o.usage?.output!==undefined)
 return <p className="hint science-pipeline-status" role="status">{b?`科研批量：${b.template.id}@${b.template.version} · 并发上限 ${b.concurrency??1} · 活动 ${b.active??(b.status==='running'?1:0)} · 已完成 ${b.completed}/${b.total} · ${b.status==='aggregating'?'汇总中':b.status==='completed'?'检查通过':b.status==='interrupted'?'已中断，待核对恢复':b.status==='blocked'?'受阻':b.status==='cancelled'?'已取消':'执行中'} · `:'科研流程：'}{stages[p.stage]} · 修正 {p.round}/{p.maxRevisions} · {states[p.status]}{(b?b.status==='completed':p.status==='completed')&&p.routeSync==='pending'?' · 正在核验内容与写回路线':''}{p.contentVersionBound?' · 内容版本已绑定':' · 旧记录未绑定内容版本'}{p.routeSync==='conflict'?' · 内容或路线版本冲突，结果待核对合并':''}{observations.length?<span> · 阶段耗时 {Math.round(observations.reduce((n,o)=>n+o.elapsedMs,0))} ms · 提交 {attempts} 次 · 格式退回 {invalid} 次{hasUsage?` · 可见 token ${tokens}`:' · token 未知'}</span>:null}{b?.concurrency===2?<span> · 各项：{b.items.map(i=>`${i.label} ${i.stage?stages[i.stage]+' / ':''}${i.status}`).join('；')}</span>:null}{b?.status==='completed'?<span> · 汇总：{b.summaryOutputs.join('、')}</span>:null}{(b?.reason??p.reason)?<span> · {b?.reason??p.reason}</span>:null}</p>
}
