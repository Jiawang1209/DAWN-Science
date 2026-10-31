/** Mac 安装生命周期演练：只替换临时目录中的副本，保留同一份隔离用户数据。 */
import { _electron, expect } from "@playwright/test"
import { build } from "esbuild"
import { execFileSync } from "node:child_process"
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, renameSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { pathToFileURL } from "node:url"

if (process.platform !== "darwin" || !process.env.DAWN_PACKAGED_BIN) throw new Error("在 Mac 上设置 DAWN_PACKAGED_BIN 指向待验包的执行文件")
const root = resolve(import.meta.dirname, "..")
const sourceExe = resolve(process.env.DAWN_PACKAGED_BIN)
const sourceBundle = dirname(dirname(dirname(sourceExe)))
const testRoot = mkdtempSync(join(tmpdir(), "dawn-onboarding-install-"))
const artifacts = resolve(process.env.DAWN_ONBOARDING_ARTIFACTS ?? join(root, "artifacts", `onboarding-installation-${new Date().toISOString().slice(0, 10)}`))
mkdirSync(artifacts, { recursive: true })
const installed = join(testRoot, "DAWN Science.app")
const exe = join(installed, "Contents", "MacOS", "DAWN Science")
const profile = join(testRoot, "profile")
const workspace = join(testRoot, "workspace")
const config = join(testRoot, "providers.yaml")
mkdirSync(workspace)
writeFileSync(config, "agents:\n  ds-chat:\n    kind: native\n    provider: deepseek\n    model: deepseek-flash\n    capabilities: [chat, exec]\n")
const originalConfig = readFileSync(config, "utf8")
const report = { testRoot, checks: [], errors: [] }
let app, page
const save = () => writeFileSync(join(artifacts, "lifecycle.json"), JSON.stringify(report, null, 2))
const check = name => { report.checks.push(name); console.log(`✓ ${name}`); save() }
const launch = async () => {
  app = await _electron.launch({
    executablePath: exe,
    args: [`--user-data-dir=${profile}`, "--use-mock-keychain"],
    env: { ...process.env, DAWN_HIDE_WINDOW: "1", DAWN_CONFIG: config, DAWN_DB: join(profile, "dawn.db"),
      DAWN_DEFAULT_WORKSPACE: workspace, DAWN_SCRATCH_ROOT: join(testRoot, "scratch"),
      DAWN_CLI_HOME: join(testRoot, "cli"), DAWN_SKILLS_DIR: join(testRoot, "skills"),
      DAWN_MEMORIES_DIR: join(testRoot, "memories"), DAWN_AGENTS_DIR: join(testRoot, "agents"),
      DAWN_SKIP_CREDENTIAL_GATE: "1" },
  })
  page = await app.firstWindow()
  await page.locator(".app-shell").waitFor({ timeout: 30_000 })
  return page.evaluate(() => window.dawn.onboardingInstallationId)
}
const quit = async () => { if (app) { await app.close(); app = undefined } }
const welcome = async () => {
  await expect(page.getByRole("heading", { name: "欢迎使用 DAWN Science" })).toBeVisible()
  await expect(page.getByRole("list", { name: "设置进度" }).locator("li")).toHaveCount(4)
}
const skip = async () => {
  await page.getByRole("button", { name: "先跳过", exact: true }).click()
  await expect(page.locator(".setup-wizard")).toHaveCount(0)
}
const retained = async () => {
  const value = await page.evaluate(async () => {
    const credentials = await window.dawn.invoke("listCredentials", {})
    const tasks = await window.dawn.invoke("listTasks", {})
    return { configured: credentials.data.configured, sessions: tasks.data, sentinel: localStorage.getItem("onboarding-test-preserved") }
  })
  expect(value.configured).toContain("deepseek")
  expect(value.sessions.length).toBeGreaterThan(0)
  expect(value.sentinel).toBe("existing-user-data")
  expect(readFileSync(config, "utf8")).toBe(originalConfig)
}

