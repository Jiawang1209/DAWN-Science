/**
 * 右边那一列的一条规则（规格 `2026-09-16-设置右栏`）：
 *
 * > **设置活着的时候，右边那一列归设置；设置一关，上一位房客回来。**
 *
 * 作者原话：*「如果右边有面板的话，那么恢复之后是有面板的；
 * 如果右边没有面板的话，那么恢复之后就没面板。」*
 *
 * ## Round 2（code review：CHANGES REQUESTED，两个 Critical）
 *
 * C1：`开设置栏` 此前在**每一次**调用时都重记「被顶掉的是谁」——命令面板跳分类
 * 走的正是 `开设置栏(section)` 这条路（Task 6 接线之后），第二次调用会把第一次
 * 记下的坞房客覆盖成 `undefined`，坞从此回不来。
 *
 * C2：`开设置栏` 此前完全不管 `$view`——从整页直接开窄栏会让两种形状同屏，
 * 而不是整页让位给窄栏。
 *
 * 下面补的用例先红后绿：`beforeEach` 补上 `$被顶掉的房客` 的重置（此前两条
 * mutation 能存活正是因为用例之间在借上一条留下的状态），新增的用例分别钉死
 * C1、C2，以及「关掉设置读的是记忆、不是坞此刻的值」与 `坞上位()`。
 */
import { beforeEach, describe, expect, it } from "vitest"
import { $view, $settingsSection, SETTINGS_SECTION_KEY, 选设置分类 } from "../../src/ui/state/view.js"
import { $rightDockOpen, $rightDockTenant, setRightDockOpen, setRightDockTenant } from "../../src/ui/state/right-dock.js"
import {
  $settingsColumnOpen,
  $被顶掉的房客,
  $设置在场,
  关掉设置,
  开设置栏,
  展开设置,
  收起设置,
  坞上位,
  打开设置整页,
} from "../../src/ui/state/settings-column.js"

beforeEach(() => {
  localStorage.clear()
  $view.set("conversation")
  $rightDockOpen.set(false)
  $rightDockTenant.set("files")
  $settingsColumnOpen.set(false)
  $settingsSection.set(undefined)
  // **此前没重置这个，两条 mutation 能存活正是因为借了上一条用例留下的记忆**
  $被顶掉的房客.set(undefined)
})

describe("设置栏与坞互斥", () => {
  it("坞开着 → 开设置 → 坞让位", () => {
    $rightDockOpen.set(true)
    $rightDockTenant.set("notebook")
    开设置栏()
    expect($settingsColumnOpen.get()).toBe(true)
    expect($rightDockOpen.get()).toBe(false)
  })

  it("**关掉设置，被顶掉的那一位自己回来**", () => {
    $rightDockOpen.set(true)
    $rightDockTenant.set("notebook")
    开设置栏()
    关掉设置()
    expect($settingsColumnOpen.get()).toBe(false)
    expect($rightDockOpen.get()).toBe(true)
    expect($rightDockTenant.get()).toBe("notebook")
  })

  it("**来时右边空的，走时右边就空的**——不是「关掉设置就给你开个面板」", () => {
    开设置栏()
    关掉设置()
    expect($rightDockOpen.get()).toBe(false)
  })

  it("开设置栏可以直接钻进某一项（命令面板那条路）", () => {
    开设置栏("mcp")
    expect($settingsSection.get()).toBe("mcp")
    expect($settingsColumnOpen.get()).toBe(true)
  })

  it("**关掉设置读的是被顶掉那一刻记下的房客，不是坞此刻挂着谁**（钉死 mutant：删掉 setRightDockTenant 也全绿）", () => {
    $rightDockOpen.set(true)
    $rightDockTenant.set("notebook")
    开设置栏()
    // 设置开着期间坞不该被谁动，但即便被动了，关掉设置也该回放记忆而不是抄坞此刻的值
    $rightDockTenant.set("files")
    关掉设置()
    expect($rightDockTenant.get()).toBe("notebook")
  })

  it("**命令面板跳分类不会覆盖被顶掉的记忆**（C1：坞开着 → 开设置 → 再跳一项 → 关掉设置，坞必须回来）", () => {
    $rightDockOpen.set(true)
    $rightDockTenant.set("notebook")
    开设置栏()
    开设置栏("mcp") // 设置已经在场，这一下只是换分类，不该重记「顶掉了谁」
    关掉设置()
    expect($rightDockOpen.get()).toBe(true)
    expect($rightDockTenant.get()).toBe("notebook")
  })

  it("**从整页直接开窄栏，整页让位**（C2：不能两种形状同屏）", () => {
    $view.set("settings")
    开设置栏("models")
    expect($view.get()).toBe("conversation")
    expect($settingsColumnOpen.get()).toBe(true)
    expect($settingsSection.get()).toBe("models")
  })

  it("**整页设置开着、坞也开着时跳分类，坞照样要回得来**（R2-1：`$设置在场` 在整页时已经是 true，" +
    "只问「在不在场」会让这一下的顶掉悄悄溜过记账）", () => {
    $view.set("settings")
    $rightDockOpen.set(true)
    $rightDockTenant.set("notebook")
    开设置栏("mcp")
    关掉设置()
    expect($rightDockOpen.get()).toBe(true)
    expect($rightDockTenant.get()).toBe("notebook")
  })

  it("**上一轮的记忆不会渗进这一轮**：设置不在场、右边空着时再开，记忆必须被清成「空着」（R3-2：" +
    "`resetAllState()` 只清 `$view`，不清 `$被顶掉的房客`，脏记忆能活到下一次打开）", () => {
    $被顶掉的房客.set("notebook") // resetAllState 只清 $view，不清这个
    开设置栏()
    关掉设置()
    expect($rightDockOpen.get()).toBe(false)
  })
})

