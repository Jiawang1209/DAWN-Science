# DeepSeek Harness (dsh) Web GUI：它为什么显得快

源码根：`/Users/liuyue/Desktop/Github_repos/code_learn_from_github/deepseek-harness-master`（下文路径都相对它）。只读，未改动。

一句话结论：**dsh 没有靠什么魔法组件，它在「数据发布」这一层卡住了频率**。token 每来一个都照常落进模型、照常折叠进 State，但**往 React 发快照的频率被限到大约每三帧一次**；再加上 **按 key 订阅的节点源**（一个 chunk 只唤醒正在流的那一个节点）和 **增量 Markdown 解析**（已经写完的块冻结成缓存的 React 元素），每一帧的工作量只跟「尾巴」有关，跟整段对话长度无关。长对话**没有做虚拟列表**，靠的是后端按回合分页的历史窗口 + 已完成回合的过程默认折叠（`hidden="until-found"`）。另外它有一条**进 CI 的浏览器性能预算**，数字可以挡住回退。

---

## 1. 传输：事件怎么到浏览器

- **一条物理 WebSocket，多路复用多个逻辑流**。`packages/api/gateway/src/stream-protocol.ts:7` `REMOTE_STREAM_MUX_PATH = '/api/remote.mux'`；客户端 `packages/api/gateway/src/client/stream-client.ts:47-52`：
  ```ts
  /** Keep one physical WebSocket and share it among independently cancellable Remote streams. */
  export class RemoteStreamMuxClient { private socket: WebSocket | undefined ...
  ```
  帧格式是 JSON 文本（`stream-client.ts:309` 要求 text message，`:362` `socket.send(JSON.stringify(message))`），消息类型 `open / item / end / cancel`（`:119,185,187,140`）。没有 SSE，也没有 msgpack 之类的二进制编码。
- **服务端上行队列有界**：`stream-server.ts:304-310` 是「Bounded single-consumer uplink queue」，按字节计数，溢出就让这个流失败（`:342`），不会无限积压。
- **快照 + 增量**（`docs/subsystems/web-client.md:48`）：`follow()` 的**第一帧**里就带着当前 header、尾页、游标和完整的 projection 基线；之后标准事件按 `seq` 追加。每次重连（新 generation）都**用首帧原子替换**整个窗口；`page()` 只用来补更早的历史和修缺口。控制流、Workspace 流也一样：「complete baseline 然后 increments」（`web-client.md:52,71`）。
- **重连分两层**（`web-client.md:77-87`）：物理层由 Gateway mux 恢复 WS；每个 `RemoteStream` 在 Connection 发布了可用 generation 之后，**各自**重开自己的逻辑源。断线期间保留最后一次发布的值，所以界面不会闪成空白。
  - 退避参数：`packages/client/connection/src/recovery-config.ts:24-30`：base 500ms、factor 2、max 10s、慢握手 3s 告警、15s 硬超时；实际延迟取上限的 50–100%（jitter）。
  - `connection/src/client/connection.ts:124-136`：离线时暂停自动重试，网络恢复立刻重置退避。
- **活的 token 不落盘**：流式增量是 Client-only 的 `assistant/live-chunk` 瞬态事件；落盘的 `assistant/message` 里嵌一份 compact stream，历史回放能复现同样的结果（`docs/subsystems/conversation.md:11,72`）。重连时服务端把「进行中的 compact 前缀」展开成同样的瞬态事件，所以断线重连和翻历史走的是同一套折叠代码。

## 2. 流式文本：chunk 怎么合并、Markdown 怎么增量渲染

### 2.1 三级节流，真正起作用的在 Conversation 层

