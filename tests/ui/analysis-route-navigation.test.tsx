import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { AnalysisRoutePanel } from '../../src/ui/analysis-route.js'
import { route } from './analysis-route-fixture.js'
import type { FileContent } from '../../src/ui/files.js'

afterEach(cleanup)
function fixture() {
  const r = route()
  r.steps[0]!.deliverables = [{path:'results/report.md'}, {path:'analysis/check.R'}]
  r.steps.push({...structuredClone(r.steps[0]!),id:'S2',title:'比较',deliverables:[{path:'results/table.csv'}]})
  return {
    scopeKey: crypto.randomUUID(), result: {supported:true,route:r},
    onReload:vi.fn(async()=>{}), onAction:vi.fn(async()=>{}), onCreate:vi.fn(async()=>{}),
    readFile:vi.fn(async()=>({kind:'text' as const,text:'# Report',mediaType:'text/markdown',bytes:8})),
    loadGalleryRoots:vi.fn(async()=>({})), onOpenWeb:vi.fn(),onOpenExternally:vi.fn(),
  }
}
const open = (id='S1') => { fireEvent.click(screen.getByRole('button',{name:new RegExp(`查看步骤 ${id} `)})); fireEvent.click(screen.getByRole('tab',{name:/本步产物 /})) }
it('keeps the route map while browsing only one step and file, without model actions',async()=>{
  const p=fixture()
  render(<AnalysisRoutePanel {...p}/> )
  expect(screen.getByRole('region',{name:'分析路线图'})).toBeTruthy()
  open()
  expect(screen.getByRole('tab',{name:'本步产物 2'}).getAttribute('aria-selected')).toBe('true')
  expect(screen.queryByRole('button',{name:'results/table.csv'})).toBeNull()
  fireEvent.click(screen.getByRole('button',{name:'results/report.md'}))
  await waitFor(()=>expect(screen.getByText('Report')).toBeTruthy())
  expect(screen.queryByRole('tab')).toBeNull()
  expect(screen.getByRole('region',{name:'分析路线图'})).toBeTruthy()
  expect(screen.queryByRole('button',{name:'analysis/check.R'})).toBeNull()
  screen.getByRole('button',{name:'收起预览'}).focus()
  fireEvent.click(screen.getByRole('button',{name:'收起预览'}))
  expect(document.activeElement).toBe(screen.getByRole('button',{name:'results/report.md'}))
  expect(screen.getByRole('button',{name:'analysis/check.R'})).toBeTruthy()
  fireEvent.click(screen.getByRole('button',{name:/查看步骤 S2 /}))
  expect(screen.getByRole('region',{name:'分析路线图'})).toBeTruthy()
  expect(screen.getByRole('button',{name:/查看步骤 S2 /}).getAttribute('aria-pressed')).toBe('true')
  expect(p.onAction).not.toHaveBeenCalled()
})
it.each([
  ['results/table.csv',{kind:'table',mediaType:'text/csv',bytes:4,table:{columns:['value'],rows:[['42']],rowsRead:1,totalRows:1,delimiter:','}},'.table-preview'],
  ['results/figure.png',{kind:'image',mediaType:'image/png',bytes:2,base64:'ZZ'},'.visual-preview'],
  ['analysis/check.R',{kind:'text',mediaType:'text/x-r',bytes:8,text:'x <- 42'},'.preview-script'],
] as const)('previews %s with the shared viewer and filename above content',async(path,content,selector)=>{
  const p=fixture()
  p.result.route.steps[0]!.deliverables=[{path}]
  const {container}=render(<AnalysisRoutePanel {...p} readFile={vi.fn(async():Promise<FileContent>=>content as FileContent)}/> )
  open()
  fireEvent.click(screen.getByRole('button',{name:path}))
  await waitFor(()=>expect(container.querySelector(selector)).toBeTruthy())
  expect(container.querySelector('.preview-head .name')?.textContent).toBe(path.split('/').pop())
  fireEvent.click(screen.getByRole('button',{name:'收起预览'}))
  expect(screen.getByRole('tab',{name:'本步产物 1'})).toBeTruthy()
  expect(p.onAction).not.toHaveBeenCalled()
})
it('allows cancelling an in-flight read and never reopens from its late result',async()=>{
  const p=fixture()
  let complete!:(value:FileContent)=>void
  const readFile=vi.fn(()=>new Promise<FileContent>(resolve=>{complete=resolve}))
  render(<AnalysisRoutePanel {...p} readFile={readFile}/> )
  open()
  fireEvent.click(screen.getByRole('button',{name:'results/report.md'}))
  await waitFor(()=>expect(readFile).toHaveBeenCalledOnce())
  fireEvent.click(screen.getByRole('button',{name:'关闭预览'}))
  complete({kind:'text',mediaType:'text/markdown',text:'Late result',bytes:11})
  await new Promise(resolve=>setTimeout(resolve,0))
  expect(screen.queryByText('Late result')).toBeNull()
  expect(screen.getByRole('tab',{name:'本步产物 2'})).toBeTruthy()
})
it('restores browsing on dock remount but isolates session/workspace and route identity',async()=>{
  const p=fixture()
  const first=render(<AnalysisRoutePanel {...p}/> )
  open()
  fireEvent.click(screen.getByRole('button',{name:'results/report.md'}))
  await waitFor(()=>expect(screen.getByText('Report')).toBeTruthy())
  first.unmount()
  const second=render(<AnalysisRoutePanel {...p}/> )
  await waitFor(()=>expect(screen.getByText('Report')).toBeTruthy())
  second.unmount()
  const other=render(<AnalysisRoutePanel {...p} scopeKey={p.scopeKey+'/other-project'}/> )
  expect(screen.queryByText('Report')).toBeNull()
  expect(screen.getByRole('tab',{name:'执行动态'})).toBeTruthy()
  other.unmount()
  render(<AnalysisRoutePanel {...p} result={{supported:true,route:{...p.result.route,routeId:'new-route'}}}/> )
  expect(screen.getByRole('tab',{name:'执行动态'})).toBeTruthy()
})
it('does not retain a removed file preview or jump to another step after route updates',async()=>{
  const p=fixture()
  const {rerender}=render(<AnalysisRoutePanel {...p}/> )
  open()
  fireEvent.click(screen.getByRole('button',{name:'results/report.md'}))
  await waitFor(()=>expect(screen.getByText('Report')).toBeTruthy())
  const next=structuredClone(p.result.route)
  next.revision++
  next.steps[0]!.deliverables=[]
  rerender(<AnalysisRoutePanel {...p} result={{supported:true,route:next}}/> )
  expect(screen.queryByText('Report')).toBeNull()
  expect(screen.getByRole('tab',{name:'本步产物 0'})).toBeTruthy()
  next.steps[0]!.deliverables=[{path:'results/report.md'}]
  rerender(<AnalysisRoutePanel {...p} result={{supported:true,route:structuredClone(next)}}/> )
  expect(screen.queryByText('Report')).toBeNull()
  expect(screen.getByRole('tab',{name:'本步产物 1'})).toBeTruthy()
  next.steps.shift()
  rerender(<AnalysisRoutePanel {...p} result={{supported:true,route:structuredClone(next)}}/> )
  expect(screen.getByRole('tab',{name:'执行动态'})).toBeTruthy()
  expect(screen.getByRole('button',{name:/查看步骤 S2 /})).toBeTruthy()
})

it('reopens a folded PDF group before restoring focus when cancelling its preview',async()=>{
  const p=fixture();p.result.route.steps[0]!.deliverables=[{path:'figure.png'},{path:'figure.pdf'}]
  render(<AnalysisRoutePanel {...p} readFile={()=>new Promise<FileContent>(()=>{})}/> )
  open()
  fireEvent.click(screen.getByText('PDF 版本 · 1 个文件'))
  fireEvent.click(screen.getByRole('button',{name:'figure.pdf'}))
  fireEvent.click(screen.getByRole('button',{name:'关闭预览'}))
  const target=screen.getByRole('button',{name:'figure.pdf'})
  expect(target.closest('details')?.open).toBe(true)
  expect(document.activeElement).toBe(target)
})
