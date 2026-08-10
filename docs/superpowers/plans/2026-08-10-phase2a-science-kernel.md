# 阶段 ②-A 详细计划：科学内核

- **日期**：2026-08-10
- **上游**：`docs/superpowers/plans/2026-08-08-master-roadmap.md` §阶段 ②-A（S8–S14）
- **实测支撑**：`spikes/FINDINGS.md` Spike D（2026-08-08 首测，**2026-08-10 重跑仍通过**）

---

## 0. 判据

> 一个持久的 Python 会话和一个持久的 R 会话，人和 agent 共用同一个活会话，
> **能中断**，图能显示。

两条要在本阶段结束时逐条对账：

1. **同一个活会话**：人在 Console 里定义的变量，agent 下一次执行能读到；反之亦然
2. **能中断**：长任务可以打断，**且内核不死**——中断之后还能继续用

---

## 1. 为什么这个阶段的第一片是「传输」而不是「界面」

S11 的结构化 Console 看起来是这个阶段最显眼的产物，但它只是**协议事件的渲染**。
先做界面就会得到一个「看着像 Console、底下没有真内核」的东西，
而这个项目已经在这类接缝上栽过不止一次。

**传输先行还有一条更硬的理由**：S13 的陈旧标记要求
*「每份 output 记录产生时的版本」*，S12 要求
*「输出从诞生那一刻起就绑定溯源状态，不是事后补」*。
**「诞生那一刻」是消息从传输层出来的那一刻**——这个钩子只能挂在第一片上，
之后再补就永远是「事后补」。

---

## 2. 依赖决策：我们坐在哪一层（规格 §4）

### 2.1 定案

**坐 `enchannel-zmq-backend@10` 的 `createMainChannel`，外面立刻包一层薄适配器。**

这是 Spike D 的结论，**不是新决定**。2026-08-10 曾一度被重新提出
「协议自己写」，被 Spike D 的实测记录否掉——理由见 §2.4。

### 2.2 具体到导出符号

| 包 | 用到的导出符号 | 干什么 |
|---|---|---|
| `spawnteract` | `launch(kernelName)` | 按 kernelspec 起内核进程，返回 `{config, spawn, connectionFile}` |
| `enchannel-zmq-backend` | `createMainChannel(config)` | 五通道（shell/iopub/stdin/control/hb）+ **HMAC 签名** |
| `@nteract/messaging` | `kernelInfoRequest` · `executeRequest` · `childOf` · `ofMessageType` | 消息构造与按 `parent_header` 归属 |
| `zeromq` | （不直接用）由 enchannel 传递 | 原生 socket |

**HMAC 签名由 enchannel 内部处理，我方不实现。** 这正是当初
「TS 需手搓 Jupyter 协议 3–4 周」被判定为误判的依据。

### 2.3 放弃了什么

- **放弃对 wire 层的直接控制**：签名算法、分帧、delimiter 都在 enchannel 里。
  换掉它要重做这一层——所以有 §2.5 的适配器把影响面锁住。
- **接受 rxjs 进入依赖树，但不进 DAWN 代码**：
  `@nteract/messaging` 要 rxjs **^6.6.0**，`enchannel-zmq-backend@10` 要 **^7.8.2**，
  两份都会装上。**这不是可以消除的成本，只能隔离。**
- **接受消息层停在 2021**（`@nteract/messaging@7.0.20` 最后一版 2021-10-22）。
  可接受的理由：**Jupyter wire protocol v5.3 是冻结的规格**，
  库不更新不等于它不对。传输层 `enchannel@10` 反而是 2026-01 现代化过的
  （丢掉 `jmp`，换到 `zeromq@6` + rxjs 7），由 nteract 官方 CI 发布。

### 2.4 为什么不自己写协议

2026-08-10 的一次返工记录，写在这里免得第三次提出来：

