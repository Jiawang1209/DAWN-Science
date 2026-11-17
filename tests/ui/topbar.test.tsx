import { useState } from 'react'
import { createPortal } from 'react-dom'
import { afterEach, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { Topbar } from '../../src/ui/topbar.js'

afterEach(() => vi.useRealTimers())
const controls=<><button data-tooltip="返回首页" aria-describedby="existing"><svg><path /></svg></button><button data-tooltip="新建任务">DAWN Science</button></>
const tick=(ms:number)=>act(()=>vi.advanceTimersByTime(ms))

it('鼠标停留后显示不占布局的提示，保留已有描述，移开后清理',()=>{
  vi.useFakeTimers();render(<><span id="existing">已有说明</span><Topbar>{controls}</Topbar></>)
  const button=screen.getAllByRole('button')[0]!
  fireEvent.pointerOver(button.querySelector('path')!)
  tick(249);expect(screen.queryByRole('tooltip')).toBeNull()
  tick(1);const tip=screen.getByRole('tooltip')
  expect(tip.textContent).toBe('返回首页');expect(tip.parentElement).toBe(document.body)
  expect(button.getAttribute('aria-describedby')?.split(' ')).toEqual(['existing',tip.id])
  fireEvent.pointerOut(button,{relatedTarget:document.body})
  expect(screen.queryByRole('tooltip')).toBeNull()
  expect(button.getAttribute('aria-describedby')).toBe('existing')
})

it('键盘聚焦立即提示，Escape及失焦关闭，提示不触发按钮动作',()=>{
  const click=vi.fn();render(<Topbar><button data-tooltip="快捷键速查" onClick={click}>键盘</button></Topbar>)
  const button=screen.getByRole('button')
  fireEvent.focus(button);expect(screen.getByRole('tooltip').textContent).toBe('快捷键速查')
  fireEvent.keyDown(document,{key:'Escape'});expect(screen.queryByRole('tooltip')).toBeNull()
  expect(click).not.toHaveBeenCalled()
  fireEvent.blur(button);fireEvent.focus(button);fireEvent.click(button)
  expect(screen.queryByRole('tooltip')).toBeNull();expect(click).toHaveBeenCalledOnce()
  fireEvent.focus(button);fireEvent.blur(button);expect(screen.queryByRole('tooltip')).toBeNull()
})

it('跨按钮移动只显示最后的提示，离开和滚动取消待显示计时器',()=>{
  vi.useFakeTimers();render(<Topbar>{controls}</Topbar>)
  const [back,brand]=screen.getAllByRole('button')
  fireEvent.pointerOver(back!);tick(200)
  fireEvent.pointerOut(back!,{relatedTarget:brand});fireEvent.pointerOver(brand!,{relatedTarget:back})
  tick(50);expect(screen.queryByRole('tooltip')).toBeNull()
  tick(200);expect(screen.getByRole('tooltip').textContent).toBe('新建任务')
  fireEvent.scroll(document);expect(screen.queryByRole('tooltip')).toBeNull()
  fireEvent.pointerOver(back!);fireEvent.scroll(document);tick(300)
  expect(screen.queryByRole('tooltip')).toBeNull()
  fireEvent.pointerOver(back!);fireEvent.pointerOut(back!,{relatedTarget:document.body});tick(300)
  expect(screen.queryByRole('tooltip')).toBeNull()
})

it('按钮内移动不重设计时器，禁用和无提示按钮不产生浮层',()=>{
  vi.useFakeTimers();render(<Topbar>{controls}<button disabled data-tooltip="不可用">禁用</button><button>普通</button></Topbar>)
  const back=screen.getAllByRole('button')[0]!,svg=back.querySelector('svg')!
  fireEvent.pointerOver(back);tick(200)
  fireEvent.pointerOut(back,{relatedTarget:svg});fireEvent.pointerOver(svg,{relatedTarget:back});tick(50)
  expect(screen.getByRole('tooltip').textContent).toBe('返回首页')
  fireEvent.pointerOut(back,{relatedTarget:document.body})
  fireEvent.pointerOver(screen.getByText('禁用'));tick(300);expect(screen.queryByRole('tooltip')).toBeNull()
  fireEvent.focus(screen.getByText('普通'));expect(screen.queryByRole('tooltip')).toBeNull()
})

it('离开工作台、缩放和卸载清理提示及计时器',()=>{
  vi.useFakeTimers();const ui=render(<Topbar>{controls}</Topbar>)
  fireEvent.focus(screen.getAllByRole('button')[0]!);fireEvent.resize(window)
  expect(screen.queryByRole('tooltip')).toBeNull()
  fireEvent.pointerOver(screen.getAllByRole('button')[0]!)
  ui.rerender(<Topbar active={false}>{controls}</Topbar>);tick(300)
  expect(screen.queryByRole('tooltip')).toBeNull()
  fireEvent.focus(screen.getAllByRole('button')[0]!);expect(screen.queryByRole('tooltip')).toBeNull()
  ui.rerender(<Topbar>{controls}</Topbar>);fireEvent.focus(screen.getAllByRole('button')[0]!)
  expect(screen.getByRole('tooltip')).toBeTruthy();ui.unmount()
  expect(screen.queryByRole('tooltip')).toBeNull();expect(vi.getTimerCount()).toBe(0)
})

it('注入顶栏的portal按钮也获得提示，不依赖React组件父子关系',()=>{
  function PortalHeader(){
    const [slot,setSlot]=useState<HTMLDivElement|null>(null)
    return <><Topbar><div ref={setSlot}/></Topbar>{slot?createPortal(<button data-tooltip="导出对话">导出</button>,slot):null}</>
  }
  render(<PortalHeader/>);fireEvent.focus(screen.getByRole('button',{name:'导出'}))
  expect(screen.getByRole('tooltip').textContent).toBe('导出对话')
})
