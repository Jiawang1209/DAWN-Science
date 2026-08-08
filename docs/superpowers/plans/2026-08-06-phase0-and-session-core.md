# Phase 0 + 阶段①-A：地基验证与会话核心 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 验证三项技术地基，然后建成能管理多个 agent 会话（Native + PTY）的核心库——不含 UI，用 CLI 冒烟验证。

**Architecture:** 单一 TypeScript 包，分四层：`config`（Provider 注册表）→ `store`（SQLite 持久化）→ `runtime`（AgentRuntime 接口 + Native/PTY/Fake 三实现）→ `session`（生命周期 + 租约）。所有运行时藏在一个接口后面，业务逻辑对 `FakeRuntime` 做 TDD，真实现只做薄适配。状态一律先落库再改内存。

**Tech Stack:** TypeScript 5 · Node 22 · vitest · zod · better-sqlite3 · node-pty · `@earendil-works/pi-agent-core` · `@earendil-works/pi-ai` · `@modelcontextprotocol/sdk`

**参考实现：** 进程组终止序列与边界常量取自 Buzz（Block, Inc., Apache 2.0）`crates/buzz-dev-mcp/src/shell.rs`；Native Runtime 的会话与上下文管理参考 `crates/buzz-agent`。

**上游规格：** `docs/superpowers/specs/2026-08-06-multi-agent-ds-workbench-design.md`

---

## 范围

**本计划包含：** Phase 0 **四个 spike** + 阶段①-A（Provider 注册表、SQLite 存储、AgentRuntime 三实现、会话生命周期、输入租约、终端流、CLI 冒烟）

**本计划不含：** Electron 外壳、React UI、终端墙（阶段①-B）；科学计算内核（阶段②）；编排（阶段③）

---

## 文件结构

```
dawn/
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── spikes/                          # Phase 0 一次性代码，验证完即冻结
│   ├── a-pi-embed.ts
│   ├── b-pty-mcp-hook.ts
│   ├── c-electron-term/
│   ├── d-jupyter-kernel.ts
│   ├── d-electron-zmq/
│   ├── types/spawnteract.d.ts
│   └── FINDINGS.md                  # 四个 spike 的结论，后续任务依赖它
├── src/
│   ├── config/
│   │   ├── schema.ts                # zod：Endpoint / AgentDef / ProviderRegistry
│   │   └── loader.ts                # 读 YAML → 校验 → 解析 ${ENV}
│   ├── store/
│   │   ├── schema.ts                # SQLite DDL + 迁移
│   │   └── sessions.ts              # 会话表读写
│   ├── runtime/
│   │   ├── types.ts                 # AgentRuntime 接口与事件类型
│   │   ├── fake.ts                  # FakeRuntime，业务逻辑 TDD 用
│   │   ├── native.ts                # pi 适配器
│   │   ├── pty.ts                   # node-pty 适配器
│   │   └── session-dir.ts           # per-session 隔离配置目录生成
│   ├── session/
│   │   ├── manager.ts               # 生命周期：先落库再改内存
│   │   ├── lease.ts                 # ControllerLease / Observer / Takeover
│   │   └── stream.ts                # ring buffer + 背压
│   └── cli.ts                       # 冒烟入口
└── tests/
    ├── config/loader.test.ts
    ├── store/sessions.test.ts
    ├── runtime/fake.test.ts
    ├── runtime/session-dir.test.ts
    ├── session/manager.test.ts
    ├── session/lease.test.ts
    ├── session/stream.test.ts
    └── integration/pty.test.ts
```

**责任边界**：`runtime/*` 只管"怎么跟一个 agent 进程说话"，不知道会话、租约、持久化。`session/*` 只管生命周期与写权，不知道 provider 细节。两者通过 `runtime/types.ts` 的接口相接。

---

# Part 0 · Phase 0 地基 Spike

> Spike 代码是一次性的，目的是拿到事实，不是写产品。四个结论写进 `spikes/FINDINGS.md`，Part 1 依赖它。
>
> **Spike D 的分量与其它三个不同**——A/B/C 影响某个模块的实现方式，**D 影响整个技术栈选型**。它不通过，规格第 10.1 节的 TypeScript 定案需回退重议。

## Task 0.1: 项目骨架与工具链

**Files:**
- Create: `dawn/package.json`
- Create: `dawn/tsconfig.json`
- Create: `dawn/vitest.config.ts`
- Create: `dawn/.gitignore`

- [ ] **Step 1: 创建目录并初始化**

```bash
mkdir -p dawn/src dawn/tests dawn/spikes
cd dawn
```

- [ ] **Step 2: 写 package.json**

```json
{
  "name": "dawn-science",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "engines": { "node": ">=22" },
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit",
    "spike:a": "tsx spikes/a-pi-embed.ts",
    "spike:b": "tsx spikes/b-pty-mcp-hook.ts"
  },
  "dependencies": {
    "@earendil-works/pi-agent-core": "*",
    "@earendil-works/pi-ai": "*",
    "@modelcontextprotocol/sdk": "^1.0.0",
    "better-sqlite3": "^11.0.0",
    "node-pty": "^1.0.0",
    "yaml": "^2.5.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.0",
    "@types/node": "^22.0.0",
    "tsx": "^4.19.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 3: 写 tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "types": ["node"],
    "outDir": "dist"
  },
  "include": ["src", "tests", "spikes"]
}
```

- [ ] **Step 4: 写 vitest.config.ts**

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    testTimeout: 20_000,
  },
})
```

- [ ] **Step 5: 写 .gitignore**

```
node_modules/
dist/
*.db
*.db-journal
.env
```

- [ ] **Step 6: 安装并验证工具链**

Run: `npm install && npm run typecheck`
Expected: 安装成功；`tsc --noEmit` 无输出（零错误）。

若 `@earendil-works/pi-*` 版本号 `*` 解析失败，改为 npm 上的当前版本号后重跑。

- [ ] **Step 7: 提交**

```bash
git add dawn/
git commit -m "chore: 初始化 dawn 项目骨架与工具链"
```

---

## Task 0.2: Spike A — pi 可嵌入性

**验证问题：** `pi` 能否被当作库嵌入，注入自定义工具，并**强制 JSON Schema**？

**Files:**
- Create: `dawn/spikes/a-pi-embed.ts`

- [ ] **Step 1: 探明 pi 的实际导出**

```bash
cd dawn
node -e "import('@earendil-works/pi-agent-core').then(m => console.log(Object.keys(m).sort().join('\n')))" > /tmp/pi-agent-exports.txt
node -e "import('@earendil-works/pi-ai').then(m => console.log(Object.keys(m).sort().join('\n')))" > /tmp/pi-ai-exports.txt
head -50 /tmp/pi-agent-exports.txt /tmp/pi-ai-exports.txt
```

Expected: 列出导出符号。确认其中有 `Agent`、`agentLoop` 或 `runAgentLoop`（agent-core），以及 provider 构造函数（ai）。**把实际看到的符号名记下来，下一步按它们写。**

- [ ] **Step 2: 写 spike 脚本**

按上一步看到的真实符号名填写导入。以下为骨架，`__` 标注处替换为实际 API：

```ts
// spikes/a-pi-embed.ts
// Spike A：验证 pi 可嵌入 + 工具注入 + schema 强制
import { z } from 'zod'

const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY
if (!DEEPSEEK_KEY) {
  console.error('需要设置 DEEPSEEK_API_KEY')
  process.exit(1)
}

// 我们要注入的工具：故意用一个严格 schema，看模型填错会不会被拒
const reportSchema = z.object({
  verdict: z.enum(['pass', 'fail', 'unknown']),
  evidence: z.string().min(1),
})

let toolCalls: unknown[] = []

async function main() {
  // ── 按 Step 1 的实际导出填写 ──
  // const session = await createAgentSession({ ... })
  // 关键要点：
  //   1) provider 指向 DeepSeek（base_url https://api.deepseek.com）
  //   2) 注册一个名为 report 的工具，参数 schema = reportSchema
  //   3) 工具 handler 里 push 到 toolCalls
  //   4) prompt 要求模型调用 report

  // 观察并打印：
  console.log('--- 工具调用记录 ---')
  console.log(JSON.stringify(toolCalls, null, 2))
}

main().catch((e) => { console.error(e); process.exit(1) })
```

- [ ] **Step 3: 运行并记录三项事实**

Run: `DEEPSEEK_API_KEY=<你的key> npm run spike:a`

必须回答的三个问题：
1. **能否注入自定义工具**，模型能看到并调用？
2. **schema 是否被强制**——参数不合 schema 时，是被拒绝并要求重填，还是原样透传？
3. **能否拿到** 流式事件、token 用量、工具调用记录？

- [ ] **Step 4: 手工验证 schema 强制**

把 prompt 改成诱导模型填一个非法 `verdict`（例如要求它回答 `"maybe"`），重跑。
Expected: 若 schema 真被强制，应看到重试或校验错误，而非 `verdict: "maybe"` 直接落到 handler。

- [ ] **Step 5: 写入结论**

创建 `dawn/spikes/FINDINGS.md`，写入 Spike A 一节：实际使用的导入符号、创建会话的完整调用签名、工具注册方式、schema 强制的观察结果、事件流形状。**Task 1.6 会直接依赖这份记录。**

- [ ] **Step 6: 决策门**

- 三个问题全为"是" → 通过，Native Runtime 走 pi
- schema 未被强制 → 通过但降级：Native Runtime 需自加一层校验与重试（记入 FINDINGS）
- 无法注入工具 → **不通过**，Native Runtime 改自建 loop 或全走 PTY，需回到 spec 修订

- [ ] **Step 7: 提交**

```bash
git add dawn/spikes/a-pi-embed.ts dawn/spikes/FINDINGS.md
git commit -m "spike: 验证 pi 可嵌入性与 schema 强制"
```

---

## Task 0.3: Spike B — PTY + MCP + Hook 三件套

**验证问题：** 能否在**不污染用户全局配置**的前提下，给一个 PTY 里的 claude 注入 MCP server，并接到回合结束 hook？

**Files:**
- Create: `dawn/spikes/b-pty-mcp-hook.ts`

- [ ] **Step 1: 写一个最小 MCP server**

```ts
// spikes/mcp-probe-server.ts
// 最小 MCP server：只暴露一个 probe 工具，被调用时写一行到日志文件
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { appendFileSync } from 'node:fs'
import { z } from 'zod'

const LOG = process.env.DAWN_PROBE_LOG!

const server = new McpServer({ name: 'dawn-probe', version: '0.0.1' })

server.tool(
  'dawn_probe',
  '把一条消息记录到 DAWN 探针日志。测试用。',
  { message: z.string() },
  async ({ message }) => {
    appendFileSync(LOG, JSON.stringify({ kind: 'tool', message }) + '\n')
    return { content: [{ type: 'text', text: 'recorded' }] }
  },
)

await server.connect(new StdioServerTransport())
```

- [ ] **Step 2: 写 hook 脚本**

```bash
# spikes/hook-probe.sh
#!/usr/bin/env bash
# Claude Code Stop hook：回合结束时被调用，把事件写进探针日志
echo "{\"kind\":\"hook\",\"at\":\"$(date -Iseconds)\"}" >> "$DAWN_PROBE_LOG"
exit 0
```

Run: `chmod +x dawn/spikes/hook-probe.sh`

- [ ] **Step 3: 写 spike 脚本（生成隔离配置 + 起 PTY）**

```ts
// spikes/b-pty-mcp-hook.ts
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import * as pty from 'node-pty'

const sessionDir = mkdtempSync(join(tmpdir(), 'dawn-spike-'))
const probeLog = join(sessionDir, 'probe.jsonl')
writeFileSync(probeLog, '')

const repoRoot = resolve(import.meta.dirname, '..')

// per-session 配置：注入 MCP server + Stop hook。绝不碰 ~/.claude
writeFileSync(join(sessionDir, 'settings.json'), JSON.stringify({
  mcpServers: {
    'dawn-probe': {
      command: 'npx',
      args: ['tsx', join(repoRoot, 'spikes/mcp-probe-server.ts')],
      env: { DAWN_PROBE_LOG: probeLog },
    },
  },
  hooks: {
    Stop: [{ hooks: [{ type: 'command', command: join(repoRoot, 'spikes/hook-probe.sh') }] }],
  },
}, null, 2))

console.log('隔离配置目录:', sessionDir)

const p = pty.spawn('claude', [], {
  name: 'xterm-256color',
  cols: 100, rows: 30,
  cwd: process.cwd(),
  env: { ...process.env, CLAUDE_CONFIG_DIR: sessionDir, DAWN_PROBE_LOG: probeLog },
})

