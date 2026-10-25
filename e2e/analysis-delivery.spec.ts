import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, expect, 在项目里开会话, 进坞 } from "./fixtures.js";
import type { DeliveryRecord } from "../src/protocol/delivery.js";
test.use({ dawnOptions: { gitInit: true } });
async function configure(page: import("@playwright/test").Page) {
  await page.evaluate(async () => {
    const w = window as unknown as {
      dawn: { invoke: (op: string, r: unknown) => Promise<unknown> };
    };
    await w.dawn.invoke("setInterpreter", {
      language: "python",
      path: "/usr/bin/python3",
    });
    await w.dawn.invoke("setPermissionMode", { mode: "allow-all" });
  });
}
test("科研交付：真实输出→选择→结果解读→独立重跑→保留记录和图片预览", async ({
  dawn,
}) => {
  test.skip(
    !existsSync("/usr/bin/python3"),
    "This local interpreter acceptance case needs /usr/bin/python3",
  );
  const { page, workspace } = dawn;
  await configure(page);
  await 在项目里开会话(page);
  const composer = page
    .locator("main.main")
    .getByPlaceholder(/输入问题/);
  await composer.fill(
    "演示科研分析交付：允许在当前工作区用合成数据创建输入和脚本，并真实运行分析；不安装、不联网、不清理已有目录。",
  );
  await composer.press("Enter");
  await expect(
    page.locator(".turns").getByText(/合成草地分析案例已运行/),
  ).toBeVisible({ timeout: 40_000 });
  const source = readFileSync(join(workspace, "results/summary.json"), "utf8");
  expect(JSON.parse(source).n_effective).toBe(28);
  await 进坞(page, "产物");
  const panel = page.getByRole("region", { name: "分析交付", exact: true });
  await panel.getByRole("button", { name: "整理交付", exact: true }).click();
  for (const name of [
    "run_analysis.py",
    "model.csv",
    "summary.json",
    "analysis_report.md",
    "regression.png",
  ])
    await panel
      .getByRole("checkbox", { name: new RegExp(name.replace(".", "\\.")) })
      .check();
  await panel.getByRole("button", { name: "下一步", exact: true }).click();
  await panel
    .getByLabel("交付名称", { exact: true })
    .fill("草地水分与生物量交付");
  await panel.locator("textarea").fill("data/raw/grassland.csv");
  await expect(panel.getByRole("radio", { name: /仅整理/ })).toBeChecked();
  await panel.getByRole("button", { name: "开始整理", exact: true }).click();
  await expect(
    panel.getByRole("button", { name: "阅读结果解读", exact: true }),
  ).toBeVisible({ timeout: 30_000 });
  await expect(panel.getByText("未运行验证", { exact: true })).toBeVisible();
  await panel
    .getByRole("button", { name: "阅读结果解读", exact: true })
    .click();
  await expect(page.locator(".delivery-preview")).toContainText(
    "有效样本 28 / 30",
  );
  await expect(page.locator(".delivery-preview")).toContainText(
    "不代表水分变化导致生物量变化",
  );
  await page
    .locator(".delivery-preview")
    .getByRole("button", { name: "收起预览", exact: true })
    .click();
  await panel
    .getByRole("button", { name: "继续设置运行验证", exact: true })
    .click();
  await panel.getByRole("checkbox", { name: /已核对脚本/ }).check();
  await panel
    .getByRole("button", { name: "启动独立验证", exact: true })
    .click();
  await expect(
    panel.getByText("选定输出重跑通过", { exact: true }),
  ).toBeVisible({ timeout: 30_000 });
  await expect(panel.getByText(/完整比较 1 行、6 列/)).toBeVisible();
  const records = await page.evaluate(async () => {
    const w = window as unknown as {
      dawn: { invoke: (op: string, r: unknown) => Promise<{ data: unknown }> };
    };
    const tasks = (await w.dawn.invoke("listTasks", {})) as {
      data: { sessionId: string }[];
    };
    return (
      await w.dawn.invoke("listAnalysisDeliveries", {
        sessionId: tasks.data[0]!.sessionId,
      })
    ).data as { records: DeliveryRecord[] };
  });
  const record = records.records[0]!;
  expect(record.verification.state).toBe("passed");
  expect(record.files.some((f) => f.path.endsWith("verification.json"))).toBe(
    true,
  );
  expect(readFileSync(join(workspace, "results/summary.json"), "utf8")).toBe(
    source,
  );
  expect(
    readFileSync(join(workspace, record.directory, "结果解读.md"), "utf8"),
  ).toContain("28 / 30");
  await panel
    .getByRole("button", {
      name: "regression.png files/results/regression.png",
      exact: true,
    })
    .click();
  await expect(page.locator(".delivery-preview img")).toBeVisible();
  expect(
    await page
      .locator(".delivery-preview img")
      .evaluate((img: HTMLImageElement) => img.naturalWidth),
  ).toBe(640);
  await page
    .locator(".delivery-preview")
    .getByRole("button", { name: "收起预览", exact: true })
    .click();
  await page.reload();
  await page.locator(".proj-session-list .sess-item .row").first().click();
  await 进坞(page, "产物");
  await expect(
    page
      .getByRole("region", { name: "分析交付", exact: true })
      .getByText("选定输出重跑通过", { exact: true }),
  ).toBeVisible();
});

