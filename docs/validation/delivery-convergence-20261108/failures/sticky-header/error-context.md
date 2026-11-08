# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: collaboration-network.spec.ts >> renders a complete dark workflow workbench from eight real child executions, with linked selection and filters
- Location: e2e/collaboration-network.spec.ts:10:1

# Error details

```
Error: expect(received).toBeLessThanOrEqual(expected)

Expected: <= 2
Received:    16.5

Call Log:
- Timeout 25000ms exceeded while waiting on the predicate
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
            - tab "展示八项真实委派" [selected] [ref=f4e23] [cursor=pointer]
            - button "关掉「展示八项真实委派」（收进归档）" [ref=f4e26] [cursor=pointer]
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
                  - button "展示八项真实委派 刚刚" [ref=f4e83]:
                    - generic [ref=f4e84]: 展示八项真实委派
                    - generic [ref=f4e88]: 刚刚
                  - button "会话操作：展示八项真实委派" [ref=f4e90] [cursor=pointer]: ⋯
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
        - button "打开协作：8 项任务 · 0 项验收通过" [ref=f4e119] [cursor=pointer]:
          - strong [ref=f4e122]: 协作
          - generic [ref=f4e123]: 当前成果尚未核验
          - generic [ref=f4e124]: 8 项任务 · 0 项验收通过
          - generic [ref=f4e125]: ›
        - generic [ref=f4e126]:
          - toolbar "会话工具栏" [ref=f4e127]:
            - group "会话操作：展示八项真实委派" [ref=f4e129]:
              - button "查找当前对话" [ref=f4e131] [cursor=pointer]
              - button "导出对话" [ref=f4e135] [cursor=pointer]
          - generic [ref=f4e140]:
            - generic [ref=f4e141]:
              - generic [ref=f4e142]: 你
              - generic [ref=f4e144]:
                - paragraph [ref=f4e148]: 展示八项真实委派
                - generic [ref=f4e149]:
                  - time [ref=f4e150]: 2026-11-08 15:41
                  - button "复制我说的这段" [ref=f4e151] [cursor=pointer]
                  - button "修改" [ref=f4e157] [cursor=pointer]
                  - button "回到这句之前" [ref=f4e161] [cursor=pointer]
            - button "已完成 用时 11 秒 1 步" [expanded] [ref=f4e165] [cursor=pointer]:
              - generic [ref=f4e168]: 已完成
              - generic [ref=f4e169]: 用时 11 秒
              - generic [ref=f4e170]: 1 步
            - 'button "✓ subagent {\"tasks\":[{\"agent\":\"数据核查与输入完整性验证：包含长中文职责名称的成员\",\"task\":\"锁演示持有任务，等待工具完成。\"},{\"agent\":\"统计分析\",\"task\":\"协作台演示任务1，用一句话确认。\"},{\"agent\":\"方法审阅\",\"task\":\"协作台演示任务2，用一句话确认。\"},{\"agent\":\"图表复核\",\"task\":\"协作台演示任务3，用一句话确认。\"… 11 秒 成功" [ref=f4e172] [cursor=pointer]':
              - generic [ref=f4e175]: ✓ subagent
              - generic [ref=f4e176]: "{\"tasks\":[{\"agent\":\"数据核查与输入完整性验证：包含长中文职责名称的成员\",\"task\":\"锁演示持有任务，等待工具完成。\"},{\"agent\":\"统计分析\",\"task\":\"协作台演示任务1，用一句话确认。\"},{\"agent\":\"方法审阅\",\"task\":\"协作台演示任务2，用一句话确认。\"},{\"agent\":\"图表复核\",\"task\":\"协作台演示任务3，用一句话确认。\"…"
              - generic "耗时" [ref=f4e177]: 11 秒
              - generic [ref=f4e178]: 成功
            - generic [ref=f4e179]:
              - generic [ref=f4e180]: 子 agent 8/8
              - generic [ref=f4e181]:
                - button "✓ 数据核查与输入完整性验证：包含长中文职责名称的成员 完成" [ref=f4e183] [cursor=pointer]:
                  - text: ✓ 数据核查与输入完整性验证：包含长中文职责名称的成员
                  - generic [ref=f4e184]: 完成
                - button "✓ 统计分析 完成" [ref=f4e186] [cursor=pointer]:
                  - text: ✓ 统计分析
                  - generic [ref=f4e187]: 完成
                - button "✓ 方法审阅 完成" [ref=f4e189] [cursor=pointer]:
                  - text: ✓ 方法审阅
                  - generic [ref=f4e190]: 完成
                - button "✓ 图表复核 完成" [ref=f4e192] [cursor=pointer]:
                  - text: ✓ 图表复核
                  - generic [ref=f4e193]: 完成
                - button "✓ 文献核对 完成" [ref=f4e195] [cursor=pointer]:
                  - text: ✓ 文献核对
                  - generic [ref=f4e196]: 完成
                - button "✓ 单位检查 完成" [ref=f4e198] [cursor=pointer]:
                  - text: ✓ 单位检查
                  - generic [ref=f4e199]: 完成
                - button "✓ 报告整理 完成" [ref=f4e201] [cursor=pointer]:
                  - text: ✓ 报告整理
                  - generic [ref=f4e202]: 完成
                - button "✓ 独立审阅 完成" [ref=f4e204] [cursor=pointer]:
                  - text: ✓ 独立审阅
                  - generic [ref=f4e205]: 完成
            - generic [ref=f4e206]:
              - generic [ref=f4e207]:
                - generic [ref=f4e208]: D
                - generic [ref=f4e209]: DeepSeek
              - generic [ref=f4e210]:
                - paragraph [ref=f4e214]: 假模型已应答：DAWN 的整条链路是通的。
                - generic [ref=f4e215]:
                  - button "复制这段回答" [ref=f4e216] [cursor=pointer]
                  - paragraph [ref=f4e222]: 输入 12 · 输出 8 · 缓存 0 token
          - generic [ref=f4e223]:
            - generic [ref=f4e224]:
              - generic [ref=f4e225]:
                - button "工作目录：/var/folders/2t/y0qcl9r50cv427189l7px1000000gn/T/dawn-e2e-8lkqoy/workspace" [ref=f4e227] [cursor=pointer]:
                  - generic [ref=f4e230]: workspace
                - generic [ref=f4e233]: 本机
              - textbox "检查缺失值并说明处理方法" [ref=f4e239]
              - generic [ref=f4e240]:
                - generic [ref=f4e241]:
                  - button "添加内容" [ref=f4e243] [cursor=pointer]
                  - button "终端面板" [ref=f4e246] [cursor=pointer]
                  - button "完全访问" [ref=f4e250] [cursor=pointer]
                - generic [ref=f4e255]:
                  - button "上下文 <1%" [ref=f4e257] [cursor=pointer]: <1%
                  - button "当前模型：deepseek-flash。点击切换" [ref=f4e262] [cursor=pointer]:
                    - generic [ref=f4e266]: deepseek-flash
                  - button "发送" [ref=f4e269] [cursor=pointer]
            - generic "这一整段对话累计" [ref=f4e274]: 1 轮 · 工具 1 次 12.0 s · 输入 12 · 输出 8 · 缓存 0 · 命中 0%
      - complementary "团队" [ref=f4e275]:
        - separator "调整面板宽度" [ref=f4e276]
        - generic [ref=f4e277]:
          - tablist "面板" [ref=f4e278]:
            - tab "文件" [ref=f4e279] [cursor=pointer]
            - tab "产物" [ref=f4e280] [cursor=pointer]
            - tab "笔记本" [ref=f4e281] [cursor=pointer]
            - tab "路线" [ref=f4e282] [cursor=pointer]
            - tab "审阅" [ref=f4e283] [cursor=pointer]
            - tab "团队" [selected] [ref=f4e284] [cursor=pointer]
            - tab "Bot" [ref=f4e285] [cursor=pointer]
          - button "更多面板" [ref=f4e287] [cursor=pointer]: ⋯
          - button "关闭面板" [ref=f4e288] [cursor=pointer]
    - contentinfo "应用状态" [ref=f4e292]:
      - button "还没有填任何 API key，暂时不能对话——点这里填一个" [ref=f4e294] [cursor=pointer]
      - generic [ref=f4e295]:
        - generic [ref=f4e296]:
          - button "当前模型：deepseek-flash" [ref=f4e297] [cursor=pointer]:
            - generic [ref=f4e301]: deepseek-flash
          - button "R：未配置" [ref=f4e302] [cursor=pointer]:
            - generic [ref=f4e304]: R
            - generic [ref=f4e305]: 未配置
          - button "Python：未配置" [ref=f4e306] [cursor=pointer]:
            - generic [ref=f4e308]: Python
            - generic [ref=f4e309]: 未配置
        - generic [ref=f4e310]:
          - generic [ref=f4e311]:
            - button "插件 8" [ref=f4e312] [cursor=pointer]:
              - generic [ref=f4e315]: 插件
              - generic [ref=f4e316]: "8"
            - button "Skills 9" [ref=f4e317] [cursor=pointer]:
              - generic [ref=f4e321]: Skills
              - generic [ref=f4e322]: "9"
            - button "MCP 0" [ref=f4e323] [cursor=pointer]:
              - generic [ref=f4e326]: MCP
              - generic [ref=f4e327]: "0"
            - button "子 Agent 30" [ref=f4e328] [cursor=pointer]:
              - generic [ref=f4e331]: 子 Agent
              - generic [ref=f4e332]: "30"
          - button "版本 v0.0.44" [ref=f4e333] [cursor=pointer]: v0.0.44
  - dialog "流程工作台" [ref=f4e334]:
    - region "运行总览" [ref=f4e335]:
      - generic [ref=f4e336]:
        - generic [ref=f4e337]:
          - text: 对话协作台
          - heading "流程工作台" [level=3] [ref=f4e338]
        - button "刷新运行记录" [ref=f4e340] [cursor=pointer]
      - region "协作成果" [ref=f4e341]:
        - heading "本会话协作" [level=3] [ref=f4e343]
        - heading "当前成果尚未核验" [level=4] [ref=f4e345]
        - group [ref=f4e346]:
          - generic "展开成果版本与检查入口" [ref=f4e347] [cursor=pointer]
        - generic [ref=f4e348]:
          - paragraph [ref=f4e349]: 执行轮次未设上限 · 审阅预留未启用 · 在途 0 · 费用未记录
          - button "返回对话协作台" [expanded] [ref=f4e350] [cursor=pointer]
      - paragraph [ref=f4e351]: 来自当前会话的统一编排；每两秒刷新
      - generic [ref=f4e352]:
        - strong [ref=f4e353]: 8 项任务
        - generic [ref=f4e354]: 0 项验收通过
        - generic [ref=f4e355]: 0 项活跃
        - generic [ref=f4e356]: 8 项执行完成
        - generic [ref=f4e357]: 可核验 token 160 · 未知用量 8 轮
        - generic [ref=f4e358]: 费用未记录
      - region "流程工作台" [ref=f4e360]:
        - generic [ref=f4e361]:
          - generic [ref=f4e362]:
            - generic [ref=f4e363]:
              - heading "Agent 网络" [level=4] [ref=f4e364]
              - generic [ref=f4e365]: 宿主与直接委派关系 · 点击节点联动
            - paragraph [ref=f4e366]: 未声明任务依赖；这些执行记录按并列展示
            - generic "Agent 网络，可滚动查看" [ref=f4e367]:
              - generic [ref=f4e368]:
                - generic [ref=f4e369]:
                  - generic [ref=f4e370]: 当前会话
                  - strong [ref=f4e371]: 主助手
                  - generic [ref=f4e372]: 直接编排 8 项执行
                - button "网络节点：数据核查与输入完整性验证：包含长中文职责名称的成员" [ref=f4e373] [cursor=pointer]:
                  - strong [ref=f4e376]: 数据核查与输入完整性验证：包含长中文职责名称的成员
                  - generic "当前执行已停止或不活跃" [ref=f4e377]: 上下文未知 · 累计 至少 20 tokens
                  - generic [ref=f4e378]: 执行完成
                  - generic [ref=f4e379]: 累计结算 8.5 秒
                - button "网络节点：统计分析" [ref=f4e380] [cursor=pointer]:
                  - strong [ref=f4e383]: 统计分析
                  - generic "当前执行已停止或不活跃" [ref=f4e384]: 上下文未知 · 累计 20 tokens
                  - generic [ref=f4e385]: 执行完成
                  - generic [ref=f4e386]: 累计结算 9.0 秒
                - button "网络节点：方法审阅" [pressed] [ref=f4e387] [cursor=pointer]:
                  - strong [ref=f4e390]: 方法审阅
                  - generic "当前执行已停止或不活跃" [ref=f4e391]: 上下文未知 · 累计 20 tokens
                  - generic [ref=f4e392]: 执行完成
                  - generic [ref=f4e393]: 累计结算 9.5 秒
                - button "网络节点：图表复核" [ref=f4e394] [cursor=pointer]:
                  - strong [ref=f4e397]: 图表复核
                  - generic "当前执行已停止或不活跃" [ref=f4e398]: 上下文未知 · 累计 20 tokens
                  - generic [ref=f4e399]: 执行完成
                  - generic [ref=f4e400]: 累计结算 9.9 秒
                - button "网络节点：文献核对" [ref=f4e401] [cursor=pointer]:
                  - strong [ref=f4e404]: 文献核对
                  - generic "当前执行已停止或不活跃" [ref=f4e405]: 上下文未知 · 累计 20 tokens
                  - generic [ref=f4e406]: 执行完成
                  - generic [ref=f4e407]: 累计结算 1.9 秒
                - button "网络节点：单位检查" [ref=f4e408] [cursor=pointer]:
                  - strong [ref=f4e411]: 单位检查
                  - generic "当前执行已停止或不活跃" [ref=f4e412]: 上下文未知 · 累计 20 tokens
                  - generic [ref=f4e413]: 执行完成
                  - generic [ref=f4e414]: 累计结算 2.0 秒
                - button "网络节点：报告整理" [ref=f4e415] [cursor=pointer]:
                  - strong [ref=f4e418]: 报告整理
                  - generic "当前执行已停止或不活跃" [ref=f4e419]: 上下文未知 · 累计 20 tokens
                  - generic [ref=f4e420]: 执行完成
                  - generic [ref=f4e421]: 累计结算 2.0 秒
                - button "网络节点：独立审阅" [ref=f4e422] [cursor=pointer]:
                  - strong [ref=f4e425]: 独立审阅
                  - generic "当前执行已停止或不活跃" [ref=f4e426]: 上下文未知 · 累计 20 tokens
                  - generic [ref=f4e427]: 执行完成
                  - generic [ref=f4e428]: 累计结算 2.0 秒
          - generic [ref=f4e429]:
            - generic [ref=f4e430]:
              - heading "编队成员" [level=4] [ref=f4e431]
              - generic [ref=f4e432]: 8 项任务
            - generic [ref=f4e433]:
              - searchbox "搜索协作成员" [ref=f4e434]
              - group "成员状态筛选" [ref=f4e435]:
                - button "显示全部成员" [active] [pressed] [ref=f4e436] [cursor=pointer]
                - button "只看活跃成员" [ref=f4e437] [cursor=pointer]
                - button "只看已结束" [ref=f4e438] [cursor=pointer]
            - generic [ref=f4e439]:
              - button "数据核查与输入完整性验证：包含长中文职责名称的成员" [ref=f4e440] [cursor=pointer]:
                - generic [ref=f4e441]:
                  - generic [ref=f4e442]: 数
                  - strong [ref=f4e443]: 数据核查与输入完整性验证：包含长中文职责名称的成员
                - generic [ref=f4e446]: 执行完成
                - generic "当前执行已停止或不活跃" [ref=f4e448]: 上下文未知 · 累计 至少 20 tokens
                - generic [ref=f4e449]: 累计结算 8.5 秒
              - button "统计分析" [ref=f4e453] [cursor=pointer]:
                - generic [ref=f4e454]:
                  - generic [ref=f4e455]: 统
                  - strong [ref=f4e456]: 统计分析
                - generic [ref=f4e459]: 执行完成
                - generic "当前执行已停止或不活跃" [ref=f4e461]: 上下文未知 · 累计 20 tokens
                - generic [ref=f4e462]: 累计结算 9.0 秒
              - button "方法审阅" [pressed] [ref=f4e466] [cursor=pointer]:
                - generic [ref=f4e467]:
                  - generic [ref=f4e468]: 方
                  - strong [ref=f4e469]: 方法审阅
                - generic [ref=f4e472]: 执行完成
                - generic "当前执行已停止或不活跃" [ref=f4e474]: 上下文未知 · 累计 20 tokens
                - generic [ref=f4e475]: 累计结算 9.5 秒
              - button "图表复核" [ref=f4e479] [cursor=pointer]:
                - generic [ref=f4e480]:
                  - generic [ref=f4e481]: 图
                  - strong [ref=f4e482]: 图表复核
                - generic [ref=f4e485]: 执行完成
                - generic "当前执行已停止或不活跃" [ref=f4e487]: 上下文未知 · 累计 20 tokens
                - generic [ref=f4e488]: 累计结算 9.9 秒
              - button "文献核对" [ref=f4e492] [cursor=pointer]:
                - generic [ref=f4e493]:
                  - generic [ref=f4e494]: 文
                  - strong [ref=f4e495]: 文献核对
                - generic [ref=f4e498]: 执行完成
                - generic "当前执行已停止或不活跃" [ref=f4e500]: 上下文未知 · 累计 20 tokens
                - generic [ref=f4e501]: 累计结算 1.9 秒
              - button "单位检查" [ref=f4e505] [cursor=pointer]:
                - generic [ref=f4e506]:
                  - generic [ref=f4e507]: 单
                  - strong [ref=f4e508]: 单位检查
                - generic [ref=f4e511]: 执行完成
                - generic "当前执行已停止或不活跃" [ref=f4e513]: 上下文未知 · 累计 20 tokens
                - generic [ref=f4e514]: 累计结算 2.0 秒
              - button "报告整理" [ref=f4e518] [cursor=pointer]:
                - generic [ref=f4e519]:
                  - generic [ref=f4e520]: 报
                  - strong [ref=f4e521]: 报告整理
                - generic [ref=f4e524]: 执行完成
                - generic "当前执行已停止或不活跃" [ref=f4e526]: 上下文未知 · 累计 20 tokens
                - generic [ref=f4e527]: 累计结算 2.0 秒
              - button "独立审阅" [ref=f4e531] [cursor=pointer]:
                - generic [ref=f4e532]:
                  - generic [ref=f4e533]: 独
                  - strong [ref=f4e534]: 独立审阅
                - generic [ref=f4e537]: 执行完成
                - generic "当前执行已停止或不活跃" [ref=f4e539]: 上下文未知 · 累计 20 tokens
                - generic [ref=f4e540]: 累计结算 2.0 秒
      - region "自动安排" [ref=f4e544]:
        - heading "自动安排" [level=4] [ref=f4e545]
        - paragraph [ref=f4e546]: 描述具体任务，DAWN 会根据目标、数据和依赖决定怎样拆分与分工。无需预先填写任务数量。
        - generic [ref=f4e547]:
          - generic [ref=f4e548]:
            - text: 任务目标
            - textbox "任务目标" [ref=f4e549]
          - generic [ref=f4e550]:
            - text: 调整要求（可选）
            - textbox "调整要求（可选）" [ref=f4e551]:
              - /placeholder: 例如：合并前两步，保留独立审阅
          - button "生成安排" [disabled] [ref=f4e553]
        - paragraph [ref=f4e554]: 先出方案期间只读查看；采纳后才进入原有执行与验收流程。
      - generic [ref=f4e555]:
        - group [ref=f4e556]:
          - generic "查看额度" [ref=f4e557] [cursor=pointer]
        - group [ref=f4e558]:
          - generic "会话完整执行记录" [ref=f4e559] [cursor=pointer]
```

