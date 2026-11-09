# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: planning-contract-source.spec.ts >> confirms source, plans from live catalog and executes through original scientific acceptance
- Location: e2e/planning-contract-source.spec.ts:6:1

# Error details

```
TypeError: Cannot read properties of undefined (reading 'mean')
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
      - button "打开协作：2 项任务 · 2 项验收通过" [ref=f3e119] [cursor=pointer]:
        - strong [ref=f3e122]: 协作
        - generic [ref=f3e123]: 本轮成果已验收
        - generic [ref=f3e124]: 2 项任务 · 2 项验收通过
        - generic [ref=f3e125]: ›
      - generic [ref=f3e126]:
        - toolbar "会话工具栏" [ref=f3e127]:
          - group "会话操作：请为以下具体任务自动安排。先只读理解目标" [ref=f3e129]:
            - button "查找当前对话" [ref=f3e131] [cursor=pointer]
            - button "导出对话" [ref=f3e135] [cursor=pointer]
        - generic [ref=f3e140]:
          - generic [ref=f3e141]:
            - generic [ref=f3e142]: 你
            - generic [ref=f3e144]:
              - generic [ref=f3e147]:
                - paragraph [ref=f3e148]: 请为以下具体任务自动安排。先只读理解目标、数据和已有会话约束，再用 propose_plan 的 arrangement 提交任务划分、分工、输入输出、依赖、验收与理由。
                - paragraph [ref=f3e149]: 任务数量是方案结果，由实际任务决定；简单单结果任务优先一个任务块，不能固定拆成三块，也不要让用户预填数字。只有依赖、独立输入、权限边界或明确审阅要求才增加分工；请在理由里解释额外分工的实际作用。并行仅用于独立任务且不能共写；用户要求独立审阅时必须保留不同执行角色的审阅任务。缺信息放入 questions，不编造数据或启动执行。
                - paragraph [ref=f3e150]: 任务目标： 计算 input.csv 的均值，按确认科学约束完成并独立审阅
                - paragraph [ref=f3e151]: 原有冻结契约、证据、产物版本、预算、产物锁和恢复要求继续适用。请交可调整的方案，等待用户采纳；这次只规划，不写科研产物、不派子 Agent。
              - generic [ref=f3e152]:
                - time [ref=f3e153]: 2026-11-09 23:35
                - button "复制我说的这段" [ref=f3e154] [cursor=pointer]
                - button "修改" [ref=f3e160] [cursor=pointer]
                - button "回到这句之前" [ref=f3e164] [cursor=pointer]
          - generic [ref=f3e167]:
            - generic [ref=f3e168]:
              - generic [ref=f3e169]: D
              - generic [ref=f3e170]: DeepSeek
            - generic [ref=f3e171]:
              - paragraph [ref=f3e175]: 先查看本会话已确认的科研约束。
              - button "复制这段回答" [ref=f3e177] [cursor=pointer]
          - button "已完成 用时 0 秒 1 步" [expanded] [ref=f3e183] [cursor=pointer]:
            - generic [ref=f3e186]: 已完成
            - generic [ref=f3e187]: 用时 0 秒
            - generic [ref=f3e188]: 1 步
          - 'button "✓ get_plan_contracts {} 成功" [ref=f3e190] [cursor=pointer]':
            - generic [ref=f3e193]: ✓ get_plan_contracts
            - generic [ref=f3e194]: "{}"
            - generic [ref=f3e195]: 成功
          - generic [ref=f3e196]:
            - generic [ref=f3e197]:
              - generic [ref=f3e198]: D
              - generic [ref=f3e199]: DeepSeek
            - generic [ref=f3e200]:
              - paragraph [ref=f3e204]: 已引用当前约束；等待你采纳后才执行。
              - note [ref=f3e205]:
                - generic [ref=f3e206]: 本轮产出未知
                - text: 远端会话或非 git 工作区，探针没跑
              - button "复制这段回答" [ref=f3e208] [cursor=pointer]
          - region "方案第 1 版" [active] [ref=f3e214]:
            - generic [ref=f3e215]:
              - generic [ref=f3e216]: 方案 · 第 1 版
              - generic [ref=f3e219]: 已批准 2026/11/9 23:35:31
            - heading "按科研约束自动安排" [level=3] [ref=f3e220]
            - region "任务安排结果" [ref=f3e221]:
              - generic [ref=f3e222]:
                - strong [ref=f3e223]:
                  - status "任务块数" [ref=f3e224]: 2 个任务块
                - generic [ref=f3e225]: 科研流水线
              - paragraph [ref=f3e226]: 使用当前已确认契约，按需独立审阅。
              - paragraph [ref=f3e227]: 方案已批准，任务与执行范围已冻结；实际执行与验收以协作记录为准。
              - list [ref=f3e228]:
                - listitem [ref=f3e229]:
                  - strong [ref=f3e231]: 按确认约束完成分析
                  - paragraph [ref=f3e232]: 按确认约束完成分析（本地科研契约夹具）
                  - paragraph [ref=f3e233]:
                    - generic [ref=f3e234]: 分工：
                    - text: 统计分析员
                  - paragraph [ref=f3e235]:
                    - generic [ref=f3e236]: 执行者：
                    - text: data-engineer
                    - generic [ref=f3e237]: · 允许执行，受现有权限控制
                  - generic [ref=f3e238]: 依赖：没有前置
                  - group [ref=f3e239]:
                    - generic "文件与验收条件" [ref=f3e240]
                - listitem [ref=f3e241]:
                  - generic [ref=f3e242]:
                    - strong [ref=f3e243]: 独立审阅分析与证据
                    - generic [ref=f3e244]: 独立审阅
                  - paragraph [ref=f3e245]: 独立审阅分析与证据（本地科研契约夹具）
                  - paragraph [ref=f3e246]:
                    - generic [ref=f3e247]: 分工：
                    - text: 独立审阅员
                  - paragraph [ref=f3e248]:
                    - generic [ref=f3e249]: 执行者：
                    - text: reviewer-two
                    - generic [ref=f3e250]: · 只读
                  - generic [ref=f3e251]: 依赖：按确认约束完成分析
                  - group [ref=f3e252]:
                    - generic "文件与验收条件" [ref=f3e253]
            - generic [ref=f3e256]:
              - heading "问题与假设" [level=2] [ref=f3e257]
              - paragraph [ref=f3e258]: 按本会话已确认的科学约束分析。
              - heading "数据与切分" [level=2] [ref=f3e259]
              - paragraph [ref=f3e260]: 保留声明输入。
              - heading "统计检验与模型" [level=2] [ref=f3e261]
              - paragraph [ref=f3e262]: 严格沿用宿主合同。
              - heading "图" [level=2] [ref=f3e263]
              - paragraph [ref=f3e264]: 不额外增加图形任务。
              - heading "产物" [level=2] [ref=f3e265]
              - paragraph [ref=f3e266]: 交付合同声明的脚本、结果和报告。
            - button "看全文" [ref=f3e267] [cursor=pointer]
            - generic [ref=f3e268]:
              - paragraph [ref=f3e269]: 任务与执行者已冻结；重复开始不会重放已有执行。中断后请先核对产物。
              - button "开始或继续未执行任务" [ref=f3e270] [cursor=pointer]
              - button "打开方案文件" [ref=f3e271] [cursor=pointer]
              - code [ref=f3e272]: analysis/plans/2026-11-09-按科研约束自动安排.md
              - paragraph [ref=f3e273]: 方案的「产物」一节里没有写路径，没什么可对照的
          - generic [ref=f3e274]:
            - generic [ref=f3e275]: 子 agent 2/2
            - generic [ref=f3e276]:
              - button "✓ member_1 · plan_1 完成" [ref=f3e278] [cursor=pointer]:
                - text: ✓ member_1 · plan_1
                - generic [ref=f3e279]: 完成
              - button "✓ member_2 · plan_2 完成" [ref=f3e281] [cursor=pointer]:
                - text: ✓ member_2 · plan_2
                - generic [ref=f3e282]: 完成
        - generic [ref=f3e284]:
          - generic [ref=f3e285]:
            - button "工作目录：/var/folders/2t/y0qcl9r50cv427189l7px1000000gn/T/dawn-e2e-CZUwW4/workspace" [ref=f3e287] [cursor=pointer]:
              - generic [ref=f3e290]: workspace
            - generic [ref=f3e293]: 本机
          - textbox "检查缺失值并说明处理方法" [ref=f3e299]
          - generic [ref=f3e300]:
            - generic [ref=f3e301]:
              - button "添加内容" [ref=f3e303] [cursor=pointer]
              - button "终端面板" [ref=f3e306] [cursor=pointer]
              - button "完全访问" [ref=f3e310] [cursor=pointer]
            - generic [ref=f3e315]:
              - button "上下文 —" [ref=f3e317] [cursor=pointer]: —
              - button "当前模型：deepseek-flash。点击切换" [ref=f3e322] [cursor=pointer]:
                - generic [ref=f3e323]: deepseek-flash
              - button "发送" [ref=f3e326] [cursor=pointer]
    - complementary "团队" [ref=f3e329]:
      - separator "调整面板宽度" [ref=f3e330]
      - generic [ref=f3e331]:
        - tablist "面板" [ref=f3e332]:
          - tab "文件" [ref=f3e333] [cursor=pointer]
          - tab "产物" [ref=f3e334] [cursor=pointer]:
            - text: 产物
            - generic [ref=f3e335]: "3"
          - tab "团队" [selected] [ref=f3e336] [cursor=pointer]
        - button "更多面板" [ref=f3e338] [cursor=pointer]: ⋯
        - button "关闭面板" [ref=f3e339] [cursor=pointer]
      - generic [ref=f3e343]:
        - region "运行总览" [ref=f3e344]:
          - generic [ref=f3e345]:
            - generic [ref=f3e346]:
              - text: 对话协作台
              - heading "协作" [level=3] [ref=f3e347]
            - generic [ref=f3e348]:
              - button "打开编排视图" [ref=f3e349] [cursor=pointer]: 编排视图
              - button "刷新运行记录" [ref=f3e350] [cursor=pointer]
          - region "协作成果" [ref=f3e351]:
            - generic [ref=f3e352]:
              - generic [ref=f3e353]: 任务目标
              - heading "执行已批准任务安排" [level=3] [ref=f3e354]
            - heading "本轮成果已验收" [level=4] [ref=f3e356]
            - generic [ref=f3e357]:
              - generic [ref=f3e358]: 下一步 · 查看对应任务的证据与记录
              - button "查看验收成果" [ref=f3e359] [cursor=pointer]
            - group [ref=f3e360]:
              - generic "成果版本与执行额度" [ref=f3e361] [cursor=pointer]
            - paragraph [ref=f3e362]: 窄面板显示摘要；展开可查看完整目标和成果版本。
            - button "展开流程工作台" [ref=f3e364] [cursor=pointer]
          - paragraph [ref=f3e365]: 来自当前会话的统一编排；每两秒刷新
          - generic [ref=f3e366]:
            - strong [ref=f3e367]: 2 项任务
            - generic [ref=f3e368]: 2 项验收通过
            - generic [ref=f3e369]: 0 项活跃
          - generic [ref=f3e370]:
            - region "批准方案执行进度" [ref=f3e371]:
              - generic [ref=f3e372]:
                - strong [ref=f3e373]: 批准方案执行进度
                - generic [ref=f3e374]: 第 1 版
              - paragraph [ref=f3e375]: 计划 2 项 · 已启动 2 项
              - list [ref=f3e376]:
                - listitem [ref=f3e377]:
                  - button "按确认约束完成分析 member_1 · analyze 宿主验收通过" [ref=f3e378] [cursor=pointer]:
                    - generic [ref=f3e379]:
                      - strong [ref=f3e380]: 按确认约束完成分析
                      - generic [ref=f3e381]: member_1 · analyze
                    - generic [ref=f3e382]: 宿主验收通过
                - listitem [ref=f3e383]:
                  - button "独立审阅分析与证据 member_2 · review 宿主验收通过" [ref=f3e384] [cursor=pointer]:
                    - generic [ref=f3e385]:
                      - strong [ref=f3e386]: 独立审阅分析与证据
                      - generic [ref=f3e387]: member_2 · review
                    - generic [ref=f3e388]: 宿主验收通过
            - generic [ref=f3e389]:
              - heading "任务板" [level=4] [ref=f3e390]
              - button "按确认约束完成分析" [ref=f3e391] [cursor=pointer]
              - button "独立审阅分析与证据" [ref=f3e392] [cursor=pointer]
            - generic "协作任务" [ref=f3e393]:
              - button "data-engineer" [pressed] [ref=f3e395] [cursor=pointer]:
                - generic [ref=f3e396]: D
                - generic [ref=f3e397]:
                  - strong [ref=f3e398]: data-engineer
                  - generic [ref=f3e399]: 执行完成
                  - generic [ref=f3e400]:
                    - generic [ref=f3e401]:
                      - generic [ref=f3e402]: 上次上下文 · 历史（估算）
                      - generic [ref=f3e403]: 29 tokens
                    - generic [ref=f3e404]:
                      - generic [ref=f3e405]: 已结算累计
                      - generic [ref=f3e406]: 80 tokens
                - generic [ref=f3e407]:
                  - generic [ref=f3e408]: 团队成员
                  - generic [ref=f3e409]: 累计结算 0.9 秒
              - button "reviewer-two" [ref=f3e411] [cursor=pointer]:
                - generic [ref=f3e412]: R
                - generic [ref=f3e413]:
                  - strong [ref=f3e414]: reviewer-two
                  - generic [ref=f3e415]: 执行完成
                  - generic [ref=f3e416]:
                    - generic [ref=f3e417]:
                      - generic [ref=f3e418]: 上次上下文 · 历史（估算）
                      - generic [ref=f3e419]: 29 tokens
                    - generic [ref=f3e420]:
                      - generic [ref=f3e421]: 已结算累计
                      - generic [ref=f3e422]: 80 tokens
                - generic [ref=f3e423]:
                  - generic [ref=f3e424]: 团队成员
                  - generic [ref=f3e425]: 累计结算 0.7 秒
            - generic [ref=f3e426]:
              - generic [ref=f3e428]:
                - strong [ref=f3e429]: data-engineer
                - generic [ref=f3e430]: 类型 team · 执行代次 1
              - tablist "任务详情" [ref=f3e431]:
                - tab "过程" [selected] [ref=f3e432] [cursor=pointer]
                - tab "交接" [ref=f3e433] [cursor=pointer]
                - tab "产物" [ref=f3e434] [cursor=pointer]
                - tab "记录" [ref=f3e435] [cursor=pointer]
              - tabpanel "过程" [ref=f3e436]:
                - generic [ref=f3e437]:
                  - generic [ref=f3e438]:
                    - generic [ref=f3e439]: 上次上下文 · 历史（估算）
                    - generic [ref=f3e440]: 29 tokens
                  - generic [ref=f3e441]:
                    - generic [ref=f3e442]: 已结算累计
                    - generic [ref=f3e443]: 80 tokens
                  - group [ref=f3e444]:
                    - generic "查看观测来源与覆盖" [ref=f3e445] [cursor=pointer]
                - region "任务轨迹" [ref=f3e446]:
                  - generic [ref=f3e447]:
                    - strong [ref=f3e448]: 任务轨迹
                    - generic [ref=f3e449]: 执行完成
                  - list [ref=f3e450]:
                    - listitem [ref=f3e451]:
                      - time [ref=f3e452]: 23:35:31
                      - generic [ref=f3e453]: 开始执行
                    - listitem [ref=f3e454]:
                      - time [ref=f3e455]: 23:35:31
                      - generic [ref=f3e456]: 核验冻结输入
                    - listitem [ref=f3e457]:
                      - time [ref=f3e458]: 23:35:31
                      - generic [ref=f3e459]: 后端执行
                    - listitem [ref=f3e460]:
                      - time [ref=f3e461]: 23:35:32
                      - generic [ref=f3e462]: 宿主验收
                    - listitem [ref=f3e463]:
                      - time [ref=f3e464]: 23:35:32
                      - generic [ref=f3e465]: 执行已结算
                      - generic [ref=f3e466]: 宿主验收通过
                  - generic [ref=f3e467]:
                    - button "查看 3 条工具记录" [ref=f3e468] [cursor=pointer]
                    - button "查看 3 个产物版本" [ref=f3e469] [cursor=pointer]
                - paragraph [ref=f3e470]: 普通委派任务
                - paragraph [ref=f3e471]: 宿主验收通过
              - region "成员会话与操作" [ref=f3e472]:
                - generic [ref=f3e473]:
                  - strong [ref=f3e474]: 成员会话与操作
                  - generic [ref=f3e475]: member_1
                - paragraph [ref=f3e476]: 统计分析员
                - paragraph [ref=f3e477]: 分工已冻结；需要调整时请回到自动安排。
                - generic [ref=f3e478]:
                  - generic [ref=f3e479]:
                    - term [ref=f3e480]: 当前状态
                    - definition [ref=f3e481]: 执行完成
                  - generic [ref=f3e482]:
                    - term [ref=f3e483]: 验收
                    - definition [ref=f3e484]: 通过
                  - generic [ref=f3e485]:
                    - term [ref=f3e486]: 文件版本
                    - definition [ref=f3e487]: 输入 1 · 产物 3
                - group [ref=f3e488]:
                  - generic "成员邮箱记录" [ref=f3e489] [cursor=pointer]
          - region "自动安排" [ref=f3e490]:
            - heading "自动安排" [level=4] [ref=f3e491]
            - group [ref=f3e492]:
              - generic "科研任务约束 · 第 1 版" [ref=f3e493] [cursor=pointer]
              - option "mean" [selected]
              - option "sum"
              - option "min"
              - option "max"
              - option "请选择"
              - option "遇到缺失时停止" [selected]
              - option "排除缺失值后计算"
            - paragraph [ref=f3e494]: 方案第 1 版 · 已批准
            - region "任务安排结果" [ref=f3e495]:
              - generic [ref=f3e496]:
                - strong [ref=f3e497]:
                  - status "任务块数" [ref=f3e498]: 2 个任务块
                - generic [ref=f3e499]: 科研流水线
              - paragraph [ref=f3e500]: 使用当前已确认契约，按需独立审阅。
              - paragraph [ref=f3e501]: 方案已批准，任务与执行范围已冻结；实际执行与验收以协作记录为准。
              - list [ref=f3e502]:
                - listitem [ref=f3e503]:
                  - strong [ref=f3e505]: 按确认约束完成分析
                  - paragraph [ref=f3e506]: 按确认约束完成分析（本地科研契约夹具）
                  - paragraph [ref=f3e507]:
                    - generic [ref=f3e508]: 分工：
                    - text: 统计分析员
                  - paragraph [ref=f3e509]:
                    - generic [ref=f3e510]: 执行者：
                    - text: data-engineer
                    - generic [ref=f3e511]: · 允许执行，受现有权限控制
                  - generic [ref=f3e512]: 依赖：没有前置
                  - group [ref=f3e513]:
                    - generic "文件与验收条件" [ref=f3e514] [cursor=pointer]
                - listitem [ref=f3e515]:
                  - generic [ref=f3e516]:
                    - strong [ref=f3e517]: 独立审阅分析与证据
                    - generic [ref=f3e518]: 独立审阅
                  - paragraph [ref=f3e519]: 独立审阅分析与证据（本地科研契约夹具）
                  - paragraph [ref=f3e520]:
                    - generic [ref=f3e521]: 分工：
                    - text: 独立审阅员
                  - paragraph [ref=f3e522]:
                    - generic [ref=f3e523]: 执行者：
                    - text: reviewer-two
                    - generic [ref=f3e524]: · 只读
                  - generic [ref=f3e525]: 依赖：按确认约束完成分析
                  - group [ref=f3e526]:
                    - generic "文件与验收条件" [ref=f3e527] [cursor=pointer]
            - group [ref=f3e528]:
              - generic "调整任务与分工" [ref=f3e529] [cursor=pointer]
            - paragraph [ref=f3e530]: 如需调整分工，请补充调整要求并重新安排；原有任务不会自动重跑。
            - paragraph [ref=f3e531]: 先出方案期间只读查看；采纳后才进入原有执行与验收流程。
          - generic [ref=f3e532]:
            - group [ref=f3e533]:
              - generic "查看额度" [ref=f3e534] [cursor=pointer]
            - group [ref=f3e535]:
              - generic "会话完整执行记录" [ref=f3e536] [cursor=pointer]
        - group [ref=f3e537]:
          - generic "团队管理与原始记录" [ref=f3e538] [cursor=pointer]
  - contentinfo "应用状态" [ref=f3e539]:
    - button "还没有填任何 API key，暂时不能对话——点这里填一个" [ref=f3e541] [cursor=pointer]
    - generic [ref=f3e542]:
      - generic [ref=f3e543]:
        - button "当前模型：deepseek-flash" [ref=f3e544] [cursor=pointer]:
          - generic [ref=f3e548]: deepseek-flash
        - button "R：未配置" [ref=f3e549] [cursor=pointer]:
          - generic [ref=f3e551]: R
          - generic [ref=f3e552]: 未配置
        - button "Python：未配置" [ref=f3e553] [cursor=pointer]:
          - generic [ref=f3e555]: Python
          - generic [ref=f3e556]: 未配置
      - generic [ref=f3e557]:
        - button "扩展数量" [ref=f3e558] [cursor=pointer]:
          - generic [ref=f3e561]: 扩展
        - button "版本 v0.0.44" [ref=f3e562] [cursor=pointer]: v0.0.44
```

