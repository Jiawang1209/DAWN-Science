# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: approved-plan-execution.spec.ts >> approved arrangement starts the frozen DAG, exposes real receipts and returns from the expanded view
- Location: e2e/approved-plan-execution.spec.ts:8:1

# Error details

```
Error: expect(received).toBeLessThanOrEqual(expected)

Expected: <= 1
Received:    26.5
```

# Page snapshot

```yaml
- generic [ref=f4e1]:
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
                    - time [ref=f4e153]: 2026-11-08 21:26
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
              - region "方案第 1 版" [ref=f4e183]:
                - generic [ref=f4e184]:
                  - generic [ref=f4e185]: 方案 · 第 1 版
                  - generic [ref=f4e188]: 已批准 2026/11/8 21:26:26
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
              - button "工作目录：/var/folders/2t/y0qcl9r50cv427189l7px1000000gn/T/dawn-e2e-Q4MCVO/workspace" [ref=f4e279] [cursor=pointer]:
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
        - group [ref=f4e342]:
          - generic "团队管理与原始记录" [ref=f4e343] [cursor=pointer]
    - contentinfo "应用状态" [ref=f4e344]:
      - button "还没有填任何 API key，暂时不能对话——点这里填一个" [ref=f4e346] [cursor=pointer]
      - generic [ref=f4e347]:
        - generic [ref=f4e348]:
          - button "当前模型：deepseek-flash" [ref=f4e349] [cursor=pointer]:
            - generic [ref=f4e353]: deepseek-flash
          - button "R：未配置" [ref=f4e354] [cursor=pointer]:
            - generic [ref=f4e356]: R
            - generic [ref=f4e357]: 未配置
          - button "Python：未配置" [ref=f4e358] [cursor=pointer]:
            - generic [ref=f4e360]: Python
            - generic [ref=f4e361]: 未配置
        - generic [ref=f4e362]:
          - generic [ref=f4e363]:
            - button "插件 8" [ref=f4e364] [cursor=pointer]:
              - generic [ref=f4e367]: 插件
              - generic [ref=f4e368]: "8"
            - button "Skills 9" [ref=f4e369] [cursor=pointer]:
              - generic [ref=f4e373]: Skills
              - generic [ref=f4e374]: "9"
            - button "MCP 0" [ref=f4e375] [cursor=pointer]:
              - generic [ref=f4e378]: MCP
              - generic [ref=f4e379]: "0"
            - button "子 Agent 22" [ref=f4e380] [cursor=pointer]:
              - generic [ref=f4e383]: 子 Agent
              - generic [ref=f4e384]: "22"
          - button "版本 v0.0.44" [ref=f4e385] [cursor=pointer]: v0.0.44
  - dialog "流程工作台" [ref=f4e386]:
    - region "运行总览" [ref=f4e387]:
      - generic [ref=f4e388]:
        - generic [ref=f4e389]:
          - text: 对话协作台
          - heading "流程工作台" [level=3] [ref=f4e390]
        - button "刷新运行记录" [ref=f4e392] [cursor=pointer]
      - region "协作成果" [ref=f4e393]:
        - heading "执行已批准任务安排" [level=3] [ref=f4e395]
        - heading "本轮成果已验收" [level=4] [ref=f4e397]
        - group [ref=f4e398]:
          - generic "展开成果版本与检查入口" [ref=f4e399] [cursor=pointer]
        - generic [ref=f4e400]:
          - paragraph [ref=f4e401]: 执行轮次未设上限 · 审阅预留未启用 · 在途 0 · 费用未记录
          - button "返回对话协作台" [expanded] [ref=f4e402] [cursor=pointer]
      - paragraph [ref=f4e403]: 来自当前会话的统一编排；每两秒刷新
      - generic [ref=f4e404]:
        - strong [ref=f4e405]: 3 项任务
        - generic [ref=f4e406]: 3 项验收通过
        - generic [ref=f4e407]: 0 项活跃
        - generic [ref=f4e408]: 3 项执行完成
        - generic [ref=f4e409]: 可核验 token 0 · 未知用量 3 轮
        - generic [ref=f4e410]: 费用未记录
      - generic [ref=f4e411]:
        - region "批准方案执行进度" [ref=f4e412]:
          - generic [ref=f4e413]:
            - strong [ref=f4e414]: 批准方案执行进度
            - generic [ref=f4e415]: 第 1 版
          - paragraph [ref=f4e416]: 计划 3 项 · 已启动 3 项
          - list [ref=f4e417]:
            - listitem [ref=f4e418]:
              - button "核查并清洗数据 member_1 · clean 宿主验收通过" [ref=f4e419] [cursor=pointer]:
                - generic [ref=f4e420]:
                  - strong [ref=f4e421]: 核查并清洗数据
                  - generic [ref=f4e422]: member_1 · clean
                - generic [ref=f4e423]: 宿主验收通过
            - listitem [ref=f4e424]:
              - button "根据清洗结果建模 member_2 · model 宿主验收通过" [active] [ref=f4e425] [cursor=pointer]:
                - generic [ref=f4e426]:
                  - strong [ref=f4e427]: 根据清洗结果建模
                  - generic [ref=f4e428]: member_2 · model
                - generic [ref=f4e429]: 宿主验收通过
            - listitem [ref=f4e430]:
              - button "独立审阅模型与证据 member_3 · review 宿主验收通过" [ref=f4e431] [cursor=pointer]:
                - generic [ref=f4e432]:
                  - strong [ref=f4e433]: 独立审阅模型与证据
                  - generic [ref=f4e434]: member_3 · review
                - generic [ref=f4e435]: 宿主验收通过
        - region "流程工作台" [ref=f4e436]:
          - generic [ref=f4e437]:
            - generic [ref=f4e438]:
              - generic [ref=f4e439]:
                - heading "Agent 网络" [level=4] [ref=f4e440]
                - generic [ref=f4e441]: 宿主与直接委派关系 · 点击节点联动
              - paragraph [ref=f4e442]: 连线表示直接委派；任务依赖另列于下方
              - generic "Agent 网络，可滚动查看" [ref=f4e443]:
                - generic [ref=f4e444]:
                  - generic [ref=f4e445]:
                    - generic [ref=f4e446]: 当前会话
                    - strong [ref=f4e447]: 主助手
                    - generic [ref=f4e448]: 直接编排 3 项执行
                  - button "网络节点：data-engineer" [ref=f4e449] [cursor=pointer]:
                    - strong [ref=f4e452]: 数据核查员
                    - generic [ref=f4e453]: member_1 · data-engineer
                    - generic "当前执行已停止或不活跃" [ref=f4e454]: 上下文未知 · 累计 输入或输出未记录
                    - generic [ref=f4e455]: 执行完成
                    - generic [ref=f4e456]: 累计结算 0.6 秒
                  - button "网络节点：data-engineer" [ref=f4e457] [cursor=pointer]:
                    - strong [ref=f4e460]: 统计分析员
                    - generic [ref=f4e461]: member_2 · data-engineer
                    - generic "当前执行已停止或不活跃" [ref=f4e462]: 上下文未知 · 累计 输入或输出未记录
                    - generic [ref=f4e463]: 执行完成
                    - generic [ref=f4e464]: 累计结算 0.6 秒
                  - button "网络节点：reviewer-two" [ref=f4e465] [cursor=pointer]:
                    - strong [ref=f4e468]: 独立审阅员
                    - generic [ref=f4e469]: member_3 · reviewer-two
                    - generic "当前执行已停止或不活跃" [ref=f4e470]: 上下文未知 · 累计 输入或输出未记录
                    - generic [ref=f4e471]: 执行完成
                    - generic [ref=f4e472]: 累计结算 0.6 秒
            - generic [ref=f4e473]:
              - generic [ref=f4e474]:
                - heading "编队成员" [level=4] [ref=f4e475]
                - generic [ref=f4e476]: 3 项任务
              - generic [ref=f4e477]:
                - searchbox "搜索协作成员" [ref=f4e478]
                - group "成员状态筛选" [ref=f4e479]:
                  - button "显示全部成员" [pressed] [ref=f4e480] [cursor=pointer]
                  - button "只看活跃成员" [ref=f4e481] [cursor=pointer]
                  - button "只看已结束" [ref=f4e482] [cursor=pointer]
              - generic [ref=f4e483]:
                - button "data-engineer" [ref=f4e484] [cursor=pointer]:
                  - generic [ref=f4e485]:
                    - generic [ref=f4e486]: D
                    - strong [ref=f4e487]: 数据核查员
                  - generic "member_1 · data-engineer" [ref=f4e489]
                  - generic [ref=f4e490]:
                    - generic [ref=f4e491]: 执行完成
                    - generic [ref=f4e492]: 宿主验收通过
                  - generic "当前执行已停止或不活跃" [ref=f4e493]: 上下文未知 · 累计 输入或输出未记录
                  - generic [ref=f4e494]: 累计结算 0.6 秒
                - button "data-engineer" [ref=f4e498] [cursor=pointer]:
                  - generic [ref=f4e499]:
                    - generic [ref=f4e500]: D
                    - strong [ref=f4e501]: 统计分析员
                  - generic "member_2 · data-engineer" [ref=f4e503]
                  - generic [ref=f4e504]:
                    - generic [ref=f4e505]: 执行完成
                    - generic [ref=f4e506]: 宿主验收通过
                  - generic "当前执行已停止或不活跃" [ref=f4e507]: 上下文未知 · 累计 输入或输出未记录
                  - generic [ref=f4e508]: 累计结算 0.6 秒
                - button "reviewer-two" [ref=f4e512] [cursor=pointer]:
                  - generic [ref=f4e513]:
                    - generic [ref=f4e514]: R
                    - strong [ref=f4e515]: 独立审阅员
                  - generic "member_3 · reviewer-two" [ref=f4e517]
                  - generic [ref=f4e518]:
                    - generic [ref=f4e519]: 执行完成
                    - generic [ref=f4e520]: 宿主验收通过
                  - generic "当前执行已停止或不活跃" [ref=f4e521]: 上下文未知 · 累计 输入或输出未记录
                  - generic [ref=f4e522]: 累计结算 0.6 秒
          - heading "任务依赖" [level=4] [ref=f4e526]
          - paragraph [ref=f4e527]: 连线仅表示任务声明的前置关系；成员执行记录不与任务代次混用。
          - generic "横向滚动查看任务依赖" [ref=f4e528]:
            - generic [ref=f4e529]:
              - button "核查并清洗数据" [ref=f4e530] [cursor=pointer]:
                - strong [ref=f4e531]: 核查并清洗数据
                - generic [ref=f4e532]: 第 1 次
              - button "根据清洗结果建模" [pressed] [ref=f4e533] [cursor=pointer]:
                - strong [ref=f4e534]: 根据清洗结果建模
                - generic [ref=f4e535]: 第 1 次
              - button "独立审阅模型与证据" [ref=f4e536] [cursor=pointer]:
                - strong [ref=f4e537]: 独立审阅模型与证据
                - generic [ref=f4e538]: 第 1 次
      - region "自动安排" [ref=f4e539]:
        - heading "自动安排" [level=4] [ref=f4e540]
        - paragraph [ref=f4e541]: 方案第 1 版 · 已批准
        - region "任务安排结果" [ref=f4e542]:
          - generic [ref=f4e543]:
            - strong [ref=f4e544]:
              - status "任务块数" [ref=f4e545]: 3 个任务块
            - generic [ref=f4e546]: 科研流水线
          - paragraph [ref=f4e547]: 后一步依赖前一步的产物，审阅使用独立角色。
          - paragraph [ref=f4e548]: 采纳后按这些任务、执行者和契约启动；当前仍为待执行方案。
          - list [ref=f4e549]:
            - listitem [ref=f4e550]:
              - strong [ref=f4e552]: 核查并清洗数据
              - paragraph [ref=f4e553]: 核查并清洗数据（本地自动安排夹具）
              - paragraph [ref=f4e554]:
                - generic [ref=f4e555]: 分工：
                - text: 数据核查员
              - paragraph [ref=f4e556]:
                - generic [ref=f4e557]: 执行者：
                - text: data-engineer
                - generic [ref=f4e558]: · 限定产物写入
              - generic [ref=f4e559]: 依赖：没有前置
              - group [ref=f4e560]:
                - generic "文件与验收条件" [ref=f4e561] [cursor=pointer]
            - listitem [ref=f4e562]:
              - strong [ref=f4e564]: 根据清洗结果建模
              - paragraph [ref=f4e565]: 根据清洗结果建模（本地自动安排夹具）
              - paragraph [ref=f4e566]:
                - generic [ref=f4e567]: 分工：
                - text: 统计分析员
              - paragraph [ref=f4e568]:
                - generic [ref=f4e569]: 执行者：
                - text: data-engineer
                - generic [ref=f4e570]: · 限定产物写入
              - generic [ref=f4e571]: 依赖：核查并清洗数据
              - group [ref=f4e572]:
                - generic "文件与验收条件" [ref=f4e573] [cursor=pointer]
            - listitem [ref=f4e574]:
              - generic [ref=f4e575]:
                - strong [ref=f4e576]: 独立审阅模型与证据
                - generic [ref=f4e577]: 独立审阅
              - paragraph [ref=f4e578]: 独立审阅模型与证据（本地自动安排夹具）
              - paragraph [ref=f4e579]:
                - generic [ref=f4e580]: 分工：
                - text: 独立审阅员
              - paragraph [ref=f4e581]:
                - generic [ref=f4e582]: 执行者：
                - text: reviewer-two
                - generic [ref=f4e583]: · 只读
              - generic [ref=f4e584]: 依赖：根据清洗结果建模
              - group [ref=f4e585]:
                - generic "文件与验收条件" [ref=f4e586] [cursor=pointer]
        - group [ref=f4e587]:
          - generic "调整任务与分工" [ref=f4e588] [cursor=pointer]
        - paragraph [ref=f4e589]: 可在对话中的方案卡修改并采纳，或补充调整要求后重新安排。
        - paragraph [ref=f4e590]: 先出方案期间只读查看；采纳后才进入原有执行与验收流程。
      - generic [ref=f4e591]:
        - group [ref=f4e592]:
          - generic "查看额度" [ref=f4e593] [cursor=pointer]
        - group [ref=f4e594]:
          - generic "会话完整执行记录" [ref=f4e595] [cursor=pointer]
```

