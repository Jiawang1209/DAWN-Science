import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, expect, 在项目里开会话, 进坞 } from "./fixtures.js";

test("交付验证日志：跨块中文和表情在真实Python、落盘及预览中保持原文", async ({ dawn }, info) => {
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
  const model = readFileSync(join(workspace, "results/model.csv"), "utf8");
  const summary = readFileSync(join(workspace, "results/summary.json"), "utf8");
  writeFileSync(join(workspace, "analysis/run_analysis.py"), `# DAWN_DELIVERY_FIXTURE\nimport pathlib,sys,os,time\nout=pathlib.Path(sys.argv[2])\n(out/'model.csv').write_text(${JSON.stringify(model)})\n(out/'summary.json').write_text(${JSON.stringify(summary)})\na='模型完成🌱'.encode('utf-8');b='警告说明🧪'.encode('utf-8')\nos.write(1,a[:1]);os.write(2,b[:2]);time.sleep(.08)\nos.write(1,a[1:]);os.write(2,b[2:])\n`);
  await 进坞(page, "产物");
  const panel = page.getByRole("region", { name: "分析交付", exact: true });
  await panel.getByRole("button", { name: "整理交付", exact: true }).click();
  for (const name of ["run_analysis.py", "model.csv", "summary.json"])
    await panel.getByRole("checkbox", { name: new RegExp(name.replace(".", "\\.")) }).check();
  await panel.getByRole("button", { name: "下一步", exact: true }).click();
  await panel.getByLabel("交付名称", { exact: true }).fill("日志编码核验");
  await panel.getByRole("button", { name: "开始整理", exact: true }).click();
  await panel.getByRole("button", { name: "继续设置运行验证", exact: true }).click();
  await panel.getByRole("checkbox", { name: /已核对脚本/ }).check();
  await panel.getByRole("button", { name: "启动独立验证", exact: true }).click();
  await expect(panel.getByText("选定输出重跑通过", { exact: true })).toBeVisible({ timeout: 30_000 });
  for (const [file, text] of [["stdout.log", "模型完成🌱"], ["stderr.log", "警告说明🧪"]]) {
    await panel.locator(`[data-delivery-file$="/${file}"]`).click();
    const preview = page.getByRole("region", { name: "交付文件预览", exact: true });
    await expect(preview).toContainText(text!);
    await expect(preview).not.toContainText("�");
    await page.screenshot({ path: info.outputPath(`${file}.png`) });
    await preview.getByRole("button", { name: "交付详情", exact: true }).click();
  }
});