p.onData((d) => process.stdout.write(d))
p.onExit(({ exitCode }) => {
  console.log('\n--- PTY 退出, code =', exitCode, '---')
  console.log('--- 探针日志 ---')
  console.log(existsSync(probeLog) ? readFileSync(probeLog, 'utf8') : '(空)')
})

// 让 agent 调用注入的工具
setTimeout(() => {
  p.write('请调用 dawn_probe 工具，message 参数填 "hello from dawn"。\r')
}, 4000)
```

- [ ] **Step 4: 运行并观察**

Run: `cd dawn && npx tsx spikes/b-pty-mcp-hook.ts`

必须回答：
1. `claude` 是否在隔离配置下启动（`CLAUDE_CONFIG_DIR` 是否被尊重）？
2. 探针日志里是否出现 `{"kind":"tool",...}`——**MCP 工具可见且可调用**？
3. 回合结束后是否出现 `{"kind":"hook",...}`——**Stop hook 触发**？
4. 用户的 `~/.claude/settings.json` 是否**未被修改**？

- [ ] **Step 5: 验证全局配置未被污染**

```bash
ls -la ~/.claude/settings.json && md5 ~/.claude/settings.json
```
在 spike 前后各跑一次，对比 md5。
Expected: 两次一致。若不一致，隔离失败，必须换隔离机制。

- [ ] **Step 6: 对 Codex 重复验证**

改用 `codex` 启动，配置改为 `config.toml` 的 `notify` 字段指向 `hook-probe.sh`，环境变量用 `CODEX_HOME` 指向 sessionDir。
Expected: 同样拿到 tool 与 hook 两条记录。

- [ ] **Step 7: 写入结论并设决策门**

在 `FINDINGS.md` 增加 Spike B 一节：claude / codex 各自生效的**环境变量名**、**配置文件名**、**配置结构**、hook 事件名、以及是否污染全局。

- 四问全"是" → 通过
- MCP 通但 hook 不通 → 降级：完成信号只能靠超时，记入风险
- 隔离失败 → **不通过**，需另寻隔离手段（容器 / 独立 HOME）

- [ ] **Step 8: 提交**

```bash
git add dawn/spikes/
git commit -m "spike: 验证 PTY + MCP 注入 + Hook 完成信号与配置隔离"
```

---

## Task 0.4: Spike C — Electron 终端可用性

**验证问题：** Electron 里同时跑 4 个 `node-pty` + `xterm.js` 是否流畅？

**Files:**
- Create: `dawn/spikes/c-electron-term/package.json`
- Create: `dawn/spikes/c-electron-term/main.js`
- Create: `dawn/spikes/c-electron-term/preload.js`
- Create: `dawn/spikes/c-electron-term/index.html`

- [ ] **Step 1: 建目录与依赖**

```bash
mkdir -p dawn/spikes/c-electron-term
cd dawn/spikes/c-electron-term
npm init -y
npm i electron node-pty @xterm/xterm @xterm/addon-fit
```

- [ ] **Step 2: 写 main.js**

```js
const { app, BrowserWindow, ipcMain } = require('electron')
const pty = require('node-pty')
const path = require('node:path')

const shells = new Map()

