import type {TeamSnapshot} from '../protocol/index.js'
export function ScienceReuseStatus({batch:b}:{batch?:TeamSnapshot['scienceBatch']}){
 if(!b?.items.some(i=>i.reuse))return null
 const reused=b.items.filter(i=>i.reuse?.mode==='reused').length
 return <section className="science-acceptance-status science-reuse-status" aria-label="本次复用与重跑">
 <p><strong>本次：复用 {reused} 项，重跑 {b.total-reused} 项</strong></p>
 <p className="hint">复用项沿用已核验的历史文件与审阅；本次未重新分析，不计入新调用或用量。</p>
 <ul>{b.items.map(i=><li key={i.id} data-mode={i.reuse?.mode??'rerun'}><strong>{i.label}：{i.reuse?.mode==='reused'?'复用历史结果':'重新执行'}</strong><p>{i.reuse?.reason??'未指定复用来源'}</p>{i.reuse?.source?<details><summary>来源与保留的产物</summary><code>{i.reuse.source.teamId}</code> · 版本 {i.reuse.source.stateRevision} · 项 {i.reuse.source.itemId}<ul>{i.outputs?.map(path=><li key={path}><code>{path}</code></li>)}</ul></details>:null}</li>)}</ul>
 </section>
}
