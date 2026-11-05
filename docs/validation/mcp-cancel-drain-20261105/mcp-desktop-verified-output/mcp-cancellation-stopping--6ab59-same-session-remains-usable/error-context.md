# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: mcp-cancellation.spec.ts >> stopping an HTTP MCP stream after GC closes its response and the same session remains usable
- Location: e2e/mcp-cancellation.spec.ts:11:1

# Error details

```
Error: electronApplication.evaluate: TypeError: A dynamic import callback was not specified.
    at importModuleDynamicallyCallback (node:internal/modules/esm/utils:280:9)
    at eval (eval at evaluate (:311:30), <anonymous>:2:18)
    at UtilityScript.evaluate (<anonymous>:313:16)
    at UtilityScript.<anonymous> (<anonymous>:1:44)
```

# Page snapshot

```yaml
- generic [ref=f3e3]:
  - generic [ref=f3e4]:
    - generic [ref=f3e5]:
      - button "DAWN Science" [ref=f3e7] [cursor=pointer]
      - button "收起侧边栏" [expanded] [ref=f3e10] [cursor=pointer]
      - button "快捷键速查" [ref=f3e13] [cursor=pointer]
    - banner [ref=f3e19]:
      - heading "MCP取消探针：等待响应后停止" [level=1] [ref=f3e23]
    - button "面板" [ref=f3e25] [cursor=pointer]
  - generic [ref=f3e26]:
    - complementary [ref=f3e27]:
      - button "新建任务" [ref=f3e29] [cursor=pointer]
      - separator [ref=f3e34]
      - generic [ref=f3e35]:
        - generic [ref=f3e36]: 工作区
        - generic [ref=f3e37]:
          - button "搜索" [ref=f3e38] [cursor=pointer]
          - button "添加工作区文件夹" [ref=f3e41] [cursor=pointer]
      - generic [ref=f3e45]:
        - region "服务器" [ref=f3e46]:
          - generic [ref=f3e47]:
            - button "服务器" [expanded] [ref=f3e48] [cursor=pointer]
            - button "添加服务器" [ref=f3e57] [cursor=pointer]
          - paragraph [ref=f3e60]: 还没有服务器
        - paragraph [ref=f3e61]:
          - button "会话 1" [expanded] [ref=f3e62] [cursor=pointer]:
            - generic [ref=f3e67]: 会话
            - generic [ref=f3e68]: "1"
          - button "多选会话" [ref=f3e69] [cursor=pointer]: 多选
        - list [ref=f3e70]:
          - listitem [ref=f3e71]:
            - button "MCP取消探针：等待响应后停止 刚刚" [ref=f3e72]:
              - generic [ref=f3e73]: MCP取消探针：等待响应后停止
              - generic [ref=f3e77]: 刚刚
            - button "会话操作：MCP取消探针：等待响应后停止" [ref=f3e79] [cursor=pointer]: ⋯
      - generic [ref=f3e80]:
        - button "定时" [ref=f3e81] [cursor=pointer]
        - button "设置" [ref=f3e86] [cursor=pointer]
    - separator "调整侧栏宽度" [ref=f3e90]
    - main [ref=f3e91]:
      - generic [ref=f3e92]:
        - toolbar "会话工具栏" [ref=f3e93]:
          - group "会话操作：MCP取消探针：等待响应后停止" [ref=f3e95]:
            - button "查找当前对话" [ref=f3e97] [cursor=pointer]
            - button "导出对话" [ref=f3e101] [cursor=pointer]
        - generic [ref=f3e106]:
          - generic [ref=f3e107]:
            - generic [ref=f3e108]: 你
            - generic [ref=f3e110]:
              - paragraph [ref=f3e114]: MCP取消探针：等待响应后停止
              - generic [ref=f3e115]:
                - time [ref=f3e116]: 2026-11-05 22:15
                - button "复制我说的这段" [ref=f3e117] [cursor=pointer]
                - button "修改" [ref=f3e123] [cursor=pointer]
                - button "回到这句之前" [ref=f3e127] [cursor=pointer]
          - generic [ref=f3e131]:
            - generic [ref=f3e132]:
              - generic [ref=f3e133]: D
              - generic [ref=f3e134]: DeepSeek
            - generic [ref=f3e135]:
              - paragraph [ref=f3e139]: 等待 MCP 服务器返回，随后验证停止。
              - button "复制这段回答" [ref=f3e141] [cursor=pointer]
          - button "已完成 用时 0 秒 1 步" [expanded] [ref=f3e147] [cursor=pointer]:
            - generic [ref=f3e150]: 已完成
            - generic [ref=f3e151]: 用时 0 秒
            - generic [ref=f3e152]: 1 步
          - generic [ref=f3e153]:
            - button "✗ cancelprobe__hold 失败" [expanded] [ref=f3e154] [cursor=pointer]:
              - generic [ref=f3e157]: ✗ cancelprobe__hold
              - generic [ref=f3e158]: 失败
            - generic [ref=f3e159]:
              - generic [ref=f3e160]: "{}"
              - button "复制这段输出" [ref=f3e161] [cursor=pointer]
              - generic [ref=f3e167]: "[cancelprobe]（这个工具报错了） cancelprobe__hold 调用失败：MCP 连接已断开，已发送请求的外部结果未知；请核对回执，不要自动重试。 SSE stream disconnected: TypeError: terminated"
          - generic [ref=f3e168]:
            - generic [ref=f3e169]:
              - generic [ref=f3e170]: D
              - generic [ref=f3e171]: DeepSeek
            - generic [ref=f3e172]:
              - paragraph [ref=f3e176]: 假模型已应答：DAWN 的整条链路是通的。
              - generic [ref=f3e177]:
                - button "复制这段回答" [ref=f3e178] [cursor=pointer]
                - paragraph [ref=f3e184]: 输入 12 · 输出 8 · 缓存 0 token
        - generic [ref=f3e185]:
          - generic [ref=f3e186]:
            - generic [ref=f3e187]:
              - button "工作目录：默认工作目录" [ref=f3e189] [cursor=pointer]:
                - generic [ref=f3e192]: 默认工作目录
              - generic [ref=f3e195]: 本机
            - textbox "输入问题，@ 引用文件，/ 使用指令" [ref=f3e201]
            - generic [ref=f3e202]:
              - generic [ref=f3e203]:
                - button "添加内容" [ref=f3e205] [cursor=pointer]
                - button "终端面板" [ref=f3e208] [cursor=pointer]
                - button "完全访问" [ref=f3e212] [cursor=pointer]
              - generic [ref=f3e217]:
                - button "上下文 <1%" [ref=f3e219] [cursor=pointer]: <1%
                - button "当前模型：deepseek-flash。点击切换" [ref=f3e224] [cursor=pointer]:
                  - generic [ref=f3e228]: deepseek-flash
                - button "发送" [active] [ref=f3e231] [cursor=pointer]
          - generic "这一整段对话累计" [ref=f3e236]: 1 轮 · 工具 1 次 18 ms · 输入 12 · 输出 8 · 缓存 0 · 命中 0%
  - contentinfo "应用状态" [ref=f3e237]:
    - button "还没有填任何 API key，暂时不能对话——点这里填一个" [ref=f3e239] [cursor=pointer]
    - generic [ref=f3e240]:
      - generic [ref=f3e241]:
        - button "当前模型：deepseek-flash" [ref=f3e242] [cursor=pointer]:
          - generic [ref=f3e246]: deepseek-flash
        - button "R：未配置" [ref=f3e247] [cursor=pointer]:
          - generic [ref=f3e249]: R
          - generic [ref=f3e250]: 未配置
        - button "Python：未配置" [ref=f3e251] [cursor=pointer]:
          - generic [ref=f3e253]: Python
          - generic [ref=f3e254]: 未配置
      - generic [ref=f3e255]:
        - generic [ref=f3e256]:
          - button "插件 8" [ref=f3e257] [cursor=pointer]:
            - generic [ref=f3e260]: 插件
            - generic [ref=f3e261]: "8"
          - button "Skills 9" [ref=f3e262] [cursor=pointer]:
            - generic [ref=f3e266]: Skills
            - generic [ref=f3e267]: "9"
          - button "MCP 1" [ref=f3e268] [cursor=pointer]:
            - generic [ref=f3e271]: MCP
            - generic [ref=f3e272]: "1"
          - button "子 Agent 22" [ref=f3e273] [cursor=pointer]:
            - generic [ref=f3e276]: 子 Agent
            - generic [ref=f3e277]: "22"
        - button "版本 v0.0.44" [ref=f3e278] [cursor=pointer]: v0.0.44
```