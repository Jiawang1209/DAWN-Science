# 输入卡等高与文本右键菜单验证

2026-11-11，基线 `6d39c9e5`，独立分支 `codex/composer-consistency-20261111`。仅本地源码与隔离测试，未合并、推送、发布或替换已安装应用。

## 改动与结果

- 主区、首页和侧边共用固定三行文本区，真实文字与占位文字均可换行，超长草稿内部滚动。工具栏统一两行，极窄侧栏缩短模型名并收紧推理按钮内距，保留所有入口。
- 主窗口接入 Electron 原生文本菜单。编辑区包括撤销、重做、剪切、复制、粘贴、删除、全选，执行状态遵循 Chromium editFlags；正文选区只有复制。空白区域不弹文本菜单，已有会话菜单仍处理自己的右键。
- 在 1280/1920 两种内容尺寸下真实拖动分隔条，覆盖 280、360、440、600px，1920 另覆盖 720px。1280 的原有上界是 600px，保留主对话空间。不同草稿、清空、两种主题下，主侧整卡高度差及底边差均为 0；最终采样整卡均为 243.25px，textarea clientHeight 均为 105px。侧边长草稿 scrollHeight 为 403px。

## 验证

- `npm run build`、`npm run typecheck`、`git diff --check` 通过。构建保留现有大 chunk 提示。
- 12 个 Vitest 文件、194 项通过，包含菜单状态、草稿、IME、粘贴、高亮、布局、配置、设计契约和主题。
- 8 个相关 Electron 文件共有 35 项：整组首次 33 项通过，两项连续拖动用例需要修正测试同步与尺寸边界。之后仅重跑这两项，2/2 通过（9.0s）。产品代码未因这两项测试修正而变化。35 项相关用例的最新结果均通过，未运行全仓库测试。
- 原生编辑菜单实际来自页面右键事件；验证菜单角色/禁用状态以及复制、剪切、粘贴、撤销、重做、删除、全选对真实 DOM 草稿的作用，正文复制和原有会话菜单也通过。macOS 隐藏窗口测试拦截原生 popup 显示，并直接执行已核对角色对应的 Chromium 编辑命令；不声称人工点击验证了系统原生菜单分发。原因见 [Electron macOS role 实现](https://github.com/electron/electron/blob/v43.8.4/lib/browser/api/menu-item-roles.ts#L353)。
- 亮暗截图已人工检查；独立静态代码审查无可操作的问题。测试使用隔离配置与假模型，不涉及真实服务调用。

## 回归证据与测试修正

基线 1920 窗口完整卡片高差为 44px；文本区空态只有 46px 且随内容变化；原生右键菜单为空。见 `baseline-failures.txt`。其中 1280 初稿还遇到 ghost suggestion 改变 placeholder，随后改用 textarea 定位，该定位失败不作为产品缺陷证据。

连续鼠标拖动时，aria-valuenow 先于网格过渡结束更新，测试必须等待网格动画完成再定位下一次拖动把手；1280 不应期待超出原有上界的 720px。最终用例保留完整卡片等高断言，没有提高高度容差。

## 文件

- `1280-composer-cards-light.png`、`1280-composer-cards-dark.png`：笔记本宽度对比。
- `1920-composer-cards-light.png`、`1920-composer-cards-dark.png`：大屏对比。
- `*-composer-geometry.json`：实际几何与文本滚动高度。
- `unit.txt`、`e2e-related.txt`、`e2e-drag-final.txt`、`typecheck.txt`：对应测试输出。整组日志保留了修正前的两项测试失败，最终拖动结果在独立日志中。
