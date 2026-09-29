/**
 * MCP 那一屏：远端 `Authorization` 那一行要说清「只填令牌就行」（2026-09-29）。
 *
 * 作者只填了令牌、服务器回 `invalid_token`——框从没说过要带 `Bearer `。
 * 连的时候现在会自动补（`补认证方案`），这句提示让人不必去猜。
 * 只出现在远端那种的 Authorization 上：本机的环境变量、别的头名都不该有它。
 */
import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"
import { McpView, type MCP一台 } from "../../src/ui/skills.js"

const 一台 = (over: Partial<MCP一台>): MCP一台 => ({
  name: "mine",
  args: [],
  env: [],
  missingSecrets: [],
  from: "global",
  trusted: true,
  off: false,
  state: "unknown",
  tools: [],
  ...over,
})

const 提示 = /只填令牌就行/

describe("MCP：Authorization 的提示", () => {
  it("远端那台的 Authorization 下面有这句", async () => {
    render(
      <McpView
        load={async () => ({
          servers: [一台({ url: "http://127.0.0.1:8765/mcp", transport: "http", env: ["Authorization"], missingSecrets: ["Authorization"] })],
          problems: [],
        })}
      />,
    )
    expect(await screen.findByText(提示)).toBeTruthy()
  })

  it("别的头名、本机的环境变量都没有", async () => {
    render(
      <McpView
        load={async () => ({
          servers: [
            一台({ name: "remote", url: "http://127.0.0.1:8765/mcp", env: ["X-Api-Key"] }),
            一台({ name: "local", command: "node", env: ["Authorization"] }),
          ],
          problems: [],
        })}
      />,
    )
    await screen.findByText("X-Api-Key")
    expect(screen.queryByText(提示)).toBeNull()
  })
})
