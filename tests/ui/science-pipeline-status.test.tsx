import {render,screen} from '@testing-library/react'
import {expect,it} from 'vitest'
import {SciencePipelineStatus} from '../../src/ui/science-pipeline-status.js'
it('shows stage, bounded revisions and route conflict without claiming scientific certification',()=>{
 render(<SciencePipelineStatus pipeline={{version:1,requestId:'r',status:'completed',stage:'review',round:1,maxRevisions:1,currentTaskId:'review',taskIds:['check','analysis','review'],stateRevision:4,startedAt:1,updatedAt:2,routeSync:'conflict',route:{routeId:'route',revision:1,stepId:'s'}}}/>)
 expect(screen.getByRole('status').textContent).toContain('审阅');expect(screen.getByRole('status').textContent).toContain('1/1');expect(screen.getByRole('status').textContent).toContain('路线版本冲突')
})
