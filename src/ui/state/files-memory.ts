/**
 * 文件面板的记忆：**哪些目录展开着、选中的是哪个文件**，按「这棵树是谁的」记（2026-08-21）。
 *
 * 学自 DSH-better-sidebar 的两条（`ccb_hive_code_learn/DSH-better-sidebar-解读.md` §1.2）：
 *   - 读回来时**逐字段清洗**：坏数据退回默认，绝不让一条坏记录把面板弄白；
 *   - 写入**按键各自防抖**，内容没变（同一引用）就不写——两棵树切来切去不会互相取消对方的写。
 *
 * 此前展开状态住在每个 `DirNode` 自己的 `useState` 里，树一重挂（切项目、切远端）就全塌；
 * 而「agent 在改你的文件，你切个会话再切回来」正是最常见的动作。
 *
 * key 里声明作用域：`dawn.files.<身份>.memory`，身份 = `本机:<projectId>` / `远端:<connectionId>:<cwd>`
 * （与 `App.tsx` 的 `文件面板身份` 同一口径）。
 */

export interface FilesMemory {
  /** 展开着的目录（相对路径；根是 `""`） */
  expanded: readonly string[]
  /** 选中的文件（相对路径） */
  selected?: string | undefined
}

const KEY = (身份: string) => `dawn.files.${身份}.memory`
const 最多记几个目录 = 300
const 防抖毫秒 = 200

/**
 * 清洗：形状不对的字段各自退回默认，整条坏了就整条默认。
 * `根` 是这棵树的根路径（本机 `""`，远端是那台机器上的 cwd，绝对路径）——**根永远在展开集合里**，
 * 除非记忆里明确说它被收起了（`rootClosed`）。路径只拒 `..`（远端的是绝对路径，不能拒 `/`）。
 */
export function 清洗记忆(raw: unknown, 根 = ""): FilesMemory {
  const 默认: FilesMemory = { expanded: [根] }
  if (!raw || typeof raw !== "object") return 默认
  const o = raw as Record<string, unknown>
  const 合法 = (x: unknown): x is string => typeof x === "string" && !x.split("/").includes("..")
  const 展开 = Array.isArray(o["expanded"]) ? [...new Set(o["expanded"].filter(合法))].slice(0, 最多记几个目录) : []
  const 根收着 = o["rootClosed"] === true
  const expanded = 根收着 || 展开.includes(根) ? 展开 : [根, ...展开]
  const selected = 合法(o["selected"]) && o["selected"] ? o["selected"] : undefined
  return { expanded, ...(selected ? { selected } : {}) }
}

export function 读记忆(身份: string, 根 = "", storage: Pick<Storage, "getItem"> = localStorage): FilesMemory {
  try {
    const raw = storage.getItem(KEY(身份))
    if (!raw) return { expanded: [根] }
    return 清洗记忆(JSON.parse(raw), 根)
  } catch {
    return { expanded: [根] }
  }
}

const 待写 = new Map<string, { m: FilesMemory; 根: string; storage: Pick<Storage, "setItem">; t: ReturnType<typeof setTimeout> }>()
const 上次写的 = new Map<string, FilesMemory>()

function 真写(身份: string, m: FilesMemory, 根: string, storage: Pick<Storage, "setItem">): void {
  try {
    storage.setItem(
      KEY(身份),
      JSON.stringify({
        expanded: m.expanded.slice(0, 最多记几个目录),
        // 根被人收起来了要记住，不然下次读回来又给它展开
        ...(m.expanded.includes(根) ? {} : { rootClosed: true }),
        ...(m.selected ? { selected: m.selected } : {}),
      }),
    )
  } catch (e) {
    console.error(`[文件面板] 记不住 ${身份} 的展开状态，这次仍然生效：`, e)
  }
}

/** 防抖写；同一引用不写。**写不进去只记一条错**，这次展开照样生效 */
export function 记记忆(身份: string, m: FilesMemory, 根 = "", storage: Pick<Storage, "setItem"> = localStorage): void {
  if (上次写的.get(身份) === m) return
  上次写的.set(身份, m)
  const 旧 = 待写.get(身份)
  if (旧) clearTimeout(旧.t)
  const t = setTimeout(() => {
    待写.delete(身份)
    真写(身份, m, 根, storage)
  }, 防抖毫秒)
  待写.set(身份, { m, 根, storage, t })
}

/** 把所有待写的立刻写掉（窗口要关了、测试要断言时） */
export function 立刻写完(): void {
  for (const [身份, { m, 根, storage, t }] of 待写) {
    clearTimeout(t)
    真写(身份, m, 根, storage)
  }
  待写.clear()
}