describe("展开与收起", () => {
  it("**窄栏与坞万一同时开着，展开时坞照样被顶掉且记下来**（R3-1：`展开设置` 此前完全不碰坞，" +
    "「那一列空着」全靠 `开设置栏` 提前顶过——这一下没有）", () => {
    $settingsColumnOpen.set(true)
    $rightDockOpen.set(true)
    $rightDockTenant.set("notebook")
    展开设置()
    expect($view.get()).toBe("settings")
    expect($rightDockOpen.get()).toBe(false)
    关掉设置()
    expect($rightDockOpen.get()).toBe(true)
    expect($rightDockTenant.get()).toBe("notebook")
  })

  it("展开 → 整页，而那一列**空着**（作者选的）", () => {
    $rightDockOpen.set(true)
    $rightDockTenant.set("files")
    开设置栏("models")
    展开设置()
    expect($view.get()).toBe("settings")
    expect($settingsColumnOpen.get()).toBe(false)
    expect($rightDockOpen.get()).toBe(false) // 不是把面板放回来
    expect($settingsSection.get()).toBe("models") // 选中项不变
  })

  it("收起 → 回到那一列，选中项仍然不变", () => {
    开设置栏("models")
    展开设置()
    收起设置()
    expect($view.get()).toBe("conversation")
    expect($settingsColumnOpen.get()).toBe(true)
    expect($settingsSection.get()).toBe("models")
  })

  it("**从整页直接关掉，被顶掉的那一位照样回来**", () => {
    $rightDockOpen.set(true)
    $rightDockTenant.set("artifacts")
    开设置栏()
    展开设置()
    关掉设置()
    expect($view.get()).toBe("conversation")
    expect($rightDockOpen.get()).toBe(true)
    expect($rightDockTenant.get()).toBe("artifacts")
  })
})

describe("坞上位", () => {
  it("坞要上位：设置让开", () => {
    开设置栏()
    坞上位()
    expect($settingsColumnOpen.get()).toBe(false)
  })

  it("**坞上位之后，这次回程的记忆作废**——不会把人这次自己挑的房客又换回上一位", () => {
    $rightDockOpen.set(true)
    $rightDockTenant.set("notebook")
    开设置栏() // 记下：被顶掉的是 notebook
    坞上位() // 人不等设置关，直接把坞叫回来
    setRightDockTenant("files") // 这次人自己挑的是「文件」
    setRightDockOpen(true)
    // 万一后面哪条路径又调用了一次关掉设置（此刻设置早已经不在场，这里只为钉死记忆已经作废）
    关掉设置()
    expect($rightDockTenant.get()).toBe("files")
  })
})

describe("设置在场", () => {
  it("是响应式的（computed）——订阅它的人会收到变化通知，不是只有主动 .get() 才拿得到新值", () => {
    const 见过: boolean[] = []
    const 撤 = $设置在场.listen((v) => 见过.push(v))
    开设置栏()
    关掉设置()
    撤()
    expect(见过).toEqual([true, false])
  })

  it("窄栏、整页都算在场", () => {
    expect($设置在场.get()).toBe(false)
    开设置栏()
    expect($设置在场.get()).toBe(true)
    展开设置()
    expect($设置在场.get()).toBe(true)
    收起设置()
    expect($设置在场.get()).toBe(true)
  })
})