(a) **对象层 `Notifier`**（`packages/api/session-controller/src/client/sessions/notifier.ts`）提供三档发布：
```ts
markDirty()      // :31  结构性更新，microtask 合批
markFrameDirty() // :39  流式可见增量，每帧最多发一次累计态（rAF）
notifyNow()      // :50  只给用户手势的直接回显（受控输入同 tick 必须通知，否则光标跳到末尾）
```
`ensureFresh()`（:61）让没人订阅时读快照也能同步重建，但**不消耗**待发通知；`flush()`（:87-96）在没有订阅者时直接跳过（懒重建）。规则写进了 `packages/client/AGENTS.md`（「Notifier publication discipline」一条）。

(b) **但现在实际给 token 限流的是 `ui-conversation` 的装配层**：Definition 为每个匹配声明 `publication: 'none' | 'animation-frame' | 'immediate'`（`ui-conversation/src/client/contract/conversation.ts:190`）。assistant 的 `text-delta / reasoning-delta / tool-call-delta` 返回 `'animation-frame'`，`usage / finish` 返回 `'none'`（`ui-chat/src/client/conversation-nodes/assistant.ts:321`、`turn-process.ts:243`、`tool.ts:279`、`ui-trajectory/.../trajectory-assistant-definition.ts:395`）。

`ui-conversation/src/client/conversation/assembly.ts:140-156`：
```ts
if (publication === 'animation-frame' && typeof requestAnimationFrame === 'function') {
  if (this.frame !== undefined) return
  // Cross three paint opportunities before publishing high-frequency stream updates.
  this.frame = requestAnimationFrame(() => {
    this.frame = requestAnimationFrame(() => {
      this.frame = requestAnimationFrame(() => { this.frame = undefined; this.flush() })
    })
  })
  return
}
this.cancelFrame(); this.flush()   // immediate：取消挂着的帧，立即发最新态
```
也就是说**流式期间 React 大约只收到 20Hz 的快照**（60Hz 的三分之一）。每个 chunk 仍然执行 Definition 的 `update()`（数据一个不丢），只是 `buildViewNode()`、View Builder、React 通知被合并（设计笔记 `.agents/notes/implemented/architecture/2026-08-09-client-conversation-node-assembly.md:128-135`）。结构性事件 / 落盘的 settlement 走 `immediate`，会抢占挂着的帧。

`append` 分支里一次追加多条时取最高优先级（`assembly.ts:120-127`），`none` 的 Match 只保留 dirty 标记，不排发布。

(c) **为什么不用 microtask 或 React transition**（`.agents/notes/implemented/testing/2026-08-03-opt-in-reasoning-chunk-browser-stress.md` 的「Alternatives」）：
- 每个 async `yield` 都是一个新的 microtask 边界，**microtask 合批会退化成一个 chunk 一次渲染**；
- `useDeferredValue`/transition 在组件里决定延迟时，React render 已经发生了，而且每个消费者都得各自实现；
- 不采样、不丢 chunk，否则活的状态会和落盘的 compact stream 不一致。

(d) **Think 行的横向跟尾**：每三帧才读一次 `scrollWidth/clientWidth` 并直接写 `scrollLeft`（同一笔记「Decision」第三段），避免每次 commit 都做同步布局读。

### 2.2 增量 Markdown：冻结前缀，只重解析尾巴

`packages/client/ui-primitives/src/markdown/incremental.ts:1-37`：CommonMark 块解析按行，追加的文字只会改变「最后一个顶层块」，所以**除最后 `UNSTABLE_TAIL_BLOCKS = 2` 块外全部冻结**，每次只重解析尾部源码。未闭合的代码围栏有第二条前沿：只把最后一个完整行加当前半行送回语法器。已知偏差：跨越冻结边界的引用式链接 / 脚注在流式期间原样显示，settle 之后的全量解析自愈。