# Test source

```ts
  1  | import {mkdirSync,writeFileSync,readFileSync,existsSync} from 'node:fs'
  2  | import {join,resolve} from 'node:path'
  3  | import {test,expect,在项目里开会话,进坞} from './fixtures.js'
  4  | const out=resolve('docs/validation/contract-catalog-recheck-20261109/b-product/desktop')
  5  | test.use({dawnOptions:{gitInit:true}})
  6  | test('confirms source, plans from live catalog and executes through original scientific acceptance',async({dawn})=>{
  7  |  const{page,workspace}=dawn;mkdirSync(out,{recursive:true});writeFileSync(join(workspace,'input.csv'),'x\n1\n2\n3\n')
  8  |  await dawn.app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0]!.setContentSize(1000,780))
  9  |  await 在项目里开会话(page);await 进坞(page,'团队')
  10 |  const auto=page.getByRole('region',{name:'自动安排',exact:true}),source=auto.locator('.planning-contract-source')
  11 |  await expect(source.locator('summary')).toBeVisible();expect(await source.getAttribute('open')).toBeNull()
  12 |  await source.locator('summary').click()
  13 |  await source.getByRole('button',{name:'确认约束',exact:true}).click();await expect(source.getByRole('alert')).toContainText('请补齐')
  14 |  await source.screenshot({path:join(out,'missing-scientific-values.png')})
  15 |  for(const[name,value]of [['输入文件（每行一个）','input.csv'],['产物目录','results'],['分析方法','arithmetic mean'],['数据单位','m'],['缺失值处理','block']] as const)await source.getByRole('textbox',{name,exact:true}).fill(value)
  16 |  await source.getByLabel('增加独立数值核验',{exact:true}).check();await source.getByRole('textbox',{name:'核验数据文件',exact:true}).fill('input.csv');await source.getByRole('textbox',{name:'核验列名',exact:true}).fill('x');await source.getByRole('combobox',{name:'数值缺失规则',exact:true}).selectOption('block');await source.getByLabel('要求独立审阅',{exact:true}).check()
  17 |  const before=dawn.requests.length
  18 |  await source.getByRole('button',{name:'确认约束',exact:true}).click();await expect(source.getByRole('status')).toContainText('约束已保存')
  19 |  expect(dawn.requests.length).toBe(before);expect(existsSync(join(workspace,'results/result.json'))).toBe(false)
  20 |  await source.screenshot({path:join(out,'confirmed-source.png')})
  21 |  await source.locator('summary').click();await auto.getByRole('textbox',{name:'任务目标',exact:true}).fill('计算 input.csv 的均值，按确认科学约束完成并独立审阅')
  22 |  await auto.getByRole('button',{name:'生成安排',exact:true}).click();await expect(auto.getByRole('status',{name:'任务块数',exact:true})).toHaveText('2 个任务块')
  23 |  await expect(auto.getByRole('alert')).toHaveCount(0);expect(existsSync(join(workspace,'results/result.json'))).toBe(false)
  24 |  await auto.locator('.task-arrangement-result').screenshot({path:join(out,'catalog-bound-plan.png')})
  25 |  const card=page.locator('main.main .plan-card');await card.getByRole('button',{name:'照这个做',exact:true}).click();await expect(card).toHaveAttribute('data-status','approved')
  26 |  const progress=page.getByRole('region',{name:'批准方案执行进度',exact:true});await expect(progress.getByText('宿主验收通过',{exact:true})).toHaveCount(2)
> 27 |  expect(JSON.parse(readFileSync(join(workspace,'results/result.json'),'utf8')).metrics.mean).toBe(2)
     |                                                                                       ^ TypeError: Cannot read properties of undefined (reading 'mean')
  28 |  expect(readFileSync(join(workspace,'input.csv'),'utf8')).toBe('x\n1\n2\n3\n')
  29 |  await progress.scrollIntoViewIfNeeded();await page.screenshot({path:join(out,'executed-scientific-receipts.png')})
  30 |  await page.getByRole('button',{name:'打开编排视图',exact:true}).click();const dialog=page.getByRole('dialog',{name:'流程工作台',exact:true});await expect(dialog).toBeVisible();await page.screenshot({path:join(out,'expanded-workflow.png')});await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0)
  31 |  const reopened=await dawn.重开();await reopened.getByRole('button',{name:/^请为以下具体任务自动安排/}).click();await 进坞(reopened,'团队')
  32 |  const restored=reopened.locator('.planning-contract-source');await restored.locator('summary').click();await expect(restored.getByRole('textbox',{name:'数据单位',exact:true})).toHaveValue('m');await expect(restored.getByRole('status')).toContainText('已确认第 1 版')
  33 |  await dawn.app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0]!.setContentSize(900,640));await restored.getByRole('button',{name:'确认约束',exact:true}).scrollIntoViewIfNeeded();await expect(restored.getByRole('button',{name:'确认约束',exact:true})).toBeInViewport();await reopened.screenshot({path:join(out,'restored-narrow.png')})
  34 | })
  35 |
```
