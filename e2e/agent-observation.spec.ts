/** Actual built Electron + host protocol + isolated CLI children. Only inference is localhost. */
import {mkdirSync,writeFileSync,readFileSync,readdirSync,existsSync} from 'node:fs'
import {join,resolve} from 'node:path'
import {test,expect,在项目里开会话,进坞} from './fixtures.js'
import type {RunOverview} from '../src/protocol/run-overview.js'
function saved(workspace:string){
 for(const id of readdirSync(join(workspace,'.dawn/sessions'))){try{const dir=join(workspace,'.dawn/sessions',id),teamId=readFileSync(join(dir,'teams/current'),'utf8').trim(),team=JSON.parse(readFileSync(join(dir,'teams',teamId,'team.json'),'utf8'));if(team.pipeline)return{ownerSessionId:id,team}}catch{/* Atomic host checkpoint in flight. */}}
 return undefined
}
function prepare(workspace:string){
 mkdirSync(join(workspace,'.dawn/agents'),{recursive:true});writeFileSync(join(workspace,'in.csv'),'x\n1\n2\n3\n4\n5\n')
 for(const stage of ['check','analyze','review'])writeFileSync(join(workspace,'.dawn/agents',`pipeline-${stage}.md`),`---\nname: pipeline-${stage}\ndescription: ${stage}\ntools: read,write,bash\n---\n按冻结契约执行并正式提交。`)
}
test.describe('member observation',()=>{
 test.use({dawnOptions:{gitInit:true,sciencePipeline:'observation',firstChunkDelayMs:900}})
 test('keeps current SDK context separate from two settled epochs, history, owner switches and restart',async({dawn},testInfo)=>{
  let page=dawn.page;const out=resolve(process.env.DAWN_D3_EVIDENCE_DIR??testInfo.outputPath('evidence'),'members');mkdirSync(out,{recursive:true});prepare(dawn.workspace)
  const release=join(dawn.workspace,'.d3-observation-release')
  const host=async()=>await page.evaluate(async sid=>(await window.dawn!.invoke('getRunOverview',{sessionId:sid})).data as RunOverview,saved(dawn.workspace)!.ownerSessionId)
  const capture=async(name:string)=>{await page.screenshot({path:join(out,name+'.png')});writeFileSync(join(out,name+'.json'),JSON.stringify({actualElectron:true,inference:'localhost-fixture',scientificValidation:false,viewport:await page.evaluate(()=>({width:innerWidth,height:innerHeight})),hostOverview:await host()},null,2))}
  await 在项目里开会话(page);await 进坞(page,'团队');await page.locator('main.main .composer textarea').fill('科研流水线验收：成员观测两轮与来源，仅合成数据。');await page.getByRole('button',{name:'发送',exact:true}).click()
  await expect.poll(()=>!!saved(dawn.workspace)).toBe(true)
  let unknown:RunOverview|undefined
  await expect.poll(async()=>{const s=await host();if(s.runs.some(r=>r.phase==='running'&&r.contextObservation?.sample?.sample.availability==='unknown')){unknown=s;return true}return false},{intervals:[100]}).toBe(true)
  writeFileSync(join(out,'actual-unknown.json'),JSON.stringify(unknown,null,2))
  const overview=()=>page.getByRole('region',{name:'运行总览',exact:true})
  await expect(overview().locator('.agent-observation').first()).toContainText('未知');await capture('current-unknown-light')
  await expect.poll(async()=>{const s=await host();return s.runs.some(r=>r.phase==='running'&&r.contextObservation?.current&&r.contextObservation.sample?.sample.availability==='available'&&r.label.includes('analyze'))},{intervals:[100]}).toBe(true)
  const active=(await host()).runs.find(r=>r.label.includes('analyze'))!;expect(active.contextObservation!.sample!.ownerSessionId).toBe(saved(dawn.workspace)!.ownerSessionId)
  await overview().getByRole('button',{name:active.label,exact:true}).click()
  await expect(overview().locator('.collaboration-detail .agent-observation')).toHaveAttribute('data-context-current','true')
  await overview().locator('.collaboration-detail .agent-observation-details > summary').click()
  await expect(overview().locator('.agent-observation-details[open]')).toContainText('组成估算 · 保留内容字节')
  await expect(overview().locator('.agent-observation-details[open]')).toContainText('不是 token 分解或真实请求字节')
  await page.setViewportSize({width:1440,height:960});await capture('current-known-1440-light')
  await overview().getByRole('button',{name:'展开流程工作台',exact:true}).click()
  let dialog=page.getByRole('dialog',{name:'流程工作台',exact:true})
  await expect(dialog.locator(`[data-member-card="${active.id}"] .agent-observation`)).toHaveAttribute('data-context-current','true')
  await expect(dialog.locator('.collaboration-network-node .agent-observation[data-context-current="true"]')).toHaveCount(1)
  const geometry=await dialog.locator('.collaboration-network-node').evaluateAll(nodes=>nodes.map(el=>{const r=el.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,scrollHeight:el.scrollHeight,clientHeight:el.clientHeight}}));writeFileSync(join(out,'network-geometry.json'),JSON.stringify(geometry,null,2))
  for(let i=0;i<geometry.length;i++)for(let j=i+1;j<geometry.length;j++){const a=geometry[i]!,b=geometry[j]!;expect(a.x+a.width<=b.x||b.x+b.width<=a.x||a.y+a.height<=b.y||b.y+b.height<=a.y).toBe(true)}
  await capture('expanded-current-1440-light')
  await page.setViewportSize({width:900,height:900});await expect(dialog.getByRole('heading',{name:'Agent 网络',exact:true})).toBeInViewport();await capture('expanded-current-900-light')
  await dialog.locator(`[data-member-card="${active.id}"]`).click();await expect(dialog.locator('.collaboration-detail .agent-observation')).toHaveAttribute('data-context-current','true');await dialog.locator('.collaboration-detail .agent-observation-details > summary').click();await dialog.locator('.collaboration-detail').scrollIntoViewIfNeeded();await capture('detail-current-900-light')
  await page.keyboard.press('Escape');await expect(overview().getByRole('button',{name:'展开流程工作台',exact:true})).toBeFocused()
  await capture('summary-current-900-light')
  await page.evaluate(()=>localStorage.setItem('dawn.global.theme','dark'));await page.reload();await page.getByRole('button',{name:/^科研流水线验收：成员观测/}).click();await 进坞(page,'团队');await page.setViewportSize({width:1440,height:960});await expect(page.locator('html')).toHaveClass(/dawn-dark/)
  await overview().getByRole('button',{name:'展开流程工作台',exact:true}).click();dialog=page.getByRole('dialog',{name:'流程工作台',exact:true});await capture('expanded-current-1440-dark')
  // Release only the owned localhost-fixture Bash gate. No production cancellation/wait rules change.
  writeFileSync(release,'release\n')
  await expect.poll(()=>saved(dawn.workspace)?.team.pipeline.status).toBe('completed')
  const settled=await host();writeFileSync(join(out,'actual-two-epochs.json'),JSON.stringify(settled,null,2));const twice=settled.runs.find(r=>r.label.includes('analyze'))!
  expect(twice.usageTotals?.settledEpochs).toBe(2);expect(twice.usageTotals?.input).toBeGreaterThan(0);expect(twice.usageTotals?.output).toBeGreaterThan(0)
  expect(twice.usageTotals?.partial).toContain('cacheRead');expect(twice.usageTotals?.cacheRead).toBeUndefined();expect(twice.contextObservation?.current).toBe(false)
  await dialog.locator(`[data-member-card="${twice.id}"]`).click();await dialog.locator('.collaboration-detail .agent-observation-details > summary').click();await dialog.locator('.collaboration-detail').scrollIntoViewIfNeeded();await expect(dialog.locator('.collaboration-detail')).toContainText('2 轮已结算');await expect(dialog.locator('.collaboration-detail')).toContainText('缓存读取：未记录（单列）');await capture('settled-two-epochs-partial-1440-dark')
  await page.keyboard.press('Escape')
  await 在项目里开会话(page);await 进坞(page,'团队');await expect(overview().locator('.agent-observation')).toHaveCount(0)
  await page.getByRole('button',{name:/^科研流水线验收：成员观测/}).click();await 进坞(page,'团队');await expect(overview().locator('.agent-observation')).not.toHaveCount(0)
  page=await dawn.重开();await page.getByRole('button',{name:/^科研流水线验收：成员观测/}).click();await 进坞(page,'团队')
  const restarted=await host();expect(restarted.runs.every(r=>!r.contextObservation?.current)).toBe(true);expect(restarted.runs.find(r=>r.id===twice.id)?.usageTotals).toEqual(twice.usageTotals);await expect(overview().locator('[data-context-current="true"]')).toHaveCount(0);await page.setViewportSize({width:1440,height:960});await overview().getByRole('button',{name:'展开流程工作台',exact:true}).click();dialog=page.getByRole('dialog',{name:'流程工作台',exact:true});await dialog.locator(`[data-member-card="${twice.id}"]`).click();await dialog.locator('.collaboration-detail .agent-observation-details > summary').click();await dialog.locator('.collaboration-detail').scrollIntoViewIfNeeded();await capture('restarted-history-1440-dark')
  const stopped=await page.evaluate(async sid=>window.dawn!.invoke('stopSession',{sessionId:sid}),saved(dawn.workspace)!.ownerSessionId);expect(stopped.ok).toBe(true)
  await expect.poll(async()=>(await host()).source).toBe('disk');await expect(overview()).toContainText('磁盘记录只读；查看不会启动或恢复任务');await expect(dialog.locator('.collaboration-detail .agent-observation-details')).toContainText('磁盘历史快照');await expect(overview().locator('[data-context-current="true"]')).toHaveCount(0);await capture('retired-disk-history-1440-dark')
  writeFileSync(join(out,'result.json'),JSON.stringify({actualElectron:true,unknownCaptured:!!unknown,currentCaptured:true,ownerSwitch:true,restartCurrentInvalidated:true,twoEpochs:twice.usageTotals,fixtureReleasePresent:existsSync(release)},null,2))
 })
})