app.whenReady().then(() => {
  const win = new BrowserWindow({
    width: 1400, height: 900,
    webPreferences: { preload: path.join(__dirname, 'preload.js') },
  })
  win.loadFile('index.html')

  ipcMain.on('spawn', (_e, id) => {
    const p = pty.spawn(process.env.SHELL || 'bash', [], {
      name: 'xterm-256color', cols: 80, rows: 24, cwd: process.env.HOME,
    })
    p.onData((d) => win.webContents.send('data', id, d))
    shells.set(id, p)
  })
  ipcMain.on('input', (_e, id, data) => shells.get(id)?.write(data))
})
```

- [ ] **Step 3: 写 preload.js**

```js
const { contextBridge, ipcRenderer } = require('electron')
contextBridge.exposeInMainWorld('term', {
  spawn: (id) => ipcRenderer.send('spawn', id),
  input: (id, data) => ipcRenderer.send('input', id, data),
  onData: (cb) => ipcRenderer.on('data', (_e, id, d) => cb(id, d)),
})
```

- [ ] **Step 4: 写 index.html（4 宫格）**

```html
<!doctype html>
<html>
<head>
  <link rel="stylesheet" href="node_modules/@xterm/xterm/css/xterm.css" />
  <style>
    body { margin:0; display:grid; grid-template-columns:1fr 1fr; grid-template-rows:1fr 1fr;
           gap:4px; height:100vh; background:#111 }
    .pane { overflow:hidden }
  </style>
</head>
<body>
  <div class="pane" id="p0"></div><div class="pane" id="p1"></div>
  <div class="pane" id="p2"></div><div class="pane" id="p3"></div>
  <script type="module">
    import { Terminal } from './node_modules/@xterm/xterm/lib/xterm.mjs'
    const terms = {}
    for (let i = 0; i < 4; i++) {
      const t = new Terminal({ fontSize: 12, scrollback: 5000 })
      t.open(document.getElementById('p' + i))
      t.onData((d) => window.term.input(i, d))
      terms[i] = t
      window.term.spawn(i)
    }
    window.term.onData((id, d) => terms[id].write(d))
  </script>
</body>
</html>
```

- [ ] **Step 5: 运行压力测试**

Run: `cd dawn/spikes/c-electron-term && npx electron .`

在四个终端里同时执行大量输出：
```bash
yes "0123456789abcdefghijklmnopqrstuvwxyz" | head -200000
```

观察并记录：
1. 四个终端是否都能正常交互（输入回显、Ctrl-C 生效）？
2. 刷屏时界面是否卡死？CPU 与内存峰值多少？
3. 窗口 resize 后终端尺寸是否正确跟随？

- [ ] **Step 6: 写入结论与决策门**

在 `FINDINGS.md` 增加 Spike C 一节：CPU/内存实测数字、是否卡顿、是否需要输出节流（若需要，记下可接受的节流阈值，Task 1.10 会用）。

- 流畅 → 通过，桌面壳定 Electron
- 卡顿但节流后可接受 → 通过，Task 1.10 必须实现背压
- 无法接受 → **不通过**，重选桌面壳，回 spec 修订

- [ ] **Step 7: 提交**

```bash
git add dawn/spikes/c-electron-term
git commit -m "spike: 验证 Electron 多终端并发渲染性能"
```

---

## Task 0.5: Spike D — Jupyter 内核链路

**验证问题：** nteract 栈能否起内核、拿到输出、**中断执行**？`zeromq` 在 Electron 里能否通过 ABI 重编译？

> **这是语言决策的唯一风险点。** 规格 10.1 把主体定为 TypeScript，依据是「nteract 栈已提供 `jupyter_client` 的等价能力」。本 spike 若不通过，回退 Python 方案。

**Files:**
- Create: `dawn/spikes/d-jupyter-kernel.ts`
- Create: `dawn/spikes/types/spawnteract.d.ts`
- Create: `dawn/spikes/d-electron-zmq/`

- [ ] **Step 1: 确认本机有 Python 内核**

```bash
python3 -m ipykernel --version 2>/dev/null || python3 -m pip install ipykernel
python3 -m ipykernel install --user --name dawn-spike
jupyter kernelspec list 2>/dev/null || python3 -m jupyter kernelspec list
```

Expected: 列表中出现 `dawn-spike`。若 `jupyter` 命令不存在，`pip install jupyter_client` 后重试。

- [ ] **Step 2: 装依赖**

```bash
cd dawn
npm i spawnteract@5 enchannel-zmq-backend@10 @nteract/messaging@7 rxjs
```

Expected: 安装成功。`zeromq` 会作为 `enchannel-zmq-backend` 的依赖被拉入并编译原生模块——**若此处编译失败，Spike D 立即判负**。

- [ ] **Step 3: 补 spawnteract 的类型声明**

`spawnteract` 是 CommonJS 且无 `.d.ts`，需自行声明：

```ts
// spikes/types/spawnteract.d.ts
declare module "spawnteract" {
  import type { ChildProcess } from "node:child_process"

  export interface JupyterConnectionInfo {
    version: number
    iopub_port: number
    shell_port: number
    stdin_port: number
    control_port: number
    hb_port: number
    ip: string
    key: string
    signature_scheme: "hmac-sha256"
    transport: "tcp" | "ipc"
  }

  export interface LaunchedKernel {
    spawn: ChildProcess
    connectionFile: string
    config: JupyterConnectionInfo
    kernelSpec: { name: string; argv: string[]; display_name: string; interrupt_mode?: "signal" | "message" }
  }

  export function launch(
    kernelName: string,
    spawnOptions?: Record<string, unknown>,
    specs?: unknown,
  ): Promise<LaunchedKernel>
}
```

- [ ] **Step 4: 写 spike 脚本**

```ts
// spikes/d-jupyter-kernel.ts
import { launch } from "spawnteract"
import { createMainChannel } from "enchannel-zmq-backend"
import { createMessage, childOf, ofMessageType } from "@nteract/messaging"
import { filter, take, takeUntil, tap } from "rxjs/operators"
import { Subject } from "rxjs"

const KERNEL = process.env.DAWN_KERNEL ?? "dawn-spike"

function executeRequest(code: string) {
  return createMessage("execute_request", {
    content: {
      code,
      silent: false,
      store_history: true,
      user_expressions: {},
      allow_stdin: false,
      stop_on_error: true,
    },
  })
}

async function main() {
  console.log(`[1] 启动内核 ${KERNEL}`)
  const kernel = await launch(KERNEL)
  console.log(`    pid=${kernel.spawn.pid}  interrupt_mode=${kernel.kernelSpec.interrupt_mode ?? "signal"}`)
  console.log(`    shell=${kernel.config.ip}:${kernel.config.shell_port}`)

  console.log("[2] 建立通道")
  const channels = await createMainChannel(kernel.config)

  // ── 验证 1：执行并拿到 iopub 输出 ──
  console.log("[3] 执行 print，等待 iopub stream")
  const msg = executeRequest('print("DAWN_MARKER_OK")')
  const done = new Subject<void>()
  const seen: string[] = []

  channels
    .pipe(
      childOf(msg),
      ofMessageType("stream", "execute_result", "error", "status"),
      tap((m) => {
        const c = m.content as Record<string, unknown>
        seen.push(`${m.header.msg_type}: ${JSON.stringify(c).slice(0, 120)}`)
      }),
      takeUntil(done),
    )
    .subscribe()

  channels.next(msg)
  await new Promise((r) => setTimeout(r, 4000))
  done.next()

  console.log("    收到的消息:")
  for (const s of seen) console.log("      " + s)
  const gotOutput = seen.some((s) => s.includes("DAWN_MARKER_OK"))
  console.log(`    ✅ 拿到输出: ${gotOutput}`)

  // ── 验证 2：中断一个死循环 ──
  console.log("[4] 执行死循环，2 秒后中断")
  const loopMsg = executeRequest("import time\nwhile True:\n    time.sleep(0.1)")
  const interruptDone = new Subject<void>()
  let sawKeyboardInterrupt = false

  channels
    .pipe(
      childOf(loopMsg),
      ofMessageType("error", "execute_reply"),
      tap((m) => {
        const c = m.content as Record<string, unknown>
        const text = JSON.stringify(c)
        if (text.includes("KeyboardInterrupt")) sawKeyboardInterrupt = true
        console.log(`      ${m.header.msg_type}: ${text.slice(0, 160)}`)
      }),
      takeUntil(interruptDone),
    )
    .subscribe()

  channels.next(loopMsg)
  await new Promise((r) => setTimeout(r, 2000))

  // ipykernel 默认 interrupt_mode = "signal"：向内核进程发 SIGINT
  const mode = kernel.kernelSpec.interrupt_mode ?? "signal"
  if (mode === "signal") {
    console.log("    发送 SIGINT")
    kernel.spawn.kill("SIGINT")
  } else {
    console.log("    发送 interrupt_request（control 通道）")
    channels.next(createMessage("interrupt_request", { content: {}, channel: "control" } as never))
  }

  await new Promise((r) => setTimeout(r, 3000))
  interruptDone.next()
  console.log(`    ✅ 中断生效（收到 KeyboardInterrupt）: ${sawKeyboardInterrupt}`)

  // ── 收尾 ──
  channels.complete()
  kernel.spawn.kill()

  console.log("\n=== Spike D 结果 ===")
  console.log(`  起内核        : ✅`)
  console.log(`  拿到 iopub 输出: ${gotOutput ? "✅" : "❌"}`)
  console.log(`  中断执行       : ${sawKeyboardInterrupt ? "✅" : "❌"}`)
  process.exit(gotOutput && sawKeyboardInterrupt ? 0 : 1)
}

main().catch((e) => {
  console.error("Spike D 失败:", e)
  process.exit(1)
})
```

- [ ] **Step 5: 运行并记录**

Run: `cd dawn && npx tsx spikes/d-jupyter-kernel.ts`

Expected: 三项全 ✅，退出码 0。

三个必须回答的问题：
1. **能否起内核并拿到 `iopub` 输出？**
2. **能否中断正在执行的 cell？**（这是规格 10.4 的硬要求，wisp-science 的自研方案就败在这一条）
3. `zeromq` 原生模块编译是否顺利？

- [ ] **Step 6: 在 Electron 中验证 ABI 重编译**

Node 与 Electron 的 V8 ABI 不同，原生模块必须为 Electron 单独编译。

```bash
mkdir -p dawn/spikes/d-electron-zmq && cd dawn/spikes/d-electron-zmq
npm init -y
npm i electron @electron/rebuild spawnteract@5 enchannel-zmq-backend@10 @nteract/messaging@7 rxjs
npx electron-rebuild -f -w zeromq
```

Expected: `electron-rebuild` 成功，输出 `Rebuild Complete`。

再写一个最小 `main.js`，在 Electron 主进程里跑与 Step 4 相同的启动+执行逻辑：

```js
// spikes/d-electron-zmq/main.js
const { app } = require("electron")

app.whenReady().then(async () => {
  try {
    const { launch } = require("spawnteract")
    const { createMainChannel } = require("enchannel-zmq-backend")
    const { createMessage } = require("@nteract/messaging")

    const kernel = await launch(process.env.DAWN_KERNEL || "dawn-spike")
    const channels = await createMainChannel(kernel.config)

    const msg = createMessage("execute_request", {
      content: { code: 'print("DAWN_ELECTRON_OK")', silent: false, store_history: true,
                 user_expressions: {}, allow_stdin: false, stop_on_error: true },
    })

    channels.subscribe((m) => {
      const text = JSON.stringify(m.content)
      if (text.includes("DAWN_ELECTRON_OK")) {
        console.log("✅ Electron 中 zeromq 工作正常")
        kernel.spawn.kill()
        app.exit(0)
      }
    })

    channels.next(msg)
    setTimeout(() => { console.error("❌ 超时未收到输出"); kernel.spawn.kill(); app.exit(1) }, 15000)
  } catch (e) {
    console.error("❌ Electron 中失败:", e)
    app.exit(1)
  }
})
```

Run: `npx electron .`
Expected: 打印 `✅ Electron 中 zeromq 工作正常`，退出码 0。

- [ ] **Step 7: 可选 — 验证 R 内核（Ark）**

若 Step 5、6 均通过，用同一套代码换内核名验证「一套协议通吃」：

```bash
# 下载 Ark（macOS arm64），版本号以其 releases 页为准
curl -L -o /tmp/ark.zip https://github.com/posit-dev/ark/releases/latest/download/ark-darwin-arm64.zip
unzip -o /tmp/ark.zip -d /tmp/ark
/tmp/ark/ark --install-kernel   # 若无此参数，按其 README 手工写 kernelspec
DAWN_KERNEL=ark npx tsx spikes/d-jupyter-kernel.ts
```

Expected: 同样三项通过（R 的死循环用 `while(TRUE) Sys.sleep(0.1)`，需相应改脚本）。

**此步失败不阻断 Spike D** —— 记为已知风险，R 支持后移到阶段 ②-A 再攻。

- [ ] **Step 8: 写入结论与决策门**

在 `dawn/spikes/FINDINGS.md` 增加 Spike D 一节，记录：实际使用的包版本、`interrupt_mode` 实测值、`electron-rebuild` 是否顺利、以及 R 内核结果。

| 结果 | 决策 |
|---|---|
| Step 5 与 6 全过 | ✅ **TypeScript 方案确认**，按规格执行 |
| 中断做不通，其余通过 | ⚠️ 记为已知限制（对应风险 R5），继续 TS 方案，但阶段 ②-A 需专门攻关 |
| `zeromq` 在 Electron 编不过 | ⚠️ 尝试 `zeromq` 预编译版本或换 Electron 版本；仍不通则考虑把内核通信放进独立 Node 子进程 |
| Step 5 就跑不通 | 🔴 **回退 Python 方案**，回到规格 10.1 重新定案 |

- [ ] **Step 9: 提交**

```bash
git add dawn/spikes/d-jupyter-kernel.ts dawn/spikes/types/ dawn/spikes/d-electron-zmq dawn/spikes/FINDINGS.md
git commit -m "spike: 验证 Jupyter 内核链路与 Electron 下的 zeromq"
```

---

## Task 0.6: Phase 0 结论汇总与放行

**Files:**
- Modify: `dawn/spikes/FINDINGS.md`
- Modify: `docs/DEVELOPMENT_HISTORY.md`

- [ ] **Step 1: 补齐 FINDINGS.md 的汇总表**

在文件顶部加一张表：

```markdown
| Spike | 问题 | 结论 | 对后续的影响 |
|---|---|---|---|
| A · pi 可嵌入性 | 能否注入工具并强制 schema | 通过 / 降级 / 不通过 | Task 1.10 的实现方式 |
| B · PTY+MCP+Hook | 能否隔离注入并接到完成信号 | 通过 / 降级 / 不通过 | Task 1.7 / 1.9 的配置生成方式 |
| C · Electron 终端 | 4 终端并发是否流畅 | 通过 / 需节流 / 不通过 | Task 1.8 是否必须背压 |
| **D · Jupyter 内核链路** | **能否起内核、拿输出、中断；Electron 下 zeromq 能否重编译** | 通过 / 部分 / 不通过 | **整个技术栈选型**——不通过则回退 Python |
```

- [ ] **Step 2: 放行判断**

四项全部"通过"或"降级"→ 进入 Part 1。
**任何一项"不通过"→ 停止，回到 spec 修订对应章节，不得继续。**
**若 D 不通过 → 语言定案作废，主体改用 Python，本计划 Part 1 需整体重写。**

- [ ] **Step 3: 记录开发历史**

在 `docs/DEVELOPMENT_HISTORY.md` 顶部追加一条 `Type: chore` 条目，写明三个 spike 的实际结论与由此确定/修改的技术决策。

- [ ] **Step 4: 提交**

```bash
git add dawn/spikes/FINDINGS.md docs/DEVELOPMENT_HISTORY.md
git commit -m "docs: Phase 0 spike 结论汇总与放行判断"
```

---

# Part 1 · 阶段①-A 会话核心

## Task 1.1: Provider 注册表的类型与校验

**Files:**
- Create: `dawn/src/config/schema.ts`
- Test: `dawn/tests/config/loader.test.ts`

- [ ] **Step 1: 写失败的测试**

```ts
// tests/config/loader.test.ts
import { describe, expect, it } from 'vitest'
import { ProviderRegistrySchema } from '../../src/config/schema.js'

describe('ProviderRegistrySchema', () => {
  it('接受 endpoints 与 agents 两段式配置', () => {
    const parsed = ProviderRegistrySchema.parse({
      endpoints: {
        deepseek: {
          baseUrl: 'https://api.deepseek.com/v1',
          apiKey: '${DEEPSEEK_API_KEY}',
          models: ['deepseek-chat'],
        },
      },
      agents: {
        'deepseek-agent': {
          kind: 'native',
          endpoint: 'deepseek',
          model: 'deepseek-chat',
          capabilities: ['fs_write', 'exec'],
        },
        'claude-code': {
          kind: 'pty',
          command: 'claude',
          capabilities: ['fs_write', 'exec', 'mcp', 'hooks'],
        },
      },
    })
    expect(parsed.agents['deepseek-agent']!.kind).toBe('native')
    expect(parsed.endpoints.deepseek!.models).toEqual(['deepseek-chat'])
  })

  it('拒绝 native agent 缺少 endpoint', () => {
    expect(() =>
      ProviderRegistrySchema.parse({
        endpoints: {},
        agents: { bad: { kind: 'native', model: 'x', capabilities: [] } },
      }),
    ).toThrow()
  })

  it('拒绝 pty agent 缺少 command', () => {
    expect(() =>
      ProviderRegistrySchema.parse({
        endpoints: {},
        agents: { bad: { kind: 'pty', capabilities: [] } },
      }),
    ).toThrow()
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd dawn && npx vitest run tests/config/loader.test.ts`
Expected: FAIL — 无法解析模块 `../../src/config/schema.js`

- [ ] **Step 3: 写实现**

```ts
// src/config/schema.ts
import { z } from 'zod'

export const CapabilitySchema = z.enum(['fs_write', 'exec', 'mcp', 'hooks', 'chat'])
export type Capability = z.infer<typeof CapabilitySchema>

export const EndpointSchema = z.object({
  baseUrl: z.string().url(),
  apiKey: z.string().min(1),
  models: z.array(z.string().min(1)).min(1),
})
export type Endpoint = z.infer<typeof EndpointSchema>

const NativeAgentSchema = z.object({
  kind: z.literal('native'),
  endpoint: z.string().min(1),
  model: z.string().min(1),
  capabilities: z.array(CapabilitySchema),
})

const PtyAgentSchema = z.object({
  kind: z.literal('pty'),
  command: z.string().min(1),
  args: z.array(z.string()).default([]),
  capabilities: z.array(CapabilitySchema),
})

export const AgentDefSchema = z.discriminatedUnion('kind', [NativeAgentSchema, PtyAgentSchema])
export type AgentDef = z.infer<typeof AgentDefSchema>

export const ProviderRegistrySchema = z.object({
  endpoints: z.record(z.string(), EndpointSchema),
  agents: z.record(z.string(), AgentDefSchema),
})
export type ProviderRegistry = z.infer<typeof ProviderRegistrySchema>
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run tests/config/loader.test.ts`
Expected: PASS — 3 passed

- [ ] **Step 5: 提交**

```bash
git add dawn/src/config/schema.ts dawn/tests/config/loader.test.ts
git commit -m "feat(config): 两段式 provider 注册表 schema"
```

---

## Task 1.2: 配置加载与引用完整性校验

**Files:**
- Create: `dawn/src/config/loader.ts`
- Modify: `dawn/tests/config/loader.test.ts`

- [ ] **Step 1: 追加失败的测试**

```ts
// 追加到 tests/config/loader.test.ts
import { loadRegistry } from '../../src/config/loader.js'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

function writeYaml(body: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'dawn-cfg-'))
  const file = join(dir, 'providers.yaml')
  writeFileSync(file, body)
  return file
}

describe('loadRegistry', () => {
  it('展开 ${ENV} 占位符', () => {
    const file = writeYaml(`
endpoints:
  deepseek:
    baseUrl: https://api.deepseek.com/v1
    apiKey: \${TEST_DS_KEY}
    models: [deepseek-chat]
agents:
  a:
    kind: native
    endpoint: deepseek
    model: deepseek-chat
    capabilities: [exec]
`)
    const reg = loadRegistry(file, { TEST_DS_KEY: 'sk-real-value' })
    expect(reg.endpoints.deepseek!.apiKey).toBe('sk-real-value')
  })

  it('环境变量缺失时响亮报错，不静默留占位符', () => {
    const file = writeYaml(`
endpoints:
  deepseek:
    baseUrl: https://api.deepseek.com/v1
    apiKey: \${MISSING_KEY}
    models: [deepseek-chat]
agents: {}
`)
    expect(() => loadRegistry(file, {})).toThrow(/MISSING_KEY/)
  })

  it('native agent 引用不存在的 endpoint 时报错', () => {
    const file = writeYaml(`
endpoints: {}
agents:
  a:
    kind: native
    endpoint: nope
    model: m
    capabilities: [exec]
`)
    expect(() => loadRegistry(file, {})).toThrow(/nope/)
  })

  it('native agent 引用 endpoint 未声明的 model 时报错', () => {
    const file = writeYaml(`
endpoints:
  ds:
    baseUrl: https://api.deepseek.com/v1
    apiKey: k
    models: [deepseek-chat]
agents:
  a:
    kind: native
    endpoint: ds
    model: gpt-4
    capabilities: [exec]
`)
    expect(() => loadRegistry(file, {})).toThrow(/gpt-4/)
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/config/loader.test.ts`
Expected: FAIL — 无法解析 `../../src/config/loader.js`

- [ ] **Step 3: 写实现**

```ts
// src/config/loader.ts
import { readFileSync } from 'node:fs'
import { parse as parseYaml } from 'yaml'
import { ProviderRegistrySchema, type ProviderRegistry } from './schema.js'

const ENV_REF = /\$\{([A-Z0-9_]+)\}/g

function expandEnv(value: unknown, env: Record<string, string | undefined>, path: string): unknown {
  if (typeof value === 'string') {
    return value.replace(ENV_REF, (_m, name: string) => {
      const found = env[name]
      // 无静默回退：缺失即响亮失败
      if (found === undefined || found === '') {
        throw new Error(`配置 ${path} 引用了环境变量 \${${name}}，但它未设置或为空`)
      }
      return found
    })
  }
  if (Array.isArray(value)) return value.map((v, i) => expandEnv(v, env, `${path}[${i}]`))
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, expandEnv(v, env, `${path}.${k}`)]),
    )
  }
  return value
}

/** 校验跨段引用完整性：agent → endpoint → model */
function assertReferences(reg: ProviderRegistry): void {
  for (const [agentId, def] of Object.entries(reg.agents)) {
    if (def.kind !== 'native') continue
    const ep = reg.endpoints[def.endpoint]
    if (!ep) {
      throw new Error(`agent "${agentId}" 引用了不存在的 endpoint "${def.endpoint}"`)
    }
    if (!ep.models.includes(def.model)) {
      throw new Error(
        `agent "${agentId}" 的 model "${def.model}" 未在 endpoint "${def.endpoint}" 的 models 中声明`,
      )
    }
  }
}

export function loadRegistry(
  file: string,
  env: Record<string, string | undefined> = process.env,
): ProviderRegistry {
  const raw = parseYaml(readFileSync(file, 'utf8')) as unknown
  const expanded = expandEnv(raw, env, 'providers')
  const reg = ProviderRegistrySchema.parse(expanded)
  assertReferences(reg)
  return reg
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run tests/config/loader.test.ts`
Expected: PASS — 7 passed

- [ ] **Step 5: 提交**

```bash
git add dawn/src/config/loader.ts dawn/tests/config/loader.test.ts
git commit -m "feat(config): 配置加载、环境变量展开与引用完整性校验"
```

---

## Task 1.3: SQLite 存储层

**Files:**
- Create: `dawn/src/store/schema.ts`
- Create: `dawn/src/store/sessions.ts`
- Test: `dawn/tests/store/sessions.test.ts`

- [ ] **Step 1: 写失败的测试**

```ts
// tests/store/sessions.test.ts
import { describe, expect, it, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { migrate } from '../../src/store/schema.js'
import { SessionStore } from '../../src/store/sessions.js'

function makeStore(): SessionStore {
  const db = new Database(':memory:')
  migrate(db)
  return new SessionStore(db)
}

describe('SessionStore', () => {
  let store: SessionStore
  beforeEach(() => { store = makeStore() })

  it('插入后可按 id 读回', () => {
    store.insert({
      id: 's1', agentId: 'claude-code', workspace: '/tmp/w',
      sessionDir: '/tmp/w/.dawn/s1', state: 'starting', createdAt: '2026-08-06T00:00:00Z',
    })
    const got = store.get('s1')
    expect(got?.agentId).toBe('claude-code')
    expect(got?.state).toBe('starting')
  })

  it('更新状态与退出码', () => {
    store.insert({
      id: 's1', agentId: 'a', workspace: '/w', sessionDir: '/w/.dawn/s1',
      state: 'starting', createdAt: '2026-08-06T00:00:00Z',
    })
    store.updateState('s1', 'exited', { exitCode: 3 })
    const got = store.get('s1')
    expect(got?.state).toBe('exited')
    expect(got?.exitCode).toBe(3)
  })

  it('列出所有会话', () => {
    for (const id of ['s1', 's2']) {
      store.insert({
        id, agentId: 'a', workspace: '/w', sessionDir: `/w/.dawn/${id}`,
        state: 'alive', createdAt: '2026-08-06T00:00:00Z',
      })
    }
    expect(store.list().map((s) => s.id).sort()).toEqual(['s1', 's2'])
  })

  it('重启恢复：把残留的 starting/alive 显式标为 exited，而非静默沿用', () => {
    store.insert({
      id: 's1', agentId: 'a', workspace: '/w', sessionDir: '/w/.dawn/s1',
      state: 'alive', createdAt: '2026-08-06T00:00:00Z',
    })
    const n = store.reconcileOnStartup()
    expect(n).toBe(1)
    expect(store.get('s1')?.state).toBe('exited')
  })

  it('读取不存在的会话返回 undefined', () => {
    expect(store.get('nope')).toBeUndefined()
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/store/sessions.test.ts`
Expected: FAIL — 无法解析 `../../src/store/schema.js`

- [ ] **Step 3: 写 schema**

```ts
// src/store/schema.ts
import type Database from 'better-sqlite3'

export const SCHEMA_VERSION = 1

export function migrate(db: Database.Database): void {
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_meta (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id          TEXT PRIMARY KEY,
      agent_id    TEXT NOT NULL,
      workspace   TEXT NOT NULL,
      session_dir TEXT NOT NULL,
      state       TEXT NOT NULL CHECK (state IN ('starting','alive','exited')),
      pid         INTEGER,
      exit_code   INTEGER,
      created_at  TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_state ON sessions(state);
  `)
  db.prepare(`INSERT OR REPLACE INTO schema_meta (key, value) VALUES ('version', ?)`)
    .run(String(SCHEMA_VERSION))
}
```

- [ ] **Step 4: 写 store**

```ts
// src/store/sessions.ts
import type Database from 'better-sqlite3'

export type SessionState = 'starting' | 'alive' | 'exited'

export interface SessionRecord {
  id: string
  agentId: string
  workspace: string
  sessionDir: string
  state: SessionState
  pid?: number
  exitCode?: number
  createdAt: string
}

interface Row {
  id: string; agent_id: string; workspace: string; session_dir: string
  state: SessionState; pid: number | null; exit_code: number | null; created_at: string
}

function toRecord(r: Row): SessionRecord {
  return {
    id: r.id, agentId: r.agent_id, workspace: r.workspace, sessionDir: r.session_dir,
    state: r.state, createdAt: r.created_at,
    ...(r.pid === null ? {} : { pid: r.pid }),
    ...(r.exit_code === null ? {} : { exitCode: r.exit_code }),
  }
}

export class SessionStore {
  constructor(private readonly db: Database.Database) {}

  insert(rec: SessionRecord): void {
    this.db.prepare(`
      INSERT INTO sessions (id, agent_id, workspace, session_dir, state, pid, exit_code, created_at)
      VALUES (@id, @agentId, @workspace, @sessionDir, @state, @pid, @exitCode, @createdAt)
    `).run({ ...rec, pid: rec.pid ?? null, exitCode: rec.exitCode ?? null })
  }

  get(id: string): SessionRecord | undefined {
    const row = this.db.prepare(`SELECT * FROM sessions WHERE id = ?`).get(id) as Row | undefined
    return row ? toRecord(row) : undefined
  }

  list(): SessionRecord[] {
    const rows = this.db.prepare(`SELECT * FROM sessions ORDER BY created_at`).all() as Row[]
    return rows.map(toRecord)
  }

  updateState(id: string, state: SessionState, extra: { pid?: number; exitCode?: number } = {}): void {
    this.db.prepare(`
      UPDATE sessions
         SET state = @state,
             pid = COALESCE(@pid, pid),
             exit_code = COALESCE(@exitCode, exit_code)
       WHERE id = @id
    `).run({ id, state, pid: extra.pid ?? null, exitCode: extra.exitCode ?? null })
  }

  /**
   * 启动时对账：上次进程留下的 starting/alive 记录不可能仍然存活，
   * 显式转为 exited，而不是静默沿用一个假的存活状态。
   * @returns 被修正的记录数
   */
  reconcileOnStartup(): number {
    const info = this.db.prepare(`
      UPDATE sessions SET state = 'exited' WHERE state IN ('starting','alive')
    `).run()
    return info.changes
  }
}
```

- [ ] **Step 5: 运行测试确认通过**

Run: `npx vitest run tests/store/sessions.test.ts`
Expected: PASS — 5 passed

- [ ] **Step 6: 提交**

```bash
git add dawn/src/store dawn/tests/store
git commit -m "feat(store): SQLite 会话表、迁移与启动对账"
```

---

## Task 1.4: AgentRuntime 接口与 FakeRuntime

**Files:**
- Create: `dawn/src/runtime/types.ts`
- Create: `dawn/src/runtime/fake.ts`
- Test: `dawn/tests/runtime/fake.test.ts`

- [ ] **Step 1: 写失败的测试**

```ts
// tests/runtime/fake.test.ts
import { describe, expect, it } from 'vitest'
import { FakeRuntime } from '../../src/runtime/fake.js'
import type { AgentEvent } from '../../src/runtime/types.js'

describe('FakeRuntime', () => {
  const spec = { sessionId: 's1', workspace: '/w', sessionDir: '/w/.dawn/s1' }

  it('start 后 handle 带 pid，且发出 started 事件', async () => {
    const rt = new FakeRuntime()
    const events: AgentEvent[] = []
    rt.attach('s1', (e) => events.push(e))
    const handle = await rt.start(spec)
    expect(handle.pid).toBeGreaterThan(0)
    expect(events.map((e) => e.kind)).toContain('started')
  })

  it('write 的内容以 output 事件回放', async () => {
    const rt = new FakeRuntime()
    await rt.start(spec)
    const events: AgentEvent[] = []
    rt.attach('s1', (e) => events.push(e))
    rt.write('s1', 'hello')
    expect(events).toContainEqual({ kind: 'output', sessionId: 's1', data: 'echo:hello' })
  })

  it('stop 后发出 exited 事件并带退出码', async () => {
    const rt = new FakeRuntime()
    await rt.start(spec)
    const events: AgentEvent[] = []
    rt.attach('s1', (e) => events.push(e))
    await rt.stop('s1')
    expect(events).toContainEqual({ kind: 'exited', sessionId: 's1', exitCode: 0 })
  })

  it('多个观察者都能收到同一事件', async () => {
    const rt = new FakeRuntime()
    await rt.start(spec)
    const a: AgentEvent[] = []; const b: AgentEvent[] = []
    rt.attach('s1', (e) => a.push(e))
    rt.attach('s1', (e) => b.push(e))
    rt.write('s1', 'x')
    expect(a).toHaveLength(1)
    expect(b).toHaveLength(1)
  })

  it('对未启动的会话 write 抛错', () => {
    const rt = new FakeRuntime()
    expect(() => rt.write('nope', 'x')).toThrow(/nope/)
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/runtime/fake.test.ts`
Expected: FAIL — 无法解析 `../../src/runtime/fake.js`

- [ ] **Step 3: 写接口类型**

```ts
// src/runtime/types.ts
export type SessionId = string

export interface McpServerSpec {
  name: string
  command: string
  args: string[]
  env: Record<string, string>
}

export interface SessionSpec {
  sessionId: SessionId
  workspace: string
  /** per-session 隔离配置目录，绝不使用用户全局配置 */
  sessionDir: string
  /** 仅 native runtime 使用 */
  endpoint?: { baseUrl: string; apiKey: string; model: string }
  /** 注入给该会话的 MCP server（阶段③ 才会非空） */
  mcpServers?: McpServerSpec[]
}

export interface SessionHandle {
  sessionId: SessionId
  pid: number
}

export type AgentEvent =
  | { kind: 'started'; sessionId: SessionId; pid: number }
  | { kind: 'output'; sessionId: SessionId; data: string }
  | { kind: 'exited'; sessionId: SessionId; exitCode: number }

export type EventSink = (event: AgentEvent) => void

/** 三种实现共用：native（pi）、pty（node-pty）、fake（测试） */
export interface AgentRuntime {
  start(spec: SessionSpec): Promise<SessionHandle>
  /** 注册观察者。可多个，互不影响 */
  attach(sessionId: SessionId, sink: EventSink): () => void
  write(sessionId: SessionId, data: string): void
  resize?(sessionId: SessionId, cols: number, rows: number): void
  stop(sessionId: SessionId): Promise<void>
}
```

- [ ] **Step 4: 写 FakeRuntime**

```ts
// src/runtime/fake.ts
import type {
  AgentEvent, AgentRuntime, EventSink, SessionHandle, SessionId, SessionSpec,
} from './types.js'

/** 测试替身：不起任何进程，write 原样 echo 回来 */
export class FakeRuntime implements AgentRuntime {
  private readonly sinks = new Map<SessionId, Set<EventSink>>()
  private readonly live = new Map<SessionId, number>()
  private nextPid = 1000

  private emit(event: AgentEvent): void {
    for (const sink of this.sinks.get(event.sessionId) ?? []) sink(event)
  }

  async start(spec: SessionSpec): Promise<SessionHandle> {
    const pid = this.nextPid++
    this.live.set(spec.sessionId, pid)
    this.emit({ kind: 'started', sessionId: spec.sessionId, pid })
    return { sessionId: spec.sessionId, pid }
  }

  attach(sessionId: SessionId, sink: EventSink): () => void {
    let set = this.sinks.get(sessionId)
    if (!set) { set = new Set(); this.sinks.set(sessionId, set) }
    set.add(sink)
    return () => { set!.delete(sink) }
  }

  write(sessionId: SessionId, data: string): void {
    if (!this.live.has(sessionId)) throw new Error(`会话 "${sessionId}" 未启动，无法写入`)
    this.emit({ kind: 'output', sessionId, data: `echo:${data}` })
  }

  async stop(sessionId: SessionId): Promise<void> {
    if (!this.live.has(sessionId)) return
    this.live.delete(sessionId)
    this.emit({ kind: 'exited', sessionId, exitCode: 0 })
  }
}
```

- [ ] **Step 5: 运行测试确认通过**

Run: `npx vitest run tests/runtime/fake.test.ts`
Expected: PASS — 5 passed

- [ ] **Step 6: 提交**

```bash
git add dawn/src/runtime dawn/tests/runtime
git commit -m "feat(runtime): AgentRuntime 接口与 FakeRuntime 测试替身"
```

---

## Task 1.5: 输入租约

**Files:**
- Create: `dawn/src/session/lease.ts`
- Test: `dawn/tests/session/lease.test.ts`

> 设计依据：spec 7.1。四个要点——TTL、观察者与控制者分离、夺权前可预览、每次转移留审计。**user 可抢占 engine，反向不可。**

- [ ] **Step 1: 写失败的测试**

```ts
// tests/session/lease.test.ts
import { describe, expect, it } from 'vitest'
import { LeaseManager } from '../../src/session/lease.js'

const T0 = new Date('2026-08-06T00:00:00Z')
const at = (secs: number) => new Date(T0.getTime() + secs * 1000)

describe('LeaseManager', () => {
  it('首次获取成功，持有者与过期时间正确', () => {
    const lm = new LeaseManager({ ttlSeconds: 60 })
    const lease = lm.acquire('s1', 'engine', T0)
    expect(lease.holder).toBe('engine')
    expect(lease.expiresAt).toBe(at(60).toISOString())
    expect(lease.fingerprint).toMatch(/^[0-9a-f]{16}$/)
  })

  it('engine 不能抢占 user 持有的租约', () => {
    const lm = new LeaseManager({ ttlSeconds: 60 })
    lm.acquire('s1', 'user', T0)
    expect(() => lm.acquire('s1', 'engine', at(1))).toThrow(/user/)
  })

  it('user 可以抢占 engine 持有的租约', () => {
    const lm = new LeaseManager({ ttlSeconds: 60 })
    lm.acquire('s1', 'engine', T0)
    const taken = lm.acquire('s1', 'user', at(1))
    expect(taken.holder).toBe('user')
  })

  it('过期后任何一方都可获取', () => {
    const lm = new LeaseManager({ ttlSeconds: 60 })
    lm.acquire('s1', 'user', T0)
    const lease = lm.acquire('s1', 'engine', at(61))
    expect(lease.holder).toBe('engine')
  })

  it('夺权前可预览：告知当前持有者与是否会发生抢占', () => {
    const lm = new LeaseManager({ ttlSeconds: 60 })
    lm.acquire('s1', 'engine', T0)
    const preview = lm.previewTakeover('s1', 'user', at(1))
    expect(preview).toEqual({
      sessionId: 's1', currentHolder: 'engine', requester: 'user',
      wouldPreempt: true, allowed: true,
    })
  })

  it('预览不改变状态', () => {
    const lm = new LeaseManager({ ttlSeconds: 60 })
    lm.acquire('s1', 'engine', T0)
    lm.previewTakeover('s1', 'user', at(1))
    expect(lm.current('s1')?.holder).toBe('engine')
  })

  it('每次转移都留审计事件', () => {
    const lm = new LeaseManager({ ttlSeconds: 60 })
    lm.acquire('s1', 'engine', T0)
    lm.acquire('s1', 'user', at(1))
    lm.release('s1', at(2))
    expect(lm.audit('s1').map((e) => e.action)).toEqual(['acquire', 'takeover', 'release'])
  })

  it('时间戳不可回退', () => {
    const lm = new LeaseManager({ ttlSeconds: 60 })
    lm.acquire('s1', 'engine', at(10))
    expect(() => lm.acquire('s1', 'user', at(5))).toThrow(/回退/)
  })

  it('观察者注册与控制权无关，多个观察者可共存', () => {
    const lm = new LeaseManager({ ttlSeconds: 60 })
    lm.observe('s1', 'client-a')
    lm.observe('s1', 'client-b')
    expect(lm.observers('s1').sort()).toEqual(['client-a', 'client-b'])
    expect(lm.current('s1')).toBeUndefined()
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/session/lease.test.ts`
Expected: FAIL — 无法解析 `../../src/session/lease.js`

- [ ] **Step 3: 写实现**

```ts
// src/session/lease.ts
import { createHash } from 'node:crypto'
import type { SessionId } from '../runtime/types.js'

export type Holder = 'engine' | 'user'

export interface ControllerLease {
  sessionId: SessionId
  holder: Holder
  expiresAt: string
  fingerprint: string
}

export interface TakeoverPreview {
  sessionId: SessionId
  currentHolder: Holder | null
  requester: Holder
  wouldPreempt: boolean
  allowed: boolean
}

export interface LeaseAuditEvent {
  sessionId: SessionId
  action: 'acquire' | 'takeover' | 'release' | 'expire'
  holder: Holder
  at: string
  fingerprint: string
}

function fingerprint(sessionId: string, holder: Holder, at: Date): string {
  return createHash('sha256')
    .update(`${sessionId}|${holder}|${at.toISOString()}`)
    .digest('hex')
    .slice(0, 16)
}

export class LeaseManager {
  private readonly leases = new Map<SessionId, ControllerLease>()
  private readonly observers_ = new Map<SessionId, Set<string>>()
  private readonly audits = new Map<SessionId, LeaseAuditEvent[]>()
  private readonly lastSeen = new Map<SessionId, number>()
  private readonly ttlSeconds: number

  constructor(opts: { ttlSeconds: number }) {
    this.ttlSeconds = opts.ttlSeconds
  }

  private isExpired(lease: ControllerLease, now: Date): boolean {
    return new Date(lease.expiresAt).getTime() <= now.getTime()
  }

  private assertMonotonic(sessionId: SessionId, now: Date): void {
    const last = this.lastSeen.get(sessionId)
    if (last !== undefined && now.getTime() < last) {
      throw new Error(`会话 "${sessionId}" 的时间戳回退：${now.toISOString()} 早于上次记录`)
    }
    this.lastSeen.set(sessionId, now.getTime())
  }

  private record(ev: LeaseAuditEvent): void {
    const list = this.audits.get(ev.sessionId) ?? []
    list.push(ev)
    this.audits.set(ev.sessionId, list)
  }

  /** 当前有效租约；已过期则视为不存在 */
  current(sessionId: SessionId, now: Date = new Date()): ControllerLease | undefined {
    const lease = this.leases.get(sessionId)
    if (!lease) return undefined
    return this.isExpired(lease, now) ? undefined : lease
  }

  previewTakeover(sessionId: SessionId, requester: Holder, now: Date = new Date()): TakeoverPreview {
    const active = this.current(sessionId, now)
    if (!active) {
      return { sessionId, currentHolder: null, requester, wouldPreempt: false, allowed: true }
    }
    // user 可抢占 engine；engine 不可抢占 user
    const allowed = requester === 'user' || active.holder === requester
    return {
      sessionId,
      currentHolder: active.holder,
      requester,
      wouldPreempt: active.holder !== requester,
      allowed,
    }
  }

  acquire(sessionId: SessionId, holder: Holder, now: Date = new Date()): ControllerLease {
    this.assertMonotonic(sessionId, now)
    const preview = this.previewTakeover(sessionId, holder, now)
    if (!preview.allowed) {
      throw new Error(
        `会话 "${sessionId}" 的写权由 ${preview.currentHolder} 持有，${holder} 不得抢占`,
      )
    }
    const lease: ControllerLease = {
      sessionId,
      holder,
      expiresAt: new Date(now.getTime() + this.ttlSeconds * 1000).toISOString(),
      fingerprint: fingerprint(sessionId, holder, now),
    }
    this.leases.set(sessionId, lease)
    this.record({
      sessionId,
      action: preview.wouldPreempt ? 'takeover' : 'acquire',
      holder,
      at: now.toISOString(),
      fingerprint: lease.fingerprint,
    })
    return lease
  }

  release(sessionId: SessionId, now: Date = new Date()): void {
    this.assertMonotonic(sessionId, now)
    const lease = this.leases.get(sessionId)
    if (!lease) return
    this.leases.delete(sessionId)
    this.record({
      sessionId, action: 'release', holder: lease.holder,
      at: now.toISOString(), fingerprint: lease.fingerprint,
    })
  }

  /** 观察者只读，与写权无关 */
  observe(sessionId: SessionId, clientId: string): () => void {
    let set = this.observers_.get(sessionId)
    if (!set) { set = new Set(); this.observers_.set(sessionId, set) }
    set.add(clientId)
    return () => { set!.delete(clientId) }
  }

  observers(sessionId: SessionId): string[] {
    return [...(this.observers_.get(sessionId) ?? [])]
  }

  audit(sessionId: SessionId): LeaseAuditEvent[] {
    return [...(this.audits.get(sessionId) ?? [])]
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run tests/session/lease.test.ts`
Expected: PASS — 9 passed

- [ ] **Step 5: 提交**

```bash
git add dawn/src/session/lease.ts dawn/tests/session/lease.test.ts
git commit -m "feat(session): 输入租约——TTL、观察者分离、夺权预览与审计"
```

---

## Task 1.6: 会话生命周期管理器

**Files:**
- Create: `dawn/src/session/manager.ts`
- Test: `dawn/tests/session/manager.test.ts`

> 核心约束：**状态先落库再改内存**。任何持久化失败都不得留下"内存说活着、库里没有"的裂缝。

- [ ] **Step 1: 写失败的测试**

```ts
// tests/session/manager.test.ts
import { describe, expect, it, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { migrate } from '../../src/store/schema.js'
import { SessionStore } from '../../src/store/sessions.js'
import { FakeRuntime } from '../../src/runtime/fake.js'
import { SessionManager } from '../../src/session/manager.js'
import type { ProviderRegistry } from '../../src/config/schema.js'
import type { AgentRuntime } from '../../src/runtime/types.js'

const registry: ProviderRegistry = {
  endpoints: {
    ds: { baseUrl: 'https://api.deepseek.com/v1', apiKey: 'k', models: ['deepseek-chat'] },
  },
  agents: {
    'ds-agent': { kind: 'native', endpoint: 'ds', model: 'deepseek-chat', capabilities: ['exec'] },
    'claude-code': { kind: 'pty', command: 'claude', args: [], capabilities: ['mcp', 'hooks'] },
  },
}

function makeManager() {
  const db = new Database(':memory:')
  migrate(db)
  const store = new SessionStore(db)
  const runtime = new FakeRuntime()
  const mgr = new SessionManager({
    store, registry, runtimes: { native: runtime, pty: runtime },
    workspaceRoot: '/tmp/dawn-test',
  })
  return { mgr, store, runtime }
}

describe('SessionManager', () => {
  let ctx: ReturnType<typeof makeManager>
  beforeEach(() => { ctx = makeManager() })

  it('创建会话：先落库，再启动运行时', async () => {
    const s = await ctx.mgr.create('ds-agent', '/tmp/w')
    expect(ctx.store.get(s.id)?.state).toBe('alive')
    expect(s.agentId).toBe('ds-agent')
  })

  it('未知 agentId 响亮报错，且不留下任何记录', async () => {
    await expect(ctx.mgr.create('nope', '/tmp/w')).rejects.toThrow(/nope/)
    expect(ctx.store.list()).toHaveLength(0)
  })

  it('运行时启动失败时，会话被标为 exited 而非留在 starting', async () => {
    // 注意：不能用 { ...fakeRuntimeInstance } 来改写 start——展开只复制自有属性，
    // 类方法在原型上，展开后 attach/write/stop 会全部丢失。写一个完整的桩。
    const failing: AgentRuntime = {
      start: async () => { throw new Error('boom') },
      attach: () => () => {},
      write: () => {},
      stop: async () => {},
    }
    const db = new Database(':memory:'); migrate(db)
    const store = new SessionStore(db)
    const mgr = new SessionManager({
      store, registry, runtimes: { native: failing, pty: failing }, workspaceRoot: '/tmp/x',
    })
    await expect(mgr.create('ds-agent', '/tmp/w')).rejects.toThrow(/boom/)
    const rec = store.list()[0]
    expect(rec?.state).toBe('exited')
  })

  it('停止会话后状态落库为 exited', async () => {
    const s = await ctx.mgr.create('ds-agent', '/tmp/w')
    await ctx.mgr.stop(s.id)
    expect(ctx.store.get(s.id)?.state).toBe('exited')
  })

  it('写入需要持有租约，无租约时抛错', async () => {
    const s = await ctx.mgr.create('ds-agent', '/tmp/w')
    expect(() => ctx.mgr.write(s.id, 'hi', 'engine')).toThrow(/租约/)
  })

  it('持有租约后可写入', async () => {
    const s = await ctx.mgr.create('ds-agent', '/tmp/w')
    ctx.mgr.leases.acquire(s.id, 'engine')
    const seen: string[] = []
    ctx.mgr.attach(s.id, (e) => { if (e.kind === 'output') seen.push(e.data) })
    ctx.mgr.write(s.id, 'hi', 'engine')
    expect(seen).toEqual(['echo:hi'])
  })

  it('用户抢占后，engine 无法再写入', async () => {
    const s = await ctx.mgr.create('ds-agent', '/tmp/w')
    ctx.mgr.leases.acquire(s.id, 'engine')
    ctx.mgr.leases.acquire(s.id, 'user')
    expect(() => ctx.mgr.write(s.id, 'x', 'engine')).toThrow(/租约/)
  })

  it('启动时对账：残留的 alive 记录被显式修正', () => {
    ctx.store.insert({
      id: 'stale', agentId: 'ds-agent', workspace: '/w', sessionDir: '/w/.dawn/stale',
      state: 'alive', createdAt: '2026-08-05T00:00:00Z',
    })
    const n = ctx.mgr.reconcileOnStartup()
    expect(n).toBe(1)
    expect(ctx.store.get('stale')?.state).toBe('exited')
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/session/manager.test.ts`
Expected: FAIL — 无法解析 `../../src/session/manager.js`

- [ ] **Step 3: 写实现**

```ts
// src/session/manager.ts
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import type { ProviderRegistry } from '../config/schema.js'
import type { SessionRecord, SessionStore } from '../store/sessions.js'
import type { AgentRuntime, EventSink, SessionId, SessionSpec } from '../runtime/types.js'
import { LeaseManager, type Holder } from './lease.js'

export interface SessionManagerOptions {
  store: SessionStore
  registry: ProviderRegistry
  runtimes: { native: AgentRuntime; pty: AgentRuntime }
  workspaceRoot: string
  leaseTtlSeconds?: number
}

export class SessionManager {
  readonly leases: LeaseManager
  private readonly store: SessionStore
  private readonly registry: ProviderRegistry
  private readonly runtimes: { native: AgentRuntime; pty: AgentRuntime }
  private readonly bound = new Map<SessionId, AgentRuntime>()

  constructor(opts: SessionManagerOptions) {
    this.store = opts.store
    this.registry = opts.registry
    this.runtimes = opts.runtimes
    this.leases = new LeaseManager({ ttlSeconds: opts.leaseTtlSeconds ?? 300 })
  }

  async create(agentId: string, workspace: string): Promise<SessionRecord> {
    const def = this.registry.agents[agentId]
    // 无静默回退：未知 agent 立即失败，且不留下半截记录
    if (!def) throw new Error(`未知的 agent "${agentId}"，请检查 providers.yaml 的 agents 段`)

    const id = randomUUID()
    const sessionDir = join(workspace, '.dawn', 'sessions', id)
    const rec: SessionRecord = {
      id, agentId, workspace, sessionDir,
      state: 'starting', createdAt: new Date().toISOString(),
    }
    // 先落库
    this.store.insert(rec)

    const spec: SessionSpec = { sessionId: id, workspace, sessionDir }
    if (def.kind === 'native') {
      const ep = this.registry.endpoints[def.endpoint]!
      spec.endpoint = { baseUrl: ep.baseUrl, apiKey: ep.apiKey, model: def.model }
    }

    const runtime = def.kind === 'native' ? this.runtimes.native : this.runtimes.pty
    try {
      const handle = await runtime.start(spec)
      this.bound.set(id, runtime)
      this.store.updateState(id, 'alive', { pid: handle.pid })
      runtime.attach(id, (e) => {
        if (e.kind === 'exited') this.store.updateState(id, 'exited', { exitCode: e.exitCode })
      })
      return { ...rec, state: 'alive', pid: handle.pid }
    } catch (err) {
      // 启动失败也要落库，绝不把会话留在 starting
      this.store.updateState(id, 'exited', { exitCode: -1 })
      throw err
    }
  }

  attach(sessionId: SessionId, sink: EventSink): () => void {
    const rt = this.bound.get(sessionId)
    if (!rt) throw new Error(`会话 "${sessionId}" 未在本进程中活动，无法附加观察者`)
    return rt.attach(sessionId, sink)
  }

  write(sessionId: SessionId, data: string, as: Holder): void {
    const lease = this.leases.current(sessionId)
    if (!lease || lease.holder !== as) {
      throw new Error(
        `写入被拒：${as} 未持有会话 "${sessionId}" 的租约（当前持有者：${lease?.holder ?? '无'}）`,
      )
    }
    const rt = this.bound.get(sessionId)
    if (!rt) throw new Error(`会话 "${sessionId}" 未在本进程中活动`)
    rt.write(sessionId, data)
  }

  async stop(sessionId: SessionId): Promise<void> {
    const rt = this.bound.get(sessionId)
    if (rt) await rt.stop(sessionId)
    this.store.updateState(sessionId, 'exited')
    this.bound.delete(sessionId)
    this.leases.release(sessionId)
  }

  list(): SessionRecord[] { return this.store.list() }

  /** 进程启动时调用：上次遗留的 starting/alive 显式转 exited */
  reconcileOnStartup(): number { return this.store.reconcileOnStartup() }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run tests/session/manager.test.ts`
Expected: PASS — 8 passed

- [ ] **Step 5: 提交**

```bash
git add dawn/src/session/manager.ts dawn/tests/session/manager.test.ts
git commit -m "feat(session): 生命周期管理——先落库再改内存、租约守卫写入"
```

---

## Task 1.7: per-session 隔离配置目录

**Files:**
- Create: `dawn/src/runtime/session-dir.ts`
- Test: `dawn/tests/runtime/session-dir.test.ts`

> **依赖 Spike B 的 FINDINGS.md**：claude / codex 各自的环境变量名与配置文件名以那份记录为准。下方使用 Spike B 骨架中的取值（`CLAUDE_CONFIG_DIR` + `settings.json`；`CODEX_HOME` + `config.toml`），若 FINDINGS 记录不同，以 FINDINGS 为准并同步修改测试。

- [ ] **Step 1: 写失败的测试**

```ts
// tests/runtime/session-dir.test.ts
import { describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { materializeSessionDir } from '../../src/runtime/session-dir.js'

const mcp = [{
  name: 'dawn-report',
  command: 'node', args: ['server.js'], env: { X: '1' },
}]

describe('materializeSessionDir', () => {
  it('claude：写 settings.json 并设置 CLAUDE_CONFIG_DIR', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dawn-sd-'))
    const out = materializeSessionDir('claude', dir, { mcpServers: mcp })
    expect(out.env.CLAUDE_CONFIG_DIR).toBe(dir)
    const cfg = JSON.parse(readFileSync(join(dir, 'settings.json'), 'utf8'))
    expect(cfg.mcpServers['dawn-report'].command).toBe('node')
  })

  it('codex：写 config.toml 并设置 CODEX_HOME', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dawn-sd-'))
    const out = materializeSessionDir('codex', dir, { mcpServers: mcp })
    expect(out.env.CODEX_HOME).toBe(dir)
    expect(existsSync(join(dir, 'config.toml'))).toBe(true)
  })

  it('注入 hook 脚本路径时写进配置', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dawn-sd-'))
    materializeSessionDir('claude', dir, { mcpServers: [], stopHookCommand: '/bin/true' })
    const cfg = JSON.parse(readFileSync(join(dir, 'settings.json'), 'utf8'))
    expect(JSON.stringify(cfg.hooks)).toContain('/bin/true')
  })

  it('未知 CLI 家族响亮报错，不静默生成空配置', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dawn-sd-'))
    expect(() => materializeSessionDir('unknown-cli', dir, { mcpServers: [] }))
      .toThrow(/unknown-cli/)
  })

  it('绝不写入用户家目录：产出的路径全部在给定 sessionDir 之下', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dawn-sd-'))
    const out = materializeSessionDir('claude', dir, { mcpServers: mcp })
    for (const p of out.writtenFiles) expect(p.startsWith(dir)).toBe(true)
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/runtime/session-dir.test.ts`
Expected: FAIL — 无法解析 `../../src/runtime/session-dir.js`

- [ ] **Step 3: 写实现**

```ts
// src/runtime/session-dir.ts
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { McpServerSpec } from './types.js'

export interface MaterializeOptions {
  mcpServers: McpServerSpec[]
  stopHookCommand?: string
}

export interface MaterializeResult {
  env: Record<string, string>
  writtenFiles: string[]
}

function toMcpMap(servers: McpServerSpec[]): Record<string, unknown> {
  return Object.fromEntries(
    servers.map((s) => [s.name, { command: s.command, args: s.args, env: s.env }]),
  )
}

function materializeClaude(dir: string, opts: MaterializeOptions): MaterializeResult {
  const settings: Record<string, unknown> = { mcpServers: toMcpMap(opts.mcpServers) }
  if (opts.stopHookCommand) {
    settings.hooks = {
      Stop: [{ hooks: [{ type: 'command', command: opts.stopHookCommand }] }],
    }
  }
  const file = join(dir, 'settings.json')
  writeFileSync(file, JSON.stringify(settings, null, 2))
  return { env: { CLAUDE_CONFIG_DIR: dir }, writtenFiles: [file] }
}

function materializeCodex(dir: string, opts: MaterializeOptions): MaterializeResult {
  const lines: string[] = []
  for (const s of opts.mcpServers) {
    lines.push(`[mcp_servers.${s.name}]`)
    lines.push(`command = ${JSON.stringify(s.command)}`)
    lines.push(`args = ${JSON.stringify(s.args)}`)
    lines.push('')
  }
  if (opts.stopHookCommand) {
    lines.push(`notify = ${JSON.stringify([opts.stopHookCommand])}`)
  }
  const file = join(dir, 'config.toml')
  writeFileSync(file, lines.join('\n'))
  return { env: { CODEX_HOME: dir }, writtenFiles: [file] }
}

const FAMILIES: Record<string, (dir: string, o: MaterializeOptions) => MaterializeResult> = {
  claude: materializeClaude,
  codex: materializeCodex,
}

/**
 * 为一个会话生成隔离的配置目录。
 * 绝不触碰用户全局配置（~/.claude、~/.codex）。
 */
export function materializeSessionDir(
  family: string,
  sessionDir: string,
  opts: MaterializeOptions,
): MaterializeResult {
  const fn = FAMILIES[family]
  // 无静默回退：不认识的 CLI 直接失败，而不是生成一个不起作用的空配置
  if (!fn) {
    throw new Error(
      `不支持的 CLI 家族 "${family}"。已支持：${Object.keys(FAMILIES).join(', ')}`,
    )
  }
  mkdirSync(sessionDir, { recursive: true })
  return fn(sessionDir, opts)
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run tests/runtime/session-dir.test.ts`
Expected: PASS — 5 passed

- [ ] **Step 5: 提交**

```bash
git add dawn/src/runtime/session-dir.ts dawn/tests/runtime/session-dir.test.ts
git commit -m "feat(runtime): per-session 隔离配置目录生成"
```

---

## Task 1.8: 终端流 ring buffer 与背压

**Files:**
- Create: `dawn/src/session/stream.ts`
- Test: `dawn/tests/session/stream.test.ts`

> Spike C 若判定"需节流"，本任务的 `flushIntervalMs` 取 FINDINGS 中记录的可接受阈值。

- [ ] **Step 1: 写失败的测试**

```ts
// tests/session/stream.test.ts
import { describe, expect, it, vi } from 'vitest'
import { TerminalStream } from '../../src/session/stream.js'

describe('TerminalStream', () => {
  it('保留最近 N 字节的 scrollback', () => {
    const s = new TerminalStream({ maxBytes: 10, flushIntervalMs: 0 })
    s.push('abcdefgh')
    s.push('ijklmn')
    expect(s.snapshot()).toBe('efghijklmn')
    expect(s.snapshot().length).toBe(10)
  })

  it('新观察者立即拿到 scrollback 快照', () => {
    const s = new TerminalStream({ maxBytes: 100, flushIntervalMs: 0 })
    s.push('history')
    const seen: string[] = []
    s.subscribe((chunk) => seen.push(chunk))
    expect(seen).toEqual(['history'])
  })

  it('多观察者都收到后续数据', () => {
    const s = new TerminalStream({ maxBytes: 100, flushIntervalMs: 0 })
    const a: string[] = []; const b: string[] = []
    s.subscribe((c) => a.push(c))
    s.subscribe((c) => b.push(c))
    s.push('x')
    expect(a).toEqual(['x'])
    expect(b).toEqual(['x'])
  })

  it('退订后不再收到数据', () => {
    const s = new TerminalStream({ maxBytes: 100, flushIntervalMs: 0 })
    const seen: string[] = []
    const off = s.subscribe((c) => seen.push(c))
    off()
    s.push('x')
    expect(seen).toEqual([])
  })

  it('开启节流时，间隔内的多次 push 合并为一次投递', () => {
    vi.useFakeTimers()
    const s = new TerminalStream({ maxBytes: 100, flushIntervalMs: 16 })
    const seen: string[] = []
    s.subscribe((c) => seen.push(c))
    s.push('a'); s.push('b'); s.push('c')
    expect(seen).toEqual([])          // 尚未到期，未投递
    vi.advanceTimersByTime(16)
    expect(seen).toEqual(['abc'])     // 合并为一次
    vi.useRealTimers()
  })

  it('节流下 scrollback 仍然即时更新', () => {
    vi.useFakeTimers()
    const s = new TerminalStream({ maxBytes: 100, flushIntervalMs: 16 })
    s.push('abc')
    expect(s.snapshot()).toBe('abc')
    vi.useRealTimers()
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/session/stream.test.ts`
Expected: FAIL — 无法解析 `../../src/session/stream.js`

- [ ] **Step 3: 写实现**

```ts
// src/session/stream.ts
export type ChunkSink = (chunk: string) => void

export interface TerminalStreamOptions {
  /** scrollback 上限，超出从头丢弃 */
  maxBytes: number
  /** 0 表示不节流，立即投递；>0 表示合并该毫秒数内的输出 */
  flushIntervalMs: number
}

export class TerminalStream {
  private buffer = ''
  private pending = ''
  private timer: NodeJS.Timeout | undefined
  private readonly sinks = new Set<ChunkSink>()

  constructor(private readonly opts: TerminalStreamOptions) {}

  /** 当前 scrollback 快照 */
  snapshot(): string { return this.buffer }

  push(chunk: string): void {
    // scrollback 立即更新，与投递节奏无关
    this.buffer = (this.buffer + chunk).slice(-this.opts.maxBytes)

    if (this.opts.flushIntervalMs <= 0) {
      this.deliver(chunk)
      return
    }
    this.pending += chunk
    if (this.timer) return
    this.timer = setTimeout(() => {
      const merged = this.pending
      this.pending = ''
      this.timer = undefined
      if (merged) this.deliver(merged)
    }, this.opts.flushIntervalMs)
  }

  private deliver(chunk: string): void {
    for (const sink of this.sinks) sink(chunk)
  }

  /** 订阅。立即收到一次 scrollback 快照（若非空），之后收增量 */
  subscribe(sink: ChunkSink): () => void {
    this.sinks.add(sink)
    if (this.buffer) sink(this.buffer)
    return () => { this.sinks.delete(sink) }
  }

  dispose(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = undefined
    this.sinks.clear()
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run tests/session/stream.test.ts`
Expected: PASS — 6 passed

- [ ] **Step 5: 提交**

```bash
git add dawn/src/session/stream.ts dawn/tests/session/stream.test.ts
git commit -m "feat(session): 终端流 ring buffer 与节流合并投递"
```

---

## Task 1.9: PTY Runtime（真实现）

**Files:**
- Create: `dawn/src/runtime/pty.ts`
- Test: `dawn/tests/integration/pty.test.ts`

- [ ] **Step 1: 写失败的集成测试**

```ts
// tests/integration/pty.test.ts
// 跨真实进程边界，不用 mock。用 bash 代替 agent CLI，保证 CI 可跑。
import { describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PtyRuntime } from '../../src/runtime/pty.js'
import type { AgentEvent } from '../../src/runtime/types.js'

/** 信号 0 只做存在性探测，不实际发送 */
function isAlive(pid: number): boolean {
  try { process.kill(pid, 0); return true } catch { return false }
}

function waitFor(events: AgentEvent[], pred: (e: AgentEvent) => boolean, ms = 8000) {
  return new Promise<void>((resolve, reject) => {
    const t0 = Date.now()
    const tick = setInterval(() => {
      if (events.some(pred)) { clearInterval(tick); resolve() }
      else if (Date.now() - t0 > ms) { clearInterval(tick); reject(new Error('等待超时')) }
    }, 50)
  })
}

describe('PtyRuntime（集成）', () => {
  it('启动进程、回显输入、退出时报告退出码', async () => {
    const rt = new PtyRuntime({ command: 'bash', args: ['--norc', '--noprofile'] })
    const dir = mkdtempSync(join(tmpdir(), 'dawn-pty-'))
    const events: AgentEvent[] = []
    rt.attach('t1', (e) => events.push(e))

    const handle = await rt.start({ sessionId: 't1', workspace: dir, sessionDir: dir })
    expect(handle.pid).toBeGreaterThan(0)

    rt.write('t1', 'echo DAWN_MARKER_OK\n')
    await waitFor(events, (e) => e.kind === 'output' && e.data.includes('DAWN_MARKER_OK'))

    rt.write('t1', 'exit 7\n')
    await waitFor(events, (e) => e.kind === 'exited')
    const exited = events.find((e) => e.kind === 'exited')
    expect(exited).toMatchObject({ kind: 'exited', sessionId: 't1', exitCode: 7 })
  })

  it('stop 能终止一个不会自己退出的进程', async () => {
    const rt = new PtyRuntime({ command: 'bash', args: ['--norc', '--noprofile'] })
    const dir = mkdtempSync(join(tmpdir(), 'dawn-pty-'))
    const events: AgentEvent[] = []
    rt.attach('t2', (e) => events.push(e))
    await rt.start({ sessionId: 't2', workspace: dir, sessionDir: dir })
    rt.write('t2', 'sleep 300\n')
    await rt.stop('t2')
    await waitFor(events, (e) => e.kind === 'exited')
    expect(events.some((e) => e.kind === 'exited')).toBe(true)
  })

  it('stop 连孙子进程一起杀，不留孤儿', async () => {
    // 关键回归：agent 会起 npm test / python train.py 这类长任务。
    // 只 kill pty 进程会把它们留成孤儿继续吃 CPU/GPU。
    const rt = new PtyRuntime({ command: 'bash', args: ['--norc', '--noprofile'] })
    const dir = mkdtempSync(join(tmpdir(), 'dawn-pty-'))
    const marker = join(dir, 'grandchild.pid')
    const events: AgentEvent[] = []
    rt.attach('t3', (e) => events.push(e))
    await rt.start({ sessionId: 't3', workspace: dir, sessionDir: dir })

    // 在 shell 里后台起一个孙子进程，把它的 pid 写到文件
    rt.write('t3', `sleep 600 & echo $! > ${marker}\n`)
    await waitFor(events, (e) => e.kind === 'output', 5000)
    await new Promise((r) => setTimeout(r, 1500))

    const grandchildPid = Number.parseInt(readFileSync(marker, 'utf8').trim(), 10)
    expect(Number.isInteger(grandchildPid)).toBe(true)
    expect(isAlive(grandchildPid)).toBe(true)

    await rt.stop('t3')
    await new Promise((r) => setTimeout(r, 800))

    expect(isAlive(grandchildPid)).toBe(false)
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/integration/pty.test.ts`
Expected: FAIL — 无法解析 `../../src/runtime/pty.js`

- [ ] **Step 3: 写实现**

```ts
// src/runtime/pty.ts
import * as pty from 'node-pty'
import type {
  AgentEvent, AgentRuntime, EventSink, SessionHandle, SessionId, SessionSpec,
} from './types.js'
import { materializeSessionDir } from './session-dir.js'

export interface PtyRuntimeOptions {
  command: string
  args?: string[]
  /** CLI 家族名，用于生成隔离配置。留空则不写配置（如测试用 bash） */
  family?: string
  stopHookCommand?: string
}

export class PtyRuntime implements AgentRuntime {
  private readonly procs = new Map<SessionId, pty.IPty>()
  private readonly sinks = new Map<SessionId, Set<EventSink>>()

  constructor(private readonly opts: PtyRuntimeOptions) {}

  private emit(event: AgentEvent): void {
    for (const sink of this.sinks.get(event.sessionId) ?? []) sink(event)
  }

  async start(spec: SessionSpec): Promise<SessionHandle> {
    let extraEnv: Record<string, string> = {}
    if (this.opts.family) {
      const materialized = materializeSessionDir(this.opts.family, spec.sessionDir, {
        mcpServers: spec.mcpServers ?? [],
        ...(this.opts.stopHookCommand ? { stopHookCommand: this.opts.stopHookCommand } : {}),
      })
      extraEnv = materialized.env
    }

    const proc = pty.spawn(this.opts.command, this.opts.args ?? [], {
      name: 'xterm-256color',
      cols: 100,
      rows: 30,
      cwd: spec.workspace,
      env: { ...process.env, ...extraEnv } as Record<string, string>,
    })

    this.procs.set(spec.sessionId, proc)
    proc.onData((data) => this.emit({ kind: 'output', sessionId: spec.sessionId, data }))
    proc.onExit(({ exitCode }) => {
      this.procs.delete(spec.sessionId)
      this.emit({ kind: 'exited', sessionId: spec.sessionId, exitCode })
    })

    this.emit({ kind: 'started', sessionId: spec.sessionId, pid: proc.pid })
    return { sessionId: spec.sessionId, pid: proc.pid }
  }

  attach(sessionId: SessionId, sink: EventSink): () => void {
    let set = this.sinks.get(sessionId)
    if (!set) { set = new Set(); this.sinks.set(sessionId, set) }
    set.add(sink)
    return () => { set!.delete(sink) }
  }

  write(sessionId: SessionId, data: string): void {
    const proc = this.procs.get(sessionId)
    if (!proc) throw new Error(`会话 "${sessionId}" 无活动 PTY 进程`)
    proc.write(data)
  }

  resize(sessionId: SessionId, cols: number, rows: number): void {
    this.procs.get(sessionId)?.resize(cols, rows)
  }

  /**
   * 终止会话。**杀整个进程组，不是只杀 pty 进程。**
   *
   * node-pty 通过 setsid 让子进程成为新会话与进程组的组长，因此 pid 即 pgid，
   * `process.kill(-pid, sig)` 覆盖它派生的全部后代。
   *
   * 若只调 proc.kill()，agent 起的 `npm test` / `python train.py` 会变成孤儿
   * 继续占用 CPU 与 GPU——对长时训练任务尤其致命。
   *
   * 序列：SIGTERM → 宽限期 → SIGKILL。
   */
  async stop(sessionId: SessionId, opts: { graceMs?: number } = {}): Promise<void> {
    const proc = this.procs.get(sessionId)
    if (!proc) return
    const graceMs = opts.graceMs ?? 200

    const killGroup = (signal: NodeJS.Signals): void => {
      try {
        process.kill(-proc.pid, signal)
      } catch {
        // 进程组已消失即视为成功；不静默吞掉其它情况以外的信息，
        // 因为唯一可能的失败就是 ESRCH（组不存在）。
      }
    }

    killGroup('SIGTERM')
    await new Promise((resolve) => setTimeout(resolve, graceMs))
    killGroup('SIGKILL')
  }
}
```

> **Windows 说明**：`process.kill(-pid)` 是 POSIX 语义，Windows 上不适用。本阶段以 macOS / Linux 为目标；Windows 支持需改用 job object 或 `taskkill /T /F`，届时在此处分支实现。

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run tests/integration/pty.test.ts`
Expected: PASS — 3 passed（含孙子进程回归）

- [ ] **Step 5: 提交**

```bash
git add dawn/src/runtime/pty.ts dawn/tests/integration/pty.test.ts
git commit -m "feat(runtime): PTY 运行时与隔离配置注入"
```

---

## Task 1.10: Native Runtime（pi 适配器）

**Files:**
- Create: `dawn/src/runtime/native.ts`
- Test: 手工冒烟（见 Step 4）

> **本任务的实现体依赖 `spikes/FINDINGS.md` 的 Spike A 一节。** 接口已在 Task 1.4 完全定义，pi 的具体调用按 FINDINGS 记录的真实签名填写。若 Spike A 判定"schema 未被强制"，本任务必须额外实现一层 zod 校验与重试（见 Step 3 的注释位）。

- [ ] **Step 1: 重读 Spike A 结论**

Run: `sed -n '/## Spike A/,/## Spike B/p' dawn/spikes/FINDINGS.md`
把其中记录的导入符号、会话创建签名、工具注册方式抄到手边。

- [ ] **Step 2: 写实现骨架**

```ts
// src/runtime/native.ts
import type {
  AgentEvent, AgentRuntime, EventSink, SessionHandle, SessionId, SessionSpec,
} from './types.js'

/**
 * Native 运行时：用 pi-agent-core 的 agent loop + pi-ai 的 provider 层，
 * 让任意 OpenAI 兼容端点（DeepSeek 等）获得完整的工具使用能力。
 *
 * 具体 pi 调用按 spikes/FINDINGS.md 的 Spike A 记录填写。
 */
export class NativeRuntime implements AgentRuntime {
  private readonly sessions = new Map<SessionId, { dispose: () => void }>()
  private readonly sinks = new Map<SessionId, Set<EventSink>>()
  private nextPid = 1

  private emit(event: AgentEvent): void {
    for (const sink of this.sinks.get(event.sessionId) ?? []) sink(event)
  }

  async start(spec: SessionSpec): Promise<SessionHandle> {
    if (!spec.endpoint) {
      throw new Error(`native 运行时需要 endpoint，会话 "${spec.sessionId}" 未提供`)
    }

    // ── 按 FINDINGS.md Spike A 填写 ──
    // const session = await createAgentSession({
    //   provider: ...(spec.endpoint.baseUrl, spec.endpoint.apiKey),
    //   model: spec.endpoint.model,
    //   cwd: spec.workspace,
    //   tools: [...],
    // })
    // 把 session 的事件流转成 AgentEvent：
    //   文本增量 → { kind: 'output', ... }
    //   会话结束 → { kind: 'exited', ... }
    //
    // 若 Spike A 判定 schema 未被强制，在此处包一层：
    //   工具 handler 内先用 zod safeParse，失败则把错误回传模型要求重填。

    const pid = this.nextPid++
    this.sessions.set(spec.sessionId, { dispose: () => {} })
    this.emit({ kind: 'started', sessionId: spec.sessionId, pid })
    return { sessionId: spec.sessionId, pid }
  }

  attach(sessionId: SessionId, sink: EventSink): () => void {
    let set = this.sinks.get(sessionId)
    if (!set) { set = new Set(); this.sinks.set(sessionId, set) }
    set.add(sink)
    return () => { set!.delete(sink) }
  }

  write(sessionId: SessionId, data: string): void {
    const s = this.sessions.get(sessionId)
    if (!s) throw new Error(`会话 "${sessionId}" 未启动`)
    // ── 按 FINDINGS.md 填写：把 data 作为一轮 prompt 送入 session ──
    void data
  }

  async stop(sessionId: SessionId): Promise<void> {
    const s = this.sessions.get(sessionId)
    if (!s) return
    s.dispose()
    this.sessions.delete(sessionId)
    this.emit({ kind: 'exited', sessionId, exitCode: 0 })
  }
}
```

- [ ] **Step 3: 按 FINDINGS 填实**

用 Step 1 抄下的真实签名替换所有 `── 按 FINDINGS.md 填写 ──` 标注处。**填完后此文件不得再有该标注。**

- [ ] **Step 4: 手工冒烟验证**

```bash
cd dawn
DEEPSEEK_API_KEY=<key> npx tsx -e "
import { NativeRuntime } from './src/runtime/native.js'
const rt = new NativeRuntime()
rt.attach('n1', (e) => console.log(JSON.stringify(e)))
await rt.start({ sessionId:'n1', workspace: process.cwd(), sessionDir:'/tmp/n1',
  endpoint:{ baseUrl:'https://api.deepseek.com/v1', apiKey: process.env.DEEPSEEK_API_KEY, model:'deepseek-chat' } })
rt.write('n1', '用一句话说明你是谁')
await new Promise(r => setTimeout(r, 15000))
await rt.stop('n1')
"
```

Expected: 依次看到 `started` 事件、若干 `output` 事件（含模型回答文本）、`exited` 事件。

- [ ] **Step 5: 提交**

```bash
git add dawn/src/runtime/native.ts
git commit -m "feat(runtime): Native 运行时——pi agent loop 适配器"
```

---

## Task 1.11: CLI 冒烟入口与阶段验收

**Files:**
- Create: `dawn/src/cli.ts`
- Create: `dawn/providers.example.yaml`
- Modify: `dawn/package.json`

- [ ] **Step 1: 写示例配置**

```yaml
# providers.example.yaml
endpoints:
  deepseek:
    baseUrl: https://api.deepseek.com/v1
    apiKey: ${DEEPSEEK_API_KEY}
    models: [deepseek-chat, deepseek-reasoner]

agents:
  ds-chat:
    kind: native
    endpoint: deepseek
    model: deepseek-chat
    capabilities: [exec, chat]

  ds-reasoner:
    kind: native
    endpoint: deepseek
    model: deepseek-reasoner
    capabilities: [exec, chat]

  claude-code:
    kind: pty
    command: claude
    args: []
    capabilities: [fs_write, exec, mcp, hooks]

  codex:
    kind: pty
    command: codex
    args: []
    capabilities: [fs_write, exec, mcp, hooks]
```

- [ ] **Step 2: 写 CLI**

```ts
// src/cli.ts
import Database from 'better-sqlite3'
import { migrate } from './store/schema.js'
import { SessionStore } from './store/sessions.js'
import { loadRegistry } from './config/loader.js'
import { SessionManager } from './session/manager.js'
import { NativeRuntime } from './runtime/native.js'
import { PtyRuntime } from './runtime/pty.js'

const [, , cmd, ...rest] = process.argv

function makeManager(configPath: string, dbPath: string) {
  const registry = loadRegistry(configPath)
  const db = new Database(dbPath)
  migrate(db)
  const store = new SessionStore(db)
  const mgr = new SessionManager({
    store, registry,
    runtimes: {
      native: new NativeRuntime(),
      // family 决定隔离配置怎么写；命令名由 registry 决定，此处按 claude 家族起
      pty: new PtyRuntime({ command: 'claude', family: 'claude' }),
    },
    workspaceRoot: process.cwd(),
  })
  const fixed = mgr.reconcileOnStartup()
  if (fixed > 0) console.error(`[启动对账] 修正了 ${fixed} 条残留会话记录`)
  return mgr
}

const CONFIG = process.env.DAWN_CONFIG ?? 'providers.example.yaml'
const DB = process.env.DAWN_DB ?? '.dawn.db'

if (cmd === 'agents') {
  const registry = loadRegistry(CONFIG)
  for (const [id, def] of Object.entries(registry.agents)) {
    const detail = def.kind === 'native' ? `${def.endpoint}/${def.model}` : def.command
    console.log(`${id.padEnd(16)} ${def.kind.padEnd(7)} ${detail}`)
  }
} else if (cmd === 'run') {
  const agentId = rest[0]
  if (!agentId) { console.error('用法: dawn run <agentId>'); process.exit(2) }
  const mgr = makeManager(CONFIG, DB)
  const session = await mgr.create(agentId, process.cwd())
  console.error(`[会话 ${session.id}] agent=${agentId} pid=${session.pid}`)
  mgr.leases.acquire(session.id, 'user')
  mgr.attach(session.id, (e) => {
    if (e.kind === 'output') process.stdout.write(e.data)
    if (e.kind === 'exited') { console.error(`\n[退出 ${e.exitCode}]`); process.exit(e.exitCode) }
  })
  process.stdin.setRawMode?.(true)
  process.stdin.on('data', (buf) => mgr.write(session.id, buf.toString(), 'user'))
} else if (cmd === 'sessions') {
  const mgr = makeManager(CONFIG, DB)
  for (const s of mgr.list()) {
    console.log(`${s.id}  ${s.state.padEnd(8)}  ${s.agentId}  ${s.createdAt}`)
  }
} else {
  console.error('用法: dawn <agents|run <agentId>|sessions>')
  process.exit(2)
}
```

- [ ] **Step 3: 注册 bin**

在 `dawn/package.json` 的 `scripts` 中追加：

```json
"dawn": "tsx src/cli.ts"
```

- [ ] **Step 4: 跑全量测试**

Run: `cd dawn && npm test && npm run typecheck`
Expected: 全部 PASS（config 7 + store 5 + runtime fake 5 + session-dir 5 + lease 9 + manager 8 + stream 6 + pty 3 = 48 passed），typecheck 零错误。

- [ ] **Step 5: 阶段①-A 验收**

```bash
cd dawn
cp providers.example.yaml providers.yaml
export DEEPSEEK_API_KEY=<key>

# 1) 能列出所有 agent，两种 kind 都在
DAWN_CONFIG=providers.yaml npx tsx src/cli.ts agents

# 2) Native：DeepSeek 能对话
DAWN_CONFIG=providers.yaml npx tsx src/cli.ts run ds-chat

# 3) PTY：claude 能真接管键盘
DAWN_CONFIG=providers.yaml npx tsx src/cli.ts run claude-code

# 4) 会话记录落库
DAWN_CONFIG=providers.yaml npx tsx src/cli.ts sessions

# 5) 隔离验证：全局配置未被改动
md5 ~/.claude/settings.json
```

**验收判据**（全部必须满足）：
- [ ] `agents` 列出 native 与 pty 两类
- [ ] `run ds-chat` 能正常问答
- [ ] `run claude-code` 起真终端且键盘可用（能敲、能 Ctrl-C）
- [ ] `sessions` 显示历史记录，重启进程后残留状态被修正为 `exited`
- [ ] `~/.claude/settings.json` 的 md5 前后一致

- [ ] **Step 6: 记录开发历史**

在 `docs/DEVELOPMENT_HISTORY.md` 顶部追加一条 `Type: feat` 条目，写明：完成阶段①-A 会话核心；模块清单；测试数量；验收结果；已知缺口（无 UI、无编排）。

- [ ] **Step 7: 提交**

```bash
git add dawn/src/cli.ts dawn/providers.example.yaml dawn/package.json docs/DEVELOPMENT_HISTORY.md
git commit -m "feat(cli): 冒烟入口，完成阶段①-A 会话核心"
```

---

## 自检记录

**规格覆盖**（对照 spec 第 9.2 节 Session Host 功能表）：

| spec 要求 | 对应任务 |
|---|---|
| Provider Registry 两段式 YAML + zod 校验 | Task 1.1 / 1.2 |
| Native Runtime（pi 封装、工具注入、强制 schema） | Task 1.10（依赖 Spike A） |
| External PTY Runtime + per-session 隔离配置 | Task 1.7 / 1.9 |
| 会话生命周期、先落库再改内存 | Task 1.3 / 1.6 |
| 输入租约（ControllerLease / 观察者 / 夺权预览 / 审计） | Task 1.5 |
| 终端流 ring buffer + 背压节流 | Task 1.8 |
| ACP Runtime | **不在本计划**——spec 定为阶段③ 后期 |
| 多会话 UI / Electron 打包 | **不在本计划**——阶段①-B |

**类型一致性核对**：`SessionId` / `SessionState` / `SessionRecord` / `AgentRuntime` / `EventSink` / `McpServerSpec` / `Holder` / `ProviderRegistry` 在定义处与所有引用处签名一致，已逐个比对。`AgentRuntime.resize` 为可选方法，故 `FakeRuntime` 不实现它合法。

**测试数量**：config 7 + store 5 + runtime-fake 5 + session-dir 5 + lease 9 + manager 8 + stream 6 + pty 3 = **48**。

**已知悬空件**：`TerminalStream`（Task 1.8）在本计划内建成并单测，但不接入 `SessionManager`——它的消费方是阶段①-B 的终端墙 UI。这是有意为之，不是遗漏。

**未决项**：Task 1.10 的 pi 调用体依赖 Spike A 产出的 `FINDINGS.md`。这是显式的任务间依赖，不是占位符——Task 1.10 Step 1 强制先读该文件，Step 3 要求填完后不得残留标注。

---

## 后续计划

- `2026-08-XX-stage1b-electron-shell.md` —— Electron 外壳、React UI、终端墙
- `2026-08-XX-stage2a-jupyter-kernels.md` —— Jupyter 协议客户端、Ark、ipykernel、中断
- `2026-08-XX-stage2b-exec-environments.md` —— 执行环境与 Run 管理
- `2026-08-XX-stage3-orchestration.md` —— 编排内核
