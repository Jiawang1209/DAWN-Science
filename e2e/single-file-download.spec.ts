import { mkdirSync, chmodSync, readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs"
import { join } from "node:path"
import { test, expect, 进坞 } from "./fixtures.js"
import type { Page } from "@playwright/test"
test.use({dawnOptions:{fakeSsh:true}})
async function call(page:Page,op:string,request:unknown={}){return page.evaluate(async({op,request})=>{const r=await(window as any).dawn.invoke(op,request);if(!r.ok)throw new Error(JSON.stringify(r));return r.data},{op,request})}
async function remote(page:Page){
 const head=page.getByRole('button',{name:/^服务器/});if(await head.getAttribute('aria-expanded')!=='true')await head.click()
 await page.getByRole('button',{name:/添加服务器/}).click();await page.locator('#conn-host').fill('fake.example');await page.locator('#conn-user').fill('dawn');await page.locator('#conn-label').fill('下载任务验收');await page.locator('#conn-secret').fill('dawn');await page.getByRole('button',{name:'保存并连接',exact:true}).click()
 await page.locator('.remote-row').first().getByRole('button',{name:'新建远端任务',exact:true}).click();await expect(page.locator('.conv-remote')).toBeVisible();await 进坞(page,'文件')
}
async function download(page:Page){
 const before=(await call(page,'listTransferBatches')).length;await page.getByRole('button',{name:'下载',exact:true}).click()
 await expect.poll(async()=>(await call(page,'listTransferBatches')).length).toBe(before+1)
 const id=(await call(page,'listTransferBatches'))[0].id
 const summary=page.getByRole('button',{name:'传输任务',exact:true});if(await summary.getAttribute('aria-expanded')!=='true')await summary.click()
 await expect(page.locator(`.transfer-job[data-batch-id="${id}"]`)).toBeVisible()
 await expect(page.locator('.files-transfers > .xfer:not(.transfer-batches)')).toHaveCount(0)
 return {id,job:page.locator(`.transfer-job[data-batch-id="${id}"]`)}
}
test('单文件下载统一任务，权限失败直接重试，同名明确另存',async({dawn},info)=>{
 const {page,dir}=dawn;await remote(page)
 await page.locator('.files-view .tree-row').filter({hasText:'读我.md'}).click();await expect(page.locator('.file-preview')).toContainText('这是一台假服务器')
 const first=await download(page);await expect(first.job.locator('.transfer-state').first()).toHaveText('已完成')
 let detail=await call(page,'getTransferBatch',{batchId:first.id});const firstTarget=detail.entries[0].target
 expect(readFileSync(firstTarget,'utf8')).toContain('这是一台假服务器');expect(detail.batch.counts.files).toBe(1)
 await first.job.getByRole('button',{name:'查看传输：读我.md',exact:true}).click();await first.job.locator('.transfer-entry-name summary').click();await expect(first.job).toContainText(firstTarget)
 const blocked=join(dir,'blocked-download');mkdirSync(blocked);chmodSync(blocked,0o500)
 try{
  await call(page,'setDownloadDir',{path:blocked});const failed=await download(page);await expect(failed.job.locator('.transfer-state').first()).toHaveText('失败')
  await failed.job.getByRole('button',{name:'查看传输：读我.md',exact:true}).click();await failed.job.getByRole('button',{name:'仅异常',exact:true}).click();await failed.job.locator('.transfer-entry-error summary').click()
  await expect(failed.job).toContainText(/EACCES|permission/i);await page.locator('.files-transfers').screenshot({path:info.outputPath('single-download-failed.png')})
  chmodSync(blocked,0o700);await failed.job.getByRole('button',{name:'重传未完成项',exact:true}).click();await expect(failed.job.locator('.transfer-state').first()).toHaveText('已完成')
  detail=await call(page,'getTransferBatch',{batchId:failed.id});expect(detail.batch.id).toBe(failed.id);expect(readFileSync(detail.entries[0].target,'utf8')).toContain('这是一台假服务器')
  expect(readdirSync(blocked).some(n=>n.includes('.dawn-part-'))).toBe(false)
  writeFileSync(detail.entries[0].target,'保留的旧文件')
  const conflict=await download(page);await expect(conflict.job.locator('.transfer-state').first()).toHaveText('失败')
  await conflict.job.getByRole('button',{name:'查看传输：读我.md',exact:true}).click();await conflict.job.getByRole('button',{name:'另存一份',exact:true}).click();await expect(conflict.job.locator('.transfer-state').first()).toHaveText('已完成')
  const kept=await call(page,'getTransferBatch',{batchId:conflict.id});expect(kept.entries[0].target).not.toBe(detail.entries[0].target)
  expect(readFileSync(detail.entries[0].target,'utf8')).toBe('保留的旧文件');expect(readFileSync(kept.entries[0].target,'utf8')).toContain('这是一台假服务器')
  await page.locator('.files-transfers').screenshot({path:info.outputPath('single-download-light.png')})
  await page.evaluate(()=>{document.documentElement.classList.remove('dawn-light');document.documentElement.classList.add('dawn-dark')})
  await page.locator('.files-transfers').screenshot({path:info.outputPath('single-download-dark.png')})
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
 }finally{chmodSync(blocked,0o700)}
})
test('单文件进度可见，切换面板继续传，取消清理后可重传',async({dawn},info)=>{
 const {page,app}=dawn;await remote(page);await page.locator('.files-view').getByRole('button',{name:'数据',exact:true}).click();await page.locator('.files-view .tree-row').filter({hasText:'大文件.bin'}).click();await expect(page.locator('.file-preview')).toContainText('大文件.bin')
 await app.evaluate(()=>{process.env.DAWN_FAKE_SSH_TRANSFER_DELAY_MS='300'})
 const started=await download(page);const meter=started.job.getByRole('progressbar',{name:'任务进度：大文件.bin',exact:true})
 await expect.poll(async()=>Number(await meter.getAttribute('aria-valuenow'))).toBeGreaterThan(0);expect(Number(await meter.getAttribute('aria-valuenow'))).toBeLessThan(100)
 await page.locator('.files-transfers').screenshot({path:info.outputPath('single-download-running.png')})
 await 进坞(page,'笔记本');const running=await call(page,'getTransferBatch',{batchId:started.id});expect(running.batch.state).toBe('running');await 进坞(page,'文件')
 const summary=page.getByRole('button',{name:'传输任务',exact:true});if(await summary.getAttribute('aria-expanded')!=='true')await summary.click()
 await started.job.getByRole('button',{name:'取消',exact:true}).click();await expect(started.job.locator('.transfer-state').first()).toHaveText('已取消')
 const stopped=await call(page,'getTransferBatch',{batchId:started.id});expect(existsSync(stopped.entries[0].target)).toBe(false)
 await app.evaluate(()=>{process.env.DAWN_FAKE_SSH_TRANSFER_DELAY_MS='0'});await started.job.getByRole('button',{name:'重传未完成项',exact:true}).click();await expect(started.job.locator('.transfer-state').first()).toHaveText('已完成')
 const final=await call(page,'getTransferBatch',{batchId:started.id});expect(readFileSync(final.entries[0].target,'utf8')).toBe('x'.repeat(4096));expect(readdirSync(final.batch.target).some(n=>n.includes('.dawn-part-'))).toBe(false)
 await expect(page.locator('.files-transfers > .xfer:not(.transfer-batches)')).toHaveCount(0)
})
