# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: collaboration-outcome.spec.ts >> outcome blocked >> shows exact stage and final versions, compact expansion, and readable 900px views
- Location: e2e/collaboration-outcome.spec.ts:15:2

# Error details

```
Error: expect(locator).toHaveAttribute(expected) failed

Locator:  getByRole('region', { name: '运行总览', exact: true }).getByRole('region', { name: '协作成果', exact: true })
Expected: "history"
Received: "blocked"
Timeout:  25000ms

Call log:
  - Expect "toHaveAttribute" with timeout 25000ms
  - waiting for getByRole('region', { name: '运行总览', exact: true }).getByRole('region', { name: '协作成果', exact: true })
    53 × locator resolved to <section aria-label="协作成果" data-compact="false" data-outcome="blocked" class="collaboration-outcome">…</section>
       - unexpected value "blocked"

```

```yaml
- region "协作成果":
  - text: 任务目标
  - heading "按已确认方法执行合成数据流程，保留输入并交付文件" [level=3]
  - text: 当前阶段 · 数据核查
  - heading "协作需要核对" [level=4]
  - paragraph: 查看当前任务与宿主反馈，核对下一步。
  - strong: 当前阻碍
  - paragraph: 存在阻塞、执行/审阅问题或缺少契约要求的证据，未放行下游
  - status: 路线回写待同步；与成果验收分别记录。
  - text: 下一步 · 查看对应任务的证据与记录
  - button "查看提交反馈"
  - heading "验收成果与版本" [level=4]
  - paragraph: 尚无本轮已验收成果。
  - paragraph: 执行轮次未设上限 · 审阅预留未启用 · 在途 0 · 费用未记录
  - button "展开流程工作台"
```

# Test source

