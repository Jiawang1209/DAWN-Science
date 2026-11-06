# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: exit-lifecycle.spec.ts >> root task shutdown >> quitting during a root bash task drains its owned process before restart
- Location: e2e/exit-lifecycle.spec.ts:11:2

# Error details

```
Error: expect(received).toContain(expected) // indexOf

Expected value: "shutdown-async-complete"
Received array: ["diagnostics-attached", "contents-created", "window-created", "before-quit", "window-close", "contents-destroyed", "window-closed", "will-quit", "shutdown-check", "shutdown-sync-start", …]
```

# Page snapshot

```yaml
- generic [ref=f2e3]:
  - generic [ref=f2e4]:
    - generic [ref=f2e5]:
      - button "DAWN Science" [ref=f2e7] [cursor=pointer]
      - button "收起侧边栏" [expanded] [ref=f2e10] [cursor=pointer]
      - button "快捷键速查" [ref=f2e13] [cursor=pointer]
    - button "面板" [ref=f2e18] [cursor=pointer]
  - generic [ref=f2e19]:
    - complementary [ref=f2e20]:
      - button "新建任务" [ref=f2e22] [cursor=pointer]
      - separator [ref=f2e27]
      - generic [ref=f2e28]:
        - generic [ref=f2e29]: 工作区
        - generic [ref=f2e30]:
          - button "搜索" [ref=f2e31] [cursor=pointer]
          - button "添加工作区文件夹" [ref=f2e34] [cursor=pointer]
      - generic [ref=f2e38]:
        - paragraph [ref=f2e39]:
          - button "项目 1" [expanded] [ref=f2e40] [cursor=pointer]:
            - generic [ref=f2e45]: 项目
            - generic [ref=f2e46]: "1"
          - button "多选项目" [ref=f2e47] [cursor=pointer]: 多选
        - list [ref=f2e48]:
          - listitem [ref=f2e49]:
            - generic [ref=f2e50]:
              - button "workspace" [ref=f2e51] [cursor=pointer]
              - generic [ref=f2e60]:
                - button "在「workspace」里开一段新对话" [ref=f2e61] [cursor=pointer]
                - button "项目操作：workspace" [ref=f2e65] [cursor=pointer]: ⋯
            - list [ref=f2e66]:
              - listitem [ref=f2e67]:
                - button "主任务退出探针：运行慢工具后回报。 刚刚" [ref=f2e68]:
                  - generic [ref=f2e69]: 主任务退出探针：运行慢工具后回报。
                  - generic [ref=f2e73]: 刚刚
                - button "会话操作：主任务退出探针：运行慢工具后回报。" [ref=f2e75] [cursor=pointer]: ⋯
        - region "服务器" [ref=f2e76]:
          - generic [ref=f2e77]:
            - button "服务器" [expanded] [ref=f2e78] [cursor=pointer]
            - button "添加服务器" [ref=f2e87] [cursor=pointer]
          - paragraph [ref=f2e90]: 还没有服务器
      - generic [ref=f2e91]:
        - button "定时" [ref=f2e92] [cursor=pointer]
        - button "设置" [ref=f2e97] [cursor=pointer]
    - separator "调整侧栏宽度" [ref=f2e101]
    - main [ref=f2e102]:
      - generic [ref=f2e104]:
        - heading "今天想分析什么？" [level=2] [ref=f2e106]
        - paragraph [ref=f2e107]: 直接输入问题，按需选择本机文件夹。
        - list [ref=f2e108]:
          - listitem [ref=f2e109]:
            - button "看看这里有什么 先摸清工作区" [ref=f2e110] [cursor=pointer]:
              - generic [ref=f2e111]: 看看这里有什么
              - generic [ref=f2e112]: 先摸清工作区
          - listitem [ref=f2e113]:
            - button "读一份数据 字段、规模、缺失" [ref=f2e114] [cursor=pointer]:
              - generic [ref=f2e115]: 读一份数据
              - generic [ref=f2e116]: 字段、规模、缺失
          - listitem [ref=f2e117]:
            - button "做一次探索性分析 分布与异常" [ref=f2e118] [cursor=pointer]:
              - generic [ref=f2e119]: 做一次探索性分析
              - generic [ref=f2e120]: 分布与异常
          - listitem [ref=f2e121]:
            - button "把结果写成说明 给人看的那一版" [ref=f2e122] [cursor=pointer]:
              - generic [ref=f2e123]: 把结果写成说明
              - generic [ref=f2e124]: 给人看的那一版
        - generic [ref=f2e126]:
          - generic [ref=f2e127]:
            - button "工作目录：默认工作目录" [ref=f2e129] [cursor=pointer]:
              - generic [ref=f2e132]: 默认工作目录
            - generic [ref=f2e135]: 本机
          - textbox "输入问题，@ 引用文件，/ 使用指令" [active] [ref=f2e141]
          - generic [ref=f2e142]:
            - generic [ref=f2e143]:
              - button "添加内容" [ref=f2e145] [cursor=pointer]
              - button "终端面板" [ref=f2e148] [cursor=pointer]
              - button "完全访问" [ref=f2e152] [cursor=pointer]
            - generic [ref=f2e157]:
              - button "DeepSeek" [ref=f2e159] [cursor=pointer]
              - button "发送" [ref=f2e165] [cursor=pointer]
  - contentinfo "应用状态" [ref=f2e168]:
    - button "还没有填任何 API key，暂时不能对话——点这里填一个" [ref=f2e170] [cursor=pointer]
    - generic [ref=f2e171]:
      - generic [ref=f2e172]:
        - button "当前模型：deepseek-flash" [ref=f2e173] [cursor=pointer]:
          - generic [ref=f2e177]: deepseek-flash
        - button "R：未配置" [ref=f2e178] [cursor=pointer]:
          - generic [ref=f2e180]: R
          - generic [ref=f2e181]: 未配置
        - button "Python：未配置" [ref=f2e182] [cursor=pointer]:
          - generic [ref=f2e184]: Python
          - generic [ref=f2e185]: 未配置
      - generic [ref=f2e186]:
        - generic [ref=f2e187]:
          - button "插件 8" [ref=f2e188] [cursor=pointer]:
            - generic [ref=f2e191]: 插件
            - generic [ref=f2e192]: "8"
          - button "Skills 9" [ref=f2e193] [cursor=pointer]:
            - generic [ref=f2e197]: Skills
            - generic [ref=f2e198]: "9"
          - button "MCP 0" [ref=f2e199] [cursor=pointer]:
            - generic [ref=f2e202]: MCP
            - generic [ref=f2e203]: "0"
          - button "子 Agent 22" [ref=f2e204] [cursor=pointer]:
            - generic [ref=f2e207]: 子 Agent
            - generic [ref=f2e208]: "22"
        - button "版本 v0.0.44" [ref=f2e209] [cursor=pointer]: v0.0.44
```

