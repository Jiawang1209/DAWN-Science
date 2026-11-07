import {afterEach,expect,it,vi} from 'vitest'
import {cleanup,render,screen,act,fireEvent} from '@testing-library/react'
import {RunOverview} from '../../src/ui/run-overview.js'
import type {WorkbenchClient} from '../../src/ui/client.js'
import type {RunOverview as Snapshot} from '../../src/protocol/run-overview.js'
import {captureEvidenceHandoff} from '../../src/subagent/handoff-sources.js'
import {handoffRouteLines} from '../../src/ui/handoff-route.js'
afterEach(cleanup)
it('presents route evidence as readable fields rather than raw implementation JSON',()=>{
 const lines=handoffRouteLines(JSON.stringify({title:'碳分析',goal:'按约定方法统计',step:{title:'统计',purpose:'保留单位',inputs:['in.csv'],outputs:['result.json']}}))
 expect(lines.join('\n')).toContain('步骤目的：保留单位')
 expect(lines.join('\n')).toContain('输入：in.csv')
 expect(lines.join('\n')).not.toContain('"step"')
 expect(handoffRouteLines('invalid')).toEqual(['历史路线内容无法呈现，请核对引用原文'])
})
it('labels evidence handoff as historical references without implying approval or live file validity',async()=>{
 const data=snapshot('p');data.runs[0]!.handoff=captureEvidenceHandoff('p',[{type:'message',id:'early',message:{role:'user',content:'早期批准方法与单位'}}],{recentMessages:1,messageIds:['early']},{})
 render(<RunOverview client={{get:vi.fn().mockResolvedValue(data)} as unknown as WorkbenchClient} sessionId="p"/>);await act(async()=>{})
 fireEvent.click(screen.getByRole('tab',{name:'交接'}))
 expect(screen.getByText(/历史版本尚未重新核验/)).toBeTruthy()
 expect(screen.getByText('早期批准方法与单位')).toBeTruthy()
 expect(screen.getByText(/交接总计/)).toBeTruthy()
})
function deferred(){let resolve!:(s:Snapshot)=>void;const promise=new Promise<Snapshot>(r=>resolve=r);return{promise,resolve}}
const snapshot=(ownerSessionId:string):Snapshot=>({ownerSessionId,source:'live',runs:[{id:'child',kind:'subagent',label:ownerSessionId+' reader',address:['call','0'],state:'running',phase:'stopping',epoch:3,updatedAt:1,contract:true,receipt:'blocked',inputVersions:1,outputVersions:0}]})
it('shows real drain and acceptance facts, routes transcript selection, and drops stale owner replies',async()=>{
 const a=deferred(),b=deferred(),view=vi.fn(),get=vi.fn().mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise),client={get} as unknown as WorkbenchClient
 const rendered=render(<RunOverview client={client} sessionId="a" onView={view}/>)
 rendered.rerender(<RunOverview client={client} sessionId="b" onView={view}/>)
 await act(async()=>a.resolve(snapshot('a')))
 expect(screen.queryByText('a reader')).toBeNull()
 await act(async()=>b.resolve(snapshot('b')))
 expect(screen.getAllByText('停止中，等待进程排空')[0]).toBeTruthy()
 expect(screen.queryByText(/宿主验收阻塞/)).toBeNull()
 expect(screen.getByText('暂无宿主验收回执')).toBeTruthy()
 fireEvent.click(screen.getByRole('button',{name:'查看子任务过程'}))
 expect(view).toHaveBeenCalledWith('b#sub:call:0')
 rendered.unmount();expect(get).toHaveBeenCalledTimes(2)
})
it('reports read failures instead of keeping a stale success',async()=>{
 const get=vi.fn().mockRejectedValue(new Error('corrupt record'))
 render(<RunOverview client={{get} as unknown as WorkbenchClient} sessionId="p"/>)
 await act(async()=>{})
 expect(screen.getByRole('alert').textContent).toBe('corrupt record')
})
it('shows lock blockers and bounded host history without calling a historical holder live',async()=>{
 const data=snapshot('p');data.runs[0]!.phase='running';data.runs[0]!.activity={stage:'lock-wait',since:1,blockers:[{ownerSessionId:'other',childId:'holder',label:'writer',epoch:2}]}
 data.history={events:[{seq:4,at:1,type:'stage',childId:'child',epoch:3,stage:'lock-wait'}],truncated:true}
 const client={get:vi.fn().mockResolvedValue(data)} as unknown as WorkbenchClient
 const view=render(<RunOverview client={client} sessionId="p"/>)
 await act(async()=>{})
 expect(view.container.querySelector('.run-activity')?.textContent).toContain('等待产物锁')
 expect(screen.getByText(/writer.*代次 2/)).toBeTruthy()
 fireEvent.click(screen.getAllByText('关键执行历史')[0]!)
 expect(screen.getAllByText(/较早历史已省略/)[0]).toBeTruthy()
 view.unmount();data.source='disk'
 render(<RunOverview client={client} sessionId="p"/>);await act(async()=>{})
 expect(screen.getByText(/历史阶段.*等待产物锁/)).toBeTruthy()
 expect(screen.queryByText(/^等待者当前被/)).toBeNull()
})
