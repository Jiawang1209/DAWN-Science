# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: approved-plan-execution.spec.ts >> approved arrangement starts the frozen DAG, exposes real receipts and returns from the expanded view
- Location: e2e/approved-plan-execution.spec.ts:7:1

# Error details

```
Error: locator.click: Error: strict mode violation: getByRole('tab', { name: '产物', exact: true }) resolved to 2 elements:
    1) <button role="tab" tabindex="0" type="button" aria-label="产物" aria-selected="false" data-dock-tab="artifacts" class="btn btn-ghost btn-sm dock-tab-btn">…</button> aka getByLabel('产物')
    2) <button role="tab" type="button" tabindex="-1" id="_r_4_-artifacts" aria-selected="false" aria-controls="_r_4_-panel" class="btn btn-ghost btn-sm" data-collaboration-tab="artifacts">产物</button> aka getByLabel('任务详情').getByRole('tab', { name: '产物' })

Call log:
  - waiting for getByRole('tab', { name: '产物', exact: true })

```

# Page snapshot

```yaml
- generic [ref=f4e3]:
  - generic [ref=f4e4]:
    - generic [ref=f4e5]:
      - button "DAWN Science" [ref=f4e7] [cursor=pointer]
      - button "收起侧边栏" [expanded] [ref=f4e10] [cursor=pointer]
      - button "快捷键速查" [ref=f4e13] [cursor=pointer]
    - generic [ref=f4e17]:
      - tablist "同一处的会话" [ref=f4e21]:
        - generic [ref=f4e22]:
          - tab "请为以下具体任务自动安排。先只读理解目标" [selected] [ref=f4e23] [cursor=pointer]
          - button "关掉「请为以下具体任务自动安排。先只读理解目标」（收进归档）" [ref=f4e26] [cursor=pointer]
        - button "在这里再开一段" [ref=f4e29] [cursor=pointer]
      - generic:
        - banner
    - button "面板：团队" [expanded] [ref=f4e33] [cursor=pointer]
  - generic [ref=f4e34]:
    - complementary [ref=f4e35]:
      - button "新建任务" [ref=f4e37] [cursor=pointer]
      - separator [ref=f4e42]
      - generic [ref=f4e43]:
        - generic [ref=f4e44]: 工作区
        - generic [ref=f4e45]:
          - button "搜索" [ref=f4e46] [cursor=pointer]
          - button "添加工作区文件夹" [ref=f4e49] [cursor=pointer]
      - generic [ref=f4e53]:
        - paragraph [ref=f4e54]:
          - button "项目 1" [expanded] [ref=f4e55] [cursor=pointer]:
            - generic [ref=f4e60]: 项目
            - generic [ref=f4e61]: "1"
          - button "多选项目" [ref=f4e62] [cursor=pointer]: 多选
        - list [ref=f4e63]:
          - listitem [ref=f4e64]:
            - generic [ref=f4e65]:
              - button "workspace" [ref=f4e66] [cursor=pointer]
              - generic [ref=f4e75]:
                - button "在「workspace」里开一段新对话" [ref=f4e76] [cursor=pointer]
                - button "项目操作：workspace" [ref=f4e80] [cursor=pointer]: ⋯
            - list [ref=f4e81]:
              - listitem [ref=f4e82]:
                - button "请为以下具体任务自动安排。先只读理解目标 刚刚" [ref=f4e83]:
                  - generic [ref=f4e84]: 请为以下具体任务自动安排。先只读理解目标
                  - generic [ref=f4e88]: 刚刚
                - button "会话操作：请为以下具体任务自动安排。先只读理解目标" [ref=f4e90] [cursor=pointer]: ⋯
        - region "服务器" [ref=f4e91]:
          - generic [ref=f4e92]:
            - button "服务器" [expanded] [ref=f4e93] [cursor=pointer]
            - button "添加服务器" [ref=f4e102] [cursor=pointer]
          - paragraph [ref=f4e105]: 还没有服务器
      - generic [ref=f4e106]:
        - button "定时" [ref=f4e107] [cursor=pointer]
        - button "设置" [ref=f4e112] [cursor=pointer]
    - separator "调整侧栏宽度" [ref=f4e116]
    - main [ref=f4e117]:
      - button "打开协作：3 项任务 · 3 项验收通过" [ref=f4e119] [cursor=pointer]:
        - strong [ref=f4e122]: 协作
        - generic [ref=f4e123]: 本轮成果已验收
        - generic [ref=f4e124]: 3 项任务 · 3 项验收通过
        - generic [ref=f4e125]: ›
      - generic [ref=f4e126]:
        - toolbar "会话工具栏" [ref=f4e127]:
          - group "会话操作：请为以下具体任务自动安排。先只读理解目标" [ref=f4e129]:
            - button "查找当前对话" [ref=f4e131] [cursor=pointer]
            - button "导出对话" [ref=f4e135] [cursor=pointer]
        - generic [ref=f4e138]:
          - generic [ref=f4e140]:
            - generic [ref=f4e141]:
              - generic [ref=f4e142]: 你
              - generic [ref=f4e144]:
                - generic [ref=f4e147]:
                  - paragraph [ref=f4e148]: 请为以下具体任务自动安排。先只读理解目标、数据和已有会话约束，再用 propose_plan 的 arrangement 提交任务划分、分工、输入输出、依赖、验收与理由。
                  - paragraph [ref=f4e149]: 任务数量是方案结果，由实际任务决定；简单任务可以一块，不能固定拆成三块，也不要让用户预填数字。并行仅用于独立任务且不能共写；用户要求独立审阅时必须保留不同执行角色的审阅任务。缺信息放入 questions，不编造数据或启动执行。
                  - paragraph [ref=f4e150]: 任务目标： 清洗、建模并独立审阅 input.csv
                  - paragraph [ref=f4e151]: 原有冻结契约、证据、产物版本、预算、产物锁和恢复要求继续适用。请交可调整的方案，等待用户采纳；这次只规划，不写科研产物、不派子 Agent。
                - generic [ref=f4e152]:
                  - time [ref=f4e153]: 2026-11-08 15:21
                  - button "复制我说的这段" [ref=f4e154] [cursor=pointer]
                  - button "修改" [ref=f4e160] [cursor=pointer]
                  - button "回到这句之前" [ref=f4e164] [cursor=pointer]
            - generic [ref=f4e167]:
              - generic [ref=f4e168]:
                - generic [ref=f4e169]: D
                - generic [ref=f4e170]: DeepSeek
              - generic [ref=f4e171]:
                - paragraph [ref=f4e175]: 先提出任务划分，等待你调整或采纳。
                - button "复制这段回答" [ref=f4e177] [cursor=pointer]
            - region "方案第 1 版" [active] [ref=f4e183]:
              - generic [ref=f4e184]:
                - generic [ref=f4e185]: 方案 · 第 1 版
                - generic [ref=f4e188]: 已批准 2026/11/8 15:21:06
              - heading "自动安排：完成当前数据任务" [level=3] [ref=f4e189]
              - region "任务安排结果" [ref=f4e190]:
                - generic [ref=f4e191]:
                  - strong [ref=f4e192]:
                    - status "任务块数" [ref=f4e193]: 3 个任务块
                  - generic [ref=f4e194]: 科研流水线
                - paragraph [ref=f4e195]: 后一步依赖前一步的产物，审阅使用独立角色。
                - paragraph [ref=f4e196]: 采纳后按这些任务、执行者和契约启动；当前仍为待执行方案。
                - list [ref=f4e197]:
                  - listitem [ref=f4e198]:
                    - strong [ref=f4e200]: 核查并清洗数据
                    - paragraph [ref=f4e201]: 核查并清洗数据（本地自动安排夹具）
                    - paragraph [ref=f4e202]:
                      - generic [ref=f4e203]: 分工：
                      - text: 数据核查员
                    - paragraph [ref=f4e204]:
                      - generic [ref=f4e205]: 执行者：
                      - text: data-engineer
                      - generic [ref=f4e206]: · 限定产物写入
                    - generic [ref=f4e207]: 依赖：没有前置
                    - group [ref=f4e208]:
                      - generic "文件与验收条件" [ref=f4e209]
                  - listitem [ref=f4e210]:
                    - strong [ref=f4e212]: 根据清洗结果建模
                    - paragraph [ref=f4e213]: 根据清洗结果建模（本地自动安排夹具）
                    - paragraph [ref=f4e214]:
                      - generic [ref=f4e215]: 分工：
                      - text: 统计分析员
                    - paragraph [ref=f4e216]:
                      - generic [ref=f4e217]: 执行者：
                      - text: data-engineer
                      - generic [ref=f4e218]: · 限定产物写入
                    - generic [ref=f4e219]: 依赖：核查并清洗数据
                    - group [ref=f4e220]:
                      - generic "文件与验收条件" [ref=f4e221]
                  - listitem [ref=f4e222]:
                    - generic [ref=f4e223]:
                      - strong [ref=f4e224]: 独立审阅模型与证据
                      - generic [ref=f4e225]: 独立审阅
                    - paragraph [ref=f4e226]: 独立审阅模型与证据（本地自动安排夹具）
                    - paragraph [ref=f4e227]:
                      - generic [ref=f4e228]: 分工：
                      - text: 独立审阅员
                    - paragraph [ref=f4e229]:
                      - generic [ref=f4e230]: 执行者：
                      - text: reviewer-two
                      - generic [ref=f4e231]: · 只读
                    - generic [ref=f4e232]: 依赖：根据清洗结果建模
                    - group [ref=f4e233]:
                      - generic "文件与验收条件" [ref=f4e234]
              - generic [ref=f4e237]:
                - heading "问题与假设" [level=2] [ref=f4e238]
                - paragraph [ref=f4e239]: 按用户目标安排任务，先规划、不执行。
                - heading "数据与切分" [level=2] [ref=f4e240]
                - paragraph [ref=f4e241]: input.csv clean.csv model.csv
                - heading "统计检验与模型" [level=2] [ref=f4e242]
                - paragraph [ref=f4e243]: 后一步依赖前一步的产物，审阅使用独立角色。
                - heading "图" [level=2] [ref=f4e244]
                - paragraph [ref=f4e245]: 按用户需要决定，不自动增加图形任务。
                - heading "产物" [level=2] [ref=f4e246]
                - paragraph [ref=f4e247]:
                  - code [ref=f4e248]: clean.csv
                  - code [ref=f4e249]: model.csv
              - button "看全文" [ref=f4e250] [cursor=pointer]
              - generic [ref=f4e251]:
                - paragraph [ref=f4e252]: 任务与执行者已冻结；重复开始不会重放已有执行。中断后请先核对产物。
                - button "开始或继续未执行任务" [ref=f4e253] [cursor=pointer]
                - button "打开方案文件" [ref=f4e254] [cursor=pointer]
                - code [ref=f4e255]: analysis/plans/2026-11-08-自动安排-完成当前数据任务.md
                - paragraph [ref=f4e256]: 产物清单：计划 2 项 · 任务验收 2 · 主会话登记 0 · 计划外 0
                - paragraph [ref=f4e257]: 未登记不代表未生成；请在任务产物中查看验收版本。
                - button "看清单" [ref=f4e258] [cursor=pointer]
            - generic [ref=f4e259]:
              - generic [ref=f4e260]: 子 agent 3/3
              - generic [ref=f4e261]:
                - button "✓ member_1 · plan_1 完成" [ref=f4e263] [cursor=pointer]:
                  - text: ✓ member_1 · plan_1
                  - generic [ref=f4e264]: 完成
                - button "✓ member_2 · plan_2 完成" [ref=f4e266] [cursor=pointer]:
                  - text: ✓ member_2 · plan_2
                  - generic [ref=f4e267]: 完成
                - button "✓ member_3 · plan_3 完成" [ref=f4e269] [cursor=pointer]:
                  - text: ✓ member_3 · plan_3
                  - generic [ref=f4e270]: 完成
          - button "回到底部" [ref=f4e271] [cursor=pointer]
        - generic [ref=f4e276]:
          - generic [ref=f4e277]:
            - button "工作目录：/var/folders/2t/y0qcl9r50cv427189l7px1000000gn/T/dawn-e2e-t2UVUx/workspace" [ref=f4e279] [cursor=pointer]:
              - generic [ref=f4e282]: workspace
            - generic [ref=f4e285]: 本机
          - textbox "检查缺失值并说明处理方法" [ref=f4e291]
          - generic [ref=f4e292]:
            - generic [ref=f4e293]:
              - button "添加内容" [ref=f4e295] [cursor=pointer]
              - button "终端面板" [ref=f4e298] [cursor=pointer]
              - button "完全访问" [ref=f4e302] [cursor=pointer]
            - generic [ref=f4e307]:
              - button "上下文 —" [ref=f4e309] [cursor=pointer]: —
              - button "当前模型：deepseek-flash。点击切换" [ref=f4e314] [cursor=pointer]:
                - generic [ref=f4e318]: deepseek-flash
              - button "发送" [ref=f4e321] [cursor=pointer]
    - complementary "团队" [ref=f4e324]:
      - separator "调整面板宽度" [ref=f4e325]
      - generic [ref=f4e326]:
        - tablist "面板" [ref=f4e327]:
          - tab "文件" [ref=f4e328] [cursor=pointer]
          - tab "产物" [ref=f4e329] [cursor=pointer]:
            - text: 产物
            - generic [ref=f4e330]: "2"
          - tab "笔记本" [ref=f4e331] [cursor=pointer]
          - tab "路线" [ref=f4e332] [cursor=pointer]
          - tab "审阅" [ref=f4e333] [cursor=pointer]
          - tab "团队" [selected] [ref=f4e334] [cursor=pointer]
        - button "更多面板" [ref=f4e336] [cursor=pointer]: ⋯
        - button "关闭面板" [ref=f4e337] [cursor=pointer]
      - generic [ref=f4e341]:
        - region "运行总览" [ref=f4e342]:
          - generic [ref=f4e343]:
            - generic [ref=f4e344]:
              - text: 对话协作台
              - heading "协作" [level=3] [ref=f4e345]
            - button "刷新运行记录" [ref=f4e347] [cursor=pointer]
          - region "协作成果" [ref=f4e348]:
            - generic [ref=f4e349]:
              - generic [ref=f4e350]: 任务目标
              - heading "执行已批准任务安排" [level=3] [ref=f4e351]
            - generic [ref=f4e352]:
              - heading "本轮成果已验收" [level=4] [ref=f4e353]
              - paragraph [ref=f4e354]: 验收对应宿主回执中的内容版本。
            - generic [ref=f4e355]:
              - generic [ref=f4e356]: 下一步 · 查看对应任务的证据与记录
              - button "查看验收成果" [ref=f4e357] [cursor=pointer]
            - generic [ref=f4e358]:
              - heading "验收成果与版本" [level=4] [ref=f4e359]
              - generic [ref=f4e360]:
                - generic [ref=f4e361]:
                  - button "clean.csv 最终成果 SHA256 2bb5ffa520e4… · 8 字节" [ref=f4e362] [cursor=pointer]:
                    - generic [ref=f4e363]:
                      - strong [ref=f4e364]: clean.csv
                      - generic [ref=f4e365]: 最终成果
                    - generic [ref=f4e366]: SHA256 2bb5ffa520e4… · 8 字节
                  - group [ref=f4e367]:
                    - generic "版本定位详情" [ref=f4e368] [cursor=pointer]
                - generic [ref=f4e369]:
                  - button "model.csv 最终成果 SHA256 2bb5ffa520e4… · 8 字节" [ref=f4e370] [cursor=pointer]:
                    - generic [ref=f4e371]:
                      - strong [ref=f4e372]: model.csv
                      - generic [ref=f4e373]: 最终成果
                    - generic [ref=f4e374]: SHA256 2bb5ffa520e4… · 8 字节
                  - group [ref=f4e375]:
                    - generic "版本定位详情" [ref=f4e376] [cursor=pointer]
            - generic [ref=f4e377]:
              - paragraph [ref=f4e378]: 执行轮次未设上限 · 审阅预留未启用 · 在途 0 · 费用未记录
              - button "展开流程工作台" [ref=f4e379] [cursor=pointer]
          - paragraph [ref=f4e380]: 来自当前会话的统一编排；每两秒刷新
          - generic [ref=f4e381]:
            - strong [ref=f4e382]: 3 项任务
            - generic [ref=f4e383]: 3 项验收通过
            - generic [ref=f4e384]: 0 项活跃
          - generic [ref=f4e385]:
            - region "批准方案执行进度" [ref=f4e386]:
              - generic [ref=f4e387]:
                - strong [ref=f4e388]: 批准方案执行进度
                - generic [ref=f4e389]: 第 1 版
              - paragraph [ref=f4e390]: 计划 3 项 · 已启动 3 项
              - list [ref=f4e391]:
                - listitem [ref=f4e392]:
                  - button "核查并清洗数据 member_1 · clean 宿主验收通过" [ref=f4e393] [cursor=pointer]:
                    - generic [ref=f4e394]:
                      - strong [ref=f4e395]: 核查并清洗数据
                      - generic [ref=f4e396]: member_1 · clean
                    - generic [ref=f4e397]: 宿主验收通过
                - listitem [ref=f4e398]:
                  - button "根据清洗结果建模 member_2 · model 宿主验收通过" [ref=f4e399] [cursor=pointer]:
                    - generic [ref=f4e400]:
                      - strong [ref=f4e401]: 根据清洗结果建模
                      - generic [ref=f4e402]: member_2 · model
                    - generic [ref=f4e403]: 宿主验收通过
                - listitem [ref=f4e404]:
                  - button "独立审阅模型与证据 member_3 · review 宿主验收通过" [ref=f4e405] [cursor=pointer]:
                    - generic [ref=f4e406]:
                      - strong [ref=f4e407]: 独立审阅模型与证据
                      - generic [ref=f4e408]: member_3 · review
                    - generic [ref=f4e409]: 宿主验收通过
            - generic [ref=f4e410]:
              - heading "任务板" [level=4] [ref=f4e411]
              - button "核查并清洗数据" [ref=f4e412] [cursor=pointer]
              - button "根据清洗结果建模" [ref=f4e413] [cursor=pointer]
              - button "独立审阅模型与证据" [ref=f4e414] [cursor=pointer]
            - generic "协作任务" [ref=f4e415]:
              - button "data-engineer" [pressed] [ref=f4e417] [cursor=pointer]:
                - generic [ref=f4e418]: D
                - generic [ref=f4e419]:
                  - strong [ref=f4e420]: data-engineer
                  - generic [ref=f4e421]: 执行完成
                  - generic [ref=f4e422]:
                    - generic [ref=f4e423]:
                      - generic [ref=f4e424]: 当前上下文
                      - generic [ref=f4e425]: 未知
                    - generic [ref=f4e426]:
                      - generic [ref=f4e427]: 已结算累计
                      - generic [ref=f4e428]: 输入或输出未记录
                - generic [ref=f4e429]:
                  - generic [ref=f4e430]: 团队成员
                  - generic [ref=f4e431]: 累计结算 0.6 秒
              - button "data-engineer" [ref=f4e433] [cursor=pointer]:
                - generic [ref=f4e434]: D
                - generic [ref=f4e435]:
                  - strong [ref=f4e436]: data-engineer
                  - generic [ref=f4e437]: 执行完成
                  - generic [ref=f4e438]:
                    - generic [ref=f4e439]:
                      - generic [ref=f4e440]: 当前上下文
                      - generic [ref=f4e441]: 未知
                    - generic [ref=f4e442]:
                      - generic [ref=f4e443]: 已结算累计
                      - generic [ref=f4e444]: 输入或输出未记录
                - generic [ref=f4e445]:
                  - generic [ref=f4e446]: 团队成员
                  - generic [ref=f4e447]: 累计结算 0.6 秒
              - button "reviewer-two" [ref=f4e449] [cursor=pointer]:
                - generic [ref=f4e450]: R
                - generic [ref=f4e451]:
                  - strong [ref=f4e452]: reviewer-two
                  - generic [ref=f4e453]: 执行完成
                  - generic [ref=f4e454]:
                    - generic [ref=f4e455]:
                      - generic [ref=f4e456]: 当前上下文
                      - generic [ref=f4e457]: 未知
                    - generic [ref=f4e458]:
                      - generic [ref=f4e459]: 已结算累计
                      - generic [ref=f4e460]: 输入或输出未记录
                - generic [ref=f4e461]:
                  - generic [ref=f4e462]: 团队成员
                  - generic [ref=f4e463]: 累计结算 0.6 秒
            - generic [ref=f4e464]:
              - generic [ref=f4e466]:
                - strong [ref=f4e467]: data-engineer
                - generic [ref=f4e468]: 类型 team · 执行代次 1
              - tablist "任务详情" [ref=f4e469]:
                - tab "过程" [selected] [ref=f4e470] [cursor=pointer]
                - tab "交接" [ref=f4e471] [cursor=pointer]
                - tab "产物" [ref=f4e472] [cursor=pointer]
                - tab "记录" [ref=f4e473] [cursor=pointer]
              - tabpanel "过程" [ref=f4e474]:
                - generic [ref=f4e475]:
                  - generic [ref=f4e476]:
                    - generic [ref=f4e477]: 当前上下文
                    - generic [ref=f4e478]: 未知
                  - generic [ref=f4e479]:
                    - generic [ref=f4e480]: 已结算累计
                    - generic [ref=f4e481]: 输入或输出未记录
                  - group [ref=f4e482]:
                    - generic "查看观测来源与覆盖" [ref=f4e483] [cursor=pointer]
                - region "任务轨迹" [ref=f4e484]:
                  - generic [ref=f4e485]:
                    - strong [ref=f4e486]: 任务轨迹
                    - generic [ref=f4e487]: 执行完成
                  - list [ref=f4e488]:
                    - listitem [ref=f4e489]:
                      - time [ref=f4e490]: 15:21:06
                      - generic [ref=f4e491]: 开始执行
                    - listitem [ref=f4e492]:
                      - time [ref=f4e493]: 15:21:06
                      - generic [ref=f4e494]: 核验冻结输入
                    - listitem [ref=f4e495]:
                      - time [ref=f4e496]: 15:21:06
                      - generic [ref=f4e497]: 后端执行
                    - listitem [ref=f4e498]:
                      - time [ref=f4e499]: 15:21:07
                      - generic [ref=f4e500]: 宿主验收
                    - listitem [ref=f4e501]:
                      - time [ref=f4e502]: 15:21:07
                      - generic [ref=f4e503]: 执行已结算
                      - generic [ref=f4e504]: 宿主验收通过
                  - generic [ref=f4e505]:
                    - button "查看 2 条工具记录" [ref=f4e506] [cursor=pointer]
                    - button "查看 1 个产物版本" [ref=f4e507] [cursor=pointer]
                - paragraph [ref=f4e508]: 普通委派任务
                - paragraph [ref=f4e509]: 宿主验收通过
              - region "成员会话与操作" [ref=f4e510]:
                - generic [ref=f4e511]:
                  - strong [ref=f4e512]: 成员会话与操作
                  - generic [ref=f4e513]: member_1
                - paragraph [ref=f4e514]: 数据核查员
                - paragraph [ref=f4e515]: 分工已冻结；需要调整时请回到自动安排。
                - generic [ref=f4e516]:
                  - generic [ref=f4e517]:
                    - term [ref=f4e518]: 当前状态
                    - definition [ref=f4e519]: 执行完成
                  - generic [ref=f4e520]:
                    - term [ref=f4e521]: 验收
                    - definition [ref=f4e522]: 通过
                  - generic [ref=f4e523]:
                    - term [ref=f4e524]: 文件版本
                    - definition [ref=f4e525]: 输入 1 · 产物 1
                - group [ref=f4e526]:
                  - generic "成员邮箱记录" [ref=f4e527] [cursor=pointer]
          - region "自动安排" [ref=f4e528]:
            - heading "自动安排" [level=4] [ref=f4e529]
            - paragraph [ref=f4e530]: 方案第 1 版 · 已批准
            - region "任务安排结果" [ref=f4e531]:
              - generic [ref=f4e532]:
                - strong [ref=f4e533]:
                  - status "任务块数" [ref=f4e534]: 3 个任务块
                - generic [ref=f4e535]: 科研流水线
              - paragraph [ref=f4e536]: 后一步依赖前一步的产物，审阅使用独立角色。
              - paragraph [ref=f4e537]: 采纳后按这些任务、执行者和契约启动；当前仍为待执行方案。
              - list [ref=f4e538]:
                - listitem [ref=f4e539]:
                  - strong [ref=f4e541]: 核查并清洗数据
                  - paragraph [ref=f4e542]: 核查并清洗数据（本地自动安排夹具）
                  - paragraph [ref=f4e543]:
                    - generic [ref=f4e544]: 分工：
                    - text: 数据核查员
                  - paragraph [ref=f4e545]:
                    - generic [ref=f4e546]: 执行者：
                    - text: data-engineer
                    - generic [ref=f4e547]: · 限定产物写入
                  - generic [ref=f4e548]: 依赖：没有前置
                  - group [ref=f4e549]:
                    - generic "文件与验收条件" [ref=f4e550] [cursor=pointer]
                - listitem [ref=f4e551]:
                  - strong [ref=f4e553]: 根据清洗结果建模
                  - paragraph [ref=f4e554]: 根据清洗结果建模（本地自动安排夹具）
                  - paragraph [ref=f4e555]:
                    - generic [ref=f4e556]: 分工：
                    - text: 统计分析员
                  - paragraph [ref=f4e557]:
                    - generic [ref=f4e558]: 执行者：
                    - text: data-engineer
                    - generic [ref=f4e559]: · 限定产物写入
                  - generic [ref=f4e560]: 依赖：核查并清洗数据
                  - group [ref=f4e561]:
                    - generic "文件与验收条件" [ref=f4e562] [cursor=pointer]
                - listitem [ref=f4e563]:
                  - generic [ref=f4e564]:
                    - strong [ref=f4e565]: 独立审阅模型与证据
                    - generic [ref=f4e566]: 独立审阅
                  - paragraph [ref=f4e567]: 独立审阅模型与证据（本地自动安排夹具）
                  - paragraph [ref=f4e568]:
                    - generic [ref=f4e569]: 分工：
                    - text: 独立审阅员
                  - paragraph [ref=f4e570]:
                    - generic [ref=f4e571]: 执行者：
                    - text: reviewer-two
                    - generic [ref=f4e572]: · 只读
                  - generic [ref=f4e573]: 依赖：根据清洗结果建模
                  - group [ref=f4e574]:
                    - generic "文件与验收条件" [ref=f4e575] [cursor=pointer]
            - group [ref=f4e576]:
              - generic "调整任务与分工" [ref=f4e577] [cursor=pointer]
            - paragraph [ref=f4e578]: 可在对话中的方案卡修改并采纳，或补充调整要求后重新安排。
            - paragraph [ref=f4e579]: 先出方案期间只读查看；采纳后才进入原有执行与验收流程。
          - generic [ref=f4e580]:
            - group [ref=f4e581]:
              - generic "查看额度" [ref=f4e582] [cursor=pointer]
            - group [ref=f4e583]:
              - generic "会话完整执行记录" [ref=f4e584] [cursor=pointer]
        - group [ref=f4e585]:
          - generic "团队管理与原始记录" [ref=f4e586] [cursor=pointer]
  - contentinfo "应用状态" [ref=f4e587]:
    - button "还没有填任何 API key，暂时不能对话——点这里填一个" [ref=f4e589] [cursor=pointer]
    - generic [ref=f4e590]:
      - generic [ref=f4e591]:
        - button "当前模型：deepseek-flash" [ref=f4e592] [cursor=pointer]:
          - generic [ref=f4e596]: deepseek-flash
        - button "R：未配置" [ref=f4e597] [cursor=pointer]:
          - generic [ref=f4e599]: R
          - generic [ref=f4e600]: 未配置
        - button "Python：未配置" [ref=f4e601] [cursor=pointer]:
          - generic [ref=f4e603]: Python
          - generic [ref=f4e604]: 未配置
      - generic [ref=f4e605]:
        - generic [ref=f4e606]:
          - button "插件 8" [ref=f4e607] [cursor=pointer]:
            - generic [ref=f4e610]: 插件
            - generic [ref=f4e611]: "8"
          - button "Skills 9" [ref=f4e612] [cursor=pointer]:
            - generic [ref=f4e616]: Skills
            - generic [ref=f4e617]: "9"
          - button "MCP 0" [ref=f4e618] [cursor=pointer]:
            - generic [ref=f4e621]: MCP
            - generic [ref=f4e622]: "0"
          - button "子 Agent 22" [ref=f4e623] [cursor=pointer]:
            - generic [ref=f4e626]: 子 Agent
            - generic [ref=f4e627]: "22"
        - button "版本 v0.0.44" [ref=f4e628] [cursor=pointer]: v0.0.44
```

