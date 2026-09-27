/**
 * 本地 OpenAI 兼容的假推理服务器。
 *
 * **学自 Hermes `apps/desktop/scripts/dev-mock.mjs`。** 它的关键设计不是
 * 「把界面从后端摘下来单独看」——那样看到的是界面的幻觉，接线错了照样看不出来，
 * 而那正是 DAWN 前三次交付翻车的根因。
 *
 * 它的做法是反过来的：**整条真链路照跑，只把最外面那个不确定的东西
 *（模型）换成确定的**。协议、IPC、事件流、pi 的 agent loop、工具执行、
 * 渲染——全都是真的，只有模型回复是写死的。
 *
 * 还有一条同样重要的纪律，Hermes 在文件头写明了：
 * **本模块同时供 `dev:mock` 与 e2e 使用**，使本地开发与 CI 测同一条链。
 * 两套 mock 会各自漂移，那时「本地是好的」就不再意味着什么。
 *
 * ## 怎么让 pi 连过来
 *
 * pi 的内置 provider 把 baseUrl 写死在目录里。覆盖入口是 `models.json`：
 * `{ providers: { deepseek: { baseUrl, apiKey } } }`——由 `ModelConfig.load()`
 * 读取，`ModelRuntime.create({ modelsPath })` 指路。见
 * `«REF»/pi-main/packages/coding-agent/src/core/model-config.ts` 的 `ProviderConfigSchema`。
 */
import http from "node:http"

/** 默认回复。**刻意包含一句可断言的暗号**，e2e 靠它判断整条链通了 */
export const CANNED_REPLY = "假模型已应答：DAWN 的整条链路是通的。"

/**
 * 假改写：三引号里的原文前面加「改写：」；原文前面若有参考块（【对话背景】【项目文档】【相关代码】），
 * 把块的标题复述在最前面——e2e 据此看「这次带没带上下文、带的是哪种」。
 */
function 假改写(最后一句) {
  const m = /"""\n([\s\S]*?)\n"""/.exec(最后一句)
  const 原 = m ? m[1] : 最后一句
  const 带 = ["【对话背景", "【项目文档", "【相关代码"].filter((k) => 最后一句.includes(k)).map((k) => k.slice(1))
  return `${带.length ? `（参考了：${带.join("、")}）` : ""}改写：${原}`
}

/**
 * 一段**富 markdown** 回复。用户说的话里带「markdown」时给它。
 *
 * 它存在的理由是排版：作者 2026-08-10 说*「回复的 markdown 格式并不美观」*，
 * 而**看不见就没法改**——默认那句暗号里一个标题一个列表都没有。
 * 这里把标题层级、有序/无序/嵌套列表、行内与块代码、表格、引用、分隔线
 * 一次摆齐，改样式时对着它看，e2e 也拿它当靶子。
 */
/**
 * **案例卡片的靶子**（2026-09-15，规则 ①）：用户说的话里带「案例卡片」时，最终回复**提到**两篇案例。
 * 卡片的数据来自这一轮 `mlai-science__search_cases` 的工具返回（`scripts/mcp-test-server.mjs` 里那台假的），
 * 这里只负责「正文里提到了哪几篇」——第二篇故意写成截短的 id，真机上模型就是这么写的。
 */
export const 案例卡片回复 = "库里找到两篇：`e2e-deseq2-full-id` 做差异表达；`20251019-xacaaee` 画 Mantel 热图。你想照哪一篇做？"

export const MARKDOWN_REPLY = [
  "# 一级标题",
  "",
  "这是一段正文，里面有 `行内代码`、**加粗**、*斜体* 和[一个链接](https://example.com)。",
  "",
  "## 二级标题",
  "",
  "1. 有序的第一项",
  "2. 有序的第二项",
  "   - 嵌套的无序项",
  "   - 又一项",
  "",
  "### 三级标题",
  "",
  "- 无序的一项",
  "- 另一项",
  "",
  "```python",
  "import pandas as pd",
  "df = pd.read_csv('sales.csv')",
  "print(df.describe())",
  "```",
  "",
  "| 字段 | 类型 | 缺失 |",
  "| --- | --- | --- |",
  "| id | int | 0 |",
  "| name | str | 3 |",
  "",
  "> 引用：这一段是补充说明。",
  "",
  "---",
  "",
  "最后一段。",
].join("\n")

/**
 * **一段长回复**（2026-09-22，分支 `perf-streaming`）：用户这一句里带「长回复」时给它。
 *
 * 量「回复时卡不卡」要一段像样的回复：真模型一轮常是几千字、带几个代码块和表格，
 * 而默认那句暗号只有二十来个字——在它身上量不出「对话越长越卡」。
 * 用**这一句**（不是整段历史）判：历史里说过「长回复」不该让之后每一轮都变长。
 */