# Test source

```ts
  1  | import {mkdirSync,writeFileSync} from 'node:fs'
  2  | import {join,resolve} from 'node:path'
  3  | import {test,expect,在项目里开会话} from './fixtures.js'
  4  | const evidence=resolve(process.env.DAWN_COLLABORATION_EVIDENCE_DIR??'docs/validation/collaboration-workbench-20261107/desktop')
  5  | const names=['数据核查与输入完整性验证：包含长中文职责名称的成员','统计分析','方法审阅','图表复核','文献核对','单位检查','报告整理','独立审阅']
  6  | test.use({dawnOptions:{gitInit:true,toolCall:[
  7  |  {when:'展示八项真实委派',toolName:'subagent',args:{tasks:names.map((agent,i)=>({agent,task:i===0?'锁演示持有任务，等待工具完成。':`协作台演示任务${i}，用一句话确认。`}))},once:true},
  8  |  {when:'锁演示持有任务',toolName:'bash',args:{command:'sleep 8'},once:true},
  9  | ]}})
  10 | test('renders a complete dark workflow workbench from eight real child executions, with linked selection and filters',async({dawn})=>{
  11 |  const{page,workspace}=dawn
  12 |  await dawn.app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0]!.setContentSize(1600,960))
  13 |  mkdirSync(evidence,{recursive:true});mkdirSync(join(workspace,'.dawn/agents'),{recursive:true})
  14 |  for(const name of names)writeFileSync(join(workspace,'.dawn/agents',name+'.md'),`---\nname: ${name}\ndescription: 协作台演示\ntools: read,bash\n---\n按要求执行。`)
  15 |  await page.evaluate(()=>localStorage.setItem('dawn.global.theme','dark'));await page.reload();await expect(page.locator('html')).toHaveClass(/dawn-dark/)
  16 |  await 在项目里开会话(page)
  17 |  await page.locator('main.main .composer textarea').fill('展示八项真实委派');await page.getByRole('button',{name:'发送',exact:true}).click()
  18 |  await page.getByRole('button',{name:'打开协作：8 项任务 · 0 项验收通过',exact:true}).click()
  19 |  let overview=page.getByRole('region',{name:'运行总览',exact:true})
  20 |  await overview.getByRole('button',{name:'展开流程工作台',exact:true}).click()
  21 |  const dialog=page.getByRole('dialog',{name:'流程工作台',exact:true});overview=dialog.getByRole('region',{name:'运行总览',exact:true})
  22 |  await expect(dialog.locator('[data-member-card]')).toHaveCount(8);await expect(dialog.locator('[data-lineage-edge]')).toHaveCount(8)
  23 |  await expect(dialog).toContainText('等待产物锁')
  24 |  await page.screenshot({path:join(evidence,'phase-b-network-dark-running.png')})
  25 |  await expect(dialog.locator('[data-member-card]').filter({hasText:'执行完成'})).toHaveCount(8)
  26 |  await dialog.getByRole('button',{name:'网络节点：方法审阅',exact:true}).click()
  27 |  await expect(dialog.locator('.collaboration-detail')).toBeVisible()
  28 |  await expect(dialog.getByRole('button',{name:'方法审阅',exact:true})).toHaveAttribute('aria-pressed','true')
  29 |  await dialog.getByRole('tab',{name:'产物',exact:true}).click();await expect(dialog.locator('.collaboration-detail')).toContainText('暂无宿主验收回执')
  30 |  await dialog.getByRole('button',{name:'收起检查面板',exact:true}).click()
  31 |  await dialog.getByRole('searchbox',{name:'搜索协作成员'}).fill('审阅');await expect(dialog.locator('[data-member-card]')).toHaveCount(2)
  32 |  await dialog.getByRole('searchbox',{name:'搜索协作成员'}).fill('');await dialog.getByRole('button',{name:'只看活跃成员'}).click();await expect(dialog.locator('[data-member-card]')).toHaveCount(0)
  33 |  await dialog.getByRole('button',{name:'显示全部成员'}).click();await expect(dialog.locator('[data-member-card]')).toHaveCount(8)
  34 |  await expect.poll(async()=>Math.max(...await dialog.locator('[data-member-card]').evaluateAll(els=>els.map(el=>el.getBoundingClientRect().height)))).toBeLessThan(200)
  35 |  await dialog.evaluate(el=>{el.scrollTop=el.scrollHeight})
  36 |  const heading=dialog.locator('.collaboration-heading')
> 37 |  await expect.poll(async()=>{const h=await heading.boundingBox(),d=await dialog.boundingBox();return h!.y-d!.y}).toBeLessThanOrEqual(2)
     |                                                                                                                  ^ Error: expect(received).toBeLessThanOrEqual(expected)
  38 |  await expect(heading.getByRole('button',{name:'返回对话协作台',exact:true})).toBeInViewport()
  39 |  await page.screenshot({path:join(evidence,'stage-c-sticky-header.png')})
  40 |  await dialog.evaluate(el=>{el.scrollTop=0})
  41 |  await page.screenshot({path:join(evidence,'phase-b-network-dark-completed.png')})
  42 |  await dawn.app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0]!.setContentSize(900,640))
  43 |  await expect(dialog.getByRole('button',{name:'返回对话协作台',exact:true})).toBeVisible()
  44 |  expect(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true)
  45 |  await page.screenshot({path:join(evidence,'phase-b-network-narrow.png')})
  46 |  await page.keyboard.press('Escape');await expect(dialog).not.toBeVisible();await expect(page.getByRole('button',{name:'展开流程工作台',exact:true})).toBeFocused()
  47 |  await page.screenshot({path:join(evidence,'phase-b-conversation-dark.png')})
  48 |  await page.getByRole('button',{name:'展开流程工作台',exact:true}).click()
  49 |  await dialog.getByRole('button',{name:'网络节点：方法审阅',exact:true}).click()
  50 |  await dialog.getByRole('button',{name:'查看子任务过程',exact:true}).click()
  51 |  await expect(dialog).not.toBeVisible()
  52 |  await expect(page.locator('.subagent-pane .subagent-result')).toBeVisible()
  53 |  await page.getByRole('button',{name:'打开协作：8 项任务 · 0 项验收通过',exact:true}).click()
  54 |  await expect(dialog).toBeVisible()
  55 |  await dialog.getByRole('button',{name:'网络节点：方法审阅',exact:true}).click()
  56 |  await expect(dialog.getByRole('tab',{name:'产物',exact:true})).toHaveAttribute('aria-selected','true')
  57 |  await dialog.getByRole('button',{name:'收起检查面板',exact:true}).click()
  58 |  await dialog.getByRole('searchbox',{name:'搜索协作成员'}).evaluate(el=>el.dispatchEvent(new KeyboardEvent('keydown',{key:'k',metaKey:true,isComposing:true,bubbles:true})))
  59 |  await expect(dialog).toBeVisible()
  60 |  await expect(page.getByRole('dialog',{name:'命令面板',exact:true})).toHaveCount(0)
  61 |  await page.keyboard.press('Meta+k')
  62 |  await expect(dialog).not.toBeVisible()
  63 |  await expect(page.getByRole('combobox',{name:'搜索命令',exact:true})).toBeFocused()
  64 |  await page.keyboard.press('Escape')
  65 |  await page.getByRole('button',{name:'展开流程工作台',exact:true}).click()
  66 |  await page.keyboard.press('Meta+p')
  67 |  await expect(dialog).not.toBeVisible()
  68 |  await expect(page.getByRole('tab',{name:'文件',exact:true})).toHaveAttribute('aria-selected','true')
  69 |  await page.getByRole('button',{name:'打开协作：8 项任务 · 0 项验收通过',exact:true}).click()
  70 |  // Navigation away from the expanded workbench must not reopen it behind an ordinary dock view.
  71 |  await expect(page.getByRole('region',{name:'运行总览',exact:true})).toBeVisible()
  72 |  await expect(dialog).not.toBeVisible()
  73 | 
  74 | })
  75 | 
```