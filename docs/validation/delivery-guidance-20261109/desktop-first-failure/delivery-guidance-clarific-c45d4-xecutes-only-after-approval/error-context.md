# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: delivery-guidance.spec.ts >> clarification survives restart, creates a new proposal and executes only after approval
- Location: e2e/delivery-guidance.spec.ts:6:1

# Error details

```
TimeoutError: locator.click: Timeout 30000ms exceeded.
Call log:
  - waiting for getByRole('region', { name: '自动安排', exact: true }).getByRole('button', { name: '补充后重新规划', exact: true })
    - locator resolved to <button disabled type="button" class="btn btn-primary btn-sm">补充后重新规划</button>
  - attempting click action
    2 × waiting for element to be visible, enabled and stable
      - element is not enabled
    - retrying click action
    - waiting 20ms
    2 × waiting for element to be visible, enabled and stable
      - element is not enabled
    - retrying click action
      - waiting 100ms
    58 × waiting for element to be visible, enabled and stable
       - element is not enabled
     - retrying click action
       - waiting 500ms

```

# Page snapshot

```yaml
- generic [ref=f2e3]:
  - generic [ref=f2e4]:
    - generic [ref=f2e5]:
      - button "DAWN Science" [ref=f2e7] [cursor=pointer]
      - button "收起侧边栏" [expanded] [ref=f2e10] [cursor=pointer]
      - button "快捷键速查" [ref=f2e13] [cursor=pointer]
    - generic [ref=f2e17]:
      - tablist "同一处的会话" [ref=f2e21]:
        - generic [ref=f2e22]:
          - tab "请为以下具体任务自动安排。先只读理解目标" [selected] [ref=f2e23] [cursor=pointer]
          - button "关掉「请为以下具体任务自动安排。先只读理解目标」（收进归档）" [ref=f2e26] [cursor=pointer]
        - button "在这里再开一段" [ref=f2e29] [cursor=pointer]
      - generic:
        - banner
    - button "面板：团队" [expanded] [ref=f2e33] [cursor=pointer]
  - generic [ref=f2e34]:
    - complementary [ref=f2e35]:
      - button "新建任务" [ref=f2e37] [cursor=pointer]
      - separator [ref=f2e42]
      - generic [ref=f2e43]:
        - generic [ref=f2e44]: 工作区
        - generic [ref=f2e45]:
          - button "搜索" [ref=f2e46] [cursor=pointer]
          - button "添加工作区文件夹" [ref=f2e49] [cursor=pointer]
      - generic [ref=f2e53]:
        - paragraph [ref=f2e54]:
          - button "项目 1" [expanded] [ref=f2e55] [cursor=pointer]:
            - generic [ref=f2e60]: 项目
            - generic [ref=f2e61]: "1"
          - button "多选项目" [ref=f2e62] [cursor=pointer]: 多选
        - list [ref=f2e63]:
          - listitem [ref=f2e64]:
            - generic [ref=f2e65]:
              - button "workspace" [ref=f2e66] [cursor=pointer]
              - generic [ref=f2e75]:
                - button "在「workspace」里开一段新对话" [ref=f2e76] [cursor=pointer]
                - button "项目操作：workspace" [ref=f2e80] [cursor=pointer]: ⋯
            - list [ref=f2e81]:
              - listitem [ref=f2e82]:
                - button "请为以下具体任务自动安排。先只读理解目标 刚刚" [ref=f2e83]:
                  - generic [ref=f2e84]: 请为以下具体任务自动安排。先只读理解目标
                  - generic [ref=f2e88]: 刚刚
                - button "会话操作：请为以下具体任务自动安排。先只读理解目标" [ref=f2e90] [cursor=pointer]: ⋯
        - region "服务器" [ref=f2e91]:
          - generic [ref=f2e92]:
            - button "服务器" [expanded] [ref=f2e93] [cursor=pointer]
            - button "添加服务器" [ref=f2e102] [cursor=pointer]
          - paragraph [ref=f2e105]: 还没有服务器
      - generic [ref=f2e106]:
        - button "定时" [ref=f2e107] [cursor=pointer]
        - button "设置" [ref=f2e112] [cursor=pointer]
    - separator "调整侧栏宽度" [ref=f2e116]
    - main [ref=f2e117]:
      - generic [ref=f2e118]:
        - toolbar "会话工具栏" [ref=f2e119]:
          - group "会话操作：请为以下具体任务自动安排。先只读理解目标" [ref=f2e121]:
            - button "查找当前对话" [ref=f2e123] [cursor=pointer]
            - button "导出对话" [ref=f2e127] [cursor=pointer]
        - generic [ref=f2e132]:
          - generic [ref=f2e133]:
            - generic [ref=f2e134]: 你
            - generic [ref=f2e136]:
              - generic [ref=f2e139]:
                - paragraph [ref=f2e140]: 请为以下具体任务自动安排。先只读理解目标、数据和已有会话约束，再用 propose_plan 的 arrangement 提交任务划分、分工、输入输出、依赖、验收与理由。
                - paragraph [ref=f2e141]: 任务数量是方案结果，由实际任务决定；简单单结果任务优先一个任务块，不能固定拆成三块，也不要让用户预填数字。只有依赖、独立输入、权限边界或明确审阅要求才增加分工；请在理由里解释额外分工的实际作用。并行仅用于独立任务且不能共写；用户要求独立审阅时必须保留不同执行角色的审阅任务。缺信息放入 questions，不编造数据或启动执行。
                - paragraph [ref=f2e142]: 任务目标： 计算 input.csv 均值，单位未提供
                - paragraph [ref=f2e143]: 原有冻结契约、证据、产物版本、预算、产物锁和恢复要求继续适用。请交可调整的方案，等待用户采纳；这次只规划，不写科研产物、不派子 Agent。
              - generic [ref=f2e144]:
                - time [ref=f2e145]: 2026-11-09 04:34
                - button "复制我说的这段" [ref=f2e146] [cursor=pointer]
                - button "修改" [ref=f2e152] [cursor=pointer]
                - button "回到这句之前" [ref=f2e156] [cursor=pointer]
          - generic [ref=f2e159]:
            - generic [ref=f2e160]:
              - generic [ref=f2e161]: D
              - generic [ref=f2e162]: DeepSeek
            - generic [ref=f2e163]:
              - paragraph [ref=f2e167]: 先提出任务划分，等待你调整或采纳。
              - button "复制这段回答" [ref=f2e169] [cursor=pointer]
          - region "方案第 1 版" [ref=f2e175]:
            - generic [ref=f2e176]:
              - generic [ref=f2e177]: 方案 · 第 1 版
              - generic [ref=f2e180]: 等你看
            - heading "自动安排：完成当前数据任务" [level=3] [ref=f2e181]
            - region "任务安排结果" [ref=f2e182]:
              - generic [ref=f2e183]:
                - strong [ref=f2e184]:
                  - status "任务块数" [ref=f2e185]: 1 个任务块
                - generic [ref=f2e186]: 单任务
              - paragraph [ref=f2e187]: 先确认输入单位，避免猜测。
              - paragraph [ref=f2e188]: 等待补充信息；当前方案不能执行。
              - list [ref=f2e189]:
                - listitem [ref=f2e190]:
                  - strong [ref=f2e192]: 确认数据口径
                  - paragraph [ref=f2e193]: 确认数据口径（本地自动安排夹具）
                  - paragraph [ref=f2e194]:
                    - generic [ref=f2e195]: 分工：
                    - text: 数据核查员
                  - paragraph [ref=f2e196]:
                    - generic [ref=f2e197]: 执行者：
                    - text: data-engineer
                    - generic [ref=f2e198]: · 只读
                  - generic [ref=f2e199]: 依赖：没有前置
                  - group [ref=f2e200]:
                    - generic "文件与验收条件" [ref=f2e201]
              - heading "待确认事项" [level=4] [ref=f2e202]
              - list [ref=f2e203]:
                - listitem [ref=f2e204]: input.csv 中 x 的单位是什么？
            - alert [ref=f2e205]: 请先补齐待确认项，再更新并采纳任务安排
            - generic [ref=f2e208]:
              - heading "问题与假设" [level=2] [ref=f2e209]
              - paragraph [ref=f2e210]: 按用户目标安排任务，先规划、不执行。
              - heading "数据与切分" [level=2] [ref=f2e211]
              - paragraph [ref=f2e212]: input.csv
              - heading "统计检验与模型" [level=2] [ref=f2e213]
              - paragraph [ref=f2e214]: 先确认输入单位，避免猜测。
              - heading "图" [level=2] [ref=f2e215]
              - paragraph [ref=f2e216]: 按用户需要决定，不自动增加图形任务。
              - heading "产物" [level=2] [ref=f2e217]
            - button "看全文" [ref=f2e218] [cursor=pointer]
            - generic [ref=f2e219]:
              - button "照这个做" [disabled] [ref=f2e220]
              - button "改一改" [ref=f2e221] [cursor=pointer]
              - button "不做了" [ref=f2e222] [cursor=pointer]
            - paragraph [ref=f2e223]: 想让它重写：直接在下面说，它会交新的一版。
        - generic [ref=f2e225]:
          - generic [ref=f2e226]:
            - button "工作目录：/var/folders/2t/y0qcl9r50cv427189l7px1000000gn/T/dawn-e2e-uYGnNG/workspace" [ref=f2e228] [cursor=pointer]:
              - generic [ref=f2e231]: workspace
            - generic [ref=f2e234]: 本机
          - status [ref=f2e238]: 先出方案 · 这一段只看不改，方案批了才动手（再按一下「先出方案」退出）
          - textbox "检查缺失值并说明处理方法" [ref=f2e241]
          - generic [ref=f2e242]:
            - generic [ref=f2e243]:
              - button "添加内容" [ref=f2e245] [cursor=pointer]
              - button "终端面板" [ref=f2e248] [cursor=pointer]
              - button "完全访问" [ref=f2e252] [cursor=pointer]
            - generic [ref=f2e257]:
              - button "上下文 —" [ref=f2e259] [cursor=pointer]: —
              - button "当前模型：deepseek-flash。点击切换" [ref=f2e264] [cursor=pointer]:
                - generic [ref=f2e268]: deepseek-flash
              - button "发送" [ref=f2e271] [cursor=pointer]
    - complementary "团队" [ref=f2e274]:
      - separator "调整面板宽度" [ref=f2e275]
      - generic [ref=f2e276]:
        - tablist "面板" [ref=f2e277]:
          - tab "文件" [ref=f2e278] [cursor=pointer]
          - tab "产物" [ref=f2e279] [cursor=pointer]
          - tab "笔记本" [ref=f2e280] [cursor=pointer]
          - tab "路线" [ref=f2e281] [cursor=pointer]
          - tab "审阅" [ref=f2e282] [cursor=pointer]
          - tab "团队" [selected] [ref=f2e283] [cursor=pointer]
          - tab "Bot" [ref=f2e284] [cursor=pointer]
        - button "更多面板" [ref=f2e286] [cursor=pointer]: ⋯
        - button "关闭面板" [ref=f2e287] [cursor=pointer]
      - region "运行总览" [ref=f2e292]:
        - generic [ref=f2e293]:
          - generic [ref=f2e294]:
            - text: 对话协作台
            - heading "协作" [level=3] [ref=f2e295]
          - button "刷新运行记录" [ref=f2e297] [cursor=pointer]
        - region "自动安排" [ref=f2e298]:
          - heading "自动安排" [level=4] [ref=f2e299]
          - paragraph [ref=f2e300]: 方案第 1 版 · 等你看
          - region "补充待确认信息" [ref=f2e301]:
            - generic [ref=f2e302]:
              - strong [ref=f2e303]: 等待补充信息
              - generic [ref=f2e304]: 方案第 1 版
            - paragraph [ref=f2e305]: 补齐后先生成新方案，原方案不会直接执行。
            - generic [ref=f2e306]:
              - generic [ref=f2e307]: input.csv 中 x 的单位是什么？
              - textbox "问题 1 的回答" [active] [ref=f2e308]: mg/g
            - button "补充后重新规划" [disabled] [ref=f2e309]
          - region "任务安排结果" [ref=f2e310]:
            - generic [ref=f2e311]:
              - strong [ref=f2e312]:
                - status "任务块数" [ref=f2e313]: 1 个任务块
              - generic [ref=f2e314]: 单任务
            - paragraph [ref=f2e315]: 先确认输入单位，避免猜测。
            - paragraph [ref=f2e316]: 等待补充信息；当前方案不能执行。
            - list [ref=f2e317]:
              - listitem [ref=f2e318]:
                - strong [ref=f2e320]: 确认数据口径
                - paragraph [ref=f2e321]: 确认数据口径（本地自动安排夹具）
                - paragraph [ref=f2e322]:
                  - generic [ref=f2e323]: 分工：
                  - text: 数据核查员
                - paragraph [ref=f2e324]:
                  - generic [ref=f2e325]: 执行者：
                  - text: data-engineer
                  - generic [ref=f2e326]: · 只读
                - generic [ref=f2e327]: 依赖：没有前置
                - group [ref=f2e328]:
                  - generic "文件与验收条件" [ref=f2e329] [cursor=pointer]
          - group [ref=f2e330]:
            - generic "调整任务与分工" [ref=f2e331] [cursor=pointer]
          - paragraph [ref=f2e332]: 可在对话中的方案卡修改并采纳，或补充调整要求后重新安排。
          - paragraph [ref=f2e333]: 先出方案期间只读查看；采纳后才进入原有执行与验收流程。
        - region "协作成果" [ref=f2e334]:
          - generic [ref=f2e335]:
            - generic [ref=f2e336]: 任务目标
            - heading "本会话协作" [level=3] [ref=f2e337]
          - generic [ref=f2e338]:
            - heading "当前成果尚未核验" [level=4] [ref=f2e339]
            - paragraph [ref=f2e340]: 保留的记录不作为本轮验收通过。
          - generic [ref=f2e341]:
            - generic [ref=f2e342]: 下一步 · 查看会话执行记录
            - button "查看会话执行记录" [ref=f2e343] [cursor=pointer]
          - group [ref=f2e344]:
            - generic "成果版本与执行额度" [ref=f2e345] [cursor=pointer]
          - button "展开流程工作台" [ref=f2e347] [cursor=pointer]
        - paragraph [ref=f2e348]: 来自当前会话的统一编排；每两秒刷新
        - generic [ref=f2e349]:
          - paragraph [ref=f2e350]: 这段会话暂无子任务运行记录
          - paragraph [ref=f2e351]: 这段会话没有团队。对模型说「用团队分工做…」，或在输入框打 /team。
        - generic [ref=f2e352]:
          - group [ref=f2e353]:
            - generic "查看额度" [ref=f2e354] [cursor=pointer]
          - group [ref=f2e355]:
            - generic "会话完整执行记录" [ref=f2e356] [cursor=pointer]
  - contentinfo "应用状态" [ref=f2e357]:
    - button "还没有填任何 API key，暂时不能对话——点这里填一个" [ref=f2e359] [cursor=pointer]
    - generic [ref=f2e360]:
      - generic [ref=f2e361]:
        - button "当前模型：deepseek-flash" [ref=f2e362] [cursor=pointer]:
          - generic [ref=f2e366]: deepseek-flash
        - button "R：未配置" [ref=f2e367] [cursor=pointer]:
          - generic [ref=f2e369]: R
          - generic [ref=f2e370]: 未配置
        - button "Python：未配置" [ref=f2e371] [cursor=pointer]:
          - generic [ref=f2e373]: Python
          - generic [ref=f2e374]: 未配置
      - generic [ref=f2e375]:
        - generic [ref=f2e376]:
          - button "插件 8" [ref=f2e377] [cursor=pointer]:
            - generic [ref=f2e380]: 插件
            - generic [ref=f2e381]: "8"
          - button "Skills 9" [ref=f2e382] [cursor=pointer]:
            - generic [ref=f2e386]: Skills
            - generic [ref=f2e387]: "9"
          - button "MCP 0" [ref=f2e388] [cursor=pointer]:
            - generic [ref=f2e391]: MCP
            - generic [ref=f2e392]: "0"
          - button "子 Agent 22" [ref=f2e393] [cursor=pointer]:
            - generic [ref=f2e396]: 子 Agent
            - generic [ref=f2e397]: "22"
        - button "版本 v0.0.44" [ref=f2e398] [cursor=pointer]: v0.0.44
```

