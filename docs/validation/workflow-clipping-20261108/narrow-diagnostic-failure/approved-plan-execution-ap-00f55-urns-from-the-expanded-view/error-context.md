# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: approved-plan-execution.spec.ts >> approved arrangement starts the frozen DAG, exposes real receipts and returns from the expanded view
- Location: e2e/approved-plan-execution.spec.ts:8:1

# Error details

```
Error: expect(locator).toBeInViewport() failed

Locator:  getByRole('region', { name: '运行总览', exact: true }).locator('.collaboration-graph-scroll').locator('.collaboration-graph-node').nth(2)
Expected: in viewport
Received: viewport ratio 0.9956521987915039
Timeout:  2000ms

Call log:
  - Expect "toBeInViewport" with timeout 2000ms
  - waiting for getByRole('region', { name: '运行总览', exact: true }).locator('.collaboration-graph-scroll').locator('.collaboration-graph-node').nth(2)
    20 × locator resolved to <button type="button" aria-pressed="false" data-task-id="plan_3" data-state="completed" aria-label="独立审阅模型与证据" class="btn btn-outline btn-card-compact collaboration-graph-node">…</button>
       - unexpected value "viewport ratio 0.9956521987915039"

```

```yaml
- button "独立审阅模型与证据":
  - strong: 独立审阅模型与证据
  - text: 第 1 次
```

# Test source

