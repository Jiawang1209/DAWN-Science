/** Explicit isolated UI demo, only localhost mock services. No credential read or paid model. */
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'
import {execFileSync} from 'node:child_process'
import {startMockInferenceServer,mockModelsJson} from '../../../scripts/mock-inference-server.mjs'
import {startFakeReleaseFeed} from '../../../scripts/fake-release-feed.mjs'
export const appRoot=resolve(import.meta.dirname,'../../..')
export async function prepareDemo(){
 const dir=mkdtempSync(join(tmpdir(),'dawn-collaboration-review-')),workspace=join(dir,'DAWN-协作验收-模拟模型')
 mkdirSync(workspace,{recursive:true})
 writeFileSync(join(workspace,'README.md'),'# DAWN 本地协作验收演示\n\n这是隔离开发版：本地模拟模型，不联网、不消耗API；Electron、文件工具、契约、验收版本与恢复机制真实运行。\n\n可查看自动安排、成员过程、原始工具记录、产物版本、展开返回和恢复。真实模型结果见仓库 research-budget-300-20261108 报告。\n')
 writeFileSync(join(workspace,'input.csv'),'x\n1\n2\n3\n')
 const gitEnv={...process.env,GIT_CONFIG_GLOBAL:'/dev/null',GIT_CONFIG_NOSYSTEM:'1'}
 for(const key of ['GIT_DIR','GIT_WORK_TREE','GIT_INDEX_FILE'])delete gitEnv[key]
 execFileSync('git',['-c','init.defaultBranch=demo','init','-q',workspace],{env:gitEnv})
 execFileSync('git',['-C',workspace,'add','README.md','input.csv'],{env:gitEnv})
 execFileSync('git',['-C',workspace,'-c','user.name=DAWN-Demo','-c','user.email=demo@localhost','-c','commit.gpgsign=false','-c','core.hooksPath=/dev/null','commit','-qm','Seed isolated collaboration demo'],{env:gitEnv})
 const options={firstChunkDelayMs:0},server=await startMockInferenceServer(options)
 const version=JSON.parse(readFileSync(join(appRoot,'package.json'),'utf8')).version,feed=startFakeReleaseFeed({version});await feed.已就绪
 const models=mockModelsJson(server.url)
 for(const model of models.providers.deepseek.models)model.name='本地模拟模型 · 不联网'
 const configPath=join(dir,'providers.yaml'),modelsPath=join(dir,'models.json')
 writeFileSync(configPath,'agents:\n  ds-chat:\n    kind: native\n    provider: deepseek\n    model: deepseek-flash\n    capabilities: [chat, exec]\n')
 writeFileSync(modelsPath,JSON.stringify(models,null,2)+'\n')
 const env={...process.env}
 for(const key of Object.keys(env))if(key==='ELECTRON_RUN_AS_NODE'||key.startsWith('DAWN_')||/(?:API_KEY|AUTH_TOKEN|ACCESS_TOKEN|SECRET)$/i.test(key))delete env[key]
 Object.assign(env,{DAWN_CONFIG:configPath,DAWN_DB:join(dir,'dawn.db'),DAWN_DEFAULT_WORKSPACE:workspace,DAWN_MODELS_JSON:modelsPath,DAWN_SKIP_CREDENTIAL_GATE:'1',DAWN_CLI_HOME:join(dir,'cli-home'),DAWN_SKILLS_DIR:join(dir,'skills'),DAWN_MEMORIES_DIR:join(dir,'memories'),DAWN_AGENTS_DIR:join(dir,'agents'),DAWN_SCRATCH_ROOT:join(dir,'scratch'),DAWN_DOWNLOADS:join(dir,'downloads'),DAWN_JUPYTER_ROOTS:join(dir,'jupyter/kernels'),DAWN_PICK_DIRECTORY:workspace,DAWN_PICK_FILES:join(workspace,'input.csv'),DAWN_NO_EXTERNAL:'1',DAWN_FAKE_NOTIFY:'1',DAWN_UPDATE_FEED:feed.url,DAWN_FAKE_UPDATE_INSTALL:'1',PI_CODING_AGENT_DIR:join(dir,'pi-agent'),TAU_CODING_AGENT_DIR:join(dir,'pi-agent'),DAWN_ELECTRON_EXIT_DIAGNOSTICS_DIR:join(dir,'exit')})
 for(const key of ['DAWN_CLI_HOME','DAWN_SKILLS_DIR','DAWN_MEMORIES_DIR','DAWN_AGENTS_DIR','DAWN_SCRATCH_ROOT','DAWN_DOWNLOADS','DAWN_JUPYTER_ROOTS','PI_CODING_AGENT_DIR'])mkdirSync(env[key],{recursive:true})
 const settings=JSON.stringify({retry:{enabled:false,maxRetries:0,provider:{maxRetries:0}},compaction:{enabled:false},cacheWarming:'off'})
 mkdirSync(join(workspace,'.pi'),{recursive:true});writeFileSync(join(workspace,'.pi/settings.json'),settings);writeFileSync(join(dir,'pi-agent/settings.json'),settings)
 writeFileSync(join(dir,'demo-identity.json'),JSON.stringify({purpose:'isolated mock collaboration demo',workspace,appRoot,paidModelRequests:0},null,2)+'\n')
 return{dir,workspace,env,options,server,feed,args:[join(appRoot,'dist/electron/main.js'),'--user-data-dir='+join(dir,'electron-user-data'),'--force-color-profile=srgb'],async close(){await server.close();await feed.close()}}
}
