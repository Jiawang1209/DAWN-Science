import { expect, it, vi } from 'vitest'
const mock=vi.hoisted(()=>({launch:vi.fn()}))
vi.mock('playwright-core',()=>({chromium:{launch:mock.launch}}))
it('并发冷启动共享一个进程，关闭全部浏览器',async()=>{
  vi.resetModules()
  const session=await import('../../src/tools/browser/session.js')
  let release!:()=>void
  const gate=new Promise<void>(r=>release=r)
  const browsers: {isConnected:()=>boolean;close:ReturnType<typeof vi.fn>;newPage:()=>Promise<unknown>}[]=[]
  mock.launch.mockImplementation(async()=>{
    let connected=true
    const browser={isConnected:()=>connected,close:vi.fn(async()=>{connected=false}),newPage:async()=>({on:()=>{},isClosed:()=>false,url:()=>''})}
    browsers.push(browser)
    await gate
    return browser
  })
  const opened=Promise.all([session.开标签(),session.开标签()])
  await vi.waitFor(()=>expect(mock.launch).toHaveBeenCalled())
  release();await opened
  await session.关浏览器()
  expect(browsers).toHaveLength(1)
  expect(browsers.every(b=>!b.isConnected())).toBe(true)
})
it('关闭与新建标签交错时，不把迟到页面登记到已经关闭的浏览器',async()=>{
  vi.resetModules();mock.launch.mockReset()
  const session=await import('../../src/tools/browser/session.js')
  let release!:()=>void
  let connected=true
  const page={on:()=>{},isClosed:()=>false,url:()=>'',close:vi.fn(async()=>{})}
  mock.launch.mockResolvedValue({isConnected:()=>connected,close:async()=>{connected=false},newPage:async()=>{await new Promise<void>(r=>release=r);return page}})
  const opening=session.开标签()
  await vi.waitFor(()=>expect(release).toBeDefined())
  await session.关浏览器()
  release()
  await expect(opening).rejects.toThrow(/关闭/)
  expect(session.状态()).toMatchObject({open:false,tabs:0})
  expect(page.close).toHaveBeenCalledOnce()
})
