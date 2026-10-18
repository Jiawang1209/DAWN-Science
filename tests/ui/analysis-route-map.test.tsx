import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { AnalysisRoutePanel } from '../../src/ui/analysis-route.js'
import { route } from './analysis-route-fixture.js'

afterEach(cleanup)
function fixture() {
  const r=route()
  r.steps[0]!.title='数据核查'
  r.steps[0]!.status='delivered'
  r.steps[0]!.deliverables=[{path:'results/qc.md'}]
  r.steps.push({...structuredClone(r.steps[0]!),id:'S2',title:'组间比较',status:'pending',dependencies:['S1'],deliverables:[]})
  r.steps.push({...structuredClone(r.steps[1]!),id:'S3',title:'图表报告',dependencies:['S2']})
  return {scopeKey:crypto.randomUUID(),result:{supported:true,route:r},busy:true,workingStepId:'S2',
    onReload:vi.fn(async()=>{}),onAction:vi.fn(async()=>{}),onCreate:vi.fn(async()=>{}),
    readFile:vi.fn(async()=>({kind:'text' as const,text:'# QC report',mediaType:'text/markdown',bytes:11})),
    loadGalleryRoots:vi.fn(async()=>({})),onOpenWeb:vi.fn(),onOpenExternally:vi.fn()}
}
it('keeps the dependency map and current processing position while inspecting another step and file',async()=>{
  const p=fixture();render(<AnalysisRoutePanel {...p}/> )
  const graph=screen.getByRole('region',{name:'分析路线图'})
  const current=within(graph).getByRole('button',{name:/查看步骤 S2 /})
  expect(current.getAttribute('data-state')).toBe('active')
  expect(current.getAttribute('aria-pressed')).toBe('true')
  fireEvent.click(within(graph).getByRole('button',{name:/查看步骤 S1 /}))
  expect(current.getAttribute('data-state')).toBe('active')
  expect(current.getAttribute('aria-pressed')).toBe('false')
  fireEvent.click(screen.getByRole('tab',{name:'本步产物 1'}))
  fireEvent.click(screen.getByRole('button',{name:'results/qc.md'}))
  await waitFor(()=>expect(screen.getByText('QC report')).toBeTruthy())
  expect(screen.getByRole('region',{name:'分析路线图'})).toBeTruthy()
  fireEvent.click(screen.getByRole('button',{name:'收起预览'}))
  expect(screen.getByRole('tab',{name:'本步产物 1'})).toBeTruthy()
  fireEvent.click(screen.getByRole('button',{name:'回到当前步骤'}))
  expect(current.getAttribute('aria-pressed')).toBe('true')
  expect(p.onAction).not.toHaveBeenCalled()
})
it('hides revisions behind route options and does not turn saved progress or browsing into live activity',()=>{
  const p=fixture();p.result.route.steps[1]!.status='in_progress'
  render(<AnalysisRoutePanel {...p} busy={false} workingStepId={undefined}/> )
  expect(screen.queryByRole('combobox',{name:'路线版本'})).toBeNull()
  const graph=screen.getByRole('region',{name:'分析路线图'})
  expect(within(graph).getByRole('button',{name:/查看步骤 S2 /}).getAttribute('data-state')).toBe('recorded')
  expect(within(graph).queryByText(/正在处理：/)).toBeNull()
  fireEvent.click(screen.getByLabelText('路线选项'))
  expect(screen.getByRole('combobox',{name:'路线版本'})).toBeTruthy()
})
it('draws only actual dependency edges even when step numbering and array order differ',()=>{
  const p=fixture();p.result.route.steps=[p.result.route.steps[2]!,p.result.route.steps[0]!,p.result.route.steps[1]!]
  const {container}=render(<AnalysisRoutePanel {...p}/> )
  const edges=[...container.querySelectorAll('[data-route-edge]')].map(e=>[e.getAttribute('data-from'),e.getAttribute('data-to')])
  expect(edges).toEqual(expect.arrayContaining([['S1','S2'],['S2','S3']]))
  expect(edges).toHaveLength(2)
})
