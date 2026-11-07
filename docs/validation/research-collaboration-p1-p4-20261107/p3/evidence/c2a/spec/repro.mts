import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join} from 'node:path';
import {NativeRuntime} from '/Users/liuyue/.codex/worktrees/dawn-research-collaboration-p1-p4-20261107/dawn-science/src/runtime/native.ts';
import {readCurrentTeamSnapshot} from '/Users/liuyue/.codex/worktrees/dawn-research-collaboration-p1-p4-20261107/dawn-science/src/team/read-current-snapshot.ts';
import {建团队} from '/Users/liuyue/.codex/worktrees/dawn-research-collaboration-p1-p4-20261107/dawn-science/src/team/state.ts';
const root=mkdtempSync(join(tmpdir(),'dawn-c2a-reader-repro-'));
try{
 mkdirSync(join(root,'teams','t'),{recursive:true});writeFileSync(join(root,'teams','current'),'t');
 for (const field of ['pipeline','scienceBatch']) for(const value of [null,false,0,'']){
  writeFileSync(join(root,'teams','t','team.json'),JSON.stringify({...建团队({id:'t',name:'t',goal:'goal',captainSessionId:'p'}),[field]:value}));
  const result=readCurrentTeamSnapshot(root,'p');console.log('malformed',field,JSON.stringify(value),JSON.stringify({teamId:result.team?.id,issue:result.teamIssue}));
 }
}finally{rmSync(root,{recursive:true,force:true})}
const runtimeRoot=mkdtempSync(join(tmpdir(),'dawn-c2a-stopping-repro-')),sessionDir=join(runtimeRoot,'session');
const credentials={read:async()=>({type:'api_key' as const,key:'sk-offline'}),list:async()=>[],modify:async()=>undefined,delete:async()=>{}};
const runtime=new NativeRuntime({credentials,subagentChildEntry:'/unused.js'});
let release=()=>{};let run:Promise<any>|undefined;let stopping:Promise<void>|undefined;
try{
 await runtime.start({sessionId:'p',workspace:runtimeRoot,sessionDir,native:{provider:'deepseek',model:'deepseek-flash'}});
 const internal=runtime as any;await internal.sessions.get('p').session.getToolDefinition('team_create').execute('new',{name:'stopping-team',goal:'preserve stopping goal',members:[]});
 const coordinator=internal.orchestrations.get('p'),child=coordinator.register('subagent',['c','0'],'a');
 run=coordinator.run(child.id,async()=>{await new Promise<void>(r=>release=r);return{ok:true,output:''}});
 const before=runtime.runOverview('p');stopping=runtime.stop('p');await new Promise<void>(r=>setImmediate(r));
 const during=runtime.runOverview('p');const pointer=readFileSync(join(sessionDir,'teams','current'),'utf8').trim();
 console.log('stop projection',JSON.stringify({before:before?.team?.name,during:during?.team,source:during?.source,phase:during?.runs.find(r=>r.id===child.id)?.phase,persistedPointer:pointer,persistedTeam:readCurrentTeamSnapshot(sessionDir,'p').team?.name}));
}finally{release();await run;await stopping;await runtime.stop('p');rmSync(runtimeRoot,{recursive:true,force:true})}