`MarkdownText.tsx:66-147` 的 `StreamingRenderer`：
- `render(text)` 对同一 text 幂等（:87 `if (text === this.lastText) return this.lastRendered`），React 重跑 render 也没有额外开销；
- 新冻结的块**只渲染一次**，追加进 `frozenElements` 缓存（:107-126）；每帧只 `renderBlocks(tail)`（:137）；
- key 用块在全文里的**源码起始偏移**（`incremental.ts:41-50`、`blockKey`），块越过冻结边界时 React 是 reconcile，不是 remount；
- 流式结束（`streaming=false`）换成一次完整的 `renderSettled`（:30-58，带数学公式、引用、脚注）。
- `MarkdownText` 本身 `memo`（:174），`labels` 必须引用稳定：`AssistantMarkdown.tsx:58-64` 用 `useMemo(() => markdownLabels(t), [t])`，注释写明「每次新对象会让 MarkdownText 在每个 chunk 重建组件表」。

**代码高亮**：
- shiki 同步核心 + JS regex 引擎（不用 oniguruma WASM），启动只加载 TS / shell / JSON 三种语法，其余语言 `import()` 懒加载，加载完之前先显示纯文本（`highlight.ts:1-19, 54-61`）；
- 流式代码块用 `StreamingHighlightSession`，保存 `GrammarState`，**只 tokenize 追加的文本**，已完成的行组（每组 32 行，`CodeBlock.tsx:58`）DOM 不动（`CodeBlock.tsx:19-26, 85-134`、`highlight.ts:474-525`）；
- **视口内才高亮**：`useViewportHighlighting.ts:8-45` 全文档**一个共享的** IntersectionObserver，元素第一次进入视口才激活，激活后永久移出观察。长历史里屏幕外的代码块不付高亮成本。
- KaTeX：流式期间 TeX 保持原文，settle 时才换成渲染结果（`MarkdownText.tsx:153-155` 注释），避免半截公式闪红。

## 3. 长对话：没有虚拟列表，用的是什么

- **转录区没有虚拟化**。全仓只有左侧回合导航轨 `TurnNavigator.tsx:6,110` 用了 `@tanstack/react-virtual`；`ChatView.module.css:83-86` 的注释说 `.flowItem` 是「将来给 virtualizer 用的测量/挂载单元」，也就是**预留了但没做**。grep 不到 `content-visibility`。
- **历史窗口按回合分页**：`session-controller/src/client/sessions/session.ts:51-61`：
  ```ts
  export const PAGE_MESSAGES = 50
  const HISTORY_PAGE_OPTIONS = { maxMessages: 500, turnWindow: { minMessages: PAGE_MESSAGES, minTurns: 2 } }
  export const JUMP_PAGE_MESSAGES = 200   // 回合跳转时往回翻的页
  ```
  服务端 `history.ts:397-407` 在 `turn/start` 边界切页，所以不会切在回合中间。基准里 240 回合的会话首开只加载约 25 个回合，点 9 次「更早」才加载完（`frontend-performance-budgets.md` Decision 第三段）。窗口**只增不减**，没有回收：全部加载后 240 回合约有 17,064 个 DOM 元素、GC 后堆约 53 MiB（同笔记「Actual CI runs」）。
- **已完成回合的过程默认折叠**：`presentation-policy.ts:27` `foldCompletedTurns: true`；被折叠的节点**不卸载**，用 `hidden="until-found"`（`searchable-hidden.ts`），保留浏览器页内查找（`beforematch` 时自动展开），同时省掉布局和绘制。
- **往上翻页的阅读锚点**：`use-chat-viewport.ts:151-205, 340-379` 用 `data-chat-anchor-key` 找视口里的语义锚点，prepend 之后按锚点的 top 差值补偿 `scrollTop`，所以加载更早历史时画面不跳。
- **装配热路径不扫全量**：`AGENTS.md`「Conversation Node discipline」和 `conversation.md:268`：D 个 Definition 时，每条事件只做 D 次 match 加 O(1) 的 Context 查找；Definition 禁止遍历整个事件窗口、全部 Context 或渲染节点集合。

## 4. Store / 订阅设计：一个 chunk 为什么不会重渲染整个转录

