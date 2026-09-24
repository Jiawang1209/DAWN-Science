/**
 * 坞里那段对话（2026-09-24，侧边对话）。**渲染进程自有**：挂的是哪段按「地方」记住
 * （项目 = `p:<projectId>`，远端 = `r:<connectionId>`，本机临时会话 = `t:`），key 里写明作用域。
 * 它的转录是第二个槽——后端权威，这里是缓存，与主槽同一条纪律。
 */
import { atom } from "nanostores"
import { 创建转录槽 } from "./transcript-slot.js"

export const 侧槽 = 创建转录槽()
export const $侧边会话id = atom<string | undefined>(undefined)
/** 坞里那段的运行时读不读得到主对话（`setSideSession` 回的）。缺省 = 还不知道 */
export const $侧边能读主 = atom<boolean | undefined>(undefined)
/**
 * 坞此刻按哪个「地方」挂（`载入侧边` / `挂进坞` 记下的）。**缺省 = 此刻没有地方**
 * （什么都没选、也没选项目）——坞格据此说「没处另开」，不是空白。
 *
 * 拿下时缺省用它（Task 5 审查抓的）：界面那边算「地方」要等会话摘要到手（项目单没到手时临时会话还会先算成 `p:`）——
 * 拿那个现算的值去拿下，拿不下来又不出声；这里记的是**挂上去那一刻**的地方，必定在。
 */
export const $侧边地方 = atom<string | undefined>(undefined)

/**
 * **作用域是「地方」**：一个项目（`p:<projectId>`）、一台远端连接（`r:<connectionId>`）、
 * 本机的临时会话那一组（`t:`，见 `临时地方`）各记一段——
 * 同一个地方挂的那段，换走再换回来还在；换到别处不会把这里的那段带过去。
 * 整张表（地方 → sessionId）存在**这一个键**里，不是一个地方一个键。
 */
export const SIDE_SESSION_KEY = "dawn.project.side-session"

/**
 * 本机临时会话的「地方」（2026-09-25，作者在真机上跑过之后定的：临时会话**也有地方**）。
 *
 * 作者几乎所有对话都是临时会话（侧栏「会话」那一组）。上一版（Task 6 审查 I2）说临时会话没有地方，
 * 坞格只剩一行灰字、没有「另开一段」——这个功能在他的主路上根本用不上。
 *
 * **一个共用的地方，就是「会话」那一组**，所以 `t:` 后面不带 id：
 * - 不写 `p:<临时宿主>`：「会话」那一组不是一个项目——`listTemporarySessions` 问的是两处临时根，
 *   宿主可以不止一个（还可能是占着临时根的普通项目）；按宿主记，同一组会话就被劈成几个地方；
 * - 另开一段时要走「不给路径的新建任务」（与侧栏那颗新建同一条路），不能拿宿主的目录当项目去建——
 *   那样建出来的就不是临时会话了。前缀一看就知道走哪条，不必再回头查项目单。
 * 远端的临时会话照旧按连接（`r:`）：远端的地方是那台机器。
 */
export const 临时地方 = "t:"

/**
 * 一段会话（或此刻选中的项目）落在哪个「地方」。**临时会话落在 `临时地方`**（2026-09-25 改，见那边）：
 * `SessionSummary.projectId` 是必填的——临时会话挂在它那个临时宿主项目名下，只看 projectId
 * 就会算出一个 `p:<临时宿主>`，另开一段就去那个宿主目录建了一段「项目会话」。所以要带上项目清单查 `temporary`。
 * **清单里查不到那个项目**（项目单还没取回）：照旧按 projectId 算——
 * 与分栏那条同一个取舍的反面：那边缺了就不画，这里缺了就先按正式项目挂，清单到手后自会再算一次。
 */
export function 侧边地方键(
  s: { projectId?: string | undefined; remote?: { connectionId: string } | undefined },
  projects: readonly { projectId: string; temporary?: true | undefined }[] = [],
): string | undefined {
  if (s.remote) return `r:${s.remote.connectionId}`
  if (!s.projectId) return undefined
  return projects.find((p) => p.projectId === s.projectId)?.temporary ? 临时地方 : `p:${s.projectId}`
}

/**
 * 坞格「同处」清单按地方从哪拨会话里挑（只管「是不是这一处」，归档 / 终端 / 主区 / 已挂着由调用点再筛）。
 * 远端与本机临时会话都住在 `tempSessions`，项目的住在 `sessions`（只有当前项目的）。
 */
export function 同处的会话<T extends { projectId?: string | undefined; remote?: { connectionId: string } | undefined }>(
  地方: string,
  lists: { sessions: readonly T[]; tempSessions: readonly T[] },
): T[] {
  if (地方.startsWith("r:")) return lists.tempSessions.filter((x) => x.remote?.connectionId === 地方.slice(2))
  if (地方 === 临时地方) return lists.tempSessions.filter((x) => !x.remote)
  return lists.sessions.filter((x) => !x.remote && x.projectId === 地方.slice(2))
}

/**
 * 这一段进不进得了坞。**终端（pty）不是对话**：坞格画的是 `ConversationView`，把一段终端挂进来
 * 只会得到一个假装能聊的空转录。坞格的「同处」清单、页签右键「放进坞里」、「换到主区」换下来的那段，
 * 三处都认这一条——各写一遍的话，迟早一处漏了（Task 6 审查抓的：后两处就漏了）。
 */
export function 能进坞(s: { kind?: string | undefined }): boolean {
  return s.kind !== "pty"
}