try {
  execFileSync("/usr/bin/ditto", [sourceBundle, installed])
  const first = await launch()
  expect(first).toMatch(/^[a-f\d-]{36}$/)
  await welcome()
  // 模拟重装保留的旧完成标记，不能绕过新安装的第 1 步。
  await page.evaluate(async () => {
    localStorage.setItem("dawn.global.setupSkipped", "1")
    localStorage.setItem("dawn.global.onboardingDone", "1")
    localStorage.setItem("onboarding-test-preserved", "existing-user-data")
    const credential = await window.dawn.invoke("setCredential", { providerId: "deepseek", secret: "fixture-not-a-real-key" })
    if (credential.error) throw new Error("fixture credential failed")
    const task = await window.dawn.invoke("createTask", { agentId: "ds-chat" })
    if (task.error) throw new Error(`fixture task failed: ${JSON.stringify(task.error)}`)
  })
  await page.reload()
  await welcome()
  await page.screenshot({ path: join(artifacts, "fresh-install-step-one.png") })
  check("保留旧完成标记，新安装仍显示四步第 1 步")
  await page.getByRole("button", { name: "下一页", exact: true }).click()
  await expect(page.getByRole("heading", { name: "让研究工作在这里衔接" })).toBeVisible()
  await quit()
  expect(await launch()).toBe(first)
  await welcome()
  check("引导未完成时重启从第 1 步开始")
  await skip()
  await quit()
  expect(await launch()).toBe(first)
  await expect(page.locator(".setup-wizard")).toHaveCount(0)
  await retained()
  check("普通重启保留已跳过状态、凭证、会话、配置和用户存储")
  await quit()

  renameSync(installed, `${installed}.manual-backup`)
  execFileSync("/usr/bin/ditto", [sourceBundle, installed])
  const second = await launch()
  expect(second).not.toBe(first)
  await welcome()
  await retained()
  await page.screenshot({ path: join(artifacts, "same-version-reinstall-step-one.png") })
  check("同路径同版本覆盖安装，保留数据但从四步第 1 步重新开始")
  for (let step = 0; step < 3; step++) await page.getByRole("button", { name: "下一页", exact: true }).click()
  await expect(page.getByRole("heading", { name: "连接你的计算环境" })).toBeVisible()
  await page.getByRole("button", { name: "跳过，进入工作台", exact: true }).click()
  await expect(page.locator(".setup-wizard")).toHaveCount(0)
  check("四步可完整走完，沿用已有密钥，可稍后配置解释器")
  await quit()

  // 用生产换包/世代逻辑实际换一个同构建副本，隔离验证文件实例改变的接续。
  const helper = join(testRoot, "update-helper.mjs")
  await build({ stdin: { contents: 'export {createOnboardingInstallation} from "./src/electron/onboarding-installation.ts"; export {换包} from "./src/update/换包.ts"; export {本机换包依赖} from "./src/update/本机安装器.ts";', resolveDir: root }, outfile: helper, bundle: true, platform: "node", format: "esm" })
  const { createOnboardingInstallation, 换包, 本机换包依赖 } = await import(pathToFileURL(helper).href)
  const version = JSON.parse(readFileSync(join(installed, "Contents", "Resources", "app", "package.json"))).version
  const generation = createOnboardingInstallation({ stateFile: join(profile, "onboarding-installation.json"),
    identityPaths: [installed, exe, join(installed, "Contents", "Resources", "app", "package.json")], log: message => report.errors.push(message) })
  expect(generation.id).toBe(second)
  const zip = join(testRoot, "update.zip")
  execFileSync("/usr/bin/ditto", ["-c", "-k", "--keepParent", sourceBundle, zip])
  await 换包({ 方式: "mac-zip", 包路径: zip, 期望版本: version, 当前版本: version, 应用路径: installed }, 本机换包依赖)
  generation.adoptAutomaticUpdate()
  expect(await launch()).toBe(second)
  await expect(page.locator(".setup-wizard")).toHaveCount(0)
  await retained()
  await page.screenshot({ path: join(artifacts, "after-controlled-update.png") })
  check("生产换包逻辑成功后接续世代，升级保留已完成状态及用户数据")
  await quit()
  // 再验原目录直接覆盖，不先移走旧 .app，避免只覆盖“删除后重新复制”场景。
  execFileSync("/usr/bin/ditto", [sourceBundle, installed])
  expect(await launch()).not.toBe(second)
  await welcome()
  await retained()
  await page.screenshot({ path: join(artifacts, "inplace-overwrite-step-one.png") })
  check("同一目录直接覆盖安装，也从四步第 1 步开始且保留用户数据")
} catch (error) {
  console.error(error.stack ?? String(error))
  report.errors.push(error.stack ?? String(error))
  try { await page?.screenshot({ path: join(artifacts, "failure.png") }) } catch {}
  process.exitCode = 1
} finally {
  await quit()
  save()
}
