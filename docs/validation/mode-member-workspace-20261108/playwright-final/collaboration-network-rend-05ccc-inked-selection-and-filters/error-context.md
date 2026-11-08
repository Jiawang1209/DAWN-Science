# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: collaboration-network.spec.ts >> renders a complete dark workflow workbench from eight real child executions, with linked selection and filters
- Location: e2e/collaboration-network.spec.ts:10:1

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('dialog', { name: '流程工作台', exact: true })
Expected: visible
Timeout: 25000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 25000ms
  - waiting for getByRole('dialog', { name: '流程工作台', exact: true })

```

```yaml
- button "DAWN Science"
- button "收起侧边栏" [expanded]
- button "快捷键速查"
- tablist "同一处的会话":
  - tab "展示八项真实委派" [selected]
  - button "关掉「展示八项真实委派」（收进归档）"
  - button "在这里再开一段"
- banner
- button "面板：团队" [expanded]
- complementary:
  - button "新建任务"
  - separator
  - text: 工作区
  - button "搜索"
  - button "添加工作区文件夹"
  - paragraph:
    - button "项目 1" [expanded]
    - button "多选项目": 多选
  - list:
    - listitem:
      - button "workspace"
      - button "在「workspace」里开一段新对话"
      - button "项目操作：workspace": ⋯
      - list:
        - listitem:
          - button "展示八项真实委派 刚刚"
          - button "会话操作：展示八项真实委派": ⋯
  - region "服务器":
    - button "服务器" [expanded]
    - button "添加服务器"
    - paragraph: 还没有服务器
  - button "定时"
  - button "设置"
- separator "调整侧栏宽度"
- main:
  - button "打开协作：8 项任务 · 0 项验收通过":
    - strong: 协作
    - text: 当前成果尚未核验 8 项任务 · 0 项验收通过
  - toolbar "会话工具栏":
    - group "会话操作：展示八项真实委派":
      - button "查找当前对话"
      - button "导出对话"
  - text: 你
  - paragraph: 展示八项真实委派
  - time: 2026-11-08 08:15
  - button "复制我说的这段"
  - button "修改"
  - button "回到这句之前"
  - button "已完成 用时 12 秒 1 步" [expanded]
  - 'button "✓ subagent {\"tasks\":[{\"agent\":\"数据核查\",\"task\":\"锁演示持有任务，等待工具完成。\"},{\"agent\":\"统计分析\",\"task\":\"协作台演示任务1，用一句话确认。\"},{\"agent\":\"方法审阅\",\"task\":\"协作台演示任务2，用一句话确认。\"},{\"agent\":\"图表复核\",\"task\":\"协作台演示任务3，用一句话确认。\"},{\"agent\":\"文献核对\",\"ta… 12 秒 成功"'
  - text: 子 agent 8/8
  - button "✓ 数据核查 完成"
  - button "✓ 统计分析 完成"
  - button "✓ 方法审阅 完成"
  - button "✓ 图表复核 完成"
  - button "✓ 文献核对 完成"
  - button "✓ 单位检查 完成"
  - button "✓ 报告整理 完成"
  - button "✓ 独立审阅 完成"
  - text: DeepSeek
  - paragraph: 假模型已应答：DAWN 的整条链路是通的。
  - button "复制这段回答"
  - paragraph: 输入 12 · 输出 8 · 缓存 0 token
  - button "工作目录：/var/folders/2t/y0qcl9r50cv427189l7px1000000gn/T/dawn-e2e-j3hvAP/workspace": workspace
  - text: 本机
  - textbox "检查缺失值并说明处理方法"
  - button "添加内容"
  - button "终端面板"
  - button "完全访问"
  - button "上下文 <1%": <1%
  - button "当前模型：deepseek-flash。点击切换": deepseek-flash
  - button "发送"
  - text: 1 轮 · 工具 1 次 12.2 s · 输入 12 · 输出 8 · 缓存 0 · 命中 0%
