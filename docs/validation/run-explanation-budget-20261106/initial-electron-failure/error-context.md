# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: run-explanation-budget.spec.ts >> delegation budget >> sets real limits, rejects a third Pi child, and retains consumption across Electron restart
- Location: e2e/run-explanation-budget.spec.ts:37:2

# Error details

```
Error: expect(locator).toContainText(expected) failed

Locator: getByRole('region', { name: '运行总览', exact: true })
Expected substring: "已准入 1 轮"
Received string:    "运行总览刷新运行记录来自当前会话的统一编排；每两秒刷新会话委派预算已准入 0 轮 · 可核验 token 0 · 未知用量 0 轮 · 在途 0 轮当前限制：轮次 2 · 总历时 不限 分钟 · token 不限仅统计本会话统一编排的子任务、团队和 Bot；总历时包含暂停与离线。token 在结算后核验，在途请求可能超额，未知用量不计为零。调整预算限制累计执行轮次上限总历时上限（分钟）可核验 token 上限留空表示不设该限制；保存只改变限额，已用记录保留，不会自动重跑任务。委派限额生效重新读取预算这段会话暂无子任务运行记录关键执行历史16:37:09 · 预算限制已调整"
Timeout: 25000ms

Call log:
  - Expect "toContainText" with timeout 25000ms
  - waiting for getByRole('region', { name: '运行总览', exact: true })
    53 × locator resolved to <section aria-label="运行总览" class="run-overview panel">…</section>
       - unexpected value "运行总览刷新运行记录来自当前会话的统一编排；每两秒刷新会话委派预算已准入 0 轮 · 可核验 token 0 · 未知用量 0 轮 · 在途 0 轮当前限制：轮次 2 · 总历时 不限 分钟 · token 不限仅统计本会话统一编排的子任务、团队和 Bot；总历时包含暂停与离线。token 在结算后核验，在途请求可能超额，未知用量不计为零。调整预算限制累计执行轮次上限总历时上限（分钟）可核验 token 上限留空表示不设该限制；保存只改变限额，已用记录保留，不会自动重跑任务。委派限额生效重新读取预算这段会话暂无子任务运行记录关键执行历史16:37:09 · 预算限制已调整"

```

```yaml
- region "运行总览":
  - heading "运行总览" [level=3]
  - button "刷新运行记录"
  - paragraph: 来自当前会话的统一编排；每两秒刷新
  - region "会话委派预算":
    - strong: 会话委派预算
    - paragraph: 已准入 0 轮 · 可核验 token 0 · 未知用量 0 轮 · 在途 0 轮
    - paragraph: 当前限制：轮次 2 · 总历时 不限 分钟 · token 不限
    - paragraph: 仅统计本会话统一编排的子任务、团队和 Bot；总历时包含暂停与离线。token 在结算后核验，在途请求可能超额，未知用量不计为零。
    - group: 调整预算限制
  - paragraph: 这段会话暂无子任务运行记录
  - group: 关键执行历史
```

# Test source

