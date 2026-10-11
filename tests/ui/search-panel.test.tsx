import { expect, it, vi } from 'vitest'
import { createEvent, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { SearchPanel, type SearchPanelProps } from '../../src/ui/search-panel.js'
const props = (): SearchPanelProps => ({ query: '', mode: '名字', focusSignal: 0, projects: [
  {projectId:'p1', name:'土壤分析',workspace:'/soil',createdAt:'2026-10-11',totalRunCount:0,totalSessionCount:1,unresolvedProblemCount:0}], tasks:[
  {taskId:'t1',sessionId:'s1',title:'旧名字',workspace:'/soil',createdAt:'2026-10-11',sortOrder:0,pinned:false}],
  sessionOf: () => ({sessionId:'s1',title:'多样性分析',projectId:'p1',agentId:'ds',kind:'native',state:'exited',createdAt:'2026-10-11',sortOrder:0,pinned:false}),
  serverName: () => undefined, onChange:vi.fn(),onMode:vi.fn(),onClose:vi.fn(),onProject:vi.fn(),onTask:vi.fn(), content:<button data-cs-nav="">命中片段</button> })
it('只在独立搜索对话框中输入，项目/会话结果不占侧栏',()=>{
 const {container}=render(<SearchPanel {...props()} />)
 expect(container.querySelector('.search-panel')).toBeNull()
 const dialog=screen.getByRole('dialog',{name:'搜索'})
 expect(dialog.contains(screen.getByPlaceholderText('搜索项目与会话的名字'))).toBe(true)
 expect(document.activeElement).toBe(screen.getByPlaceholderText('搜索项目与会话的名字'))
 expect(screen.getByRole('button',{name:/多样性分析/})).toBeTruthy()
})
it('名称以会话摘要为准，输入后筛选项目及路径，选中转交原回调',()=>{
 const p=props();const {rerender}=render(<SearchPanel {...p} query="土壤" />)
 fireEvent.click(screen.getByRole('button',{name:/土壤分析/}));expect(p.onProject).toHaveBeenCalledWith('p1')
 rerender(<SearchPanel {...p} query="多样性" />)
 fireEvent.click(screen.getByRole('button',{name:/多样性分析/}));expect(p.onTask).toHaveBeenCalledWith(p.tasks[0])
 expect(screen.queryByRole('button',{name:/土壤分析/})).toBeNull()
 rerender(<SearchPanel {...p} query="找不到" />)
 expect(screen.getByText('没有匹配「找不到」的项目或会话')).toBeTruthy()
})
it('Esc、外部点击关闭，框内点击不关闭；组词中的 Enter 不跳转',()=>{
 const p=props();render(<SearchPanel {...p} />)
 const input=screen.getByPlaceholderText('搜索项目与会话的名字')
 fireEvent.keyDown(input,{key:'Enter',isComposing:true});expect(p.onProject).not.toHaveBeenCalled()
 fireEvent.keyDown(input,{key:'Escape'});expect(p.onClose).toHaveBeenCalledOnce()
 vi.mocked(p.onClose).mockClear()
 fireEvent.mouseDown(input);expect(p.onClose).not.toHaveBeenCalled()
 const outside = createEvent.mouseDown(screen.getByRole('dialog'), {cancelable:true})
 fireEvent(screen.getByRole('dialog'), outside);expect(outside.defaultPrevented).toBe(true);expect(p.onClose).toHaveBeenCalledOnce()
})
it('输入框可 Enter 打开第一结果，方向键进入结果；Tab 焦点留在浮层',()=>{
 const p=props();render(<SearchPanel {...p} query="多样性" />)
 const input=screen.getByPlaceholderText('搜索项目与会话的名字')
 fireEvent.keyDown(input,{key:'ArrowDown'})
 expect(document.activeElement).toBe(screen.getByRole('button',{name:/多样性分析/}))
 fireEvent.keyDown(document.activeElement!,{key:'Tab'})
 expect(document.activeElement).toBe(input)
 fireEvent.keyDown(input,{key:'Enter'});expect(p.onTask).toHaveBeenCalledWith(p.tasks[0])
})
it('切换内容模式复用结果，焦点回输入，关闭后焦点回触发按钮',()=>{
 function Harness(){const [mode,setMode]=useState<'名字'|'内容'>('名字');const [open,setOpen]=useState(false)
 return <><button onClick={()=>setOpen(true)}>打开搜索</button>{open?<SearchPanel {...props()} mode={mode} onMode={setMode} onClose={()=>setOpen(false)} />:null}</>}
 render(<Harness/>);const trigger=screen.getByRole('button',{name:'打开搜索'});trigger.focus();fireEvent.click(trigger)
 fireEvent.click(screen.getByRole('button',{name:'按内容'}))
 const input=screen.getByPlaceholderText('搜说过的话、回复、跑过的代码（至少两个字）')
 expect(document.activeElement).toBe(input)
 expect(screen.getByText('命中片段')).toBeTruthy()
 fireEvent.keyDown(input,{key:'ArrowDown'});expect(document.activeElement).toBe(screen.getByText('命中片段'))
 fireEvent.keyDown(document.activeElement!,{key:'Escape'});expect(document.activeElement).toBe(trigger)
})