export const LONG_REPLY = Array.from({ length: 5 }, (_, i) =>
  MARKDOWN_REPLY.replace("# 一级标题", `# 第 ${i + 1} 节`).replace(
    "print(df.describe())",
    `print(df.describe())\nfor col in df.columns:\n    print(col, df[col].isna().sum())  # 第 ${i + 1} 段`,
  ),
).join("\n\n")

/**
 * **「慢慢说」= 按真模型的节奏吐字**（2026-09-22，分支 `perf-streaming`）。
 *
 * 默认把回复切成三段背靠背发，流式路径是走到了，但**界面每一轮只更新三次**——
 * 真模型是几百次（一次几个字、几十毫秒一次），卡顿正是在那几百次里攒出来的。
 * 只在这一句带「慢慢说」时生效，旧用例一个字节不变。
 */
const 慢速 = { 每段字数: 6, 间隔毫秒: 15 }

/**
 * **「慢慢跑」= 先说一句、再调一条 20 秒的 bash**（2026-09-25，调整方向；准入规则 1）。
 *
 * 调整方向要演「忙着 → 停掉这一步 → 按新的一句接着做」：没有一条会自己拖住的工具，
 * `dev:mock` 里人按不到那颗按钮，e2e 也只能跟模型赛跑。**只在最后一条是用户话、且那句带「慢慢跑」时**触发——
 * 拿到工具结果之后那一问最后一条是 `tool`，不触发，所以不循环。用例自己给了 `toolCall` 且这一问它要调的，以用例的为准。
 */
export const 慢慢跑 = { toolName: "bash", args: { command: "sleep 20" }, say: "我先跑一段慢的。" }
/** 这一问的最后一条是用户话时，取它的文字；不是（工具结果之后那一问）→ undefined。按话触发的几支 mock 工具共用（2026-09-27 抽出） */
function 最后一句用户话(body) {
  const 最后 = body.messages?.at?.(-1)
  if (最后?.role !== "user") return undefined
  const c = 最后.content
  return typeof c === "string" ? c : Array.isArray(c) ? c.map((x) => x?.text ?? "").join("") : ""
}
function 慢跑工具(body) {
  return 最后一句用户话(body)?.includes("慢慢跑") ? 慢慢跑 : undefined
}

/**
 * **「跑个 Cox」= 先说一句、再调一条把 Cox 代码印出来的 bash**（2026-09-27，会话全文搜索；准入规则 1）。
 *
 * 全文搜索要搜工具的参数与输出、点过去展开那一行：没有一条确定的工具调用，`dev:mock` 里人搜不到代码，
 * e2e 也只能靠真模型。与「慢慢跑」同一个触发法——最后一条是用户话、且那句带「跑个 Cox」；
 * 拿到工具结果之后那一问最后一条是 `tool`，不触发，所以不循环。用例自己给了 `toolCall` 且这一问它要调的，以用例的为准。
 * 与已有暗号互不为子串（「慢慢跑」含「跑」不含「跑个」），也不含「慢」字（「派子agent」那支拿它分快慢）。
 */
export const 跑个Cox = {
  toolName: "bash",
  args: { command: 'echo "coxph(Surv(time, status) ~ age, data = lung)"' },
  say: "我跑一个 Cox 回归。",
}
function 跑Cox工具(body) {
  return 最后一句用户话(body)?.includes("跑个 Cox") ? 跑个Cox : undefined
}

/**
 * **「演一次失败」「演一次权限」**（2026-09-27，桌面通知；准入规则 1）。
 *
 * 桌面通知有三种时刻：做完、出错、等你点头。做完随便哪句都行；另两种此前只有夹具级的旋钮
 * （`failStatus` 让整台服务器都失败、`toolCall` 要写进用例）——**`dev:mock` 里人演不出来**，e2e 也只能整段会话都失败。
 * - 「演一次失败」→ 这一问回 401（pi 不重试 4xx），会话里出「模型调用失败：…」，桌面通知弹「出错了」；
 * - 「演一次权限」→ 先说一句、再调一条要联网的 bash：`curl` 打本机 9 号端口，拒连立刻返回、不出本机。
 *   「请求批准」档下门会弹权限卡；放行了也只是一次失败的本机连接。
 * 只看**最后一条用户话**；拿到工具结果之后那一问最后一条是 `tool`，不循环。
 * 两句与已有暗号（「慢慢跑」「慢慢说」「改两个文件」「派子agent」「子任务」「塞满上下文」「长回复」「markdown」「案例卡片」）
 * 互不为子串，也不含「慢」字（「派子agent」那支拿它分快慢）。
 */
export const 演一次权限 = {
  toolName: "bash",
  args: { command: "curl -s --max-time 1 http://127.0.0.1:9/ || true" },
  say: "我要联网看一眼。",
}
function 演示工具(body) {
  return 最后一句用户话(body)?.includes("演一次权限") ? 演一次权限 : undefined
}

