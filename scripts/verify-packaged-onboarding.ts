/** Isolated packaged macOS startup: never modifies /Applications or a user's profile. */
import {execFileSync} from 'node:child_process'
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,cpSync,symlinkSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'
import {createHash} from 'node:crypto'
import assert from 'node:assert/strict'
import {_electron,expect,type ElectronApplication} from '@playwright/test'
import {createOnboardingInstallation} from '../src/electron/onboarding-installation.js'
// @ts-expect-error shared deterministic localhost provider
import {startMockInferenceServer,mockModelsJson} from './mock-inference-server.mjs'
if(process.platform!=='darwin')throw Error('This isolated packaged startup verification currently targets macOS')
const source=resolve('.'),out=resolve(process.argv[2]??'docs/validation/full-functional-regression-20261105/packaged-onboarding')
mkdirSync(out,{recursive:true})
const root=mkdtempSync(join(tmpdir(),'dawn-packaged-onboarding-')),bundle=join(root,'DAWN Science.app')
const exe=join(bundle,'Contents/MacOS/DAWN Science'),appRoot=join(bundle,'Contents/Resources/app'),profile=join(root,'profile'),workspace=join(root,'workspace')
let app:ElectronApplication|undefined
const server=await startMockInferenceServer()
try{
 execFileSync('/bin/cp',['-cR','/Applications/DAWN Science.app',bundle])
 rmSync(appRoot,{recursive:true,force:true})
 mkdirSync(appRoot,{recursive:true});mkdirSync(profile);mkdirSync(workspace)
 cpSync(join(source,'dist'),join(appRoot,'dist'),{recursive:true})
 for(const name of ['node_modules','skills','agents'])symlinkSync(join(source,name),join(appRoot,name),'dir')
 const pkg=JSON.parse(readFileSync(join(source,'package.json'),'utf8'));pkg.version='0.0.44';writeFileSync(join(appRoot,'package.json'),JSON.stringify(pkg))
 const stateFile=join(profile,'onboarding-installation.json')
 const oldUpdater=createOnboardingInstallation({stateFile,identityPaths:[bundle,exe,join(appRoot,'package.json')],log:()=>{}})
 const config=join(root,'providers.yaml'),models=join(root,'models.json')
 writeFileSync(config,'agents:\n  fixture:\n    kind: native\n    provider: deepseek\n    model: deepseek-flash\n    capabilities: [chat]\n')
 writeFileSync(models,JSON.stringify(mockModelsJson(server.url)))
 const originalConfig=readFileSync(config),configHash=createHash('sha256').update(originalConfig).digest('hex')
 const open=async()=>{
  app=await _electron.launch({executablePath:exe,args:[`--user-data-dir=${profile}`,'--use-mock-keychain'],env:{...process.env,DAWN_CONFIG:config,DAWN_DB:join(root,'dawn.db'),DAWN_DEFAULT_WORKSPACE:workspace,DAWN_MODELS_JSON:models,DAWN_SKIP_CREDENTIAL_GATE:'1',DAWN_HIDE_WINDOW:'1',DAWN_NO_EXTERNAL:'1',DAWN_CLI_HOME:join(root,'cli'),DAWN_SKILLS_DIR:join(root,'skills'),DAWN_MEMORIES_DIR:join(root,'memories'),DAWN_AGENTS_DIR:join(root,'agents'),DAWN_SCRATCH_ROOT:join(root,'scratch'),DAWN_DOWNLOADS:join(root,'downloads')}})
  assert.equal(await app.evaluate(({app:runtime})=>runtime.isPackaged),true)
  const page=await app.firstWindow();await page.waitForFunction(()=>!!window.dawn?.onboardingInstallationId)
  return page
 }
 let page=await open()
 await page.evaluate(id=>{localStorage.setItem(`dawn.global.setupSkipped.${id}`,'1');localStorage.setItem(`dawn.global.onboardingDone.${id}`,'1')},oldUpdater.id)
 await page.reload();await expect(page.getByRole('heading',{name:'欢迎使用 DAWN Science',exact:true})).toBeVisible()
 const firstId=await page.evaluate(()=>window.dawn!.onboardingInstallationId);assert.equal(firstId,oldUpdater.id+'@0.0.44')
 await page.screenshot({path:join(out,'version-44-welcome.png')})
 const wizard=page.locator('.setup-wizard')
 await wizard.getByRole('button',{name:'下一页',exact:true}).click();await wizard.getByRole('button',{name:'下一页',exact:true}).click();await wizard.getByRole('button',{name:'稍后配置',exact:true}).click();await wizard.getByRole('button',{name:'跳过，进入工作台',exact:true}).click()
 await expect(wizard).toHaveCount(0);await app!.close();app=undefined
 page=await open();await expect(page.locator('.app-shell')).toBeVisible();await expect(page.locator('.setup-wizard')).toHaveCount(0)
 assert.equal(await page.evaluate(()=>window.dawn!.onboardingInstallationId),firstId)
 await page.screenshot({path:join(out,'same-version-restart.png')});await app!.close();app=undefined
 pkg.version='0.0.45';execFileSync('/usr/libexec/PlistBuddy',['-c','Set :CFBundleShortVersionString 0.0.45',join(bundle,'Contents/Info.plist')]);writeFileSync(join(appRoot,'package.json'),JSON.stringify(pkg));oldUpdater.adoptAutomaticUpdate()
 page=await open();await expect(page.getByRole('heading',{name:'欢迎使用 DAWN Science',exact:true})).toBeVisible()
 const nextId=await page.evaluate(()=>window.dawn!.onboardingInstallationId);assert.equal(nextId,oldUpdater.id+'@0.0.45')
 const oldFlagsRetained=await page.evaluate(id=>localStorage.getItem(`dawn.global.onboardingDone.${id}@0.0.44`)==='1',oldUpdater.id);assert.equal(oldFlagsRetained,true)
 assert.deepEqual(readFileSync(config),originalConfig)
 await page.screenshot({path:join(out,'version-45-welcome.png')})
 writeFileSync(join(out,'result.json'),JSON.stringify({actualPackagedStartup:true,isolatedTemporaryBundle:true,installedAppUntouched:true,oldUpdaterStateSimulated:true,firstId,sameVersionRestartStable:true,nextId,oldFlagsRetained,existingProviderConfigPreserved:true,configHash,limitations:['Uses current source overlaid into an isolated copy of the installed macOS bundle; does not certify release signing or perform a real updater download/swap.']},null,2)+'\n')
 console.log('Packaged onboarding: legacy flags preserved, first version welcomed, same-version restart skipped, next version welcomed.')
}finally{
 try{await app?.close()}finally{
  try{await server.close()}finally{rmSync(root,{recursive:true,force:true})}
 }
}
