# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: collaboration-network.spec.ts >> renders a complete dark workflow workbench from eight real child executions, with linked selection and filters
- Location: e2e/collaboration-network.spec.ts:10:1

# Error details

```
Error: expect(locator).toBeInViewport() failed

Locator: getByRole('dialog', { name: '流程工作台', exact: true }).locator('.collaboration-heading').getByRole('button', { name: '返回对话协作台', exact: true })
Expected: in viewport
Timeout: 25000ms
Error: element(s) not found

Call log:
  - Expect "toBeInViewport" with timeout 25000ms
  - waiting for getByRole('dialog', { name: '流程工作台', exact: true }).locator('.collaboration-heading').getByRole('button', { name: '返回对话协作台', exact: true })

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
  - time: 2026-11-08 15:49
  - button "复制我说的这段"
  - button "修改"
  - button "回到这句之前"
  - button "已完成 用时 11 秒 1 步" [expanded]
  - 'button "✓ subagent {\"tasks\":[{\"agent\":\"数据核查与输入完整性验证：包含长中文职责名称的成员\",\"task\":\"锁演示持有任务，等待工具完成。\"},{\"agent\":\"统计分析\",\"task\":\"协作台演示任务1，用一句话确认。\"},{\"agent\":\"方法审阅\",\"task\":\"协作台演示任务2，用一句话确认。\"},{\"agent\":\"图表复核\",\"task\":\"协作台演示任务3，用一句话确认。\"… 11 秒 成功"'
  - text: 子 agent 8/8
  - button "✓ 数据核查与输入完整性验证：包含长中文职责名称的成员 完成"
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
  - button "工作目录：/var/folders/2t/y0qcl9r50cv427189l7px1000000gn/T/dawn-e2e-71Ur11/workspace": workspace
  - text: 本机
  - textbox "检查缺失值并说明处理方法"
  - button "添加内容"
  - button "终端面板"
  - button "完全访问"
  - button "上下文 <1%": <1%
  - button "当前模型：deepseek-flash。点击切换": deepseek-flash
  - button "发送"
  - text: 1 轮 · 工具 1 次 11.9 s · 输入 12 · 输出 8 · 缓存 0 · 命中 0%
- complementary "团队":
  - separator "调整面板宽度"
  - tablist "面板":
    - tab "文件"
    - tab "产物"
    - tab "笔记本"
    - tab "路线"
    - tab "审阅"
    - tab "团队" [selected]
    - tab "Bot"
  - button "更多面板": ⋯
  - button "关闭面板"
- contentinfo "应用状态":
  - button "还没有填任何 API key，暂时不能对话——点这里填一个"
  - button "当前模型：deepseek-flash": deepseek-flash
  - button "R：未配置": R 未配置
  - button "Python：未配置": Python 未配置
  - button "插件 8"
  - button "Skills 9"
  - button "MCP 0"
  - button "子 Agent 30"
  - button "版本 v0.0.44": v0.0.44
- dialog "流程工作台":
  - region "运行总览":
    - text: 对话协作台
    - heading "流程工作台" [level=3]
    - button "刷新运行记录"
    - region "协作成果":
      - heading "本会话协作" [level=3]
      - heading "当前成果尚未核验" [level=4]
      - group: 展开成果版本与检查入口
      - paragraph: 执行轮次未设上限 · 审阅预留未启用 · 在途 0 · 费用未记录
      - button "返回对话协作台" [expanded]
    - paragraph: 来自当前会话的统一编排；每两秒刷新
    - strong: 8 项任务
    - text: 0 项验收通过 0 项活跃 8 项执行完成 可核验 token 160 · 未知用量 8 轮 费用未记录
    - region "流程工作台":
      - heading "Agent 网络" [level=4]
      - text: 宿主与直接委派关系 · 点击节点联动
      - paragraph: 未声明任务依赖；这些执行记录按并列展示
      - text: 当前会话
      - strong: 主助手
      - text: 直接编排 8 项执行
      - button "网络节点：数据核查与输入完整性验证：包含长中文职责名称的成员":
        - strong: 数据核查与输入完整性验证：包含长中文职责名称的成员
        - text: 上下文未知累计 至少 20 tokens 执行完成 累计结算 8.5 秒
      - button "网络节点：统计分析":
        - strong: 统计分析
        - text: 上下文未知累计 20 tokens 执行完成 累计结算 9.0 秒
      - button "网络节点：方法审阅" [pressed]:
        - strong: 方法审阅
        - text: 上下文未知累计 20 tokens 执行完成 累计结算 9.4 秒
      - button "网络节点：图表复核":
        - strong: 图表复核
        - text: 上下文未知累计 20 tokens 执行完成 累计结算 9.9 秒
      - button "网络节点：文献核对":
        - strong: 文献核对
        - text: 上下文未知累计 20 tokens 执行完成 累计结算 1.9 秒
      - button "网络节点：单位检查":
        - strong: 单位检查
        - text: 上下文未知累计 20 tokens 执行完成 累计结算 1.9 秒
      - button "网络节点：报告整理":
        - strong: 报告整理
        - text: 上下文未知累计 20 tokens 执行完成 累计结算 2.0 秒
      - button "网络节点：独立审阅":
        - strong: 独立审阅
        - text: 上下文未知累计 20 tokens 执行完成 累计结算 2.0 秒
      - heading "编队成员" [level=4]
      - text: 8 项任务
      - searchbox "搜索协作成员"
      - group "成员状态筛选":
        - button "显示全部成员" [pressed]
        - button "只看活跃成员"
        - button "只看已结束"
      - button "数据核查与输入完整性验证：包含长中文职责名称的成员":
        - strong: 数据核查与输入完整性验证：包含长中文职责名称的成员
        - text: 数据核查与输入完整性验证：包含长中文职责名称的成员 执行完成 上下文未知累计 至少 20 tokens 累计结算 8.5 秒
      - button "统计分析":
        - strong: 统计分析
        - text: 统计分析 执行完成 上下文未知累计 20 tokens 累计结算 9.0 秒
      - button "方法审阅" [pressed]:
        - strong: 方法审阅
        - text: 方法审阅 执行完成 上下文未知累计 20 tokens 累计结算 9.4 秒
      - button "图表复核":
        - strong: 图表复核
        - text: 图表复核 执行完成 上下文未知累计 20 tokens 累计结算 9.9 秒
      - button "文献核对":
        - strong: 文献核对
        - text: 文献核对 执行完成 上下文未知累计 20 tokens 累计结算 1.9 秒
      - button "单位检查":
        - strong: 单位检查
        - text: 单位检查 执行完成 上下文未知累计 20 tokens 累计结算 1.9 秒
      - button "报告整理":
        - strong: 报告整理
        - text: 报告整理 执行完成 上下文未知累计 20 tokens 累计结算 2.0 秒
      - button "独立审阅":
        - strong: 独立审阅
        - text: 独立审阅 执行完成 上下文未知累计 20 tokens 累计结算 2.0 秒
    - region "自动安排":
      - heading "自动安排" [level=4]
      - paragraph: 描述具体任务，DAWN 会根据目标、数据和依赖决定怎样拆分与分工。无需预先填写任务数量。
      - text: 任务目标
      - textbox "任务目标"
      - text: 调整要求（可选）
      - textbox "调整要求（可选）":
        - /placeholder: 例如：合并前两步，保留独立审阅
      - button "生成安排" [disabled]
      - paragraph: 先出方案期间只读查看；采纳后才进入原有执行与验收流程。
    - group: 查看额度
    - group: 会话完整执行记录
```