/**
 * **「改两个文件」= 先说一句、再调一条改两个文件的 bash**（2026-09-27，回退这一轮；准入规则 1）。
 *
 * 回退要有东西可退：一个 `out/` 下的新文件（科研仓库常把它写进 `.gitignore`——回退照样要退它）、
 * 一个原本就有的文件被追加一行。**两条都是 `>>` 追加**：同一句说两遍，第二遍的改动叠在第一遍上，
 * 于是「回到第二句之前」与「回到第一句之前」看得出不同。中文文件名是刻意的（git 八进制转义那次的教训）。
 * 与「慢慢跑」同一个规矩：只在最后一条是用户话时触发，拿到工具结果之后那一问不触发，不循环。
 */
export const 改两个文件 = {
  toolName: "bash",
  args: { command: "mkdir -p out && printf 'x\\n' >> out/图.txt && printf '改过\\n' >> README.md" },
  say: "我改两个文件。",
}
function 改文件工具(body) {
  return 最后一句用户话(body)?.includes("改两个文件") ? 改两个文件 : undefined
}

/**
 * **方案期 = 交一份五节齐全的假方案**（2026-09-27，先出方案；准入规则 1）。
 *
 * **判据看请求的工具表，不看话**：pi 只把启用的工具发过来，`propose_plan` 只在方案期启用——所以「工具表里有它」就是「在方案期」。
 * 刻意**不拿功能名「先出方案」当暗号**：它是界面上开关、斜杠项、⌘K 的字，也可能进方案期指引（系统提示词）；
 * 拿它当暗号，哪天它顺着模板进了用户话或系统提示词，这一支就会在不该的时候开火。
 * - 方案期、一句带「偷跑」→ 调 `write`（演门拦下；与已有暗号互不为子串、不含「慢」字）；别的 → 交方案。
 * - 不在方案期、最后一句带「照批准的方案做」→ 写方案里的**第一项**产物（对照显示「1 / 2」）。那句是 `执行那句()`
 *   （`src/protocol/plan.ts`）批准后替人发的，只会从批准那一下来。
 * 与「慢慢跑」同一个规矩：只在最后一条是用户话时触发，拿到工具结果之后那一问不触发，不循环。
 * 在工具链的**最后**判：带别的暗号的话照旧走那一支（方案期里它们会被门拦下，那也是要演的）。
 */
export const 假方案 = {
  title: "吸烟与肺功能：分组比较",
  plan: [
    "## 问题与假设",
    "吸烟者的 FEV1 是否低于不吸烟者（假设：低）。",
    "## 数据与切分",
    "`data/raw/lung.csv`，全部样本，不切分。",
    "## 统计检验与模型",
    "Welch t 检验；线性模型 FEV1 ~ smoking + age + sex。",
    "## 图",
    "分组箱线图。",
    "## 产物",
    "- `results/tables/mock_summary.csv` —— 分组汇总",
    "- `figures/fev1_by_smoking.png` —— 箱线图",
  ].join("\n"),
}
export const 交方案 = { toolName: "propose_plan", args: 假方案, say: "我先出一份方案。" }
export const 偷跑 = { toolName: "write", args: { path: "results/tables/偷跑.csv", content: "a\n1\n" }, say: "我先偷偷写一个。" }
export const 照方案做 = {
  toolName: "write",
  args: { path: "results/tables/mock_summary.csv", content: "group,n\nsmoker,1\n" },
  say: "照方案做第一步。",
}
function 方案工具(body) {
  const 文 = 最后一句用户话(body)
  if (文 === undefined) return undefined
  // Anthropic 形状的工具表是 `{ name }`，OpenAI 的是 `{ function: { name } }`——两种都认
  const 在方案期 = (body.tools ?? []).some((t) => (t?.function?.name ?? t?.name) === "propose_plan")
  if (在方案期) return 文.includes("偷跑") ? 偷跑 : 交方案
  return 文.includes("照批准的方案做") ? 照方案做 : undefined
}

/**
 * **子 agent 三支**（2026-09-27，子 agent 看得见；准入规则 1）。
 *
 * 主区与子进程共用这一台假服务器，所以**按话分**，不按次数数：
 * - 主区那句带「派子agent」→ 调 `subagent`，交给自带的 `data-auditor`（它的 tools 有 read 与 bash）一个以「子任务」开头的任务；
 *   带「慢」字 → 任务以「子任务慢」开头；
 * - 子进程收到「子任务慢…」→ `bash sleep 15`（在跑时 chip 上那一句、坞里那条在跑的工具行都要人看得到）；
 * - 子进程收到「子任务…」→ 先说一句、再 `read README.md`（坞里有一条工具行可看）。
 * **「子任务慢」先于「子任务」判**：前者以后者开头，顺序反了慢的那支永远走不到。
 * 与「慢慢跑」同一个规矩：拿到工具结果之后那一问最后一条是 `tool`，不触发，不循环。
 */
