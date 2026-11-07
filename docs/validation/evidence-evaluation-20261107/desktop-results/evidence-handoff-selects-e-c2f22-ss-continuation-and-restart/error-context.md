# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: evidence-handoff.spec.ts >> selects early context by host ID, shows provenance and preserves it across continuation and restart
- Location: e2e/evidence-handoff.spec.ts:5:1

# Error details

```
Test timeout of 60000ms exceeded.
```

```
Error: expect(locator).toHaveAttribute(expected) failed

Locator:  locator('.tool').filter({ hasText: 'subagent_context_sources' }).first()
Expected: "ok"
Received: "error"

Call log:
  - Expect "toHaveAttribute" with timeout 60000ms
  - waiting for locator('.tool').filter({ hasText: 'subagent_context_sources' }).first()
    115 × locator resolved to <div data-status="error" class="tool error open" data-item-id="call_mock_1" data-tool-name="subagent_context_sources">…</div>
        - unexpected value "error"
  - Target page, context or browser has been closed

```

```yaml
- button "✗ subagent_context_sources 失败" [expanded]
- text: "{}"
- button "复制这段输出"
- text: 当前按用户要求只讨论 / 提供代码，尚未恢复执行，不能调用 subagent_context_sources。请用文字回答，不要换用其他工具绕过；用户明确要求开始或继续执行后，在已授权任务内连续完成，不必逐步询问。
```

# Test source

```ts
  1  | import {mkdirSync,writeFileSync,readdirSync,readFileSync} from 'node:fs'
  2  | import {join,resolve} from 'node:path'
  3  | import {test,expect,在项目里开会话,进坞} from './fixtures.js'
  4  | const output=resolve(process.env.DAWN_EVIDENCE_HANDOFF_DIR??'docs/validation/evidence-evaluation-20261107/desktop')
  5  | test('selects early context by host ID, shows provenance and preserves it across continuation and restart',async({dawn})=>{
  6  |  const {page,workspace}=dawn
  7  |  mkdirSync(join(workspace,'.dawn/agents'),{recursive:true});writeFileSync(join(workspace,'.dawn/agents/scout.md'),'---\nname: scout\ndescription: 只读核查\ntools: read,ls\n---\n只读报告收到的要求。')
  8  |  await 在项目里开会话(page)
  9  |  const composer=page.locator('textarea.composer-field')
  10 |  await composer.fill('早期约束：carbon 单位 mg/g；使用算术均值，只丢弃 NA，不能按降雨筛选。保留原始输入。')
  11 |  await page.getByRole('button',{name:'发送',exact:true}).click()
  12 |  await expect(page.getByRole('button',{name:'停止',exact:true})).toHaveCount(0)
  13 |  for(let i=0;i<2;i++){
  14 |   await composer.fill(`后续讨论 ${i+1}：先解释，不执行。`);await page.getByRole('button',{name:'发送',exact:true}).click()
  15 |   await expect(page.getByRole('button',{name:'停止',exact:true})).toHaveCount(0)
  16 |  }
  17 |  await composer.fill('演示证据交接：把早期约束交给只读 scout。')
  18 |  await page.getByRole('button',{name:'发送',exact:true}).click()
> 19 |  await expect(page.locator('.tool').filter({hasText:'subagent_context_sources'}).first()).toHaveAttribute('data-status','ok',{timeout:60000})
     |                                                                                           ^ Error: expect(locator).toHaveAttribute(expected) failed
  20 |  await expect(page.locator('.tool').filter({hasText:'subagent'}).filter({hasNotText:'subagent_context_sources'}).first()).toHaveAttribute('data-status','ok',{timeout:60000})
  21 |  await 进坞(page,'团队')
  22 |  const overview=page.getByRole('region',{name:'运行总览',exact:true})
  23 |  await expect(overview).toContainText('已冻结交接')
  24 |  await overview.locator('summary').filter({hasText:'已冻结交接'}).click()
  25 |  await expect(overview.locator('pre')).toContainText('早期约束')
  26 |  await expect(overview).toContainText('历史版本尚未重新核验')
  27 |  mkdirSync(output,{recursive:true});await page.screenshot({path:join(output,'early-evidence-handoff.png')})
  28 |  const sessions=join(workspace,'.dawn/sessions'),sid=readdirSync(sessions)[0]!,runs=join(sessions,sid,'subagents'),call=readdirSync(runs)[0]!,dir=join(runs,call,'0')
  29 |  const original=readFileSync(join(dir,'handoff.json'),'utf8'),capsule=JSON.parse(original)
  30 |  expect(capsule.version).toBe(2);expect(capsule.entries[0].text).toContain('早期约束');expect(capsule.entries[0].text).not.toContain('演示证据交接')
  31 |  await overview.getByRole('button',{name:'查看子任务过程',exact:true}).click()
  32 |  const pane=page.locator('.subagent-pane')
  33 |  await pane.getByRole('textbox',{name:'接着问它'}).fill('继续，沿用原背景，不增加权限。');await pane.getByRole('button',{name:'接着问',exact:true}).click()
  34 |  await expect(pane.locator('.subagent-message.user').filter({hasText:'继续，沿用原背景'})).toHaveCount(1)
  35 |  await expect(pane).not.toHaveAttribute('data-asking','1')
  36 |  expect(readFileSync(join(dir,'handoff.json'),'utf8')).toBe(original)
  37 |  const restarted=await dawn.重开()
  38 |  await restarted.getByRole('button',{name:/^早期约束/}).click()
  39 |  await 进坞(restarted,'团队')
  40 |  const restored=restarted.getByRole('region',{name:'运行总览',exact:true})
  41 |  await expect(restored).toContainText('已冻结交接');await restored.locator('summary').filter({hasText:'已冻结交接'}).click()
  42 |  await expect(restored.locator('pre')).toContainText('不能按降雨筛选')
  43 |  expect(readFileSync(join(dir,'handoff.json'),'utf8')).toBe(original)
  44 |  await restarted.screenshot({path:join(output,'recovered-evidence-handoff.png')})
  45 |  writeFileSync(join(output,'handoff-proof.json'),JSON.stringify({capsule,continuedUnchanged:true,restartedUnchanged:true,readOnlyScope:JSON.parse(readFileSync(join(dir,'meta.json'),'utf8')).settings.scope},null,2)+'\n')
  46 | })
  47 | 
```