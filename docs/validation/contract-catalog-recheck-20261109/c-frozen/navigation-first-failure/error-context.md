# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: orchestration-entry.spec.ts >> workflow entry stays visible above clarification and returns to the same conversation
- Location: e2e/orchestration-entry.spec.ts:7:1

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: 2
Received: 3
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
          - tab "请为以下具体任务自动安排。先只读理解目标" [selected] [ref=f3e23] [cursor=pointer]
          - button "关掉「请为以下具体任务自动安排。先只读理解目标」（收进归档）" [ref=f3e26] [cursor=pointer]
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
                - button "请为以下具体任务自动安排。先只读理解目标 刚刚" [ref=f3e83]:
                  - generic [ref=f3e84]: 请为以下具体任务自动安排。先只读理解目标
                  - generic [ref=f3e88]: 刚刚
                - button "会话操作：请为以下具体任务自动安排。先只读理解目标" [ref=f3e90] [cursor=pointer]: ⋯
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
          - group "会话操作：请为以下具体任务自动安排。先只读理解目标" [ref=f3e121]:
            - button "查找当前对话" [ref=f3e123] [cursor=pointer]
            - button "导出对话" [ref=f3e127] [cursor=pointer]
        - generic [ref=f3e132]:
          - generic [ref=f3e133]:
            - generic [ref=f3e134]: 你
            - generic [ref=f3e136]:
              - generic [ref=f3e139]:
                - paragraph [ref=f3e140]: 请为以下具体任务自动安排。先只读理解目标、数据和已有会话约束，再用 propose_plan 的 arrangement 提交任务划分、分工、输入输出、依赖、验收与理由。
                - paragraph [ref=f3e141]: 任务数量是方案结果，由实际任务决定；简单单结果任务优先一个任务块，不能固定拆成三块，也不要让用户预填数字。只有依赖、独立输入、权限边界或明确审阅要求才增加分工；请在理由里解释额外分工的实际作用。并行仅用于独立任务且不能共写；用户要求独立审阅时必须保留不同执行角色的审阅任务。缺信息放入 questions，不编造数据或启动执行。
                - paragraph [ref=f3e142]: 任务目标： 计算 input.csv 均值，单位未提供
                - paragraph [ref=f3e143]: 原有冻结契约、证据、产物版本、预算、产物锁和恢复要求继续适用。请交可调整的方案，等待用户采纳；这次只规划，不写科研产物、不派子 Agent。
              - generic [ref=f3e144]:
                - time [ref=f3e145]: 2026-11-09 23:46
                - button "复制我说的这段" [ref=f3e146] [cursor=pointer]
                - button "修改" [ref=f3e152] [cursor=pointer]
                - button "回到这句之前" [ref=f3e156] [cursor=pointer]
          - generic [ref=f3e159]:
            - generic [ref=f3e160]:
              - generic [ref=f3e161]: D
              - generic [ref=f3e162]: DeepSeek
            - generic [ref=f3e163]:
              - paragraph [ref=f3e167]: 先查看本会话已确认的科研约束。
              - button "复制这段回答" [ref=f3e169] [cursor=pointer]
          - button "已完成 用时 0 秒 1 步" [expanded] [ref=f3e175] [cursor=pointer]:
            - generic [ref=f3e178]: 已完成
            - generic [ref=f3e179]: 用时 0 秒
            - generic [ref=f3e180]: 1 步
          - 'button "✓ get_plan_contracts {} 成功" [ref=f3e182] [cursor=pointer]':
            - generic [ref=f3e185]: ✓ get_plan_contracts
            - generic [ref=f3e186]: "{}"
            - generic [ref=f3e187]: 成功
          - generic [ref=f3e188]:
            - generic [ref=f3e189]:
              - generic [ref=f3e190]: D
              - generic [ref=f3e191]: DeepSeek
            - generic [ref=f3e192]:
              - paragraph [ref=f3e196]: 先提出任务划分，等待你调整或采纳。
              - button "复制这段回答" [ref=f3e198] [cursor=pointer]
          - region "方案第 1 版" [ref=f3e204]:
            - generic [ref=f3e205]:
              - generic [ref=f3e206]: 方案 · 第 1 版
              - generic [ref=f3e209]: 等你看
            - heading "自动安排：完成当前数据任务" [level=3] [ref=f3e210]
            - region "任务安排结果" [ref=f3e211]:
              - generic [ref=f3e212]:
                - strong [ref=f3e213]:
                  - status "任务块数" [ref=f3e214]: 1 个任务块
                - generic [ref=f3e215]: 单任务
              - paragraph [ref=f3e216]: 先确认输入单位，避免猜测。
              - paragraph [ref=f3e217]: 等待补充信息；当前方案不能执行。
              - list [ref=f3e218]:
                - listitem [ref=f3e219]:
                  - strong [ref=f3e221]: 确认数据口径
                  - paragraph [ref=f3e222]: 确认数据口径（本地自动安排夹具）
                  - paragraph [ref=f3e223]:
                    - generic [ref=f3e224]: 分工：
                    - text: 数据核查员
                  - paragraph [ref=f3e225]:
                    - generic [ref=f3e226]: 执行者：
                    - text: data-engineer
                    - generic [ref=f3e227]: · 只读
                  - generic [ref=f3e228]: 依赖：没有前置
                  - group [ref=f3e229]:
                    - generic "文件与验收条件" [ref=f3e230]
              - heading "待确认事项" [level=4] [ref=f3e231]
              - list [ref=f3e232]:
                - listitem [ref=f3e233]: input.csv 中 x 的单位是什么？
            - alert [ref=f3e234]: 请先补齐待确认项，再更新并采纳任务安排
            - generic [ref=f3e237]:
              - heading "问题与假设" [level=2] [ref=f3e238]
              - paragraph [ref=f3e239]: 按用户目标安排任务，先规划、不执行。
              - heading "数据与切分" [level=2] [ref=f3e240]
              - paragraph [ref=f3e241]: input.csv
              - heading "统计检验与模型" [level=2] [ref=f3e242]
              - paragraph [ref=f3e243]: 先确认输入单位，避免猜测。
              - heading "图" [level=2] [ref=f3e244]
              - paragraph [ref=f3e245]: 按用户需要决定，不自动增加图形任务。
              - heading "产物" [level=2] [ref=f3e246]
            - button "看全文" [ref=f3e247] [cursor=pointer]
            - generic [ref=f3e248]:
              - button "照这个做" [disabled] [ref=f3e249]
              - button "改一改" [ref=f3e250] [cursor=pointer]
              - button "不做了" [ref=f3e251] [cursor=pointer]
            - paragraph [ref=f3e252]: 想让它重写：直接在下面说，它会交新的一版。
        - generic [ref=f3e254]:
          - generic [ref=f3e255]:
            - button "工作目录：/var/folders/2t/y0qcl9r50cv427189l7px1000000gn/T/dawn-e2e-lFc0Ev/workspace" [ref=f3e257] [cursor=pointer]:
              - generic [ref=f3e260]: workspace
            - generic [ref=f3e263]: 本机
          - status [ref=f3e267]: 先出方案 · 这一段只看不改，方案批了才动手（再按一下「先出方案」退出）
          - textbox "检查缺失值并说明处理方法" [ref=f3e270]
          - generic [ref=f3e271]:
            - generic [ref=f3e272]:
              - button "添加内容" [ref=f3e274] [cursor=pointer]
              - button "终端面板" [ref=f3e277] [cursor=pointer]
              - button "完全访问" [ref=f3e281] [cursor=pointer]
            - generic [ref=f3e286]:
              - button "上下文 —" [ref=f3e288] [cursor=pointer]: —
              - button "当前模型：deepseek-flash。点击切换" [ref=f3e293] [cursor=pointer]:
                - generic [ref=f3e294]: deepseek-flash
              - button "发送" [ref=f3e297] [cursor=pointer]
    - complementary "团队" [ref=f3e300]:
      - separator "调整面板宽度" [ref=f3e301]
      - generic [ref=f3e302]:
        - tablist "面板" [ref=f3e303]:
          - tab "团队" [selected] [ref=f3e304] [cursor=pointer]
          - tab "Bot" [ref=f3e305] [cursor=pointer]
        - button "更多面板" [ref=f3e307] [cursor=pointer]: ⋯
        - button "关闭面板" [ref=f3e308] [cursor=pointer]
      - region "运行总览" [ref=f3e313]:
        - generic [ref=f3e314]:
          - generic [ref=f3e315]:
            - text: 对话协作台
            - heading "协作" [level=3] [ref=f3e316]
          - generic [ref=f3e317]:
            - button "打开编排视图" [active] [ref=f3e318] [cursor=pointer]: 编排视图
            - button "刷新运行记录" [ref=f3e319] [cursor=pointer]
        - region "自动安排" [ref=f3e320]:
          - heading "自动安排" [level=4] [ref=f3e321]
          - group [ref=f3e322]:
            - generic "科研任务约束" [ref=f3e323] [cursor=pointer]
          - paragraph [ref=f3e324]: 方案第 1 版 · 等你看
          - region "补充待确认信息" [ref=f3e325]:
            - generic [ref=f3e326]:
              - strong [ref=f3e327]: 等待补充信息
              - generic [ref=f3e328]: 方案第 1 版
            - paragraph [ref=f3e329]: 补齐后先生成新方案，原方案不会直接执行。
            - generic [ref=f3e330]:
              - generic [ref=f3e331]: input.csv 中 x 的单位是什么？
              - textbox "问题 1 的回答" [ref=f3e332]: mg/g
            - button "补充后重新规划" [ref=f3e333] [cursor=pointer]
          - region "任务安排结果" [ref=f3e334]:
            - generic [ref=f3e335]:
              - strong [ref=f3e336]:
                - status "任务块数" [ref=f3e337]: 1 个任务块
              - generic [ref=f3e338]: 单任务
            - paragraph [ref=f3e339]: 先确认输入单位，避免猜测。
            - paragraph [ref=f3e340]: 等待补充信息；当前方案不能执行。
            - list [ref=f3e341]:
              - listitem [ref=f3e342]:
                - strong [ref=f3e344]: 确认数据口径
                - paragraph [ref=f3e345]: 确认数据口径（本地自动安排夹具）
                - paragraph [ref=f3e346]:
                  - generic [ref=f3e347]: 分工：
                  - text: 数据核查员
                - paragraph [ref=f3e348]:
                  - generic [ref=f3e349]: 执行者：
                  - text: data-engineer
                  - generic [ref=f3e350]: · 只读
                - generic [ref=f3e351]: 依赖：没有前置
                - group [ref=f3e352]:
                  - generic "文件与验收条件" [ref=f3e353] [cursor=pointer]
          - group [ref=f3e354]:
            - generic "调整任务与分工" [ref=f3e355] [cursor=pointer]
          - paragraph [ref=f3e356]: 可在对话中的方案卡修改并采纳，或补充调整要求后重新安排。
          - paragraph [ref=f3e357]: 先出方案期间只读查看；采纳后才进入原有执行与验收流程。
        - region "协作成果" [ref=f3e358]:
          - generic [ref=f3e359]:
            - generic [ref=f3e360]: 任务目标
            - heading "本会话协作" [level=3] [ref=f3e361]
          - heading "当前成果尚未核验" [level=4] [ref=f3e363]
          - generic [ref=f3e364]:
            - generic [ref=f3e365]: 下一步 · 查看会话执行记录
            - button "查看会话执行记录" [ref=f3e366] [cursor=pointer]
          - group [ref=f3e367]:
            - generic "成果版本与执行额度" [ref=f3e368] [cursor=pointer]
          - paragraph [ref=f3e369]: 窄面板显示摘要；展开可查看完整目标和成果版本。
          - button "展开流程工作台" [ref=f3e371] [cursor=pointer]
        - paragraph [ref=f3e372]: 来自当前会话的统一编排；每两秒刷新
        - generic [ref=f3e373]:
          - paragraph [ref=f3e374]: 这段会话暂无子任务运行记录
          - paragraph [ref=f3e375]: 这段会话没有团队。对模型说「用团队分工做…」，或在输入框打 /team。
        - generic [ref=f3e376]:
          - group [ref=f3e377]:
            - generic "查看额度" [ref=f3e378] [cursor=pointer]
          - group [ref=f3e379]:
            - generic "会话完整执行记录" [ref=f3e380] [cursor=pointer]
  - contentinfo "应用状态" [ref=f3e381]:
    - button "还没有填任何 API key，暂时不能对话——点这里填一个" [ref=f3e383] [cursor=pointer]
    - generic [ref=f3e384]:
      - generic [ref=f3e385]:
        - button "当前模型：deepseek-flash" [ref=f3e386] [cursor=pointer]:
          - generic [ref=f3e390]: deepseek-flash
        - button "R：未配置" [ref=f3e391] [cursor=pointer]:
          - generic [ref=f3e393]: R
          - generic [ref=f3e394]: 未配置
        - button "Python：未配置" [ref=f3e395] [cursor=pointer]:
          - generic [ref=f3e397]: Python
          - generic [ref=f3e398]: 未配置
      - generic [ref=f3e399]:
        - button "扩展数量" [ref=f3e400] [cursor=pointer]:
          - generic [ref=f3e403]: 扩展
        - button "版本 v0.0.44" [ref=f3e404] [cursor=pointer]: v0.0.44
