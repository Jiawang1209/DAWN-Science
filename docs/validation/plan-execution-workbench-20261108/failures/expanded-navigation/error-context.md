# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: approved-plan-execution.spec.ts >> approved arrangement starts the frozen DAG, exposes real receipts and returns from the expanded view
- Location: e2e/approved-plan-execution.spec.ts:6:1

# Error details

```
Error: expect(locator).toHaveAttribute(expected) failed

Locator: getByRole('region', { name: '运行总览', exact: true }).getByRole('tab', { name: '过程', exact: true })
Expected: "true"
Timeout: 25000ms
Error: element(s) not found

Call log:
  - Expect "toHaveAttribute" with timeout 25000ms
  - waiting for getByRole('region', { name: '运行总览', exact: true }).getByRole('tab', { name: '过程', exact: true })

```

```yaml
- button "DAWN Science"
- button "收起侧边栏" [expanded]
- button "快捷键速查"
- tablist "同一处的会话":
  - tab "请为以下具体任务自动安排。先只读理解目标" [selected]
  - button "关掉「请为以下具体任务自动安排。先只读理解目标」（收进归档）"
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
          - button "请为以下具体任务自动安排。先只读理解目标 刚刚"
          - button "会话操作：请为以下具体任务自动安排。先只读理解目标": ⋯
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
    - group "会话操作：请为以下具体任务自动安排。先只读理解目标":
      - button "查找当前对话"
      - button "导出对话"
  - text: 你
  - paragraph: 请为以下具体任务自动安排。先只读理解目标、数据和已有会话约束，再用 propose_plan 的 arrangement 提交任务划分、分工、输入输出、依赖、验收与理由。
  - paragraph: 任务数量是方案结果，由实际任务决定；简单任务可以一块，不能固定拆成三块，也不要让用户预填数字。并行仅用于独立任务且不能共写；用户要求独立审阅时必须保留不同执行角色的审阅任务。缺信息放入 questions，不编造数据或启动执行。
  - paragraph: 任务目标： 清洗、建模并独立审阅 input.csv
  - paragraph: 原有冻结契约、证据、产物版本、预算、产物锁和恢复要求继续适用。请交可调整的方案，等待用户采纳；这次只规划，不写科研产物、不派子 Agent。
  - time: 2026-11-08 12:28
  - button "复制我说的这段"
  - button "修改"
  - button "回到这句之前"
  - text: DeepSeek
  - paragraph: 先提出任务划分，等待你调整或采纳。
  - button "复制这段回答"
  - region "方案第 1 版":
    - text: 方案 · 第 1 版 已批准 2026/11/8 12:28:32
    - heading "自动安排：完成当前数据任务" [level=3]
    - region "任务安排结果":
      - strong:
        - status "任务块数": 3 个任务块
      - text: 科研流水线
      - paragraph: 后一步依赖前一步的产物，审阅使用独立角色。
      - paragraph: 采纳后按这些任务、执行者和契约启动；当前仍为待执行方案。
      - list:
        - listitem:
          - strong: 核查并清洗数据
          - paragraph: 核查并清洗数据（本地自动安排夹具）
          - paragraph: 分工：数据核查员
          - paragraph: 执行者：data-engineer · 限定产物写入
          - text: 依赖：没有前置
          - group: 文件与验收条件
        - listitem:
          - strong: 根据清洗结果建模
          - paragraph: 根据清洗结果建模（本地自动安排夹具）
          - paragraph: 分工：统计分析员
          - paragraph: 执行者：data-engineer · 限定产物写入
          - text: 依赖：核查并清洗数据
          - group: 文件与验收条件
        - listitem:
          - strong: 独立审阅模型与证据
          - text: 独立审阅
          - paragraph: 独立审阅模型与证据（本地自动安排夹具）
          - paragraph: 分工：独立审阅员
          - paragraph: 执行者：reviewer-two · 只读
          - text: 依赖：根据清洗结果建模
          - group: 文件与验收条件
    - heading "问题与假设" [level=2]
    - paragraph: 按用户目标安排任务，先规划、不执行。
    - heading "数据与切分" [level=2]
    - paragraph: input.csv clean.csv model.csv
    - heading "统计检验与模型" [level=2]
    - paragraph: 后一步依赖前一步的产物，审阅使用独立角色。
    - heading "图" [level=2]
    - paragraph: 按用户需要决定，不自动增加图形任务。
    - heading "产物" [level=2]
    - paragraph:
      - code: clean.csv
      - code: model.csv
    - button "看全文"
    - paragraph: 任务与执行者已冻结；重复开始不会重放已有执行。中断后请先核对产物。
    - button "开始或继续未执行任务"
    - button "打开方案文件"
    - code: analysis/plans/2026-11-08-自动安排-完成当前数据任务.md
    - paragraph: 对照：计划的产物 2 项 · 已生成 0 · 计划外 0
    - button "看清单"
  - text: 子 agent 3/3
  - button "✓ member_1 · plan_1 完成"
  - button "✓ member_2 · plan_2 完成"
  - button "✓ member_3 · plan_3 完成"
  - button "回到底部"
  - button "工作目录：/var/folders/2t/y0qcl9r50cv427189l7px1000000gn/T/dawn-e2e-G6dVTd/workspace": workspace
  - text: 本机
  - textbox "检查缺失值并说明处理方法"
  - button "添加内容"
  - button "终端面板"
  - button "完全访问"
  - button "上下文 —": —
  - button "当前模型：deepseek-flash。点击切换": deepseek-flash
  - button "发送"
- complementary "团队":
  - separator "调整面板宽度"
  - tablist "面板":
    - tab "文件"
    - tab "产物": 产物 2
    - tab "笔记本"
    - tab "路线"
    - tab "审阅"
    - tab "团队" [selected]
  - button "更多面板": ⋯
  - button "关闭面板"
  - group: 团队管理与原始记录
- contentinfo "应用状态":
  - button "还没有填任何 API key，暂时不能对话——点这里填一个"
  - button "当前模型：deepseek-flash": deepseek-flash
  - button "R：未配置": R 未配置
  - button "Python：未配置": Python 未配置
  - button "插件 8"
  - button "Skills 9"
  - button "MCP 0"
  - button "子 Agent 22"
  - button "版本 v0.0.44": v0.0.44
- dialog "流程工作台":
  - region "运行总览":
    - text: 对话协作台
    - heading "流程工作台" [level=3]
    - button "刷新运行记录"
    - region "协作成果":
      - heading "执行已批准任务安排" [level=3]
      - heading "本轮成果已验收" [level=4]
      - group: 展开成果版本与检查入口
      - paragraph: 执行轮次未设上限 · 审阅预留未启用 · 在途 0 · 费用未记录
      - button "返回对话协作台" [expanded]
    - paragraph: 来自当前会话的统一编排；每两秒刷新
    - strong: 3 项任务
    - text: 3 项验收通过 0 项活跃 3 项执行完成 可核验 token 0 · 未知用量 3 轮 费用未记录
    - region "批准方案执行进度":
      - strong: 批准方案执行进度
      - text: 第 1 版
      - paragraph: 计划 3 项 · 已启动 3 项
      - list:
        - listitem:
          - button "核查并清洗数据 member_1 · clean 宿主验收通过":
            - strong: 核查并清洗数据
            - text: member_1 · clean 宿主验收通过
        - listitem:
          - button "根据清洗结果建模 member_2 · model 宿主验收通过":
            - strong: 根据清洗结果建模
            - text: member_2 · model 宿主验收通过
        - listitem:
          - button "独立审阅模型与证据 member_3 · review 宿主验收通过":
            - strong: 独立审阅模型与证据
            - text: member_3 · review 宿主验收通过
    - region "流程工作台":
      - heading "Agent 网络" [level=4]
      - text: 宿主与直接委派关系 · 点击节点联动
      - paragraph: 连线表示直接委派；任务依赖另列于下方
      - text: 当前会话
      - strong: 主助手
      - text: 直接编排 3 项执行 拆解 · 派发 · 汇总
      - button "网络节点：data-engineer":
        - strong: data-engineer
        - text: 当前上下文 未知 已结算累计 输入或输出未记录 执行完成 累计结算 0.6 秒
      - button "网络节点：data-engineer":
        - strong: data-engineer
        - text: 当前上下文 未知 已结算累计 输入或输出未记录 执行完成 累计结算 0.6 秒
      - button "网络节点：reviewer-two":
        - strong: reviewer-two
        - text: 当前上下文 未知 已结算累计 输入或输出未记录 执行完成 累计结算 0.6 秒
      - heading "编队成员" [level=4]
      - text: 3 项任务
      - searchbox "搜索协作成员"
      - group "成员状态筛选":
        - button "显示全部成员" [pressed]
        - button "只看活跃成员"
        - button "只看已结束"
      - button "data-engineer":
        - strong: data-engineer
        - text: 执行完成 团队成员 当前上下文 未知 已结算累计 输入或输出未记录 累计结算 0.6 秒
      - button "data-engineer":
        - strong: data-engineer
        - text: 执行完成 团队成员 当前上下文 未知 已结算累计 输入或输出未记录 累计结算 0.6 秒
      - button "reviewer-two":
        - strong: reviewer-two
        - text: 执行完成 团队成员 当前上下文 未知 已结算累计 输入或输出未记录 累计结算 0.6 秒
      - heading "任务依赖" [level=4]
      - paragraph: 连线仅表示任务声明的前置关系；成员执行记录不与任务代次混用。
      - button "核查并清洗数据":
        - strong: 核查并清洗数据
        - text: 第 1 次
      - button "根据清洗结果建模" [pressed]:
        - strong: 根据清洗结果建模
        - text: 第 1 次
      - button "独立审阅模型与证据":
        - strong: 独立审阅模型与证据
        - text: 第 1 次
    - region "自动安排":
      - heading "自动安排" [level=4]
      - paragraph: 方案第 1 版 · 已批准
      - region "任务安排结果":
        - strong:
          - status "任务块数": 3 个任务块
        - text: 科研流水线
        - paragraph: 后一步依赖前一步的产物，审阅使用独立角色。
        - paragraph: 采纳后按这些任务、执行者和契约启动；当前仍为待执行方案。
        - list:
          - listitem:
            - strong: 核查并清洗数据
            - paragraph: 核查并清洗数据（本地自动安排夹具）
            - paragraph: 分工：数据核查员
            - paragraph: 执行者：data-engineer · 限定产物写入
            - text: 依赖：没有前置
            - group: 文件与验收条件
          - listitem:
            - strong: 根据清洗结果建模
            - paragraph: 根据清洗结果建模（本地自动安排夹具）
            - paragraph: 分工：统计分析员
            - paragraph: 执行者：data-engineer · 限定产物写入
            - text: 依赖：核查并清洗数据
            - group: 文件与验收条件
          - listitem:
            - strong: 独立审阅模型与证据
            - text: 独立审阅
            - paragraph: 独立审阅模型与证据（本地自动安排夹具）
            - paragraph: 分工：独立审阅员
            - paragraph: 执行者：reviewer-two · 只读
            - text: 依赖：根据清洗结果建模
            - group: 文件与验收条件
      - group: 调整任务与分工
      - paragraph: 可在对话中的方案卡修改并采纳，或补充调整要求后重新安排。
      - paragraph: 先出方案期间只读查看；采纳后才进入原有执行与验收流程。
    - group: 查看额度
    - group: 会话完整执行记录
```

