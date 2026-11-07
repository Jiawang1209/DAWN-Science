# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: collaboration-outcome.spec.ts >> outcome blocked >> shows exact stage and final versions, compact expansion, and readable 900px views
- Location: e2e/collaboration-outcome.spec.ts:15:2

# Error details

```
TimeoutError: locator.scrollIntoViewIfNeeded: Timeout 30000ms exceeded.
Call log:
  - waiting for getByRole('region', { name: '运行总览', exact: true }).getByRole('region', { name: '协作成果', exact: true })

```

# Page snapshot

```yaml
- generic [ref=f4e3]:
  - generic [ref=f4e4]:
    - generic [ref=f4e5]:
      - button "DAWN Science" [ref=f4e7] [cursor=pointer]
      - button "收起侧边栏" [expanded] [ref=f4e10] [cursor=pointer]
      - button "快捷键速查" [ref=f4e13] [cursor=pointer]
    - button "面板：团队" [expanded] [ref=f4e18] [cursor=pointer]
  - generic [ref=f4e19]:
    - complementary [ref=f4e20]:
      - button "新建任务" [ref=f4e22] [cursor=pointer]
      - separator [ref=f4e27]
      - generic [ref=f4e28]:
        - generic [ref=f4e29]: 工作区
        - generic [ref=f4e30]:
          - button "搜索" [ref=f4e31] [cursor=pointer]
          - button "添加工作区文件夹" [ref=f4e34] [cursor=pointer]
      - generic [ref=f4e38]:
        - paragraph [ref=f4e39]:
          - button "项目 1" [expanded] [ref=f4e40] [cursor=pointer]:
            - generic [ref=f4e45]: 项目
            - generic [ref=f4e46]: "1"
          - button "多选项目" [ref=f4e47] [cursor=pointer]: 多选
        - list [ref=f4e48]:
          - listitem [ref=f4e49]:
            - generic [ref=f4e50]:
              - button "workspace" [ref=f4e51] [cursor=pointer]
              - generic [ref=f4e60]:
                - button "在「workspace」里开一段新对话" [ref=f4e61] [cursor=pointer]
                - button "项目操作：workspace" [ref=f4e65] [cursor=pointer]: ⋯
            - list [ref=f4e66]:
              - listitem [ref=f4e67]:
                - button "科研流水线验收：协作成果分层界面验收，使 刚刚" [ref=f4e68]:
                  - generic [ref=f4e69]: 科研流水线验收：协作成果分层界面验收，使
                  - generic [ref=f4e73]: 刚刚
                - button "会话操作：科研流水线验收：协作成果分层界面验收，使" [ref=f4e75] [cursor=pointer]: ⋯
        - region "服务器" [ref=f4e76]:
          - generic [ref=f4e77]:
            - button "服务器" [expanded] [ref=f4e78] [cursor=pointer]
            - button "添加服务器" [ref=f4e87] [cursor=pointer]
          - paragraph [ref=f4e90]: 还没有服务器
      - generic [ref=f4e91]:
        - button "定时" [ref=f4e92] [cursor=pointer]
        - button "设置" [ref=f4e97] [cursor=pointer]
    - separator "调整侧栏宽度" [ref=f4e101]
    - main [ref=f4e102]:
      - generic [ref=f4e104]:
        - heading "今天想分析什么？" [level=2] [ref=f4e106]
        - paragraph [ref=f4e107]: 直接输入问题，按需选择本机文件夹。
        - list [ref=f4e108]:
          - listitem [ref=f4e109]:
            - button "看看这里有什么 先摸清工作区" [ref=f4e110] [cursor=pointer]:
              - generic [ref=f4e111]: 看看这里有什么
              - generic [ref=f4e112]: 先摸清工作区
          - listitem [ref=f4e113]:
            - button "读一份数据 字段、规模、缺失" [ref=f4e114] [cursor=pointer]:
              - generic [ref=f4e115]: 读一份数据
              - generic [ref=f4e116]: 字段、规模、缺失
          - listitem [ref=f4e117]:
            - button "做一次探索性分析 分布与异常" [ref=f4e118] [cursor=pointer]:
              - generic [ref=f4e119]: 做一次探索性分析
              - generic [ref=f4e120]: 分布与异常
          - listitem [ref=f4e121]:
            - button "把结果写成说明 给人看的那一版" [ref=f4e122] [cursor=pointer]:
              - generic [ref=f4e123]: 把结果写成说明
              - generic [ref=f4e124]: 给人看的那一版
        - generic [ref=f4e126]:
          - generic [ref=f4e127]:
            - button "工作目录：默认工作目录" [ref=f4e129] [cursor=pointer]:
              - generic [ref=f4e132]: 默认工作目录
            - generic [ref=f4e135]: 本机
          - textbox "输入问题，@ 引用文件，/ 使用指令" [ref=f4e141]
          - generic [ref=f4e142]:
            - generic [ref=f4e143]:
              - button "添加内容" [ref=f4e145] [cursor=pointer]
              - button "终端面板" [ref=f4e148] [cursor=pointer]
              - button "完全访问" [ref=f4e152] [cursor=pointer]
            - generic [ref=f4e157]:
              - button "DeepSeek" [ref=f4e159] [cursor=pointer]
              - button "发送" [ref=f4e165] [cursor=pointer]
    - complementary "团队" [ref=f4e168]:
      - separator "调整面板宽度" [ref=f4e169]
      - generic [ref=f4e170]:
        - tablist "面板" [ref=f4e171]:
          - tab "团队" [active] [selected] [ref=f4e172] [cursor=pointer]
          - tab "Bot" [ref=f4e173] [cursor=pointer]
        - button "更多面板" [ref=f4e175] [cursor=pointer]: ⋯
        - button "关闭面板" [ref=f4e176] [cursor=pointer]
      - generic [ref=f4e180]:
        - region "运行总览" [ref=f4e181]:
          - generic [ref=f4e182]:
            - generic [ref=f4e183]:
              - text: 对话协作台
              - heading "协作" [level=3] [ref=f4e184]
            - button "刷新运行记录" [ref=f4e186] [cursor=pointer]
          - paragraph [ref=f4e187]: 开始任务后查看运行记录
        - group [ref=f4e188]:
          - generic "团队管理与原始记录" [ref=f4e189] [cursor=pointer]
  - contentinfo "应用状态" [ref=f4e190]:
    - button "还没有填任何 API key，暂时不能对话——点这里填一个" [ref=f4e192] [cursor=pointer]
    - generic [ref=f4e193]:
      - generic [ref=f4e194]:
        - button "当前模型：deepseek-flash" [ref=f4e195] [cursor=pointer]:
          - generic [ref=f4e199]: deepseek-flash
        - button "R：未配置" [ref=f4e200] [cursor=pointer]:
          - generic [ref=f4e202]: R
          - generic [ref=f4e203]: 未配置
        - button "Python：未配置" [ref=f4e204] [cursor=pointer]:
          - generic [ref=f4e206]: Python
          - generic [ref=f4e207]: 未配置
      - generic [ref=f4e208]:
        - button "扩展数量" [ref=f4e209] [cursor=pointer]:
          - generic [ref=f4e212]: 扩展
        - button "版本 v0.0.44" [ref=f4e213] [cursor=pointer]: v0.0.44
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
> 20 |   const capture=async(name:string)=>{await outcome.scrollIntoViewIfNeeded();await page.screenshot({path:join(out,name+'.png')});await outcome.screenshot({path:join(out,name+'-panel.png')});writeFileSync(join(out,name+'.json'),JSON.stringify({name,actualElectron:true,inference:'localhost-fixture',scientificValidation:false,viewport:page.viewportSize(),checkpoint:saved(dawn.workspace)},null,2))}
     |                                                    ^ TimeoutError: locator.scrollIntoViewIfNeeded: Timeout 30000ms exceeded.
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
  32 |    await expect(overview.locator(`[data-task-detail="${saved(dawn.workspace)!.team.pipeline.currentTaskId}"]`)).toBeVisible()
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