- complementary "团队":
  - separator "调整面板宽度"
  - tablist "面板":
    - tab "团队" [selected]
    - tab "Bot"
  - button "更多面板": ⋯
  - button "关闭面板"
  - region "运行总览":
    - text: 对话协作台
    - heading "协作" [level=3]
    - button "刷新运行记录"
    - region "协作成果":
      - text: 任务目标
      - heading "本会话协作" [level=3]
      - heading "当前成果尚未核验" [level=4]
      - paragraph: 窄面板显示摘要；展开可查看完整目标和成果版本。
      - button "展开流程工作台"
    - paragraph: 来自当前会话的统一编排；每两秒刷新
    - strong: 8 项任务
    - text: 0 项验收通过 0 项活跃
    - button "数据核查":
      - strong: 数据核查
      - text: 执行完成 上次上下文 · 历史（估算） 20 tokens 已结算累计 至少 20 tokens 子任务 累计结算 8.6 秒
    - button "统计分析":
      - strong: 统计分析
      - text: 执行完成 上次上下文 · 历史（估算） 20 tokens 已结算累计 20 tokens 子任务 累计结算 9.1 秒
    - button "方法审阅" [pressed]:
      - strong: 方法审阅
      - text: 执行完成 上次上下文 · 历史（估算） 20 tokens 已结算累计 20 tokens 子任务 累计结算 9.6 秒
    - button "图表复核":
      - strong: 图表复核
      - text: 执行完成 上次上下文 · 历史（估算） 20 tokens 已结算累计 20 tokens 子任务 累计结算 10.0 秒
    - button "文献核对":
      - strong: 文献核对
      - text: 执行完成 上次上下文 · 历史（估算） 20 tokens 已结算累计 20 tokens 子任务 累计结算 2.0 秒
    - button "单位检查":
      - strong: 单位检查
      - text: 执行完成 上次上下文 · 历史（估算） 20 tokens 已结算累计 20 tokens 子任务 累计结算 2.0 秒
    - button "报告整理":
      - strong: 报告整理
      - text: 执行完成 上次上下文 · 历史（估算） 20 tokens 已结算累计 20 tokens 子任务 累计结算 2.0 秒
    - button "独立审阅":
      - strong: 独立审阅
      - text: 执行完成 上次上下文 · 历史（估算） 20 tokens 已结算累计 20 tokens 子任务 累计结算 2.1 秒
    - strong: 方法审阅
    - text: 类型 subagent · 执行代次 1
    - tablist "任务详情":
      - tab "过程"
      - tab "交接"
      - tab "产物" [selected]
      - tab "记录"
    - tabpanel "产物":
      - paragraph: 暂无宿主验收回执
      - paragraph: 输入版本 0 · 产物版本 0
      - paragraph: 版本数量来自宿主回执；不代表文件当前内容已重新核验。
      - region "任务证据与产物":
        - paragraph: 验收指纹属于历史结算；预览读取当前文件，不代表已验收版本仍有效。
    - region "成员会话与操作":
      - strong: 成员会话与操作
      - text: 方法审阅
      - paragraph: 续问、纠偏和停止由成员过程面板按宿主能力提供。
      - button "查看子任务过程"
    - group: 如何安排任务
    - group: 查看额度
    - group: 会话完整执行记录
- contentinfo "应用状态":
  - button "还没有填任何 API key，暂时不能对话——点这里填一个"
  - button "当前模型：deepseek-flash": deepseek-flash
  - button "R：未配置": R 未配置
  - button "Python：未配置": Python 未配置
  - button "扩展数量": 扩展
  - button "版本 v0.0.44": v0.0.44
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
> 47 |  await expect(dialog).toBeVisible()
     |                       ^ Error: expect(locator).toBeVisible() failed
  48 |  await dialog.getByRole('button',{name:'网络节点：方法审阅',exact:true}).click()
  49 |  await expect(dialog.getByRole('tab',{name:'产物',exact:true})).toHaveAttribute('aria-selected','true')
  50 |  await dialog.getByRole('button',{name:'收起检查面板',exact:true}).click()
  51 |  await dialog.getByRole('searchbox',{name:'搜索协作成员'}).evaluate(el=>el.dispatchEvent(new KeyboardEvent('keydown',{key:'k',metaKey:true,isComposing:true,bubbles:true})))
  52 |  await expect(dialog).toBeVisible()
  53 |  await expect(page.getByRole('dialog',{name:'命令面板',exact:true})).toHaveCount(0)
  54 |  await page.keyboard.press('Meta+k')
  55 |  await expect(dialog).not.toBeVisible()
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