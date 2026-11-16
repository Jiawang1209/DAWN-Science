/** Current source in an isolated macOS bundle, isolated profiles and fake credentials only. */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, cpSync, symlinkSync, rmSync, renameSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import assert from 'node:assert/strict'
import { _electron, expect, type ElectronApplication, type Page } from '@playwright/test'
// @ts-expect-error shared deterministic localhost provider
import { startMockInferenceServer, mockModelsJson } from './mock-inference-server.mjs'
if (process.platform !== 'darwin') throw Error('This isolated packaged verification targets macOS')
const source = resolve('.'), out = resolve(process.argv[2] ?? join(tmpdir(), 'dawn-onboarding-retention-result'))
mkdirSync(out, {recursive:true})
const root = mkdtempSync(join(tmpdir(), 'dawn-packaged-retention-'))
const bundle = join(root,'DAWN Science.app'), exe = join(bundle,'Contents/MacOS/DAWN Science')
const appRoot = join(bundle,'Contents/Resources/app'), config = join(root,'providers.yaml'), models = join(root,'models.json')
let app: ElectronApplication | undefined
let profile = join(root,'fresh-profile')
const checks: string[] = []
const server = await startMockInferenceServer()
const home = async (page: Page) => {
  await expect(page.getByRole('heading',{name:'DAWN Science',exact:true})).toBeVisible()
  await expect(page.locator('.setup-wizard')).toHaveCount(0)
}
const quit = async () => { await app?.close(); app = undefined }
const skip = async (page: Page) => {
  const wizard = page.locator('.setup-wizard')
  await wizard.getByRole('button',{name:'下一页',exact:true}).click()
  await wizard.getByRole('button',{name:'下一页',exact:true}).click()
  await wizard.getByRole('button',{name:'稍后配置',exact:true}).click()
  await wizard.getByRole('button',{name:'跳过，进入首页',exact:true}).click()
  await home(page)
}
try {
  execFileSync('/bin/cp',['-cR','/Applications/DAWN Science.app',bundle])
  rmSync(appRoot,{recursive:true,force:true});mkdirSync(appRoot,{recursive:true})
  cpSync(join(source,'dist'),join(appRoot,'dist'),{recursive:true})
  for (const name of ['node_modules','skills','agents']) symlinkSync(join(source,name),join(appRoot,name),'dir')
  const pkg=JSON.parse(readFileSync(join(source,'package.json'),'utf8'));pkg.version='0.0.50'
  writeFileSync(join(appRoot,'package.json'),JSON.stringify(pkg))
  writeFileSync(config,'agents:\n  fixture:\n    kind: native\n    provider: deepseek\n    model: deepseek-flash\n    capabilities: [chat]\n')
  writeFileSync(models,JSON.stringify(mockModelsJson(server.url)))
  const originalConfig=readFileSync(config)
  const open = async () => {
    mkdirSync(profile,{recursive:true})
    // Do not inherit real model credentials or other DAWN_* paths from the caller.
    const env=Object.fromEntries(Object.entries(process.env).filter(([name])=>!name.startsWith('DAWN_')&&!/API_KEY|TOKEN|SECRET|PASSWORD/.test(name)))
    app=await _electron.launch({executablePath:exe,args:[`--user-data-dir=${profile}`,'--use-mock-keychain'],env:{...env,
      DAWN_CONFIG:config,DAWN_DB:join(profile,'dawn.db'),DAWN_DEFAULT_WORKSPACE:join(root,'workspace'),DAWN_MODELS_JSON:models,
      DAWN_SKIP_CREDENTIAL_GATE:'1',DAWN_HIDE_WINDOW:'1',DAWN_NO_EXTERNAL:'1',DAWN_CLI_HOME:join(root,'cli'),
      DAWN_SKILLS_DIR:join(root,'skills'),DAWN_MEMORIES_DIR:join(root,'memories'),DAWN_AGENTS_DIR:join(root,'agents'),
      DAWN_SCRATCH_ROOT:join(root,'scratch'),DAWN_DOWNLOADS:join(root,'downloads')}})
    assert.equal(await app.evaluate(({app:runtime})=>runtime.isPackaged),true)
    const page=await app.firstWindow()
    await page.evaluate(()=>localStorage.setItem('dawn.global.lang','zh'));await page.reload()
    await page.waitForFunction(()=>!!window.dawn?.onboardingInstallationId)
    return page
  }
  let page=await open()
  await expect(page.getByRole('heading',{name:'欢迎使用 DAWN Science',exact:true})).toBeVisible()
  await quit();page=await open()
  await expect(page.getByRole('heading',{name:'欢迎使用 DAWN Science',exact:true})).toBeVisible()
  checks.push('Genuinely new profile retains the four-step guide until explicitly finished or skipped')
  await skip(page);await quit();page=await open();await home(page)
  checks.push('Skipped without configuring a model: full process restart opens homepage')

  profile=join(root,'legacy-profile');await quit();page=await open()
  await page.evaluate(()=>{
    localStorage.setItem('dawn.global.onboardingDone.old-install@0.0.49','1')
    localStorage.setItem('dawn.global.setupSkipped.old-install@0.0.49','1')
  })
  await page.reload();await home(page)
  assert.equal(await page.evaluate(()=>localStorage.getItem('dawn.global.onboardingDone.old-install@0.0.49')),'1')
  checks.push('Older installation/version flags migrate without deleting prior data')

  // Model-only historical user: remove all guide flags, retain an encrypted fake credential.
  await page.evaluate(async()=>{
    const r=await window.dawn!.invoke('setCredential',{providerId:'deepseek',secret:'fixture-not-a-real-key'}) as {ok:boolean}
    if(!r.ok) throw Error('Unable to save isolated fake credential')
    for(const key of Object.keys(localStorage)) if(key.startsWith('dawn.global.onboardingDone')||key.startsWith('dawn.global.setupSkipped')) localStorage.removeItem(key)
  })
  const credentialFile=join(profile,'credentials.json'),credentialBytes=readFileSync(credentialFile)
  await quit();page=await open();await home(page)
  const ids=await page.evaluate(async()=>{
    const r=await window.dawn!.invoke('listCredentials',{}) as {data:{configured:string[]}}
    return r.data.configured
  })
  assert.ok(ids.includes('deepseek'))
  assert.deepEqual(readFileSync(credentialFile),credentialBytes)
  checks.push('Stored API configuration alone bypasses guide; credential bytes are unchanged')

  await page.locator('.app-home-status').getByRole('button',{name:'导航栏',exact:true}).click()
  await expect(page.getByRole('heading',{name:'欢迎使用 DAWN Science',exact:true})).toBeVisible()
  await page.getByRole('button',{name:'下一页',exact:true}).click()
  assert.equal(await page.evaluate(()=>localStorage.getItem('dawn.global.onboardingDone')),'1')
  await quit();page=await open();await home(page)
  checks.push('Manual navigation opens the guide without invalidating durable acceptance')
  const firstId=await page.evaluate(()=>window.dawn!.onboardingInstallationId)
  await quit()
  pkg.version='0.0.51';writeFileSync(join(appRoot,'package.json'),JSON.stringify(pkg))
  execFileSync('/usr/libexec/PlistBuddy',['-c','Set :CFBundleShortVersionString 0.0.51',join(bundle,'Contents/Info.plist')])
  page=await open();await home(page)
  assert.notEqual(await page.evaluate(()=>window.dawn!.onboardingInstallationId),firstId)
  assert.deepEqual(readFileSync(credentialFile),credentialBytes)
  checks.push('Changed application version opens homepage with the same credential file')
  await quit()
  renameSync(bundle,bundle+'.previous');execFileSync('/bin/cp',['-cR',bundle+'.previous',bundle])
  page=await open();await home(page)
  assert.deepEqual(readFileSync(credentialFile),credentialBytes);assert.deepEqual(readFileSync(config),originalConfig)
  checks.push('Replaced application bundle keeps guide acceptance, API configuration and provider YAML')
  await page.screenshot({path:join(out,'retained-homepage.png')})
  writeFileSync(join(out,'result.json'),JSON.stringify({checks,actualPackagedStartup:true,isolatedProfiles:true,realCredentialsUsed:false,
    limitations:['Current source overlaid into an isolated installed-bundle copy; no real updater download or release-signing certification.']},null,2)+'\n')
  console.log(JSON.stringify({passed:checks.length,checks},null,2))
} finally {
  try {await quit()} finally {try {await server.close()} finally {rmSync(root,{recursive:true,force:true})}}
}
