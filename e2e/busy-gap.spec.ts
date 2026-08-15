/**
 * **上一条还在回的时候，回车不许再发一条**（2026-08-15）。**跑真实构建产物。**
 *
 * 作者三次报同一句话：
 * > `[native runtime 错误] Agent is already processing. Specify
 * > streamingBehavior ('steer' or 'followUp') to queue the message.`
 *
 * 含义是「上一轮还在跑时又发了一条」，pi 拒收。
 *
 * ## 为什么前两次都没修掉
 *
 * 守卫此前只挂在**那颗按钮**上：忙的时候它变成「停止」，于是鼠标发不出去。
 * 但**回车走的是表单提交**（`requestSubmit()`），根本不经过那颗按钮。
 * 探针实测的形状是这样的——屏幕上明明是「停止」：
 *
 * ```
 * [探针] 停止在吗: 1                  ← 界面知道在忙
 * [探针] 用户发言条数: 2              ← 回车照样发出去了
 * [探针] 出现 already processing 了吗: 1
 * [探针] 输入框里还剩: ""             ← 那句话还被清空了
 * ```
 *
 * 「两条路只堵了一条」是本仓库反复踩的同一个坑。
 *
 * ## 为什么这条非得在真实产物上跑
 *
 * 单元测试可以断言「busy 时提交处理器不调 onSend」，但它证明不了
 * **回车真的会走到那个处理器**——中间隔着 `requestSubmit()`、表单的默认行为、
 * 以及 pi 那一侧到底认不认这一条。这个 bug 本身就长在那几层的接缝上。
 */
import { test, expect, 开一段临时会话 } from "./fixtures.js"

test.use({
  dawnOptions: {
    toolCall: {
      // **拖住这一轮**：不拖的话断言就变成了跟模型赛跑
      toolName: "bash",
      args: { command: "sleep 5" },
      /**
       * 让假模型**先说一句再调工具**（2026-08-15 同批给 mock 加的）。
       * 不说这一句的话，屏幕上停在「正在等模型回话」，
       * 而作者报的那一幕是**它已经开口了、还在往下干**。
       */
      say: "我先看看这里有什么。",
    },
  },
})

test("**上一条还在回的时候，回车发不出去，而且那句话不会丢**", async ({ dawn }) => {
  const { page } = dawn
  await 开一段临时会话(page)

  const 框 = page.getByPlaceholder(/今天帮你做些什么/)
  await 框.fill("看一下这个目录")
  await page.getByRole("button", { name: "发送", exact: true }).click()

  /**
   * 等到**只有这个状态才有的东西**：它已经开口，工具还在跑。
   * 拿输入框或按钮当等待条件是不行的——它们在别的状态下也长这样。
   */
  await expect(page.getByText("我先看看这里有什么。")).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole("button", { name: "停止" })).toBeVisible()

  await 框.fill("我再问一句")
  await 框.press("Enter")

  /** **发不出去**：转录里仍然只有一条用户发言 */
  await expect(page.locator(".turn.user")).toHaveCount(1)

  /**
   * **不静默**（规格 7.5）。而且这句话要说人话——
   * `already processing` 那串英文是 pi 的内部状态，不是给人看的。
   */
  await expect(page.getByText(/上一条还在回/)).toBeVisible()

  /** **那句话不许丢。** 上一版把它清空了，人重打一遍才发得出去 */
  await expect(框).toHaveValue("我再问一句")

  /** **从头到尾不该出现那句报错** */
  await expect(page.getByText(/already processing/i)).toHaveCount(0)

  /**
   * **跑完之后要放开。** 只证明「拦得住」是半个修复：
   * 忙完不放开的话，人从此再也发不出话，那比原来的 bug 更坏。
   */
  await expect(page.getByRole("button", { name: "发送", exact: true })).toBeVisible({
    timeout: 60_000,
  })
  await 框.press("Enter")
  await expect(page.locator(".turn.user")).toHaveCount(2)
})
