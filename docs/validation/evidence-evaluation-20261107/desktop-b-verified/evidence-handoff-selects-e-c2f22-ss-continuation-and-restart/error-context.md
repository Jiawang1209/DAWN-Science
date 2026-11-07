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

Locator: locator('.tool').filter({ hasText: 'subagent' }).filter({ hasNotText: 'subagent_context_sources' }).first()
Expected: "ok"
Error: element(s) not found

Call log:
  - Expect "toHaveAttribute" with timeout 60000ms
  - waiting for locator('.tool').filter({ hasText: 'subagent' }).filter({ hasNotText: 'subagent_context_sources' }).first()
  - Target page, context or browser has been closed

```

```yaml
- button "DAWN Science"
- button "收起侧边栏" [expanded]
- button "快捷键速查"
- tablist "同一处的会话":
  - tab "早期约束：carbon 单位 mg/g；" [selected]
  - button "关掉「早期约束：carbon 单位 mg/g；」（收进归档）"
  - button "在这里再开一段"
- banner
- button "面板"
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
          - button "早期约束：carbon 单位 mg/g； 刚刚"
          - button "会话操作：早期约束：carbon 单位 mg/g；": ⋯
  - region "服务器":
    - button "服务器" [expanded]
    - button "添加服务器"
    - paragraph: 还没有服务器
  - button "定时"
  - button "设置"
- separator "调整侧栏宽度"
- main:
  - toolbar "会话工具栏":
    - group "会话操作：早期约束：carbon 单位 mg/g；":
      - button "查找当前对话"
      - button "导出对话"
  - button "演示分析路线 已交付 0 / 3"
  - navigation "轮次导航":
    - button "第 1 轮：早期约束：carbon 单位 mg/g；使用算术均值，只丢弃 NA，不能按降雨筛选。保留原始输入"
    - button "第 2 轮：建立会话分析路线，先记录输入和步骤。"
    - button "第 3 轮：后续讨论：先解释，不执行。"
    - button "第 4 轮：开始执行演示证据交接：把早期约束交给只读 scout。"
  - text: 你
  - paragraph: 早期约束：carbon 单位 mg/g；使用算术均值，只丢弃 NA，不能按降雨筛选。保留原始输入。
  - time: 2026-11-07 01:43
  - button "复制我说的这段"
  - button "修改"
  - button "回到这句之前"
  - text: DeepSeek
  - paragraph: 假模型已应答：DAWN 的整条链路是通的。
  - button "复制这段回答"
  - paragraph: 输入 12 · 输出 8 · 缓存 0 token
  - text: 你
  - paragraph: 建立会话分析路线，先记录输入和步骤。
  - time: 2026-11-07 01:43
  - button "复制我说的这段"
  - button "修改"
  - button "回到这句之前"
  - text: DeepSeek
  - paragraph: 读取本会话路线与版本。
  - button "复制这段回答"
  - button "已完成 用时 0 秒 1 步" [expanded]
  - 'button "✓ get_analysis_route {} 成功"'
  - text: DeepSeek
  - paragraph: 建立三个步骤的结构化路线。
  - button "复制这段回答"
  - button "已完成 用时 0 秒 1 步" [expanded]
  - 'button "✓ update_analysis_route {\"expectedRevision\":0,\"route\":{\"title\":\"演示分析路线\",\"goal\":\"通过真实工具演示逐步路线与生成产物；不证明科学分析质量\",\"dataContext\":[\"工程夹具，尚未提供科研输入\"],\"steps\":[{\"id\":\"S1\",\"title\":\"输入与 Alpha 多样性\",\"purpose\":\"核对输入并说明本步分析条件\",\"inputs\":[\"用户… 成功"'
  - text: DeepSeek
  - paragraph:
    - text: 三步路线已记录；真实候选为
    - code: 20251017-e2e-alpha-diversity
    - text: Alpha多样性分析测试案例。请选一步继续；这只验证工程接线。
  - button "复制这段回答"
  - paragraph: 输入 12 · 输出 8 · 缓存 0 token
  - text: 你
  - paragraph: 后续讨论：先解释，不执行。
  - time: 2026-11-07 01:43
  - button "复制我说的这段"
  - button "修改"
  - button "回到这句之前"
  - text: DeepSeek
  - paragraph: 假模型已应答：DAWN 的整条链路是通的。
  - button "复制这段回答"
  - paragraph: 输入 12 · 输出 8 · 缓存 0 token
  - text: 你
  - paragraph: 开始执行演示证据交接：把早期约束交给只读 scout。
  - time: 2026-11-07 01:43
  - button "复制我说的这段"
  - button "修改"
  - button "回到这句之前"
  - button "已完成 用时 0.5 秒 2 步" [expanded]
  - button "✓ 调用了 1 次 subagent_context_sources、调用了 1 次 subagent"
  - text: 子 agent 1/1
  - button "✓ scout 完成"
  - text: DeepSeek
  - paragraph: 假模型已应答：DAWN 的整条链路是通的。
  - button "复制这段回答"
  - paragraph: 输入 12 · 输出 8 · 缓存 0 token
  - button "工作目录：/var/folders/2t/y0qcl9r50cv427189l7px1000000gn/T/dawn-e2e-tvLX73/workspace": workspace
  - text: 本机
  - textbox "检查缺失值并说明处理方法"
  - button "添加内容"
  - button "终端面板"
  - button "完全访问"
  - button "上下文 <1%": <1%
  - button "当前模型：deepseek-flash。点击切换": deepseek-flash
  - button "发送"
  - text: 4 轮 · 工具 4 次 525 ms · 输入 48 · 输出 32 · 缓存 0 · 命中 0%
