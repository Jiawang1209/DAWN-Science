/** Built Electron and real host tools/receipts; localhost inference is a deterministic fixture. */
import {mkdirSync,writeFileSync,readFileSync,readdirSync} from 'node:fs'
import {join,resolve} from 'node:path'
import {test,expect,在项目里开会话,进坞} from './fixtures.js'
function prepare(workspace:string){
 mkdirSync(join(workspace,'.dawn/agents'),{recursive:true});writeFileSync(join(workspace,'in.csv'),'x\n1\n2\n3\n4\n5\n')
 for(const stage of ['check','analyze','review'])writeFileSync(join(workspace,'.dawn/agents',`pipeline-${stage}.md`),`---\nname: pipeline-${stage}\ndescription: ${stage}\ntools: read,write,bash\n---\n按冻结契约执行并正式提交。`)
}
function saved(workspace:string){
 for(const id of readdirSync(join(workspace,'.dawn/sessions'))){try{const dir=join(workspace,'.dawn/sessions',id),teamId=readFileSync(join(dir,'teams/current'),'utf8').trim(),team=JSON.parse(readFileSync(join(dir,'teams',teamId,'team.json'),'utf8'));if(team.pipeline)return{ownerSessionId:id,team}}catch{/* Host checkpoint is being written. */}}
 return undefined
}
for(const mode of ['pass','blocked'] as const)test.describe(`outcome ${mode}`,()=>{
 test.use({dawnOptions:{gitInit:true,sciencePipeline:mode,...(mode==='pass'?{firstChunkDelayMs:1500}:{})}})
 test('shows exact stage and final versions, compact expansion, and readable 900px views',async({dawn},testInfo)=>{
  let page=dawn.page;const out=resolve(process.env.DAWN_OUTCOME_EVIDENCE_DIR??testInfo.outputPath('evidence'),mode);mkdirSync(out,{recursive:true});prepare(dawn.workspace)
  await 在项目里开会话(page);await 进坞(page,'团队')
  await page.locator('main.main .composer textarea').fill('科研流水线验收：协作成果分层界面验收，使用合成数据。');await page.getByRole('button',{name:'发送',exact:true}).click()
  let overview=page.getByRole('region',{name:'运行总览',exact:true}),outcome=overview.getByRole('region',{name:'协作成果',exact:true})
  const capture=async(name:string)=>{await outcome.scrollIntoViewIfNeeded();await page.screenshot({path:join(out,name+'.png')});await outcome.screenshot({path:join(out,name+'-panel.png')});writeFileSync(join(out,name+'.json'),JSON.stringify({name,actualElectron:true,inference:'localhost-fixture',scientificValidation:false,viewport:page.viewportSize(),checkpoint:saved(dawn.workspace),hostOverview:await page.evaluate(async sid=>(await window.dawn!.invoke('getRunOverview',{sessionId:sid})).data,saved(dawn.workspace)!.ownerSessionId)},null,2))}
  if(mode==='pass'){
   await expect(outcome.getByRole('heading',{name:'分析阶段已验收，等待独立审阅',exact:true})).toBeVisible()
   await expect(outcome).toContainText('当前阶段 · 独立审阅');await expect(outcome.locator('.collaboration-outcome-artifact')).toContainText('阶段产物')
   await outcome.getByRole('button',{name:'查看审阅任务',exact:true}).click();await expect(overview.getByRole('tab',{name:'过程',exact:true})).toHaveAttribute('aria-selected','true');await capture('review-pending-light')
  }
  await expect.poll(()=>saved(dawn.workspace)?.team.pipeline.status).toBe(mode==='pass'?'completed':'blocked')
  await expect(outcome).toHaveAttribute('data-outcome',mode==='pass'?'accepted':'blocked')
  await page.setViewportSize({width:1440,height:960});await capture('main-light')
  if(mode==='pass'){
   const analysis=saved(dawn.workspace)!.team.tasks.find((t:any)=>t.contract?.resultType==='model-metrics'),version=analysis.receipt.versions.outputs[0]
   await expect(outcome.locator('.collaboration-outcome-artifact')).toContainText('最终成果');await outcome.getByRole('button',{name:'查看验收成果',exact:true}).click()
   await expect(overview.locator(`[data-task-detail="${analysis.id}"]`)).toBeVisible()
   await outcome.locator('.collaboration-outcome-artifact').click();await expect(overview.locator(`[data-task-detail="${analysis.id}"]`)).toBeVisible()
   await expect(overview.getByRole('tab',{name:'产物',exact:true})).toHaveAttribute('aria-selected','true');await expect(overview.locator('.collaboration-evidence')).toContainText(version.sha256)
  }else{
   await outcome.getByRole('button',{name:'查看提交反馈',exact:true}).click();await expect(overview.getByRole('tab',{name:'记录',exact:true})).toHaveAttribute('aria-selected','true')
  }
  await outcome.getByRole('button',{name:'展开流程工作台',exact:true}).click()
  const dialog=page.getByRole('dialog',{name:'流程工作台',exact:true})
  await expect(dialog.locator('.collaboration-outcome-inspection')).not.toHaveAttribute('open')
  await expect(dialog.getByRole('heading',{name:'Agent 网络',exact:true})).toBeInViewport();await page.screenshot({path:join(out,'expanded-light.png')})
  await page.keyboard.press('Escape');await expect(outcome.getByRole('button',{name:'展开流程工作台',exact:true})).toBeFocused()
  await page.setViewportSize({width:900,height:900});await capture('main-900-light')
  expect(await outcome.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true)
  await expect(outcome.getByText('窄面板显示摘要；展开可查看完整目标和成果版本。',{exact:true})).toBeVisible()
  await expect(outcome.getByRole('button',{name:'展开流程工作台',exact:true})).toBeInViewport()
  await outcome.getByRole('button',{name:'展开流程工作台',exact:true}).click()
  const focused=page.getByRole('dialog',{name:'流程工作台',exact:true});expect((await focused.boundingBox())!.width).toBeGreaterThan(750)
  await expect(focused.locator('.collaboration-outcome-inspection')).toBeVisible();await focused.locator('.collaboration-outcome-inspection > summary').click()
  await expect(focused.locator('.collaboration-outcome-artifacts')).toBeVisible();expect((await focused.locator('.collaboration-outcome').boundingBox())!.width).toBeGreaterThan(700)
  await page.screenshot({path:join(out,'focused-900-light.png')});await page.keyboard.press('Escape')
  await page.evaluate(()=>localStorage.setItem('dawn.global.theme','dark'));await page.reload();await page.getByRole('button',{name:/^科研流水线验收/}).click();await 进坞(page,'团队')
  overview=page.getByRole('region',{name:'运行总览',exact:true});outcome=overview.getByRole('region',{name:'协作成果',exact:true});await expect(page.locator('html')).toHaveClass(/dawn-dark/);await capture('main-900-dark')
  page=await dawn.重开();await page.getByRole('button',{name:/^科研流水线验收/}).click();await 进坞(page,'团队')
  overview=page.getByRole('region',{name:'运行总览',exact:true});outcome=overview.getByRole('region',{name:'协作成果',exact:true})
  const restored=await page.evaluate(async sid=>(await window.dawn!.invoke('getRunOverview',{sessionId:sid})).data as {source:string},saved(dawn.workspace)!.ownerSessionId)
  expect(['live','disk']).toContain(restored.source)
  await expect(outcome).toHaveAttribute('data-outcome',restored.source==='disk'?'history':mode==='pass'?'accepted':'blocked');await capture(restored.source==='disk'?'history-dark':'restart-live-dark')
  const stopped=await page.evaluate(async sid=>await window.dawn!.invoke('stopSession',{sessionId:sid}),saved(dawn.workspace)!.ownerSessionId);expect(stopped.ok).toBe(true)
  await expect.poll(async()=>await page.evaluate(async sid=>((await window.dawn!.invoke('getRunOverview',{sessionId:sid})).data as {source:string}).source,saved(dawn.workspace)!.ownerSessionId)).toBe('disk')
  const disk=await page.evaluate(async sid=>(await window.dawn!.invoke('getRunOverview',{sessionId:sid})).data as {source:string;runs:Array<{phase:string}>},saved(dawn.workspace)!.ownerSessionId)
  expect(disk.source).toBe('disk');expect(disk.runs.every(run=>run.phase==='unknown')).toBe(true)
  await expect(outcome).toHaveAttribute('data-outcome','history');await capture('retired-disk-history-dark')
 })
})
