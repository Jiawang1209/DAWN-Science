# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: collaboration-stopping.spec.ts >> shows actual stopping until the bounded descendant finishes, without claiming an artifact lock
- Location: e2e/collaboration-stopping.spec.ts:28:1

# Error details

```
TimeoutError: locator.waitFor: Timeout 30000ms exceeded.
Call log:
  - waiting for getByRole('region', { name: '协作成果', exact: true }).locator('h4').filter({ hasText: '正在停止，等待执行排空' }) to be visible

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
          - tab "协作停止界面验收" [selected] [ref=f3e23] [cursor=pointer]
          - button "关掉「协作停止界面验收」（收进归档）" [ref=f3e26] [cursor=pointer]
        - button "在这里再开一段" [ref=f3e29] [cursor=pointer]
      - generic:
        - banner
    - button "面板：团队" [expanded] [ref=f3e33] [cursor=pointer]
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
                - button "协作停止界面验收 跑着" [ref=f3e83]:
                  - generic [ref=f3e84]: 协作停止界面验收
                  - generic [ref=f3e88]: 跑着
                - button "会话操作：协作停止界面验收" [ref=f3e90] [cursor=pointer]: ⋯
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
      - button "打开协作：1 项任务 · 0 项验收通过" [ref=f3e119] [cursor=pointer]:
        - strong [ref=f3e122]: 协作
        - generic [ref=f3e123]: 协作已取消
        - generic [ref=f3e124]: 1 项任务 · 0 项验收通过
        - generic [ref=f3e125]: ›
      - generic [ref=f3e126]:
        - toolbar "会话工具栏" [ref=f3e127]:
          - group "会话操作：协作停止界面验收" [ref=f3e129]:
            - button "查找当前对话" [ref=f3e131] [cursor=pointer]
            - button "导出对话" [ref=f3e135] [cursor=pointer]
        - generic [ref=f3e140]:
          - generic [ref=f3e141]:
            - generic [ref=f3e142]: 你
            - generic [ref=f3e144]:
              - paragraph [ref=f3e148]: 协作停止界面验收
              - generic [ref=f3e149]:
                - time [ref=f3e150]: 2026-11-07 23:34
                - button "复制我说的这段" [ref=f3e151] [cursor=pointer]
                - button "修改" [ref=f3e157] [cursor=pointer]
                - button "回到这句之前" [ref=f3e161] [cursor=pointer]
          - 'button "■ subagent {\"agent\":\"cleanup-agent\",\"task\":\"受控清理子任务\"} 已中断" [ref=f3e165] [cursor=pointer]':
            - generic [ref=f3e168]: ■ subagent
            - generic [ref=f3e169]: "{\"agent\":\"cleanup-agent\",\"task\":\"受控清理子任务\"}"
            - generic [ref=f3e170]: 已中断
          - generic [ref=f3e171]:
            - generic [ref=f3e172]: 子 agent 1/1
            - generic [ref=f3e174]:
              - button "✗ cleanup-agent 失败" [ref=f3e175] [cursor=pointer]:
                - text: ✗ cleanup-agent
                - generic [ref=f3e176]: 失败
              - paragraph [ref=f3e177]: 已中止
        - generic [ref=f3e179]:
          - generic [ref=f3e180]:
            - button "工作目录：/var/folders/2t/y0qcl9r50cv427189l7px1000000gn/T/dawn-e2e-BtB1Er/workspace" [ref=f3e182] [cursor=pointer]:
              - generic [ref=f3e185]: workspace
            - generic [ref=f3e188]: 本机
          - textbox "输入问题，@ 引用文件，/ 使用指令" [ref=f3e194]
          - generic [ref=f3e195]:
            - generic [ref=f3e196]:
              - button "添加内容" [ref=f3e198] [cursor=pointer]
              - button "终端面板" [ref=f3e201] [cursor=pointer]
              - button "完全访问" [ref=f3e205] [cursor=pointer]
            - generic [ref=f3e210]:
              - button "上下文 —" [ref=f3e212] [cursor=pointer]: —
              - button "当前模型：deepseek-flash。点击切换" [ref=f3e217] [cursor=pointer]:
                - generic [ref=f3e221]: deepseek-flash
              - button "发送" [active] [ref=f3e224] [cursor=pointer]
    - complementary "团队" [ref=f3e227]:
      - separator "调整面板宽度" [ref=f3e228]
      - generic [ref=f3e229]:
        - tablist "面板" [ref=f3e230]:
          - tab "文件" [ref=f3e231] [cursor=pointer]
          - tab "产物" [ref=f3e232] [cursor=pointer]
          - tab "笔记本" [ref=f3e233] [cursor=pointer]
          - tab "路线" [ref=f3e234] [cursor=pointer]
          - tab "审阅" [ref=f3e235] [cursor=pointer]
          - tab "团队" [selected] [ref=f3e236] [cursor=pointer]
          - tab "Bot" [ref=f3e237] [cursor=pointer]
        - button "更多面板" [ref=f3e239] [cursor=pointer]: ⋯
        - button "关闭面板" [ref=f3e240] [cursor=pointer]
      - region "运行总览" [ref=f3e245]:
        - generic [ref=f3e246]:
          - generic [ref=f3e247]:
            - text: 对话协作台
            - heading "协作" [level=3] [ref=f3e248]
          - button "刷新运行记录" [ref=f3e250] [cursor=pointer]
        - region "协作成果" [ref=f3e251]:
          - generic [ref=f3e252]:
            - generic [ref=f3e253]: 任务目标
            - heading "本会话协作" [level=3] [ref=f3e254]
          - generic [ref=f3e255]:
            - heading "协作已取消" [level=4] [ref=f3e256]
            - paragraph [ref=f3e257]: 宿主已核验执行排空。
          - generic [ref=f3e258]:
            - generic [ref=f3e259]: 下一步 · 查看对应任务的证据与记录
            - button "查看恢复检查" [ref=f3e260] [cursor=pointer]
          - generic [ref=f3e261]:
            - heading "验收成果与版本" [level=4] [ref=f3e262]
            - paragraph [ref=f3e263]: 尚无本轮已验收成果。
          - generic [ref=f3e264]:
            - paragraph [ref=f3e265]: 执行轮次未设上限 · 审阅预留未启用 · 在途 0 · 费用未记录
            - button "展开流程工作台" [ref=f3e266] [cursor=pointer]
        - paragraph [ref=f3e267]: 来自当前会话的统一编排；每两秒刷新
        - generic [ref=f3e268]:
          - strong [ref=f3e269]: 1 项任务
          - generic [ref=f3e270]: 0 项验收通过
          - generic [ref=f3e271]: 0 项活跃
        - generic [ref=f3e272]:
          - generic "协作任务" [ref=f3e273]:
            - button "cleanup-agent" [pressed] [ref=f3e275] [cursor=pointer]:
              - generic [ref=f3e276]: C
              - generic [ref=f3e277]:
                - strong [ref=f3e278]: cleanup-agent
                - generic [ref=f3e279]: 已取消并排空
              - generic [ref=f3e280]:
                - generic [ref=f3e281]: 子任务
                - generic [ref=f3e282]: 累计结算 0.9 秒
          - generic [ref=f3e283]:
            - generic [ref=f3e285]:
              - strong [ref=f3e286]: cleanup-agent
              - generic [ref=f3e287]: 类型 subagent · 执行代次 1
            - tablist "任务详情" [ref=f3e288]:
              - tab "过程" [selected] [ref=f3e289] [cursor=pointer]
              - tab "交接" [ref=f3e290] [cursor=pointer]
              - tab "产物" [ref=f3e291] [cursor=pointer]
              - tab "记录" [ref=f3e292] [cursor=pointer]
            - tabpanel "过程" [ref=f3e293]:
              - region "任务轨迹" [ref=f3e294]:
                - generic [ref=f3e295]:
                  - strong [ref=f3e296]: 任务轨迹
                  - generic [ref=f3e297]: 已取消并排空
                - paragraph [ref=f3e298]: 执行已中止
                - list [ref=f3e299]:
                  - listitem [ref=f3e300]:
                    - time [ref=f3e301]: 23:34:29
                    - generic [ref=f3e302]: 开始执行
                  - listitem [ref=f3e303]:
                    - time [ref=f3e304]: 23:34:29
                    - generic [ref=f3e305]: 核验冻结输入
                  - listitem [ref=f3e306]:
                    - time [ref=f3e307]: 23:34:29
                    - generic [ref=f3e308]: 后端执行
                  - listitem [ref=f3e309]:
                    - time [ref=f3e310]: 23:34:30
                    - generic [ref=f3e311]: 已请求停止
                  - listitem [ref=f3e312]:
                    - time [ref=f3e313]: 23:34:30
                    - generic [ref=f3e314]: 执行已结算
              - paragraph [ref=f3e315]: 普通委派任务
              - paragraph [ref=f3e316]: 暂无宿主验收回执
            - button "查看子任务过程" [ref=f3e317] [cursor=pointer]
        - generic [ref=f3e318]:
          - group [ref=f3e319]:
            - generic "查看额度" [ref=f3e320] [cursor=pointer]
          - group [ref=f3e321]:
            - generic "会话完整执行记录" [ref=f3e322] [cursor=pointer]
  - contentinfo "应用状态" [ref=f3e323]:
    - button "还没有填任何 API key，暂时不能对话——点这里填一个" [ref=f3e325] [cursor=pointer]
    - generic [ref=f3e326]:
      - generic [ref=f3e327]:
        - button "当前模型：deepseek-flash" [ref=f3e328] [cursor=pointer]:
          - generic [ref=f3e332]: deepseek-flash
        - button "R：未配置" [ref=f3e333] [cursor=pointer]:
          - generic [ref=f3e335]: R
          - generic [ref=f3e336]: 未配置
        - button "Python：未配置" [ref=f3e337] [cursor=pointer]:
          - generic [ref=f3e339]: Python
          - generic [ref=f3e340]: 未配置
      - generic [ref=f3e341]:
        - generic [ref=f3e342]:
          - button "插件 8" [ref=f3e343] [cursor=pointer]:
            - generic [ref=f3e346]: 插件
            - generic [ref=f3e347]: "8"
          - button "Skills 9" [ref=f3e348] [cursor=pointer]:
            - generic [ref=f3e352]: Skills
            - generic [ref=f3e353]: "9"
          - button "MCP 0" [ref=f3e354] [cursor=pointer]:
            - generic [ref=f3e357]: MCP
            - generic [ref=f3e358]: "0"
          - button "子 Agent 23" [ref=f3e359] [cursor=pointer]:
            - generic [ref=f3e362]: 子 Agent
            - generic [ref=f3e363]: "23"
        - button "版本 v0.0.44" [ref=f3e364] [cursor=pointer]: v0.0.44
```