export const 派子agent = {
  toolName: "subagent",
  args: { agent: "data-auditor", task: "子任务：读一下 README.md，用一句话说它是干什么的" },
  say: "我派个子 agent 去看看。",
}
export const 派子agent慢 = {
  toolName: "subagent",
  args: { agent: "data-auditor", task: "子任务慢：跑一段慢的再回话" },
  say: "我派个子 agent 去跑一段慢的。",
}
export const 子任务读 = { toolName: "read", args: { path: "README.md" }, say: "我先读一下 README。" }
export const 子任务慢 = { toolName: "bash", args: { command: "sleep 15" }, say: "我先等十五秒。" }
function 子agent工具(body) {
  const 文 = 最后一句用户话(body)
  if (文 === undefined) return undefined
  if (文.includes("派子agent")) return 文.includes("慢") ? 派子agent慢 : 派子agent
  if (文.startsWith("子任务慢")) return 子任务慢
  if (文.startsWith("子任务")) return 子任务读
  return undefined
}

/**
 * **pi 的压缩摘要请求**（2026-09-27，上下文用量与压缩；准入规则 1）。
 *
 * pi 写摘要时系统提示词是 `SUMMARIZATION_SYSTEM_PROMPT`（`pi-coding-agent/dist/core/compaction/utils.js`），
 * 开头是 "You are a context summarization assistant."。认出来就回这段固定摘要——e2e 展开压缩标记时认它，
 * `dev:mock` 里人按「现在压缩」也看得到一段像样的摘要。**先于其余分支判**：摘要请求的 user 那条里装着整段对话原文，
 * 里面的「慢慢跑」「塞满上下文」都是被摘要的话，不该再触发工具或大用量。
 */
export const 假摘要 = [
  "## Goal",
  "假摘要：用户在试压缩。",
  "",
  "## Progress",
  "- 说过几句话",
  "",
  "## Next Steps",
  "- 接着聊",
].join("\n")
const 是摘要请求 = (系统原文) => 系统原文.includes("context summarization assistant")

/**
 * **「塞满上下文」= 这一轮报 12 万输入 token**（2026-09-27；准入规则 1）。
 *
 * 默认用量是 12 / 8 / 20，上下文永远是空的——仪表的提醒档、pi 的自动压缩在 mock 与 e2e 里都到不了。
 * 128k 的模型线在 128000 − 16384 = 111616，报 120000 就过线，这一轮收尾时 pi 自己压。
 * **只看最后一句用户话**：历史里说过一次不该让之后每一轮都「塞满」。
 */
const 默认用量 = { prompt_tokens: 12, completion_tokens: 8, total_tokens: 20 }
export const 塞满用量 = { prompt_tokens: 120000, completion_tokens: 8, total_tokens: 120008 }

/**
 * 起一个假推理服务器。
 *
 * @param {object} [opts]
 * @param {number} [opts.failStatus] 让所有请求以这个 HTTP 状态失败（验「失败要出声」）
 * @param {string} [opts.failMessage] 失败时的 message
 * @param {string} [opts.reply] 固定回复正文
 * @param {(body: any) => {toolName: string, args: object, say?: string} | undefined} [opts.toolCall]
 * @param {number} [opts.thinkingHoldMs] 想完之后停多久再开口。**演的是 kimi 那段真空**
 * @param {string} [opts.thinking] 假模型「想」的内容。**给了才发**——
 *   大多数用例不需要它，平白多一段思考会把别的断言的上下文搅乱
 *   返回值非空时，改为让模型「调用一个工具」——用来在 e2e 里确定性地触发工具路径
 * @returns {Promise<{url: string, port: number, requests: any[], keyChecks: any[], close: () => Promise<void>}>}
 */
