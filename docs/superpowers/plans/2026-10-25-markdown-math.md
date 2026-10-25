# 数学公式排版 Implementation Plan

> 使用 executing-plans 在当前会话顺序执行；不委派子 agent。

**Goal:** 为共享 Markdown 组件补充本地数学公式排版，验证后合入 main，不推送。

**Architecture:** Streamdown 官方数学插件与 KaTeX CSS/字体；既有代码渲染器及权限边界保持；块公式局部滚动。

**Tech Stack:** React、Streamdown、@streamdown/math、KaTeX、Vitest、Electron/Playwright。

- [ ] 1. 运行现有 markdown 和 markdown-code-block 测试确认基线。
- [ ] 2. 新建 tests/ui/markdown-math.test.tsx，断言 `$x^2$` 含 math、独立分数/矩阵含 .katex-display、流式补齐后只留一份公式、代码里的 LaTeX 不转义、错误不损失后文；运行记录预期失败。
- [ ] 3. 安装 @streamdown/math 和 KaTeX；markdown.tsx 引入 createMathPlugin 与 CSS，既有 plugins 对象增加 math；styles.css 增加 .md .katex-display 的局部 overflow-x:auto 与纵向留白。
- [ ] 4. 运行新增与原有组件测试，再 typecheck/build。
- [ ] 5. 共享 mock 增加唯一“数学公式排版验收”回复；新增 e2e/markdown-math.spec.ts，从实际 IPC/流式模型回复验证公式、主题、窄坞、字体和错误，再跑原有 markdown-render 与 visual 用例。
- [ ] 6. 用固定 Dev Preview launcher 打开此 worktree，检查真实窗口并保存截图；进行最终代码审阅及适当完整回归。
- [ ] 7. 记录当次验收和开发历史，提交分支；main fast-forward 合并，主树重新构建并验证相关 Electron，核对干净且未推送。