function 读表(): Record<string, string> {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(SIDE_SESSION_KEY) ?? "{}")
    if (!v || typeof v !== "object" || Array.isArray(v)) return {}
    // **只留值是字符串的那几格**：手改坏的、旧版本写的别的形状，挂上去就是拿一个非 id 去订阅
    return Object.fromEntries(Object.entries(v).filter((e): e is [string, string] => typeof e[1] === "string"))
  } catch {
    return {}
  }
}
function 写表(t: Record<string, string>): void {
  try {
    localStorage.setItem(SIDE_SESSION_KEY, JSON.stringify(t))
  } catch {
    /* 记不住只是下次要重新挂，不影响这一次 */
  }
}

/** 换了地方（或刚启动）：按表挂上那一段；表里没有就空着。**同一段不重挂**——重挂会把侧槽清空 */
export function 载入侧边(地方: string | undefined): void {
  $侧边地方.set(地方)
  const id = 地方 ? 读表()[地方] : undefined
  if (id === $侧边会话id.get()) return
  侧槽.reset()
  $侧边能读主.set(undefined)
  $侧边会话id.set(id)
}
export function 挂进坞(地方: string, sessionId: string): void {
  写表({ ...读表(), [地方]: sessionId })
  载入侧边(地方)
}
/**
 * 从坞里拿下。**地方缺省 = 挂上去时记下的那个**（`$侧边地方`）。
 * 表里那一格删不删得到，**槽与两个 atom 都照清**——坞格不许留着一段已经拿下的对话。
 */
export function 从坞拿下(地方: string | undefined = $侧边地方.get()): void {
  if (地方) {
    const t = 读表()
    delete t[地方]
    写表(t)
  }
  侧槽.reset()
  $侧边能读主.set(undefined)
  $侧边会话id.set(undefined)
}

/**
 * 删掉 / 归档了几段（或删了整个项目）：表里**所有**指向它们的那几格一并抹掉（Task 6 审查 M6）。
 * 只清此刻载着的那一处不够——别处挂着的那段留在表里，下次回到那一处就会被 `sideGone` 报成「已经不在了」，
 * 而那是人亲手删的。`地方们` 是整个没了的地方（删项目），那一格不论挂着谁都抹。
 */
export function 从坞表抹掉(ids: readonly (string | undefined)[], 地方们: readonly string[] = []): void {
  const t = 读表()
  let 动了 = false
  for (const [k, v] of Object.entries(t)) {
    if (ids.includes(v) || 地方们.includes(k)) {
      delete t[k]
      动了 = true
    }
  }
  if (动了) 写表(t)
}

/**
 * 分栏右键「放进坞里」怎么做（Task 6 审查 M7：从 App 的 JSX 里拆出来好测）。**只算，不动手**——
 * App 照着结果同步做完（挂进坞与切主区之间不许有 await，理由见那一处）。
 *
 * - 没有地方（摘要没到手 / 什么都没选）：说一句，不做；
 * - 终端：不是对话，不进坞；
 * - 放的是主区这段：主区得先切到同处另一段——**优先切到不在坞里的那段**，同处只剩坞里那段就与它对调；
 *   一段别的都没有：说一句，不做（放进去主区就空了）；
 * - 放的是别的页签：直接挂。
 */
export type 放进坞做法 =
  | { 做: "说"; 因为: "没地方" | "终端" | "只有这一段" }
  | { 做: "挂"; 地方: string; id: string; 然后主区切到?: string | undefined }
export function 放进坞的做法(a: {
  id: string
  地方: string | undefined
  主区: string
  在坞: string | undefined
  同处: readonly { sessionId: string; kind?: string | undefined }[]
}): 放进坞做法 {
  if (!a.地方) return { 做: "说", 因为: "没地方" }
  const 这段 = a.同处.find((x) => x.sessionId === a.id)
  if (这段 && !能进坞(这段)) return { 做: "说", 因为: "终端" }
  if (a.id !== a.主区) return { 做: "挂", 地方: a.地方, id: a.id }
  const 兄弟 =
    a.同处.find((x) => x.sessionId !== a.id && x.sessionId !== a.在坞) ?? a.同处.find((x) => x.sessionId === a.在坞 && x.sessionId !== a.id)
  if (!兄弟) return { 做: "说", 因为: "只有这一段" }
  return { 做: "挂", 地方: a.地方, id: a.id, 然后主区切到: 兄弟.sessionId }
}

/**
 * 坞头「换到主区」怎么做（同上，拆出来好测）。坞里那段总是上主区；主区原来那段：
 * - 是对话 → 挂进坞（两段对调）；
 * - 是终端 → 不进坞，坞空出来，并说一句（`说终端`）；
 * - 主区原来什么都没有 / 那段的摘要找不到 → 坞空出来；找不到摘要时不知道它是什么，**按对话挂**（旧行为：
 *   后端才是权威，它若真不在了 `sideGone` 会报）。
 */
export type 对调做法 =
  | { 做: "不做" }
  | { 做: "对调"; 地方: string; 上主区: string; 进坞: string | undefined; 说终端: boolean }
export function 换到主区的做法(a: {
  地方: string | undefined
  在坞: string | undefined
  原主: string | undefined
  原主那段: { kind?: string | undefined } | undefined
}): 对调做法 {
  if (!a.地方 || !a.在坞) return { 做: "不做" }
  const 原主进得了坞 = !!a.原主 && (!a.原主那段 || 能进坞(a.原主那段))
  return {
    做: "对调",
    地方: a.地方,
    上主区: a.在坞,
    进坞: 原主进得了坞 ? a.原主 : undefined,
    说终端: !!a.原主那段 && !能进坞(a.原主那段),
  }
}
