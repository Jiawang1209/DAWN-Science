# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: chat-column-narrow.spec.ts >> narrow and regular conversation columns keep the agent, user and composer edges aligned
- Location: e2e/chat-column-narrow.spec.ts:3:1

# Error details

```
Error: viewport 1080: left

expect(received).toBeLessThanOrEqual(expected)

Expected: <= 2
Received:    10
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
      - heading "窄窗列对齐检查" [level=1] [ref=f3e23]
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
            - button "窄窗列对齐检查 刚刚" [ref=f3e72]:
              - generic [ref=f3e73]: 窄窗列对齐检查
              - generic [ref=f3e77]: 刚刚
            - button "会话操作：窄窗列对齐检查" [ref=f3e79] [cursor=pointer]: ⋯
      - generic [ref=f3e80]:
        - button "定时" [ref=f3e81] [cursor=pointer]
        - button "设置" [ref=f3e86] [cursor=pointer]
    - separator "调整侧栏宽度" [ref=f3e90]
    - main [ref=f3e91]:
      - generic [ref=f3e92]:
        - toolbar "会话工具栏" [ref=f3e93]:
          - group "会话操作：窄窗列对齐检查" [ref=f3e95]:
            - button "查找当前对话" [ref=f3e97] [cursor=pointer]
            - button "导出对话" [ref=f3e101] [cursor=pointer]
        - generic [ref=f3e106]:
          - generic [ref=f3e107]:
            - generic [ref=f3e108]: 你
            - generic [ref=f3e110]:
              - paragraph [ref=f3e114]: 窄窗列对齐检查
              - generic [ref=f3e115]:
                - time [ref=f3e116]: 2026-11-06 00:54
                - button "复制我说的这段" [ref=f3e117] [cursor=pointer]
                - button "修改" [ref=f3e123] [cursor=pointer]
                - button "回到这句之前" [ref=f3e127] [cursor=pointer]
          - generic [ref=f3e131]:
            - generic [ref=f3e132]:
              - generic [ref=f3e133]: D
              - generic [ref=f3e134]: DeepSeek
            - generic [ref=f3e135]:
              - paragraph [ref=f3e139]: 假模型已应答：DAWN 的整条链路是通的。
              - generic [ref=f3e140]:
                - button "复制这段回答" [ref=f3e141] [cursor=pointer]
                - paragraph [ref=f3e147]: 输入 12 · 输出 8 · 缓存 0 token
        - generic [ref=f3e148]:
          - generic [ref=f3e149]:
            - generic [ref=f3e150]:
              - button "工作目录：默认工作目录" [ref=f3e152] [cursor=pointer]:
                - generic [ref=f3e155]: 默认工作目录
              - generic [ref=f3e158]: 本机
            - textbox "检查缺失值并说明处理方法" [ref=f3e164]
            - generic [ref=f3e165]:
              - generic [ref=f3e166]:
                - button "添加内容" [ref=f3e168] [cursor=pointer]
                - button "终端面板" [ref=f3e171] [cursor=pointer]
                - button "完全访问" [ref=f3e175] [cursor=pointer]
              - generic [ref=f3e180]:
                - button "上下文 <1%" [ref=f3e182] [cursor=pointer]: <1%
                - button "当前模型：deepseek-flash。点击切换" [ref=f3e187] [cursor=pointer]:
                  - generic [ref=f3e191]: deepseek-flash
                - button "发送" [active] [ref=f3e194] [cursor=pointer]
          - generic "这一整段对话累计" [ref=f3e199]: 1 轮 · 输入 12 · 输出 8 · 缓存 0 · 命中 0%
  - contentinfo "应用状态" [ref=f3e200]:
    - button "还没有填任何 API key，暂时不能对话——点这里填一个" [ref=f3e202] [cursor=pointer]
    - generic [ref=f3e203]:
      - generic [ref=f3e204]:
        - button "当前模型：deepseek-flash" [ref=f3e205] [cursor=pointer]:
          - generic [ref=f3e209]: deepseek-flash
        - button "R：未配置" [ref=f3e210] [cursor=pointer]:
          - generic [ref=f3e212]: R
          - generic [ref=f3e213]: 未配置
        - button "Python：未配置" [ref=f3e214] [cursor=pointer]:
          - generic [ref=f3e216]: Python
          - generic [ref=f3e217]: 未配置
      - generic [ref=f3e218]:
        - generic [ref=f3e219]:
          - button "插件 8" [ref=f3e220] [cursor=pointer]:
            - generic [ref=f3e223]: 插件
            - generic [ref=f3e224]: "8"
          - button "Skills 9" [ref=f3e225] [cursor=pointer]:
            - generic [ref=f3e229]: Skills
            - generic [ref=f3e230]: "9"
          - button "MCP 0" [ref=f3e231] [cursor=pointer]:
            - generic [ref=f3e234]: MCP
            - generic [ref=f3e235]: "0"
          - button "子 Agent 22" [ref=f3e236] [cursor=pointer]:
            - generic [ref=f3e239]: 子 Agent
            - generic [ref=f3e240]: "22"
        - button "版本 v0.0.44" [ref=f3e241] [cursor=pointer]: v0.0.44
```

