import {render,screen} from '@testing-library/react'
import {expect,it} from 'vitest'
import {ScienceAcceptanceStatus} from '../../src/ui/science-acceptance-status.js'
import type {TeamSnapshot} from '../../src/protocol/index.js'
it('shows the actual host rule, expected and actual values, without a success claim',()=>{
 const tasks=[{id:'analysis-a',subject:'样地 A · 分析',status:'failed',dependencies:[],attempt:1,createdAt:1,updatedAt:2,receipt:{version:1,state:'blocked',summary:'model said done',deliverables:[],acceptance:{version:1,ruleVersion:1,specHash:'a'.repeat(64),state:'blocked',numericChecked:true,files:[],checks:[{id:'numeric.mean',state:'blocked',expected:'3',actual:'999'}]}}}] satisfies TeamSnapshot['tasks']
 render(<ScienceAcceptanceStatus tasks={tasks}/>);expect(screen.getByText('样地 A · 分析')).toBeTruthy();expect(screen.getByText(/均值核验/).textContent).toContain('期望 3');expect(screen.getByText(/均值核验/).textContent).toContain('实际 999');expect(screen.getByText(/宿主验收：0 项通过，1 项受阻/)).toBeTruthy()
})
it('does not call an unavailable reuse attestation a missing numeric rule',()=>{const tasks=[{id:'r',subject:'静态图表',status:'completed',dependencies:[],attempt:1,createdAt:1,updatedAt:2,receipt:{version:1,state:'accepted',summary:'done',deliverables:[],acceptance:{version:1,ruleVersion:1,specHash:'b'.repeat(64),state:'passed',numericChecked:false,files:[],checks:[{id:'environment.bound',state:'not_configured',reason:'R 沿普通执行，不签发复用证明'}]}}}] satisfies TeamSnapshot['tasks'];render(<ScienceAcceptanceStatus tasks={tasks}/>);expect(screen.getByText(/执行依赖与复用证明/)).toBeTruthy();expect(screen.queryByText(/数值核验未配置/)).toBeNull()})
