# ACP 客户端的手 · T3（界面与准入）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 远端会话只能用「手能到服务器」的 agent：native 与标了 `remoteCapable` 的 acp。其余（codex-acp、cli、kernel）在远端建会话时不列、后端也不收——不再静默跑在本机。

**Architecture:** 判据住在一处：`src/config/schema.ts` 的 `能上服务器(def)`。后端 `createTask({connectionId})` 用它拒绝；`getProviders` 把 acp 的 `remoteCapable` 交给界面；界面用同一条规则算 `远端能用的agentIds`，远端新建取其第一个（「一个动作只有一个家」——不加新菜单），远端会话里 composer pill 的「新建会话，用哪个 LLM」也只列它。预置的 claude-code-acp 写 `remoteCapable: true`，codex 不写（缺省假）。

**现状（为什么必须做）：** `startRemoteSession` 取 `agentIds[0]`——配置里第一个是 codex-acp 的话，远端会话静默变成本机 codex。

**规格：** `docs/superpowers/specs/2026-08-20-acp-terminal-design.md` §二「出声」+ §三 T3

---

### Task 1: `remoteCapable` 进 schema、写入、协议、后端

**Files:** `src/config/schema.ts`、`src/config/writer.ts`、`src/protocol/operations.ts`、`src/workbench/backend.ts`
**Tests:** `tests/config/writer.test.ts`（已有文件则追加）、`tests/workbench/*createTask*`（已有则追加，否则 `tests/workbench/remote-agent-gate.test.ts`）

- [x] schema：`AcpAgentSchema` 加 `remoteCapable: z.boolean().default(false)`；导出 `能上服务器(def: AgentDef): boolean`（native → true；acp → `def.remoteCapable`；其余 false）。注释写清 kernel / cli 为什么是 false（运行时不认 `spec.remote`，`grep -c remote` 为 0）。
- [x] writer：`NewAcpAgent.remoteCapable?: boolean`；为真时多写一行 `    remoteCapable: true`。测试：写一个真的、读回来 `remoteCapable === true`；不写的读回来 `false`。
- [x] operations：`addAcpAgent.request` 加 `remoteCapable: z.boolean().optional()`；`getProviders.response.agents[]` 加 `remoteCapable: z.boolean().optional()`。
- [x] backend：`addAcpAgent` 透传；`getProviders` 对 acp 给 `remoteCapable`；`createTask` 里 `if (connectionId && !能上服务器(def)) throw fault("invalid_request", \`「${agentId}」的手到不了服务器（它自己读写文件、跑命令，都在本机）——远端会话请用 API 模型或标了「能上服务器」的 ACP 适配器\`)`。测试：假后端（现有 backend 测试的搭法）用 codex 类 acp + connectionId 建任务 → 抛这句话；native → 建得成。
- [x] `npm run typecheck && npx vitest run tests/config tests/workbench`；提交 `feat(remote): ACP agent 的 remoteCapable；远端建任务拒绝手到不了服务器的 agent`

### Task 2: 界面

**Files:** `src/ui/App.tsx`、`src/ui/Settings.tsx`、`src/ui/i18n/en.ts`
**Tests:** `tests/ui/`（纯函数）、`e2e/remote-connections.spec.ts`（追加一条）

- [x] `App.tsx`：`远端能用的agentIds = agentIds.filter(id => 能上服务器(providers.agents.find(...)))`——**复用 schema 里那个函数**（界面收到的 agent 摘要有 `kind` 与 `remoteCapable`，形状够用；若类型不合就写一个薄适配 `能上服务器({kind, remoteCapable})`）。`startRemoteSession` 改用它的第一个；一个都没有时 `setConnProblem(t("没有能在服务器上干活的 agent——API 模型可以，标了「能上服务器」的 ACP 适配器也可以"))`。
- [x] composer pill：当前会话 `session.remote` 存在时，`新建会话可选的(...)` 的第一个参数换成 `远端能用的agentIds`。
- [x] `Settings.tsx` 预置两条：claude 条目 `remoteCapable: true`，`说` 后加「· 手能到服务器（读写、命令落在远端）」；codex 条目加「· 只在本机运行」。`addAcpAgent` 调用带上 `remoteCapable`。自定义条目不加选项，帮助文字一句：「自定义适配器默认只在本机运行」。
- [x] i18n：新增文案补英文。
- [x] e2e：`remote-connections.spec.ts` 追加——providers 里**第一个**是 codex 类 acp（假 agent）、第二个 native：点服务器的「新建会话」，建出来的会话 `agentId` 是 native 那个；`createTask({agentId: codex类, connectionId})` 直接 invoke 回错，错误文案含「到不了服务器」。
- [x] 设计契约扫描（`tests/ui/design-contract.test.ts`）：新增文案不与现有按钮文案互为子串（跑一次就知道）。
- [x] `npm test`、`npm run build && npx playwright test e2e/remote-connections.spec.ts e2e/acp-setup.spec.ts`；提交 `feat(ui): 远端建会话只用手能到服务器的 agent；预置 claude-code-acp 标 remoteCapable`

### Task 3: 历史

- [x] 回填 T2 那条 hash；顶部追加 T3 条目。
