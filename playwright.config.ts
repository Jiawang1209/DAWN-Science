/**
 * e2e 配置。
 *
 * **跑的是已构建的真实应用**，不是开发服务器、不是组件挂载。
 * 学自 Hermes：其 `test:e2e` 先 `npm run build` 再跑，甚至有一条
 * `launch-packaged-app.spec.ts` 连打包产物本身都测。
 *
 * 这一层存在的理由，本项目已经用五次缺陷证明过：
 * **单元测试证明不了「真的能用」。** 419 个测试全绿的那一版，
 * 打开之后点什么都没反应。
 */
import { defineConfig } from "@playwright/test"

export default defineConfig({
  testDir: "./e2e",
  // Electron 应用只有一个实例，并行会互相抢窗口与数据库
  workers: 1,
  fullyParallel: false,
  // 起 Electron + 建库 + 假模型往返，比浏览器测试慢一个量级
  timeout: 60_000,
  /**
   * 2026-08-09 从 15s 提到 25s。
   *
   * 症状是**每次挂的不是同一条**——整套 51 条串行各启一次 Electron，
   * 全程 1.3–2.1 分钟之间飘，机器一忙就有某条撞上上限。
   * 单独跑那条永远是绿的。
   *
   * **「每次挂的不是同一条」通常不指向某条测试，而指向一个全局资源问题**
   * （上一次是 effect 依赖里放了 `items`，每个 token 打一次 IPC）。
   * 这一次查下来是纯粹的余量不够：**提高上限不会掩盖真失败**，
   * 断言真错了照样红，只是慢一点才红。
   */
  expect: { timeout: 25_000 },
  // 失败时留下现场。**第一次失败就留**——e2e 的失败往往难以复现
  use: { trace: "retain-on-failure", screenshot: "only-on-failure" },
  /**
   * 视觉基线放一个显眼的目录，而不是默认的 `<spec>-snapshots/`。
   *
   * **`{platform}` 必须留在文件名里**：基线是逐平台的，macOS 上存的图在 Linux 上
   * 必然全红。名字里带着 `-darwin`，看见全红的人第一眼就知道那不是回归，
   * 是没有那个平台的基线——而不是去调容差。
   */
  snapshotPathTemplate: "e2e/__screenshots__/{arg}-{platform}{ext}",
  reporter: [["list"]],
})
