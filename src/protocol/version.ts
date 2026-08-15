/**
 * Workbench Protocol 的版本与兼容策略（Task 2.1）。
 *
 * 依据 Rho 的原则：**UI 只依赖版本化协议，不依赖实现内部**。
 * 版本号是这条依赖关系的唯一凭据——UI 启动时握手，不匹配就响亮报错，
 * 不静默降级（规格 7.5）。
 */
/**
 * 1.1（2026-08-08）：新增凭证的三个操作。
 * 1.2（2026-08-08）：新增 `getProviders`——界面要列出可选 agent 才能建会话，
 *   此前只能靠硬编码猜。minor 递增 = 向后兼容的新增。
 * 1.3（2026-08-08）：新增 `subscribeSession` / `unsubscribeSession`。
 *   此前协议**只能写不能读会话**——`writeToSession` 有，读的一个都没有，
 *   也就是说界面根本拿不到 agent 的回复。这是 MVP 那条路上断掉的一环。
 * **2.0（2026-08-08，破坏性）**：会话读取从 `seq + 环形缓冲 + dropped` 改为
 *   `snapshot + revision`（借自 pi-protocol）。`subscribeSession` 的响应形状变了，
 *   事件信封整体替换，故 major 递增。同批新增 `abortSession` / `steerSession`。
 *   **换来的不只是简单**：旧设计跳号只能出声，新设计跳号可以重新取快照——能自愈。
 * 2.1（2026-08-09）：新增 `setSessionModel`，会话级模型覆盖（①-B″ · U2）。**这一行是补记的**——
 *   当时升了版号却没在这里留下说明，于是这个清单和实际版本对不上了。
 *   版本清单漏一条，它作为「唯一凭据」的作用就打了折。
 * 2.2（2026-08-09）：transcript 新增 `subagents` 条目（①-B″ · S1）。
 *   **一条记录装一组子 agent**，界面据此画 chip 组。
 *   minor 递增 = 向后兼容的新增：老界面遇到不认识的条目类型会被 zod 挡下，
 *   而握手时版本不匹配已经会响亮报错，所以不会静默画错。
 * 2.3（2026-08-09）：会话 `kind` 新增 `cli`（①-C）——外部 CLI 的 headless 模式。
 *   **判别式在协议里出现三处**（SessionSummary / getProviders / SessionSnapshot），
 *   三处一起加。漏一处的表现是「某条路径上这个会话凭空消失」，
 *   而 strict 校验会把它变成一个与业务无关的报错信息。
 *   仍是 minor：既有取值一个没动。
 * 2.4（2026-08-09）：cli agent 能报模型清单（`getProviders` 的 `models`），
 *   且 `setSessionModel` 的 `provider` 放宽为可选——**外部 CLI 没有 provider 概念**。
 *   放宽必填字段是**兼容的方向**（老客户端照旧会传），故仍是 minor。
 * 2.5（2026-08-10）：新增 `listKernels`（②-A · K2）——界面要能列出本机内核，
 *   **且必须连解释器路径一起列**。作者机器上五个 kernelspec 里三个是 conda 环境，
 *   光看名字分不出哪个是哪个，而挑错的后果是**跑在了另一个环境里而不自知**。
 *   响应里同时给 `problems`（坏掉的注册项）与 `shadowed`（被同名挡住的），
 *   两者都是「不静默」的直接要求。纯新增，故 minor。
 * 2.6（2026-08-10）：会话 `kind` 新增 `kernel`（②-A · K4），
 *   transcript 新增 `kernelOutput` 条目——内核的输出是**结构化条目**
 *   （图/表/报错各是一种东西），不是文本流。
 *   **判别式的三处一起加**（SessionSummary / getProviders / SessionSnapshot）——
 *   这条是 2.3 留下的教训：漏一处的症状是「某条路径上这个会话凭空消失」。
 *   仍是 minor：既有取值一个没动。
 * 2.7（2026-08-10）：`SessionSnapshot` 新增 `kernelInstanceId`（②-A · K5 · S13）。
 *   界面据它与每条输出自带的那个一比，判断输出是不是**上一个内核**算出来的。
 *   **缺省 = 还没有内核**，不是「不陈旧」——拿不到就不判断，不猜。
 *   纯新增可选字段，故 minor。
 * 2.8（2026-08-10）：新增 `listVariables`（②-A · K5 · S14）。
 *   响应是**三态**而不是一个列表：「不支持 + 原因」与「支持但为空」
 *   必须分得开——混成空列表就是把「我们没去问」说成「这里什么都没有」。
 *   纯新增，故 minor。
 * 2.9（2026-08-10）：新增 `getInterpreters` / `setInterpreter`。
 *   **两个解释器路径是调用 Python / R 的机制**（作者定）：没配就不能用，
 *   而不是退回某个扫描出来的默认——猜一个的后果不是跑不起来，
 *   是**跑在了另一个环境里而不自知**。
 *   **没配的那个不给字段**，不是空串：「还没配」与「配了一个空路径」
 *   在界面上要说不同的话。纯新增，故 minor。
 * 2.10（2026-08-10）：新增 `listDirectory` / `readFile`（②-A′ · F2）。
 *   数据科学平台的分水岭之一——**agent 跑完分析，人要能看见产出**。
 *   **只读**：写、删、改名不在这一阶段（它们要走授权门，阶段 ④）。
 *   图片回 base64 而**不回 `file://` 路径**——后者等于把路径守卫的判断权
 *   交给渲染进程。纯新增，故 minor。
 * 2.11（2026-08-10）：新增 `openExternally`（②-A′ · F3）。
 *   **它收的是工作区内的相对路径**，由后端解析并校验之后才交给系统——
 *   直接给绝对路径调 `shell.openPath` 等于把路径守卫绕过去。纯新增，故 minor。
 * 2.12（2026-08-10）：`SessionSummary` 新增可选 `title`。
 *   纯新增字段，老界面照常工作（只是仍然分不清会话）。
 *   **缺省 = 还没说过话**，不是空标题。
 * 2.13（2026-08-10）：新增 `deleteSession` / `deleteProject` / `deletionImpact`。
 *   纯新增。**`deleteProject` 不碰磁盘上的文件夹**——它移除的是工作台里的记录。
 * 2.14（2026-08-10）：新增 `listKnownProviders`。纯新增。
 *   **与 `getProviders` 不是一回事**：那是「我配过谁」，这是「我能配谁」。
 * 2.15（2026-08-10）：`readFile` 新增 `pdf` 一档（②-A′ · F5）。
 *   **与 `image` 分开**：它在界面上走 blob + `<embed>`，交给 Chromium 自带的阅读器；
 *   混进 `image` 会让界面拿 `<img>` 去画 PDF——那是一个空框。
 * 2.16（2026-08-10）：新增 `getEnvironment`（②-B · S17）。纯新增。
 *   **三态**：不支持 / 还没拿到 / 拿到了——一份空快照会被读成
 *   「这个环境什么都没有」，而实情是「我们没问到」。
 * 3.0（2026-08-10）：`SessionSummary` 新增**必填**的 `pinned` / `sortOrder`。
 *   **必填即破坏性**——老服务端不会发这两个字段，新界面的 zod 校验会直接拒。
 *   同批新增 `renameSession` / `setSessionPinned` / `moveSession`。
 *
 *   本可以把它们做成可选来躲开 major。**没有那么做**：
 *   `sortOrder` 缺省时列表该按什么排没有诚实的答案，而「可选 + 各处兜底」
 *   正是 schema v8 那笔烂账的翻版（见 `store/schema.ts` 的说明）。
 * 3.1（2026-08-10）：新增 `reorderSessions`（拖拽排序）。纯新增，故 minor。
 * 3.2（2026-08-10）：transcript 的 `turn` 条目新增可选 `usage`。纯新增。
 *   **缺席 = 不知道**，不是 0——界面据此说的话完全不同。
 * 3.3（2026-08-10）：新增 `createAgent`。纯新增。
 *   **只支持 `kind: native`**——cli 与 pty 要填命令行，在这里顺手支持
 *   等于让一个「加个模型」的按钮悄悄能起任意进程。
 * 3.4（2026-08-10）：新增 `setProviderBaseUrl`；`listKnownProviders` 带上
 *   `needsBaseUrl` / `baseUrls`。纯新增。
 * **4.0（2026-08-10，破坏性）**：`setProviderBaseUrl` → `setProviderConnection`
 *   （多收 `api` / `models`）；`listKnownProviders` 的 `baseUrls` → `connections`
 *   （一个 provider 的三样一起回）。
 *
 *   **两处都是替换，不是新增**，所以 major 递增。本可以两边并存躲开这次 major——
 *   没有那么做：设置里那个编辑器要能改任何一项，而两个写口子（一个只写地址、
 *   一个写三样）迟早会各写各的，那时「我到底改没改上」没有人答得出来。
 *
 *   起因是作者：*「我觉得可以在设置里面，通过 baseUrl、api、models
 *   分别留出可以填写的地方，然后自行填写。」*
 * 4.1（2026-08-11）：`getProviders` 的 `providers[]` 带上 `name`（pi 给的显示名）。
 *   纯新增。作者：*「ds-chat 我感觉不如直接叫 DeepSeek。」*——agent id 是配置里的键，
 *   **是我们的内部标识，不是这家服务的名字**。
 * 4.2（2026-08-11）：新增 `createTemporarySession` / `listTemporarySessions`；
 *   `ProjectSummary` 带上可选的 `temporary`。纯新增。
 *   作者：*「会话其实更倾向于，没有设置工作路径的、或者没有设置项目的临时会话。」*
 *   **临时会话仍然有工作区**（每个一个独立目录）——agent 要有地方读写、
 *   账本要有归属；`temporary` 只是告诉界面它归上面那一列。
 * 4.3（2026-08-11）：新增 `createTerminalSession`。纯新增。
 * 4.8（2026-08-12）：任务——`listTasks` / `createTask` / `setTaskWorkspace`。
 * 4.11（2026-08-12）：`getDefaultWorkspace` / `setDefaultWorkspace`——
 *   App 的默认工作目录（mac 是 `~/DAWN`，Windows 是桌面）。
 * 4.10（2026-08-12）：`listSkills`——把 `.dawn/agents/*.md` 里的子 agent 端出来。
 *   它本来就能跑，只是界面上看不见。**读不进来的文件也一并端出来**。
 * 4.9（2026-08-12）：`deleteTask`——**按 taskId 删**。
 *   界面手上只有「当前项目 + 临时」两拨会话摘要，迁移过来的任务指向别处，
 *   于是那些行既没有删除键也进不了批量。**删除不该需要先认识那段会话。**
 *   纯新增，**旧的 project / session 操作原样保留**：界面与后端不该在同一次
 *   升级里同时换，那样一旦出错就分不清是谁的问题。
 * 4.7（2026-08-12）：`TurnItem.by`——这一轮是谁答的。纯新增。
 *   就地换服务之后，答话的那一行仍标着建会话时那个 agent 名——**界面在说谎**。
 *   **不能一律显示当前那家**：那会把历史也改写。所以每一轮各自记下。
 * 4.6（2026-08-11）：`createRemoteSession`；`SessionSummary.remote`；
 *   会话更新多一种 `cwd`。纯新增。
 *   **起点是那台机器的家目录，由服务端定**——「从哪个目录开始」是一条边界。
 * 4.5（2026-08-11）：远端连接名单——`listConnections` / `saveConnection` /
 *   `removeConnection` / `connectRemote` / `disconnectRemote`，
 *   以及连接状态的推送通道。纯新增。
 *   **`secret` 只进不出**：请求里有，响应里永远没有，只用 `hasSecret` 说配过没有。
 * 4.4（2026-08-11）：工具调用带上 `startedAt` / `endedAt`。纯新增。
 *   因为 bash 不设默认超时（作者定），**「还在跑」与「卡死了」在界面上长得一样**，
 *   唯一能分开两者的是「已经跑了多久」。时刻必须由后端打，界面自己掐表
 *   在重新订阅一个已运行的会话时会从零数起——那是看起来很确定地错。
 *   **终端的 cwd 由服务端定**：给了项目就用项目的工作区，没给就用家目录
 *   （作者：*「如果没有选择的话，那么终端就在家目录下」*）。
 *   不做成 `createSession` 的一个 `cwd` 参数——那等于把「shell 从哪儿开」
 *   的决定权交给渲染进程，而那条边界决定了 `rm -rf .` 会删掉谁。
 * 4.12（2026-08-13）：`writeToSession` 多一个 `images`——**真的把图片送进模型**
 *   （作者：*「是否识别图片，那是 LLM 的事情……别忘了我还有 kimi-2.7」*）。纯新增。
 *
 *   **传的是路径，不是字节。** 读盘、按 provider 上限缩放、转 base64
 *   都在主进程做（pi 的 `processImage`）——渲染进程连 fs 都没有，
 *   让它读文件就得给它一条新的文件读取通道，而**那条通道一旦开出来，
 *   就不只能用来读图片**。边界比省一次拷贝重要。
 *
 *   **不支持图片的运行时必须报错，不许静默丢掉**：一段 pty / cli 会话收到图片时
 *   抛 `invalid_request`。悄悄丢的表现是「我明明附了图，它却说没看见」——
 *   而那种 bug 会被归咎到模型头上。
 * 4.13（2026-08-13）：`images` 从「一串路径」改成判别式联合，多出 `bytes` 一支——
 *   **粘贴板里的图片没有路径**（作者：*「能否……直接复制粘贴图片」*）。
 *   剪贴板里的截图不是磁盘上的一个文件，硬给它编一个临时路径写到盘上，
 *   等于为了迁就形状去制造垃圾文件。
 *
 *   **这是一次破坏性改形**，但 4.12 是同一天加的、还没有任何外部使用者，
 *   所以就地改形比再叠一个字段干净——**两个字段表达同一件事，
 *   迟早有人只填其中一个**。
 * 4.14（2026-08-13）：转录里的 `turn` 多一个 `images`——**发完之后，
 *   对话里要看得见自己附了什么**（作者：*「能否放入到对话窗口里面？」*）。纯新增。
 *
 *   存的是**缩略图的 `data:` URL**，不是原图。转录会被反复读、
 *   会随快照整个发过来，**塞原图进去等于每次切会话都搬一遍几 MB**；
 *   而这里要回答的只是「附的是哪几张」。
 * 5.0（2026-08-13）：**T4 迁移收尾——七个旧操作从协议上摘掉**。
 *   `createSession` / `createTemporarySession` / `openProject` / `getProject` /
 *   `previewTakeover` / `steerSession` / `createAgent`。
 *
 *   **major 递增，因为这是删除**：老界面调它们会得到「不认识这个操作」，
 *   而握手时的版本比对会先一步把话说清楚。
 *
 *   任务模型（4.8 起）之后，「开一段对话」只有一个动作：`createTask`，
 *   工作目录在开口之前选。那七个是它之前的形状——
 *   **它们在界面上早就没有入口了**（这次是先确认渲染进程一个调用点都没有，
 *   才动的协议）。
 *
 *   **留着的那些不是漏网**：`listProjects` / `listSessions` /
 *   `listTemporarySessions` / `deleteProject` / `deletionImpact` /
 *   `deleteSession` / `renameSession` / `setSessionPinned` / `moveSession` /
 *   `reorderSessions` 仍然在用——项目与会话作为**记录**还在（账本挂在上面），
 *   不再作为**入口**存在。摘掉的是入口，不是记录。
 * 5.1（2026-08-13，②-B · R5）：**环境快照从一种变成两种**。
 *   `getEnvironment` 的「拿到了」那一支分成 `kind: "kernel"` 与 `kind: "shell"`；
 *   `RunSummary` 多一个可选的 `environmentSnapshotId`。纯新增，故 minor。
 *
 *   内核快照答的是「这个解释器里有什么」，机器快照答的是「这台机器是什么」——
 *   计划 §3.4：*「两种环境快照，不共用一个名字。」* **它们不可比**：
 *   一台机器上装着三个 conda 环境，机器还是那台机器。塞进一个对象、
 *   靠可空字段区分的话，界面就能写出「版本是 undefined」这种句子，
 *   而真相是它问错了问题。
 *
 *   `RunSummary.environmentSnapshotId` 补的是一个更难看的洞：此前环境只挂在
 *   **溯源链**上（资源 → 产出它的 run → 环境），**Run 自己指不到自己的环境**——
 *   于是 ②-B 那条判据「两次运行都留下可查的 Run 记录，**且记录里有环境快照**」
 *   连内核会话都不成立。**缺省 = 不知道**，不是「没有环境」。
 * 5.2（2026-08-13）：`getPermissionMode` / `setPermissionMode`——**工具权限门**。纯新增。
 *
 *   补的是一个「看起来有、其实没接」的洞：`native.ts` 里那道 `ToolGate` 写好之后
 *   **从来没被传给运行时**，于是 `providers.yaml` 里那行 `capabilities: [chat, exec]`
 *   至今没有任何东西在执行。
 *
 *   **只有两档**（`allow-all` / `deny-risky`），因为只做得到两档：「问一句人」
 *   需要主进程↔界面的一次往返，那条还没有。现在就把「请求批准」的名字占上、
 *   行为却是直接拒绝，正是规格 7.5 禁止的静默偏离。
 *
 *   **它不是沙箱**：沙箱是操作系统层的强制隔离（Codex 走 seatbelt / landlock），
 *   这里是我们代码里的一道门——模型走我们包装过的工具时拦得住，绕过去拦不住。
 *   名字不许比能力大，所以界面上也不叫它沙箱。
 * 5.3（2026-08-14）：`initScienceLayout`——按科研目录结构初始化一个项目。纯新增。
 *
 *   建目录骨架 + 把作者定的产物落位约定写进工作区的 `AGENTS.md`。
 *   **不是我们自己发明的注入路**：pi 的 `DefaultResourceLoader` 本来就读
 *   `AGENTS.md` / `CLAUDE.md`，写成文件模型自然看得到，而且**人能直接改**。
 *   硬编码进系统提示词的话它既看不见也改不动。
 *
 *   **已经有指令文件的项目一个字都不动**，并如实回「没写、为什么、该贴什么」。
 *   那份文件里可能是这个仓库攒了很久的约定，覆盖掉不可撤销。
 * 5.4（2026-08-14）：`readFile` 多一支 `table`——**打开 csv 看见一张表**。纯新增。
 *
 *   此前 `.csv` 落在 `text` 那一支上（`text/csv` 也是 `text/`），
 *   界面上是一坨逗号原文——一个叫 DAWN **Science** 的应用打开数据文件
 *   却看不见数据。首页那张起手卡写着「读一份数据」，点下去底下没有东西接着。
 *
 *   **不起内核**：打开就见，不用先选 R 还是 Python。
 *   **类型是推断的**，所以字段叫 `inferred`——CSV 没有 schema，
 *   把猜出来的摆成事实，下一步就会有人拿它当依据。
 *   **`totalRows` 只有完整读完才给**：没读完却报一个总数，那个数是假的。
 * 5.5（2026-08-14，②）：`kernelOutput` 多一个**可选**的 `language`。纯新增。
 *
 *   一段普通对话可以同时挂 Python 与 R 两台内核（作者定的），
 *   而事件回来时只带内核自己的 sessionId——**不标的话两台的输出混在同一条
 *   转录里就没有判据**。`kind: kernel` 那条既有的路一段会话只有一个内核，
 *   不填即可，**缺席读作「这条转录只有一个内核」**，不是「不知道哪来的」。
 * 5.6（2026-08-15）：`writeToSession` 多一个**可选**的 `behavior`
 *   （`steer` 插队 / `followUp` 排队）。纯新增。
 *
 *   在此之前，上一轮还在跑时又发一条，pi 会拒收并回
 *   `Agent is already processing`。我们先把那条路堵上了（守卫），
 *   但**堵住不是答案**——作者要的是 Hermes / Codex 那种：
 *   *「对话框依旧能传上去，但是却不执行新的内容，而是等上一条结束再执行。」*
 *
 *   **两个词都是 pi 的**（`AgentSession.prompt` 的 `streamingBehavior`）：
 *   `steer` 在当前轮跑完工具、下一次调模型之前送进去；
 *   `followUp` 等这一轮再没有工具调用与插队消息了才送。
 *   Hermes 自己写了 358 行队列，是因为它后端不是 pi；**我们坐在 pi 上，
 *   重写一份就是「学会了，自己写一个」**。放弃的是「排队中那条可以编辑/撤回」。
 *
 *   **不忙时无意义；忙时缺席读作 `followUp`**——排队不丢消息，
 *   而 pi 在流式中没有 behavior 会直接抛错，那时人打的那句话就没了。
 */
export const WORKBENCH_PROTOCOL_VERSION = "5.6"

const VERSION_RE = /^(\d+)\.(\d+)$/

function parse(v: string): { major: number; minor: number } | undefined {
  const m = VERSION_RE.exec(v)
  if (!m) return undefined
  return { major: Number(m[1]), minor: Number(m[2]) }
}

/**
 * UI 能否与服务端通话。
 *
 * 规则：
 *   - **major 必须相同** —— major 递增即破坏性变更
 *   - **UI 的 minor 不得高于服务端** —— minor 递增只加字段；
 *     UI 比服务端新，意味着它会去读服务端根本不返回的字段
 *   - 反过来（服务端更新）是允许的：多出来的字段 UI 用不到，无害
 *
 * 格式非法一律判为不兼容——**不抛错也不放行**。放行会让一个畸形的版本号
 * 静默通过握手，那正是握手要防的事。
 */
export function isCompatible(uiVersion: string, serverVersion: string): boolean {
  const ui = parse(uiVersion)
  const server = parse(serverVersion)
  if (!ui || !server) return false
  return ui.major === server.major && ui.minor <= server.minor
}
