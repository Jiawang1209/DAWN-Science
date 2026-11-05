# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: terminal-images.spec.ts >> output pictures >> renders verified image files returned by the Agent and opens their full preview
- Location: e2e/terminal-images.spec.ts:82:3

# Error details

```
TimeoutError: electronApplication.firstWindow: Timeout 30000ms exceeded while waiting for event "window"
```

# Test source

```ts
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
  838 |     let app = await 起一次()
  839 |     /**
  840 |      * 等第一个窗口。**30 秒是原值，2026-08-10 调回。**
  841 |      *
  842 |      * 中途一度提到 90 秒，为的是绕开三次间歇红——后来查清根因是
  843 |      * 真内核那条 e2e 会拖垮同一个 worker 里的下一条（已隔离，见
  844 |      * `e2e/kernel-session.spec.ts`）。实测单独连启 5 次，每次稳定 1.0 秒；
  845 |      * **30 秒仍有 30 倍余量**。
  846 |      */
  847 |     /**
  848 |      * **主进程说的话要能被看见**（2026-08-11）。
  849 |      *
  850 |      * 此前只转发了渲染进程的 console。于是主进程里的
  851 |      * 「[启动失败] …」「[workbench] … 失败」这类消息**一个字都到不了终端**——
  852 |      * 而 `firstWindow` 挂起那笔账查了十几次，每次卡住的正是这里：
  853 |      * 一个 30 秒的超时，没有任何线索说它到底在等什么。
  854 |      */
  855 |     app.process().stderr?.on("data", (b: Buffer) => {
  856 |       const 文本 = b.toString().trimEnd()
  857 |       if (文本) console.error("[主进程]", 文本)
  858 |     })
  859 | 
  860 |     const 接线 = (p: Page) => {
  861 |       // 渲染进程的报错要能被看见——这条通路本身就是 2026-08-08 补的
  862 |       p.on("console", (m) => {
  863 |         if (m.type() === "error") console.error("[渲染进程]", m.text())
  864 |       })
  865 |       return p
  866 |     }
  867 | 
  868 |     /**
  869 |      * **把界面语言钉在中文**（2026-08-13）。
  870 |      *
  871 |      * 产品的默认是**英文**（作者定的）。而这套用例里有五百多处
  872 |      * 「按名字找按钮」，全是中文名——不钉住的话它们会一次性全红，
  873 |      * **而红成一片就没人看得出哪条是真问题**。
  874 |      *
  875 |      * 这不是一条后门：它写的就是应用自己在人点「中文」时写的那一格
  876 |      * （`localStorage["dawn.global.lang"]`），键名与值都取自 `i18n/index.ts`。
  877 |      *
  878 |      * **英文那一面另有专门的用例盯着**（`i18n.spec.ts`）：
  879 |      * 走一遍主路径，断言该出现的英文都在、且屏幕上一个汉字都没有。
  880 |      * 这里钉中文，是为了让「别的东西坏没坏」这个问题仍然答得出来。
  881 |      */
  882 |     const 钉住中文 = async (p: Page) => {
  883 |       await p.addInitScript((showSetup: boolean) => {
  884 |         try {
  885 |           localStorage.setItem("dawn.global.lang", "zh")
  886 |           // 首启向导默认按「已跳过」（理由见 `showSetup` 的注释）
  887 |           if (!showSetup) {
  888 |             localStorage.setItem("dawn.global.setupSkipped", "1")
  889 |             localStorage.setItem("dawn.global.onboardingDone", "1")
  890 |           }
  891 |         } catch {
  892 |           /* 存不进去就算了：那时整个应用都会退回默认，用例自然会红 */
  893 |         }
  894 |       }, Boolean(dawnOptions.showSetup))
  895 |       // `addInitScript` 只对之后的导航生效，首帧已经画过了，所以要重来一次
  896 |       await p.reload()
  897 |     }
  898 | 
> 899 |     let page = 接线(await app.firstWindow())
      |                             ^ TimeoutError: electronApplication.firstWindow: Timeout 30000ms exceeded while waiting for event "window"
  900 |     await 钉住中文(page)
  901 | 
  902 |     /**
  903 |      * **关掉再打开**（会话续接的 e2e 要用，2026-08-11）。
  904 |      *
  905 |      * *「之前聊过的，也无法连续上」*这句话，只有真重启一次才验得了：
  906 |      * 在同一个进程里点来点去，永远碰不到「agent 没了、对话只在内存里」那一刻。
  907 |      */
  908 |     const 重开 = async (): Promise<Page> => {
  909 |       await app.close().catch(() => {})
  910 |       app = await 起一次()
  911 |       app.process().stderr?.on("data", (b: Buffer) => {
  912 |         const 文本 = b.toString().trimEnd()
  913 |         if (文本) console.error("[主进程]", 文本)
  914 |       })
  915 |       page = 接线(await app.firstWindow())
  916 |       await 钉住中文(page)
  917 |       return page
  918 |     }
  919 | 
  920 |     await use({
  921 |       app,
  922 |       page,
  923 |       dir,
  924 |       dbPath,
  925 |       workspace,
  926 |       requests: server.requests,
  927 |       keyChecks: server.keyChecks,
  928 |       mockUrl: server.url,
  929 |       ...(openalex ? { openalex } : {}),
  930 |       ...(crossref ? { crossref } : {}),
  931 |       ...(science ? { science } : {}),
  932 |       ...(weixin ? { weixin } : {}),
  933 |       ...(feishu ? { feishu } : {}),
  934 |       ...(发布源 ? { 发布源 } : {}),
  935 |       重开,
  936 |     })
  937 | 
  938 |     /**
  939 |      * **关不掉要出声。** 上一版是 `.catch(() => {})`——静默吞掉。
  940 |      * 2026-08-10 追一个「下一条用例启动挂住」的 bug 时才发现：
  941 |      * 真出问题时这里一个字都不说，线索直接没了。
  942 |      * 吞掉异常仍然是对的（一条用例的收尾失败不该让它变红），**但不能不吭声**。
  943 |      */
  944 |     await app.close().catch((err: unknown) => {
  945 |       console.error("[e2e] Electron 关不掉：", err instanceof Error ? err.message : String(err))
  946 |     })
  947 |     await server.close()
  948 |     await openalex?.close()
  949 |     await science?.close()
  950 |     await crossref?.close()
  951 |     await weixin?.close()
  952 |     await feishu?.close()
  953 |     await 发布源?.close()
  954 |     rmSync(dir, { recursive: true, force: true })
  955 |   },
  956 | })
  957 | 
  958 | export { expect } from "@playwright/test"
  959 | 
  960 | /** 假出口记下的一条（桌面通知，2026-09-27）。标题 / 正文是已经按语言译好的字 */
  961 | export interface 桌面通知记录 {
  962 |   kind: "done" | "error" | "permission" | "schedule" | "test"
  963 |   sessionId?: string
  964 |   title: string
  965 |   body: string
  966 | }
  967 | type 假通知台 = { 发过: 桌面通知记录[]; 角标: number; 点(i: number): void; 设前台(v: boolean | undefined): void }
  968 | 
  969 | export async function 读桌面通知(app: ElectronApplication): Promise<桌面通知记录[]> {
  970 |   return app.evaluate(() => (globalThis as unknown as { __dawn桌面通知: 假通知台 }).__dawn桌面通知.发过.map((x) => ({ ...x })))
  971 | }
  972 | export async function 桌面角标(app: ElectronApplication): Promise<number> {
  973 |   return app.evaluate(() => (globalThis as unknown as { __dawn桌面通知: 假通知台 }).__dawn桌面通知.角标)
  974 | }
  975 | /** 点第 i 条：走的是与真通知 click 同一个 `点了` */
  976 | export async function 点桌面通知(app: ElectronApplication, i: number): Promise<void> {
  977 |   await app.evaluate((_electron, n) => (globalThis as unknown as { __dawn桌面通知: 假通知台 }).__dawn桌面通知.点(n), i)
  978 | }
  979 | /** 拨「窗口在不在前台」。`undefined` = 交还给真窗口（e2e 里它永远藏着 = 不在前台） */
  980 | export async function 设前台(app: ElectronApplication, v: boolean | undefined): Promise<void> {
  981 |   await app.evaluate((_electron, x) => (globalThis as unknown as { __dawn桌面通知: 假通知台 }).__dawn桌面通知.设前台(x), v)
  982 | }
  983 | 
  984 | /** 读数据库验证副作用。**界面说发生了，账本上也得有** */
  985 | export async function readRuns(dbPath: string): Promise<Record<string, unknown>[]> {
  986 |   const { default: Database } = await import("better-sqlite3")
  987 |   const db = new Database(dbPath, { readonly: true })
  988 |   try {
  989 |     /**
  990 |      * **把 `has_error` 与 `terminal_reason` 也取出来**（2026-08-11）。
  991 |      *
  992 |      * 「跑挂的代码有没有被如实记成失败」正要看这两列——
  993 |      * 少取一列，用例就只能验到 `status`，而 `status=failed` 却
  994 |      * `has_error=0` 这种**自相矛盾的行**照样会溜过去。
  995 |      */
  996 |     return db
  997 |       .prepare(
  998 |         /**
  999 |          * **`id` 与 `parent_run_id` 也要取**（B1，2026-08-17）。
```