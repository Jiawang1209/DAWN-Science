import {expect,it} from "vitest"
import {mkdtempSync,rmSync,writeFileSync,readFileSync} from "node:fs"
import {tmpdir} from "node:os"
import {join} from "node:path"
import {建团队,加成员,写团队,读团队} from "../../src/team/state.js"
it("persists the first Bot's origin scope after all members are removed and rejects cross-scope rebinding",()=>{
 const team=建团队({name:"Analysis",goal:"Analyze",captainSessionId:"main"})
 加成员(team,{name:"stats",agent:"a",botId:"a",botScopeKey:"scope-a"})
 expect(team.botOriginScopeKey).toBe("scope-a")
 team.members[0]!.status="removed";team.finishedAt=2
 const dir=mkdtempSync(join(tmpdir(),"bot-origin-"))
 try {写团队(dir,team);expect(读团队(dir)?.botOriginScopeKey).toBe("scope-a")}finally{rmSync(dir,{recursive:true,force:true})}
 expect(()=>加成员(team,{name:"other",agent:"b",botId:"b",botScopeKey:"scope-b"})).toThrow(/范围/)
 expect(team.botOriginScopeKey).toBe("scope-a")
})
it("rejects persisted origin rewrites and migrates unanimous removed legacy members without inventing unknown scope",()=>{
 const dir=mkdtempSync(join(tmpdir(),"bot-origin-legacy-"))
 try {
  const team=建团队({name:"Analysis",goal:"Analyze",captainSessionId:"main"})
  加成员(team,{name:"stats",agent:"a",botId:"a",botScopeKey:"scope-a"});写团队(dir,team)
  team.botOriginScopeKey="scope-b"
  expect(()=>写团队(dir,team)).toThrow(/范围不能改变/)
  expect(读团队(dir)?.botOriginScopeKey).toBe("scope-a")
  delete team.botOriginScopeKey;team.members[0]!.status="removed"
  writeFileSync(join(dir,"team.json"),JSON.stringify(team))
  expect(读团队(dir)?.botOriginScopeKey).toBe("scope-a")
  expect(JSON.parse(readFileSync(join(dir,"team.json"),"utf8")).botOriginScopeKey).toBe("scope-a")
  delete team.members[0]!.botScopeKey
  writeFileSync(join(dir,"team.json"),JSON.stringify(team))
  expect(读团队(dir)?.botOriginScopeKey).toBeUndefined()
 }finally{rmSync(dir,{recursive:true,force:true})}
})
