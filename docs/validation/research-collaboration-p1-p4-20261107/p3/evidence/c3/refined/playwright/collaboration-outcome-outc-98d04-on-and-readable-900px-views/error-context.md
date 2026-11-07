# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: collaboration-outcome.spec.ts >> outcome pass >> shows exact stage and final versions, compact expansion, and readable 900px views
- Location: e2e/collaboration-outcome.spec.ts:15:2

# Error details

```
Test timeout of 60000ms exceeded.
```

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('region', { name: '运行总览', exact: true }).locator('[data-task-detail="p-analyze-0-1"]')
Expected: visible
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 25000ms
  - waiting for getByRole('region', { name: '运行总览', exact: true }).locator('[data-task-detail="p-analyze-0-1"]')
  - Target page, context or browser has been closed

```

```yaml
- button "DAWN Science"
- button "收起侧边栏" [expanded]
- button "快捷键速查"
- tablist "同一处的会话":
  - tab "科研流水线验收：协作成果分层界面验收，使" [selected]
  - button "关掉「科研流水线验收：协作成果分层界面验收，使」（收进归档）"
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
          - button "科研流水线验收：协作成果分层界面验收，使 刚刚"
          - button "会话操作：科研流水线验收：协作成果分层界面验收，使": ⋯
  - region "服务器":
    - button "服务器" [expanded]
    - button "添加服务器"
    - paragraph: 还没有服务器
  - button "定时"
  - button "设置"
- separator "调整侧栏宽度"
- main:
  - button "打开协作：3 项任务 · 3 项验收通过":
    - strong: 协作
    - text: 本轮成果已验收 3 项任务 · 3 项验收通过
  - toolbar "会话工具栏":
    - group "会话操作：科研流水线验收：协作成果分层界面验收，使":
      - button "查找当前对话"
      - button "导出对话"
  - button "合成数据科研流程 已交付 1 / 1"
  - text: 你
  - paragraph: 科研流水线验收：协作成果分层界面验收，使用合成数据。
  - time: 2026-11-07 23:24
  - button "复制我说的这段"
  - button "修改"
  - button "回到这句之前"
  - button "已完成 用时 0.1 秒 2 步" [expanded]
  - button "✓ 调用了 1 次 update_analysis_route、调用了 1 次 start_science_pipeline"
  - text: 子 agent 3/3
  - button "✓ check · p-check-0-0 完成"
  - button "✓ analyze · p-analyze-0-1 完成"
  - button "✓ review · p-review-0-2 完成"
  - text: DeepSeek
  - paragraph: 科研流程状态与回执已记录；交付以宿主验收和实际文件为准，合成数据不支持科研推断。
  - note: 本轮产出未知 远端会话或非 git 工作区，探针没跑
  - button "复制这段回答"
  - paragraph: 输入 12 · 输出 8 · 缓存 0 token
  - button "工作目录：/var/folders/2t/y0qcl9r50cv427189l7px1000000gn/T/dawn-e2e-Z349do/workspace": workspace
  - text: 本机
  - textbox "输入问题，@ 引用文件，/ 使用指令"
  - button "添加内容"
  - button "终端面板"
  - button "完全访问"
  - button "上下文 <1%": <1%
  - button "当前模型：deepseek-flash。点击切换": deepseek-flash
  - button "发送"
  - text: 1 轮 · 工具 2 次 94 ms · 输入 12 · 输出 8 · 缓存 0 · 命中 0%
- complementary "团队":
  - separator "调整面板宽度"
  - tablist "面板":
    - tab "文件"
    - tab "产物": 产物 1
    - tab "笔记本"
    - tab "路线"
    - tab "审阅"
    - tab "团队" [selected]
  - button "更多面板": ⋯
  - button "关闭面板"
  - region "运行总览":
    - text: 对话协作台
    - heading "协作" [level=3]
    - button "刷新运行记录"
    - region "协作成果":
      - text: 任务目标
      - heading "按已确认方法执行合成数据流程，保留输入并交付文件" [level=3]
      - text: 当前阶段 · 独立审阅
      - heading "本轮成果已验收" [level=4]
      - paragraph: 验收对应宿主回执中的内容版本。
      - text: 下一步 · 查看对应任务的证据与记录
      - button "查看验收成果"
      - heading "验收成果与版本" [level=4]
      - button "results/pipeline.csv 最终成果 SHA256 68ab344ca956… · 32 字节":
        - strong: results/pipeline.csv
        - text: 最终成果 SHA256 68ab344ca956… · 32 字节
      - group: 版本定位详情
      - paragraph: 执行轮次未设上限 · 审阅预留未启用 · 在途 0 · 费用未记录
      - button "展开流程工作台"
    - paragraph: 来自当前会话的统一编排；每两秒刷新
    - strong: 3 项任务
    - text: 3 项验收通过 0 项活跃
    - heading "任务板" [level=4]
    - button "数据核查 · 修正 0"
    - button "分析执行 · 修正 0"
    - button "独立审阅 · 修正 0" [pressed]
    - button "pipeline-check":
      - strong: pipeline-check
      - text: 执行完成 团队成员 累计结算 5.1 秒
    - button "pipeline-analyze":
      - strong: pipeline-analyze
      - text: 执行完成 团队成员 累计结算 3.6 秒
    - button "pipeline-review":
      - strong: pipeline-review
      - text: 执行完成 团队成员 累计结算 3.6 秒
    - strong: 独立审阅 · 修正 0
    - tablist "任务详情":
      - tab "过程"
      - tab "交接"
      - tab "产物" [selected]
      - tab "记录"
    - tabpanel "产物":
      - paragraph: 宿主验收通过
      - paragraph: 声明产物与验收版本分别列出；历史版本不代表当前文件仍有效。
      - region "任务证据与产物":
        - paragraph: 验收指纹属于历史结算；预览读取当前文件，不代表已验收版本仍有效。
    - group: 查看额度
    - group: 会话完整执行记录
  - group: 团队管理与原始记录
- contentinfo "应用状态":
  - button "还没有填任何 API key，暂时不能对话——点这里填一个"
  - button "当前模型：deepseek-flash": deepseek-flash
  - button "R：未配置": R 未配置
  - button "Python：未配置": Python 未配置
  - button "插件 8"
  - button "Skills 9"
  - button "MCP 0"
  - button "子 Agent 25"
  - button "版本 v0.0.44": v0.0.44
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
> 32 |    await expect(overview.locator(`[data-task-detail="${saved(dawn.workspace)!.team.pipeline.currentTaskId}"]`)).toBeVisible()
     |                                                                                                                                                                                                  ^ Error: expect(locator).toBeVisible() failed
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
  45 |   await page.evaluate(()=>localStorage.setItem('dawn.global.theme','dark'));await page.reload();await 进坞(page,'团队')
  46 |   overview=page.getByRole('region',{name:'运行总览',exact:true});outcome=overview.getByRole('region',{name:'协作成果',exact:true});await expect(page.locator('html')).toHaveClass(/dawn-dark/);await capture('main-900-dark')
  47 |   page=await dawn.重开();await page.getByRole('button',{name:/^科研流水线验收/}).click();await 进坞(page,'团队')
  48 |   overview=page.getByRole('region',{name:'运行总览',exact:true});outcome=overview.getByRole('region',{name:'协作成果',exact:true})
  49 |   await expect(outcome).toHaveAttribute('data-outcome','history');await capture('history-dark')
  50 |  })
  51 | })
  52 | 
```