/**
 * **输入框：文字的真身住在 DOM 里**（2026-09-18，作者报的第 ① 条的根治）。
 *
 * ## 这条 bug 长什么样
 *
 * 作者：*「我打『这样』`zheyang` 的时候只能打出 `zh`，然后就自动退出中文了。
 * `zhe shu` 这种带有 `zh` 的，其实汉语拼音都有问题。」*
 * 同一台机器上 Chrome 正常、Hermes（与 DAWN 同栈的 Electron + React）正常、终端正常——
 * **同一套 Chromium 引擎，别人好我们坏，账就在我们这一层。**
 *
 * ## 量出来的机制（2026-09-18 的探针，两条路一红一绿）
 *
 * 此前输入框是**受控**的：`value={draft}`，每敲一个字母都要绕一圈全局 store 再回到 DOM。
 *
 * - 组词期间 `input` 照常派发 → state 跟得上 → 无关重渲染写回同一个字符串 → 组词活着；
 * - 组词期间 `input` **没到** → state 停在旧值 → **一次与打字无关的重渲染
 *   （相对时间跳一秒、会话列表刷新、状态栏变化……）就把框里的组词文本抹掉**。
 *
 * 后一条正是那个症状：组词被掐断、已敲的字母原样落下、输入法回到英文。
 * 它专挑 `zh` 这类两个字母的组合，只是因为**组词窗口越长，撞上一次无关重渲染的概率越大**。
 *
 * ## 所以改法不是去堵某一次重渲染
 *
 * 那是把整类问题当成一条路径修。Hermes 与 Codex 的输入框都遵守同一条：
 * **组词的时候 DOM 说了算，React 不往回写**（前者 `contentEditable` + 组词期间跳过 `input`，
 * 后者 ProseMirror 的 `domObserver` 在 `composing` 时推迟同步）。
 * 这里走同一条路的轻量版：textarea 改成**非受控**，文字的真身放回 DOM，
 * React 只在「外面真的换了内容」时显式写一次。
 *
 * ## 判据的防空转
 *
 * 下面那条「组词途中来一次无关重渲染」如果换回受控写法**必须是红的**——
 * 它证的就是「重渲染不再碰 DOM 里的字」。所以它特意在不改 `值` 这个 prop 的前提下
 * 让父层重渲染，并且把 DOM 里的值改成与 prop 不同的东西：受控实现会把它抹回去，
 * 非受控实现不会。
 */
import { act, cleanup, fireEvent, render } from "@testing-library/react"
import { useState } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { 草稿输入框 } from "../../src/ui/composer-field.js"

afterEach(cleanup)

/** 父层：`值` 由外面拿着（模拟 `$drafts`），另有一个与打字无关的 tick 用来触发重渲染 */
function 台架({
   初值 = "",
  on值变,
  拿到手柄,
}: {
  初值?: string
  on值变?: (v: string, 光标: number) => void
  拿到手柄?: (h: { 重渲染: () => void; 换值: (v: string) => void }) => void
}) {
  const [值, 设值] = useState(初值)
  const [, setTick] = useState(0)
  拿到手柄?.({ 重渲染: () => setTick((n) => n + 1), 换值: 设值 })
  return (
    <草稿输入框
      className="control composer-field"
      data-testid="composer"
      on值变={(v, 光标) => {
        设值(v)
        on值变?.(v, 光标)
      }}
      值={值}
    />
  )
}

