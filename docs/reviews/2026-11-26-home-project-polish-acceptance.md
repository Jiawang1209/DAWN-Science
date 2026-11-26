# 首页设计实现与验收

日期：2026-11-26（Asia/Shanghai）。分支：`codex/home-project-polish`。用户确认浅主题色工作台按钮与双栏设计后，完成扩大回归与收尾。验收时本地main仍为`f948c1e2`，未合并、未推送、未替换安装软件。

## 已实现

- 去除首页重复品牌顶栏；三个入口统一采用工作台按钮颜色与交互，40px action尺寸、20px图标。
- 左侧项目、右侧会话，标题带图标和数量；桌面窗口两列独立滚动、标题固定，窄屏和低高度窗口保留整页滚动。
- 本地收藏分组优先显示，持久化和取消收藏均可用。
- 远程目录按连接与目录分别展示，标题使用目录末段或所属项目名，显示SSH地址；同服务器不同目录仍为不同卡片，点击恢复该目录最近会话。
- 会话按活动时间排序，移除六条截断；普通会话用紧凑行，最近一段突出显示。
- 四步引导、首页、新建/打开项目、恢复会话和草稿保留沿用现有主路径。

## UI测试

`npm test -- --project=ui`：246个测试文件、2383项全部通过（47.50s）。测试环境存在既有jsdom canvas未实现提示，无失败。

## 类型与构建

`npm run typecheck`、`npm run build`均退出0。构建保留既有direct-eval与大chunk警告。

## Electron主路径与回归

`npm run test:e2e:only -- e2e/app-home.spec.ts e2e/project-create.spec.ts e2e/theme.spec.ts e2e/header-navigation.spec.ts e2e/science-layout.spec.ts`：最终23项全部通过（49.8s）。覆盖13个项目、14段会话独立滚动，较早会话可恢复，390px窄屏和低高度访问，新建项目和320px英文深色弹窗，主题、导航与科研目录初始化。

## 初轮失败与处理

初轮22项通过、1项失败，单独重跑同一位置复现。失败出现在header-navigation旧像素宽度兼容检查：保存过316px对应的新比例后，只修改旧`dawn.global.sidebar-width`为260，测试仍期待300，实际316。

基线main已有`774c0d0e`的比例布局实现，`resolveWorkbenchLayout`与单测明确新比例优先；本次首页改动未修改此实现。更新该Electron检查：先验证保存比例仍恢复316，再移除比例记录，验证旧宽度仍被夹到300。保持所有几何、边界、草稿与窄屏断言，未放宽阈值。该文件2项通过后，整组23项复测通过。

## 证据与范围

日志保存在`output/playwright/home-project-polish-20261126/acceptance/`。首次失败截图和trace保存在相邻`acceptance-initial-header-failure/`。已查看浅色、深色、窄屏预览与滚动截图，未更新像素基线。

远程连接使用隔离fake SSH，演示截图的项目目录仅为临时样例；未连接正式服务器。远程卡片仍根据已有会话目录聚合，尚无独立远程项目元数据及远程收藏入口。本次未验收全套像素基线、真实模型/SSH、安装升级或其他操作系统。正式App配置和数据未改动。
