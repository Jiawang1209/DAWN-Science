import { strict as assert } from 'node:assert';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
const repo = '/Users/liuyue/.codex/worktrees/dawn-research-collaboration-p1-p4-20261107/dawn-science';
const evidence = '/tmp/dawn-pilot-guard-spec-3LasiuLd';
const { runResearchEvaluation } = await import(repo + '/scripts/evaluate-research.ts');
const { researchTasks, researchFingerprint } = await import(repo + '/src/evaluation/research-tasks.ts');
const { startMockInferenceServer, mockModelsJson } = await import(repo + '/scripts/mock-inference-server.mjs');
const { researchScenario } = await import(repo + '/scripts/mock-research.mjs');
const { SettingsManager } = await import(repo + '/node_modules/@earendil-works/pi-coding-agent/dist/index.js');
const defaultsRoot=mkdtempSync(join(evidence,'defaults-'));mkdirSync(join(defaultsRoot,'agent'));
const defaults=SettingsManager.create(defaultsRoot,join(defaultsRoot,'agent'));
console.log('SDK empty-directory defaults',JSON.stringify({retry:defaults.getRetrySettings(),providerRetry:defaults.getProviderRetrySettings(),cacheWarming:defaults.getCacheWarmingMode(),compaction:defaults.getCompactionEnabled()}));
for (const operation of ['modify','delete']) {
 const root = mkdtempSync(join(evidence, operation+'-'));const out=join(root,'results');
 const scenario=researchScenario(researchTasks());let changed=false;
 const server=await startMockInferenceServer({scenario:{...scenario,toolCall:(body)=>{
  if(!changed){changed=true;const trial=join(out,readdirSync(out).find(p=>p.startsWith('carbon-missing-single-')));const settings=join(trial,'single','settings.json');
   assert.ok(settings.startsWith(evidence+'/'));
   if(operation==='delete')unlinkSync(settings);else writeFileSync(settings,readFileSync(settings,'utf8')+' ');
  }
  return scenario.toolCall(body);
 }}});
 try {
  const modelsPath=join(root,'models.json');writeFileSync(modelsPath,JSON.stringify(mockModelsJson(server.url)));
  const report=await runResearchEvaluation(out,{provider:'deepseek',model:'deepseek-flash',modelsPath,credential:'offline-mock',kind:'fixture',requests:()=>server.requests.length},{taskIds:['carbon-missing']});
  assert.equal(report.rows[0].terminal,'accepted');assert.equal(report.rows[0].success,true);assert.equal(report.rows[0].inputPreserved,true);
  assert.equal(report.rows[1].terminal,'not-run');assert.equal(report.rows[1].requests,0);assert.equal(report.comparisonEligible,false);assert.equal(report.qualifiedPairs,0);assert.ok(report.integrity.changed.includes('trial-settings'));
  const manifest=JSON.parse(readFileSync(join(out,'research-manifest.json'),'utf8'));const {version,runId,generatedAt,fingerprint,...stable}=manifest;
  assert.equal(fingerprint,researchFingerprint(stable));
  const changedPolicy=structuredClone(stable);changedPolicy.execution.trialSettings.agent.retry.enabled=true;assert.notEqual(researchFingerprint(changedPolicy),fingerprint);
  console.log(operation,JSON.stringify({terminal:report.rows.map(r=>r.terminal),requests:report.rows.map(r=>r.requests),success:report.rows[0].success,inputPreserved:report.rows[0].inputPreserved,comparisonEligible:report.comparisonEligible,integrity:report.integrity,policyFingerprinted:true,output:out}));
 } finally {await server.close();}
}