1. **唯一的 uSES 桥**：`ui-renderer/src/client/bind.ts:21-26`：
   ```ts
   const subscribe = (fn) => w.subscribe(fn)      // 每个 source 只捕获一次
   const getSnapshot = () => w.getSnapshot()
   return function useSelector(sel, eq) {
     return useSyncExternalStoreWithSelector(subscribe, getSnapshot, undefined, sel, eq)
   }
   ```
   hook 按 source 缓存在 `WeakMap`（`bindings.tsx:78,143`），组件永远不会因为 render 而重新订阅。业务组件**禁止**自己写 `useSyncExternalStore`（`AGENTS.md`「Reactive read」第 2 条）。
2. **按 key 的节点源**：`ui-chat/src/client/conversation-nodes/chat-snapshot-builder.ts:103-122`，`MutableChatNodeStore.source(key)` 为每个节点缓存一个独立的 `MutableChatSource`；`publish()` 只在快照引用真变了才通知（:60-66）；`upsert` 里 `if (this.byKey.get(node.key) === node) continue`，只把真正变了的 key 放进 `dirtyKeys`。另外还有按 `(turn, kind)` 的聚合源（`turnDataSource`，「Other Turns and kinds do not notify this source」，`contract/snapshot.ts:39-45`）。
3. **列表只订阅顺序，行各订阅自己**：`ChatView.tsx:106` `const order = useChat(s => s.order)`；`order` 数组在成员不变时保持同一引用（`chat-snapshot-builder.ts:1138` `this.order = sameReferences(this.order, next) ? this.order : next`）。`ChatNodeList` 是 `memo`（`ChatView.tsx:65`），每行 `ChatNodeSeat` 也是 `memo` 并且 `useChatNode(nodeKey)`（`ChatNodeSeat.tsx:45-50`）。结果是**流式时只有正在增长的 assistant 节点那一格重渲染**；order 没变，列表本身不动。
4. **契约写成了规则**（`AGENTS.md`「Reactive read」第 5 条）：observable source 要保持两个身份稳定——source 对象本身，以及两次变化之间 `getSnapshot` 返回的引用。
5. **通用 store 引擎**（`packages/client/store/src/index.ts`）：zustand vanilla + immer + `subscribeWithSelector`；默认 `flush: 'sync'`（受控输入需要同 tick 回显），可选 `flush: 'raf'`（`rafBatch`，:71-89），一帧里多次改动合成一次通知。业务数据（会话、帧、连接）**不进 store**，store 只放视图/交互态（选择、草稿、面板宽度）（`AGENTS.md`「Layering red lines」）。

## 5. 乐观 UI 与输入延迟

- **用户消息立刻上屏**：`session.ts:222-243` `beginSubmission()` 同步生成 `requestId`，把回显塞进 `pendingSubmissions` 后 `markDirty()`，注释说「the echo renders on the click's own frame」。
- **先给一帧绘制机会，再做重活**：`ui-conversation/src/client/service.ts:275-293`：`beginSubmission` → `await nextPaint()` → 再序列化附件、再 `session.prompt()`。`nextPaint()`（:101-121）等 rAF，同时设 100ms 兜底 `setTimeout`，页面隐藏时直接 `setTimeout(0)`，防止被节流的帧时钟卡住提交。
- **回显与真事件对账**：`ChatView.tsx:183-208` 用 `rpcId` 匹配，durable 的 user 事件到了，对应的回显就退场；失败走 `abandon()` → `retireFailedSubmission`。
- **输入框与转录隔离**：composer 是 **Lexical 非受控编辑器**（`input/editor/runtime.ts:1-10`、`DraftEditor.tsx:3`），按键不经过 React 受控 state；草稿通过 `bindDraftMirror` 镜像进 per-session 的持久化 store（`stores.ts:19-33`、`skeleton/DefaultConversationViews.tsx:28-29`）。转录每三帧一次的发布不会碰到 composer 子树。
- 基准专门测「流式期间打字」：真实键盘输入必须在第一个回复标记出现之后、DONE 之前被页面收到（`inputOverlapped: true`），否则判失败；DONE 之后才打的输入有专门的负向对照（`frontend-performance-budgets.md`「Standard hosted expectations」）。

