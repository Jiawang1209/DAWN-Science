# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: approved-plan-execution.spec.ts >> stopping bound work >> stops the approved task, drains its process and never replays it after reopening
- Location: e2e/approved-plan-execution.spec.ts:52:2

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: 2
Received: 3
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
      - button "打开协作：3 项任务 · 0 项验收通过" [ref=f2e119] [cursor=pointer]:
        - strong [ref=f2e122]: 协作
        - generic [ref=f2e123]: 协作进行中
        - generic [ref=f2e124]: 3 项任务 · 0 项验收通过
        - generic [ref=f2e125]: ›
      - generic [ref=f2e126]:
        - toolbar "会话工具栏" [ref=f2e127]:
          - group "会话操作：请为以下具体任务自动安排。先只读理解目标" [ref=f2e129]:
            - button "查找当前对话" [ref=f2e131] [cursor=pointer]
            - button "导出对话" [ref=f2e135] [cursor=pointer]
        - generic [ref=f2e138]:
          - generic [ref=f2e140]:
            - generic [ref=f2e141]:
              - generic [ref=f2e142]: 你
              - generic [ref=f2e144]:
                - generic [ref=f2e147]:
                  - paragraph [ref=f2e148]: 请为以下具体任务自动安排。先只读理解目标、数据和已有会话约束，再用 propose_plan 的 arrangement 提交任务划分、分工、输入输出、依赖、验收与理由。
                  - paragraph [ref=f2e149]: 任务数量是方案结果，由实际任务决定；简单任务可以一块，不能固定拆成三块，也不要让用户预填数字。并行仅用于独立任务且不能共写；用户要求独立审阅时必须保留不同执行角色的审阅任务。缺信息放入 questions，不编造数据或启动执行。
                  - paragraph [ref=f2e150]: 任务目标： 清洗、建模并独立审阅 input.csv
                  - paragraph [ref=f2e151]: 原有冻结契约、证据、产物版本、预算、产物锁和恢复要求继续适用。请交可调整的方案，等待用户采纳；这次只规划，不写科研产物、不派子 Agent。
                - generic [ref=f2e152]:
                  - time [ref=f2e153]: 2026-11-08 12:43
                  - button "复制我说的这段" [ref=f2e154] [cursor=pointer]
                  - button "修改" [ref=f2e160] [cursor=pointer]
                  - button "回到这句之前" [ref=f2e164] [cursor=pointer]
            - generic [ref=f2e167]:
              - generic [ref=f2e168]:
                - generic [ref=f2e169]: D
                - generic [ref=f2e170]: DeepSeek
              - generic [ref=f2e171]:
                - paragraph [ref=f2e175]: 先提出任务划分，等待你调整或采纳。
                - button "复制这段回答" [ref=f2e177] [cursor=pointer]
            - region "方案第 1 版" [ref=f2e183]:
              - generic [ref=f2e184]:
                - generic [ref=f2e185]: 方案 · 第 1 版
                - generic [ref=f2e188]: 已批准 2026/11/8 12:43:20
              - heading "自动安排：完成当前数据任务" [level=3] [ref=f2e189]
              - region "任务安排结果" [ref=f2e190]:
                - generic [ref=f2e191]:
                  - strong [ref=f2e192]:
                    - status "任务块数" [ref=f2e193]: 3 个任务块
                  - generic [ref=f2e194]: 科研流水线
                - paragraph [ref=f2e195]: 后一步依赖前一步的产物，审阅使用独立角色。
                - paragraph [ref=f2e196]: 采纳后按这些任务、执行者和契约启动；当前仍为待执行方案。
                - list [ref=f2e197]:
                  - listitem [ref=f2e198]:
                    - strong [ref=f2e200]: 核查并清洗数据
                    - paragraph [ref=f2e201]: 核查并清洗数据（本地自动安排夹具）
                    - paragraph [ref=f2e202]:
                      - generic [ref=f2e203]: 分工：
                      - text: 数据核查员
                    - paragraph [ref=f2e204]:
                      - generic [ref=f2e205]: 执行者：
                      - text: data-engineer
                      - generic [ref=f2e206]: · 限定产物写入
                    - generic [ref=f2e207]: 依赖：没有前置
                    - group [ref=f2e208]:
                      - generic "文件与验收条件" [ref=f2e209]
                  - listitem [ref=f2e210]:
                    - strong [ref=f2e212]: 根据清洗结果建模
                    - paragraph [ref=f2e213]: 根据清洗结果建模（本地自动安排夹具）
                    - paragraph [ref=f2e214]:
                      - generic [ref=f2e215]: 分工：
                      - text: 统计分析员
                    - paragraph [ref=f2e216]:
                      - generic [ref=f2e217]: 执行者：
                      - text: data-engineer
                      - generic [ref=f2e218]: · 限定产物写入
                    - generic [ref=f2e219]: 依赖：核查并清洗数据
                    - group [ref=f2e220]:
                      - generic "文件与验收条件" [ref=f2e221]
                  - listitem [ref=f2e222]:
                    - generic [ref=f2e223]:
                      - strong [ref=f2e224]: 独立审阅模型与证据
                      - generic [ref=f2e225]: 独立审阅
                    - paragraph [ref=f2e226]: 独立审阅模型与证据（本地自动安排夹具）
                    - paragraph [ref=f2e227]:
                      - generic [ref=f2e228]: 分工：
                      - text: 独立审阅员
                    - paragraph [ref=f2e229]:
                      - generic [ref=f2e230]: 执行者：
                      - text: reviewer-two
                      - generic [ref=f2e231]: · 只读
                    - generic [ref=f2e232]: 依赖：根据清洗结果建模
                    - group [ref=f2e233]:
                      - generic "文件与验收条件" [ref=f2e234]
              - generic [ref=f2e237]:
                - heading "问题与假设" [level=2] [ref=f2e238]
                - paragraph [ref=f2e239]: 按用户目标安排任务，先规划、不执行。
                - heading "数据与切分" [level=2] [ref=f2e240]
                - paragraph [ref=f2e241]: input.csv clean.csv model.csv
                - heading "统计检验与模型" [level=2] [ref=f2e242]
                - paragraph [ref=f2e243]: 后一步依赖前一步的产物，审阅使用独立角色。
                - heading "图" [level=2] [ref=f2e244]
                - paragraph [ref=f2e245]: 按用户需要决定，不自动增加图形任务。
                - heading "产物" [level=2] [ref=f2e246]
                - paragraph [ref=f2e247]:
                  - code [ref=f2e248]: clean.csv
                  - code [ref=f2e249]: model.csv
              - button "看全文" [ref=f2e250] [cursor=pointer]
              - alert [ref=f2e251]: 没办成：旧执行尚未排空或存在中断副作用；请核对产物后另提安排，未自动重放
              - generic [ref=f2e252]:
                - paragraph [ref=f2e253]: 任务与执行者已冻结；重复开始不会重放已有执行。中断后请先核对产物。
                - button "开始或继续未执行任务" [ref=f2e254] [cursor=pointer]
                - button "打开方案文件" [ref=f2e255] [cursor=pointer]
                - code [ref=f2e256]: analysis/plans/2026-11-08-自动安排-完成当前数据任务.md
                - paragraph [ref=f2e257]: 对照：计划的产物 2 项 · 已生成 0 · 计划外 0
                - button "看清单" [ref=f2e258] [cursor=pointer]
          - button "有新内容" [ref=f2e259] [cursor=pointer]
        - generic [ref=f2e264]:
          - generic [ref=f2e265]:
            - button "工作目录：/var/folders/2t/y0qcl9r50cv427189l7px1000000gn/T/dawn-e2e-wzsE2c/workspace" [ref=f2e267] [cursor=pointer]:
              - generic [ref=f2e270]: workspace
            - generic [ref=f2e273]: 本机
          - textbox "输入问题，@ 引用文件，/ 使用指令" [ref=f2e279]
          - generic [ref=f2e280]:
            - generic [ref=f2e281]:
              - button "添加内容" [ref=f2e283] [cursor=pointer]
              - button "终端面板" [ref=f2e286] [cursor=pointer]
              - button "完全访问" [ref=f2e290] [cursor=pointer]
            - generic [ref=f2e295]:
              - button "上下文 —" [ref=f2e297] [cursor=pointer]: —
              - button "当前模型：deepseek-flash。点击切换" [ref=f2e302] [cursor=pointer]:
                - generic [ref=f2e306]: deepseek-flash
              - button "发送" [ref=f2e309] [cursor=pointer]
    - complementary "团队" [ref=f2e312]:
      - separator "调整面板宽度" [ref=f2e313]
      - generic [ref=f2e314]:
        - tablist "面板" [ref=f2e315]:
          - tab "文件" [ref=f2e316] [cursor=pointer]
          - tab "产物" [ref=f2e317] [cursor=pointer]
          - tab "笔记本" [ref=f2e318] [cursor=pointer]
          - tab "路线" [ref=f2e319] [cursor=pointer]
          - tab "审阅" [ref=f2e320] [cursor=pointer]
          - tab "团队" [selected] [ref=f2e321] [cursor=pointer]
          - tab "Bot" [ref=f2e322] [cursor=pointer]
        - button "更多面板" [ref=f2e324] [cursor=pointer]: ⋯
        - button "关闭面板" [ref=f2e325] [cursor=pointer]
      - region "运行总览" [ref=f2e330]:
        - generic [ref=f2e331]:
          - generic [ref=f2e332]:
            - text: 对话协作台
            - heading "协作" [level=3] [ref=f2e333]
          - button "刷新运行记录" [ref=f2e335] [cursor=pointer]
        - region "协作成果" [ref=f2e336]:
          - generic [ref=f2e337]:
            - generic [ref=f2e338]: 任务目标
            - heading "执行已批准任务安排" [level=3] [ref=f2e339]
          - generic [ref=f2e340]:
            - heading "协作进行中" [level=4] [ref=f2e341]
            - paragraph [ref=f2e342]: 查看当前任务与宿主反馈，核对下一步。
          - generic [ref=f2e343]:
            - generic [ref=f2e344]: 下一步 · 查看对应任务的证据与记录
            - button "查看交接输入" [ref=f2e345] [cursor=pointer]
          - generic [ref=f2e346]:
            - heading "验收成果与版本" [level=4] [ref=f2e347]
            - paragraph [ref=f2e348]: 尚无本轮已验收成果。
          - generic [ref=f2e349]:
            - paragraph [ref=f2e350]: 执行轮次未设上限 · 审阅预留未启用 · 在途 0 · 费用未记录
            - button "展开流程工作台" [ref=f2e351] [cursor=pointer]
        - paragraph [ref=f2e352]: 来自当前会话的统一编排；每两秒刷新
        - generic [ref=f2e353]:
          - strong [ref=f2e354]: 3 项任务
          - generic [ref=f2e355]: 0 项验收通过
          - generic [ref=f2e356]: 0 项活跃
        - generic [ref=f2e357]:
          - region "批准方案执行进度" [ref=f2e358]:
            - generic [ref=f2e359]:
              - strong [ref=f2e360]: 批准方案执行进度
              - generic [ref=f2e361]: 第 1 版
            - paragraph [ref=f2e362]: 计划 3 项 · 已启动 1 项
            - status [ref=f2e363]: 执行已暂停；核对产物后，只能显式继续未执行任务。
            - paragraph [ref=f2e364]: 用户已停止执行；等待旧任务排空后，核对产物再继续。
            - list [ref=f2e365]:
              - listitem [ref=f2e366]:
                - button "核查并清洗数据 member_1 · clean 执行失败" [ref=f2e367] [cursor=pointer]:
                  - generic [ref=f2e368]:
                    - strong [ref=f2e369]: 核查并清洗数据
                    - generic [ref=f2e370]: member_1 · clean
                  - generic [ref=f2e371]: 执行失败
                - paragraph [ref=f2e372]: 已中止，未采用迟到结果。
              - listitem [ref=f2e373]:
                - button "根据清洗结果建模 member_2 · model 前置任务未通过：核查并清洗数据" [ref=f2e374] [cursor=pointer]:
                  - generic [ref=f2e375]:
                    - strong [ref=f2e376]: 根据清洗结果建模
                    - generic [ref=f2e377]: member_2 · model
                  - generic [ref=f2e378]: 前置任务未通过：核查并清洗数据
              - listitem [ref=f2e379]:
                - button "独立审阅模型与证据 member_3 · review 前置任务未通过：根据清洗结果建模" [ref=f2e380] [cursor=pointer]:
                  - generic [ref=f2e381]:
                    - strong [ref=f2e382]: 独立审阅模型与证据
                    - generic [ref=f2e383]: member_3 · review
                  - generic [ref=f2e384]: 前置任务未通过：根据清洗结果建模
          - generic [ref=f2e385]:
            - heading "任务板" [level=4] [ref=f2e386]
            - button "核查并清洗数据" [ref=f2e387] [cursor=pointer]
            - button "根据清洗结果建模" [ref=f2e388] [cursor=pointer]
            - button "独立审阅模型与证据" [ref=f2e389] [cursor=pointer]
          - generic "协作任务" [ref=f2e390]:
            - button "data-engineer" [pressed] [ref=f2e392] [cursor=pointer]:
              - generic [ref=f2e393]: D
              - generic [ref=f2e394]:
                - strong [ref=f2e395]: data-engineer
                - generic [ref=f2e396]: 已取消并排空
                - generic [ref=f2e397]:
                  - generic [ref=f2e398]:
                    - generic [ref=f2e399]: 当前上下文
                    - generic [ref=f2e400]: 未知
                  - generic [ref=f2e401]:
                    - generic [ref=f2e402]: 已结算累计
                    - generic [ref=f2e403]: 输入或输出未记录
              - generic [ref=f2e404]:
                - generic [ref=f2e405]: 团队成员
                - generic [ref=f2e406]: 累计结算 0.1 秒
            - button "data-engineer" [ref=f2e408] [cursor=pointer]:
              - generic [ref=f2e409]: D
              - generic [ref=f2e410]:
                - strong [ref=f2e411]: data-engineer
                - generic [ref=f2e412]: 尚未执行
                - generic [ref=f2e413]:
                  - generic [ref=f2e414]:
                    - generic [ref=f2e415]: 当前上下文
                    - generic [ref=f2e416]: 未知
                  - generic [ref=f2e417]:
                    - generic [ref=f2e418]: 已结算累计
                    - generic [ref=f2e419]: 尚未结算
              - generic [ref=f2e420]:
                - generic [ref=f2e421]: 团队成员
                - generic [ref=f2e422]: 耗时未知
            - button "reviewer-two" [ref=f2e424] [cursor=pointer]:
              - generic [ref=f2e425]: R
              - generic [ref=f2e426]:
                - strong [ref=f2e427]: reviewer-two
                - generic [ref=f2e428]: 尚未执行
                - generic [ref=f2e429]:
                  - generic [ref=f2e430]:
                    - generic [ref=f2e431]: 当前上下文
                    - generic [ref=f2e432]: 未知
                  - generic [ref=f2e433]:
                    - generic [ref=f2e434]: 已结算累计
                    - generic [ref=f2e435]: 尚未结算
              - generic [ref=f2e436]:
                - generic [ref=f2e437]: 团队成员
                - generic [ref=f2e438]: 耗时未知
          - generic [ref=f2e439]:
            - generic [ref=f2e441]:
              - strong [ref=f2e442]: data-engineer
              - generic [ref=f2e443]: 类型 team · 执行代次 1
            - tablist "任务详情" [ref=f2e444]:
              - tab "过程" [selected] [ref=f2e445] [cursor=pointer]
              - tab "交接" [ref=f2e446] [cursor=pointer]
              - tab "产物" [ref=f2e447] [cursor=pointer]
              - tab "记录" [ref=f2e448] [cursor=pointer]
            - tabpanel "过程" [ref=f2e449]:
              - generic [ref=f2e450]:
                - generic [ref=f2e451]:
                  - generic [ref=f2e452]: 当前上下文
                  - generic [ref=f2e453]: 未知
                - generic [ref=f2e454]:
                  - generic [ref=f2e455]: 已结算累计
                  - generic [ref=f2e456]: 输入或输出未记录
                - group [ref=f2e457]:
                  - generic "查看观测来源与覆盖" [ref=f2e458] [cursor=pointer]
              - region "任务轨迹" [ref=f2e459]:
                - generic [ref=f2e460]:
                  - strong [ref=f2e461]: 任务轨迹
                  - generic [ref=f2e462]: 已取消并排空
                - paragraph [ref=f2e463]: 执行已中止
                - list [ref=f2e464]:
                  - listitem [ref=f2e465]:
                    - time [ref=f2e466]: 12:43:20
                    - generic [ref=f2e467]: 开始执行
                  - listitem [ref=f2e468]:
                    - time [ref=f2e469]: 12:43:20
                    - generic [ref=f2e470]: 核验冻结输入
                  - listitem [ref=f2e471]:
                    - time [ref=f2e472]: 12:43:20
                    - generic [ref=f2e473]: 后端执行
                  - listitem [ref=f2e474]:
                    - time [ref=f2e475]: 12:43:21
                    - generic [ref=f2e476]: 已请求停止
                  - listitem [ref=f2e477]:
                    - time [ref=f2e478]: 12:43:21
                    - generic [ref=f2e479]: 执行已结算
              - paragraph [ref=f2e480]: 普通委派任务
              - paragraph [ref=f2e481]: 暂无宿主验收回执
            - region "成员会话与操作" [ref=f2e482]:
              - generic [ref=f2e483]:
                - strong [ref=f2e484]: 成员会话与操作
                - generic [ref=f2e485]: member_1
              - paragraph [ref=f2e486]: 数据核查员
              - generic [ref=f2e487]:
                - generic [ref=f2e488]:
                  - term [ref=f2e489]: 当前状态
                  - definition [ref=f2e490]: 已取消并排空
                - generic [ref=f2e491]:
                  - term [ref=f2e492]: 验收
                  - definition [ref=f2e493]: 等待本轮宿主结算
                - generic [ref=f2e494]:
                  - term [ref=f2e495]: 文件版本
                  - definition [ref=f2e496]: 本轮尚未结算
              - group [ref=f2e497]:
                - generic "状态说明" [ref=f2e498] [cursor=pointer]
              - group [ref=f2e499]:
                - generic "成员邮箱记录" [ref=f2e500] [cursor=pointer]
              - button "准备给队长的指令" [ref=f2e501] [cursor=pointer]
        - region "自动安排" [ref=f2e502]:
          - heading "自动安排" [level=4] [ref=f2e503]
          - paragraph [ref=f2e504]: 方案第 1 版 · 已批准
          - region "任务安排结果" [ref=f2e505]:
            - generic [ref=f2e506]:
              - strong [ref=f2e507]:
                - status "任务块数" [ref=f2e508]: 3 个任务块
              - generic [ref=f2e509]: 科研流水线
            - paragraph [ref=f2e510]: 后一步依赖前一步的产物，审阅使用独立角色。
            - paragraph [ref=f2e511]: 采纳后按这些任务、执行者和契约启动；当前仍为待执行方案。
            - list [ref=f2e512]:
              - listitem [ref=f2e513]:
                - strong [ref=f2e515]: 核查并清洗数据
                - paragraph [ref=f2e516]: 核查并清洗数据（本地自动安排夹具）
                - paragraph [ref=f2e517]:
                  - generic [ref=f2e518]: 分工：
                  - text: 数据核查员
                - paragraph [ref=f2e519]:
                  - generic [ref=f2e520]: 执行者：
                  - text: data-engineer
                  - generic [ref=f2e521]: · 限定产物写入
                - generic [ref=f2e522]: 依赖：没有前置
                - group [ref=f2e523]:
                  - generic "文件与验收条件" [ref=f2e524] [cursor=pointer]
              - listitem [ref=f2e525]:
                - strong [ref=f2e527]: 根据清洗结果建模
                - paragraph [ref=f2e528]: 根据清洗结果建模（本地自动安排夹具）
                - paragraph [ref=f2e529]:
                  - generic [ref=f2e530]: 分工：
                  - text: 统计分析员
                - paragraph [ref=f2e531]:
                  - generic [ref=f2e532]: 执行者：
                  - text: data-engineer
                  - generic [ref=f2e533]: · 限定产物写入
                - generic [ref=f2e534]: 依赖：核查并清洗数据
                - group [ref=f2e535]:
                  - generic "文件与验收条件" [ref=f2e536] [cursor=pointer]
              - listitem [ref=f2e537]:
                - generic [ref=f2e538]:
                  - strong [ref=f2e539]: 独立审阅模型与证据
                  - generic [ref=f2e540]: 独立审阅
                - paragraph [ref=f2e541]: 独立审阅模型与证据（本地自动安排夹具）
                - paragraph [ref=f2e542]:
                  - generic [ref=f2e543]: 分工：
                  - text: 独立审阅员
                - paragraph [ref=f2e544]:
                  - generic [ref=f2e545]: 执行者：
                  - text: reviewer-two
                  - generic [ref=f2e546]: · 只读
                - generic [ref=f2e547]: 依赖：根据清洗结果建模
                - group [ref=f2e548]:
                  - generic "文件与验收条件" [ref=f2e549] [cursor=pointer]
          - group [ref=f2e550]:
            - generic "调整任务与分工" [ref=f2e551] [cursor=pointer]
          - paragraph [ref=f2e552]: 可在对话中的方案卡修改并采纳，或补充调整要求后重新安排。
          - paragraph [ref=f2e553]: 先出方案期间只读查看；采纳后才进入原有执行与验收流程。
        - generic [ref=f2e554]:
          - group [ref=f2e555]:
            - generic "查看额度" [ref=f2e556] [cursor=pointer]
          - group [ref=f2e557]:
            - generic "会话完整执行记录" [ref=f2e558] [cursor=pointer]
  - contentinfo "应用状态" [ref=f2e559]:
    - button "还没有填任何 API key，暂时不能对话——点这里填一个" [ref=f2e561] [cursor=pointer]
    - generic [ref=f2e562]:
      - generic [ref=f2e563]:
        - button "当前模型：deepseek-flash" [ref=f2e564] [cursor=pointer]:
          - generic [ref=f2e568]: deepseek-flash
        - button "R：未配置" [ref=f2e569] [cursor=pointer]:
          - generic [ref=f2e571]: R
          - generic [ref=f2e572]: 未配置
        - button "Python：未配置" [ref=f2e573] [cursor=pointer]:
          - generic [ref=f2e575]: Python
          - generic [ref=f2e576]: 未配置
      - generic [ref=f2e577]:
        - generic [ref=f2e578]:
          - button "插件 8" [ref=f2e579] [cursor=pointer]:
            - generic [ref=f2e582]: 插件
            - generic [ref=f2e583]: "8"
          - button "Skills 9" [ref=f2e584] [cursor=pointer]:
            - generic [ref=f2e588]: Skills
            - generic [ref=f2e589]: "9"
          - button "MCP 0" [ref=f2e590] [cursor=pointer]:
            - generic [ref=f2e593]: MCP
            - generic [ref=f2e594]: "0"
          - button "子 Agent 22" [ref=f2e595] [cursor=pointer]:
            - generic [ref=f2e598]: 子 Agent
            - generic [ref=f2e599]: "22"
        - button "版本 v0.0.44" [ref=f2e600] [cursor=pointer]: v0.0.44
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
  33 |  await expect(overview.getByRole('tab',{name:'过程',exact:true})).toHaveAttribute('aria-selected','true')
  34 |  const workflowBox=await overview.getByRole('region',{name:'流程工作台',exact:true}).boundingBox(),detailBox=await overview.locator('.collaboration-detail').boundingBox()
  35 |  expect(detailBox!.x).toBeGreaterThanOrEqual(workflowBox!.x+workflowBox!.width-1)
  36 |  await overview.getByRole('tab',{name:'记录',exact:true}).click()
  37 |  await expect(overview.locator('.collaboration-detail')).toContainText('工具记录')
  38 |  await page.screenshot({path:join(out,'stage-c-task-records.png')})
  39 |  await overview.getByRole('button',{name:'收起检查面板',exact:true}).click()
  40 |  await page.screenshot({path:join(out,'stage-c-workflow.png')})
  41 |  await overview.getByRole('button',{name:'返回对话协作台',exact:true}).click()
  42 |  await expect(page.getByRole('dialog',{name:'流程工作台',exact:true})).toHaveCount(0)
  43 |  await expect(overview.getByRole('tab',{name:'记录',exact:true})).toHaveAttribute('aria-selected','true')
  44 |  const reopened=await dawn.重开()
  45 |  await reopened.getByRole('button',{name:/^请为以下具体任务自动安排/}).click();await 进坞(reopened,'团队')
  46 |  overview=reopened.getByRole('region',{name:'运行总览',exact:true})
  47 |  await expect(overview.getByRole('region',{name:'批准方案执行进度',exact:true}).getByText('宿主验收通过',{exact:true})).toHaveCount(3)
  48 |  await reopened.screenshot({path:join(out,'stage-c-restored.png')})
  49 | })
  50 | test.describe('stopping bound work',()=>{
  51 |  test.use({dawnOptions:{gitInit:true,firstChunkDelayMs:1500}})
  52 |  test('stops the approved task, drains its process and never replays it after reopening',async({dawn})=>{
  53 |   const{page,workspace}=dawn;writeFileSync(join(workspace,'input.csv'),'x\n1\n2\n3\n')
  54 |   await 在项目里开会话(page);await 进坞(page,'团队')
  55 |   const auto=page.getByRole('region',{name:'自动安排',exact:true})
  56 |   await auto.getByRole('textbox',{name:'任务目标',exact:true}).fill('清洗、建模并独立审阅 input.csv')
  57 |   await auto.getByRole('button',{name:'生成安排',exact:true}).click()
  58 |   await expect(auto.getByRole('status',{name:'任务块数',exact:true})).toHaveText('3 个任务块')
  59 |   await page.locator('main.main .plan-card').getByRole('button',{name:'照这个做',exact:true}).click()
  60 |   let overview=page.getByRole('region',{name:'运行总览',exact:true})
  61 |   await overview.getByRole('button',{name:'停止本方案执行',exact:true}).click()
  62 |   await expect(overview).toContainText('用户已停止执行')
  63 |   await expect(overview.locator('.run-overview-row[data-phase="running"],.run-overview-row[data-phase="stopping"],.run-overview-row[data-phase="queued"]')).toHaveCount(0)
  64 |   mkdirSync(out,{recursive:true});await page.screenshot({path:join(out,'stage-b-stopped.png')})
  65 |   const reopened=await dawn.重开()
  66 |   await reopened.getByRole('button',{name:/^请为以下具体任务自动安排/}).click();await 进坞(reopened,'团队')
  67 |   overview=reopened.getByRole('region',{name:'运行总览',exact:true})
  68 |   await expect(overview).toContainText('执行已暂停')
  69 |   const before=dawn.requests.length,card=reopened.locator('main.main .plan-card')
  70 |   await card.getByRole('button',{name:'开始或继续未执行任务',exact:true}).click()
  71 |   await expect(card.getByRole('alert')).toContainText('副作用')
> 72 |   expect(dawn.requests.length).toBe(before)
     |                                ^ Error: expect(received).toBe(expected) // Object.is equality
  73 |  })
  74 | })
  75 | 
```