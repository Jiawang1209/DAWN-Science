# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: task-arrangement-layout.spec.ts >> preserves long task identities and expanded paths in a narrow real Electron view
- Location: e2e/task-arrangement-layout.spec.ts:11:1

# Error details

```
Error: expect(locator).toBeInViewport() failed

Locator:  getByRole('region', { name: '自动安排', exact: true }).locator('[data-arrangement-task="summary"]').getByText('results/validated-summary-0123456789/validated-summary-0123456789/validated-summary-0123456789/validated-summary-0123456789/validated-summary-0123456789/validated-summary-0123456789/validated-summary-0123456789/保留完整单位的统计结果.csv', { exact: true })
Expected: in viewport
Received: viewport ratio 0.9273943305015564
Timeout:  25000ms

Call log:
  - Expect "toBeInViewport" with timeout 25000ms
  - waiting for getByRole('region', { name: '自动安排', exact: true }).locator('[data-arrangement-task="summary"]').getByText('results/validated-summary-0123456789/validated-summary-0123456789/validated-summary-0123456789/validated-summary-0123456789/validated-summary-0123456789/validated-summary-0123456789/validated-summary-0123456789/保留完整单位的统计结果.csv', { exact: true })
    53 × locator resolved to <dd data-authored="1">results/validated-summary-0123456789/validated-su…</dd>
       - unexpected value "viewport ratio 0.9273943305015564"

```

```yaml
- definition: results/validated-summary-0123456789/validated-summary-0123456789/validated-summary-0123456789/validated-summary-0123456789/validated-summary-0123456789/validated-summary-0123456789/validated-summary-0123456789/保留完整单位的统计结果.csv
```

# Test source

```ts
  1  | import {mkdirSync} from 'node:fs'
  2  | import {join,resolve} from 'node:path'
  3  | import {test,expect,在项目里开会话,进坞} from './fixtures.js'
  4  | import {TaskContractSchema} from '../src/protocol/task-contract.js'
  5  | 
  6  | const longInput='inputs/'+Array(7).fill('original-observations-0123456789').join('/')+'/全部原始观测值.csv'
  7  | const longOutput='results/'+Array(7).fill('validated-summary-0123456789').join('/')+'/保留完整单位的统计结果.csv'
  8  | const title='核对全部观测并保留原始字段、样本、单位和缺失值处理说明，生成可复算且可核验的统计摘要'
  9  | const arrangement={dispatch:'team-v1',mode:'single',rationale:'一个输入和一个结果，无独立审阅要求；先只提交方案。',independentReview:false,questions:[],tasks:[{id:'summary',title,goal:'只使用指定输入；先确认方案，不执行文件操作。',role:'负责保留全部原始输入并说明有效样本口径的统计分析执行者',inputs:[longInput],outputs:[longOutput],dependencies:[],acceptance:'用户确认单位与样本口径后，才可进入原有权限和验收流程。',review:false,execution:{agent:'data-engineer',contract:TaskContractSchema.parse({access:'workspace-write',inputs:[longInput],outputs:[longOutput],resultType:'model-metrics',submission:'tool'})}}]}
  10 | test.use({dawnOptions:{gitInit:true,toolCall:[{when:'长路径布局验收',toolName:'propose_plan',args:{title:'长内容方案',plan:'## 问题与假设\n布局验收\n## 数据与切分\n仅指定输入\n## 统计检验与模型\n等待确认\n## 图\n未执行\n## 产物\n等待确认',arrangement},once:true}]}})
  11 | test('preserves long task identities and expanded paths in a narrow real Electron view',async({dawn},testInfo)=>{
  12 |  const{page}=dawn
  13 |  await dawn.app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0]!.setContentSize(900,640))
  14 |  await 在项目里开会话(page);await 进坞(page,'团队')
  15 |  const auto=page.getByRole('region',{name:'自动安排',exact:true})
  16 |  await auto.getByRole('textbox',{name:'任务目标',exact:true}).fill('长路径布局验收：先提出单任务方案，等待我确认，不执行。')
  17 |  await auto.getByRole('button',{name:'生成安排',exact:true}).click()
  18 |  await expect(auto.getByRole('status',{name:'任务块数',exact:true})).toHaveText('1 个任务块')
  19 |  const card=auto.locator('[data-arrangement-task="summary"]')
  20 |  await expect(card).toContainText(title)
  21 |  await card.getByText('文件与验收条件',{exact:true}).click()
  22 |  await expect(card.getByText(longInput,{exact:true})).toBeVisible()
  23 |  await expect(card.getByText(longOutput,{exact:true})).toBeVisible()
  24 |  const geometry=await card.evaluate(el=>({clientWidth:el.clientWidth,scrollWidth:el.scrollWidth,paths:[...el.querySelectorAll('dd')].map(dd=>({clientWidth:dd.clientWidth,scrollWidth:dd.scrollWidth}))}))
  25 |  expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth+1)
  26 |  for(const path of geometry.paths)expect(path.scrollWidth).toBeLessThanOrEqual(path.clientWidth+1)
  27 |  await card.getByText(longOutput,{exact:true}).scrollIntoViewIfNeeded()
> 28 |  await expect(card.getByText(longOutput,{exact:true})).toBeInViewport({ratio:1})
     |                                                        ^ Error: expect(locator).toBeInViewport() failed
  29 |  await expect(page.locator('main.main .chip-group .chip')).toHaveCount(0)
  30 |  const out=resolve(process.env.DAWN_ARRANGEMENT_LAYOUT_EVIDENCE_DIR??testInfo.outputPath('long-arrangement'))
  31 |  mkdirSync(out,{recursive:true});await card.screenshot({path:join(out,'long-path-card.png')})
  32 |  await page.getByRole('button',{name:'展开流程工作台',exact:true}).click()
  33 |  await expect(auto.locator('[data-arrangement-task="summary"]')).toContainText(title)
  34 |  await page.keyboard.press('Escape')
  35 |  await expect(page.getByRole('button',{name:'展开流程工作台',exact:true})).toBeFocused()
  36 |  await expect(auto.locator('[data-arrangement-task="summary"]')).toContainText(longOutput)
  37 | })
  38 | 
```