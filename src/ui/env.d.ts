/** Vite 把 CSS 的 side-effect import 处理成注入样式；TS 需要一个声明才认。 */
declare module "*.css" {
  const content: string
  export default content
}
