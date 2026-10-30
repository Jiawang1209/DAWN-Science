import { EventEmitter } from 'node:events'
import type { BrowserWindow } from 'electron'
import { expect, it, vi } from 'vitest'
const state=vi.hoisted(()=>({session:undefined as unknown as EventEmitter}))
vi.mock('electron',async()=>{
  const {EventEmitter}=await import('node:events')
  return {WebContentsView:class {
    webContents=Object.assign(new EventEmitter(),{
      session:Object.assign(state.session=new EventEmitter(),{setPermissionRequestHandler(){},setPermissionCheckHandler(){}}),
      setWindowOpenHandler(){},getURL:()=>'',getTitle:()=>'',isLoading:()=>false,
      navigationHistory:{canGoBack:()=>false,canGoForward:()=>false},loadURL:async()=>{},
    })
    setVisible(){} setBounds(){}
  }}
})
import { 造网页预览 } from '../../src/electron/web-preview.js'
it('下载开始时固定项目，完成前切换项目不会串记来源',()=>{
  const record=vi.fn()
  const win={contentView:{addChildView(){}}} as unknown as BrowserWindow
  const preview=造网页预览(win,()=>{},undefined,record)
  preview.控制({kind:'open',url:'https://example.com/a',projectId:'project-a'})
  const item=Object.assign(new EventEmitter(),{getURL:()=> 'https://example.com/file',getFilename:()=> 'file.txt',getSavePath:()=> '/tmp/file.txt',getReceivedBytes:()=>5})
  state.session.emit('will-download',{},item)
  preview.控制({kind:'open',url:'https://example.com/b',projectId:'project-b'})
  item.emit('done',{},'completed')
  expect(record).toHaveBeenCalledWith(expect.objectContaining({projectId:'project-a'}))
})