# Test source

```ts
  1   | import type {ResponseOf} from '../src/protocol/index.js'
  2   | import {mkdirSync,writeFileSync,readFileSync} from 'node:fs'
  3   | import {join,resolve} from 'node:path'
  4   | import {test,expect,在项目里开会话,进坞} from './fixtures.js'
  5   | const out=resolve(process.env.DAWN_APPROVED_PLAN_EVIDENCE_DIR??'docs/validation/plan-execution-workbench-20261108/desktop')
  6   | const requestBody=(r:unknown)=>(r as {body?:{messages?:unknown[];max_tokens?:number}}).body
  7   | test.use({dawnOptions:{gitInit:true}})
  8   | test('approved arrangement starts the frozen DAG, exposes real receipts and returns from the expanded view',async({dawn})=>{
  9   |  const{page,workspace}=dawn;mkdirSync(out,{recursive:true})
  10  |  writeFileSync(join(workspace,'input.csv'),'x\n1\n2\n3\n')
  11  |  await page.evaluate(()=>localStorage.setItem('dawn.global.theme','dark'));await page.reload()
  12  |  await 在项目里开会话(page);await 进坞(page,'团队')
  13  |  const auto=page.getByRole('region',{name:'自动安排',exact:true})
  14  |  await auto.getByRole('textbox',{name:'任务目标',exact:true}).fill('清洗、建模并独立审阅 input.csv')
  15  |  await auto.getByRole('button',{name:'生成安排',exact:true}).click()
  16  |  await expect(auto.getByRole('status',{name:'任务块数',exact:true})).toHaveText('3 个任务块')
  17  |  await expect(auto).toContainText('限定产物写入')
  18  |  await auto.locator('.task-arrangement-result').screenshot({path:join(out,'stage-a-frozen-proposal.png')})
  19  |  const card=page.locator('main.main .plan-card')
  20  |  await card.getByRole('button',{name:'照这个做',exact:true}).click()
  21  |  await expect(card).toHaveAttribute('data-status','approved')
  22  |  let overview=page.getByRole('region',{name:'运行总览',exact:true})
  23  |  let progress=overview.getByRole('region',{name:'批准方案执行进度',exact:true})
  24  |  await expect(progress).toContainText('计划 3 项 · 已启动 3 项')
  25  |  await expect(progress.getByText('宿主验收通过',{exact:true})).toHaveCount(3)
  26  |  expect(readFileSync(join(workspace,'input.csv'),'utf8')).toBe('x\n1\n2\n3\n')
  27  |  const before=dawn.requests.length
  28  |  await card.getByRole('button',{name:'开始或继续未执行任务',exact:true}).click()
  29  |  await expect(card.getByRole('button',{name:'开始或继续未执行任务',exact:true})).toBeEnabled()
  30  |  expect(dawn.requests.length).toBe(before)
  31  |  await progress.scrollIntoViewIfNeeded();await page.screenshot({path:join(out,'stage-b-executed.png')})
  32  |  const artifactResponse=await page.evaluate(async()=>{const tasks=await window.dawn!.invoke('listTasks',{});if(!tasks.ok)throw new Error(tasks.error?.message);const sessionId=(tasks.data as ResponseOf<'listTasks'>)[0]?.sessionId;if(!sessionId)throw new Error('fixture session missing');const result=await window.dawn!.invoke('listArtifacts',{sessionId});if(!result.ok)throw new Error(result.error?.message);return result.data as ResponseOf<'listArtifacts'>})
  33  |  const acceptedFiles=artifactResponse.taskArtifacts!.filter((file)=>file.acceptance==='accepted')
  34  |  expect(new Set(acceptedFiles.map((file)=>file.path)).size).toBe(2)
  35  |  await expect(card).toContainText('任务验收 2 · 主会话登记 0')
  36  |  await page.locator('[data-dock-tab="artifacts"]').click()
  37  |  const artifactPath=acceptedFiles[0]!.path,original=readFileSync(join(workspace,artifactPath))
  38  |  await page.getByRole('button',{name:artifactPath,exact:true}).click()
  39  |  const versions=page.getByRole('region',{name:'任务验收版本',exact:true})
  40  |  await versions.getByRole('button',{name:/核对当前内容/}).first().click();await expect(versions).toContainText('本次核对与验收内容一致')
  41  |  await page.screenshot({path:join(out,'stage-b-unified-artifact.png')})
  42  |  writeFileSync(join(workspace,artifactPath),Buffer.concat([original,Buffer.from('changed')]))
  43  |  await versions.getByRole('button',{name:/核对当前内容/}).first().click();await expect(versions).toContainText('当前内容与验收版本不同')
  44  |  await page.screenshot({path:join(out,'stage-b-version-changed.png')})
  45  |  writeFileSync(join(workspace,artifactPath),original)
  46  |  await 进坞(page,'团队');overview=page.getByRole('region',{name:'运行总览',exact:true})
  47  |  await overview.getByRole('button',{name:'展开流程工作台',exact:true}).click()
  48  |  progress=overview.getByRole('region',{name:'批准方案执行进度',exact:true})
  49  |  await progress.getByRole('button',{name:/根据清洗结果建模/}).click()
  50  |  await expect(overview.getByRole('tab',{name:'过程',exact:true})).toHaveAttribute('aria-selected','true')
  51  |  const workflowBox=await overview.getByRole('region',{name:'流程工作台',exact:true}).boundingBox(),detailBox=await overview.locator('.collaboration-detail').boundingBox()
  52  |  expect(detailBox!.x).toBeGreaterThanOrEqual(workflowBox!.x+workflowBox!.width-1)
  53  |  await overview.getByRole('tab',{name:'记录',exact:true}).click()
  54  |  await expect(overview.locator('.collaboration-detail')).toContainText('工具记录')
  55  |  await overview.locator('.collaboration-detail').scrollIntoViewIfNeeded()
  56  |  await page.screenshot({path:join(out,'stage-c-task-records.png')})
  57  |  await overview.locator('.collaboration-detail').screenshot({path:join(out,'stage-c-records-panel.png')})
  58  |  await overview.getByRole('button',{name:'收起检查面板',exact:true}).click()
  59  |  const dependencyGraph=overview.locator('.collaboration-graph-scroll')
  60  |  await dependencyGraph.scrollIntoViewIfNeeded()
  61  |  const graphGeometry=await dependencyGraph.evaluate(el=>{
  62  |   const graph=el.querySelector('.collaboration-graph')!.getBoundingClientRect()
  63  |   return{canvasHeight:graph.height,viewportHeight:el.clientHeight,scrollHeight:el.scrollHeight,nodes:[...el.querySelectorAll('.collaboration-graph-node')].map(node=>({height:node.getBoundingClientRect().height,bottomOverflow:node.getBoundingClientRect().bottom-graph.bottom}))}
  64  |  })
  65  |  writeFileSync(join(out,'dependency-geometry.json'),JSON.stringify(graphGeometry,null,2))
  66  |  await dependencyGraph.screenshot({path:join(out,'dependency-complete.png')})
> 67  |  expect(Math.max(...graphGeometry.nodes.map(node=>node.bottomOverflow))).toBeLessThanOrEqual(1)
      |                                                                          ^ Error: expect(received).toBeLessThanOrEqual(expected)
  68  |  expect(graphGeometry.scrollHeight).toBeLessThanOrEqual(graphGeometry.viewportHeight+1)
  69  |  // The node footer must remain visible and clickable after scrolling in a short, narrow window.
  70  |  await dawn.app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0]!.setContentSize(900,640))
  71  |  await dependencyGraph.scrollIntoViewIfNeeded()
  72  |  for(const node of await dependencyGraph.locator('.collaboration-graph-node').all()){
  73  |   await node.scrollIntoViewIfNeeded()
  74  |   await expect(node).toBeInViewport({ratio:1})
  75  |   const footerVisible=await node.locator('small').evaluate(el=>{const b=el.getBoundingClientRect();return!!document.elementFromPoint(b.x+b.width/2,b.bottom-2)?.closest('.collaboration-graph-node')})
  76  |   expect(footerVisible).toBe(true)
  77  |  }
  78  |  await page.screenshot({path:join(out,'dependency-narrow-complete.png')})
  79  |  await overview.getByRole('region',{name:'流程工作台',exact:true}).scrollIntoViewIfNeeded()
  80  |  await page.screenshot({path:join(out,'stage-c-workflow.png')})
  81  |  await overview.getByRole('button',{name:'返回对话协作台',exact:true}).click()
  82  |  await expect(page.getByRole('dialog',{name:'流程工作台',exact:true})).toHaveCount(0)
  83  |  await expect(overview.getByRole('tab',{name:'记录',exact:true})).toHaveAttribute('aria-selected','true')
  84  |  const reopened=await dawn.重开()
  85  |  await reopened.getByRole('button',{name:/^请为以下具体任务自动安排/}).click();await 进坞(reopened,'团队')
  86  |  overview=reopened.getByRole('region',{name:'运行总览',exact:true})
  87  |  await expect(overview.getByRole('region',{name:'批准方案执行进度',exact:true}).getByText('宿主验收通过',{exact:true})).toHaveCount(3)
  88  |  await reopened.screenshot({path:join(out,'stage-c-restored.png')})
  89  | })
  90  | test.describe('stopping bound work',()=>{
  91  |  test.use({dawnOptions:{gitInit:true,firstChunkDelayMs:1500}})
  92  |  test('stops the approved task, drains its process and never replays it after reopening',async({dawn})=>{
  93  |   const{page,workspace}=dawn;writeFileSync(join(workspace,'input.csv'),'x\n1\n2\n3\n')
  94  |   await 在项目里开会话(page);await 进坞(page,'团队')
  95  |   const auto=page.getByRole('region',{name:'自动安排',exact:true})
  96  |   await auto.getByRole('textbox',{name:'任务目标',exact:true}).fill('清洗、建模并独立审阅 input.csv')
  97  |   await auto.getByRole('button',{name:'生成安排',exact:true}).click()
  98  |   await expect(auto.getByRole('status',{name:'任务块数',exact:true})).toHaveText('3 个任务块')
  99  |   await page.locator('main.main .plan-card').getByRole('button',{name:'照这个做',exact:true}).click()
  100 |   let overview=page.getByRole('region',{name:'运行总览',exact:true})
  101 |   await expect.poll(()=>dawn.requests.filter(r=>JSON.stringify(requestBody(r)?.messages??[]).includes('任务契约（范围已冻结）')).length).toBeGreaterThan(0)
  102 |   await overview.getByRole('button',{name:'停止本方案执行',exact:true}).click()
  103 |   await expect(overview).toContainText('用户已停止执行')
  104 |   await expect(overview.locator('.run-overview-row[data-phase="running"],.run-overview-row[data-phase="stopping"],.run-overview-row[data-phase="queued"]')).toHaveCount(0)
  105 |   await expect(overview.getByRole('region',{name:'协作成果',exact:true})).toHaveAttribute('data-outcome','blocked')
  106 |   await expect(overview.getByRole('region',{name:'协作成果',exact:true})).toContainText('协作需要核对')
  107 |   mkdirSync(out,{recursive:true});await page.screenshot({path:join(out,'stage-b-stopped.png')})
  108 |   const reopened=await dawn.重开()
  109 |   await reopened.getByRole('button',{name:/^请为以下具体任务自动安排/}).click();await 进坞(reopened,'团队')
  110 |   overview=reopened.getByRole('region',{name:'运行总览',exact:true})
  111 |   await expect(overview).toContainText('执行已暂停')
  112 |   await expect(overview.getByRole('region',{name:'协作成果',exact:true})).not.toHaveAttribute('data-outcome','active')
  113 |   const taskRequests=()=>dawn.requests.filter(r=>JSON.stringify(requestBody(r)?.messages??[]).includes('任务契约（范围已冻结）')).length
  114 |   const before=taskRequests(),card=reopened.locator('main.main .plan-card')
  115 |   await card.getByRole('button',{name:'开始或继续未执行任务',exact:true}).click()
  116 |   await expect(card.getByRole('alert')).toContainText('副作用')
  117 |   writeFileSync(join(out,'stop-request-kinds.json'),JSON.stringify(dawn.requests.map(r=>({contractRequest:JSON.stringify(requestBody(r)?.messages??[]).includes('任务契约（范围已冻结）'),maxTokens:requestBody(r)?.max_tokens,messageCount:requestBody(r)?.messages?.length})),null,2))
  118 |   expect(taskRequests()).toBe(before)
  119 |   await overview.getByRole('button',{name:'结束此安排',exact:true}).click()
  120 |   await expect(overview).toContainText('安排已结束，任务记录保留。')
  121 |   await reopened.screenshot({path:join(out,'stage-b-retired.png')})
  122 |   expect(readFileSync(join(workspace,'input.csv'),'utf8')).toBe('x\n1\n2\n3\n')
  123 |  })
  124 | })
  125 | 
```