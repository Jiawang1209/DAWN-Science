# 怎么给 agent 配一个浏览器

> 2026-08-18 · 下面每个数都是**在这台机器上量出来的**，不是抄文档的。
> 设计与取舍见 `superpowers/specs/2026-08-18-agent的浏览器-design.md`。

**这一页说的是「给模型用的浏览器」。** 给人看的那一格（坞里的「网页」）
是另一件事，不用配，见 `superpowers/specs/2026-08-18-网页预览-design.md`。

DAWN 自己**不做**浏览器自动化——它接 MCP 服务器，而现成的浏览器 MCP 有好几台。
**一行代码都不用写，配上就能用。**

---

## 两台，先挑一台

| | `chrome-devtools-mcp` | `@playwright/mcp` |
|---|---|---|
| 工具数 | **29** | **24** |
| 摆给模型的 schema | **21,031 字节** | **16,451 字节** |
| 装完能直接用吗 | ✅ 用你已经装的 Chrome | ❌ 还要**再下一个浏览器**（实测 93.3 MiB / 81 秒） |
| `file://` | 放行 | **默认封掉** |
| 会往工作目录写东西吗 | 不会 | **会**：每次导航存一份 `.playwright-mcp/page-*.yml` |

**没主意就选 `chrome-devtools-mcp`**：装完即用，而且它有一个**省上下文的开关**（见下）。

---

## 配

侧栏 →「MCP 服务器」→「加一台 MCP 服务器」→ 粘这一段 → 按「试一次」→ 拨「这台我信得过」。

```json
{
  "mcpServers": {
    "chrome": {
      "command": "npx",
      "args": ["-y", "chrome-devtools-mcp@latest", "--isolated", "--slim", "--no-usage-statistics"]
    }
  }
}
```

三个参数都不是可选的装饰：

- **`--isolated`** —— **它默认是 `false`**。不给的话，它会用一个**长期保存的**
  profile（`~/.cache/chrome-devtools-mcp/chrome-profile`）：你在里面登过的账号
  会一直留着，下次模型来还在。给了它就是用完即弃的临时目录。
- **`--slim`** —— 见下一节，**上下文省 27 倍**。
- **`--no-usage-statistics`** —— 它**默认会往外发使用统计**。

> **绝对不要给 `--autoConnect` / `--browserUrl` / `--wsEndpoint`。**
> 那三个是「接管你正在用的那个 Chrome」——于是模型继承你**全部已登录的会话**：
> 邮箱、云盘、内部系统。要它替你查文献，不等于要它拿着你的登录态。

playwright 那台的话：

```json
{
  "mcpServers": {
    "pw": {
      "command": "npx",
      "args": ["-y", "@playwright/mcp@latest", "--isolated", "--browser", "chromium"]
    }
  }
}
```

第一次要另外下浏览器：`npx @playwright/mcp install-browser chrome-for-testing`。

---

## `--slim`：上下文省 27 倍

**每一轮对话都要把所有工具的名字与 schema 发给模型。** 实测：

| | 工具数 | schema |
|---|---|---|
| 默认 | 29 | **21,031 字节** |
| `--slim` | **3**（`navigate` / `evaluate` / `screenshot`） | **779 字节** |

29 个工具里有 `lighthouse_audit`、`performance_start_trace`、`take_heapsnapshot`
这些**前端性能分析**用的——对「去查一篇文献、抓一张表」毫无用处，
却每一轮都在占地方。

**先用 `--slim`。** 真的发现三件不够用了再摘掉它，那时你也知道自己缺的是哪一个。

---

## 配好之后，账本上会有什么

| 事实 | 有没有 |
|---|---|
| 「调用了 `chrome__navigate_page`」这件事 | ✅ 一条 Run |
| 它**往工作目录里写了什么** | ✅ （2026-08-18 补的那一层；playwright 那台写的 `.playwright-mcp/*.yml` 当场被抓到过） |
| **它去了哪个 URL** | ❌ **没有** |

最后那条要说清楚，因为它正是科研里最想问的：**「这份数据是从哪儿来的」现在答不出。**

不是忘了做，是**做不诚实**：`runs` 表里没有存工具入参的列，而就算存了，
那也只是**模型自己说它去了哪儿**。文件可以事后 `stat` 一下确认（那是观察），
**URL 没有对应的东西**。硬记下来，账本上就会多一条长得像事实、其实是转述的记录。

要什么时候才值得为它自己做一个浏览器，三条触发线写在
`superpowers/specs/2026-08-18-agent的浏览器-design.md` 第五节。

---

## 起不来的时候

- **等 60 秒才报错是正常的**：`npx` 第一次要把包下下来。DAWN 会分清
  「它还在下载」与「它坏了」，不会把慢误报成坏。
- **`trusted` 不许写进 `providers.yaml`**。「我已经过目了这台有哪些工具」
  是**人的动作**，写进配置文件等于让它可以被一份跟着 git 传播的 YAML 悄悄打开。
  写了的后果是配置整份不合法——**应用连窗口都开不出来**（2026-08-18 亲手踩过）。