## 6. 启动速度

- **插件化 + 预取**：Host 把 `WebBootGraph` 写到 `window.__DSH_BOOT__`；`immediately` 的条目第一阶段就预取；所有应用 URL 都 preload，bootstrap 脚本先于 Vite 入口执行（`docs/subsystems/web-client.md:22-26`、`docs/subsystems/client-modules.md:88`）。
- **combo 请求**：`/plugins/??a/client.js,b/client.js&rev=<rev>` 把多个插件拼成一个脚本，单个 URL 不超过 3 KiB；响应是 **immutable 长缓存**，rev 不对直接 404（`client-modules.md:88`）。source map 只在第一次请求 map 时才组装。
- **框架无关的 boot 页**：React 起来之前先渲染 `packages/client/web/src/boot-page.ts` 的纯 DOM 页面，roster 全部 settled 后 `ui-renderer` 接管并调用唯一一次 `renderSlot('root')`。
- **vendor 分包**（`apps/web/vite.config.ts:97-137`）：katex / shiki / micromark / mdast 这类重库单独成 vendor chunk，而且**不能**放任何依赖 React 的包（否则 rollup 会把共享的 react 拖进 vendor）。改 shell 代码只会让 index 的 hash 变，老用户继续命中 vendor 缓存。懒加载的 shiki 语法各自一个按需 chunk（`BOOT_GRAMMAR_FILES` 只有三个）。
- 插件内部用 `import()` → `require.async("./client.<name>.js")`（`AGENTS.md`「Shared modules」第 6 条）。

## 7. 性能测试与预算

| 车道 | 位置 | 测什么 | 阈值 |
|---|---|---|---|
| **必跑 CI 基准**（`node 24 / benchmarks`） | `benchmarks/long-session-browser/long-session.bench.ts` | 240 回合、40 个工具结果、20 个代码围栏的合成历史；真实 Web 构建产物 + 新开的 Chromium；首开、最慢一次翻页、首次切 Trajectory、流式续写（120 个 delta，间隔 16ms）期间可信键盘输入 | `:16-21`：open 900→**1125ms**，page 700→**875ms**，trajectory 520→**650ms**（×1.25 余量）；其余端点用 `ciTimeBudget(ref) = ceil(ref × 2 × 1.25)`（`benchmarks/support/calibration.ts:4-15`），complete wall 另加 1984ms 的脚本节拍 |
| 参考机（arm64）中位数 | `.agents/notes/implemented/testing/2026-09-06-frontend-performance-budgets.md` 表 | open 184ms / page 262ms / 首次 Trajectory 136ms / **首个回复 374ms** / 流式期主线程任务 1054ms / 打字 487ms / 重连替换 13.8ms、留存堆 23 MiB | 每个阈值都有「零余量」的负向对照，证明断言真的会拒绝 |
| 重连重建 | `benchmarks/active-stream-reconnect` | 10 万 delta 的 reasoning 前缀，`ClientAssistantStream.replace()` 耗时和 GC 后留存堆 | 50ms 期望 → 63ms；30 MiB |
| Session 打开 | `benchmarks/session-open`（笔记 `2026-09-04-session-open-performance-gate.md`） | 127,400 事件的日志：open / read / restore / projection 分项，外加 128MB 堆限制下能不能跑完 | 起因：一次格式升级让首开从 35ms 变成 5s，没人发现 |
| 手动压力测试（不进 CI） | `apps/web/stress-tests/reasoning-chunks.stress.ts`（`vitest.web-stress.config.ts`） | 真 Host + WS 推 10 万个 `reasoning-delta`，每批 128 个等浏览器一个 timer turn；50ms 心跳量主线程延迟 | `:18-21` `MAIN_THREAD_DELAY_BUDGET_MS = 250` |
| 手动诊断 | `vitest.web.perf.config.ts` → `apps/web/tests/complex-history.perf.ts`、`ui-conversation/tests/history-transport.perf.client.ts` | 1000 个会话的侧栏、100 回合浸泡、`--expose-gc` 内存 | 无阈值 |