- Spike D 已实测「不必自己写」，且**顺带证明了中断可行**（Q2）。
  中断是规格 10.4 的硬要求，**wisp-science 的自研 JSON-lines worker 方案正是败在这一条**。
  自己写协议等于把这条已经拿到的证据扔掉，重走一遍别人失败过的路。
- 「诞生即绑定溯源」这个理由**不成立**：适配器是唯一入口，
  在适配器出口打标与在解析处打标，对下游是同一件事。

### 2.5 不变式挂在哪个钩子上

**挂在适配器的出口。** 适配器对内暴露三个普通接口，不暴露任何 Observable：

```ts
interface KernelChannel {
  send(msg: JupyterMessage): void
  on(type: string, cb: (msg: Tagged<JupyterMessage>) => void): Unsubscribe
  request(msg: JupyterMessage): Promise<Tagged<JupyterMessage>>   // 按 parent_header 配对
  close(): Promise<void>
}
```

`Tagged<T>` = 原消息 + **在出适配器那一刻绑上的三件套**：

- `kernelInstanceId`：内核实例身份，**重启即变**（S9）
- `kernelRevision`：单调递增，每次执行 +1（S13）
- `runId`：账本上那条 run（与 ①-B 的 `RunRecorder` 同一套）

> **四个单调量各管一件事，不共用一个计数器**——照 Rho 的
> `kernel_instance_id` / `execution_seq` / `state_revision` / `project_revision`。
> 合并任意两个，都会在某个重启/重跑组合下给出错误的陈旧判断。

---

## 3. Spike D 钉死的四条实现约束

**这四条都是实测得来的，不照办就会得到「看着对、实际不工作」的东西。**

1. **握手是必需的，不是优化。**
   内核就绪前发出的 `execute_request` 会被**静默丢弃**——不报错、不重试、什么都没有。
   必须先 `kernel_info_request`，等到 `kernel_info_reply` 才能发执行请求。

2. **中断走信号，不走 control 通道；而「中断成功」不能按回复的形状判。**
   Python 与 R 的 `interrupt_mode` 实测都是 `signal` → 向内核进程发 **SIGINT**。
   `interrupt_request` 那条路要留着（别的内核可能声明 `message` 模式），
   但**默认路径是信号**。

   **两种语言中断后的回复不一样，且都合法**（2026-08-10 实测）：

   | | `execute_reply` |
   |---|---|
   | Python | `status=error` · `ename=KeyboardInterrupt` |
   | **R** | **`status=abort` · 无 ename** |

   > Spike D 原来的判据按 Python 的形状写死，**把一个工作正常的 R 内核判成了失败**。
   > 唯一与语言无关的判据是：**中断之后再算一道题，能算对就成功**——
   > 内核串行执行，后一条能跑完就同时证明了死循环停了、内核没被打死。
   > **适配器也不许把 `abort` 当成内核故障**，那是一次成功的中断。

3. **关停顺序是正式代码，不是收尾。**
   `先停内核进程 → channels.complete() 关 socket → 留约 300ms → 才退出`。
   否则 native 层抛 `Napi::Error` + **SIGABRT**。
   > **诊断陷阱：结论会先打印、崩溃在后。** 只看日志末尾会以为成功——
   > **判定必须看退出码。** 这与 Spike C 的 node-pty 是同一类失效，
   > 已升格为通则：**原生模块必须先自行关闭，才能让运行时退出。**

4. **zeromq 不需要 `electron-rebuild`**（N-API，ABI 跨 Node 与 Electron 稳定）。

---

## 4. 一条 Spike D 没覆盖、但今天暴露出来的需求

作者机器上有**五个 kernelspec**（`d2l` / `datascience` / `dawn-spike` / `ir` / `python_learn`）。

所以：

- **不能假定只有一个 Python。** 内核要能选，且选择要落库（跟着项目走）。
- **用户的环境里没有 ipykernel 时必须响亮失败**，并说清怎么办
  （`python -m pip install ipykernel`），**不能静默退回某个别的内核**——
  那会让人以为代码跑在 A 环境里，其实跑在 B 里。这是不变式 5 的直接后果。
