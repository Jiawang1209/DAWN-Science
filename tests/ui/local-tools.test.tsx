import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within, waitFor, act } from '@testing-library/react'
import { LocalToolsPanel } from '../../src/ui/local-tools.js'
import type { WorkbenchClient } from '../../src/ui/client.js'

const initial = { paths: { uv: '/selected/uv' } }
const detected = { ...initial, tools: [{ id: 'uv', candidates: [{ path: '/selected/uv', source: 'settings', version: 'uv 1' }, {path:'/other/uv', source:'PATH', version:'uv 2'}] }] }
function fixture() {
 const get = vi.fn<(op:string,request:unknown)=>Promise<unknown>>(async (op, request) => {
  if(op === 'getLocalTools') return initial
  if(op === 'probeLocalTools') return detected
  if(op === 'setLocalTool') return { paths: { uv:(request as {path:string}).path } }
  throw new Error(op)
 })
 return {get, client: {get} as unknown as WorkbenchClient}
}
describe('本地工具设置', () => {
 it('打开时自动检测，按环境与开发工具分组，并保留已配置路径', async () => {
  const f=fixture(); render(<LocalToolsPanel client={f.client}/> )
  const uv=within(await screen.findByRole('group',{name:'uv'}))
  await waitFor(()=>expect((uv.getByRole('textbox') as HTMLInputElement).value).toBe('/selected/uv'))
  expect(screen.getByText('环境管理工具')).toBeTruthy();expect(screen.getByText('开发工具')).toBeTruthy()
  await waitFor(()=>expect(f.get).toHaveBeenCalledWith('probeLocalTools',{}))
  expect(f.get.mock.calls.some(c=>c[0]==='setLocalTool')).toBe(false)
 })
 it('选择候选只改草稿，保存后才提交；重新检测不覆盖人工草稿', async () => {
  const f=fixture();render(<LocalToolsPanel client={f.client}/> )
  const uv=within(await screen.findByRole('group',{name:'uv'}));await uv.findByRole('option',{name:/other\/uv/})
  fireEvent.change(uv.getByRole('combobox'),{target:{value:'/other/uv'}})
  expect((uv.getByRole('textbox') as HTMLInputElement).value).toBe('/other/uv')
  fireEvent.click(screen.getByRole('button',{name:'重新检测工具'}))
  await waitFor(()=>expect(f.get.mock.calls.filter(c=>c[0]==='probeLocalTools')).toHaveLength(2))
  expect((uv.getByRole('textbox') as HTMLInputElement).value).toBe('/other/uv')
  fireEvent.click(uv.getByRole('button',{name:'保存'}))
  await waitFor(()=>expect(f.get).toHaveBeenCalledWith('setLocalTool',{tool:'uv',path:'/other/uv'}))
  await waitFor(()=>expect((uv.getByRole('button',{name:'保存'}) as HTMLButtonElement).disabled).toBe(true))
 })
 it('保存失败显示错误并保留草稿，允许修正后重试', async () => {
  const f=fixture();f.get.mockImplementation(async(op)=>{if(op==='getLocalTools')return initial;if(op==='probeLocalTools')return detected;throw new Error('不是可执行文件')})
  render(<LocalToolsPanel client={f.client}/>);const uv=within(await screen.findByRole('group',{name:'uv'}));await waitFor(()=>expect((uv.getByRole('textbox') as HTMLInputElement).value).toBe('/selected/uv'))
  fireEvent.change(uv.getByRole('textbox'),{target:{value:'/invalid/path'}});fireEvent.click(uv.getByRole('button',{name:'保存'}))
  expect((await uv.findByRole('alert')).textContent).toContain('不是可执行文件');expect((uv.getByRole('textbox') as HTMLInputElement).value).toBe('/invalid/path')
  expect((uv.getByRole('button',{name:'保存'}) as HTMLButtonElement).disabled).toBe(false)
 })
 it('检测失败仍保留已配置路径，未找到的工具可以手动填写', async () => {
  const f=fixture();f.get.mockImplementation(async(op)=>{if(op==='getLocalTools')return initial;throw new Error('检测超时')})
  render(<LocalToolsPanel client={f.client}/>);expect((await screen.findByRole('alert')).textContent).toContain('检测超时')
  expect((within(screen.getByRole('group',{name:'uv'})).getByRole('textbox') as HTMLInputElement).value).toBe('/selected/uv')
  expect(within(screen.getByRole('group',{name:'Git'})).getByRole('textbox')).toBeTruthy()
 })
 it('保存期间的新输入不会被较早的保存回执覆盖', async () => {
  const f=fixture();let resolve!: (r: unknown)=>void
  f.get.mockImplementation(async(op)=>op==='getLocalTools'?initial:op==='probeLocalTools'?detected:await new Promise(r=>{resolve=r}))
  render(<LocalToolsPanel client={f.client}/>);const uv=within(await screen.findByRole('group',{name:'uv'}));await waitFor(()=>expect((uv.getByRole('textbox') as HTMLInputElement).value).toBe('/selected/uv'))
  fireEvent.change(uv.getByRole('textbox'),{target:{value:'/first/uv'}});fireEvent.click(uv.getByRole('button',{name:'保存'}));fireEvent.change(uv.getByRole('textbox'),{target:{value:'/latest/uv'}})
  await act(async()=>resolve({paths:{uv:'/first/uv'}}))
  expect((uv.getByRole('textbox') as HTMLInputElement).value).toBe('/latest/uv');expect((uv.getByRole('button',{name:'保存'}) as HTMLButtonElement).disabled).toBe(false)
 })
})