# Test source

```ts
  1  | import { test, expect, 开一段临时会话 } from './fixtures.js'
  2  | 
  3  | test('narrow and regular conversation columns keep the agent, user and composer edges aligned', async ({ dawn }, info) => {
  4  |   const { page } = dawn
  5  |   await 开一段临时会话(page)
  6  |   await page.locator('main.main .composer-field').fill('窄窗列对齐检查')
  7  |   await page.getByRole('button', { name: '发送', exact: true }).click()
  8  |   await expect(page.getByText(/假模型已应答/).last()).toBeVisible()
  9  |   const results = []
  10 |   for (const width of [1080, 1280]) {
  11 |     await page.setViewportSize({ width, height: 808 })
  12 |     await page.locator('.body').evaluate(async el => {
  13 |       await Promise.all(el.getAnimations({ subtree: true }).filter(a => a.effect?.getComputedTiming().iterations !== Infinity).map(a => a.finished.catch(() => {})))
  14 |       await new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r())))
  15 |     })
  16 |     results.push(await page.locator('main.main .conversation').evaluate(root => {
  17 |       const measure = (selector: string) => {
  18 |         const el = root.querySelector(selector) as HTMLElement, rect = el.getBoundingClientRect(), css = getComputedStyle(el)
  19 |         return { left: rect.left, right: rect.right, width: rect.width, offsetWidth: el.offsetWidth, clientWidth: el.clientWidth, paddingLeft: css.paddingLeft, paddingRight: css.paddingRight, scrollbarGutter: css.scrollbarGutter, overflowY: css.overflowY, transform: css.transform }
  20 |       }
  21 |       return { viewport: innerWidth, agent: measure('.turn.agent'), user: measure('.turn.user'), composer: measure('.composer-box'), card: measure('.composer-card'), turns: measure('.turns'), scroll: measure('.turns > div'), inner: measure('.turns-inner') }
  22 |     }))
  23 |     await page.screenshot({ path: info.outputPath(`thread-${width}.png`), animations: 'disabled' })
  24 |   }
  25 |   await info.attach('column-geometry', { body: JSON.stringify(results, null, 2), contentType: 'application/json' })
  26 |   console.log('THREAD_COLUMN_GEOMETRY', JSON.stringify(results))
  27 |   for (const m of results) {
> 28 |     expect(Math.abs(m.agent.left - m.composer.left), `viewport ${m.viewport}: left`).toBeLessThanOrEqual(2)
     |                                                                                      ^ Error: viewport 1080: left
  29 |     expect(Math.abs(m.agent.right - m.composer.right), `viewport ${m.viewport}: right`).toBeLessThanOrEqual(2)
  30 |     expect(Math.abs(m.user.right - m.composer.right), `viewport ${m.viewport}: user right`).toBeLessThanOrEqual(2)
  31 |   }
  32 | })
  33 | 
```