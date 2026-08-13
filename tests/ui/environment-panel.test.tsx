/**
 * 环境面板：两种快照各画各的（②-B · R5，2026-08-13）。
 *
 * **这一屏是 R5 的兑现处。** 前三批把类型、探测、账本都做了，
 * 而按本项目自己的规矩——*「看不见的能力等于不存在」*——
 * 在这一屏画出来之前，那些都还不存在。
 *
 * 这组用例守的最要紧一条是**「探不到的行整行不画」**：
 * 画成「未知」会被读成一个确定的事实（我们问过了，它没有），
 * 而实情是我们没问到。两者在界面上必须长得不一样（不变式 3）。
 */
import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"
import { EnvironmentPanel, type EnvironmentState } from "../../src/ui/panels.js"

const 机器 = (over: Partial<Extract<Exclude<EnvironmentState, undefined>, { kind: "shell" }>> = {}) =>
  ({
    captured: true,
    kind: "shell",
    id: "a".repeat(64),
    where: "local",
    os: "Darwin",
    osRelease: "25.3.0",
    distro: "macOS 26.3.1",
    arch: "arm64",
    cpus: 10,
    memoryKib: 33_554_432,
    tools: { git: { path: "/usr/bin/git", version: "git version 2.50.1" } },
    workspace: "/w/proj",
    workspaceIsGitRepo: true,
    ...over,
  }) as EnvironmentState

const 内核 = (): EnvironmentState => ({
  captured: true,
  kind: "kernel",
  id: "b".repeat(64),
  language: "python",
  version: "3.11.15",
  executable: "/x/bin/python",
  platform: "macOS-15",
  libraryPaths: ["/x/lib"],
  packages: [{ name: "numpy", version: "2.0.0" }],
  packagesTotal: 1,
})

describe("环境面板 · 机器那一支", () => {
  it("把这台机器是什么画出来", () => {
    render(<EnvironmentPanel state={机器()} />)
    expect(screen.getByText("macOS 26.3.1")).toBeDefined()
    expect(screen.getByText(/arm64/)).toBeDefined()
    expect(screen.getByText(/10 核/)).toBeDefined()
    expect(screen.getByText(/32\.0 GiB/)).toBeDefined()
  })

  it("PATH 上的工具连路径一起画 —— 光有版本回答不了「哪一个」", () => {
    render(<EnvironmentPanel state={机器()} />)
    expect(screen.getByText(/git version 2\.50\.1/)).toBeDefined()
    expect(screen.getByText(/\/usr\/bin\/git/)).toBeDefined()
  })

  /** **两台机器可以同名**，所以远端说的是那条连接，不是主机名 */
  it("本地说本机，远端说清是哪一台", () => {
    const { unmount } = render(<EnvironmentPanel state={机器()} />)
    expect(screen.getByText("本机")).toBeDefined()
    unmount()

    render(<EnvironmentPanel state={机器({ where: { connectionId: "实验室-3" } })} />)
    expect(screen.getByText(/实验室-3/)).toBeDefined()
  })

  it("指纹只画前 12 位 —— 够认，且它是内容指纹", () => {
    const { container } = render(<EnvironmentPanel state={机器()} />)
    const 指纹 = container.querySelector(".env-mono")!
    expect(指纹.textContent).toBe("a".repeat(12))
  })
})

describe("环境面板 · 探不到的不许画成「未知」", () => {
  /**
   * **这条是这一屏的要害。**
   *
   * 精简容器里没有 `/etc/os-release`、没有 `nproc`、甚至没有 `git`。
   * 那时少几行，比画一排「未知」诚实——后者会被读成
   * 「我们问过了，这台机器没有这些」。
   */
  it("只探到机器身份时，别的行一个都不出现", () => {
    const { container } = render(
      <EnvironmentPanel
        state={{ captured: true, kind: "shell", id: "c".repeat(64), where: "local" }}
      />,
    )
    const 文字 = container.textContent ?? ""
    expect(文字).not.toMatch(/未知|unknown|N\/A|—\s*—/)
    expect(screen.queryByText("硬件")).toBeNull()
    expect(screen.queryByText("操作系统")).toBeNull()
    expect(screen.queryByText("PATH 上的工具")).toBeNull()
    expect(screen.queryByText("工作区")).toBeNull()
  })

  /**
   * **「不知道是不是 git 仓库」与「不是 git 仓库」是两件事。**
   * git 没装、目录不在、没权限都会探不到，而三种都不等于「不是」。
   */
  it("不知道是不是 git 仓库时，两句话都不说", () => {
    const { workspaceIsGitRepo: _丢掉, ...少一个 } = 机器() as Record<string, unknown>
    render(<EnvironmentPanel state={少一个 as EnvironmentState} />)
    expect(screen.getByText("/w/proj")).toBeDefined()
    expect(screen.queryByText("是 git 仓库")).toBeNull()
    expect(screen.queryByText("不是 git 仓库")).toBeNull()
  })

  it("明确不是 git 仓库时，就说不是", () => {
    render(<EnvironmentPanel state={机器({ workspaceIsGitRepo: false })} />)
    expect(screen.getByText("不是 git 仓库")).toBeDefined()
  })
})

describe("环境面板 · 两支不许串味", () => {
  /**
   * 机器快照里**没有解释器这回事**。画出「解释器」那一行，
   * 说明两支被合成了一个形状——而那正是计划 §3.4 禁止的
   * *「两种环境快照，不共用一个名字」*。
   */
  it("机器那一支不画解释器、不画包清单", () => {
    const { container } = render(<EnvironmentPanel state={机器()} />)
    expect(screen.queryByText("解释器")).toBeNull()
    expect(container.querySelector(".env-packages")).toBeNull()
  })

  it("内核那一支照旧：解释器、库路径、包清单都在", () => {
    const { container } = render(<EnvironmentPanel state={内核()} />)
    expect(screen.getByText("解释器")).toBeDefined()
    expect(screen.getByText(/3\.11\.15/)).toBeDefined()
    expect(container.querySelector(".env-packages")).toBeTruthy()
    // 机器那支的行不该跑到内核这支来
    expect(screen.queryByText("机器")).toBeNull()
    expect(screen.queryByText("硬件")).toBeNull()
  })
})

describe("环境面板 · 没有快照时要说原因", () => {
  it("**不是一片空白**：空白会被读成「这个环境什么都没有」", () => {
    render(<EnvironmentPanel state={{ captured: false, reason: "远端还没连上" }} />)
    expect(screen.getByText("远端还没连上")).toBeDefined()
  })
})
