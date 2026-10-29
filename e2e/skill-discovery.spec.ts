import { test, expect, 进设置, type DawnFixture } from "./fixtures.js";
import JSZip from "jszip";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
const COMMIT = "a".repeat(40);
const MANIFEST =
  "---\nname: field-analysis\ndescription: Analyze ecological field measurements\nlicense: MIT\ncompatibility: Python 3 and pandas\n---\n# Field analysis\nRead notes/guide.md and scripts/analyze.py.\n";
async function fakeGithub(dawn: DawnFixture) {
  const zip = new JSZip(),
    root = "fixture-root/skills/field-analysis/";
  zip.file(root + "SKILL.md", MANIFEST);
  zip.file(
    root + "scripts/analyze.py",
    'print("fixture only; never executed")\n',
  );
  zip.file(root + "notes/guide.md", "# Method\nKeep the raw data.\n");
  zip.file(root + "requirements.txt", "pandas>=2\n");
  zip.file(
    "fixture-root/skills/.curated/other-skill/SKILL.md",
    "---\nname: other-skill\ndescription: Other workflow\n---\nOther\n",
  );
  for (let i = 0; i < 20; i++)
    zip.file(
      `fixture-root/skills/workflow-${i}/SKILL.md`,
      `---\nname: workflow-${i}\ndescription: Other workflow ${i}\n---\nWorkflow\n`,
    );
  const archive = await zip.generateAsync({ type: "base64" });
  await dawn.app.evaluate(
    (_electron, { archive, commit }) => {
      const original = globalThis.fetch;
      globalThis.fetch = async (input, init) => {
        const url = String(input);
        if (url.startsWith("https://api.github.com/repos/")) {
          if (/\/commits\//.test(url))
            return new Response(JSON.stringify({ sha: commit }), {
              status: 200,
            });
          return new Response(JSON.stringify({ default_branch: "main" }), {
            status: 200,
          });
        }
        if (url.startsWith("https://codeload.github.com/"))
          return new Response(Buffer.from(archive, "base64"), { status: 200 });
        return original(input, init);
      };
    },
    { archive, commit: COMMIT },
  );
}
test("Discover searches declared sources, previews full package, installs and retains offline origin after restart", async ({
  dawn,
}) => {
  await fakeGithub(dawn);
  const { page, dir } = dawn;
  await 进设置(page, "Skills");
  await page.getByRole("tab", { name: "发现技能", exact: true }).click();
  await page.getByLabel("搜索在线技能", { exact: true }).fill("");
  await page.getByRole("button", { name: "检索技能源", exact: true }).click();
  const result = page
    .locator(".skill-discovery-results li")
    .filter({ hasText: "field-analysis" });
  await expect(result).toHaveCount(1);
  await result
    .getByRole("button", { name: "预览 field-analysis", exact: true })
    .click();
  const detail = page.getByRole("region", { name: "技能详情", exact: true });
  await expect(detail.getByText(COMMIT, { exact: true })).toBeVisible();
  await expect(detail).toBeFocused();
  await expect(detail).toContainText("格式检查通过");
  await expect(detail).toContainText("DAWN 运行未验证");
  await detail
    .getByRole("button", { name: "notes/guide.md", exact: true })
    .click();
  await expect(detail.locator("pre")).toContainText("Keep the raw data.");
  await page.screenshot({
    path: "test-results/skill-discovery-detail.png",
    fullPage: true,
  });
  const packageDir = join(dir, "skills", "field-analysis");
  expect(existsSync(packageDir)).toBe(false);
  await detail.getByRole("button", { name: "安装此技能", exact: true }).click();
  await expect(detail).toContainText("已安装：field-analysis");
  expect(readFileSync(join(packageDir, "SKILL.md"), "utf8")).toBe(MANIFEST);
  expect(
    readFileSync(join(packageDir, "scripts/analyze.py"), "utf8"),
  ).toContain("never executed");
  const origin = JSON.parse(
    readFileSync(join(packageDir, ".dawn-source.json"), "utf8"),
  );
  expect(origin).toMatchObject({
    repository: "anthropics/skills",
    ref: "main",
    commit: COMMIT,
    path: "skills/field-analysis",
    runtimeVerification: "not_verified",
  });
  await page.getByRole("tab", { name: "已安装", exact: true }).click();
  const row = page.locator(".skill-row").filter({ hasText: "field-analysis" });
  await row.getByRole("button", { name: "查看安装来源", exact: true }).click();
  await expect(row).toContainText(COMMIT);
  const reopened = await dawn.重开();
  await 进设置(reopened, "Skills");
  const restored = reopened
    .locator(".skill-row")
    .filter({ hasText: "field-analysis" });
  await restored
    .getByRole("button", { name: "查看安装来源", exact: true })
    .click();
  await expect(restored).toContainText(COMMIT);
});
test("GitHub file URL selects one package and refuses an existing name without changing its files", async ({
  dawn,
}) => {
  await fakeGithub(dawn);
  const { page, dir } = dawn;
  await 进设置(page, "Skills");
  await page.getByRole("tab", { name: "发现技能", exact: true }).click();
  const url =
    "https://github.com/owner/science-skills/blob/main/skills/field-analysis/SKILL.md";
  await page.getByLabel("GitHub 链接", { exact: true }).fill(url);
  await page.getByRole("button", { name: "解析链接", exact: true }).click();
  await page
    .getByRole("button", { name: "预览 field-analysis", exact: true })
    .click();
  const detail = page.getByRole("region", { name: "技能详情", exact: true });
  await detail.getByRole("button", { name: "安装此技能", exact: true }).click();
  await expect(detail).toContainText("已安装：field-analysis");
  const packageDir = join(dir, "skills", "field-analysis"),
    before = readFileSync(join(packageDir, "SKILL.md"), "utf8");
  await page.getByRole("button", { name: "关闭详情", exact: true }).click();
  await page
    .getByRole("button", { name: "预览 field-analysis", exact: true })
    .click();
  await detail.getByRole("button", { name: "安装此技能", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    /exists|conflict|existing|name/i,
  );
  expect(readFileSync(join(packageDir, "SKILL.md"), "utf8")).toBe(before);
  expect(
    JSON.parse(readFileSync(join(packageDir, ".dawn-source.json"), "utf8"))
      .sourceUrl,
  ).toBe(url);
});

test('Discovery details remain usable in the compact Settings column',async({dawn})=>{
 await fakeGithub(dawn)
 const {page}=dawn
 await page.getByRole('button',{name:'设置',exact:true}).click()
 const column=page.locator('.settings-column')
 await column.locator('[data-settings-section="agent-skills"]').count().then(async count=>{
  if(count)await column.locator('[data-settings-section="agent-skills"]').click()
  else await column.getByRole('button',{name:/^Skills/}).click()
 })
 await column.getByRole('tab',{name:'发现技能',exact:true}).click()
 await column.getByLabel('GitHub 链接',{exact:true}).fill('https://github.com/owner/science-skills/tree/main/skills/field-analysis')
 await column.getByRole('button',{name:'解析链接',exact:true}).click()
 await column.getByRole('button',{name:'预览 field-analysis',exact:true}).click()
 const detail=column.getByRole('region',{name:'技能详情',exact:true})
 await expect(detail).toBeFocused()
 await detail.getByRole('button',{name:'安装此技能',exact:true}).scrollIntoViewIfNeeded()
 expect(await column.evaluate(el=>el.scrollWidth-el.clientWidth)).toBeLessThanOrEqual(1)
 expect(await detail.locator(".skill-package-preview").evaluate(el=>getComputedStyle(el).gridTemplateColumns.trim().split(/\s+/).length)).toBe(1)
 await page.screenshot({path:'test-results/skill-discovery-compact.png',fullPage:true})
})