```ts
  1   | import type {ResponseOf} from '../src/protocol/index.js'
  2   | import {mkdirSync,writeFileSync,readFileSync} from 'node:fs'
  3   | import {join,resolve} from 'node:path'
  4   | import {test,expect,在项目里开会话,进坞} from './fixtures.js'
  5   | const out=resolve(process.env.DAWN_APPROVED_PLAN_EVIDENCE_DIR??'docs/validation/plan-execution-workbench-20261108/desktop')
  6   | const requestBody=(r:unknown)=>(r as {body?:{messages?:unknown[];max_tokens?:number}}).body
  7   | test.use({dawnOptions:{gitInit:true}})
  8   | test('approved arrangement starts the frozen DAG, exposes real receipts and returns from the expanded view',async({dawn})=>{
  9   |  const{page,workspace}=dawn;mkdirSync(out,{recursive:true})
  10  |  writeFileSync(join(workspace,'input.csv'),'x\n1\n2\n3\n')
  11  |  await page.evaluate(()=>localStorage.setItem('dawn.global.theme','dark'));await page.reload()
  12  |  await 在项目里开会话(page);await 进坞(page,'团队')
  13  |  const auto=page.getByRole('region',{name:'自动安排',exact:true})
  14  |  await auto.getByRole('textbox',{name:'任务目标',exact:true}).fill('清洗、建模并独立审阅 input.csv')
  15  |  await auto.getByRole('button',{name:'生成安排',exact:true}).click()
  16  |  await expect(auto.getByRole('status',{name:'任务块数',exact:true})).toHaveText('3 个任务块')
  17  |  await expect(auto).toContainText('限定产物写入')
  18  |  await auto.locator('.task-arrangement-result').screenshot({path:join(out,'stage-a-frozen-proposal.png')})
  19  |  const card=page.locator('main.main .plan-card')
  20  |  await card.getByRole('button',{name:'照这个做',exact:true}).click()
  21  |  await expect(card).toHaveAttribute('data-status','approved')
  22  |  let overview=page.getByRole('region',{name:'运行总览',exact:true})
  23  |  let progress=overview.getByRole('region',{name:'批准方案执行进度',exact:true})
  24  |  await expect(progress).toContainText('计划 3 项 · 已启动 3 项')
  25  |  await expect(progress.getByText('宿主验收通过',{exact:true})).toHaveCount(3)
  26  |  expect(readFileSync(join(workspace,'input.csv'),'utf8')).toBe('x\n1\n2\n3\n')
  27  |  const before=dawn.requests.length
  28  |  await card.getByRole('button',{name:'开始或继续未执行任务',exact:true}).click()
  29  |  await expect(card.getByRole('button',{name:'开始或继续未执行任务',exact:true})).toBeEnabled()
  30  |  expect(dawn.requests.length).toBe(before)
  31  |  await progress.scrollIntoViewIfNeeded();await page.screenshot({path:join(out,'stage-b-executed.png')})
  32  |  const artifactResponse=await page.evaluate(async()=>{const tasks=await window.dawn!.invoke('listTasks',{});if(!tasks.ok)throw new Error(tasks.error?.message);const sessionId=(tasks.data as ResponseOf<'listTasks'>)[0]?.sessionId;if(!sessionId)throw new Error('fixture session missing');const result=await window.dawn!.invoke('listArtifacts',{sessionId});if(!result.ok)throw new Error(result.error?.message);return result.data as ResponseOf<'listArtifacts'>})
  33  |  const acceptedFiles=artifactResponse.taskArtifacts!.filter((file)=>file.acceptance==='accepted')
  34  |  expect(new Set(acceptedFiles.map((file)=>file.path)).size).toBe(2)
  35  |  await expect(card).toContainText('任务验收 2 · 主会话登记 0')
  36  |  await page.locator('[data-dock-tab="artifacts"]').click()
  37  |  const artifactPath=acceptedFiles[0]!.path,original=readFileSync(join(workspace,artifactPath))
  38  |  await page.getByRole('button',{name:artifactPath,exact:true}).click()
  39  |  const versions=page.getByRole('region',{name:'任务验收版本',exact:true})
  40  |  await versions.getByRole('button',{name:/核对当前内容/}).first().click();await expect(versions).toContainText('本次核对与验收内容一致')
  41  |  await page.screenshot({path:join(out,'stage-b-unified-artifact.png')})
  42  |  writeFileSync(join(workspace,artifactPath),Buffer.concat([original,Buffer.from('changed')]))
  43  |  await versions.getByRole('button',{name:/核对当前内容/}).first().click();await expect(versions).toContainText('当前内容与验收版本不同')
  44  |  await page.screenshot({path:join(out,'stage-b-version-changed.png')})
  45  |  writeFileSync(join(workspace,artifactPath),original)
  46  |  await 进坞(page,'团队');overview=page.getByRole('region',{name:'运行总览',exact:true})
  47  |  await overview.getByRole('button',{name:'展开流程工作台',exact:true}).click()
  48  |  progress=overview.getByRole('region',{name:'批准方案执行进度',exact:true})
  49  |  await progress.getByRole('button',{name:/根据清洗结果建模/}).click()
  50  |  await expect(overview.getByRole('tab',{name:'过程',exact:true})).toHaveAttribute('aria-selected','true')
  51  |  const workflowBox=await overview.getByRole('region',{name:'流程工作台',exact:true}).boundingBox(),detailBox=await overview.locator('.collaboration-detail').boundingBox()
  52  |  expect(detailBox!.x).toBeGreaterThanOrEqual(workflowBox!.x+workflowBox!.width-1)
  53  |  await overview.getByRole('tab',{name:'记录',exact:true}).click()
  54  |  await expect(overview.locator('.collaboration-detail')).toContainText('工具记录')
  55  |  await overview.locator('.collaboration-detail').scrollIntoViewIfNeeded()
  56  |  await page.screenshot({path:join(out,'stage-c-task-records.png')})
  57  |  await overview.locator('.collaboration-detail').screenshot({path:join(out,'stage-c-records-panel.png')})
  58  |  await overview.getByRole('button',{name:'收起检查面板',exact:true}).click()
  59  |  const dependencyGraph=overview.locator('.collaboration-graph-scroll')
  60  |  await dependencyGraph.scrollIntoViewIfNeeded()
  61  |  const graphGeometry=await dependencyGraph.evaluate(el=>{
  62  |   const graph=el.querySelector('.collaboration-graph')!.getBoundingClientRect()
  63  |   return{canvasHeight:graph.height,viewportHeight:el.clientHeight,scrollHeight:el.scrollHeight,nodes:[...el.querySelectorAll('.collaboration-graph-node')].map(node=>({height:node.getBoundingClientRect().height,bottomOverflow:node.getBoundingClientRect().bottom-graph.bottom}))}
  64  |  })
  65  |  writeFileSync(join(out,'dependency-geometry.json'),JSON.stringify(graphGeometry,null,2))
  66  |  await dependencyGraph.screenshot({path:join(out,'dependency-complete.png')})
  67  |  expect(Math.max(...graphGeometry.nodes.map(node=>node.bottomOverflow))).toBeLessThanOrEqual(1)
  68  |  expect(graphGeometry.scrollHeight).toBeLessThanOrEqual(graphGeometry.viewportHeight+1)
  69  |  // The node footer must remain visible and clickable after scrolling in a short, narrow window.
  70  |  await dawn.app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0]!.setContentSize(900,640))
  71  |  await dependencyGraph.scrollIntoViewIfNeeded()
  72  |  for(const node of await dependencyGraph.locator('.collaboration-graph-node').all()){
  73  |   await node.scrollIntoViewIfNeeded()
  74  |   const intersection=await node.evaluate(el=>new Promise(resolve=>{
  75  |    const observer=new IntersectionObserver(([entry])=>{
  76  |     const parents=[];for(let n:Element|null=el;n;n=n.parentElement){const b=n.getBoundingClientRect(),s=getComputedStyle(n);parents.push({class:n.className,rect:b.toJSON(),clientWidth:n.clientWidth,scrollWidth:n.scrollWidth,scrollLeft:n.scrollLeft,overflow:s.overflow,clip:s.clipPath})}
  77  |     resolve({ratio:entry!.intersectionRatio,bounds:entry!.boundingClientRect.toJSON(),intersection:entry!.intersectionRect.toJSON(),parents});observer.disconnect()
  78  |    });observer.observe(el)
  79  |   }))
  80  |   writeFileSync(join(out,`narrow-${await node.getAttribute('data-task-id')}.json`),JSON.stringify(intersection,null,2))
> 81  |   await expect(node).toBeInViewport({ratio:1,timeout:2000})
      |                      ^ Error: expect(locator).toBeInViewport() failed
  82  |   const footerVisible=await node.locator('small').evaluate(el=>{const b=el.getBoundingClientRect();return document.elementFromPoint(b.x+b.width/2,b.bottom-2)?.closest('.collaboration-graph-node')===el.closest('.collaboration-graph-node')})
  83  |   expect(footerVisible).toBe(true)
  84  |  }
  85  |  await page.screenshot({path:join(out,'dependency-narrow-complete.png')})
  86  |  await dependencyGraph.locator('[data-task-id="plan_2"]').click()
  87  |  await expect(overview.locator('.collaboration-detail:not([hidden]) > header')).toContainText('根据清洗结果建模')
  88  |  await expect(dependencyGraph.locator('[data-task-id="plan_2"]')).toHaveAttribute('aria-pressed','true')
  89  |  await overview.getByRole('button',{name:'收起检查面板',exact:true}).click()
  90  |  await overview.getByRole('region',{name:'流程工作台',exact:true}).scrollIntoViewIfNeeded()
  91  |  await page.screenshot({path:join(out,'stage-c-workflow.png')})
  92  |  await overview.getByRole('button',{name:'返回对话协作台',exact:true}).click()
  93  |  await expect(page.getByRole('dialog',{name:'流程工作台',exact:true})).toHaveCount(0)
  94  |  await expect(overview.getByRole('tab',{name:'记录',exact:true})).toHaveAttribute('aria-selected','true')
  95  |  const reopened=await dawn.重开()
  96  |  await reopened.getByRole('button',{name:/^请为以下具体任务自动安排/}).click();await 进坞(reopened,'团队')
  97  |  overview=reopened.getByRole('region',{name:'运行总览',exact:true})
  98  |  await expect(overview.getByRole('region',{name:'批准方案执行进度',exact:true}).getByText('宿主验收通过',{exact:true})).toHaveCount(3)
  99  |  await reopened.screenshot({path:join(out,'stage-c-restored.png')})
  100 | })
  101 | test.describe('stopping bound work',()=>{
  102 |  test.use({dawnOptions:{gitInit:true,firstChunkDelayMs:1500}})
  103 |  test('stops the approved task, drains its process and never replays it after reopening',async({dawn})=>{
  104 |   const{page,workspace}=dawn;writeFileSync(join(workspace,'input.csv'),'x\n1\n2\n3\n')
  105 |   await 在项目里开会话(page);await 进坞(page,'团队')
  106 |   const auto=page.getByRole('region',{name:'自动安排',exact:true})
  107 |   await auto.getByRole('textbox',{name:'任务目标',exact:true}).fill('清洗、建模并独立审阅 input.csv')
  108 |   await auto.getByRole('button',{name:'生成安排',exact:true}).click()
  109 |   await expect(auto.getByRole('status',{name:'任务块数',exact:true})).toHaveText('3 个任务块')
  110 |   await page.locator('main.main .plan-card').getByRole('button',{name:'照这个做',exact:true}).click()
  111 |   let overview=page.getByRole('region',{name:'运行总览',exact:true})
  112 |   await expect.poll(()=>dawn.requests.filter(r=>JSON.stringify(requestBody(r)?.messages??[]).includes('任务契约（范围已冻结）')).length).toBeGreaterThan(0)
  113 |   await overview.getByRole('button',{name:'停止本方案执行',exact:true}).click()
  114 |   await expect(overview).toContainText('用户已停止执行')
  115 |   await expect(overview.locator('.run-overview-row[data-phase="running"],.run-overview-row[data-phase="stopping"],.run-overview-row[data-phase="queued"]')).toHaveCount(0)
  116 |   await expect(overview.getByRole('region',{name:'协作成果',exact:true})).toHaveAttribute('data-outcome','blocked')
  117 |   await expect(overview.getByRole('region',{name:'协作成果',exact:true})).toContainText('协作需要核对')
  118 |   mkdirSync(out,{recursive:true});await page.screenshot({path:join(out,'stage-b-stopped.png')})
  119 |   const reopened=await dawn.重开()
  120 |   await reopened.getByRole('button',{name:/^请为以下具体任务自动安排/}).click();await 进坞(reopened,'团队')
  121 |   overview=reopened.getByRole('region',{name:'运行总览',exact:true})
  122 |   await expect(overview).toContainText('执行已暂停')
  123 |   await expect(overview.getByRole('region',{name:'协作成果',exact:true})).not.toHaveAttribute('data-outcome','active')
  124 |   const taskRequests=()=>dawn.requests.filter(r=>JSON.stringify(requestBody(r)?.messages??[]).includes('任务契约（范围已冻结）')).length
  125 |   const before=taskRequests(),card=reopened.locator('main.main .plan-card')
  126 |   await card.getByRole('button',{name:'开始或继续未执行任务',exact:true}).click()
  127 |   await expect(card.getByRole('alert')).toContainText('副作用')
  128 |   writeFileSync(join(out,'stop-request-kinds.json'),JSON.stringify(dawn.requests.map(r=>({contractRequest:JSON.stringify(requestBody(r)?.messages??[]).includes('任务契约（范围已冻结）'),maxTokens:requestBody(r)?.max_tokens,messageCount:requestBody(r)?.messages?.length})),null,2))
  129 |   expect(taskRequests()).toBe(before)
  130 |   await overview.getByRole('button',{name:'结束此安排',exact:true}).click()
  131 |   await expect(overview).toContainText('安排已结束，任务记录保留。')
  132 |   await reopened.screenshot({path:join(out,'stage-b-retired.png')})
  133 |   expect(readFileSync(join(workspace,'input.csv'),'utf8')).toBe('x\n1\n2\n3\n')
  134 |  })
  135 | })
  136 | 
```