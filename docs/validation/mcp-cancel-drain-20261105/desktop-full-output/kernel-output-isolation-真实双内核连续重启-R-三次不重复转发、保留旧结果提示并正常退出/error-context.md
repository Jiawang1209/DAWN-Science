# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: kernel-output-isolation.spec.ts >> 真实双内核连续重启 R 三次不重复转发、保留旧结果提示并正常退出
- Location: e2e/kernel-output-isolation.spec.ts:10:1

# Error details

```
TypeError: Cannot read properties of undefined (reading '_object')
```

# Test source

```ts
  740 |          * P3 合成。**这不是应用的问题，是采集环境的问题**，所以修在这里，
  741 |          * 而不是靠调大容差把真实的颜色漂移一起放过去。
  742 |          */
  743 |         "--force-color-profile=srgb",
  744 |       ],
  745 |       env: {
  746 |         ...process.env,
  747 |         /**
  748 |          * 用例自己要加的环境变量（A2，2026-08-16）。
  749 |          *
  750 |          * **放在最前面**，好让下面那些隔离用的（`DAWN_CONFIG` 等）
  751 |          * 覆盖它——**隔离不容协商**：一条用例不该有办法把自己指回
  752 |          * 开发机真实的配置与数据库。
  753 |          */
  754 |         ...(dawnOptions.env ?? {}),
  755 |         // **不写 DAWN_CONFIG 指向已有文件**：第一次启动应当自己写出默认配置。
  756 |         // 这条路径正是「装好了打不开」那个缺陷的所在，必须被真的走一遍
  757 |         DAWN_CONFIG: configPath,
  758 |         DAWN_FAKE_OPENALEX: openalex?.url ?? "",
  759 |         DAWN_FAKE_SCIENCE: science?.url ?? "",
  760 |         DAWN_FAKE_CROSSREF: crossref?.url ?? "",
  761 |         DAWN_DB: dbPath,
  762 |         DAWN_DEFAULT_WORKSPACE: workspace,
  763 |         // 给模型基底时一并跳过凭证守卫(审查 debug G7:拆成独立开关后,e2e 要显式带上它,
  764 |         // 保持「有模型基底 = 跳守卫」这条既有行为一字不差)
  765 |         ...(dawnOptions.noModelsBase ? {} : { DAWN_MODELS_JSON: modelsPath, DAWN_SKIP_CREDENTIAL_GATE: "1" }),
  766 |         // **外部 CLI 的配置也要隔离**：不指的话会去读开发机真实的 ~/.codex，
  767 |         // 那正是这份文件开头明令禁止的暗管道（2026-08-09 加模型自动发现时捅的洞）
  768 |         DAWN_CLI_HOME: join(dir, "cli-home"),
  769 |         // **全局技能目录也要隔离**（2026-08-21 才发现一直指着开发机真实的 ~/DAWN/skills）
  770 |         DAWN_SKILLS_DIR: join(dir, "skills"),
  771 |         DAWN_MEMORIES_DIR: join(dir, "memories"),
  772 |         DAWN_AGENTS_DIR: join(dir, "agents"),
  773 |         /**
  774 |          * **临时会话的目录根也要隔离**（2026-08-11）——
  775 |          * 不隔离的话，跑一次 e2e 就往开发机的 `~/DAWN/scratch` 里建一串目录。
  776 |          * 与上面几条是同一条理由：测试不该有副作用溢出到测试之外。
  777 |          */
  778 |         DAWN_SCRATCH_ROOT: join(dir, "scratch"),
  779 |         /**
  780 |          * **下载落在隔离目录里**（批 4a，2026-08-17）。
  781 |          * 不指的话，e2e 会往开发者真实的 `~/Downloads` 里堆文件——
  782 |          * 一个会在别人机器上留垃圾的测试，比没有这条测试更坏。
  783 |          */
  784 |         DAWN_DOWNLOADS: join(dir, "downloads"),
  785 |         /**
  786 |          * **内核搜索路径也要隔离**，理由与上一条完全一样，只是后果更难看：
  787 |          * 内核列表随机器而变，进了视觉基线就等于
  788 |          * ① 基线在别的机器上必然红，② **把开发者的个人路径以图片形式提交进仓库**。
  789 |          * 这里指向夹具里那一份固定的 kernelspec（见下面的 `seedKernelSpec`）。
  790 |          */
  791 |         ...(dawnOptions.realKernels
  792 |           ? {}
  793 |           : { DAWN_JUPYTER_ROOTS: join(dir, "jupyter", "kernels") }),
  794 |         ...(dawnOptions.fakeSsh ? { DAWN_FAKE_SSH: "1" } : {}),
  795 |         ...(dawnOptions.fakeSshPython ? { DAWN_FAKE_SSH_PYTHON: dawnOptions.fakeSshPython } : {}),
  796 |         ...(dawnOptions.fakeSshR ? { DAWN_FAKE_SSH_R: dawnOptions.fakeSshR } : {}),
  797 |         ...(weixin ? { DAWN_FAKE_ILINK: weixin.url } : {}),
  798 |         ...(feishu ? { DAWN_FAKE_FEISHU: feishu.url } : {}),
  799 |         // 假发布源 + 假安装器（准入规则 1：与 dev:mock 共用同一份假的）
  800 |         ...(发布源 ? { DAWN_UPDATE_FEED: 发布源.url, DAWN_FAKE_UPDATE_INSTALL: "1" } : {}),
  801 |         /**
  802 |          * **测试不把窗口弹出来**（2026-08-11，作者提）。
  803 |          *
  804 |          * 作者：*「每次测试都要弹出来，导致我什么都干不了。」*
  805 |          * 一套要跑四分钟、期间抢走十几次焦点的测试，
  806 |          * **代价会转嫁成「那就少跑几次」**——而那正是三条准入规则最怕的结局。
  807 |          *
  808 |          * `DAWN_SHOW_WINDOW=1` 可以要回来：真要盯着看它点什么的时候有用。
  809 |          */
  810 |         ...(process.env["DAWN_SHOW_WINDOW"] === "1" ? {} : { DAWN_HIDE_WINDOW: "1" }),
  811 |         ...(dawnOptions.leaseTtlSeconds
  812 |           ? { DAWN_LEASE_TTL: String(dawnOptions.leaseTtlSeconds) }
  813 |           : {}),
  814 |         ...(dawnOptions.compactKeepRecentTokens
  815 |           ? { DAWN_COMPACT_KEEP_RECENT_TOKENS: String(dawnOptions.compactKeepRecentTokens) }
  816 |           : {}),
  817 |         /**
  818 |          * 原生目录选择器返回什么（T3-b）。**它是系统模态框，Playwright 驱动不了**。
  819 |          * 给了这个值，用例就能走「点按钮 → 选文件夹」那条**真正的路**，
  820 |          * 而不是绕过界面直接打 IPC——后者验的是后端，不是接线。
  821 |          */
  822 |         /**
  823 |          * **e2e 里不真的去开系统浏览器**（2026-08-18）。
  824 |          * 不给这个，点一个外链就会往作者脸上弹一个浏览器标签页——
  825 |          * 与 `show: false` 是同一个理由：会让人少跑测试。
  826 |          */
  827 |         DAWN_NO_EXTERNAL: "1",
  828 |         /**
  829 |          * **e2e 里不弹真的系统通知**（桌面通知，2026-09-27）：弹了就是往作者屏幕右上角塞一串横幅。
  830 |          * 假出口把每一条记进主进程 `globalThis.__dawn桌面通知`，用例用下面的 `读桌面通知` / `点桌面通知` 读、点。
  831 |          */
  832 |         DAWN_FAKE_NOTIFY: "1",
  833 |         ...(dawnOptions.pickDirectory ? { DAWN_PICK_DIRECTORY: dawnOptions.pickDirectory } : {}),
  834 |         ...(dawnOptions.pickFiles ? { DAWN_PICK_FILES: dawnOptions.pickFiles.join(",") } : {}),
  835 |       },
  836 |     })
  837 | 
  838 |     let app!: ElectronApplication
  839 |     const 关掉并检查 = async () => {
> 840 |       const proc = app.process()
      |                        ^ TypeError: Cannot read properties of undefined (reading '_object')
  841 |       await app.close()
  842 |       expect(proc.signalCode, "Electron 退出时收到信号；检查主进程日志和系统崩溃报告").toBeNull()
  843 |       expect(proc.exitCode, "Electron 必须正常退出，不能把原生崩溃记为通过").toBe(0)
  844 |     }
  845 |     try {
  846 |     app = await 起一次()
  847 |     /**
  848 |      * 等第一个窗口。**30 秒是原值，2026-08-10 调回。**
  849 |      *
  850 |      * 中途一度提到 90 秒，为的是绕开三次间歇红——后来查清根因是
  851 |      * 真内核那条 e2e 会拖垮同一个 worker 里的下一条（已隔离，见
  852 |      * `e2e/kernel-session.spec.ts`）。实测单独连启 5 次，每次稳定 1.0 秒；
  853 |      * **30 秒仍有 30 倍余量**。
  854 |      */
  855 |     /**
  856 |      * **主进程说的话要能被看见**（2026-08-11）。
  857 |      *
  858 |      * 此前只转发了渲染进程的 console。于是主进程里的
  859 |      * 「[启动失败] …」「[workbench] … 失败」这类消息**一个字都到不了终端**——
  860 |      * 而 `firstWindow` 挂起那笔账查了十几次，每次卡住的正是这里：
  861 |      * 一个 30 秒的超时，没有任何线索说它到底在等什么。
  862 |      */
  863 |     app.process().stderr?.on("data", (b: Buffer) => {
  864 |       const 文本 = b.toString().trimEnd()
  865 |       if (文本) console.error("[主进程]", 文本)
  866 |     })
  867 | 
  868 |     const 接线 = (p: Page) => {
  869 |       // 渲染进程的报错要能被看见——这条通路本身就是 2026-08-08 补的
  870 |       p.on("console", (m) => {
  871 |         if (m.type() === "error") console.error("[渲染进程]", m.text())
  872 |       })
  873 |       return p
  874 |     }
  875 | 
  876 |     /**
  877 |      * **把界面语言钉在中文**（2026-08-13）。
  878 |      *
  879 |      * 产品的默认是**英文**（作者定的）。而这套用例里有五百多处
  880 |      * 「按名字找按钮」，全是中文名——不钉住的话它们会一次性全红，
  881 |      * **而红成一片就没人看得出哪条是真问题**。
  882 |      *
  883 |      * 这不是一条后门：它写的就是应用自己在人点「中文」时写的那一格
  884 |      * （`localStorage["dawn.global.lang"]`），键名与值都取自 `i18n/index.ts`。
  885 |      *
  886 |      * **英文那一面另有专门的用例盯着**（`i18n.spec.ts`）：
  887 |      * 走一遍主路径，断言该出现的英文都在、且屏幕上一个汉字都没有。
  888 |      * 这里钉中文，是为了让「别的东西坏没坏」这个问题仍然答得出来。
  889 |      */
  890 |     const 钉住中文 = async (p: Page) => {
  891 |       await p.addInitScript((showSetup: boolean) => {
  892 |         try {
  893 |           localStorage.setItem("dawn.global.lang", "zh")
  894 |           // 首启向导默认按「已跳过」（理由见 `showSetup` 的注释）
  895 |           if (!showSetup) {
  896 |             localStorage.setItem("dawn.global.setupSkipped", "1")
  897 |             localStorage.setItem("dawn.global.onboardingDone", "1")
  898 |           }
  899 |         } catch {
  900 |           /* 存不进去就算了：那时整个应用都会退回默认，用例自然会红 */
  901 |         }
  902 |       }, Boolean(dawnOptions.showSetup))
  903 |       // `addInitScript` 只对之后的导航生效，首帧已经画过了，所以要重来一次
  904 |       await p.reload()
  905 |     }
  906 | 
  907 |     let page = 接线(await app.firstWindow())
  908 |     await 钉住中文(page)
  909 | 
  910 |     /**
  911 |      * **关掉再打开**（会话续接的 e2e 要用，2026-08-11）。
  912 |      *
  913 |      * *「之前聊过的，也无法连续上」*这句话，只有真重启一次才验得了：
  914 |      * 在同一个进程里点来点去，永远碰不到「agent 没了、对话只在内存里」那一刻。
  915 |      */
  916 |     const 重开 = async (): Promise<Page> => {
  917 |       await 关掉并检查()
  918 |       app = await 起一次()
  919 |       app.process().stderr?.on("data", (b: Buffer) => {
  920 |         const 文本 = b.toString().trimEnd()
  921 |         if (文本) console.error("[主进程]", 文本)
  922 |       })
  923 |       page = 接线(await app.firstWindow())
  924 |       await 钉住中文(page)
  925 |       return page
  926 |     }
  927 | 
  928 |     await use({
  929 |       app,
  930 |       page,
  931 |       dir,
  932 |       dbPath,
  933 |       workspace,
  934 |       requests: server.requests,
  935 |       keyChecks: server.keyChecks,
  936 |       mockUrl: server.url,
  937 |       ...(openalex ? { openalex } : {}),
  938 |       ...(crossref ? { crossref } : {}),
  939 |       ...(science ? { science } : {}),
  940 |       ...(weixin ? { weixin } : {}),
```