import {afterEach,expect,it,vi} from 'vitest'
import {act,cleanup,fireEvent,render,screen} from '@testing-library/react'
import {CollaborationEvidence} from '../../src/ui/collaboration-evidence.js'
import type {WorkbenchClient} from '../../src/ui/client.js'
afterEach(cleanup)
const receipt={version:1 as const,state:'blocked' as const,summary:'check',reason:'numeric mismatch',deliverables:[{stepId:'task',path:'result.json',state:'exists' as const}],versions:{version:1 as const,inputs:[],outputs:[{path:'result.json',sha256:'a'.repeat(64),bytes:10}]}}
it('shows the exact host IDs and receipt reason, marks preview as current, ignores late response after switching owner',async()=>{
 let resolve!:(v:unknown)=>void;const get=vi.fn(()=>new Promise(r=>{resolve=r})),client={get} as unknown as WorkbenchClient
 const view=render(<CollaborationEvidence client={client} sessionId="owner" receipt={receipt} trace={{records:[{toolCallId:'actual-call',name:'read',status:'done',execution:'not_observed',path:'input.csv'}],omitted:3}} tab="artifacts"/>)
 expect(screen.getByText('numeric mismatch')).toBeTruthy();expect(screen.getByText('a'.repeat(64))).toBeTruthy()
 fireEvent.click(screen.getByRole('button',{name:'预览当前文件：result.json'}));expect(get).toHaveBeenCalledWith('readFile',{sessionId:'owner',path:'result.json'})
 view.rerender(<CollaborationEvidence client={client} sessionId="other" tab="artifacts"/>)
 await act(async()=>resolve({kind:'text',mediaType:'text/plain',bytes:6,text:'secret'}))
 expect(screen.queryByText('secret')).toBeNull()
 view.rerender(<CollaborationEvidence client={client} sessionId="other" tab="records" trace={{records:[{toolCallId:'actual-call',name:'read',status:'done',execution:'not_observed',path:'input.csv'}],omitted:3}}/>)
 expect(screen.getByText('actual-call')).toBeTruthy();expect(screen.getByText(/已省略 3 条/)).toBeTruthy()
})
it('shows no forged records when a task has no recorded evidence',()=>{
 render(<CollaborationEvidence client={{get:vi.fn()} as unknown as WorkbenchClient} sessionId="p" tab="records"/>)
 expect(screen.getByText('此任务没有保留工具证据摘要；可查看原始过程。')).toBeTruthy()
})
it('keeps current previews open across polling with an equivalent receipt object',async()=>{
 const client={get:vi.fn().mockResolvedValue({kind:'text',mediaType:'text/plain',bytes:7,text:'visible'})} as unknown as WorkbenchClient
 const view=render(<CollaborationEvidence client={client} sessionId="p" receipt={receipt} tab="artifacts"/>)
 fireEvent.click(screen.getByRole('button',{name:'预览当前文件：result.json'}));await act(async()=>{})
 view.rerender(<CollaborationEvidence client={client} sessionId="p" receipt={structuredClone(receipt)} tab="artifacts"/>)
 expect(screen.getByText('visible')).toBeTruthy()
})
it('opens retained bytes through the retained list and restores the history trigger on return',async()=>{
 const observation={id:'o',projectId:'p',workspace:'/w',sessionId:'p',fileId:'f',path:'result.json',sha256:'a'.repeat(64),bytes:3,createdAt:'2026-11-07T00:00:00Z',relation:'write',attribution:'observed',gaps:[]}
 const group={id:'g',projectId:'p',requestId:'r',name:'saved version',createdAt:'2026-11-07T00:00:00Z',state:'ready',members:[{id:'m',observation,inputs:[],sha256:observation.sha256,bytes:3}]}
 const get=vi.fn(async(op:string)=>op==='listRetainedResults'?{supported:true,results:[group]}:{path:'result.json',content:{kind:'text',mediaType:'text/plain',bytes:3,text:'retained bytes'}}),client={get} as unknown as WorkbenchClient
 render(<CollaborationEvidence client={client} sessionId="p" receipt={receipt} tab="artifacts"/>)
 const trigger=screen.getByRole('button',{name:'查看文件留存：result.json'});fireEvent.click(trigger);await act(async()=>{})
 fireEvent.click(screen.getByRole('button',{name:'打开已保留文件 result.json'}));await act(async()=>{})
 expect(get).toHaveBeenCalledWith('readRetainedArtifact',{sessionId:'p',retainedId:'g',memberId:'m'})
 expect(screen.getByText('retained bytes')).toBeTruthy();expect(screen.getByText('正在查看留存副本，工作区当前文件可能不同')).toBeTruthy()
 expect(screen.queryByRole('button',{name:'删除这份留存'})).toBeNull()
 fireEvent.click(screen.getByRole('button',{name:'回到产物'}));expect(document.activeElement).toBe(trigger)
})
it('resolves report plots and script links through the same owner workspace without execution',async()=>{
 const markdown='![plot](../figures/plot.png)\n\n[analysis script](../scripts/analyse.py)'
 const get=vi.fn(async(_op:string,{path}:{path:string})=>path==='reports/report.md'?{kind:'text',mediaType:'text/markdown',bytes:markdown.length,text:markdown}:path==='figures/plot.png'?{kind:'image',mediaType:'image/png',base64:'cG5n',bytes:3}:{kind:'text',mediaType:'text/plain',text:'print(42)',bytes:9})
 const r={...receipt,versions:undefined,deliverables:[{stepId:'task',path:'reports/report.md',state:'exists' as const}]}
 render(<CollaborationEvidence client={{get} as unknown as WorkbenchClient} sessionId="owner" receipt={r} tab="artifacts"/>)
 fireEvent.click(screen.getByRole('button',{name:'预览当前文件：reports/report.md'}));await act(async()=>{})
 expect((await screen.findByRole('img',{name:'plot'})).getAttribute('src')).toBe('data:image/png;base64,cG5n')
 fireEvent.click(screen.getByRole('link',{name:'analysis script'}));await act(async()=>{})
 expect(get).toHaveBeenCalledWith('readFile',{sessionId:'owner',path:'scripts/analyse.py'})
 expect(document.querySelector('.collaboration-file-preview')?.textContent).toContain('print(42)');expect(get.mock.calls.every(c=>c[0]==='readFile')).toBe(true)
})
it('can close a pending or failed current-file preview and does not reopen for late completion',async()=>{
 let finish!:(value:unknown)=>void
 const get=vi.fn(()=>new Promise(r=>finish=r)),client={get} as unknown as WorkbenchClient
 render(<CollaborationEvidence client={client} sessionId="owner" receipt={receipt} tab="artifacts"/>)
 const trigger=screen.getByRole('button',{name:'预览当前文件：result.json'});fireEvent.click(trigger)
 fireEvent.click(screen.getByRole('button',{name:'收起预览'}));expect(document.activeElement).toBe(trigger)
 await act(async()=>finish({kind:'text',mediaType:'text/plain',text:'late body',bytes:9}))
 expect(screen.queryByText('late body')).toBeNull()
})
it('closes a failed current-file read and returns focus to its original artifact row',async()=>{
 const client={get:vi.fn().mockRejectedValue(new Error('file missing'))} as unknown as WorkbenchClient
 render(<CollaborationEvidence client={client} sessionId="owner" receipt={receipt} tab="artifacts"/>)
 const trigger=screen.getByRole('button',{name:'预览当前文件：result.json'});fireEvent.click(trigger);await act(async()=>{})
 expect(screen.getByRole('alert').textContent).toBe('file missing')
 fireEvent.click(screen.getByRole('button',{name:'收起预览'}));expect(document.activeElement).toBe(trigger)
 expect(screen.queryByRole('alert')).toBeNull()
})
