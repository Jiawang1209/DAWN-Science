# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: evidence-handoff.spec.ts >> selects early context by host ID, shows provenance and preserves it across continuation and restart
- Location: e2e/evidence-handoff.spec.ts:5:1

# Error details

```
Error: expect(locator).toContainText(expected) failed

Locator: getByRole('region', { name: '运行总览', exact: true }).locator('pre')
Expected substring: "早期约束"
Error: strict mode violation: getByRole('region', { name: '运行总览', exact: true }).locator('pre') resolved to 2 elements:
    1) <pre data-authored="1">早期约束：carbon 单位 mg/g；使用算术均值，只丢弃 NA，不能按降雨筛选。保留原始输入。</pre> aka getByLabel('运行总览').getByText('早期约束：carbon 单位 mg/g')
    2) <pre data-authored="1">{"title":"演示分析路线","goal":"通过真实工具演示逐步路线与生成产物；不证明科学…</pre> aka getByLabel('运行总览').getByText('{"title":"演示分析路线","goal')

Call log:
  - Expect "toContainText" with timeout 25000ms
  - waiting for getByRole('region', { name: '运行总览', exact: true }).locator('pre')

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
          - tab "早期约束：carbon 单位 mg/g；" [selected] [ref=f3e23] [cursor=pointer]
          - button "关掉「早期约束：carbon 单位 mg/g；」（收进归档）" [ref=f3e26] [cursor=pointer]
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
                - button "早期约束：carbon 单位 mg/g； 刚刚" [ref=f3e83]:
                  - generic [ref=f3e84]: 早期约束：carbon 单位 mg/g；
                  - generic [ref=f3e88]: 刚刚
                - button "会话操作：早期约束：carbon 单位 mg/g；" [ref=f3e90] [cursor=pointer]: ⋯
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
          - group "会话操作：早期约束：carbon 单位 mg/g；" [ref=f3e121]:
            - button "查找当前对话" [ref=f3e123] [cursor=pointer]
            - button "导出对话" [ref=f3e127] [cursor=pointer]
        - button "演示分析路线 已交付 0 / 3" [ref=f3e130] [cursor=pointer]:
          - generic [ref=f3e131]: 演示分析路线
          - generic [ref=f3e132]: 已交付 0 / 3
        - navigation "轮次导航" [ref=f3e133]:
          - button "第 1 轮：早期约束：carbon 单位 mg/g；使用算术均值，只丢弃 NA，不能按降雨筛选。保留原始输入" [ref=f3e134] [cursor=pointer]
          - button "第 2 轮：建立会话分析路线，先记录输入和步骤。" [ref=f3e135] [cursor=pointer]
          - button "第 3 轮：后续讨论：先解释，不执行。" [ref=f3e136] [cursor=pointer]
          - button "第 4 轮：开始执行演示证据交接：把早期约束交给只读 scout。" [ref=f3e137] [cursor=pointer]
        - generic [ref=f3e140]:
          - generic [ref=f3e141]:
            - generic [ref=f3e142]: 你
            - generic [ref=f3e144]:
              - paragraph [ref=f3e148]: 早期约束：carbon 单位 mg/g；使用算术均值，只丢弃 NA，不能按降雨筛选。保留原始输入。
              - generic [ref=f3e149]:
                - time [ref=f3e150]: 2026-11-07 01:46
                - button "复制我说的这段" [ref=f3e151] [cursor=pointer]
                - button "修改" [ref=f3e157] [cursor=pointer]
                - button "回到这句之前" [ref=f3e161] [cursor=pointer]
          - generic [ref=f3e164]:
            - generic [ref=f3e165]:
              - generic [ref=f3e166]: D
              - generic [ref=f3e167]: DeepSeek
            - generic [ref=f3e168]:
              - paragraph [ref=f3e172]: 假模型已应答：DAWN 的整条链路是通的。
              - generic [ref=f3e173]:
                - button "复制这段回答" [ref=f3e174] [cursor=pointer]
                - paragraph [ref=f3e180]: 输入 12 · 输出 8 · 缓存 0 token
          - generic [ref=f3e181]:
            - generic [ref=f3e182]: 你
            - generic [ref=f3e184]:
              - paragraph [ref=f3e188]: 建立会话分析路线，先记录输入和步骤。
              - generic [ref=f3e189]:
                - time [ref=f3e190]: 2026-11-07 01:46
                - button "复制我说的这段" [ref=f3e191] [cursor=pointer]
                - button "修改" [ref=f3e197] [cursor=pointer]
                - button "回到这句之前" [ref=f3e201] [cursor=pointer]
          - generic [ref=f3e204]:
            - generic [ref=f3e205]:
              - generic [ref=f3e206]: D
              - generic [ref=f3e207]: DeepSeek
            - generic [ref=f3e208]:
              - paragraph [ref=f3e212]: 读取本会话路线与版本。
              - button "复制这段回答" [ref=f3e214] [cursor=pointer]
          - button "已完成 用时 0 秒 1 步" [expanded] [ref=f3e220] [cursor=pointer]:
            - generic [ref=f3e223]: 已完成
            - generic [ref=f3e224]: 用时 0 秒
            - generic [ref=f3e225]: 1 步
          - 'button "✓ get_analysis_route {} 成功" [ref=f3e227] [cursor=pointer]':
            - generic [ref=f3e230]: ✓ get_analysis_route
            - generic [ref=f3e231]: "{}"
            - generic [ref=f3e232]: 成功
          - generic [ref=f3e233]:
            - generic [ref=f3e234]:
              - generic [ref=f3e235]: D
              - generic [ref=f3e236]: DeepSeek
            - generic [ref=f3e237]:
              - paragraph [ref=f3e241]: 建立三个步骤的结构化路线。
              - button "复制这段回答" [ref=f3e243] [cursor=pointer]
          - button "已完成 用时 0 秒 1 步" [expanded] [ref=f3e249] [cursor=pointer]:
            - generic [ref=f3e252]: 已完成
            - generic [ref=f3e253]: 用时 0 秒
            - generic [ref=f3e254]: 1 步
          - 'button "✓ update_analysis_route {\"expectedRevision\":0,\"route\":{\"title\":\"演示分析路线\",\"goal\":\"通过真实工具演示逐步路线与生成产物；不证明科学分析质量\",\"dataContext\":[\"工程夹具，尚未提供科研输入\"],\"steps\":[{\"id\":\"S1\",\"title\":\"输入与 Alpha 多样性\",\"purpose\":\"核对输入并说明本步分析条件\",\"inputs\":[\"用户… 成功" [ref=f3e256] [cursor=pointer]':
            - generic [ref=f3e259]: ✓ update_analysis_route
            - generic [ref=f3e260]: "{\"expectedRevision\":0,\"route\":{\"title\":\"演示分析路线\",\"goal\":\"通过真实工具演示逐步路线与生成产物；不证明科学分析质量\",\"dataContext\":[\"工程夹具，尚未提供科研输入\"],\"steps\":[{\"id\":\"S1\",\"title\":\"输入与 Alpha 多样性\",\"purpose\":\"核对输入并说明本步分析条件\",\"inputs\":[\"用户…"
            - generic [ref=f3e261]: 成功
          - generic [ref=f3e262]:
            - generic [ref=f3e263]:
              - generic [ref=f3e264]: D
              - generic [ref=f3e265]: DeepSeek
            - generic [ref=f3e266]:
              - paragraph [ref=f3e270]:
                - text: 三步路线已记录；真实候选为
                - code [ref=f3e271]: 20251017-e2e-alpha-diversity
                - text: Alpha多样性分析测试案例。请选一步继续；这只验证工程接线。
              - generic [ref=f3e272]:
                - button "复制这段回答" [ref=f3e273] [cursor=pointer]
                - paragraph [ref=f3e279]: 输入 12 · 输出 8 · 缓存 0 token
          - generic [ref=f3e280]:
            - generic [ref=f3e281]: 你
            - generic [ref=f3e283]:
              - paragraph [ref=f3e287]: 后续讨论：先解释，不执行。
              - generic [ref=f3e288]:
                - time [ref=f3e289]: 2026-11-07 01:46
                - button "复制我说的这段" [ref=f3e290] [cursor=pointer]
                - button "修改" [ref=f3e296] [cursor=pointer]
                - button "回到这句之前" [ref=f3e300] [cursor=pointer]
          - generic [ref=f3e303]:
            - generic [ref=f3e304]:
              - generic [ref=f3e305]: D
              - generic [ref=f3e306]: DeepSeek
            - generic [ref=f3e307]:
              - paragraph [ref=f3e311]: 假模型已应答：DAWN 的整条链路是通的。
              - generic [ref=f3e312]:
                - button "复制这段回答" [ref=f3e313] [cursor=pointer]
                - paragraph [ref=f3e319]: 输入 12 · 输出 8 · 缓存 0 token
          - generic [ref=f3e320]:
            - generic [ref=f3e321]: 你
            - generic [ref=f3e323]:
              - paragraph [ref=f3e327]: 开始执行演示证据交接：把早期约束交给只读 scout。
              - generic [ref=f3e328]:
                - time [ref=f3e329]: 2026-11-07 01:46
                - button "复制我说的这段" [ref=f3e330] [cursor=pointer]
                - button "修改" [ref=f3e336] [cursor=pointer]
                - button "回到这句之前" [ref=f3e340] [cursor=pointer]
          - button "已完成 用时 0.5 秒 2 步" [expanded] [ref=f3e343] [cursor=pointer]:
            - generic [ref=f3e346]: 已完成
            - generic [ref=f3e347]: 用时 0.5 秒
            - generic [ref=f3e348]: 2 步
          - button "✓ 调用了 1 次 subagent_context_sources、调用了 1 次 subagent" [ref=f3e350] [cursor=pointer]:
            - generic [ref=f3e353]: ✓
            - generic [ref=f3e354]: 调用了 1 次 subagent_context_sources、调用了 1 次 subagent
          - generic [ref=f3e355]:
            - generic [ref=f3e356]: 子 agent 1/1
            - button "✓ scout 完成" [ref=f3e359] [cursor=pointer]:
              - text: ✓ scout
              - generic [ref=f3e360]: 完成
          - generic [ref=f3e361]:
            - generic [ref=f3e362]:
              - generic [ref=f3e363]: D
              - generic [ref=f3e364]: DeepSeek
            - generic [ref=f3e365]:
              - paragraph [ref=f3e369]: 假模型已应答：DAWN 的整条链路是通的。
              - generic [ref=f3e370]:
                - button "复制这段回答" [ref=f3e371] [cursor=pointer]
                - paragraph [ref=f3e377]: 输入 12 · 输出 8 · 缓存 0 token
        - generic [ref=f3e378]:
          - generic [ref=f3e379]:
            - generic [ref=f3e380]:
              - button "工作目录：/var/folders/2t/y0qcl9r50cv427189l7px1000000gn/T/dawn-e2e-SdzQX3/workspace" [ref=f3e382] [cursor=pointer]:
                - generic [ref=f3e385]: workspace
              - generic [ref=f3e388]: 本机
            - textbox "检查缺失值并说明处理方法" [ref=f3e394]
            - generic [ref=f3e395]:
              - generic [ref=f3e396]:
                - button "添加内容" [ref=f3e398] [cursor=pointer]
                - button "终端面板" [ref=f3e401] [cursor=pointer]
                - button "完全访问" [ref=f3e405] [cursor=pointer]
              - generic [ref=f3e410]:
                - button "上下文 <1%" [ref=f3e412] [cursor=pointer]: <1%
                - button "当前模型：deepseek-flash。点击切换" [ref=f3e417] [cursor=pointer]:
                  - generic [ref=f3e421]: deepseek-flash
                - button "发送" [ref=f3e424] [cursor=pointer]
          - generic "这一整段对话累计" [ref=f3e429]: 4 轮 · 工具 4 次 530 ms · 输入 48 · 输出 32 · 缓存 0 · 命中 0%
    - complementary "团队" [ref=f3e430]:
      - separator "调整面板宽度" [ref=f3e431]
      - generic [ref=f3e432]:
        - tablist "面板" [ref=f3e433]:
          - tab "文件" [ref=f3e434] [cursor=pointer]
          - tab "产物" [ref=f3e435] [cursor=pointer]
          - tab "笔记本" [ref=f3e436] [cursor=pointer]
          - tab "路线" [ref=f3e437] [cursor=pointer]
          - tab "审阅" [ref=f3e438] [cursor=pointer]
          - tab "团队" [selected] [ref=f3e439] [cursor=pointer]
          - tab "Bot" [ref=f3e440] [cursor=pointer]
        - button "更多面板" [ref=f3e442] [cursor=pointer]: ⋯
        - button "关闭面板" [ref=f3e443] [cursor=pointer]
      - generic [ref=f3e447]:
        - region "运行总览" [ref=f3e448]:
          - generic [ref=f3e449]:
            - heading "运行总览" [level=3] [ref=f3e450]
            - button "刷新运行记录" [ref=f3e451] [cursor=pointer]
          - paragraph [ref=f3e452]: 来自当前会话的统一编排；每两秒刷新
          - region "会话委派预算" [ref=f3e453]:
            - strong [ref=f3e454]: 会话委派预算
            - paragraph [ref=f3e455]: 已准入 1 轮 · 可核验 token 20 · 未知用量 1 轮 · 在途 0 轮
            - paragraph [ref=f3e456]: 已历时 0.02 分钟（含暂停与离线）
            - paragraph [ref=f3e457]: 当前限制：轮次 不限 · 总历时 不限 分钟 · token 不限
            - paragraph [ref=f3e458]: 仅统计本会话统一编排的子任务、团队和 Bot；总历时包含暂停与离线。token 在结算后核验，在途请求可能超额，未知用量不计为零。
            - group [ref=f3e459]:
              - generic "调整预算限制" [ref=f3e460]
          - article [ref=f3e461]:
            - strong [ref=f3e462]: scout
            - paragraph [ref=f3e463]: 类型 subagent · 执行代次 1
            - paragraph [ref=f3e464]: 执行完成
            - paragraph [ref=f3e465]: 已结算耗时：锁等待 0.00 秒 · 输入核验 0.00 秒 · 执行 0.50 秒 · 验收 0.00 秒
            - paragraph [ref=f3e466]: 普通委派任务 · 暂无宿主验收回执
            - paragraph [ref=f3e467]: 输入版本 0 · 产物版本 0
            - group [ref=f3e468]:
              - generic "已冻结交接：1 条正文 · 117 字节" [active] [ref=f3e469] [cursor=pointer]
              - paragraph [ref=f3e470]: 来源会话：d0d4acc4-ec2a-4d88-a04a-8b4691e7bb9c
              - code [ref=f3e471]: 113301b7b7dd48edf07e873cff78e406d46e1738a73d0de39cbee5b65e9736af
              - paragraph [ref=f3e472]: 仅包含选中的正文；不含工具结果、思考、图片或额外权限
              - generic [ref=f3e473]:
                - generic [ref=f3e474]: user · 8794c787
                - generic [ref=f3e475]: 早期约束：carbon 单位 mg/g；使用算术均值，只丢弃 NA，不能按降雨筛选。保留原始输入。
              - paragraph [ref=f3e476]: 路线仅是记录，不代表批准；历史版本尚未重新核验，不授予额外权限
              - paragraph [ref=f3e477]: 历史证据引用 1 项 · 交接总计 1077 字节
              - generic [ref=f3e478]:
                - text: 路线 1cb1bb0d-855b-4ee1-ac29-bda4b92a2a52 · 修订 1 · 步骤 S1
                - generic [ref=f3e479]: "{\"title\":\"演示分析路线\",\"goal\":\"通过真实工具演示逐步路线与生成产物；不证明科学分析质量\",\"dataContext\":[\"工程夹具，尚未提供科研输入\"],\"step\":{\"id\":\"S1\",\"title\":\"输入与 Alpha 多样性\",\"purpose\":\"核对输入并说明本步分析条件\",\"inputs\":[\"用户数据仍需核对\"],\"outputs\":[\"本步说明报告\"],\"dependencies\":[],\"cases\":[],\"blockers\":[],\"notes\":[]}}"
            - button "查看子任务过程" [ref=f3e480] [cursor=pointer]
          - group [ref=f3e481]:
            - generic "关键执行历史" [ref=f3e482]
        - paragraph [ref=f3e483]: 这段会话没有团队。对模型说「用团队分工做…」，或在输入框打 /team。
  - contentinfo "应用状态" [ref=f3e484]:
    - button "还没有填任何 API key，暂时不能对话——点这里填一个" [ref=f3e486] [cursor=pointer]
    - generic [ref=f3e487]:
      - generic [ref=f3e488]:
        - button "当前模型：deepseek-flash" [ref=f3e489] [cursor=pointer]:
          - generic [ref=f3e493]: deepseek-flash
        - button "R：未配置" [ref=f3e494] [cursor=pointer]:
          - generic [ref=f3e496]: R
          - generic [ref=f3e497]: 未配置
        - button "Python：未配置" [ref=f3e498] [cursor=pointer]:
          - generic [ref=f3e500]: Python
          - generic [ref=f3e501]: 未配置
      - generic [ref=f3e502]:
        - generic [ref=f3e503]:
          - button "插件 8" [ref=f3e504] [cursor=pointer]:
            - generic [ref=f3e507]: 插件
            - generic [ref=f3e508]: "8"
          - button "Skills 9" [ref=f3e509] [cursor=pointer]:
            - generic [ref=f3e513]: Skills
            - generic [ref=f3e514]: "9"
          - button "MCP 0" [ref=f3e515] [cursor=pointer]:
            - generic [ref=f3e518]: MCP
            - generic [ref=f3e519]: "0"
          - button "子 Agent 23" [ref=f3e520] [cursor=pointer]:
            - generic [ref=f3e523]: 子 Agent
            - generic [ref=f3e524]: "23"
        - button "版本 v0.0.44" [ref=f3e525] [cursor=pointer]: v0.0.44
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
  19 |  await expect(page.getByRole('button',{name:/scout 完成/})).toBeVisible({timeout:60000})
  20 |  await 进坞(page,'团队')
  21 |  const overview=page.getByRole('region',{name:'运行总览',exact:true})
  22 |  await expect(overview).toContainText('已冻结交接')
  23 |  await overview.locator('summary').filter({hasText:'已冻结交接'}).click()
> 24 |  await expect(overview.locator('pre')).toContainText('早期约束')
     |                                        ^ Error: expect(locator).toContainText(expected) failed
  25 |  await expect(overview).toContainText('历史版本尚未重新核验')
  26 |  await expect(overview).toContainText('步骤 S1')
  27 |  mkdirSync(output,{recursive:true});await page.screenshot({path:join(output,'early-evidence-handoff.png')})
  28 |  const sessions=join(workspace,'.dawn/sessions'),sid=readdirSync(sessions)[0]!,runs=join(sessions,sid,'subagents'),call=readdirSync(runs)[0]!,dir=join(runs,call,'0')
  29 |  const original=readFileSync(join(dir,'handoff.json'),'utf8'),capsule=JSON.parse(original)
  30 |  expect(capsule.version).toBe(2);expect(capsule.entries[0].text).toContain('早期约束');expect(capsule.entries[0].text).not.toContain('演示证据交接')
  31 |  await overview.getByRole('button',{name:'查看子任务过程',exact:true}).click()
  32 |  const pane=page.locator('.subagent-pane')
  33 |  await pane.getByRole('textbox',{name:'接着问它'}).fill('继续，沿用原背景，不增加权限。');await pane.getByRole('button',{name:'接着问',exact:true}).click()
  34 |  await expect(pane.locator('.subagent-message.user').filter({hasText:'继续，沿用原背景'})).toHaveCount(1)
  35 |  await expect(pane).not.toHaveAttribute('data-asking','1')
  36 |  expect(readFileSync(join(dir,'handoff.json'),'utf8')).toBe(original)
  37 |  const restarted=await dawn.重开()
  38 |  await restarted.getByRole('button',{name:/^早期约束/}).click()
  39 |  await 进坞(restarted,'团队')
  40 |  const restored=restarted.getByRole('region',{name:'运行总览',exact:true})
  41 |  await expect(restored).toContainText('已冻结交接');await restored.locator('summary').filter({hasText:'已冻结交接'}).click()
  42 |  await expect(restored.locator('pre')).toContainText('不能按降雨筛选')
  43 |  expect(readFileSync(join(dir,'handoff.json'),'utf8')).toBe(original)
  44 |  await restarted.screenshot({path:join(output,'recovered-evidence-handoff.png')})
  45 |  writeFileSync(join(output,'handoff-proof.json'),JSON.stringify({capsule,continuedUnchanged:true,restartedUnchanged:true,readOnlyScope:JSON.parse(readFileSync(join(dir,'meta.json'),'utf8')).settings.scope},null,2)+'\n')
  46 | })
  47 | 
```