观测方式上的讲究：观察者只看**最后一个 assistant step** 里的可见文本，并且在 rAF 上采样，不用 Playwright 的全文/无障碍树查询，因为那会把观察者自己的 CPU 算进测量（同笔记「Alternatives」最后几条）。

## 8. 滚动：贴底跟随

- `ui-chat/src/client/chat/use-scroll-follow.ts`：`ScrollFollow` 是纯类，**滚动采样不触发 React 更新**（:164-173 用 `useState(() => new ScrollFollow(...))` 只创建一次）。
  - `following`（意图）和 `target`（正在进行的原生平滑动画）分开存：动画进行中的位置变化**不算读者移动**（`sample()` :90-95 `if (!this.animating && movedByReader) this.following = this.nearBottom(metrics)`）；
  - `toBottom()`（:137-149）：已经在阈值内就瞬移；`prefers-reduced-motion` 时瞬移；同一时间只允许一个 smooth 目标；
  - `interrupt()`（:156-161）：读者一有手势，就用 `behavior: 'instant'` 取消原生动画。
- 阈值：`use-chat-reading.ts:7` `FOLLOW_THRESHOLD = 24`（controller 用 25px）。
- `use-chat-viewport.ts:40-76`：读者意图只看 `wheel / touchstart / pointerdown / keydown(仅滚动键) / beforematch`，全部 passive + capture；另有 `scrollend`；`ResizeObserver` 同时观察 column、scroller、composer，内容长高时 `onResize()` → 如果在跟随就 `followTail()`（`use-chat-reading.ts:140-144`）。**流式增长靠 ResizeObserver 驱动贴底，不靠每个 chunk 调一次 scroll**。
- 跟随时关闭 `overflow-anchor`（`ChatView.module.css` 中 `.root[data-chat-following-tail] .scroll { overflow-anchor: none; }`），避免浏览器自带的滚动锚定和手动贴底打架。
- 自己发的消息强制贴底：`use-chat-scroll.ts:52-72` 的 `ownInput`（最后一条是 user、或出现新的 submission/steering id），会取消正在进行的回合导航并 `followTail()`。
- 活动回合的探测也按 rAF 合并（`use-chat-reading.ts:147-156`）。
- 离开底部时显示「回到底部」按钮（`ChatView.tsx:287-298`）。

---

## 对 DAWN 的可借鉴点（按投入产出排序）

1. **在数据层限频，不在组件里限**：流式 delta 标成「帧发布」，挂一个三帧（或一帧）rAF，结构事件立刻发并取消挂着的帧。DAWN 的 perf-render 分支已经把每次提交的重跑从 425 次降到 36 次，下一步可以对照 `assembly.ts:140-156` 检查：token 发布有没有被 microtask 退化成一个 chunk 一次。
2. **增量 Markdown**：冻结除最后 2 块以外的所有块，缓存它们的 React 元素，key 用源码偏移。这个改动只影响 Markdown 组件，收益和回复长度成正比。
3. **per-key 节点源 + 引用稳定的 order**：列表只订阅 order，行只订阅自己的 key。
4. **视口内才高亮**（一个共享的 IntersectionObserver）+ shiki JS 引擎 + 语法懒加载。
5. **折叠用 `hidden="until-found"` 而不是卸载**：页内查找还能用，布局成本省掉。
6. **贴底由 ResizeObserver 驱动**；`following` 和「动画进行中」分开记，读者手势立即打断。
7. **把浏览器性能预算放进 CI**，每个阈值都配一个零余量的负向对照；观察者只看最后一步，别把观察成本算进测量。
