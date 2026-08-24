/**
 * 插件册（2026-08-25）：**插件 = 仓库里审过的内置工具包**，这里是唯一的名单。
 * `listPlugins` / `setPluginFlag` 都照这册子办——加第三个插件时只动这里与装配点。
 */
import { OFFICE族 } from "./office/index.js"
import { browser工具定义 } from "./browser/tools.js"
import { memory工具定义 } from "./memory/index.js"

export interface 插件册条 {
  id: string
  名: string
  /** 设置键前缀：`<前缀>.off` 整包，`<前缀>.<族>` 单族（"0" 关；没记 = 开） */
  键: string
  族们: () => { key: string; name: string; tools: { name: string; description: string }[] }[]
}

export const 插件册: readonly 插件册条[] = [
  {
    id: "office",
    名: "Office 文档",
    键: "plugin.office",
    族们: () => OFFICE族.map((f) => ({ key: f.族, name: f.名, tools: f.工具.map((t) => ({ name: t.name, description: t.description })) })),
  },
  {
    id: "browser",
    名: "浏览器",
    键: "plugin.browser",
    // 列名单不用工作区（执行闭包才用）；给空串即可
    族们: () => browser工具定义("").map((f) => ({ key: f.族, name: f.名, tools: f.工具.map((t) => ({ name: t.name, description: t.description })) })),
  },
  {
    id: "memory",
    名: "记忆",
    键: "plugin.memory",
    // 同上：列名单不做 IO，目录给空串即可（执行闭包才用真目录）
    族们: () =>
      memory工具定义("", { memoriesDir: "", skillsDir: "" }).map((f) => ({
        key: f.族,
        name: f.名,
        tools: f.工具.map((t) => ({ name: t.name, description: t.description })),
      })),
  },
]