describe("打开设置整页（2026-09-16 从 view.ts 搬进来的那一个）", () => {
  /**
   * **步骤 ⑩ 的搬家理由，到这里才真的有判据。**
   *
   * 它此前住在 `view.ts`，而 `view.ts` 不能反过来 import 这个模块（成环），
   * 于是 `开设置栏()` → `打开设置整页()` 两步就能造出「整页与窄栏同时为真」。
   * 搬过来之后它顺手收掉那一列——**而在这条用例出现之前，那个修复一处都没被断言过**。
   */
  it("从窄栏直接开整页：窄栏被收掉，两种形状不同屏", () => {
    开设置栏()
    expect($settingsColumnOpen.get()).toBe(true)
    打开设置整页()
    expect($view.get()).toBe("settings")
    expect($settingsColumnOpen.get(), "整页与窄栏同时为真——这正是步骤 ⑩ 要修的那个状态").toBe(false)
  })

  /**
   * **不给 id 就不许动那份偏好**（2026-09-17 审查抓到的真回归）。
   *
   * `选设置分类(undefined)` 的语义是「把偏好清掉」（`view.ts` 里那行
   * `localStorage.removeItem`）。无脑转调它，等于连不上时点一下「检查配置」
   * 就把 `8b37470` 刚加的「记住上次看的是哪一块」删掉了。
   */
  it("没给 id 时不碰已经记住的那一块（既不改内存里的，也不删存储里的）", () => {
    选设置分类("providers")
    expect(localStorage.getItem(SETTINGS_SECTION_KEY)).toBe("providers")
    打开设置整页()
    expect($settingsSection.get(), "没给 id 却把选中项清掉了").toBe("providers")
    expect(localStorage.getItem(SETTINGS_SECTION_KEY), "没给 id 却把存下来的偏好删了").toBe("providers")
  })

  it("给了 id 就切过去，并记住它", () => {
    选设置分类("providers")
    打开设置整页("mcp")
    expect($settingsSection.get()).toBe("mcp")
    expect(localStorage.getItem(SETTINGS_SECTION_KEY)).toBe("mcp")
  })
})

describe("不变式：那一列只有一个位置", () => {
  /**
   * **窄栏开着的时候，坞不可能开着。**`$settingsColumnOpen && $rightDockOpen`
   * 不能同时为真——Task 6 的每一次渲染都假定这一点，而这个模块出过的每一个
   * bug（C1 的同类、R2-1、`展开设置`/`收起设置` 两处漏顶）都是某条路径悄悄
   * 破了它。表驱动跑遍「五个起点 × 七个动作」，比任何一条单独的场景用例
   * 都更值钱——它是会抓住*下一个*同类漏洞的那一条，不只是这一批。
   */
  it("五个起点、七个动作，做完之后窄栏与坞永远不同时开着", () => {
    const 重置到初始 = () => {
      localStorage.clear()
      $view.set("conversation")
      $rightDockOpen.set(false)
      $rightDockTenant.set("files")
      $settingsColumnOpen.set(false)
      $settingsSection.set(undefined)
      $被顶掉的房客.set(undefined)
    }

    const 起点表: ReadonlyArray<[string, () => void]> = [
      ["一切都关着", () => {}],
      ["只有坞开着", () => {
        $rightDockOpen.set(true)
        $rightDockTenant.set("notebook")
      }],
      ["只有窄栏开着", () => {
        $settingsColumnOpen.set(true)
      }],
      ["整页开着、坞也开着（「一边看设置一边看图」，坞上位() 之后的合法状态）", () => {
        $view.set("settings")
        $rightDockOpen.set(true)
        $rightDockTenant.set("notebook")
      }],
      ["窄栏与坞都开着（不该出现，但要防）", () => {
        $settingsColumnOpen.set(true)
        $rightDockOpen.set(true)
        $rightDockTenant.set("notebook")
      }],
    ]

    const 动作表: ReadonlyArray<[string, () => void]> = [
      ["开设置栏()", () => 开设置栏()],
      ['开设置栏("mcp")', () => 开设置栏("mcp")],
      ["展开设置()", () => 展开设置()],
      ["收起设置()", () => 收起设置()],
      ["关掉设置()", () => 关掉设置()],
      ["坞上位()", () => 坞上位()],
      /**
       * **第七个动作，2026-09-17 补的**（Task 6 步骤 ⑩ 把 `打开设置整页` 从
       * `view.ts` 搬进了这个模块）。搬家的全部理由就是它在旧地方绕开了这条
       * 不变式——**多一个导出的 mutator 而不进这张表，这张表就开始名不副实**：
       * 它自称「会抓住*下一个*同类漏洞的那一条」，而下一个漏洞恰恰可能长在
       * 没被它扫到的那个函数上。
       */
      ["打开设置整页()", () => 打开设置整页()],
      ['打开设置整页("mcp")', () => 打开设置整页("mcp")],
    ]

    for (const [起点名, 布起点] of 起点表) {
      for (const [动作名, 做] of 动作表) {
        重置到初始()
        布起点()
        做()
        expect(
          $settingsColumnOpen.get() && $rightDockOpen.get(),
          `起点「${起点名}」→ ${动作名} 之后，窄栏与坞不该同时开着`,
        ).toBe(false)
      }
    }
  })
})