# Test source

```ts
  139 |     const w = window as unknown as {
  140 |       dawn: { invoke: (op: string, req: unknown) => Promise<unknown> }
  141 |     }
  142 |     const p = (await w.dawn.invoke("getProviders", {})) as unknown as {
  143 |       data?: { agents?: { agentId: string }[] }
  144 |     }
  145 |     const agentId = p.data?.agents?.[0]?.agentId
  146 |     await w.dawn.invoke("createTask", { agentId, workspace })
  147 |   }, ws)
  148 | 
  149 |   // 界面还没刷新到这条新任务上——重载最省事，且走的是真实的启动装配
  150 |   await page.reload()
  151 |   const 项目 = page.locator(".proj-list .proj-item").first()
  152 |   /**
  153 |    * **文件夹没开才去点**（2026-09-28）。侧栏的开 / 关此前重载即忘，这里就一律点一下「展开」；
  154 |    * 现在记得——同一条用例第二次进来时它已经开着，再点就是收起，下一步找不到会话（memory / session-tabs 两条当场红）。
  155 |    */
  156 |   await expect(项目.locator(".row").first()).toBeVisible()
  157 |   if ((await 项目.locator(".proj-session-list").count()) === 0) await 项目.locator(".row").first().click()
  158 |   await 项目.locator(".proj-session-list .sess-item .row").first().click()
  159 | }
  160 | 
  161 | /**
  162 |  * **等到「真的进对话了」**（2026-08-12）。
  163 |  *
  164 |  * 不能只等 `回车发送` 那个输入框：**空态现在也是一张输入卡**
  165 |  * （作者：*「不要上来就是用 Deepseek 开始，而是要直接是对话窗口」*），
  166 |  * 两处占位符一模一样。只等它的话，用例会把字打进空态那一张，
  167 |  * 随后界面切进对话，**那句话凭空消失**——症状是「发了没反应」。
  168 |  *
  169 |  * `.conv-title` 只有对话那一屏有，所以它是可判定的分界。
  170 |  */
  171 | export async function 等进了对话(page: Page): Promise<void> {
  172 |   await page.locator(".conv-title").waitFor({ timeout: 60_000 })
  173 |   await page.getByPlaceholder(/输入问题/).waitFor({ timeout: 60_000 })
  174 | }
  175 | 
  176 | /**
  177 |  * 用指定的 agent 开一段对话（T4，2026-08-13）。
  178 |  *
  179 |  * **走 composer 上那颗 pill，不走命令面板。** 此前这些用例按 ⌘K 点
  180 |  * 「新建会话：claude」，而那一串命令（每个 agent 一条）在 T4 里收成了
  181 |  * 一条「新建任务」——`createSession` 操作本身也从协议 5.0 里摘掉了。
  182 |  *
  183 |  * **挑 agent 的家只有一个：开口之前那颗 pill。** 这也正是人真的会走的那条路，
  184 |  * 所以换过来之后这些用例的搭台比原来更实。
  185 |  *
  186 |  * @param agent pill 菜单里那一项的名字（agent 的显示名，认不出的 cli 也在列）
  187 |  */
  188 | export async function 用某个agent开一段(page: Page, agent: RegExp): Promise<void> {
  189 |   await page.locator(".app-shell").waitFor({ timeout: 60_000 })
  190 |   // **等它可用再点**：只等 shell 可见的话，那一刻 agent 清单还没加载完，
  191 |   // 菜单里没有这一项——症状是「偶尔飘红一条，每次不是同一条」
  192 |   await expect(page.getByRole("button", { name: "新建任务" })).toBeEnabled({ timeout: 60_000 })
  193 |   await 打开agent菜单(page)
  194 |   await page.getByRole("menuitem", { name: agent }).click()
  195 | }
  196 | 
  197 | /** 掀开 composer 右下那颗 pill 的菜单。**菜单本身是判据**，别用别的东西代 */
  198 | export async function 打开agent菜单(page: Page): Promise<void> {
  199 |   const pill = page.locator(".composer-card .agent-pill")
  200 |   await pill.waitFor({ timeout: 60_000 })
  201 |   await pill.locator("button").first().click()
  202 |   await page.getByRole("menu").waitFor({ timeout: 30_000 })
  203 | }
  204 | 
  205 | /**
  206 |  * 进右侧坞的「审阅」（2026-08-17，批 1）。
  207 |  *
  208 |  * 「产出」与「变更」两张卡**从「项目概览」搬去了右侧坞**——
  209 |  * 搬走时没有在原地留一份（两处显示同一件事，人就没法判断该信哪一个）。
  210 |  *
  211 |  * **抽成夹具而不是抄三份**：这条路已经有三个调用点，
  212 |  * 而坞的入口将来还会变（快捷键、菜单文案）。抄三份的话，
  213 |  * 改一次要改三处，而漏掉的那一处会红得像功能坏了。
  214 |  *
  215 |  * 顶栏那颗按钮**两态两个名字**（2026-08-20 作者定的）：
  216 |  * 关着叫「面板」，开着叫「面板：<谁>」——名字说的是此刻的事实。
  217 |  */
  218 | export async function 开坞(page: Page): Promise<void> {
  219 |   /**
  220 |    * 顶右角那颗只管开合（2026-08-18）；开没开看 `aria-expanded`。
  221 |    * **已经开着就别再点**——那会把它收起来。
  222 |    * 名字两态（2026-08-20）：`/^面板/` 两种都接得住。
  223 |    */
  224 |   const 颗 = page.getByRole("button", { name: /^面板/ })
  225 |   await 颗.waitFor({ timeout: 30_000 })
  226 |   if ((await 颗.getAttribute("aria-expanded")) !== "true") await 颗.click()
  227 | }
  228 | 
  229 | /** 进坞里的某一格。**走标签条**——切换器已经从顶右角的菜单搬到坞头部了 */
  230 | export async function 进坞(page: Page, 房客: string): Promise<void> {
  231 |   await 开坞(page)
  232 |   // 入口数量随真实宽度变化：等既有展开动画及宽度观察完成，再选择标签或更多。
  233 |   await page.locator(".body").evaluate(async el => {
  234 |     await Promise.all(el.getAnimations().map(animation => animation.finished.catch(() => {})))
  235 |     await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
  236 |   })
  237 |   const label = 房客
  238 |   const tab = page.getByRole("tab", { name: label, exact: true })
> 239 |   if (await tab.count()) await tab.click()
      |                                    ^ Error: locator.click: Error: strict mode violation: getByRole('tab', { name: '产物', exact: true }) resolved to 2 elements:
  240 |   else {
  241 |     await page.getByRole("button", { name: "更多面板", exact: true }).click()
  242 |     await page.getByRole("menuitem", { name: label, exact: true }).click()
  243 |   }
  244 | }
  245 | 
  246 | export async function 进审阅(page: Page): Promise<void> {
  247 |   await 进坞(page, "审阅")
  248 | }
  249 | 
  250 | /**
  251 |  * 进设置的某一块（2026-08-12）。
  252 |  *
  253 |  * 设置改成了「左分类 / 右内容」（作者：*「看不出太大的层次」*），
  254 |  * 默认停在「外观」。**进来就找某个控件的用例都要先点到它那一块**——
  255 |  * 不点的话找不到，而那与「这个控件坏了」在报错上长得一模一样。
  256 |  *
  257 |  * **2026-09-16 起「设置」开的是右边那一栏**，而这二十几支用例验的都是整页里
  258 |  * 那些面板，所以这里开完栏立刻 `展开`，让它们一个字都不用改。
  259 |  * 要验窄栏本身的用例走 `e2e/settings-column.spec.ts`，不走这条。
  260 |  */
  261 | export async function 进设置(page: Page, 分类: string): Promise<void> {
  262 |   // 侧栏那颗「设置」是开关（再点一次回对话）——已经在设置里就别再点它，直接换分类（2026-08-23 扩展五屏并进设置后连着切的用例多了）
  263 |   if ((await page.locator(".settings-nav").count()) === 0) {
  264 |     if ((await page.locator(".settings-column").count()) === 0) {
  265 |       await page.getByRole("button", { name: "设置", exact: true }).click()
  266 |     }
  267 |     await page.getByRole("button", { name: "展开", exact: true }).click()
  268 |   }
  269 |   await page.locator(".settings-nav").getByRole("button", { name: 分类, exact: true }).click()
  270 | }
  271 | 
  272 | export interface DawnFixture {
  273 |   app: ElectronApplication
  274 |   page: Page
  275 |   /** 隔离目录。用例可以读数据库验证副作用 */
  276 |   dir: string
  277 |   dbPath: string
  278 |   workspace: string
  279 |   /** 假服务器收到的请求。用来证明测试**不是空转通过** */
  280 |   requests: unknown[]
  281 |   /** 填 key 时那一次验证（B9）——另记一本，不混进 `requests`（理由见 mock 里 `keyChecks` 的注释） */
  282 |   keyChecks: unknown[]
  283 |   /** 假微信（开了 `fakeIlink` 才有）：推进扫码、塞消息、读发出的、让 token 失效 */
  284 |   weixin?: FakeIlinkServer
  285 |   feishu?: FakeFeishuServer
  286 |   openalex?: { requests: {path: string; query: Record<string,string>}[] }
  287 |   science?: { requests: {path: string; query: Record<string,string>}[] }
  288 |   crossref?: { requests: {path: string; query: Record<string,string>}[] }
  289 |   /** 假发布源（开了 `fakeUpdate` 才有）：可以中途换一个版本号 */
  290 |   发布源?: { url: string; 设版本(v: string): void }
  291 |   /**
  292 |    * 关掉应用再打开（同一套目录）。返回新窗口。
  293 |    *
  294 |    * **会话续接只有这样才验得了**：在同一个进程里点来点去，
  295 |    * 永远碰不到「agent 没了、对话只在内存里」那一刻。
  296 |    */
  297 |   重开: () => Promise<Page>
  298 |   /**
  299 |    * 假推理服务器的地址。
  300 |    *
  301 |    * **给「在界面上手填一个自定义端点」那类用例用**——它要往输入框里
  302 |    * 敲一个真能连上的地址，而那个地址在夹具起来之前不存在。
  303 |    * （配置文件里用 `{{MOCK_URL}}` 占位，界面里没有占位符这条路。）
  304 |    */
  305 |   mockUrl: string
  306 | }
  307 | 
  308 | /**
  309 |  * 让假模型确定性地**调一次工具**。
  310 |  *
  311 |  * **刻意是声明式的，不是回调。** mock 那一侧的入口是
  312 |  * `(body) => {toolName, args} | undefined`，够灵活，但两件事让它不适合直接
  313 |  * 当夹具选项：一是 Playwright 的 `test.use()` 传函数要担心跨进程；
  314 |  * 二是用例真正要说的只有「调什么、带什么参数、调几次」，
  315 |  * **把闭包写进每个用例等于把同一段状态机抄一遍**。翻译在下面做一次。
  316 |  */
  317 | export interface MockToolCallSpec {
  318 |   toolName: string
  319 |   args: Record<string, unknown>
  320 |   /** Resolve only from one complete, host-labelled tool result in this task. */
  321 |   evidenceReferences?: Partial<Record<'execution'|'verification',string>>
  322 |   /** Match the current task's latest user instruction across its tool-result turns. */
  323 |   duringTask?: string
  324 |   /**
  325 |    * 调工具**之前先说的那一句**（2026-08-15）。
  326 |    *
  327 |    * 真模型的一轮常是：说一段 → 调工具 → 再说一段。不给这一句的话，
  328 |    * 「说完了、正在跑工具」那个中间态在 e2e 里根本不存在——
  329 |    * 而那正是 `Agent is already processing` 发生的地方。
  330 |    */
  331 |   say?: string
  332 |   /**
  333 |    * 只在第一次请求时触发。**默认 true，而且几乎总该是 true**——
  334 |    * 否则模型拿到工具结果后会再调一次，一路循环到撞上限，用例表现为超时。
  335 |    */
  336 |   once?: boolean
  337 |   /**
  338 |    * **每一轮都调一次**（2026-08-21）：只在请求的最后一条是用户发言时触发，
  339 |    * 拿到工具结果之后的那次追问不触发——所以不会循环。
```