- contentinfo "应用状态":
  - button "还没有填任何 API key，暂时不能对话——点这里填一个"
  - button "当前模型：deepseek-flash": deepseek-flash
  - button "R：未配置": R 未配置
  - button "Python：未配置": Python 未配置
  - button "插件 8"
  - button "Skills 9"
  - button "MCP 0"
  - button "子 Agent 23"
  - button "版本 v0.0.44": v0.0.44
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
  13 |  for(const message of ['建立会话分析路线，先记录输入和步骤。','后续讨论：先解释，不执行。']){
  14 |   await composer.fill(message);await page.getByRole('button',{name:'发送',exact:true}).click()
  15 |   await expect(page.getByRole('button',{name:'停止',exact:true})).toHaveCount(0)
  16 |  }
  17 |  await composer.fill('开始执行演示证据交接：把早期约束交给只读 scout。')
  18 |  await page.getByRole('button',{name:'发送',exact:true}).click()
  19 |  await expect(page.locator('.tool').filter({hasText:'subagent_context_sources'}).first()).toHaveAttribute('data-status','ok',{timeout:60000})
> 20 |  await expect(page.locator('.tool').filter({hasText:'subagent'}).filter({hasNotText:'subagent_context_sources'}).first()).toHaveAttribute('data-status','ok',{timeout:60000})
     |                                                                                                                           ^ Error: expect(locator).toHaveAttribute(expected) failed
  21 |  await 进坞(page,'团队')
  22 |  const overview=page.getByRole('region',{name:'运行总览',exact:true})
  23 |  await expect(overview).toContainText('已冻结交接')
  24 |  await overview.locator('summary').filter({hasText:'已冻结交接'}).click()
  25 |  await expect(overview.locator('pre')).toContainText('早期约束')
  26 |  await expect(overview).toContainText('历史版本尚未重新核验')
  27 |  await expect(overview).toContainText('步骤 S1')
  28 |  mkdirSync(output,{recursive:true});await page.screenshot({path:join(output,'early-evidence-handoff.png')})
  29 |  const sessions=join(workspace,'.dawn/sessions'),sid=readdirSync(sessions)[0]!,runs=join(sessions,sid,'subagents'),call=readdirSync(runs)[0]!,dir=join(runs,call,'0')
  30 |  const original=readFileSync(join(dir,'handoff.json'),'utf8'),capsule=JSON.parse(original)
  31 |  expect(capsule.version).toBe(2);expect(capsule.entries[0].text).toContain('早期约束');expect(capsule.entries[0].text).not.toContain('演示证据交接')
  32 |  await overview.getByRole('button',{name:'查看子任务过程',exact:true}).click()
  33 |  const pane=page.locator('.subagent-pane')
  34 |  await pane.getByRole('textbox',{name:'接着问它'}).fill('继续，沿用原背景，不增加权限。');await pane.getByRole('button',{name:'接着问',exact:true}).click()
  35 |  await expect(pane.locator('.subagent-message.user').filter({hasText:'继续，沿用原背景'})).toHaveCount(1)
  36 |  await expect(pane).not.toHaveAttribute('data-asking','1')
  37 |  expect(readFileSync(join(dir,'handoff.json'),'utf8')).toBe(original)
  38 |  const restarted=await dawn.重开()
  39 |  await restarted.getByRole('button',{name:/^早期约束/}).click()
  40 |  await 进坞(restarted,'团队')
  41 |  const restored=restarted.getByRole('region',{name:'运行总览',exact:true})
  42 |  await expect(restored).toContainText('已冻结交接');await restored.locator('summary').filter({hasText:'已冻结交接'}).click()
  43 |  await expect(restored.locator('pre')).toContainText('不能按降雨筛选')
  44 |  expect(readFileSync(join(dir,'handoff.json'),'utf8')).toBe(original)
  45 |  await restarted.screenshot({path:join(output,'recovered-evidence-handoff.png')})
  46 |  writeFileSync(join(output,'handoff-proof.json'),JSON.stringify({capsule,continuedUnchanged:true,restartedUnchanged:true,readOnlyScope:JSON.parse(readFileSync(join(dir,'meta.json'),'utf8')).settings.scope},null,2)+'\n')
  47 | })
  48 | 
```