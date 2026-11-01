import { afterEach, describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { guardSkillPath, loadSkillCatalog, readSkill, searchSkills, skillForPath, type SkillRoot } from '../../src/skills/catalog.js'
const dirs: string[] = []
afterEach(() => dirs.splice(0).forEach(p => rmSync(p, {recursive:true, force:true})))
function setup() {
 const dir=mkdtempSync(join(tmpdir(),'dawn-catalog-')); dirs.push(dir)
 const roots: SkillRoot[] = ['project','global','builtin'].map(scope => ({path:join(dir,scope),scope:scope as SkillRoot['scope']}))
 roots.forEach(r=>mkdirSync(r.path))
 const skill=(layer:number,name:string,description=name,flags='',body='正文')=>{
  const base=join(roots[layer]!.path,name);mkdirSync(base,{recursive:true})
  const path=join(base,'SKILL.md');writeFileSync(path,`---\nname: ${name}\ndescription: ${description}\n${flags}---\n${body}`);return path
 }
 return {dir,roots,skill,load:()=>loadSkillCatalog({roots,workspace:dir})}
}
describe('shared Skill catalog',()=>{
 it('deduplicates by explicit scope order before filtering, keeps manual/off policy and empty tag overrides',()=>{
  const s=setup();s.skill(2,'shared');s.skill(0,'shared','disabled','user-invocable: false\n')
  s.skill(1,'manual','manual','disable-model-invocation: true\n');const tagged=s.skill(1,'tagged','data','tags: [EDA, 数据初探]\n')
  const c=loadSkillCatalog({roots:[...s.roots].reverse(),workspace:s.dir,tagsOverride:p=>p===tagged?[]:undefined})
  expect(c.skills.map(x=>[x.name,x.scope,x.invocation])).toEqual([['shared','project','off'],['manual','global','manual'],['tagged','global','model']])
  expect(c.skills.find(x=>x.name==='tagged')!.tags).toEqual([])
  expect(searchSkills(c.skills,'').items.map(x=>x.name)).toEqual(['tagged'])
  expect(()=>readSkill(c,{name:'shared'})).toThrow(/停用|off/)
  expect(()=>readSkill(c,{name:'manual'})).toThrow(/手动|manual/)
  expect(readSkill(c,{name:'manual',allowManual:true}).content).toContain('正文')
 })
 it('discovers nested packages and legacy root markdown, but package root manifest takes precedence',()=>{
  const s=setup();s.skill(1,'group/nested','nested package')
  writeFileSync(join(s.roots[1]!.path,'legacy.md'),'---\nname: legacy\ndescription: old skill\n---\nold')
  writeFileSync(join(s.roots[1]!.path,'notes.md'),'ordinary notes')
  expect(s.load().skills.map(x=>x.name).sort()).toEqual(['group/nested','legacy'])
  writeFileSync(join(s.roots[1]!.path,'SKILL.md'),'---\nname: root\ndescription: root skill\n---\nroot')
  expect(s.load().skills.map(x=>x.name)).toEqual(['root'])
 })
 it('authorizes every directory and manifest before reads, tolerates missing roots and isolates rejected files',()=>{
  const s=setup();const denied=s.skill(1,'denied');s.skill(1,'healthy')
  const seen:string[]=[]
  const c=loadSkillCatalog({roots:s.roots,workspace:s.dir,authorize:(_tool,args)=>{seen.push(String(args.path));return args.path===denied?'denied permission':undefined}})
  expect(c.skills.map(x=>x.name)).toEqual(['healthy']);expect(c.problems).toContainEqual({path:denied,reason:'denied permission'})
  expect(seen).toContain(s.roots[1]!.path)
  expect(()=>loadSkillCatalog({roots:s.roots,workspace:s.dir,authorize:()=> 'directory denied'})).toThrow('directory denied')
  expect(loadSkillCatalog({roots:[{path:join(s.dir,'missing'),scope:'global'}]}).skills).toEqual([])
 })
 it('matches scientific tasks in Chinese and English, tag overrides and separators with literal reasons only',()=>{
  const s=setup();s.skill(0,'explore-data','Exploratory data analysis and EDA','tags: [数据初探, ecology]\n')
  s.skill(0,'reproduce','Reproducibility and fixed seeds');s.skill(0,'papers','Literature review')
  s.skill(0,'plots','Scientific visualization');s.skill(0,'review','Statistical review')
  const c=s.load()
  for(const [query,name] of [['请帮我进行数据初探并查看分布','explore-data'],['需要可复现分析','reproduce'],['查找相关文献','papers'],['请绘图展示结果','plots'],['做一次科研审查','review'],['EXPLORE＿DATA','explore-data'],['ecology data exploration','explore-data']]) {
   const result=searchSkills(c.skills,query!);expect(result.items[0]?.name,query).toBe(name)
   for(const item of result.items) for(const term of item.match.terms) expect([item.name,item.description,...item.tags].join(' ').normalize('NFKC').toLowerCase()).toContain(term)
  }
  expect(searchSkills(c.skills,'please help create a birthday cake')).toMatchObject({items:[],total:0})
  expect(searchSkills(c.skills,'帮我分析处理一下')).toMatchObject({items:[],total:0})
  expect(searchSkills(c.skills,'',{limit:2})).toMatchObject({total:5,offset:0,nextOffset:2,truncated:true})
  expect(()=>searchSkills(c.skills,'',{limit:21})).toThrow(/limit/)
 })
 it('reads only delivered text chunks, rechecks policy/name and permits safe package references',()=>{
  const s=setup();const manifest=s.skill(1,'safe','safe','','🙂'.repeat(5000));const c=s.load()
  const first=readSkill(c,{name:'safe',limit:100})
  expect(first).toMatchObject({manifestPath:manifest,resourcePath:'SKILL.md',offset:0,partial:true,truncated:true,nextOffset:100})
  expect(first.contentSha256).toBe(createHash('sha256').update(first.content).digest('hex'))
  writeFileSync(join(manifest,'..','ref.md'),'reference')
  expect(readSkill(c,{name:'safe',path:'ref.md'})).toMatchObject({resourcePath:'ref.md',content:'reference',partial:false})
  expect(skillForPath(c,join(manifest,'..','ref.md'))?.skill.name).toBe('safe')
  writeFileSync(manifest,'---\nname: safe\ndescription: safe\ndisable-model-invocation: true\n---\nhidden')
  expect(()=>readSkill(c,{name:'safe',path:'ref.md'})).toThrow(/手动|manual/)
  expect(readSkill(c,{name:'safe',allowManual:true}).content).toContain('hidden')
  writeFileSync(manifest,'---\nname: changed\ndescription: safe\n---\nchanged')
  expect(()=>readSkill(c,{name:'safe'})).toThrow(/名称|name/)
 })
 it('rejects traversal, symlink escape, binary, oversized and FIFO before opening',()=>{
  const s=setup();const manifest=s.skill(1,'safe');const base=join(manifest,'..');writeFileSync(join(s.dir,'secret'),'secret')
  symlinkSync(join(s.dir,'secret'),join(base,'escape'));writeFileSync(join(base,'binary'),Buffer.from([0,1]))
  writeFileSync(join(base,'large'),'x'.repeat(1024*1024+1));execFileSync('mkfifo',[join(base,'pipe')])
  const c=s.load()
  for(const path of ['../secret',join(s.dir,'secret'),'escape','binary','large','pipe','.hidden']) expect(()=>readSkill(c,{name:'safe',path}),path).toThrow()
  expect(skillForPath(c,join(s.dir,'secret'))).toBeUndefined()
 })
 it('blocks references into hidden, shadowed, nested and newly installed other skill packages',()=>{
  const s=setup();writeFileSync(join(s.roots[0]!.path,'legacy.md'),'---\nname: legacy\ndescription: legacy\n---\nlegacy')
  const hidden=s.skill(0,'hidden','hidden','user-invocable: false\n');writeFileSync(join(hidden,'..','ref.md'),'secret')
  const c=s.load()
  expect(()=>readSkill(c,{name:'legacy',path:'hidden/ref.md'})).toThrow(/其他技能/)
  const fresh=s.skill(0,'fresh');writeFileSync(join(fresh,'..','ref.md'),'fresh')
  expect(()=>readSkill(c,{name:'legacy',path:'fresh/ref.md'})).toThrow(/其他技能/)
  expect(skillForPath(c,hidden)).toBeUndefined()
 })
})

it('rechecks the catalog anchor before opening a replaced package or a newly shadowed builtin',()=>{
 const s=setup();const file=s.skill(2,'safe');const c=s.load()
 const outside=join(s.dir,'outside');mkdirSync(outside)
 writeFileSync(join(outside,'SKILL.md'),'---\nname: safe\ndescription: safe\n---\nsecret')
 rmSync(join(file,'..'),{recursive:true});symlinkSync(outside,join(file,'..'))
 expect(()=>readSkill(c,{name:'safe'})).toThrow(/符号链接|越界/)
 const s2=setup();s2.skill(2,'shared');const c2=s2.load();s2.skill(0,'shared','disabled','user-invocable: false\n')
 expect(()=>readSkill(c2,{name:'shared'})).toThrow(/覆盖|重新检索|不可见/)
})

it('does not infer a Skill from generic task verbs and blocks newly created legacy manifests via references',()=>{
 const s=setup();s.skill(1,'review','Statistical review');s.skill(1,'generic','Analysis')
 const c=s.load()
 expect(searchSkills(c.skills,'please review and analyze a birthday cake').total).toBe(0)
 expect(searchSkills(c.skills,'analysis').total).toBe(0)
 writeFileSync(join(s.roots[0]!.path,'visible.md'),'---\nname: visible\ndescription: visible\n---\nvisible')
 const c2=s.load()
 writeFileSync(join(s.roots[0]!.path,'new-off.md'),'---\nname: new-off\ndescription: hidden\nuser-invocable: false\n---\nsecret')
 expect(()=>readSkill(c2,{name:'visible',path:'new-off.md'})).toThrow(/其他技能/)
 writeFileSync(join(s.roots[0]!.path,'notes.md'),'ordinary notes')
 expect(readSkill(c2,{name:'visible',path:'notes.md'}).content).toBe('ordinary notes')
})

it('uses bounded delivery/authoring synonyms and rejects explicit concept-only requests, while keeping mixed actions',()=>{
 const s=setup();s.skill(0,'handover','整理分析交付和脚本');s.skill(0,'author','编写技能并保存做法','tags: [技能]\n')
 s.skill(0,'eda','EDA exploratory data analysis');s.skill(0,'stats','统计审查');s.skill(0,'books','文献精读');s.skill(0,'office','读取 xlsx')
 const c=s.load()
 expect(searchSkills(c.skills,'Prepare the analysis delivery for collaborators').items[0]?.name).toBe('handover')
 expect(searchSkills(c.skills,'Please arrange collaborator handoff').items[0]?.name).toBe('handover')
 expect(searchSkills(c.skills,'Turn this procedure into a reusable skill').items[0]?.name).toBe('author')
 expect(searchSkills(c.skills,'Help with skill authoring').items[0]?.name).toBe('author')
 for(const query of ['推荐一个周末散步的地方','Explain EDA without inspecting data','Define statistical review','文献是什么意思，只解释概念','只解释什么是统计审查，不检查文件','What does xlsx mean? Just explain the term']) expect(searchSkills(c.skills,query).total,query).toBe(0)
 for(const query of ['Explain EDA and inspect my dataset','先解释 EDA，然后进行数据初探','Inspect this dataset and explain the EDA findings','EDA']) expect(searchSkills(c.skills,query).items.some(x=>x.name==='eda'),query).toBe(true)
})

it('honors guarded ignore files and pi validation diagnostics without exposing ignored manifests as references',()=>{
 const s=setup();s.skill(1,'healthy');const ignored=s.skill(1,'ignored')
 writeFileSync(join(s.roots[1]!.path,'.gitignore'),'ignored/\nlegacy-off.md\n')
 writeFileSync(join(s.roots[1]!.path,'visible.md'),'---\nname: visible\ndescription: visible\n---\nvisible')
 writeFileSync(join(s.roots[1]!.path,'legacy-off.md'),'---\nname: off\ndescription: hidden\nuser-invocable: false\n---\nsecret')
 const empty=s.skill(1,'empty');writeFileSync(empty,'---\nname: empty\n---\nno description')
 s.skill(1,'Bad_Name','bad name warning')
 const paths:string[]=[]
 const c=loadSkillCatalog({roots:s.roots,workspace:s.dir,authorize:(_t,a)=>{paths.push(String(a.path));return undefined}})
 expect(c.skills.map(x=>x.name).sort()).toEqual(['Bad_Name','healthy','visible'])
 expect(paths).toContain(join(s.roots[1]!.path,'.gitignore'));expect(paths).not.toContain(ignored)
 expect(c.problems).toEqual(expect.arrayContaining([{path:empty,reason:'description is required'},{path:join(s.roots[1]!.path,'Bad_Name/SKILL.md'),reason:expect.stringContaining('invalid characters')}]))
 expect(()=>readSkill(c,{name:'visible',path:'legacy-off.md'})).toThrow(/其他技能/)
 expect(()=>readSkill(c,{name:'visible',path:'ignored/SKILL.md'})).toThrow(/其他技能/)
})

it('separates concept-only intent from later workflow requests across clauses and polite wording',()=>{
 const s=setup();s.skill(0,'repro','可复现分析脚本');s.skill(0,'eda','EDA 数据初探');s.skill(0,'plots','绘图');const c=s.load()
 expect(searchSkills(c.skills,'Define reproducibility; next, help me edit my analysis script').items.some(x=>x.name==='repro')).toBe(true)
 expect(searchSkills(c.skills,'解释一下 EDA；随后检查这个数据集').items.some(x=>x.name==='eda')).toBe(true)
 for(const query of ['给我讲讲EDA这个术语','可以聊聊绘图是什么吗','可复现指什么？']) expect(searchSkills(c.skills,query).total,query).toBe(0)
 // Discussion alone is not classified as a definition request.
 expect(searchSkills(c.skills,'聊聊绘图').items[0]?.name).toBe('plots')
})

it('guards generic reads for excluded packages and limits legacy ownership to its own manifest',()=>{
 const s=setup();const healthy=s.skill(0,'healthy');const manual=s.skill(0,'manual','manual','disable-model-invocation: true\n')
 const off=s.skill(0,'off','off','user-invocable: false\n');s.skill(2,'healthy')
 const invalid=s.skill(1,'invalid');writeFileSync(invalid,'---\nname: invalid\n---\nmissing description')
 writeFileSync(join(s.roots[1]!.path,'legacy.md'),'---\nname: legacy\ndescription: legacy\n---\nbody')
 writeFileSync(join(s.roots[1]!.path,'notes.md'),'plain notes')
 writeFileSync(join(healthy,'..','ref.md'),'reference')
 const c=s.load()
 expect(guardSkillPath(c,healthy)?.skill.name).toBe('healthy')
 expect(guardSkillPath(c,join(healthy,'..','ref.md'))?.resourcePath).toBe('ref.md')
 expect(guardSkillPath(c,join(s.roots[1]!.path,'legacy.md'))?.skill.name).toBe('legacy')
 for(const path of [manual,off,invalid,join(s.roots[2]!.path,'healthy/SKILL.md'),join(s.roots[1]!.path,'notes.md')]) expect(()=>guardSkillPath(c,path),path).toThrow()
 expect(guardSkillPath(c,manual,skill=>skill.name==='manual')?.skill.name).toBe('manual')
 expect(()=>guardSkillPath(c,off,()=>true)).toThrow(/停用|off/)
 expect(guardSkillPath(c,join(s.dir,'outside.txt'))).toBeUndefined()
 const alias=join(s.dir,'alias.md');symlinkSync(off,alias)
 expect(()=>guardSkillPath(c,alias)).toThrow(/停用|off|不可见/)
})
it('returns precise exact canonical names and bounds output metadata without changing full-text matching',()=>{
 const s=setup();s.skill(0,'scientific-review','科研审查');s.skill(0,'literature-review','文献');s.skill(0,'other','Literature comparison')
 const verbose=s.skill(0,'verbose','x'.repeat(4000)+' searchable-tail','tags: ['+Array.from({length:30},(_,i)=>'tag'+i+'a'.repeat(100)).join(',')+']\n')
 const c=s.load()
 expect(searchSkills(c.skills,'scientific-review').items.map(x=>x.name)).toEqual(['scientific-review'])
 expect(searchSkills(c.skills,'literature-review').items.map(x=>x.name)).toEqual(['literature-review'])
 const found=searchSkills(c.skills,'searchable-tail').items[0]!
 expect(found.filePath).toBe(verbose);expect(Array.from(found.description).length).toBeLessThanOrEqual(1200)
 expect(found.tags.length).toBe(20);expect(found.tags.every(t=>Array.from(t).length<=64)).toBe(true)
 expect(found).toMatchObject({metadataTruncated:true})
})
