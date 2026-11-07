# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: agent-observation.spec.ts >> member observation >> keeps current SDK context separate from two settled epochs, history, owner switches and restart
- Location: e2e/agent-observation.spec.ts:16:2

# Error details

```
Error: expect(locator).toContainText(expected) failed

Locator: getByRole('dialog', { name: '流程工作台', exact: true }).locator('.collaboration-detail')
Expected substring: "缓存读取：至少 0 tokens（单列）"
Received string:    "pipeline-analyze类型 team · 执行代次 2过程交接产物记录当前上下文 · SDK估算未知已结算累计80 tokens查看观测来源与覆盖当前执行已停止或不活跃deepseek / deepseek-flash采样时间：2026/11/8 00:56:56历史最后值 · 29 tokens（非当前）来源：SDK估算模型容量：128,000 tokens · 模型配置组成估算 · 保留内容字节系统 1,533 · 工具 4,613 · 消息 12,757 字节不含隐藏推理；不是 token 分解或真实请求字节。成员跨轮次、跨任务累计；仅已记录的结算输入与输出，不代表本任务费用。来源：宿主逐轮结算增量2 轮已结算 · 2 轮不完整输入：48 tokens · 输出：32 tokens缓存读取：未记录（单列）费用未记录任务轨迹执行完成00:56:53开始执行00:56:53核验冻结输入00:56:53后端执行00:56:56宿主验收00:56:56执行已结算宿主验收通过查看 1 条工具记录查看 1 个产物版本普通委派任务宿主验收通过"
Timeout: 25000ms

Call log:
  - Expect "toContainText" with timeout 25000ms
  - waiting for getByRole('dialog', { name: '流程工作台', exact: true }).locator('.collaboration-detail')
    53 × locator resolved to <div class="collaboration-detail" data-selected-run="child-26d5bbc3903ffa4e8d1df8f40e71bc1c">…</div>
       - unexpected value "pipeline-analyze类型 team · 执行代次 2过程交接产物记录当前上下文 · SDK估算未知已结算累计80 tokens查看观测来源与覆盖当前执行已停止或不活跃deepseek / deepseek-flash采样时间：2026/11/8 00:56:56历史最后值 · 29 tokens（非当前）来源：SDK估算模型容量：128,000 tokens · 模型配置组成估算 · 保留内容字节系统 1,533 · 工具 4,613 · 消息 12,757 字节不含隐藏推理；不是 token 分解或真实请求字节。成员跨轮次、跨任务累计；仅已记录的结算输入与输出，不代表本任务费用。来源：宿主逐轮结算增量2 轮已结算 · 2 轮不完整输入：48 tokens · 输出：32 tokens缓存读取：未记录（单列）费用未记录任务轨迹执行完成00:56:53开始执行00:56:53核验冻结输入00:56:53后端执行00:56:56宿主验收00:56:56执行已结算宿主验收通过查看 1 条工具记录查看 1 个产物版本普通委派任务宿主验收通过"

```

```yaml
- strong: pipeline-analyze
- text: 类型 team · 执行代次 2
- button "收起检查面板"
- tablist "任务详情":
  - tab "过程" [selected]
  - tab "交接"
  - tab "产物"
  - tab "记录"
- tabpanel "过程":
  - text: 当前上下文 · SDK估算 未知 已结算累计 80 tokens
  - group:
    - text: 查看观测来源与覆盖 当前执行已停止或不活跃 deepseek / deepseek-flash 采样时间：2026/11/8 00:56:56 历史最后值 · 29 tokens（非当前） 来源：SDK估算 模型容量：128,000 tokens · 模型配置
    - strong: 组成估算 · 保留内容字节
    - text: 系统 1,533 · 工具 4,613 · 消息 12,757 字节 不含隐藏推理；不是 token 分解或真实请求字节。 成员跨轮次、跨任务累计；仅已记录的结算输入与输出，不代表本任务费用。 来源：宿主逐轮结算增量 2 轮已结算 · 2 轮不完整 输入：48 tokens · 输出：32 tokens 缓存读取：未记录（单列） 费用未记录
  - region "任务轨迹":
    - strong: 任务轨迹
    - text: 执行完成
    - list:
      - listitem:
        - time: 00:56:53
        - text: 开始执行
      - listitem:
        - time: 00:56:53
        - text: 核验冻结输入
      - listitem:
        - time: 00:56:53
        - text: 后端执行
      - listitem:
        - time: 00:56:56
        - text: 宿主验收
      - listitem:
        - time: 00:56:56
        - text: 执行已结算 宿主验收通过
    - button "查看 1 条工具记录"
    - button "查看 1 个产物版本"
  - paragraph: 普通委派任务
  - paragraph: 宿主验收通过
```

# Test source