export function startMockInferenceServer(opts = {}) {
  const 默认回复 = opts.reply ?? CANNED_REPLY
  /** 收到的请求原样留存，供测试断言「我们到底发了什么给模型」 */
  const requests = []
  /**
   * 填 key 时那一次验证（B9，2026-09-01）**另记一本**，不进 `requests`。
   *
   * 后端存完 key 会用对话真会发的那条请求问一句（user 是 `DAWN key check`，1 个 token）。
   * 它要是混进 `requests`，「第一次请求用的是哪个模型」「请求数没变」这类断言全会挪一位——
   * 而那些用例验的不是它。分开记，两边都还是真的：验证发没发看 `keyChecks`，对话发了什么看 `requests`。
   */
  const keyChecks = []
  /** 与 `src/workbench/key-validate.ts` 的 `KEY_CHECK_PROMPT` 是同一句——这是 .mjs 脚本，抄了一份字面量，改要两边一起改 */
  const KEY_CHECK_PROMPT = "DAWN key check"

  const server = http.createServer((req, res) => {
    let raw = ""
    req.on("data", (c) => (raw += c))
    req.on("end", async () => {
      // 模型目录探测：pi 会问 /v1/models。给一个空表即可，
      // 真正用哪个模型由 models.json 决定
      if (req.url?.endsWith("/models") && req.method === "GET") {
        res.writeHead(200, { "content-type": "application/json" })
        res.end(JSON.stringify({ object: "list", data: [] }))
        return
      }

      let body
      try {
        body = raw ? JSON.parse(raw) : {}
      } catch {
        // 解析不了也要如实回一个错误，不要假装成功——
        // 假服务器同样受「无静默回退」约束（规格 7.5）
        res.writeHead(400, { "content-type": "application/json" })
        res.end(JSON.stringify({ error: { message: "mock server 收到了非 JSON 的请求体" } }))
        return
      }
      const 文本 = (c) => (typeof c === "string" ? c : Array.isArray(c) ? c.map((x) => x?.text ?? "").join("") : "")
      const 最后一句 = 文本([...(body.messages ?? [])].reverse().find((m) => m.role === "user")?.content)
      // **整句相等**才是验证（2026-09-01 终审 F6）：`includes` 会把一句提到「DAWN key check」的对话也劫走
      const 是key验证 = 最后一句.trim() === KEY_CHECK_PROMPT
      ;(是key验证 ? keyChecks : requests).push({ url: req.url, body })

      // 演一次失败（桌面通知，2026-09-27）：只这一问 401，会话里其它问照常。
      // 摘要请求不算——它的 user 那条装着整段对话原文，里面的「演一次失败」是被摘要的话
      const 是摘要 = 是摘要请求(文本(body.messages?.find?.((m) => m.role === "system" || m.role === "developer")?.content))
      if (!是key验证 && !是摘要 && 最后一句用户话(body)?.includes("演一次失败")) {
        res.writeHead(401, { "content-type": "application/json" })
        res.end(JSON.stringify({ error: { message: "mock：演一次失败", type: "invalid_request_error" } }))
        return
      }

      /**
       * **说了「markdown」就给那一大段。** 排版这件事看不见就没法改，
       * 而一句暗号里没有标题也没有表格。
       */
      /**
       * **让它失败**（2026-08-10）。
       *
       * 加这一档是为了验一件本来验不了的事：**请求被拒时界面说不说话**。
       * 真实场景里这非常常见——key 写错了、过期了、额度用完了。
       * 而「失败必须出声」是本项目的硬规矩（规格 7.5）。
       */
      if (opts.failStatus) {
        res.writeHead(opts.failStatus, { "content-type": "application/json" })
        res.end(
          JSON.stringify({
            error: { message: opts.failMessage ?? "mock：这个 key 不对", type: "invalid_request_error" },
          }),
        )
        return
      }

      const 用户说的 = JSON.stringify(body.messages ?? "")

      /**
       * **收到图片就说出它看见了几张**（协议 4.12，2026-08-13）。
       *
       * 这是本项目第一条硬规则要的那一半：*「新增协议操作，必须在同一次改动里
       * 补 mock 分支」*。不补的话，「图片真的送到了模型那儿」这件事
       * **在 mock 模式与 e2e 里都无法证伪**——界面上看起来一切正常，
       * 而那正是最坏的一种「本地是好的」。
       *
       * 数的是 OpenAI 兼容协议里的 `image_url` 片段（pi 就是这么发的）。
       *
       * **只数 `"type":"image_url"`**：那个形状是
       * `{"type":"image_url","image_url":{"url":"…"}}`——
       * 光数 `"image_url"` 每张图会数出两个（一次是 type 的值，一次是对象的键）。
       * 第一版就是这么把一张图数成两张的。
       */
      /**
       * **视觉服务共用这台假服务器**（2026-08-20，规则 ①）。
       * 视觉端点说的就是同一种 OpenAI Chat Completions（`stream: false`），
       * 所以下面这条「收到图就报几张」同时覆盖：贴图直发收图模型、
       * 视觉转述、`look_at_image` 工具、设置里的「测试视觉模型」——
       * 四条路的断言都认这句话。
       */
      const 图片数 = (用户说的.match(/"type":"image_url"/g) ?? []).length
      /**
       * **提示词增强也共用这台假服务器**（2026-08-21，规则 ①）。
       * 认两种请求：system 里带「只输出改写后的提示词」= 一次改写，回「改写：<三引号里的原文>」
       * （原文前还带着什么参考块，原样复述在前面，e2e 据此断言带没带上下文）；
       * user 里带「只回一个 JSON 对象」= 一次判定，按正文里有没有「相关」「开发」「README」回 JSON。
       */
      // 有的模型 pi 用 `developer` 角色放系统提示词——两种都认
      const 系统原文 = 文本(body.messages?.find?.((m) => m.role === "system" || m.role === "developer")?.content)
      const 摘要 = 是摘要请求(系统原文)
      const 增强 = 系统原文.includes("只输出改写后的提示词")
      const 判定 = 最后一句.includes("只回一个 JSON 对象")
      // key 验证只要一个能解析的回答（`max_tokens: 1`，后端只看它抛不抛）；`failStatus` 在上面已经先拒了——那正是「key 不对」在 e2e 里的样子
      const reply = 摘要
        ? 假摘要
        : 是key验证
        ? "ok"
        : 判定
        ? 最后一句.includes('"related"')
          ? JSON.stringify({ related: /相关/.test(最后一句.split("当前输入")[0] ?? ""), reason: "假判定" })
          : 最后一句.includes("isDevIntent")
            // 只看「当前输入」那一段——模板的定义文字里本来就有「开发」二字
            ? JSON.stringify({ isDevIntent: /开发|功能|代码|重构/.test((最后一句.split("当前输入：")[1] ?? "").split("对话背景")[0] ?? ""), reason: "假判定" })
            : JSON.stringify({ relatedDocs: (最后一句.match(/📄 ([^\n]+)/g) ?? []).map((x) => x.slice(2).trim()).filter((p) => /README|相关/.test(p)), hasProjectMap: /目录树|src\//.test(最后一句), codePaths: ["src/"], reason: "假判定" })
        : 增强
          ? 假改写(最后一句)
          : 图片数 > 0
            ? `假模型已应答：我收到了 ${图片数} 张图。`
            : 最后一句.includes("长回复")
              ? LONG_REPLY
            : 用户说的.includes("markdown")
              ? MARKDOWN_REPLY
              : 用户说的.includes("案例卡片")
                ? 案例卡片回复
                : 默认回复

      const tool = 摘要 ? undefined : (opts.toolCall?.(body) ?? 慢跑工具(body) ?? 改文件工具(body) ?? 子agent工具(body) ?? 演示工具(body) ?? 跑Cox工具(body) ?? 方案工具(body))
      const 用量 = !摘要 && 最后一句.includes("塞满上下文") ? 塞满用量 : 默认用量
      const stream = body.stream !== false

      /**
       * **Anthropic Messages 协议的端点也答**（B9，2026-09-01，规则 ①）。
       *
       * pi 认识的 provider 里有说 Anthropic 协议的（`kimi-coding` 的 `k3` 就是），e2e 把它们的地址盖到
       * 这台假服务器上之后，填 key 那一次验证打到的是 `…/v1/messages`。此前这里只会吐 OpenAI 的 SSE，
       * pi 的 Anthropic 解析器读完说「stream ended without a stop reason」——验证被记成「没能判定」，
       * 而那不是 key 的事，是假服务器不会说这门话。事件形状照 pi 的解析器要的最小集
       * （`@earendil-works/pi-ai/dist/api/anthropic-messages.js`：message_start 带 usage、
       * content_block_*、message_delta 带 stop_reason、message_stop）。只答文字，不答工具调用。
       *
       * **这一支到此为止，不走下面 OpenAI 那一支的 `tool` / `图片数` / `增强` 处理**（2026-09-01 终审 F8）：
       * 今天只有填 key 那一次验证会打到这里，它要的只是一句话。哪天有用例要在 Anthropic 协议上
       * 验工具调用或收图，得在这里补，不能指望下面那些分支——它们在这条 return 之后。
       */
      /**
       * **按路径判，不按整串判**（2026-09-20，pi 升 0.86.0 时撞的）。
       *
       * 0.84 打的是 `<baseUrl>/messages`；0.86 打的是 `<baseUrl>/v1/messages?beta=true`。
       * 原先这里 `endsWith("/messages")`，带上 `?beta=true` 之后当场不认，
       * 于是这一支不接、掉进下面 OpenAI 那支，pi 的 Anthropic 解析器读完报
       * 「stream ended without a stop reason」——**症状离原因很远**。
       */
      if ((req.url ?? "").split("?")[0].endsWith("/messages")) {
        const usage = { input_tokens: 1, output_tokens: 1 }
        if (!stream) {
          res.writeHead(200, { "content-type": "application/json" })
          res.end(JSON.stringify({ id: "msg-mock", type: "message", role: "assistant", model: body.model, content: [{ type: "text", text: reply }], stop_reason: "end_turn", stop_sequence: null, usage }))
          return
        }
        res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" })
        const ev = (type, data) => res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`)
        ev("message_start", { message: { id: "msg-mock", type: "message", role: "assistant", model: body.model, content: [], stop_reason: null, usage } })
        ev("content_block_start", { index: 0, content_block: { type: "text", text: "" } })
        ev("content_block_delta", { index: 0, delta: { type: "text_delta", text: reply } })
        ev("content_block_stop", { index: 0 })
        ev("message_delta", { delta: { stop_reason: "end_turn", stop_sequence: null }, usage })
        ev("message_stop", {})
        res.end()
        return
      }

      if (!stream) {
        res.writeHead(200, { "content-type": "application/json" })
        res.end(JSON.stringify(nonStreamPayload(reply, tool, 用量)))
        return
      }

      res.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive",
      })
      /**
       * **第一个字之前先停一会儿**（2026-08-13）。
       *
       * 真实的模型（作者的 kimi）在这里有几秒的空窗，而界面正是在那段空窗里
       * 看起来像卡死了。**没有这个旋钮，「等回话」那个记号根本没有窗口出现**——
       * 用例只能软断言，等于没验。
       */
      if (opts.firstChunkDelayMs) await new Promise((r) => setTimeout(r, opts.firstChunkDelayMs))
      const 慢 = !摘要 && !tool && 最后一句.includes("慢慢说")
      for (const chunk of streamChunks(reply, tool, opts.thinking, 慢 ? 慢速.每段字数 : undefined, 用量)) {
        res.write(`data: ${JSON.stringify(chunk)}\n\n`)
        /**
         * **想完之后停一会儿再说话**（2026-08-14，准入规则 1）。
         *
         * 作者报的那个现象是：*「等待模型响应的动作结束之后，结果还没有映射完，
         * 然后直接弹出来就是 53s 想了一下。」*——kimi 在「想完」与「开口」之间
         * 有一段真空。假模型此前把思考和正文**背靠背**吐出来，
         * **那段真空在 mock 与 e2e 里根本不存在**，于是那个 bug 只能靠人拿真模型撞见。
         */
        if (opts.thinkingHoldMs && chunk.choices?.[0]?.delta?.reasoning_content) {
          await new Promise((r) => setTimeout(r, opts.thinkingHoldMs))
        }
        if (慢 && chunk.choices?.[0]?.delta?.content) await new Promise((r) => setTimeout(r, 慢速.间隔毫秒))
      }
      res.write("data: [DONE]\n\n")
      res.end()
    })
  })

  return new Promise((resolve, reject) => {
    server.on("error", reject)
    // 端口给 0：**取一个空闲端口**，避免与用户正在跑的东西撞车
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address()
      resolve({
        url: `http://127.0.0.1:${port}/v1`,
        port,
        requests,
        keyChecks,
        close: () => new Promise((r) => server.close(() => r())),
      })
    })
  })
}

/**
 * 每次 tool call 一个新 id（2026-08-21）。此前写死 `call_mock`：同一段会话里
 * 第二次调工具，界面按 id 归并，第二张卡被第一张吃掉——验「第二轮还能跑命令」时
 * 看起来像没调。真模型的 id 本来就每次不同。
 */
let 调用序号 = 0
const 下一个调用id = () => `call_mock_${++调用序号}`
const MODEL_ID = "mock-model"

/** 把回复切成几段发，**让流式路径真的被走到**——一次性发完等于没测流式 */
function streamChunks(reply, tool, thinking, 每段字数, 用量 = 默认用量) {
  const id = "chatcmpl-mock"
  const head = { id, object: "chat.completion.chunk", model: MODEL_ID, choices: [{ index: 0, delta: { role: "assistant" }, finish_reason: null }] }

  if (tool) {
    /**
     * **调工具之前先说一句**（2026-08-15，准入规则 1）。
     *
     * 真模型的一轮常是：说一段 → 调工具 → 再说一段。而假模型此前
     * **只会光秃秃地回一个工具调用**，于是「说完了、正在跑工具」那个中间态
     * 在 mock 与 e2e 里根本不存在——那恰好是 `Agent is already processing`
     * 发生的地方。不补这一句，那条 e2e 就是空转。
     *
     * `tool.say` 没给就不发，**旧用例一个字节不变**。
     */
    const 先说 = tool.say
      ? [{
          id, object: "chat.completion.chunk", model: MODEL_ID,
          choices: [{ index: 0, delta: { content: tool.say }, finish_reason: null }],
        }]
      : []
    return [
      head,
      ...先说,
      {
        id, object: "chat.completion.chunk", model: MODEL_ID,
        choices: [{
          index: 0,
          delta: {
            tool_calls: [{
              index: 0, id: 下一个调用id(), type: "function",
              function: { name: tool.toolName, arguments: JSON.stringify(tool.args) },
            }],
          },
          finish_reason: null,
        }],
      },
      { id, object: "chat.completion.chunk", model: MODEL_ID, choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }] },
    ]
  }

  const parts = 每段字数 ? 按字数切(reply, 每段字数) : splitIntoParts(reply)
  /**
   * **假模型也要会「思考」**（2026-08-12，准入规则 1）。
   *
   * 界面新增了「想了 N 秒 / 点开看它在想什么」那一块（形态学自 Hermes）。
   * 假模型不吐 `reasoning_content` 的话，**那一整块在 mock 模式与 e2e 里
   * 永远不出现**，于是它只能靠人拿真模型试——而那意味着它几乎不会被试。
   *
   * OpenAI 兼容协议里推理内容走 `delta.reasoning_content`，pi 认这个字段。
   * `opts.thinking` 给了才发：**大多数用例不需要它**，
   * 平白多一段思考会把别的断言的上下文搅乱。
   */
  const 思考块 = thinking
    ? [
        {
          id, object: "chat.completion.chunk", model: MODEL_ID,
          choices: [{ index: 0, delta: { reasoning_content: thinking }, finish_reason: null }],
        },
      ]
    : []
  return [
    head,
    ...思考块,
    ...parts.map((text) => ({
      id, object: "chat.completion.chunk", model: MODEL_ID,
      choices: [{ index: 0, delta: { content: text }, finish_reason: null }],
    })),
    {
      id, object: "chat.completion.chunk", model: MODEL_ID,
      choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
      usage: 用量,
    },
  ]
}

