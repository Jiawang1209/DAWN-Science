import { writeFileSync, existsSync } from "node:fs"
import { join } from "node:path"
import { test, expect, 在项目里开会话 } from "./fixtures.js"

test.describe("automatic artifact sources and explicit result retention", () => {
  test.use({
    dawnOptions: {
      gitInit: true,
      toolCall: {
        toolName: "write",
        args: { path: "outputs/retained.csv", content: "n,value\n4,2\n" },
        say: "正在生成结果",
      },
    },
  })
  test("saved output survives live overwrite and opens through the project retention panel", async ({
    dawn,
  }, testInfo) => {
    const { page } = dawn
    await 在项目里开会话(page)
    const input = page.getByPlaceholder(/输入问题/)
    await input.fill("生成一份分析结果")
    await input.press("Enter")
    const generated = page.getByRole("group", { name: "本轮生成的文件" })
    await expect(generated).toBeVisible({ timeout: 60000 })
    await generated
      .getByRole("button", { name: "查看产物", exact: true })
      .click()
    const controls = page.getByRole("region", {
      name: "结果保留与来源",
      exact: true,
    })
    await expect(
      controls.getByRole("textbox", { name: "留存名称", exact: true }),
    ).toHaveCount(0)
    await expect(
      controls.getByText("实际工具参数", { exact: true }),
    ).toHaveCount(0)
    const panel = page.getByRole("region", { name: "分析交付", exact: true })
    await expect(
      panel.getByRole("button", { name: "整理交付", exact: true }),
    ).toHaveCount(0)
    await controls
      .getByRole("button", { name: "保留当前结果", exact: true })
      .click()
    await expect(controls.getByText("已保留", { exact: true })).toBeVisible()
    await expect(panel.locator(".artifacts-preview")).toBeVisible()
    await controls.getByText("详细来源", { exact: true }).click()
    await expect(
      controls.getByText("实际工具参数", { exact: true }),
    ).toBeVisible()
    await controls.getByText("详细来源", { exact: true }).click()
    await page.screenshot({
      path: testInfo.outputPath("retained-result-panel.png"),
    })
    writeFileSync(
      join(dawn.workspace, "outputs/retained.csv"),
      "n,value\n999,999\n",
    )
    await panel.getByRole("button", { name: "历史", exact: true }).click()
    const history = page.getByRole("region", {
      name: "已保留版本",
      exact: true,
    })
    await history
      .getByRole("button", {
        name: "打开已保留文件 outputs/retained.csv",
        exact: true,
      })
      .click()
    await expect(
      history.getByText("正在查看留存副本，工作区当前文件可能不同", {
        exact: true,
      }),
    ).toBeVisible()
    await expect(history.locator(".artifact-retained-preview")).toContainText(
      "4",
    )
    await expect(
      history.locator(".artifact-retained-preview"),
    ).not.toContainText("999")
    await page.screenshot({
      path: testInfo.outputPath("retained-history-preview.png"),
    })
  })
  test("one-click retention and history stay usable in a narrow English dock", async ({
    dawn,
  }, info) => {
    const { page, app } = dawn
    await page.addInitScript(() =>
      localStorage.setItem("dawn.global.lang", "en"),
    )
    await 在项目里开会话(page)
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]!.setContentSize(960, 640),
    )
    await page
      .getByPlaceholder(/Enter a question/)
      .fill("Generate a sample result")
    await page.getByPlaceholder(/Enter a question/).press("Enter")
    await page
      .getByRole("button", { name: "View artifacts", exact: true })
      .click()
    const controls = page.getByRole("region", {
      name: "Result retention and source",
      exact: true,
    })
    await controls
      .getByRole("button", { name: "Retain current result", exact: true })
      .click()
    await expect(controls.getByText("Saved", { exact: true })).toBeVisible()
    expect(await controls.innerText()).not.toMatch(/[一-鿿]/)
    expect(
      await page.locator(".delivery-header > strong").evaluate((el) => {
        const range = document.createRange()
        range.selectNodeContents(el)
        return range.getClientRects().length
      }),
    ).toBe(1)
    const headerFit = await page.locator(".delivery-header").evaluate((el) => {
      const h = el.getBoundingClientRect(),
        title = el.querySelector("strong")!.getBoundingClientRect(),
        actions = el
          .querySelector(".artifact-page-actions")!
          .getBoundingClientRect()
      return {
        titleRight: title.right,
        actionsLeft: actions.left,
        actionsRight: actions.right,
        right: h.right,
      }
    })
    expect(headerFit.titleRight).toBeLessThanOrEqual(headerFit.actionsLeft + 1)
    expect(headerFit.actionsRight).toBeLessThanOrEqual(headerFit.right + 1)
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
    await page.screenshot({
      path: info.outputPath("simple-artifacts-narrow-english.png"),
    })
    await page.getByRole("button", { name: "History", exact: true }).click()
    await page
      .getByRole("button", {
        name: "Open saved file outputs/retained.csv",
        exact: true,
      })
      .click()
    await expect(page.locator(".artifact-retained-preview")).toContainText("4")
  })
  test("source query leaves old files untouched; preserving current content is explicitly late capture", async ({
    dawn,
  }) => {
    const { page } = dawn
    await 在项目里开会话(page)
    writeFileSync(join(dawn.workspace, "old.csv"), "n,value\n8,3\n")
    const result = await page.evaluate(async () => {
      const w = window as unknown as {
        dawn: {
          invoke: (
            operation: string,
            request: unknown,
          ) => Promise<{ ok: boolean; data?: unknown; error?: unknown }>
        }
      }
      const tasks = (await w.dawn.invoke("listTasks", {})) as {
        data: { sessionId?: string }[]
      }
      const sessionId = tasks.data.find((t) => t.sessionId)?.sessionId
      if (!sessionId) throw new Error("missing fixture session")
      const before = await w.dawn.invoke("getArtifactHistory", {
        sessionId,
        path: "old.csv",
      })
      const saved = await w.dawn.invoke("captureAndRetainCurrent", {
        sessionId,
        path: "old.csv",
        name: "old",
        requestId: "late-capture",
      })
      return { before, saved }
    })
    expect(result.before.data).toMatchObject({ observations: [] })
    expect(result.saved.data).toMatchObject({
      members: [
        { observation: { relation: "late_capture", attribution: "unknown" } },
      ],
    })
  })
  test("actual interpreter snapshots belong to each Python/R notebook execution", async ({
    dawn,
  }) => {
    const python =
        process.env.DAWN_TEST_PYTHON ??
        join(process.cwd(), ".venv-kernel", "bin", "python"),
      r = process.env.DAWN_TEST_R ?? "/usr/local/bin/R"
    test.skip(
      !existsSync(python) || !existsSync(r),
      "Local Python/R acceptance interpreters unavailable",
    )
    const { page } = dawn
    await 在项目里开会话(page)
    const sources = await page.evaluate(
      async ({ python, r }) => {
        const w = window as unknown as {
          dawn: {
            invoke: (
              operation: string,
              request: unknown,
            ) => Promise<{ ok: boolean; data?: unknown; error?: unknown }>
          }
        }
        const invoke = async (operation: string, request: unknown) => {
          const response = await w.dawn.invoke(operation, request)
          if (!response.ok) throw new Error(JSON.stringify(response.error))
          return response.data
        }
        const tasks = (await invoke("listTasks", {})) as {
            sessionId?: string
          }[],
          sessionId = tasks.find((t) => t.sessionId)!.sessionId!
        await invoke("setInterpreter", { language: "python", path: python })
        await invoke("setInterpreter", { language: "R", path: r })
        const out = []
        for (const language of ["python", "R"]) {
          const path =
              language === "python" ? "python-result.csv" : "r-result.csv",
            code =
              language === "python"
                ? `with open('${path}','w') as f: f.write('n,value\\n3,2\\n')`
                : `writeLines(c('n,value','3,2'),'${path}')`
          await invoke("runInKernel", { sessionId, language, code })
          const history = (await invoke("getArtifactHistory", {
            sessionId,
            path,
          })) as { observations: { id: string }[] }
          const source = (await invoke("getArtifactSource", {
            sessionId,
            observationId: history.observations[0]!.id,
          })) as {
            execution: {
              runId: string
              environment: { id: string; kind: string; language: string }
            }
          }
          const run = (await invoke("getRun", {
            runId: source.execution.runId,
          })) as { environmentSnapshotId?: string }
          out.push({ language, source, run })
        }
        return out
      },
      { python, r },
    )
    for (const result of sources) {
      expect(result.source.execution.environment.kind).toBe("kernel")
      expect(result.source.execution.environment.language).toBe(result.language)
      expect(result.run.environmentSnapshotId).toBe(
        result.source.execution.environment.id,
      )
    }
  })
})
