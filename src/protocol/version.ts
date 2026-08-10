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
 * 2.10（2026-08-10）：新增 `listDirectory` / `readFile`（②-B · F2）。
 *   数据科学平台的分水岭之一——**agent 跑完分析，人要能看见产出**。
 *   **只读**：写、删、改名不在这一阶段（它们要走授权门，阶段 ④）。
 *   图片回 base64 而**不回 `file://` 路径**——后者等于把路径守卫的判断权
 *   交给渲染进程。纯新增，故 minor。
 * 2.11（2026-08-10）：新增 `openExternally`（②-B · F3）。
 *   **它收的是工作区内的相对路径**，由后端解析并校验之后才交给系统——
 *   直接给绝对路径调 `shell.openPath` 等于把路径守卫绕过去。纯新增，故 minor。
 * 2.12（2026-08-10）：`SessionSummary` 新增可选 `title`。
 *   纯新增字段，老界面照常工作（只是仍然分不清会话）。
 *   **缺省 = 还没说过话**，不是空标题。
 * 2.13（2026-08-10）：新增 `deleteSession` / `deleteProject` / `deletionImpact`。
 *   纯新增。**`deleteProject` 不碰磁盘上的文件夹**——它移除的是工作台里的记录。
 */
export const WORKBENCH_PROTOCOL_VERSION = "2.13"

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