# Test source

```ts
  1  | /** Real lifecycle boundaries. Fault injection validates diagnostics, not historical causality. */
  2  | import {spawnSync} from 'node:child_process'
  3  | import {existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs'
  4  | import {join,resolve} from 'node:path'
  5  | import {test,expect,在项目里开会话} from './fixtures.js'
  6  | import {collectTree} from '../src/runtime/process-tree.js'
  7  | const readFacts=(file:string)=>existsSync(file)?readFileSync(file,'utf8').trim().split('\n').filter(Boolean).map(line=>JSON.parse(line)):[]
  8  | const alive=(pid:number)=>{try{process.kill(pid,0);return true}catch{return false}}
  9  | test.describe('root task shutdown',()=>{
  10 |  test.use({dawnOptions:{gitInit:true,toolCall:{when:'主任务退出探针',toolName:'bash',args:{command:'sleep 15'},once:true}}})
  11 |  test('quitting during a root bash task drains its owned process before restart',async({dawn},testInfo)=>{
  12 |   const{page}=dawn,pid=dawn.app.process().pid!,baseline=new Set(collectTree(pid).pids)
  13 |   const evidence=resolve(process.env.DAWN_EXIT_DEMO_DIR??'docs/validation/electron-exit-investigation-20261106/demo');mkdirSync(evidence,{recursive:true})
  14 |   let owned:number[]=[]
  15 |   try{
  16 |    await 在项目里开会话(page);await page.getByPlaceholder(/输入问题/).fill('主任务退出探针：运行慢工具后回报。');await page.getByRole('button',{name:'发送',exact:true}).click()
  17 |    await expect(page.locator('.tool[data-tool-name="bash"]')).toHaveAttribute('data-status','running')
  18 |    await expect.poll(()=>{
  19 |     const candidates=collectTree(pid).pids.filter(id=>!baseline.has(id))
  20 |     if(!candidates.length)return 0
  21 |     const result=spawnSync('ps',['-p',candidates.join(','),'-o','pid=,comm='],{encoding:'utf8'})
  22 |     if(result.error)throw result.error
  23 |     const rows=(result.stdout??'').trim().split('\n')
  24 |     owned=rows.filter(row=>/\s(?:\S*\/)?sleep$/.test(row.trim())).map(row=>Number(row.trim().split(/\s+/)[0]))
  25 |     return owned.length
  26 |    }).toBeGreaterThan(0)
  27 |    await page.screenshot({path:join(evidence,'root-running.png')})
  28 |    const restarted=await dawn.重开()
  29 |    const facts=readFacts(testInfo.outputPath('electron-exit',`app-${pid}.jsonl`))
  30 |    writeFileSync(join(evidence,'root-quit-result.json'),JSON.stringify({pid,owned,aliveAfterRestart:owned.filter(alive),events:facts.map(row=>row.event)},null,2)+'\n')
> 31 |    expect(facts.map(row=>row.event)).toContain('shutdown-async-complete')
     |                                      ^ Error: expect(received).toContain(expected) // indexOf
  32 |    await expect.poll(()=>owned.filter(alive),{timeout:1000}).toEqual([])
  33 |    await restarted.getByRole('button',{name:/^主任务退出探针/}).click()
  34 |    await expect(restarted.getByRole('button',{name:'停止',exact:true})).toHaveCount(0)
  35 |    await restarted.screenshot({path:join(evidence,'root-recovered.png')})
  36 |   }finally{
  37 |    // A failing regression must not leave its own known sleep process behind.
  38 |    for(const id of owned)if(alive(id))try{process.kill(id,'SIGKILL')}catch{}
  39 |   }
  40 |  })
  41 | })
  42 | test('diagnoses a deliberately vetoed quit while the native process is still alive',async({dawn},testInfo)=>{
  43 |  const pid=dawn.app.process().pid!,dir=testInfo.outputPath('electron-exit'),file=join(dir,`app-${pid}.jsonl`)
  44 |  await dawn.app.evaluate(({app})=>{
  45 |   app.once('before-quit',event=>event.preventDefault())
  46 |   // Deliberate, bounded veto; release through the normal quit path, never a kill.
  47 |   setTimeout(()=>app.quit(),6500)
  48 |  })
  49 |  const restarting=dawn.重开()
  50 |  try{
  51 |   await expect.poll(()=>readFacts(join(dir,`exit-${pid}.jsonl`)).some(row=>row.event==='still-waiting-5s')).toBe(true)
  52 |   expect(alive(pid)).toBe(true)
  53 |   const before=readFacts(file).map(row=>row.event)
  54 |   expect(before).toContain('before-quit');expect(before).not.toContain('will-quit')
  55 |  }finally{await restarting}
  56 |  const after=readFacts(file).map(row=>row.event)
  57 |  expect(after.filter(event=>event==='before-quit')).toHaveLength(2)
  58 |  expect(after).toContain('shutdown-sync-complete');expect(after).toContain('process-exit')
  59 | })
  60 | 
```