# Test source

```ts
  1  | import {mkdirSync,writeFileSync,readFileSync} from 'node:fs'
  2  | import {join,resolve} from 'node:path'
  3  | import {test,expect,在项目里开会话,进坞} from './fixtures.js'
  4  | const out=resolve(process.env.DAWN_APPROVED_PLAN_EVIDENCE_DIR??'docs/validation/plan-execution-workbench-20261108/desktop')
  5  | test.use({dawnOptions:{gitInit:true}})
  6  | test('approved arrangement starts the frozen DAG, exposes real receipts and returns from the expanded view',async({dawn})=>{
  7  |  const{page,workspace}=dawn;mkdirSync(out,{recursive:true})
  8  |  writeFileSync(join(workspace,'input.csv'),'x\n1\n2\n3\n')
  9  |  await page.evaluate(()=>localStorage.setItem('dawn.global.theme','dark'));await page.reload()
  10 |  await 在项目里开会话(page);await 进坞(page,'团队')
  11 |  const auto=page.getByRole('region',{name:'自动安排',exact:true})
  12 |  await auto.getByRole('textbox',{name:'任务目标',exact:true}).fill('清洗、建模并独立审阅 input.csv')
  13 |  await auto.getByRole('button',{name:'生成安排',exact:true}).click()
  14 |  await expect(auto.getByRole('status',{name:'任务块数',exact:true})).toHaveText('3 个任务块')
  15 |  await expect(auto).toContainText('限定产物写入')
  16 |  await auto.locator('.task-arrangement-result').screenshot({path:join(out,'stage-a-frozen-proposal.png')})
  17 |  const card=page.locator('main.main .plan-card')
  18 |  await card.getByRole('button',{name:'照这个做',exact:true}).click()
  19 |  await expect(card).toHaveAttribute('data-status','approved')
  20 |  let overview=page.getByRole('region',{name:'运行总览',exact:true})
  21 |  let progress=overview.getByRole('region',{name:'批准方案执行进度',exact:true})
  22 |  await expect(progress).toContainText('计划 3 项 · 已启动 3 项')
  23 |  await expect(progress.getByText('宿主验收通过',{exact:true})).toHaveCount(3)
  24 |  expect(readFileSync(join(workspace,'input.csv'),'utf8')).toBe('x\n1\n2\n3\n')
  25 |  const before=dawn.requests.length
  26 |  await card.getByRole('button',{name:'开始或继续未执行任务',exact:true}).click()
  27 |  await expect(card.getByRole('button',{name:'开始或继续未执行任务',exact:true})).toBeEnabled()
  28 |  expect(dawn.requests.length).toBe(before)
  29 |  await progress.scrollIntoViewIfNeeded();await page.screenshot({path:join(out,'stage-b-executed.png')})
  30 |  await overview.getByRole('button',{name:'展开流程工作台',exact:true}).click()
  31 |  progress=overview.getByRole('region',{name:'批准方案执行进度',exact:true})
  32 |  await progress.getByRole('button',{name:/根据清洗结果建模/}).click()
> 33 |  await expect(overview.getByRole('tab',{name:'过程',exact:true})).toHaveAttribute('aria-selected','true')
     |                                                                 ^ Error: expect(locator).toHaveAttribute(expected) failed
  34 |  await overview.getByRole('tab',{name:'记录',exact:true}).click()
  35 |  await expect(overview.locator('.collaboration-detail')).toContainText('工具记录')
  36 |  await page.screenshot({path:join(out,'stage-c-task-records.png')})
  37 |  await overview.getByRole('button',{name:'收起检查面板',exact:true}).click()
  38 |  await page.screenshot({path:join(out,'stage-c-workflow.png')})
  39 |  await overview.getByRole('button',{name:'返回对话协作台',exact:true}).click()
  40 |  await expect(page.getByRole('dialog',{name:'流程工作台',exact:true})).toHaveCount(0)
  41 |  await expect(overview.getByRole('tab',{name:'记录',exact:true})).toHaveAttribute('aria-selected','true')
  42 |  const reopened=await dawn.重开()
  43 |  await reopened.getByRole('button',{name:/^请为以下具体任务自动安排/}).click();await 进坞(reopened,'团队')
  44 |  overview=reopened.getByRole('region',{name:'运行总览',exact:true})
  45 |  await expect(overview.getByRole('region',{name:'批准方案执行进度',exact:true}).getByText('宿主验收通过',{exact:true})).toHaveCount(3)
  46 |  await reopened.screenshot({path:join(out,'stage-c-restored.png')})
  47 | })
  48 | 
```