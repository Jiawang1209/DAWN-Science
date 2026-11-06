# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: subagent-steering.spec.ts >> live child correction shows accepted then applied at a real tool boundary, and named stop drains pending correction
- Location: e2e/subagent-steering.spec.ts:6:1

# Error details

```
Error: expect(locator).toContainText(expected) failed

Locator: locator('.subagent-pane').locator('.subagent-live-control [role="status"]')
Expected substring: "子任务已结束并排空"
Received string:    "停止中，等待工具排空"

Call log:
  - Expect "toContainText" with timeout 25000ms
  - waiting for locator('.subagent-pane').locator('.subagent-live-control [role="status"]')
    5 × locator resolved to <p class="hint" role="status">停止中，等待工具排空</p>
      - unexpected value "停止中，等待工具排空"
  - Target page, context or browser has been closed

```

```yaml
- status: 停止中，等待工具排空
```

```
Error: Electron 必须正常退出，不能把原生崩溃记为通过

expect(received).toBe(expected) // Object.is equality

Expected: 0
Received: null
```

# Test source

```ts
  749 |          * 用例自己要加的环境变量（A2，2026-08-16）。
  750 |          *
  751 |          * **放在最前面**，好让下面那些隔离用的（`DAWN_CONFIG` 等）
  752 |          * 覆盖它——**隔离不容协商**：一条用例不该有办法把自己指回
  753 |          * 开发机真实的配置与数据库。
  754 |          */
  755 |         ...(dawnOptions.env ?? {}),
  756 |         // **不写 DAWN_CONFIG 指向已有文件**：第一次启动应当自己写出默认配置。
  757 |         // 这条路径正是「装好了打不开」那个缺陷的所在，必须被真的走一遍
  758 |         DAWN_CONFIG: configPath,
  759 |         DAWN_FAKE_OPENALEX: openalex?.url ?? "",
  760 |         DAWN_FAKE_SCIENCE: science?.url ?? "",
  761 |         DAWN_FAKE_CROSSREF: crossref?.url ?? "",
  762 |         DAWN_DB: dbPath,
  763 |         DAWN_DEFAULT_WORKSPACE: workspace,
  764 |         // 给模型基底时一并跳过凭证守卫(审查 debug G7:拆成独立开关后,e2e 要显式带上它,
  765 |         // 保持「有模型基底 = 跳守卫」这条既有行为一字不差)
  766 |         ...(dawnOptions.noModelsBase ? {} : { DAWN_MODELS_JSON: modelsPath, DAWN_SKIP_CREDENTIAL_GATE: "1" }),
  767 |         // **外部 CLI 的配置也要隔离**：不指的话会去读开发机真实的 ~/.codex，
  768 |         // 那正是这份文件开头明令禁止的暗管道（2026-08-09 加模型自动发现时捅的洞）
  769 |         DAWN_CLI_HOME: join(dir, "cli-home"),
  770 |         // **全局技能目录也要隔离**（2026-08-21 才发现一直指着开发机真实的 ~/DAWN/skills）
  771 |         DAWN_SKILLS_DIR: join(dir, "skills"),
  772 |         DAWN_MEMORIES_DIR: join(dir, "memories"),
  773 |         DAWN_AGENTS_DIR: join(dir, "agents"),
  774 |         /**
  775 |          * **临时会话的目录根也要隔离**（2026-08-11）——
  776 |          * 不隔离的话，跑一次 e2e 就往开发机的 `~/DAWN/scratch` 里建一串目录。
  777 |          * 与上面几条是同一条理由：测试不该有副作用溢出到测试之外。
  778 |          */
  779 |         DAWN_SCRATCH_ROOT: join(dir, "scratch"),
  780 |         /**
  781 |          * **下载落在隔离目录里**（批 4a，2026-08-17）。
  782 |          * 不指的话，e2e 会往开发者真实的 `~/Downloads` 里堆文件——
  783 |          * 一个会在别人机器上留垃圾的测试，比没有这条测试更坏。
  784 |          */
  785 |         DAWN_DOWNLOADS: join(dir, "downloads"),
  786 |         /**
  787 |          * **内核搜索路径也要隔离**，理由与上一条完全一样，只是后果更难看：
  788 |          * 内核列表随机器而变，进了视觉基线就等于
  789 |          * ① 基线在别的机器上必然红，② **把开发者的个人路径以图片形式提交进仓库**。
  790 |          * 这里指向夹具里那一份固定的 kernelspec（见下面的 `seedKernelSpec`）。
  791 |          */
  792 |         ...(dawnOptions.realKernels
  793 |           ? {}
  794 |           : { DAWN_JUPYTER_ROOTS: join(dir, "jupyter", "kernels") }),
  795 |         ...(dawnOptions.fakeSsh ? { DAWN_FAKE_SSH: "1" } : {}),
  796 |         ...(dawnOptions.fakeSshPython ? { DAWN_FAKE_SSH_PYTHON: dawnOptions.fakeSshPython } : {}),
  797 |         ...(dawnOptions.fakeSshR ? { DAWN_FAKE_SSH_R: dawnOptions.fakeSshR } : {}),
  798 |         ...(weixin ? { DAWN_FAKE_ILINK: weixin.url } : {}),
  799 |         ...(feishu ? { DAWN_FAKE_FEISHU: feishu.url } : {}),
  800 |         // 假发布源 + 假安装器（准入规则 1：与 dev:mock 共用同一份假的）
  801 |         ...(发布源 ? { DAWN_UPDATE_FEED: 发布源.url, DAWN_FAKE_UPDATE_INSTALL: "1" } : {}),
  802 |         /**
  803 |          * **测试不把窗口弹出来**（2026-08-11，作者提）。
  804 |          *
  805 |          * 作者：*「每次测试都要弹出来，导致我什么都干不了。」*
  806 |          * 一套要跑四分钟、期间抢走十几次焦点的测试，
  807 |          * **代价会转嫁成「那就少跑几次」**——而那正是三条准入规则最怕的结局。
  808 |          *
  809 |          * `DAWN_SHOW_WINDOW=1` 可以要回来：真要盯着看它点什么的时候有用。
  810 |          */
  811 |         ...(process.env["DAWN_SHOW_WINDOW"] === "1" ? {} : { DAWN_HIDE_WINDOW: "1" }),
  812 |         ...(dawnOptions.leaseTtlSeconds
  813 |           ? { DAWN_LEASE_TTL: String(dawnOptions.leaseTtlSeconds) }
  814 |           : {}),
  815 |         ...(dawnOptions.compactKeepRecentTokens
  816 |           ? { DAWN_COMPACT_KEEP_RECENT_TOKENS: String(dawnOptions.compactKeepRecentTokens) }
  817 |           : {}),
  818 |         /**
  819 |          * 原生目录选择器返回什么（T3-b）。**它是系统模态框，Playwright 驱动不了**。
  820 |          * 给了这个值，用例就能走「点按钮 → 选文件夹」那条**真正的路**，
  821 |          * 而不是绕过界面直接打 IPC——后者验的是后端，不是接线。
  822 |          */
  823 |         /**
  824 |          * **e2e 里不真的去开系统浏览器**（2026-08-18）。
  825 |          * 不给这个，点一个外链就会往作者脸上弹一个浏览器标签页——
  826 |          * 与 `show: false` 是同一个理由：会让人少跑测试。
  827 |          */
  828 |         DAWN_NO_EXTERNAL: "1",
  829 |         /**
  830 |          * **e2e 里不弹真的系统通知**（桌面通知，2026-09-27）：弹了就是往作者屏幕右上角塞一串横幅。
  831 |          * 假出口把每一条记进主进程 `globalThis.__dawn桌面通知`，用例用下面的 `读桌面通知` / `点桌面通知` 读、点。
  832 |          */
  833 |         DAWN_FAKE_NOTIFY: "1",
  834 |         ...(dawnOptions.pickDirectory ? { DAWN_PICK_DIRECTORY: dawnOptions.pickDirectory } : {}),
  835 |         ...(dawnOptions.pickFiles ? { DAWN_PICK_FILES: dawnOptions.pickFiles.join(",") } : {}),
  836 |       },
  837 |     })
  838 |
  839 |     let app!: ElectronApplication
  840 |     let appProcess!: ReturnType<ElectronApplication['process']>
  841 |     let exitDiagnostics: Awaited<ReturnType<typeof observeElectronExit>> | undefined
  842 |     const 关掉并检查 = async () => {
  843 |       // Tests may close the application themselves; Playwright then disposes its
  844 |       // process channel. Retain the original child for the same strict exit check.
  845 |       const proc = appProcess
  846 |       exitDiagnostics?.beginClose()
  847 |       await app.close()
  848 |       expect(proc.signalCode, "Electron 退出时收到信号；检查主进程日志和系统崩溃报告").toBeNull()
> 849 |       expect(proc.exitCode, "Electron 必须正常退出，不能把原生崩溃记为通过").toBe(0)
      |                                                            ^ Error: Electron 必须正常退出，不能把原生崩溃记为通过
  850 |     }
  851 |     try {
  852 |     app = await 起一次()
  853 |     appProcess = app.process()
  854 |     exitDiagnostics = await observeElectronExit(app,testInfo.outputPath('electron-exit'))
  855 |     /**
  856 |      * 等第一个窗口。**30 秒是原值，2026-08-10 调回。**
  857 |      *
  858 |      * 中途一度提到 90 秒，为的是绕开三次间歇红——后来查清根因是
  859 |      * 真内核那条 e2e 会拖垮同一个 worker 里的下一条（已隔离，见
  860 |      * `e2e/kernel-session.spec.ts`）。实测单独连启 5 次，每次稳定 1.0 秒；
  861 |      * **30 秒仍有 30 倍余量**。
  862 |      */
  863 |     /**
  864 |      * **主进程说的话要能被看见**（2026-08-11）。
  865 |      *
  866 |      * 此前只转发了渲染进程的 console。于是主进程里的
  867 |      * 「[启动失败] …」「[workbench] … 失败」这类消息**一个字都到不了终端**——
  868 |      * 而 `firstWindow` 挂起那笔账查了十几次，每次卡住的正是这里：
  869 |      * 一个 30 秒的超时，没有任何线索说它到底在等什么。
  870 |      */
  871 |     app.process().stderr?.on("data", (b: Buffer) => {
  872 |       const 文本 = b.toString().trimEnd()
  873 |       if (文本) console.error("[主进程]", 文本)
  874 |     })
  875 |
  876 |     const 接线 = (p: Page) => {
  877 |       // 渲染进程的报错要能被看见——这条通路本身就是 2026-08-08 补的
  878 |       p.on("console", (m) => {
  879 |         if (m.type() === "error") console.error("[渲染进程]", m.text())
  880 |       })
  881 |       return p
  882 |     }
  883 |
  884 |     /**
  885 |      * **把界面语言钉在中文**（2026-08-13）。
  886 |      *
  887 |      * 产品的默认是**英文**（作者定的）。而这套用例里有五百多处
  888 |      * 「按名字找按钮」，全是中文名——不钉住的话它们会一次性全红，
  889 |      * **而红成一片就没人看得出哪条是真问题**。
  890 |      *
  891 |      * 这不是一条后门：它写的就是应用自己在人点「中文」时写的那一格
  892 |      * （`localStorage["dawn.global.lang"]`），键名与值都取自 `i18n/index.ts`。
  893 |      *
  894 |      * **英文那一面另有专门的用例盯着**（`i18n.spec.ts`）：
  895 |      * 走一遍主路径，断言该出现的英文都在、且屏幕上一个汉字都没有。
  896 |      * 这里钉中文，是为了让「别的东西坏没坏」这个问题仍然答得出来。
  897 |      */
  898 |     const 钉住中文 = async (p: Page) => {
  899 |       await p.addInitScript((showSetup: boolean) => {
  900 |         try {
  901 |           localStorage.setItem("dawn.global.lang", "zh")
  902 |           // 首启向导默认按「已跳过」（理由见 `showSetup` 的注释）
  903 |           if (!showSetup) {
  904 |             localStorage.setItem("dawn.global.setupSkipped", "1")
  905 |             localStorage.setItem("dawn.global.onboardingDone", "1")
  906 |           }
  907 |         } catch {
  908 |           /* 存不进去就算了：那时整个应用都会退回默认，用例自然会红 */
  909 |         }
  910 |       }, Boolean(dawnOptions.showSetup))
  911 |       // `addInitScript` 只对之后的导航生效，首帧已经画过了，所以要重来一次
  912 |       await p.reload()
  913 |     }
  914 |
  915 |     let page = 接线(await app.firstWindow())
  916 |     await 钉住中文(page)
  917 |     await exitDiagnostics?.appReady()
  918 |
  919 |     /**
  920 |      * **关掉再打开**（会话续接的 e2e 要用，2026-08-11）。
  921 |      *
  922 |      * *「之前聊过的，也无法连续上」*这句话，只有真重启一次才验得了：
  923 |      * 在同一个进程里点来点去，永远碰不到「agent 没了、对话只在内存里」那一刻。
  924 |      */
  925 |     const 重开 = async (): Promise<Page> => {
  926 |       await 关掉并检查()
  927 |       app = await 起一次()
  928 |       appProcess = app.process()
  929 |       exitDiagnostics = await observeElectronExit(app,testInfo.outputPath('electron-exit'))
  930 |       app.process().stderr?.on("data", (b: Buffer) => {
  931 |         const 文本 = b.toString().trimEnd()
  932 |         if (文本) console.error("[主进程]", 文本)
  933 |       })
  934 |       page = 接线(await app.firstWindow())
  935 |       await 钉住中文(page)
  936 |       await exitDiagnostics?.appReady()
  937 |       return page
  938 |     }
  939 |
  940 |     await use({
  941 |       app,
  942 |       page,
  943 |       dir,
  944 |       dbPath,
  945 |       workspace,
  946 |       requests: server.requests,
  947 |       keyChecks: server.keyChecks,
  948 |       mockUrl: server.url,
  949 |       ...(openalex ? { openalex } : {}),
```