# Test source

```ts
  1  | import {mkdirSync,writeFileSync} from 'node:fs'
  2  | import {join,resolve} from 'node:path'
  3  | import {test,expect,在项目里开会话} from './fixtures.js'
  4  | const evidence=resolve(process.env.DAWN_COLLABORATION_EVIDENCE_DIR??'docs/validation/collaboration-workbench-20261107/desktop')
  5  | const names=['数据核查与输入完整性验证：包含长中文职责名称的成员','统计分析','方法审阅','图表复核','文献核对','单位检查','报告整理','独立审阅']
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
  34 |  await expect.poll(async()=>Math.max(...await dialog.locator('[data-member-card]').evaluateAll(els=>els.map(el=>el.getBoundingClientRect().height)))).toBeLessThan(200)
  35 |  await dialog.evaluate(el=>{el.scrollTop=el.scrollHeight})
  36 |  const heading=dialog.locator('.collaboration-heading')
  37 |  await expect.poll(async()=>{const h=await heading.boundingBox(),d=await dialog.boundingBox();return h!.y-d!.y}).toBeLessThanOrEqual(2)
> 38 |  await expect(heading.getByRole('button',{name:'返回对话协作台',exact:true})).toBeInViewport()
     |                                                                        ^ Error: expect(locator).toBeInViewport() failed
  39 |  await page.screenshot({path:join(evidence,'stage-c-sticky-header.png')})
  40 |  await dialog.evaluate(el=>{el.scrollTop=0})
  41 |  await page.screenshot({path:join(evidence,'phase-b-network-dark-completed.png')})
  42 |  await dawn.app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0]!.setContentSize(900,640))
  43 |  await expect(dialog.getByRole('button',{name:'返回对话协作台',exact:true})).toBeVisible()
  44 |  expect(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true)
  45 |  await page.screenshot({path:join(evidence,'phase-b-network-narrow.png')})
  46 |  await page.keyboard.press('Escape');await expect(dialog).not.toBeVisible();await expect(page.getByRole('button',{name:'展开流程工作台',exact:true})).toBeFocused()
  47 |  await page.screenshot({path:join(evidence,'phase-b-conversation-dark.png')})
  48 |  await page.getByRole('button',{name:'展开流程工作台',exact:true}).click()
  49 |  await dialog.getByRole('button',{name:'网络节点：方法审阅',exact:true}).click()
  50 |  await dialog.getByRole('button',{name:'查看子任务过程',exact:true}).click()
  51 |  await expect(dialog).not.toBeVisible()
  52 |  await expect(page.locator('.subagent-pane .subagent-result')).toBeVisible()
  53 |  await page.getByRole('button',{name:'打开协作：8 项任务 · 0 项验收通过',exact:true}).click()
  54 |  await expect(dialog).toBeVisible()
  55 |  await dialog.getByRole('button',{name:'网络节点：方法审阅',exact:true}).click()
  56 |  await expect(dialog.getByRole('tab',{name:'产物',exact:true})).toHaveAttribute('aria-selected','true')
  57 |  await dialog.getByRole('button',{name:'收起检查面板',exact:true}).click()
  58 |  await dialog.getByRole('searchbox',{name:'搜索协作成员'}).evaluate(el=>el.dispatchEvent(new KeyboardEvent('keydown',{key:'k',metaKey:true,isComposing:true,bubbles:true})))
  59 |  await expect(dialog).toBeVisible()
  60 |  await expect(page.getByRole('dialog',{name:'命令面板',exact:true})).toHaveCount(0)
  61 |  await page.keyboard.press('Meta+k')
  62 |  await expect(dialog).not.toBeVisible()
  63 |  await expect(page.getByRole('combobox',{name:'搜索命令',exact:true})).toBeFocused()
  64 |  await page.keyboard.press('Escape')
  65 |  await page.getByRole('button',{name:'展开流程工作台',exact:true}).click()
  66 |  await page.keyboard.press('Meta+p')
  67 |  await expect(dialog).not.toBeVisible()
  68 |  await expect(page.getByRole('tab',{name:'文件',exact:true})).toHaveAttribute('aria-selected','true')
  69 |  await page.getByRole('button',{name:'打开协作：8 项任务 · 0 项验收通过',exact:true}).click()
  70 |  // Navigation away from the expanded workbench must not reopen it behind an ordinary dock view.
  71 |  await expect(page.getByRole('region',{name:'运行总览',exact:true})).toBeVisible()
  72 |  await expect(dialog).not.toBeVisible()
  73 | 
  74 | })
  75 | 
```