```ts
  1  | import {mkdirSync,writeFileSync,readFileSync,readdirSync} from 'node:fs'
  2  | import {join,resolve} from 'node:path'
  3  | import {test,expect,在项目里开会话,进坞} from './fixtures.js'
  4  | const evidence=resolve(process.env.DAWN_RUN_BUDGET_EVIDENCE_DIR??'docs/validation/run-explanation-budget-20261106')
  5  | test.describe('run explanation',()=>{
  6  |  test.use({dawnOptions:{gitInit:true,toolCall:[
  7  |   {when:'演示产物锁等待',toolName:'subagent',args:{tasks:[{agent:'lockwriter',task:'锁演示持有任务，等待工具完成。'},{agent:'lockwriter',task:'锁演示等待任务，用一句话确认完成。'}]},once:true},
  8  |   {when:'锁演示持有任务',toolName:'bash',args:{command:'sleep 8'},once:true},
  9  |  ]}})
  10 |  test('explains actual shared lock waiting and retained host history',async({dawn})=>{
  11 |   const{page,workspace}=dawn
  12 |   mkdirSync(join(workspace,'.dawn/agents'),{recursive:true})
  13 |   writeFileSync(join(workspace,'.dawn/agents/lockwriter.md'),'---\nname: lockwriter\ndescription: 锁等待演示\ntools: read,bash\n---\n使用指定工具，用一句话回答。')
  14 |   await 在项目里开会话(page)
  15 |   await page.getByPlaceholder(/输入问题/).fill('演示产物锁等待')
  16 |   await page.getByRole('button',{name:'发送',exact:true}).click()
  17 |   await 进坞(page,'团队')
  18 |   const overview=page.getByRole('region',{name:'运行总览',exact:true})
  19 |   await expect(overview.locator('.run-activity').filter({hasText:'等待产物锁'})).toHaveCount(1)
  20 |   await expect(overview.locator('.run-activity').filter({hasText:'等待产物锁'})).toContainText('lockwriter · 代次 1')
  21 |   await expect(overview).toContainText('等待工作区独占执行')
  22 |   await overview.locator('.run-activity').filter({hasText:'等待产物锁'}).scrollIntoViewIfNeeded()
  23 |   mkdirSync(evidence,{recursive:true});await page.screenshot({path:join(evidence,'phase-a-lock-wait.png')})
  24 |   await expect(overview.locator('.run-overview-row').filter({hasText:'执行完成'})).toHaveCount(2)
  25 |   await overview.getByText('关键执行历史',{exact:true}).click()
  26 |   await expect(overview.locator('.run-history')).toContainText('等待产物锁')
  27 |   await expect(overview.locator('.run-history')).toContainText('执行已结算')
  28 |   await page.screenshot({path:join(evidence,'phase-a-history.png')})
  29 |   const sessions=join(workspace,'.dawn/sessions'),sid=readdirSync(sessions)[0]!
  30 |   const state=JSON.parse(readFileSync(join(sessions,sid,'orchestration/state.json'),'utf8'))
  31 |   expect(state.events.some((event:{stage?:string})=>event.stage==='lock-wait')).toBe(true)
  32 |   writeFileSync(join(evidence,'phase-a-state.json'),JSON.stringify(state,null,2))
  33 |  })
  34 | })
  35 | test.describe('delegation budget',()=>{
  36 |  test.use({dawnOptions:{gitInit:true}})
  37 |  test('sets real limits, rejects a third Pi child, and retains consumption across Electron restart',async({dawn})=>{
  38 |   let page=dawn.page;const{workspace}=dawn
  39 |   mkdirSync(join(workspace,'.dawn/agents'),{recursive:true});writeFileSync(join(workspace,'.dawn/agents/scout.md'),'---\nname: scout\ndescription: 预算演示\ntools: read,ls\n---\n只读确认，一句话回复。')
  40 |   await 在项目里开会话(page);await 进坞(page,'团队')
  41 |   let overview=page.getByRole('region',{name:'运行总览',exact:true})
  42 |   await overview.getByText('调整预算限制',{exact:true}).click()
  43 |   await overview.getByLabel('累计执行轮次上限',{exact:true}).fill('2')
  44 |   await overview.getByRole('button',{name:'委派限额生效',exact:true}).click()
  45 |   await expect(overview).toContainText('当前限制：轮次 2')
  46 |   const send=async()=>{await page.getByPlaceholder(/输入问题/).fill('演示委派预算');await page.getByRole('button',{name:'发送',exact:true}).click();await expect(page.locator('main.main').getByRole('button',{name:'停止',exact:true})).toHaveCount(0)}
> 47 |   await send();await expect(overview).toContainText('已准入 1 轮')
     |                                       ^ Error: expect(locator).toContainText(expected) failed
  48 |   await send();await expect(overview).toContainText('已准入 2 轮')
  49 |   await send();await expect(page.locator('.tool').filter({hasText:'subagent'}).last()).toHaveAttribute('data-status','error')
  50 |   await expect(overview).toContainText('已准入 2 轮')
  51 |   const sessions=join(workspace,'.dawn/sessions'),sid=readdirSync(sessions)[0]!,file=join(sessions,sid,'orchestration/state.json')
  52 |   const before=JSON.parse(readFileSync(file,'utf8'));expect(before.budget.consumedRuns).toBe(2);expect(before.children.reduce((n:number,c:{epoch:number})=>n+c.epoch,0)).toBe(2)
  53 |   mkdirSync(evidence,{recursive:true});await page.screenshot({path:join(evidence,'phase-b-limit.png')})
  54 |   page=await dawn.重开();await page.getByRole('button',{name:/^演示委派预算/}).click();await 进坞(page,'团队')
  55 |   overview=page.getByRole('region',{name:'运行总览',exact:true});await expect(overview).toContainText('已准入 2 轮')
  56 |   const after=JSON.parse(readFileSync(file,'utf8'));expect(after.budget.consumedRuns).toBe(2)
  57 |   expect(after.children.filter((c:{state:string})=>c.state==='completed').map((c:{result:unknown})=>c.result)).toEqual(before.children.filter((c:{state:string})=>c.state==='completed').map((c:{result:unknown})=>c.result))
  58 |   await page.screenshot({path:join(evidence,'phase-b-recovery.png')});writeFileSync(join(evidence,'phase-b-budget.json'),JSON.stringify({before:before.budget,after:after.budget,actualElectron:true,actualPiChildren:2,thirdChildRejected:true},null,2))
  59 |  })
  60 | })
  61 |
```