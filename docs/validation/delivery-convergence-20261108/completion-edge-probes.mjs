import {mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import assert from 'node:assert/strict';
import {TaskSubmission} from '../../../src/orchestration/task-submission.ts';
import {TaskContractSchema} from '../../../src/protocol/task-contract.ts';
import {projectAcceptedArtifacts,checkAcceptedArtifact} from '../../../src/orchestration/accepted-artifacts.ts';
const cwd=mkdtempSync(join(tmpdir(),'dawn-completion-edges-'));
try {
 const contract=TaskContractSchema.parse({submission:'tool',access:'workspace-write',outputs:['out.csv']});
 writeFileSync(join(cwd,'out.csv'),'x\n1');
 // Explicit frozen input versions select the real asynchronous version-validation path.
 const submission=new TaskSubmission(contract,cwd,()=>[],{version:1,inputs:[]});
 const pending=submission.submit({summary:'file delivered',blockers:[],deliverables:[{path:'out.csv'}],execution:{state:'not_run',note:'file only'},verification:{state:'unreviewed',note:'not scientific validation'}});
 const during=submission.checkpoint();assert.equal(during.phase,'validating');
 await pending;const sealed=submission.checkpoint();assert.equal(sealed.phase,'sealed');assert.equal(sealed.sealedState,'accepted');
 const receipt=submission.receipt(),version=receipt.versions.outputs[0];assert.ok(version);
 const overview={ownerSessionId:'owner',source:'live',runs:[{id:'run',kind:'subagent',label:'analysis',address:['call','0'],state:'completed',phase:'drained',epoch:2,resultEpoch:2,updatedAt:1,contract:true,inputVersions:0,outputVersions:1,receipt:'accepted',taskReceipt:receipt}]};
 const artifact=projectAcceptedArtifacts(overview,'owner')[0];assert.ok(artifact);
 const beforeDeletion=await checkAcceptedArtifact(cwd,'owner',artifact,()=>overview);assert.equal(beforeDeletion.state,'matches');
 rmSync(join(cwd,'out.csv'));
 const afterDeletion=await checkAcceptedArtifact(cwd,'owner',artifact,()=>overview);assert.equal(afterDeletion.state,'unavailable');
 const retained=projectAcceptedArtifacts(overview,'owner');assert.equal(retained.length,1);assert.deepEqual(retained[0].version,version);
 console.log(JSON.stringify({source:'actual current candidate and real isolated local files; no model',submission:{duringPhase:during.phase,sealedPhase:sealed.phase,counts:[during.observation,sealed.observation]},content:{beforeDeletion,afterDeletion,receiptRetained:true},passed:true},null,2));
}finally{rmSync(cwd,{recursive:true,force:true});}
