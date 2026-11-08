# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: task-arrangement-layout.spec.ts >> preserves long task identities and expanded paths in a narrow real Electron view
- Location: e2e/task-arrangement-layout.spec.ts:10:1

# Error details

```
Error: expect(locator).toHaveText(expected) failed

Locator: getByRole('region', { name: '自动安排', exact: true }).getByRole('status', { name: '任务块数', exact: true })
Expected: "1 个任务块"
Timeout: 25000ms
Error: element(s) not found

Call log:
  - Expect "toHaveText" with timeout 25000ms
  - waiting for getByRole('region', { name: '自动安排', exact: true }).getByRole('status', { name: '任务块数', exact: true })

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
  - toolbar "会话工具栏":
    - group "会话操作：请为以下具体任务自动安排。先只读理解目标":
      - button "查找当前对话"
      - button "导出对话"
  - text: 你
  - paragraph: 请为以下具体任务自动安排。先只读理解目标、数据和已有会话约束，再用 propose_plan 的 arrangement 提交任务划分、分工、输入输出、依赖、验收与理由。
  - paragraph: 任务数量是方案结果，由实际任务决定；简单单结果任务优先一个任务块，不能固定拆成三块，也不要让用户预填数字。只有依赖、独立输入、权限边界或明确审阅要求才增加分工；请在理由里解释额外分工的实际作用。并行仅用于独立任务且不能共写；用户要求独立审阅时必须保留不同执行角色的审阅任务。缺信息放入 questions，不编造数据或启动执行。
  - paragraph: 任务目标： 长路径布局验收：先提出单任务方案，等待我确认，不执行。
  - paragraph: 原有冻结契约、证据、产物版本、预算、产物锁和恢复要求继续适用。请交可调整的方案，等待用户采纳；这次只规划，不写科研产物、不派子 Agent。
  - time: 2026-11-08 22:29
  - button "复制我说的这段"
  - button "修改"
  - button "回到这句之前"
  - button "已完成 1 步" [expanded]
  - button "✗ propose_plan 失败" [expanded]
  - button "复制这段输出"
  - text: 自动安排需要可执行绑定：dispatch=team-v1，并为每项提供名册中的 agent 和冻结 contract。 DeepSeek
  - paragraph: 假模型已应答：DAWN 的整条链路是通的。
  - button "复制这段回答"
  - paragraph: 输入 12 · 输出 8 · 缓存 0 token
  - button "工作目录：/var/folders/2t/y0qcl9r50cv427189l7px1000000gn/T/dawn-e2e-GhwnmL/workspace": workspace
  - text: 本机
  - status: 先出方案 · 这一段只看不改，方案批了才动手（再按一下「先出方案」退出）
  - textbox "检查缺失值并说明处理方法"
  - button "添加内容"
  - button "终端面板"
  - button "完全访问"
  - button "上下文 <1%": <1%
  - button "当前模型：deepseek-flash。点击切换": deepseek-flash
  - button "发送"
  - text: 1 轮 · 工具 1 次 · 输入 12 · 输出 8 · 缓存 0 · 命中 0%
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
    - button "刷新运行记录"
    - region "自动安排":
      - heading "自动安排" [level=4]
      - paragraph: 描述具体任务，DAWN 会根据目标、数据和依赖决定怎样拆分与分工。无需预先填写任务数量。
      - text: 任务目标
      - textbox "任务目标": 长路径布局验收：先提出单任务方案，等待我确认，不执行。
      - text: 调整要求（可选）
      - textbox "调整要求（可选）":
        - /placeholder: 例如：合并前两步，保留独立审阅
      - button "生成安排"
      - paragraph: 先出方案期间只读查看；采纳后才进入原有执行与验收流程。
      - alert: 本轮没有提交新的有效任务安排，请查看对话中的原因后重试。
    - region "协作成果":
      - text: 任务目标
      - heading "本会话协作" [level=3]
      - heading "当前成果尚未核验" [level=4]
      - paragraph: 窄面板显示摘要；展开可查看完整目标和成果版本。
      - button "展开流程工作台"
    - paragraph: 来自当前会话的统一编排；每两秒刷新
    - paragraph: 这段会话暂无子任务运行记录
    - paragraph: 这段会话没有团队。对模型说「用团队分工做…」，或在输入框打 /team。
    - group: 查看额度
    - group: 会话完整执行记录
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
  1  | import {mkdirSync} from 'node:fs'
  2  | import {join,resolve} from 'node:path'
  3  | import {test,expect,在项目里开会话,进坞} from './fixtures.js'
  4  | 
  5  | const longInput='inputs/'+Array(7).fill('original-observations-0123456789').join('/')+'/全部原始观测值.csv'
  6  | const longOutput='results/'+Array(7).fill('validated-summary-0123456789').join('/')+'/保留完整单位的统计结果.csv'
  7  | const title='核对全部观测并保留原始字段、样本、单位和缺失值处理说明，生成可复算且可核验的统计摘要'
  8  | const arrangement={mode:'single',rationale:'一个输入和一个结果，无独立审阅要求；先只提交方案。',independentReview:false,questions:[],tasks:[{id:'summary',title,goal:'只使用指定输入；先确认方案，不执行文件操作。',role:'负责保留全部原始输入并说明有效样本口径的统计分析执行者',inputs:[longInput],outputs:[longOutput],dependencies:[],acceptance:'用户确认单位与样本口径后，才可进入原有权限和验收流程。',review:false}]}
  9  | test.use({dawnOptions:{gitInit:true,toolCall:[{when:'长路径布局验收',toolName:'propose_plan',args:{title:'长内容方案',plan:'## 问题与假设\n布局验收\n## 数据与切分\n仅指定输入\n## 统计检验与模型\n等待确认\n## 图\n未执行\n## 产物\n等待确认',arrangement},once:true}]}})
  10 | test('preserves long task identities and expanded paths in a narrow real Electron view',async({dawn},testInfo)=>{
  11 |  const{page}=dawn
  12 |  await dawn.app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0]!.setContentSize(900,640))
  13 |  await 在项目里开会话(page);await 进坞(page,'团队')
  14 |  const auto=page.getByRole('region',{name:'自动安排',exact:true})
  15 |  await auto.getByRole('textbox',{name:'任务目标',exact:true}).fill('长路径布局验收：先提出单任务方案，等待我确认，不执行。')
  16 |  await auto.getByRole('button',{name:'生成安排',exact:true}).click()
> 17 |  await expect(auto.getByRole('status',{name:'任务块数',exact:true})).toHaveText('1 个任务块')
     |                                                                  ^ Error: expect(locator).toHaveText(expected) failed
  18 |  const card=auto.locator('[data-arrangement-task="summary"]')
  19 |  await expect(card).toContainText(title)
  20 |  await card.getByText('文件与验收条件',{exact:true}).click()
  21 |  await expect(card.getByText(longInput,{exact:true})).toBeVisible()
  22 |  await expect(card.getByText(longOutput,{exact:true})).toBeVisible()
  23 |  const geometry=await card.evaluate(el=>({clientWidth:el.clientWidth,scrollWidth:el.scrollWidth,paths:[...el.querySelectorAll('dd')].map(dd=>({clientWidth:dd.clientWidth,scrollWidth:dd.scrollWidth}))}))
  24 |  expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth+1)
  25 |  for(const path of geometry.paths)expect(path.scrollWidth).toBeLessThanOrEqual(path.clientWidth+1)
  26 |  await card.getByText(longOutput,{exact:true}).scrollIntoViewIfNeeded()
  27 |  await expect(card.getByText(longOutput,{exact:true})).toBeInViewport({ratio:1})
  28 |  await expect(page.locator('main.main .chip-group .chip')).toHaveCount(0)
  29 |  const out=resolve(process.env.DAWN_ARRANGEMENT_LAYOUT_EVIDENCE_DIR??testInfo.outputPath('long-arrangement'))
  30 |  mkdirSync(out,{recursive:true});await card.screenshot({path:join(out,'long-path-card.png')})
  31 |  await page.getByRole('button',{name:'展开流程工作台',exact:true}).click()
  32 |  await expect(auto.locator('[data-arrangement-task="summary"]')).toContainText(title)
  33 |  await page.keyboard.press('Escape')
  34 |  await expect(page.getByRole('button',{name:'展开流程工作台',exact:true})).toBeFocused()
  35 |  await expect(auto.locator('[data-arrangement-task="summary"]')).toContainText(longOutput)
  36 | })
  37 | 
```