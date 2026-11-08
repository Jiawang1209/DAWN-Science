# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: collaboration-outcome.spec.ts >> outcome blocked >> shows exact stage and final versions, compact expansion, and readable 900px views
- Location: e2e/collaboration-outcome.spec.ts:15:2

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator:  getByRole('region', { name: '运行总览', exact: true }).getByRole('region', { name: '协作成果', exact: true }).locator('.collaboration-outcome-next button')
Expected: visible
Received: hidden
Timeout:  25000ms

Call log:
  - Expect "toBeVisible" with timeout 25000ms
  - waiting for getByRole('region', { name: '运行总览', exact: true }).getByRole('region', { name: '协作成果', exact: true }).locator('.collaboration-outcome-next button')
    53 × locator resolved to <button type="button" class="btn btn-outline btn-sm">查看提交反馈</button>
       - unexpected value "hidden"

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
  - button "打开协作：3 项任务 · 0 项验收通过":
    - strong: 协作
    - text: 协作需要核对 3 项任务 · 0 项验收通过
  - toolbar "会话工具栏":
    - group "会话操作：科研流水线验收：协作成果分层界面验收，使":
      - button "查找当前对话"
      - button "导出对话"
  - button "合成数据科研流程 已交付 0 / 1 analysis · 需要复核"
  - text: 你
  - paragraph: 科研流水线验收：协作成果分层界面验收，使用合成数据。
  - time: 2026-11-09 06:08
  - button "复制我说的这段"
  - button "修改"
  - button "回到这句之前"
  - button "已完成 用时 0.1 秒 2 步" [expanded]
  - button "✓ 调用了 1 次 update_analysis_route、调用了 1 次 start_science_pipeline"
  - text: 子 agent 1/1
  - button "✗ check · p-check-0-0 失败"
  - paragraph: 存在阻塞、执行/审阅问题或缺少契约要求的证据，未放行下游
  - text: DeepSeek
  - paragraph: 科研流程状态与回执已记录；交付以宿主验收和实际文件为准，合成数据不支持科研推断。
  - note: 本轮产出未知 远端会话或非 git 工作区，探针没跑
  - button "复制这段回答"
  - paragraph: 输入 12 · 输出 8 · 缓存 0 token
  - button "工作目录：/var/folders/2t/y0qcl9r50cv427189l7px1000000gn/T/dawn-e2e-I12P6z/workspace": workspace
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
    - tab "团队" [selected]
    - tab "Bot"
  - button "更多面板": ⋯
  - button "关闭面板"
  - region "运行总览":
    - text: 对话协作台
    - heading "协作" [level=3]
    - button "打开编排视图": 编排视图
    - button "刷新运行记录"
    - region "协作成果":
      - text: 任务目标
      - heading "按已确认方法执行合成数据流程，保留输入并交付文件" [level=3]
      - text: 当前阶段 · 数据核查
      - heading "协作需要核对" [level=4]
      - strong: 当前阻碍
      - paragraph: 存在阻塞、执行/审阅问题或缺少契约要求的证据，未放行下游
      - status: 路线回写待同步；与成果验收分别记录。
      - group: 成果版本与执行额度
      - paragraph: 窄面板显示摘要；展开可查看完整目标和成果版本。
      - button "展开流程工作台"
    - paragraph: 来自当前会话的统一编排；每两秒刷新
    - strong: 3 项任务
    - text: 0 项验收通过 0 项活跃
    - heading "任务板" [level=4]
    - button "数据核查 · 修正 0" [pressed]
    - button "pipeline-check":
      - strong: pipeline-check
      - text: 执行失败 上次上下文 · 历史（估算） 39 tokens 已结算累计 60 tokens 团队成员 累计结算 0.7 秒
    - button "pipeline-analyze":
      - strong: pipeline-analyze
      - text: 尚未执行 当前上下文 未知 已结算累计 尚未结算 团队成员 耗时未知
    - button "pipeline-review":
      - strong: pipeline-review
      - text: 尚未执行 当前上下文 未知 已结算累计 尚未结算 团队成员 耗时未知
    - strong: 数据核查 · 修正 0
    - tablist "任务详情":
      - tab "过程"
      - tab "交接"
      - tab "产物"
      - tab "记录" [selected]
    - tabpanel "记录":
      - group: 第 1 次 执行标识
      - paragraph: 存在阻塞、执行/审阅问题或缺少契约要求的证据，未放行下游
      - region "任务证据与产物":
        - term: 正式提交次数
        - definition: "2"
        - term: 退回次数
        - definition: "1"
        - term: 阶段耗时
        - definition: 129 ms
        - group "工具记录筛选":
          - button "全部工具记录 1" [pressed]
          - button "只看失败工具 0"
        - list:
          - listitem:
            - button "查看原始工具记录：call_mock_4":
              - code: read
              - text: in.csv 已完成
        - paragraph: 宿主记录的工具证据；工具成功不等于科学结论正确。
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
  - group: 团队管理与原始记录
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
  14 |  test.use({dawnOptions:{gitInit:true,sciencePipeline:mode,...(mode==='pass'?{firstChunkDelayMs:1500}:{})}})
  15 |  test('shows exact stage and final versions, compact expansion, and readable 900px views',async({dawn},testInfo)=>{
  16 |   let page=dawn.page;const out=resolve(process.env.DAWN_OUTCOME_EVIDENCE_DIR??testInfo.outputPath('evidence'),mode);mkdirSync(out,{recursive:true});prepare(dawn.workspace)
  17 |   await 在项目里开会话(page);await 进坞(page,'团队')
  18 |   await page.locator('main.main .composer textarea').fill('科研流水线验收：协作成果分层界面验收，使用合成数据。');await page.getByRole('button',{name:'发送',exact:true}).click()
  19 |   let overview=page.getByRole('region',{name:'运行总览',exact:true}),outcome=overview.getByRole('region',{name:'协作成果',exact:true})
  20 |   const capture=async(name:string)=>{await outcome.scrollIntoViewIfNeeded();await page.screenshot({path:join(out,name+'.png')});await outcome.screenshot({path:join(out,name+'-panel.png')});writeFileSync(join(out,name+'.json'),JSON.stringify({name,actualElectron:true,inference:'localhost-fixture',scientificValidation:false,viewport:page.viewportSize(),checkpoint:saved(dawn.workspace),hostOverview:await page.evaluate(async sid=>(await window.dawn!.invoke('getRunOverview',{sessionId:sid})).data,saved(dawn.workspace)!.ownerSessionId)},null,2))}
  21 |   if(mode==='pass'){
  22 |    await expect(outcome.getByRole('heading',{name:'分析阶段已验收，等待独立审阅',exact:true})).toBeVisible()
  23 |    await expect(outcome).toContainText('当前阶段 · 独立审阅');await expect(outcome.locator('.collaboration-outcome-artifact')).toContainText('阶段产物')
  24 |    await outcome.getByRole('button',{name:'查看审阅任务',exact:true}).click();await expect(overview.getByRole('tab',{name:'过程',exact:true})).toHaveAttribute('aria-selected','true');await capture('review-pending-light')
  25 |   }
  26 |   await expect.poll(()=>saved(dawn.workspace)?.team.pipeline.status).toBe(mode==='pass'?'completed':'blocked')
  27 |   await expect(outcome).toHaveAttribute('data-outcome',mode==='pass'?'accepted':'blocked')
  28 |   await page.setViewportSize({width:1440,height:960});await capture('main-light')
  29 |   if(mode==='pass'){
  30 |    const analysis=saved(dawn.workspace)!.team.tasks.find((t:any)=>t.contract?.resultType==='model-metrics'),version=analysis.receipt.versions.outputs[0]
  31 |    await expect(outcome.locator('.collaboration-outcome-artifact')).toContainText('最终成果');await outcome.getByRole('button',{name:'查看验收成果',exact:true}).click()
  32 |    await expect(overview.locator(`[data-task-detail="${analysis.id}"]`)).toBeVisible()
  33 |    await outcome.getByText('成果版本与执行额度',{exact:true}).click();await expect(outcome.locator('.collaboration-outcome-artifact')).toBeVisible();await outcome.locator('.collaboration-outcome-artifact').click();await expect(overview.locator(`[data-task-detail="${analysis.id}"]`)).toBeVisible()
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
> 45 |   await expect(outcome.locator('.collaboration-outcome-next button')).toBeVisible()
     |                                                                       ^ Error: expect(locator).toBeVisible() failed
  46 |   await outcome.getByText('成果版本与执行额度',{exact:true}).click()
  47 |   await expect(outcome.locator('.collaboration-outcome-artifacts')).toBeVisible()
  48 |   await expect(outcome.locator('.collaboration-outcome-budget')).toBeVisible()
  49 |   expect(await outcome.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true)
  50 |   await outcome.getByText('成果版本与执行额度',{exact:true}).click()
  51 |   await expect(outcome.getByText('窄面板显示摘要；展开可查看完整目标和成果版本。',{exact:true})).toBeVisible()
  52 |   await expect(outcome.getByRole('button',{name:'展开流程工作台',exact:true})).toBeInViewport()
  53 |   await outcome.getByRole('button',{name:'展开流程工作台',exact:true}).click()
  54 |   const focused=page.getByRole('dialog',{name:'流程工作台',exact:true});expect((await focused.boundingBox())!.width).toBeGreaterThan(750)
  55 |   await expect(focused.locator('.collaboration-outcome-inspection')).toBeVisible();await focused.locator('.collaboration-outcome-inspection > summary').click()
  56 |   await expect(focused.locator('.collaboration-outcome-artifacts')).toBeVisible();expect((await focused.locator('.collaboration-outcome').boundingBox())!.width).toBeGreaterThan(700)
  57 |   await page.screenshot({path:join(out,'focused-900-light.png')});await page.keyboard.press('Escape')
  58 |   await page.evaluate(()=>localStorage.setItem('dawn.global.theme','dark'));await page.reload();await page.getByRole('button',{name:/^科研流水线验收/}).click();await 进坞(page,'团队')
  59 |   overview=page.getByRole('region',{name:'运行总览',exact:true});outcome=overview.getByRole('region',{name:'协作成果',exact:true});await expect(page.locator('html')).toHaveClass(/dawn-dark/);await capture('main-900-dark')
  60 |   page=await dawn.重开();await page.getByRole('button',{name:/^科研流水线验收/}).click();await 进坞(page,'团队')
  61 |   overview=page.getByRole('region',{name:'运行总览',exact:true});outcome=overview.getByRole('region',{name:'协作成果',exact:true})
  62 |   const restored=await page.evaluate(async sid=>(await window.dawn!.invoke('getRunOverview',{sessionId:sid})).data as {source:string},saved(dawn.workspace)!.ownerSessionId)
  63 |   expect(['live','disk']).toContain(restored.source)
  64 |   await expect(outcome).toHaveAttribute('data-outcome',restored.source==='disk'?'history':mode==='pass'?'accepted':'blocked');await capture(restored.source==='disk'?'history-dark':'restart-live-dark')
  65 |   const stopped=await page.evaluate(async sid=>await window.dawn!.invoke('stopSession',{sessionId:sid}),saved(dawn.workspace)!.ownerSessionId);expect(stopped.ok).toBe(true)
  66 |   await expect.poll(async()=>await page.evaluate(async sid=>((await window.dawn!.invoke('getRunOverview',{sessionId:sid})).data as {source:string}).source,saved(dawn.workspace)!.ownerSessionId)).toBe('disk')
  67 |   const disk=await page.evaluate(async sid=>(await window.dawn!.invoke('getRunOverview',{sessionId:sid})).data as {source:string;runs:Array<{phase:string}>},saved(dawn.workspace)!.ownerSessionId)
  68 |   expect(disk.source).toBe('disk');expect(disk.runs.every(run=>run.phase==='unknown')).toBe(true)
  69 |   await expect(outcome).toHaveAttribute('data-outcome','history');await capture('retired-disk-history-dark')
  70 |  })
  71 | })
  72 | 
```