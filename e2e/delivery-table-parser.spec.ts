import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, expect, 在项目里开会话, 进坞 } from "./fixtures.js";

for (const [name, source, output, state, reason] of [
  ["原始表头变化", " id,value\nA,2.5\n", "id,value\nA,2.5\n", "运行验证失败", "表头"],
  ["带空格计数列", " n_effective ,value\n28.1,2.5\n", " n_effective ,value\n28.2,2.5\n", "运行验证失败", "28.1 / 28.2"],
  ["未闭合引号", "id,label\nA,bad\n", 'id,label\nA,"bad', "部分验证", "引号未闭合"],
] as const) {
  test(`交付表格${name}不会显示重跑通过`, async ({ dawn }, info) => {
    test.skip(!existsSync("/usr/bin/python3"), "Needs existing local Python");
    const { page, workspace } = dawn;
    await page.evaluate(async () => {
      await window.dawn!.invoke("setInterpreter", { language: "python", path: "/usr/bin/python3" });
      await window.dawn!.invoke("setPermissionMode", { mode: "allow-all" });
    });
    await 在项目里开会话(page);
    const composer = page.locator("main.main").getByPlaceholder(/输入问题/);
    await composer.fill("演示科研分析交付：本地合成数据，不联网、不安装。");
    await composer.press("Enter");
    await expect(page.locator(".turns").getByText(/合成草地分析案例已运行/)).toBeVisible({ timeout: 40_000 });
    const summary = readFileSync(join(workspace, "results/summary.json"), "utf8");
    writeFileSync(join(workspace, "results/model.csv"), source);
    writeFileSync(join(workspace, "analysis/run_analysis.py"), `# DAWN_DELIVERY_FIXTURE\nimport pathlib,sys\nout=pathlib.Path(sys.argv[2])\n(out/'model.csv').write_text(${JSON.stringify(output)},encoding='utf-8')\n(out/'summary.json').write_text(${JSON.stringify(summary)},encoding='utf-8')\n`);
    await 进坞(page, "产物");
    const panel = page.getByRole("region", { name: "分析交付", exact: true });
    await panel.getByRole("button", { name: "整理交付", exact: true }).click();
    for (const file of ["run_analysis.py", "model.csv", "summary.json"])
      await panel.getByRole("checkbox", { name: new RegExp(file.replace(".", "\\.")) }).check();
    await panel.getByRole("button", { name: "下一步", exact: true }).click();
    await panel.getByLabel("交付名称", { exact: true }).fill(name);
    await panel.getByRole("button", { name: "开始整理", exact: true }).click();
    await panel.getByRole("button", { name: "继续设置运行验证", exact: true }).click();
    await panel.getByLabel("数值比较容差").fill("0.01");
    await panel.getByRole("checkbox", { name: /已核对脚本/ }).check();
    await panel.getByRole("button", { name: "启动独立验证", exact: true }).click();
    await expect(panel.getByText(state, { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(panel.locator(".delivery-check").getByText(new RegExp(reason))).toBeVisible();
    await expect(panel.getByText("选定输出重跑通过", { exact: true })).toHaveCount(0);
    expect(readFileSync(join(workspace, "results/model.csv"), "utf8")).toBe(source);
    await page.screenshot({ path: info.outputPath("table-comparison.png") });
  });
}
