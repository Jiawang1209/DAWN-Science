import {expect,it} from 'vitest'
import {render,screen,fireEvent} from '@testing-library/react'
import {vi} from 'vitest'
import {collaborationTaskKey} from '../../src/ui/collaboration-model.js'
import {CollaborationWorkflow} from '../../src/ui/collaboration-workflow.js'
import type {TeamSnapshot} from '../../src/protocol/index.js'
import type {RunOverview} from '../../src/protocol/run-overview.js'
const task=(id:string,deps:string[]):TeamSnapshot['tasks'][number]=>({id,subject:id,dependencies:deps,status:'pending',attempt:1,createdAt:1,updatedAt:1})
const team:TeamSnapshot={id:'team',captainSessionId:'p',name:'test',goal:'goal',createdAt:1,members:[],tasks:[task('check',[]),task('analyze',['check']),task('review',['analyze'])],messages:[],taskSeq:3}
const snapshot:RunOverview={ownerSessionId:'p',source:'live',runs:[]}
it('draws only actual task dependencies and routes selection by task ID',()=>{
 const choose=vi.fn();const view=render(<CollaborationWorkflow snapshot={snapshot} team={team} selected={collaborationTaskKey('team','analyze')} onSelect={choose}/>);
 expect(view.container.querySelectorAll('[data-workflow-edge]')).toHaveLength(2)
 fireEvent.click(screen.getByRole('button',{name:'review'}));expect(choose).toHaveBeenCalledWith(collaborationTaskKey('team','review'),screen.getByRole('button',{name:'review'}))
 expect(view.container.querySelector('[data-task-id="analyze"]')?.getAttribute('aria-pressed')).toBe('true')
})
it('ignores foreign team snapshots and never fabricates dependencies for ordinary delegates',()=>{
 const runs:RunOverview['runs']= ['one','two'].map(id=>({id,kind:'subagent',label:id,address:['x','0'],state:'running',phase:'running',epoch:1,updatedAt:1,contract:false,inputVersions:0,outputVersions:0}))
 const view=render(<CollaborationWorkflow snapshot={{...snapshot,runs}} team={{...team,captainSessionId:'foreign'}} onSelect={()=>{}}/>);
 expect(view.container.querySelectorAll('[data-workflow-edge]')).toHaveLength(0)
 expect(screen.queryByRole('button',{name:'analyze'})).toBeNull()
 expect(screen.getByText('未声明任务依赖；这些执行记录按并列展示')).toBeTruthy()
})
it('links the owning coordinator to direct delegates, provides search and status filters without inventing token totals',()=>{
 const choose=vi.fn(),runs:RunOverview['runs']=['reader','reviewer'].map((id,n)=>({id,kind:'subagent',label:id,address:['call',String(n)],state:n?'completed':'running',phase:n?'drained':'running',epoch:1,updatedAt:1,contract:false,inputVersions:0,outputVersions:0}))
 const view=render(<CollaborationWorkflow snapshot={{...snapshot,runs}} onSelect={choose}/>);
 expect(view.container.querySelectorAll('[data-lineage-edge]')).toHaveLength(2)
 fireEvent.change(screen.getByRole('searchbox',{name:'搜索协作成员'}),{target:{value:'reader'}})
 expect(view.container.querySelectorAll('[data-member-card]')).toHaveLength(1)
 fireEvent.click(screen.getByRole('button',{name:'只看已结束'}));expect(view.container.querySelectorAll('[data-member-card]')).toHaveLength(0)
 expect(screen.getByText('暂无匹配成员')).toBeTruthy()
 expect(screen.getAllByText('用量未记录').length).toBeGreaterThan(0)
})
