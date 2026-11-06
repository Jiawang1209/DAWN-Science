# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: exit-lifecycle.spec.ts >> root task shutdown >> quitting during a root bash task drains its owned process before restart
- Location: e2e/exit-lifecycle.spec.ts:11:2

# Error details

```
Error: Command failed: ps -p 37827 -o pid=,comm=
```

# Page snapshot

```yaml
- generic [ref=f3e3]:
  - generic [ref=f3e4]:
    - generic [ref=f3e5]:
      - button "DAWN Science" [ref=f3e7] [cursor=pointer]
      - button "收起侧边栏" [expanded] [ref=f3e10] [cursor=pointer]
      - button "快捷键速查" [ref=f3e13] [cursor=pointer]
    - generic [ref=f3e17]:
      - tablist "同一处的会话" [ref=f3e21]:
        - generic [ref=f3e22]:
          - tab "主任务退出探针：运行慢工具后回报。" [selected] [ref=f3e23] [cursor=pointer]
          - button "关掉「主任务退出探针：运行慢工具后回报。」（收进归档）" [ref=f3e26] [cursor=pointer]
        - button "在这里再开一段" [ref=f3e29] [cursor=pointer]
      - generic:
        - banner
    - button "面板" [ref=f3e33] [cursor=pointer]
  - generic [ref=f3e34]:
    - complementary [ref=f3e35]:
      - button "新建任务" [ref=f3e37] [cursor=pointer]
      - separator [ref=f3e42]
      - generic [ref=f3e43]:
        - generic [ref=f3e44]: 工作区
        - generic [ref=f3e45]:
          - button "搜索" [ref=f3e46] [cursor=pointer]
          - button "添加工作区文件夹" [ref=f3e49] [cursor=pointer]
      - generic [ref=f3e53]:
        - paragraph [ref=f3e54]:
          - button "项目 1" [expanded] [ref=f3e55] [cursor=pointer]:
            - generic [ref=f3e60]: 项目
            - generic [ref=f3e61]: "1"
          - button "多选项目" [ref=f3e62] [cursor=pointer]: 多选
        - list [ref=f3e63]:
          - listitem [ref=f3e64]:
            - generic [ref=f3e65]:
              - button "workspace" [ref=f3e66] [cursor=pointer]
              - generic [ref=f3e75]:
                - button "在「workspace」里开一段新对话" [ref=f3e76] [cursor=pointer]
                - button "项目操作：workspace" [ref=f3e80] [cursor=pointer]: ⋯
            - list [ref=f3e81]:
              - listitem [ref=f3e82]:
                - button "主任务退出探针：运行慢工具后回报。 跑着" [ref=f3e83]:
                  - generic [ref=f3e84]: 主任务退出探针：运行慢工具后回报。
                  - generic [ref=f3e88]: 跑着
                - button "会话操作：主任务退出探针：运行慢工具后回报。" [ref=f3e90] [cursor=pointer]: ⋯
        - region "服务器" [ref=f3e91]:
          - generic [ref=f3e92]:
            - button "服务器" [expanded] [ref=f3e93] [cursor=pointer]
            - button "添加服务器" [ref=f3e102] [cursor=pointer]
          - paragraph [ref=f3e105]: 还没有服务器
      - generic [ref=f3e106]:
        - button "定时" [ref=f3e107] [cursor=pointer]
        - button "设置" [ref=f3e112] [cursor=pointer]
    - separator "调整侧栏宽度" [ref=f3e116]
    - main [ref=f3e117]:
      - generic [ref=f3e118]:
        - toolbar "会话工具栏" [ref=f3e119]:
          - group "会话操作：主任务退出探针：运行慢工具后回报。" [ref=f3e121]:
            - button "查找当前对话" [ref=f3e123] [cursor=pointer]
            - button "导出对话" [ref=f3e127] [cursor=pointer]
        - generic [ref=f3e132]:
          - generic [ref=f3e133]:
            - generic [ref=f3e134]: 你
            - generic [ref=f3e136]:
              - paragraph [ref=f3e140]: 主任务退出探针：运行慢工具后回报。
              - generic [ref=f3e141]:
                - time [ref=f3e142]: 2026-11-06 23:48
                - button "复制我说的这段" [ref=f3e143] [cursor=pointer]
                - button "修改" [ref=f3e149] [cursor=pointer]
                - button "回到这句之前" [disabled] [ref=f3e153]
          - button "… bash sleep 15 执行中" [ref=f3e158] [cursor=pointer]:
            - generic [ref=f3e161]: … bash
            - generic [ref=f3e162]: sleep 15
            - generic [ref=f3e163]: 执行中
            - status [ref=f3e164]:
              - generic [ref=f3e165]: 正在思考
          - generic [ref=f3e169]:
            - status [ref=f3e170]:
              - generic [ref=f3e171]:
                - generic [ref=f3e172]: ⠋
                - generic [ref=f3e173]: ⠙
                - generic [ref=f3e174]: ⠹
                - generic [ref=f3e175]: ⠸
                - generic [ref=f3e176]: ⠼
                - generic [ref=f3e177]: ⠴
                - generic [ref=f3e178]: ⠦
                - generic [ref=f3e179]: ⠧
                - generic [ref=f3e180]: ⠇
                - generic [ref=f3e181]: ⠏
              - generic [ref=f3e182]: 正在等模型回话
            - generic [ref=f3e183]: 0s
        - generic [ref=f3e185]:
          - generic [ref=f3e186]:
            - button "工作目录：/var/folders/2t/y0qcl9r50cv427189l7px1000000gn/T/dawn-e2e-xEyczS/workspace" [ref=f3e188] [cursor=pointer]:
              - generic [ref=f3e191]: workspace
            - generic [ref=f3e194]: 本机
          - textbox "输入问题，@ 引用文件，/ 使用指令" [ref=f3e200]
          - generic [ref=f3e201]:
            - generic [ref=f3e202]:
              - button "添加内容" [ref=f3e204] [cursor=pointer]
              - button "终端面板" [ref=f3e207] [cursor=pointer]
              - button "完全访问" [ref=f3e211] [cursor=pointer]
            - generic [ref=f3e216]:
              - button "上下文 —" [ref=f3e218] [cursor=pointer]: —
              - button "当前模型：deepseek-flash。点击切换" [ref=f3e223] [cursor=pointer]:
                - generic [ref=f3e227]: deepseek-flash
              - button "停止" [active] [ref=f3e230] [cursor=pointer]
  - contentinfo "应用状态" [ref=f3e233]:
    - button "还没有填任何 API key，暂时不能对话——点这里填一个" [ref=f3e235] [cursor=pointer]
    - generic [ref=f3e236]:
      - generic [ref=f3e237]:
        - button "当前模型：deepseek-flash" [ref=f3e238] [cursor=pointer]:
          - generic [ref=f3e242]: deepseek-flash
        - button "R：未配置" [ref=f3e243] [cursor=pointer]:
          - generic [ref=f3e245]: R
          - generic [ref=f3e246]: 未配置
        - button "Python：未配置" [ref=f3e247] [cursor=pointer]:
          - generic [ref=f3e249]: Python
          - generic [ref=f3e250]: 未配置
      - generic [ref=f3e251]:
        - generic [ref=f3e252]:
          - button "插件 8" [ref=f3e253] [cursor=pointer]:
            - generic [ref=f3e256]: 插件
            - generic [ref=f3e257]: "8"
          - button "Skills 9" [ref=f3e258] [cursor=pointer]:
            - generic [ref=f3e262]: Skills
            - generic [ref=f3e263]: "9"
          - button "MCP 0" [ref=f3e264] [cursor=pointer]:
            - generic [ref=f3e267]: MCP
            - generic [ref=f3e268]: "0"
          - button "子 Agent 22" [ref=f3e269] [cursor=pointer]:
            - generic [ref=f3e272]: 子 Agent
            - generic [ref=f3e273]: "22"
        - button "版本 v0.0.44" [ref=f3e274] [cursor=pointer]: v0.0.44
```

