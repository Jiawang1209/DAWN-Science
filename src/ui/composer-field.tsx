/**
 * **草稿输入框：文字的真身住在 DOM 里**（2026-09-18）。
 *
 * ## 为什么不是受控的
 *
 * 作者报的：*「打『这样』`zheyang` 的时候只能打出 `zh`，然后就自动退出中文了。」*
 * 同机同输入法，Chrome 正常、Hermes（与我们同栈）正常、终端正常——**别人好我们坏**。
 *
 * 此前这里是 `value={draft}`：每敲一个字母都要绕一圈全局 store 再回到 DOM。
 * 探针量出来的机制（`tests/ui/composer-field.test.tsx` 的文件头记着全过程）：
 * **只要组词文本没能进 state，任何一次与打字无关的重渲染都会把它抹掉**——
 * 相对时间跳一秒、会话列表刷新、状态栏变化，都算。组词被掐断、字母原样落下、
 * 输入法回到英文。它专挑 `zh` 这类两个字母的组合，只是因为组词窗口越长，
 * 撞上一次无关重渲染的概率越大。
 *
 * 所以这里**不去堵某一次重渲染**（那是把一整类问题当成一条路径修），
 * 而是照 Hermes 与 Codex 的同一条规矩来：**组词的时候 DOM 说了算，React 不往回写。**
 * 他们各自的做法是 `contentEditable`（组词期间跳过 `input`，`compositionend` 冲一次）
 * 与 ProseMirror（`domObserver` 在 `composing` 时推迟同步）；这里是同一条路的轻量版——
 * 保住 textarea（粘贴、`@` 菜单定位、镜像高亮层、几十条 e2e 都还站在它上面），
 * 只把「谁拥有这段文字」翻过来。
 *
 * ## 三条规矩
 *
 * 1. **打字照常往外同步**（`on值变`）：`@` 菜单、发送键、高亮层都靠它。
 *    往外同步是安全的——危险的从来是反方向。
 * 2. **只有「外面真的换了内容」才写 DOM**：换会话、插入 `@` 引用、发送后清空。
 *    判据是 `值 !== 框里此刻的字`，所以人自己打出来的那一轮永远不会触发写回。
 * 3. **组词期间一个字都不写**，`compositionend` 之后再对齐；而且组完以人手上那句为准——
 *    正在打字的人最大。有些输入法组完词不再补一次 `input`，所以结束时要主动冲一次
 *    （不冲的话外面不知道框里有字，发送键不亮——Hermes 踩过这一条）。
 */
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react"
import type { ComponentPropsWithoutRef } from "react"

type 透传 = Omit<ComponentPropsWithoutRef<"textarea">, "value" | "defaultValue" | "onChange">

export interface 草稿输入框属性 extends 透传 {
  /** 外面认为框里该是什么。**只在它与框里不同的时候才写进 DOM** */
  值: string
  /**
   * 框里的字变了。组词途中也会报——往外同步是安全的。
   *
   * 第二个参数是**此刻的光标位置**：`@` 与 `/` 菜单靠它判断「正在打的是哪一段」，
   * 从框里顺手带出来，省得调用点再去摸一次 DOM（摸到的还可能是下一帧的）。
   */
  on值变: (值: string, 光标: number) => void
}

export const 草稿输入框 = forwardRef<HTMLTextAreaElement, 草稿输入框属性>(function 草稿输入框(
  // `onChange` 与 `value`/`defaultValue` 在类型上就被挡在外面（见 `透传`）：
  // 这个框的值只走 `值` / `on值变` 这一对，多一条路就多一种把它改回受控的写法
  { 值, on值变, onCompositionStart, onCompositionEnd, className, ...透传 },
   外面的ref,
) {
  const 框 = useRef<HTMLTextAreaElement>(null)
  const 组词中 = useRef(false)
  /**
   * **`.control` 由这里保证，不靠调用点记得写。**
   *
   * 那条规则是 2026-08-09 一张截图撞出来的：composer 的 textarea `className` 空着，
   * 样式靠 `.composer textarea` 逐字复制了 `.control` 的七条属性——抄到了长相、
   * **漏掉了行为**，`:focus-visible` 的聚焦环只挂在 `.control` 上，于是它退回 Chromium 默认环、
   * 取操作系统强调色。`design-contract` 那条扫描就是为它立的。
   *
   * 扫描读的是源码文本，看不见「类名从 props 传进来」这种写法。与其给扫描开一个口子，
   * 不如让它**在构造上不可能漏**：这里把 `control` 并进去，调用点写不写都一样。
   * 量它的是 `tests/ui/composer-field.test.tsx` 里那条「永远带 control」。
   */
  const 类名 = [...new Set(["control", ...(className ?? "").split(/\s+/).filter(Boolean)])].join(" ")
  useImperativeHandle(外面的ref, () => 框.current as HTMLTextAreaElement)

  /**
   * **把外面的值对齐进 DOM。**
   *
   * 三条都在这一句里：不同才写（人自己打的那一轮 `值` 与框里相同，不会进来）、
   * 组词期间不写（写进去就是当场掐断组词）、写完把光标放到末尾
   * （换会话、发送后清空、插入引用都该落在末尾；`@` 那条路随后自己再挪一次光标）。
   */
  useEffect(() => {
    const el = 框.current
    if (!el || 组词中.current) return
    if (el.value !== 值) {
      el.value = 值
      el.selectionStart = el.selectionEnd = 值.length
    }
  }, [值])

  return (
    <textarea
      {...透传}
      className={类名}
      defaultValue={值}
      onChange={(e) => on值变(e.currentTarget.value, e.currentTarget.selectionStart)}
      onCompositionEnd={(e) => {
        组词中.current = false
        /**
         * **以框里的为准**：这一刻框里就是人刚刚组完的那句话。
         * 主动冲一次，而不是等下一个 `input`——有些输入法根本不会再发。
         */
        const 此刻 = e.currentTarget.value
        if (此刻 !== 值) on值变(此刻, e.currentTarget.selectionStart)
        onCompositionEnd?.(e)
      }}
      onCompositionStart={(e) => {
        组词中.current = true
        onCompositionStart?.(e)
      }}
      ref={框}
    />
  )
})