# Test source

```ts
  1  | /** A bounded, owned descendant cleanup fixture makes the real stopping phase observable. */
  2  | import {mkdirSync,writeFileSync,readFileSync,existsSync,readdirSync} from 'node:fs'
  3  | import {execFileSync} from 'node:child_process'
  4  | import {join,resolve} from 'node:path'
  5  | import {test,expect,在项目里开会话,进坞} from './fixtures.js'
  6  | const script=`import os, signal, sys, time
  7  | from pathlib import Path
  8  | os.setsid()
  9  | Path('cleanup.pid').write_text(str(os.getpid()))
  10 | parent = os.getppid()
  11 | def cleanup(sig, frame):
  12 |     Path('cleanup-started.txt').write_text(str(time.monotonic()))
  13 |     for i in range(12):
  14 |         print('controlled fixture cleanup', i, flush=True)
  15 |         time.sleep(0.05)
  16 |     Path('cleanup-finished.txt').write_text(str(time.monotonic()))
  17 |     sys.exit(0)
  18 | signal.signal(signal.SIGTERM, cleanup)
  19 | print('controlled cleanup fixture ready', flush=True)
  20 | while os.getppid() == parent:
  21 |     time.sleep(0.01)
  22 | os.kill(os.getpid(), signal.SIGTERM)
  23 | `
  24 | test.use({dawnOptions:{gitInit:true,toolCall:[
  25 |  {when:'协作停止界面验收',toolName:'subagent',args:{agent:'cleanup-agent',task:'受控清理子任务'},once:true},
  26 |  {duringTask:'受控清理子任务',toolName:'bash',args:{command:'python3 cleanup-fixture.py & wait'},once:true},
  27 | ]}})
  28 | test('shows actual stopping until the bounded descendant finishes, without claiming an artifact lock',async({dawn},testInfo)=>{
  29 |  const{page,workspace}=dawn,out=resolve(process.env.DAWN_OUTCOME_EVIDENCE_DIR??testInfo.outputPath('evidence'),'stopping');mkdirSync(out,{recursive:true});mkdirSync(join(workspace,'.dawn/agents'),{recursive:true})
  30 |  writeFileSync(join(workspace,'cleanup-fixture.py'),script);writeFileSync(join(workspace,'.dawn/agents/cleanup-agent.md'),'---\nname: cleanup-agent\ndescription: bounded owned cleanup fixture\ntools: bash\n---\nRun only the declared fixture command.')
  31 |  let pid:number|undefined
  32 |  try{
  33 |   await 在项目里开会话(page);await 进坞(page,'团队')
  34 |   await page.locator('main.main .composer textarea').fill('协作停止界面验收');await page.getByRole('button',{name:'发送',exact:true}).click()
  35 |   await expect.poll(()=>existsSync(join(workspace,'cleanup.pid'))).toBe(true);pid=Number(readFileSync(join(workspace,'cleanup.pid'),'utf8'))
  36 |   const outcome=page.getByRole('region',{name:'协作成果',exact:true})
> 37 |   const stopping=outcome.locator('h4').filter({hasText:'正在停止，等待执行排空'}).waitFor({state:'visible'})
     |                                                                        ^ TimeoutError: locator.waitFor: Timeout 30000ms exceeded.
  38 |   await page.locator('main.main').getByRole('button',{name:'停止',exact:true}).click();await stopping
  39 |   await expect(outcome).toHaveAttribute('data-outcome','stopping');await expect(outcome).not.toContainText('持有产物锁')
  40 |   const owner=readdirSync(join(workspace,'.dawn/sessions'))[0]!
  41 |   const hostOverview=await page.evaluate(async sid=>(await window.dawn!.invoke('getRunOverview',{sessionId:sid})).data as {runs:Array<{phase:string}>},owner)
  42 |   expect(hostOverview.runs.some(run=>run.phase==='stopping')).toBe(true)
  43 |   writeFileSync(join(out,'actual-stopping.json'),JSON.stringify({actualElectron:true,inference:'localhost-fixture',observedThrough:'host invalidation push; no manual refresh',hostOverview},null,2))
  44 |   await page.screenshot({path:join(out,'actual-stopping.png')})
  45 |   await expect(outcome).toHaveAttribute('data-outcome','cancelled');await expect(outcome).toContainText('宿主已核验执行排空')
  46 |   await expect.poll(()=>{try{process.kill(pid!,0);return false}catch{return true}}).toBe(true)
  47 |   await page.screenshot({path:join(out,'actual-cancelled-drained.png')})
  48 |   writeFileSync(join(out,'fixture.json'),JSON.stringify({actualElectron:true,inference:'localhost-fixture',controlledDescendantCleanupMs:600,ownedPid:pid,ownedExited:true,cleanupElapsedMs:(Number(readFileSync(join(workspace,'cleanup-finished.txt'),'utf8'))-Number(readFileSync(join(workspace,'cleanup-started.txt'),'utf8')))*1000,script,scientificValidation:false},null,2))
  49 |  }finally{
  50 |   if(pid){try{const command=execFileSync('ps',['-p',String(pid),'-o','command='],{encoding:'utf8'});if(command.includes(join(workspace,'cleanup-fixture.py'))||command.includes('python3 cleanup-fixture.py'))process.kill(pid,'SIGKILL')}catch{/* The bounded owned fixture already exited. */}}
  51 |  }
  52 | })
  53 | 
```