- `ir` 内核在 Spike D 里失败过。**根因是 `IRkernel` 包没装**，
  kernelspec 本身一直是对的——它指向 `/Library/Frameworks/.../bin/R`，
  而作者在用的 `/usr/local/bin/R` 是指向同一个二进制的**软链接**
  （Spike D 首版把这诊断成「过期的注册项」，2026-08-10 已更正）。
  所以起不来时的错误**必须分清三件事**，它们要人做的事完全不同：
  | 实情 | 该说什么 |
  |---|---|
  | kernelspec 没有 | 「本机没有注册这个内核」 |
  | kernelspec 有，可执行文件不在 | 「注册项指向的程序不存在」→ 重装 kernelspec |
  | 可执行文件在，语言侧的包缺失 | 「R 在，但 IRkernel 没装」→ 装包 |
  **混成一句「内核起不来」，人就会去修一个没坏的东西。**

---

## 4.1 设置里必须看得见解释器路径（作者 2026-08-10 提）

> *「我觉得有必要在 app 的设置里面，让用户配置一下 R 和 Python 的路径，否则很盲目。」*

实测印证了这句话。本机扫出来的五个内核是：

```
d2l            python   ~/miniconda3/envs/d2l/bin/python
datascience    python   ~/miniconda3/envs/DataScience/bin/python
dawn-spike     python   <仓库>/.venv-kernel/bin/python
ir             R        /Library/Frameworks/R.framework/Resources/bin/R
python_learn   python   ~/miniconda3/envs/python_learn/bin/python
```

**光看名字完全分不出哪个是哪个**——三个 conda 环境加一个仓库 venv。
挑错的后果不是报错，是**跑在了另一个环境里而不自知**（§4 那条）。

这件事其实是两件，代价差很远：

| | 做什么 | 代价 |
|---|---|---|
| **A · 看得见** | 内核选择器与设置里**一律连解释器路径一起显示**，同名被挡住的也标出来 | 几乎为零——`discoverKernelSpecs` 已经把 `executable` 拿到了 |
| **B · 配得了** | 让用户直接指一个解释器（那个环境**没有注册 kernelspec**也能用） | 要判断该解释器有没有 ipykernel / IRkernel，并在没有时按 §4 的三种实情说话 |

**A 是 K2 的必做项**（没有它，「能选」等于让人蒙）。
**B 也放进 K2**，但实现上不写 kernelspec 到用户的 Jupyter 目录——
**不替用户改他的 Jupyter 配置**，而是 DAWN 自己记住这条路径、启动时按它拼 argv。
理由：写进 `~/Library/Jupyter/kernels` 会影响他所有别的 Jupyter 工具，
那是越界；而且卸载 DAWN 之后那条注册项还留着。

## 5. 批次划分

| 批次 | 内容 | 判据 |
|---|---|---|
| ~~**K1**~~ ✅ | 传输适配器（S8）：`KernelChannel` + 握手 + 关停顺序 + `Tagged` 三件套 | 一次 `execute_request` 从发出到 iopub 输出全程可测；退出码为 0 |
| ~~**K2**~~ ✅ | 内核生命周期（S9）：kernelspec 发现/选择、**设置里看得见并配得了解释器路径**、`kernelInstanceId`、起不来时的响亮失败 | 能列出本机内核（**带解释器路径**）、能选、能手动指定一个解释器、选错能说清原因 |
| ~~**K3**~~ ✅ | 中断（S10）：signal 与 message 两条路；`abort` 与 `error` 都算中断成功 | 打断长任务后**内核仍可用**（再执行一次成功）。**判据不许写成「reply 是某个 status」** |
| ~~**K4**~~ ✅ | 结构化 Console（S11）+ 富输出（S12） | 输出带 `runId`/`kernelInstanceId`；图能显示 |
| ~~**K5**~~ ✅ | 陈旧标记（S13）+ 变量面板（S14） | 重启后旧 output 显式标记为陈旧 |

