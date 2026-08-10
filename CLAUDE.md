# DAWN Science — 项目约定

面向在本仓库工作的 AI 助手。全局约定见 `~/.claude/CLAUDE.md`；这里只写本项目特有的。

---

## 文档入口

| 要找什么 | 去哪 |
|---|---|
| 目标、五条不变式 | `docs/superpowers/specs/2026-08-06-multi-agent-ds-workbench-design.md` |
| 阶段、决策门、风险 | `docs/superpowers/plans/2026-08-08-master-roadmap.md` |
| 当前阶段的执行计划 | 见路线图 §5 —— 已完成到 **②-A′**，下一个是 ②-B（执行环境与 Run） |
| 各阶段的详细计划 | `docs/superpowers/plans/` —— 文件名里的阶段号即为准 |
| 视觉与交互契约 | `docs/DESIGN.md` |
| 参考项目在哪、各自教什么 | `docs/REFERENCES.md` |
| 变更历史（最新在顶） | `docs/DEVELOPMENT_HISTORY.md` |

---

## 三条硬性准入规则

### 1. 新增协议操作，必须在同一次改动里补 mock 分支

`scripts/mock-inference-server.mjs` 与 e2e 夹具共用同一份假后端。新增一个操作
却不补它，界面在 mock 模式下就会悄悄偏离真实契约。

学自 Rho（`AGENTS.md`）：

> *"Every new Tauri command and visible state requires a deterministic mock handler
> … **in the same implementation package**. Otherwise UI review in browser mode
> quickly drifts away from the real contract."*

同理，**`npm run dev:mock` 与 `npm run test:e2e` 必须共用同一个 mock**——
两套 mock 会各自漂移，那时「本地是好的」就不再意味着什么。

### 2. 能判定的设计规则，配一个扫描测试

`tests/ui/design-contract.test.ts` 是它的家。新增一条可判定的规则时，
**在同一次改动里**加扫描。

Rho 与 Hermes 各自独立写下过同一条理由：*"Prefer automated enforcement over
remembered convention."*

**本项目已经证明过一次**：「不要用 `window.prompt`」是我自己写下的规则，
然后我自己违反了它，直到作者打开发现白屏。现在它有测试了。

### 3. 改了主路径，必须自己验证一次

单元测试证明不了「真的能用」。**419 个测试全绿的那一版，打开之后点什么都没反应。**

三种手段，按代价从低到高：

```
npm run test:e2e     Playwright 驱动真实构建产物（最有力）
npm run dev:mock     真链路 + 假模型，人肉看
一次性 Electron 探针  临时验证用，用完删掉
```

**写「测试绿了」不等于「能用了」。**

### 视觉基线的一条纪律

`e2e/__screenshots__/` 里那十张图归 `test:e2e:visual` 管。**红了先看 diff 图，再决定是不是重存。**

```
test-results/<用例>/<名字>-diff.png    ← 差异用红色标出来，先看这个
```

条件反射地 `--update-snapshots` 是这类测试唯一的死法：更新一次不痛不痒，
更新成习惯之后它就什么都不证明了。**它红了通常是对的**——
逐像素阈值是 0，颜色差一点点都会说话（这个值是试出来的，理由写在 `e2e/visual.spec.ts` 里）。

**重存之后必须再验一遍。**（2026-08-10 踩的）`--update-snapshots` 写的是
**未经稳定化的那一帧**，而验证时 Playwright 会等两帧一致——批量重存有概率
写进一张坏基线，症状是「刚更新完就稳定失败」。

**外面世界的东西不进逐像素基线**：时钟、pi 的模型目录条数这类会自己变的，
一律 `mask` 掉。不遮的话它每过一分钟红一次，而那正是把人训练成
条件反射按 update 的最快方式。

---

## 常用命令

```bash
npm test              # 单元 + 集成（vitest）
npm run typecheck
npm run build
npm run test:e2e      # 先 build，再 Playwright（跑真实产物）
npm run test:e2e:only # 跳过 build
npm run test:e2e:visual         # 只跑视觉基线（10 张：五个屏 × 明暗）
npm run test:e2e:visual:update  # 改了样式之后重存基线
npm run dev:mock      # 真链路 + 假模型，隔离目录，不碰真实凭证与数据库
npm run app           # 构建并启动
```

---

## 几条容易踩的

- **依赖决策必须写明坐在哪一层**（规格 §4）：①具体到导出符号 ②放弃了什么
  ③我们的不变式挂在哪个钩子上。只写「使用 X」不算决策。
- **pi 是运行依赖，不是参考项目**。Hermes / Rho / wisp-science 是「读设计、不复用代码」；
  pi 是直接坐在上面。混淆这两者，下一步就会变成「学会了，自己写一个」。
- **失败必须出声**（规格 7.5）：不静默回退、不静默截断。截断要说清省了多少。
- **缺失不等于相同，缺失也不等于支持**。默认值的选择才是要害。
- 界面状态按权威归位：`src/ui/state/` 的文件头有分家表。
  **持久化状态必须在 key 里声明作用域**——搞错作用域就是一个会话的东西渗进另一个。
