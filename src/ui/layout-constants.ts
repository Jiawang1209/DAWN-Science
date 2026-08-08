/**
 * 布局常量的**唯一出处**。
 *
 * 学自 Hermes `app/layout-constants.ts`：把页边距、内容宽度上限、侧栏折叠断点
 * 收在一处。散落的 `padding:12px` 是「两个页面各自漂移」的经典入口，
 * 而漂移之后没人知道哪个才是对的。
 *
 * 本项目用纯 CSS（不是 Tailwind），所以这里导出的是 CSS 值与数字，
 * 供 `styles.css` 的自定义属性与需要读断点的 JS 共用——
 * **断点只有一个真值**，媒体查询与 `matchMedia` 都从它来。
 */

/**
 * 主体内容的左右留白。
 *
 * 比例化（`4vw`）以便随窗口缩放，但**上下都夹死**：窄窗口下不塌成 0，
 * 超宽屏下不无限张开。头部与标签栏刻意保留自己更紧的内距。
 */
export const PAGE_INSET_X = "clamp(1.25rem, 4vw, 4rem)"

/**
 * 内容宽度上限。
 *
 * 超宽屏上让文字一路铺到边缘会难以阅读——一行超过一定字数，
 * 眼睛回到下一行行首就会找错行。
 */
export const PAGE_MAX_W = "75rem"

/**
 * 低于这个宽度，侧栏没有留给内容的空间，两侧栏都自动折叠。
 *
 * **数字形式是必须的**：媒体查询用它，`window.matchMedia` 也用它，
 * 两处各写一个字面量就是两处各自漂移。
 */
export const SIDEBAR_COLLAPSE_BREAKPOINT_PX = 768
export const SIDEBAR_COLLAPSE_MEDIA_QUERY = `(max-width: ${SIDEBAR_COLLAPSE_BREAKPOINT_PX}px)`

/** 侧栏展开时的宽度 */
export const SIDEBAR_WIDTH = "240px"

/** 顶栏与状态栏的高度。grid 骨架靠它们 */
export const TOPBAR_HEIGHT = "46px"
export const STATUSBAR_HEIGHT = "24px"