for (const [field, a, b] of [
  ["id", "001", "1"],
  ["id", "9007199254740992", "9007199254740993"],
  ["category", "10000000", "10000001"],
] as const) {
  test(`交付核验拒绝 ${field} 身份变化 ${a} / ${b}`, async ({ dawn }, testInfo) => {
    test.skip(!existsSync("/usr/bin/python3"), "Needs /usr/bin/python3");
    const { page, workspace } = dawn;
    await configure(page);
    await 在项目里开会话(page);
    const composer = page.locator("main.main").getByPlaceholder(/输入问题/);
    await composer.fill("演示科研分析交付：本地合成数据，不联网、不安装。");
    await composer.press("Enter");
    await expect(page.locator(".turns").getByText(/合成草地分析案例已运行/)).toBeVisible({ timeout: 40_000 });
    // 注入差异到测试工作区；整理仍走共用 mock，核验走真实解释器和完整生产比较入口。
    const source = `${field}\n${a}\n`;
    const changed = `${field}\n${b}\n`;
    const summary = readFileSync(join(workspace, "results/summary.json"), "utf8");
    writeFileSync(join(workspace, "results/model.csv"), source);
    writeFileSync(join(workspace, "analysis/run_analysis.py"), `# DAWN_DELIVERY_FIXTURE\nimport pathlib,sys\nout=pathlib.Path(sys.argv[2])\n(out/'model.csv').write_text(${JSON.stringify(changed)})\n(out/'summary.json').write_text(${JSON.stringify(summary)})\n`);
    await 进坞(page, "产物");
    const panel = page.getByRole("region", { name: "分析交付", exact: true });
    await panel.getByRole("button", { name: "整理交付", exact: true }).click();
    for (const name of ["run_analysis.py", "model.csv", "summary.json"])
      await panel.getByRole("checkbox", { name: new RegExp(name.replace(".", "\\.")) }).check();
    await panel.getByRole("button", { name: "下一步", exact: true }).click();
    await panel.getByLabel("交付名称", { exact: true }).fill("编号类别核验回归");
    await panel.getByRole("button", { name: "开始整理", exact: true }).click();
    await expect(panel.getByRole("button", { name: "继续设置运行验证", exact: true })).toBeVisible({ timeout: 30_000 });
    await panel.getByRole("button", { name: "继续设置运行验证", exact: true }).click();
    await panel.getByLabel("数值比较容差").fill("0.000001");
    await panel.getByRole("checkbox", { name: /已核对脚本/ }).check();
    await panel.getByRole("button", { name: "启动独立验证", exact: true }).click();
    await expect(panel.getByText("运行验证失败", { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(panel.getByText(new RegExp(`${a} / ${b}`))).toBeVisible();
    await expect(panel.getByText("选定输出重跑通过", { exact: true })).toHaveCount(0);
    expect(readFileSync(join(workspace, "results/model.csv"), "utf8")).toBe(source);
    await page.screenshot({ path: testInfo.outputPath("comparison-failed.png") });
  });
}

test("整理并验证先等核对；缺少预期输出保持部分验证并保留新增图片报告", async ({
  dawn,
}) => {
  test.skip(
    !existsSync("/usr/bin/python3"),
    "This local interpreter acceptance case needs /usr/bin/python3",
  );
  const { page, workspace } = dawn;
  await configure(page);
  await 在项目里开会话(page);
  const composer = page
    .locator("main.main")
    .getByPlaceholder(/输入问题/);
  await composer.fill(
    "演示科研分析交付：允许本地合成数据分析，不联网、不安装。",
  );
  await composer.press("Enter");
  await expect(
    page.locator(".turns").getByText(/合成草地分析案例已运行/),
  ).toBeVisible({ timeout: 40_000 });
  await 进坞(page, "产物");
  const panel = page.getByRole("region", { name: "分析交付", exact: true });
  await panel.getByRole("button", { name: "整理交付", exact: true }).click();
  for (const name of ["run_analysis.py", "model.csv", "summary.json"])
    await panel
      .getByRole("checkbox", { name: new RegExp(name.replace(".", "\\.")) })
      .check();
  await panel.getByRole("button", { name: "下一步", exact: true }).click();
  await panel.getByLabel("交付名称", { exact: true }).fill("验证缺项场景");
  await panel.locator("textarea").fill("data/raw/grassland.csv");
  await panel.getByRole("radio", { name: /^整理并验证/ }).check();
  await panel
    .getByRole("button", { name: "整理并准备验证", exact: true })
    .click();
  await expect(panel.getByText("待确认运行", { exact: true })).toBeVisible();
  await panel
    .getByRole("button", { name: "确认运行验证", exact: true })
    .click();
  await panel.getByText("调整运行参数", { exact: true }).click();
  const editor = panel.getByLabel("脚本、参数与比较范围");
  const plan = JSON.parse(await editor.inputValue());
  plan.comparisons[0].output = "missing-model.csv";
  await editor.fill(JSON.stringify(plan, null, 2));
  await panel
    .getByRole("button", { name: "核对整理脚本", exact: true })
    .click();
  await page
    .locator(".delivery-preview")
    .getByRole("button", { name: "收起预览", exact: true })
    .click();
  await panel.getByText("调整运行参数", { exact: true }).click();
  await expect(panel.getByLabel("脚本、参数与比较范围")).toHaveValue(/missing-model\.csv/);
  await panel.getByRole("checkbox", { name: /已核对脚本/ }).check();
  await panel
    .getByRole("button", { name: "启动独立验证", exact: true })
    .click();
  await expect(panel.getByText("部分验证", { exact: true })).toBeVisible();
  await expect(
    panel.getByText("本次独立运行未生成预期文件", { exact: true }),
  ).toBeVisible();
  expect(await panel.getByText("regression.png", { exact: true }).count()).toBe(
    1,
  );
  expect(
    await panel.getByText("analysis_report.md", { exact: true }).count(),
  ).toBe(1);
  expect(
    JSON.parse(readFileSync(join(workspace, "results/summary.json"), "utf8"))
      .n_effective,
  ).toBe(28);
});