```ts
  1  | /** Actual built Electron + host protocol + isolated CLI children. Only inference is localhost. */
  2  | import {mkdirSync,writeFileSync,readFileSync,readdirSync,existsSync} from 'node:fs'
  3  | import {join,resolve} from 'node:path'
  4  | import {test,expect,在项目里开会话,进坞} from './fixtures.js'
  5  | import type {RunOverview} from '../src/protocol/run-overview.js'
  6  | function saved(workspace:string){
  7  |  for(const id of readdirSync(join(workspace,'.dawn/sessions'))){try{const dir=join(workspace,'.dawn/sessions',id),teamId=readFileSync(join(dir,'teams/current'),'utf8').trim(),team=JSON.parse(readFileSync(join(dir,'teams',teamId,'team.json'),'utf8'));if(team.pipeline)return{ownerSessionId:id,team}}catch{/* Atomic host checkpoint in flight. */}}
  8  |  return undefined
  9  | }
  10 | function prepare(workspace:string){
  11 |  mkdirSync(join(workspace,'.dawn/agents'),{recursive:true});writeFileSync(join(workspace,'in.csv'),'x\n1\n2\n3\n4\n5\n')
  12 |  for(const stage of ['check','analyze','review'])writeFileSync(join(workspace,'.dawn/agents',`pipeline-${stage}.md`),`---\nname: pipeline-${stage}\ndescription: ${stage}\ntools: read,write,bash\n---\n按冻结契约执行并正式提交。`)
  13 | }
  14 | test.describe('member observation',()=>{
  15 |  test.use({dawnOptions:{gitInit:true,sciencePipeline:'observation',firstChunkDelayMs:900}})
  16 |  test('keeps current SDK context separate from two settled epochs, history, owner switches and restart',async({dawn},testInfo)=>{
  17 |   let page=dawn.page;const out=resolve(process.env.DAWN_D3_EVIDENCE_DIR??testInfo.outputPath('evidence'),'members');mkdirSync(out,{recursive:true});prepare(dawn.workspace)
  18 |   const release=join(dawn.workspace,'.d3-observation-release')
  19 |   const host=async()=>await page.evaluate(async sid=>(await window.dawn!.invoke('getRunOverview',{sessionId:sid})).data as RunOverview,saved(dawn.workspace)!.ownerSessionId)
  20 |   const capture=async(name:string)=>{await page.screenshot({path:join(out,name+'.png')});writeFileSync(join(out,name+'.json'),JSON.stringify({actualElectron:true,inference:'localhost-fixture',scientificValidation:false,viewport:await page.evaluate(()=>({width:innerWidth,height:innerHeight})),hostOverview:await host()},null,2))}
  21 |   await 在项目里开会话(page);await 进坞(page,'团队');await page.locator('main.main .composer textarea').fill('科研流水线验收：成员观测两轮与来源，仅合成数据。');await page.getByRole('button',{name:'发送',exact:true}).click()
  22 |   await expect.poll(()=>!!saved(dawn.workspace)).toBe(true)
  23 |   let unknown:RunOverview|undefined
  24 |   await expect.poll(async()=>{const s=await host();if(s.runs.some(r=>r.phase==='running'&&r.contextObservation?.sample?.sample.availability==='unknown')){unknown=s;return true}return false},{intervals:[100]}).toBe(true)
  25 |   writeFileSync(join(out,'actual-unknown.json'),JSON.stringify(unknown,null,2))
  26 |   const overview=()=>page.getByRole('region',{name:'运行总览',exact:true})
  27 |   await expect(overview().locator('.agent-observation').first()).toContainText('未知');await capture('current-unknown-light')
  28 |   await expect.poll(async()=>{const s=await host();return s.runs.some(r=>r.phase==='running'&&r.contextObservation?.current&&r.contextObservation.sample?.sample.availability==='available'&&r.label.includes('analyze'))},{intervals:[100]}).toBe(true)
  29 |   const active=(await host()).runs.find(r=>r.label.includes('analyze'))!;expect(active.contextObservation!.sample!.ownerSessionId).toBe(saved(dawn.workspace)!.ownerSessionId)
  30 |   await overview().getByRole('button',{name:active.label,exact:true}).click()
  31 |   await expect(overview().locator('.collaboration-detail .agent-observation')).toHaveAttribute('data-context-current','true')
  32 |   await overview().locator('.collaboration-detail .agent-observation-details > summary').click()
  33 |   await expect(overview().locator('.agent-observation-details[open]')).toContainText('组成估算 · 保留内容字节')
  34 |   await expect(overview().locator('.agent-observation-details[open]')).toContainText('不是 token 分解或真实请求字节')
  35 |   await page.setViewportSize({width:1440,height:960});await capture('current-known-1440-light')
  36 |   await overview().getByRole('button',{name:'展开流程工作台',exact:true}).click()
  37 |   let dialog=page.getByRole('dialog',{name:'流程工作台',exact:true})
  38 |   await expect(dialog.locator(`[data-member-card="${active.id}"] .agent-observation`)).toHaveAttribute('data-context-current','true')
  39 |   await expect(dialog.locator('.collaboration-network-node .agent-observation[data-context-current="true"]')).toHaveCount(1)
  40 |   const geometry=await dialog.locator('.collaboration-network-node').evaluateAll(nodes=>nodes.map(el=>{const r=el.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,scrollHeight:el.scrollHeight,clientHeight:el.clientHeight}}));writeFileSync(join(out,'network-geometry.json'),JSON.stringify(geometry,null,2))
  41 |   for(let i=0;i<geometry.length;i++)for(let j=i+1;j<geometry.length;j++){const a=geometry[i]!,b=geometry[j]!;expect(a.x+a.width<=b.x||b.x+b.width<=a.x||a.y+a.height<=b.y||b.y+b.height<=a.y).toBe(true)}
  42 |   await capture('expanded-current-1440-light')
  43 |   await page.setViewportSize({width:900,height:900});await expect(dialog.getByRole('heading',{name:'Agent 网络',exact:true})).toBeInViewport();await capture('expanded-current-900-light')
  44 |   await dialog.locator(`[data-member-card="${active.id}"]`).click();await expect(dialog.locator('.collaboration-detail .agent-observation')).toHaveAttribute('data-context-current','true');await dialog.locator('.collaboration-detail .agent-observation-details > summary').click();await dialog.locator('.collaboration-detail').scrollIntoViewIfNeeded();await capture('detail-current-900-light')
  45 |   await page.keyboard.press('Escape');await expect(overview().getByRole('button',{name:'展开流程工作台',exact:true})).toBeFocused()
  46 |   await capture('summary-current-900-light')
  47 |   await page.evaluate(()=>localStorage.setItem('dawn.global.theme','dark'));await page.reload();await page.getByRole('button',{name:/^科研流水线验收：成员观测/}).click();await 进坞(page,'团队');await page.setViewportSize({width:1440,height:960});await expect(page.locator('html')).toHaveClass(/dawn-dark/)
  48 |   await overview().getByRole('button',{name:'展开流程工作台',exact:true}).click();dialog=page.getByRole('dialog',{name:'流程工作台',exact:true});await capture('expanded-current-1440-dark')
  49 |   // Release only the owned localhost-fixture Bash gate. No production cancellation/wait rules change.
  50 |   writeFileSync(release,'release\n')
  51 |   await expect.poll(()=>saved(dawn.workspace)?.team.pipeline.status).toBe('completed')
  52 |   const settled=await host(),twice=settled.runs.find(r=>r.label.includes('analyze'))!
  53 |   expect(twice.usageTotals?.settledEpochs).toBe(2);expect(twice.usageTotals?.input).toBeGreaterThan(0);expect(twice.usageTotals?.output).toBeGreaterThan(0)
  54 |   expect(twice.usageTotals?.partial).toContain('cacheRead');expect(twice.contextObservation?.current).toBe(false)
> 55 |   await dialog.locator(`[data-member-card="${twice.id}"]`).click();await dialog.locator('.collaboration-detail .agent-observation-details > summary').click();await dialog.locator('.collaboration-detail').scrollIntoViewIfNeeded();await expect(dialog.locator('.collaboration-detail')).toContainText('2 轮已结算');await expect(dialog.locator('.collaboration-detail')).toContainText('缓存读取：至少 0 tokens（单列）');await capture('settled-two-epochs-partial-1440-dark')
     |                                                                                                                                                                                                                                                                                                                                                                          ^ Error: expect(locator).toContainText(expected) failed
  56 |   await page.keyboard.press('Escape')
  57 |   await 在项目里开会话(page);await 进坞(page,'团队');await expect(overview().locator('.agent-observation')).toHaveCount(0)
  58 |   await page.getByRole('button',{name:/^科研流水线验收：成员观测/}).click();await 进坞(page,'团队');await expect(overview().locator('.agent-observation')).not.toHaveCount(0)
  59 |   page=await dawn.重开();await page.getByRole('button',{name:/^科研流水线验收：成员观测/}).click();await 进坞(page,'团队')
  60 |   const restarted=await host();expect(restarted.runs.every(r=>!r.contextObservation?.current)).toBe(true);expect(restarted.runs.find(r=>r.id===twice.id)?.usageTotals).toEqual(twice.usageTotals);await expect(overview().locator('[data-context-current="true"]')).toHaveCount(0);await capture('restarted-history-1440-dark')
  61 |   const stopped=await page.evaluate(async sid=>window.dawn!.invoke('stopSession',{sessionId:sid}),saved(dawn.workspace)!.ownerSessionId);expect(stopped.ok).toBe(true)
  62 |   await expect.poll(async()=>(await host()).source).toBe('disk');await expect(overview().locator('[data-context-current="true"]')).toHaveCount(0);await capture('retired-disk-history-1440-dark')
  63 |   writeFileSync(join(out,'result.json'),JSON.stringify({actualElectron:true,unknownCaptured:!!unknown,currentCaptured:true,ownerSwitch:true,restartCurrentInvalidated:true,twoEpochs:twice.usageTotals,fixtureReleasePresent:existsSync(release)},null,2))
  64 |  })
  65 | })
  66 | 
```