```

# Test source

```ts
  1  | import {mkdirSync,writeFileSync,existsSync} from 'node:fs'
  2  | import {resolve,join} from 'node:path'
  3  | import {test,expect,在项目里开会话,进坞} from './fixtures.js'
  4  |
  5  | const out=resolve(process.env.DAWN_ORCHESTRATION_ENTRY_EVIDENCE_DIR??'docs/validation/orchestration-entry-20261109/desktop')
  6  | test.use({dawnOptions:{gitInit:true}})
  7  | test('workflow entry stays visible above clarification and returns to the same conversation',async({dawn})=>{
  8  |  const{page,workspace}=dawn;mkdirSync(out,{recursive:true})
  9  |  writeFileSync(join(workspace,'input.csv'),'x\n1\n2\n3\n')
  10 |  await dawn.app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0]!.setContentSize(900,640))
  11 |  await 在项目里开会话(page);await 进坞(page,'团队')
  12 |  const auto=page.getByRole('region',{name:'自动安排',exact:true})
  13 |  await auto.getByRole('textbox',{name:'任务目标',exact:true}).fill('计算 input.csv 均值，单位未提供')
  14 |  await auto.getByRole('button',{name:'生成安排',exact:true}).click()
  15 |  const answer=page.getByRole('textbox',{name:'问题 1 的回答',exact:true})
  16 |  await expect(answer).toBeVisible();await answer.fill('mg/g')
  17 |  const entry=page.getByRole('button',{name:'打开编排视图',exact:true})
  18 |  await expect(entry).toBeInViewport()
  19 |  await answer.scrollIntoViewIfNeeded();await expect(entry).toBeInViewport()
  20 |  const before=dawn.requests.length
  21 |  await entry.click()
  22 |  const dialog=page.getByRole('dialog',{name:'流程工作台',exact:true})
  23 |  await expect(dialog).toBeVisible()
  24 |  await expect(dialog.getByRole('heading',{name:'Agent 网络',exact:true})).toBeInViewport()
  25 |  await expect(dialog.getByRole('button',{name:'返回 DAWN 对话',exact:true})).toBeInViewport()
  26 |  await page.screenshot({path:join(out,'expanded.png')})
  27 |  await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0)
  28 |  await expect(entry).toBeFocused();await expect(answer).toHaveValue('mg/g')
  29 |  await entry.click();await page.getByRole('button',{name:'返回 DAWN 对话',exact:true}).click()
  30 |  await expect(dialog).toHaveCount(0);await expect(entry).toBeFocused()
  31 |  await expect(page.getByRole('button',{name:'展开流程工作台',exact:true})).toHaveCount(1)
> 32 |  expect(dawn.requests.length).toBe(before);expect(existsSync(join(workspace,'mean.csv'))).toBe(false)
     |                               ^ Error: expect(received).toBe(expected) // Object.is equality
  33 |  await page.screenshot({path:join(out,'back-to-chat.png')})
  34 | })
  35 |
```