# Test source

```ts
  1  | /** Real lifecycle boundaries. Fault injection validates diagnostics, not historical causality. */
  2  | import {execFileSync} from 'node:child_process'
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
> 21 |     const rows=execFileSync('ps',['-p',candidates.join(','),'-o','pid=,comm='],{encoding:'utf8'}).trim().split('\n')
     |                ^ Error: Command failed: ps -p 37827 -o pid=,comm=
  22 |     owned=rows.filter(row=>/(?:^|\/)sleep$/.test(row.trim())).map(row=>Number(row.trim().split(/\s+/)[0]))
  23 |     return owned.length
  24 |    }).toBeGreaterThan(0)
  25 |    await page.screenshot({path:join(evidence,'root-running.png')})
  26 |    const restarted=await dawn.重开()
  27 |    const facts=readFacts(testInfo.outputPath('electron-exit',`app-${pid}.jsonl`))
  28 |    writeFileSync(join(evidence,'root-quit-result.json'),JSON.stringify({pid,owned,aliveAfterRestart:owned.filter(alive),events:facts.map(row=>row.event)},null,2)+'\n')
  29 |    await expect.poll(()=>owned.filter(alive),{timeout:1000}).toEqual([])
  30 |    await restarted.getByRole('button',{name:/^主任务退出探针/}).click()
  31 |    await expect(restarted.getByRole('button',{name:'停止',exact:true})).toHaveCount(0)
  32 |    await restarted.screenshot({path:join(evidence,'root-recovered.png')})
  33 |   }finally{
  34 |    // A failing regression must not leave its own known sleep process behind.
  35 |    for(const id of owned)if(alive(id))try{process.kill(id,'SIGKILL')}catch{}
  36 |   }
  37 |  })
  38 | })
  39 | test('diagnoses a deliberately vetoed quit while the native process is still alive',async({dawn},testInfo)=>{
  40 |  const pid=dawn.app.process().pid!,dir=testInfo.outputPath('electron-exit'),file=join(dir,`app-${pid}.jsonl`)
  41 |  await dawn.app.evaluate(({app})=>{
  42 |   app.once('before-quit',event=>event.preventDefault())
  43 |   // Deliberate, bounded veto; release through the normal quit path, never a kill.
  44 |   setTimeout(()=>app.quit(),6500)
  45 |  })
  46 |  const restarting=dawn.重开()
  47 |  try{
  48 |   await expect.poll(()=>readFacts(join(dir,`exit-${pid}.jsonl`)).some(row=>row.event==='still-waiting-5s')).toBe(true)
  49 |   expect(alive(pid)).toBe(true)
  50 |   const before=readFacts(file).map(row=>row.event)
  51 |   expect(before).toContain('before-quit');expect(before).not.toContain('will-quit')
  52 |  }finally{await restarting}
  53 |  const after=readFacts(file).map(row=>row.event)
  54 |  expect(after.filter(event=>event==='before-quit')).toHaveLength(2)
  55 |  expect(after).toContain('shutdown-sync-complete');expect(after).toContain('process-exit')
  56 | })
  57 | 
```