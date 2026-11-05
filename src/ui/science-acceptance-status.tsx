import type {TeamSnapshot} from '../protocol/index.js'
import {scienceCheckLabel} from '../protocol/science-check-label.js'
export function ScienceAcceptanceStatus({tasks}:{tasks:TeamSnapshot['tasks']}){
 const rows=tasks.flatMap(task=>task.receipt?.acceptance?[{task,receipt:task.receipt.acceptance}]:[])
 if(!rows.length)return null
 const passed=rows.filter(r=>r.receipt.state==='passed').length
 return <section className="science-acceptance-status" aria-label="宿主验收">
  <p className="hint">宿主验收：{passed} 项通过，{rows.length-passed} 项受阻 · 程序检查不代替科学审查</p>
  {rows.map(({task,receipt})=><details key={task.id} open={receipt.state==='blocked'} className="science-acceptance-item" data-state={receipt.state}>
   <summary><strong>{task.subject}</strong>{task.reusedFrom?' · 历史证明（本次未执行）':''} · {receipt.state==='passed'?'规则通过':'规则受阻'}{receipt.numericChecked?' · 已核验数值':receipt.checks.some(c=>c.id==='numeric'&&c.state==='not_configured')?' · 数值核验未配置':''}</summary>
   <ul>{receipt.checks.filter(c=>receipt.state==='passed'||c.state!=='passed').map(c=><li key={c.id} data-check={c.id}>{scienceCheckLabel(c.id)}：{c.state==='passed'?'通过':c.state==='not_configured'?'未配置':'受阻'}{c.expected!==undefined?`；期望 ${c.expected}`:''}{c.actual!==undefined?`，实际 ${c.actual}`:''}{c.reason?`；${c.reason}`:''}</li>)}</ul>
   <details><summary>核对过的内容版本</summary><ul>{receipt.files.map(f=><li key={f.path}><code>{f.path}</code> · {f.sha256.slice(0,12)} · {f.bytes} bytes</li>)}</ul></details>
   <p className="hint">规则版本 {receipt.ruleVersion} · 已核对 {receipt.files.length} 个文件的内容版本</p>
  </details>)}
 </section>
}