function nonStreamPayload(reply, tool, 用量 = 默认用量) {
  return {
    id: "chatcmpl-mock",
    object: "chat.completion",
    model: MODEL_ID,
    choices: [{
      index: 0,
      message: tool
        ? { role: "assistant", content: tool.say ?? null, tool_calls: [{ id: 下一个调用id(), type: "function", function: { name: tool.toolName, arguments: JSON.stringify(tool.args) } }] }
        : { role: "assistant", content: reply },
      finish_reason: tool ? "tool_calls" : "stop",
    }],
    usage: 用量,
  }
}

/** 切成三段。段数不重要，**多于一段**才重要 */
function splitIntoParts(text) {
  if (text.length < 3) return [text]
  const n = Math.ceil(text.length / 3)
  return [text.slice(0, n), text.slice(n, n * 2), text.slice(n * 2)].filter(Boolean)
}

/** 「慢慢说」用：每段 n 个字，像真模型一次吐几个 token */
function 按字数切(text, n) {
  const out = []
  for (let i = 0; i < text.length; i += n) out.push(text.slice(i, i + n))
  return out
}

/**
 * 生成指向 mock 的 `models.json`。
 *
 * `api: "openai-completions"` 是显式写死的：pi 的 deepseek provider 本来就是
 * 这个形态，但**依赖别人的默认值会让这个假服务器在 provider 换了之后悄悄失效**。
 */
