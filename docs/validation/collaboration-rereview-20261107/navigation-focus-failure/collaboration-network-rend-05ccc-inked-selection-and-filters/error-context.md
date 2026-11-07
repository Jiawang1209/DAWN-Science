# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: collaboration-network.spec.ts >> renders a complete dark workflow workbench from eight real child executions, with linked selection and filters
- Location: e2e/collaboration-network.spec.ts:10:1

# Error details

```
Error: expect(locator).not.toBeVisible() failed

Locator:  getByRole('dialog', { name: '流程工作台', exact: true })
Expected: not visible
Received: visible
Timeout:  25000ms

Call log:
  - Expect "not toBeVisible" with timeout 25000ms
  - waiting for getByRole('dialog', { name: '流程工作台', exact: true })
    53 × locator resolved to <dialog open="" aria-label="流程工作台" class="collaboration-expanded">…</dialog>
       - unexpected value "visible"

```

```yaml
- dialog "流程工作台":
  - region "运行总览"
```

# Test source

```ts
  1  | import {mkdirSync,writeFileSync} from 'node:fs'
  2  | import {join,resolve} from 'node:path'
  3  | import {test,expect,在项目里开会话} from './fixtures.js'
  4  | const evidence=resolve(process.env.DAWN_COLLABORATION_EVIDENCE_DIR??'docs/validation/collaboration-workbench-20261107/desktop')
  5  | const names=['数据核查','统计分析','方法审阅','图表复核','文献核对','单位检查','报告整理','独立审阅']
  6  | test.use({dawnOptions:{gitInit:true,toolCall:[
  7  |  {when:'展示八项真实委派',toolName:'subagent',args:{tasks:names.map((agent,i)=>({agent,task:i===0?'锁演示持有任务，等待工具完成。':`协作台演示任务${i}，用一句话确认。`}))},once:true},
  8  |  {when:'锁演示持有任务',toolName:'bash',args:{command:'sleep 8'},once:true},
  9  | ]}})
  10 | test('renders a complete dark workflow workbench from eight real child executions, with linked selection and filters',async({dawn})=>{
  11 |  const{page,workspace}=dawn
  12 |  await dawn.app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0]!.setContentSize(1600,960))
  13 |  mkdirSync(evidence,{recursive:true});mkdirSync(join(workspace,'.dawn/agents'),{recursive:true})
  14 |  for(const name of names)writeFileSync(join(workspace,'.dawn/agents',name+'.md'),`---\nname: ${name}\ndescription: 协作台演示\ntools: read,bash\n---\n按要求执行。`)
  15 |  await page.evaluate(()=>localStorage.setItem('dawn.global.theme','dark'));await page.reload();await expect(page.locator('html')).toHaveClass(/dawn-dark/)
  16 |  await 在项目里开会话(page)
  17 |  await page.locator('main.main .composer textarea').fill('展示八项真实委派');await page.getByRole('button',{name:'发送',exact:true}).click()
  18 |  await page.getByRole('button',{name:'打开协作：8 项任务 · 0 项验收通过',exact:true}).click()
  19 |  let overview=page.getByRole('region',{name:'运行总览',exact:true})
  20 |  await overview.getByRole('button',{name:'展开流程工作台',exact:true}).click()
  21 |  const dialog=page.getByRole('dialog',{name:'流程工作台',exact:true});overview=dialog.getByRole('region',{name:'运行总览',exact:true})
  22 |  await expect(dialog.locator('[data-member-card]')).toHaveCount(8);await expect(dialog.locator('[data-lineage-edge]')).toHaveCount(8)
  23 |  await expect(dialog).toContainText('等待产物锁')
  24 |  await page.screenshot({path:join(evidence,'phase-b-network-dark-running.png')})
  25 |  await expect(dialog.locator('[data-member-card]').filter({hasText:'执行完成'})).toHaveCount(8)
  26 |  await dialog.getByRole('button',{name:'网络节点：方法审阅',exact:true}).click()
  27 |  await expect(dialog.locator('.collaboration-detail')).toBeVisible()
  28 |  await expect(dialog.getByRole('button',{name:'方法审阅',exact:true})).toHaveAttribute('aria-pressed','true')
  29 |  await dialog.getByRole('tab',{name:'产物',exact:true}).click();await expect(dialog.locator('.collaboration-detail')).toContainText('暂无宿主验收回执')
  30 |  await dialog.getByRole('button',{name:'收起检查面板',exact:true}).click()
  31 |  await dialog.getByRole('searchbox',{name:'搜索协作成员'}).fill('审阅');await expect(dialog.locator('[data-member-card]')).toHaveCount(2)
  32 |  await dialog.getByRole('searchbox',{name:'搜索协作成员'}).fill('');await dialog.getByRole('button',{name:'只看活跃成员'}).click();await expect(dialog.locator('[data-member-card]')).toHaveCount(0)
  33 |  await dialog.getByRole('button',{name:'显示全部成员'}).click();await expect(dialog.locator('[data-member-card]')).toHaveCount(8)
  34 |  await page.screenshot({path:join(evidence,'phase-b-network-dark-completed.png')})
  35 |  await dawn.app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0]!.setContentSize(900,640))
  36 |  await expect(dialog.getByRole('button',{name:'返回对话协作台',exact:true})).toBeVisible()
  37 |  expect(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true)
  38 |  await page.screenshot({path:join(evidence,'phase-b-network-narrow.png')})
  39 |  await page.keyboard.press('Escape');await expect(dialog).not.toBeVisible();await expect(page.getByRole('button',{name:'展开流程工作台',exact:true})).toBeFocused()
  40 |  await page.screenshot({path:join(evidence,'phase-b-conversation-dark.png')})
  41 |  await page.getByRole('button',{name:'展开流程工作台',exact:true}).click()
  42 |  await dialog.getByRole('button',{name:'网络节点：方法审阅',exact:true}).click()
  43 |  await dialog.getByRole('button',{name:'查看子任务过程',exact:true}).click()
  44 |  await expect(dialog).not.toBeVisible()
  45 |  await expect(page.locator('.subagent-pane .subagent-result')).toBeVisible()
  46 |  await page.getByRole('button',{name:'打开协作：8 项任务 · 0 项验收通过',exact:true}).click()
  47 |  await expect(dialog).toBeVisible()
  48 |  await dialog.getByRole('button',{name:'网络节点：方法审阅',exact:true}).click()
  49 |  await expect(dialog.getByRole('tab',{name:'产物',exact:true})).toHaveAttribute('aria-selected','true')
  50 |  await dialog.getByRole('button',{name:'收起检查面板',exact:true}).click()
  51 |  await dialog.getByRole('searchbox',{name:'搜索协作成员'}).evaluate(el=>el.dispatchEvent(new KeyboardEvent('keydown',{key:'k',metaKey:true,isComposing:true,bubbles:true})))
  52 |  await expect(dialog).toBeVisible()
  53 |  await expect(page.getByRole('dialog',{name:'命令面板',exact:true})).toHaveCount(0)
  54 |  await page.keyboard.press('Meta+k')
> 55 |  await expect(dialog).not.toBeVisible()
     |                           ^ Error: expect(locator).not.toBeVisible() failed
  56 |  await expect(page.getByRole('combobox',{name:'搜索命令',exact:true})).toBeFocused()
  57 |  await page.keyboard.press('Escape')
  58 |  await page.getByRole('button',{name:'展开流程工作台',exact:true}).click()
  59 |  await page.keyboard.press('Meta+p')
  60 |  await expect(dialog).not.toBeVisible()
  61 |  await expect(page.getByRole('tab',{name:'文件',exact:true})).toHaveAttribute('aria-selected','true')
  62 |  await page.getByRole('button',{name:'打开协作：8 项任务 · 0 项验收通过',exact:true}).click()
  63 |  // Navigation away from the expanded workbench must not reopen it behind an ordinary dock view.
  64 |  await expect(page.getByRole('region',{name:'运行总览',exact:true})).toBeVisible()
  65 |  await expect(dialog).not.toBeVisible()
  66 | 
  67 | })
  68 | 
```