**K1 与 K2 之间有一道门**：K1 用 `dawn-spike` 这个已知 kernelspec 硬编码跑通即可，
内核选择是 K2 的事。**不要在 K1 里顺手做内核发现**——那会让第一片同时背两个未知。

---

## 6. 本阶段明确不做

- **不做 notebook 文件格式**（`.ipynb` 读写）。Console 是持久会话的界面，不是 notebook。
- **不做 comm 通道上的 ipywidgets**。S12 只做 `display_data` 的静态富输出。
- **不做内核的自动安装/下载**。Ark(R) 的固定版本 + sha256 下载是 S9 的事，
  但**Python 侧一律用用户已有的环境**——替用户装 Python 包是越界。

---

## 7. 风险与防线

| 风险 | 防线 |
|---|---|
| 适配器把 rxjs 漏出去 | 加一条扫描：`src/` 下除适配器文件外不许 import rxjs（准入规则 ②） |
| 关停顺序写错 → SIGABRT | 测试**必须断言退出码**，不能只看输出（Spike D 的诊断陷阱） |
| 握手被当成可选优化删掉 | 适配器内部强制：`send` 在握手完成前入队而不是发出 |
| ipykernel 版本漂移 | Spike D 首测与 2026-08-10 重跑分别是不同 ipykernel 版本（重跑为 **7.3.0**），两次都过；把版本记在 FINDINGS 里 |

---

## 8. 每个 Task 的纪律（不变）

与前几阶段相同：新增协议操作**必须在同一次改动里补 mock 分支**；
能判定的设计规则**必须配扫描测试**；改了主路径**必须自己验证一次**
（`npm run test:e2e` / `npm run dev:mock` / 一次性探针，用完删掉）。

---

## 9. 收口对账（2026-08-10）

### §0 两条判据

| 判据 | 结论 | 凭据 |
|---|---|---|
| **同一个活会话**：人定义的变量 agent 读得到 | ✅ | `runtime.integration` 里 `dawn_x = 42` 跨执行读得到；e2e 里 `e2e_v` 在 Console 定义、在**变量面板**看得见 |
| **能中断，且内核不死** | ✅ | K3 的集成测试跑真内核，Python 与 R 各一遍；**做过变异验证**（掏空 `interrupt()` 后两条都红） |

### 五批

K1 传输 ✅ · K2 生命周期 ✅ · K3 中断 ✅ · K4 Console + 富输出 ✅ · K5 陈旧 + 变量 ✅

### 明确的欠账（不影响判据，但写在明面上）

1. **R 只验到通道层，没走完整条会话链。** `interrupt` / iopub / `execute_reply`
   都用真 `ir` 内核验过，但 `KernelRuntime` → 界面这条 e2e 只跑了 Python。
   风险在接缝不在协议——补一条把 e2e 的 `command` 换成 `ir` 即可。
2. **变量面板只支持 Python。** R 侧如实回「不支持 + 原因」，不返回空列表。
   base R 手搓 JSON 的风险大于收益，`jsonlite` 不是标配。
3. **真内核 e2e 被隔离成单独命令**（`test:e2e:kernel`）。
   它跑完之后同一个 Playwright worker 里的下一条 spec 会在 `firstWindow` 挂 90 秒以上，
   **根因未定**（排查记录见变更历史）。隔离不降级：它照样必须绿。
4. **`rxjs` 被打进 Electron 主进程包**（`KernelRuntime` 是静态 import）。
   实测加载只要 145ms，不是性能问题，但值得改成惰性加载。
5. **`playwright.config.ts` 的两个超时被放宽过**（60→150s、30→90s）。
   隔离之后全量已回到 2.2 分钟，**这两个数字现在可能可以调回去**。