/**
 * **两个模型，不是一个。**
 *
 * 2026-08-09（①-B″ · U2）：模型选择器需要「有得选」才谈得上验证。
 * 一个模型的假后端能让选择器渲染出来，却证明不了**切换真的发生了**——
 * 而假后端记下的请求体里带着 `model` 字段，那正是唯一能从外部证明它的东西。
 *
 * 准入规则 ①：新增协议操作要在同一次改动里补 mock 分支。
 * 这里是同一条规则的另一面——**新增一个「有多种取值」的能力，
 * 假后端就得能提供多种取值**，否则 `dev:mock` 与 e2e 看到的永远是退化情形。
 */
/**
 * @param 收图 这些模型声明不声明 `input: ["text","image"]`（2026-08-13）。
 *
 * **默认声明**。给 `false` 是为了演一种真实存在的配置：
 * 用户自己加的 provider，如果我们生成的条目里没写 `input`，
 * 图就送不出去——作者的 `kimi-k3` 正是这样。
 * 那条路上「发送当场失败」的表现，只有这么造才复现得出来。
 */
export function mockModelsJson(
  baseUrl,
  providerId = "deepseek",
  modelIds = ["deepseek-flash", "deepseek-v4-deep"],
  收图 = true,
) {
  const ids = Array.isArray(modelIds) ? modelIds : [modelIds]
  return {
    providers: {
      [providerId]: {
        baseUrl,
        apiKey: "mock-key-not-a-real-secret",
        api: "openai-completions",
        /**
         * **声明收图**（协议 4.12，2026-08-13）。
         *
         * pi-ai 拼请求时看 `model.input.includes("image")`——**不声明，
         * 图就在它那儿被丢掉**，请求照发、回复照回。
         * 不加这一行的话，「图片真的送到了模型那儿」这条用例
         * **永远是红的，而红的原因与我们的代码无关**。
         */
        models: ids.map((id) => ({
          id,
          name: `Mock ${id}`,
          api: "openai-completions",
          ...(收图 ? { input: ["text", "image"] } : {}),
        })),
      },
    },
  }
}