describe("草稿输入框", () => {
  it("**永远带 `control` 类**——聚焦环挂在它上面，调用点写不写都一样", () => {
    const { getByTestId } = render(
      <草稿输入框 data-testid="裸的" on值变={() => {}} 值="" />,
    )
    expect(
      (getByTestId("裸的") as HTMLTextAreaElement).classList.contains("control"),
      "没有 .control，聚焦环就退回 Chromium 默认那一个，取的是操作系统强调色（2026-08-09 那张截图）",
    ).toBe(true)

    // 调用点自己也写了一份时不该重复
    cleanup()
    const 又 = render(
      <草稿输入框 className="control composer-field" data-testid="带类的" on值变={() => {}} 值="" />,
    )
    expect((又.getByTestId("带类的") as HTMLTextAreaElement).className).toBe("control composer-field")
  })

  it("**打字照常把值同步出去**——`@` 菜单、发送键、高亮层都靠它", () => {
    const 看见 = vi.fn()
    const { getByTestId } = render(<台架 on值变={看见} />)
    const 框 = getByTestId("composer") as HTMLTextAreaElement

    fireEvent.change(框, { target: { value: "你好" } })

    expect(看见).toHaveBeenCalledWith("你好", expect.any(Number))
    expect(框.value).toBe("你好")
  })

  it("**组词途中来一次无关重渲染，框里的字不许被动**（这条 bug 的判据）", () => {
    let 手柄!: { 重渲染: () => void; 换值: (v: string) => void }
    const { getByTestId } = render(<台架 拿到手柄={(h) => (手柄 = h)} />)
    const 框 = getByTestId("composer") as HTMLTextAreaElement

    fireEvent.compositionStart(框)
    /**
     * **故意不派发 `input`**：模拟「浏览器/React 在组词期间没把这次变化交给我们」。
     * 组词中的预编辑文本本来就是输入法直接画进框里的，此刻外面的 `值` 还是空串——
     * 受控实现会在下一次重渲染时把它抹掉，而那正是作者看到的症状。
     */
    框.value = "zh"

    act(() => 手柄.重渲染())

    expect(框.value, "组词途中的文本被一次无关的重渲染抹掉了——这正是那条 bug").toBe("zh")
  })

  it("**组词期间一个字都不往外报**——照 Hermes 的 `if (composing) return`", () => {
    const 看见 = vi.fn()
    const { getByTestId } = render(<台架 on值变={看见} />)
    const 框 = getByTestId("composer") as HTMLTextAreaElement

    fireEvent.compositionStart(框)
    // 输入法一边组词一边发 `input`，带的是半截拼音
    fireEvent.change(框, { target: { value: "z" } })
    fireEvent.change(框, { target: { value: "zh" } })

    expect(
      看见,
      "半截拼音报出去，`/` 与 `@` 菜单会被 `zhe` 这种半成品触发、发送键提前亮——他们三家都不这么干",
    ).not.toHaveBeenCalled()

    // 组完才交出去，而且只交一次终值
    框.value = "这样"
    fireEvent.compositionEnd(框)
    expect(看见).toHaveBeenCalledTimes(1)
    expect(看见).toHaveBeenCalledWith("这样", expect.any(Number))
  })

  it("**组词结束时把框里的字冲出去**——有些输入法组完词不再补一次 `input`", () => {
    const 看见 = vi.fn()
    const { getByTestId } = render(<台架 on值变={看见} />)
    const 框 = getByTestId("composer") as HTMLTextAreaElement

    fireEvent.compositionStart(框)
    框.value = "这样"
    fireEvent.compositionEnd(框)

    expect(看见, "组完词之后外面还不知道框里有字，发送键就不会亮（Hermes 踩的正是这一条）").toHaveBeenCalledWith("这样", expect.any(Number))
  })

  it("**外面真的换了内容才写 DOM**——换会话、插入 `@` 引用、发送后清空", () => {
    let 手柄!: { 重渲染: () => void; 换值: (v: string) => void }
    const { getByTestId } = render(<台架 初值="旧会话的草稿" 拿到手柄={(h) => (手柄 = h)} />)
    const 框 = getByTestId("composer") as HTMLTextAreaElement
    expect(框.value).toBe("旧会话的草稿")

    act(() => 手柄.换值("另一段会话的草稿"))
    expect(框.value).toBe("另一段会话的草稿")

    // 发送之后清空
    act(() => 手柄.换值(""))
    expect(框.value).toBe("")
  })

  it("**组词途中外面换了值也不许打断组词**——等组完再说", () => {
    let 手柄!: { 重渲染: () => void; 换值: (v: string) => void }
    const 看见 = vi.fn()
    const { getByTestId } = render(<台架 on值变={看见} 拿到手柄={(h) => (手柄 = h)} />)
    const 框 = getByTestId("composer") as HTMLTextAreaElement

    fireEvent.compositionStart(框)
    框.value = "zh"
    act(() => 手柄.换值("别处塞进来的一段字"))

    expect(框.value, "组词还开着的时候把框里的字换掉，等于当场掐断组词").toBe("zh")

    // 组完之后以框里的为准——人正在打的那句话最大
    fireEvent.compositionEnd(框)
    expect(看见).toHaveBeenCalledWith("zh", expect.any(Number))
  })
})
