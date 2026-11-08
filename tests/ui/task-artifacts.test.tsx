import {afterEach,expect,it,vi} from 'vitest'
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {ArtifactsPanel} from '../../src/ui/artifacts.js'
import type {TaskArtifact} from '../../src/protocol/task-artifacts.js'
afterEach(cleanup)
const file:TaskArtifact={path:'result.csv',kind:'table',ownerSessionId:'owner',target:{kind:'run',id:'run',epoch:2},version:{path:'result.csv',sha256:'a'.repeat(64),bytes:3},source:'live',acceptance:'accepted',scope:'final'}
const props={readFile:vi.fn().mockResolvedValue({kind:'text',text:'x\n1',bytes:3}),onOpenInFiles:vi.fn(),onOpenExternally:vi.fn()}
it('lists accepted child files without a forged main Run and preserves all version sources in preview',async()=>{
 const check=vi.fn().mockResolvedValue({state:'matches',checkedAt:'2026-11-08T00:00:00.000Z'})
 render(<ArtifactsPanel {...props} data={{artifacts:[],unknown:[],taskArtifacts:[file,{...file,target:{kind:'run',id:'other',epoch:1},version:{...file.version,sha256:'b'.repeat(64)},scope:'stage'}]}} checkTaskArtifact={check}/>)
 expect(screen.getByText('任务验收')).toBeTruthy();fireEvent.click(screen.getByRole('button',{name:'result.csv'}))
 await screen.findByRole('region',{name:'任务验收版本'})
 expect(screen.getByText('最终成果')).toBeTruthy();expect(screen.getByText('阶段产物')).toBeTruthy();expect(screen.getAllByText('当前内容未核对')).toHaveLength(2)
 fireEvent.click(screen.getAllByRole('button',{name:/核对当前内容/})[0]!)
 await screen.findByText('本次核对与验收内容一致');expect(check).toHaveBeenCalledWith(file)
 expect(screen.getByText('验收记录属于历史结算；预览读取当前工作区内容。')).toBeTruthy()
})
it('discards a late content-check result after switching owner/version',async()=>{
 let finish!:(value:unknown)=>void;const check=vi.fn(()=>new Promise<any>(r=>finish=r))
 const {rerender}=render(<ArtifactsPanel {...props} data={{artifacts:[],unknown:[],taskArtifacts:[file]}} checkTaskArtifact={check}/>)
 fireEvent.click(screen.getByRole('button',{name:'result.csv'}));await screen.findByRole('region',{name:'任务验收版本'})
 fireEvent.click(screen.getByRole('button',{name:/核对当前内容/}))
 rerender(<ArtifactsPanel {...props} data={{artifacts:[],unknown:[],taskArtifacts:[{...file,ownerSessionId:'other',version:{...file.version,sha256:'c'.repeat(64)}}]}} checkTaskArtifact={check}/>)
 await act(async()=>finish({state:'matches',checkedAt:'2026-11-08T00:00:00.000Z'}))
 await waitFor(()=>expect(screen.queryByText('本次核对与验收内容一致')).toBeNull())
})