# Test source

```ts
  1  | import {mkdirSync,writeFileSync,readFileSync,existsSync} from 'node:fs'
  2  | import {resolve,join} from 'node:path'
  3  | import {test,expect,在项目里开会话,进坞} from './fixtures.js'
  4  | const out=resolve('docs/validation/delivery-guidance-20261109/desktop')
  5  | test.use({dawnOptions:{gitInit:true}})
  6  | test('clarification survives restart, creates a new proposal and executes only after approval',async({dawn})=>{
  7  |  let{page}=dawn;const{workspace}=dawn;mkdirSync(out,{recursive:true});writeFileSync(join(workspace,'input.csv'),'x\n1\n2\n3\n')
  8  |  await 在项目里开会话(page);await 进坞(page,'团队')
  9  |  let auto=page.getByRole('region',{name:'自动安排',exact:true})
  10 |  await auto.getByRole('textbox',{name:'任务目标',exact:true}).fill('计算 input.csv 均值，单位未提供')
  11 |  await auto.getByRole('button',{name:'生成安排',exact:true}).click()
  12 |  await expect(auto.getByRole('region',{name:'补充待确认信息',exact:true})).toBeVisible()
  13 |  await expect(page.locator('main.main .plan-card').getByRole('button',{name:'照这个做',exact:true})).toBeDisabled()
  14 |  expect(existsSync(join(workspace,'mean.csv'))).toBe(false)
  15 |  await auto.getByRole('region',{name:'补充待确认信息',exact:true}).screenshot({path:join(out,'stage-b-awaiting-info.png')})
  16 |  page=await dawn.重开();await page.getByRole('button',{name:/^请为以下具体任务自动安排/}).click();await 进坞(page,'团队')
  17 |  auto=page.getByRole('region',{name:'自动安排',exact:true})
  18 |  await expect(auto.getByRole('textbox',{name:'问题 1 的回答',exact:true})).toBeVisible()
  19 |  await auto.getByRole('textbox',{name:'问题 1 的回答',exact:true}).fill('mg/g')
> 20 |  await auto.getByRole('button',{name:'补充后重新规划',exact:true}).click()
     |                                                             ^ TimeoutError: locator.click: Timeout 30000ms exceeded.
  21 |  await expect(auto).toContainText('方案第 2 版')
  22 |  await expect(auto.getByRole('region',{name:'补充待确认信息',exact:true})).toHaveCount(0)
  23 |  expect(existsSync(join(workspace,'mean.csv'))).toBe(false)
  24 |  await auto.locator('.task-arrangement-result').screenshot({path:join(out,'stage-b-new-proposal.png')})
  25 |  await page.locator('main.main .plan-card[data-status="proposed"]').getByRole('button',{name:'照这个做',exact:true}).click()
  26 |  const overview=page.getByRole('region',{name:'运行总览',exact:true})
  27 |  await expect(overview.getByRole('region',{name:'批准方案执行进度',exact:true}).getByText('宿主验收通过',{exact:true})).toHaveCount(1)
  28 |  const outcome=overview.getByRole('region',{name:'协作成果',exact:true})
  29 |  await expect(outcome).toHaveAttribute('data-outcome','accepted')
  30 |  await expect(outcome.getByRole('button',{name:'查看验收成果',exact:true})).toBeVisible()
  31 |  await outcome.screenshot({path:join(out,'stage-c-summary.png')})
  32 |  await outcome.getByText('成果版本与执行额度',{exact:true}).click()
  33 |  await expect(outcome.getByRole('button',{name:/^mean.csv/})).toBeVisible()
  34 |  await outcome.screenshot({path:join(out,'stage-c-versions.png')})
  35 |  await overview.getByRole('button',{name:'展开流程工作台',exact:true}).click()
  36 |  await expect(page.getByRole('dialog',{name:'流程工作台',exact:true})).toBeVisible()
  37 |  await page.screenshot({path:join(out,'stage-c-expanded.png')})
  38 |  await page.keyboard.press('Escape');await expect(overview.getByRole('button',{name:'展开流程工作台',exact:true})).toBeVisible()
  39 |  expect(readFileSync(join(workspace,'input.csv'),'utf8')).toBe('x\n1\n2\n3\n')
  40 |  writeFileSync(join(out,'clarification-requests.json'),JSON.stringify({requests:dawn.requests.length,realModelRequests:0,workspace,reviewedPath:'mean.csv',restarted:true,expandedReturn:true},null,2))
  41 | })
  42 | 
```