```ts
  1  | /** Built Electron and real host tools/receipts; localhost inference is a deterministic fixture. */
  2  | import {mkdirSync,writeFileSync,readFileSync,readdirSync} from 'node:fs'
  3  | import {join,resolve} from 'node:path'
  4  | import {test,expect,在项目里开会话,进坞} from './fixtures.js'
  5  | function prepare(workspace:string){
  6  |  mkdirSync(join(workspace,'.dawn/agents'),{recursive:true});writeFileSync(join(workspace,'in.csv'),'x\n1\n2\n3\n4\n5\n')
  7  |  for(const stage of ['check','analyze','review'])writeFileSync(join(workspace,'.dawn/agents',`pipeline-${stage}.md`),`---\nname: pipeline-${stage}\ndescription: ${stage}\ntools: read,write,bash\n---\n按冻结契约执行并正式提交。`)
  8  | }
  9  | function saved(workspace:string){
  10 |  for(const id of readdirSync(join(workspace,'.dawn/sessions'))){try{const dir=join(workspace,'.dawn/sessions',id),teamId=readFileSync(join(dir,'teams/current'),'utf8').trim(),team=JSON.parse(readFileSync(join(dir,'teams',teamId,'team.json'),'utf8'));if(team.pipeline)return{ownerSessionId:id,team}}catch{/* Host checkpoint is being written. */}}
  11 |  return undefined
  12 | }
  13 | for(const mode of ['pass','blocked'] as const)test.describe(`outcome ${mode}`,()=>{
  14 |  test.use({dawnOptions:{gitInit:true,sciencePipeline:mode,firstChunkDelayMs:mode==='pass'?1500:undefined}})
  15 |  test('shows exact stage and final versions, compact expansion, and readable 900px views',async({dawn},testInfo)=>{
  16 |   let page=dawn.page;const out=resolve(process.env.DAWN_OUTCOME_EVIDENCE_DIR??testInfo.outputPath('evidence'),mode);mkdirSync(out,{recursive:true});prepare(dawn.workspace)
  17 |   await 在项目里开会话(page);await 进坞(page,'团队')
  18 |   await page.locator('main.main .composer textarea').fill('科研流水线验收：协作成果分层界面验收，使用合成数据。');await page.getByRole('button',{name:'发送',exact:true}).click()
  19 |   let overview=page.getByRole('region',{name:'运行总览',exact:true}),outcome=overview.getByRole('region',{name:'协作成果',exact:true})
  20 |   const capture=async(name:string)=>{await outcome.scrollIntoViewIfNeeded();await page.screenshot({path:join(out,name+'.png')});await outcome.screenshot({path:join(out,name+'-panel.png')});writeFileSync(join(out,name+'.json'),JSON.stringify({name,actualElectron:true,inference:'localhost-fixture',scientificValidation:false,viewport:page.viewportSize(),checkpoint:saved(dawn.workspace)},null,2))}
  21 |   if(mode==='pass'){
  22 |    await expect(outcome.getByRole('heading',{name:'分析阶段已验收，等待独立审阅',exact:true})).toBeVisible()
  23 |    await expect(outcome).toContainText('当前阶段 · 独立审阅');await expect(outcome.locator('.collaboration-outcome-artifact')).toContainText('阶段产物')
  24 |    await capture('review-pending-light')
  25 |   }
  26 |   await expect.poll(()=>saved(dawn.workspace)?.team.pipeline.status).toBe(mode==='pass'?'completed':'blocked')
  27 |   await expect(outcome).toHaveAttribute('data-outcome',mode==='pass'?'accepted':'blocked')
  28 |   await page.setViewportSize({width:1440,height:960});await capture('main-light')
  29 |   if(mode==='pass'){
  30 |    const analysis=saved(dawn.workspace)!.team.tasks.find((t:any)=>t.contract?.resultType==='model-metrics'),version=analysis.receipt.versions.outputs[0]
  31 |    await expect(outcome.locator('.collaboration-outcome-artifact')).toContainText('最终成果');await outcome.getByRole('button',{name:'查看验收成果',exact:true}).click()
  32 |    await expect(overview.locator(`[data-task-detail="${saved(dawn.workspace)!.team.pipeline.currentTaskId}"]`)).toBeVisible()
  33 |    await outcome.locator('.collaboration-outcome-artifact').click();await expect(overview.locator(`[data-task-detail="${analysis.id}"]`)).toBeVisible()
  34 |    await expect(overview.getByRole('tab',{name:'产物',exact:true})).toHaveAttribute('aria-selected','true');await expect(overview.locator('.collaboration-evidence')).toContainText(version.sha256)
  35 |   }else{
  36 |    await outcome.getByRole('button',{name:'查看提交反馈',exact:true}).click();await expect(overview.getByRole('tab',{name:'记录',exact:true})).toHaveAttribute('aria-selected','true')
  37 |   }
  38 |   await outcome.getByRole('button',{name:'展开流程工作台',exact:true}).click()
  39 |   const dialog=page.getByRole('dialog',{name:'流程工作台',exact:true})
  40 |   await expect(dialog.locator('.collaboration-outcome-inspection')).not.toHaveAttribute('open')
  41 |   await expect(dialog.getByRole('heading',{name:'Agent 网络',exact:true})).toBeInViewport();await page.screenshot({path:join(out,'expanded-light.png')})
  42 |   await page.keyboard.press('Escape');await expect(outcome.getByRole('button',{name:'展开流程工作台',exact:true})).toBeFocused()
  43 |   await page.setViewportSize({width:900,height:900});await capture('main-900-light')
  44 |   expect(await outcome.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true)
  45 |   await expect(outcome.getByText('窄面板显示摘要；展开可查看完整目标和成果版本。',{exact:true})).toBeVisible()
  46 |   await expect(outcome.getByRole('button',{name:'展开流程工作台',exact:true})).toBeInViewport()
  47 |   await outcome.getByRole('button',{name:'展开流程工作台',exact:true}).click()
  48 |   const focused=page.getByRole('dialog',{name:'流程工作台',exact:true});expect((await focused.boundingBox())!.width).toBeGreaterThan(750)
> 49 |   await expect(focused.locator('.collaboration-outcome-inspection')).toBeVisible();await focused.locator('.collaboration-outcome-inspection > summary').click()
     |                         ^ Error: expect(locator).toHaveAttribute(expected) failed
  50 |   await expect(focused.locator('.collaboration-outcome-artifacts')).toBeVisible();expect((await focused.locator('.collaboration-outcome').boundingBox())!.width).toBeGreaterThan(700)
  51 |   await page.screenshot({path:join(out,'focused-900-light.png')});await page.keyboard.press('Escape')
  52 |   await page.evaluate(()=>localStorage.setItem('dawn.global.theme','dark'));await page.reload();await page.getByRole('button',{name:/^科研流水线验收/}).click();await 进坞(page,'团队')
  53 |   overview=page.getByRole('region',{name:'运行总览',exact:true});outcome=overview.getByRole('region',{name:'协作成果',exact:true});await expect(page.locator('html')).toHaveClass(/dawn-dark/);await capture('main-900-dark')
  54 |   page=await dawn.重开();await page.getByRole('button',{name:/^科研流水线验收/}).click();await 进坞(page,'团队')
  55 |   overview=page.getByRole('region',{name:'运行总览',exact:true});outcome=overview.getByRole('region',{name:'协作成果',exact:true})
  56 |   await expect(outcome).toHaveAttribute('data-outcome','history');await capture('history-dark')
  57 |  })
  58 | })
  59 | 
```