import {expect,it} from 'vitest'
import {TaskArrangementSchema,serializeTaskArrangement,parseTaskArrangement,validateArrangementEdit,type TaskArrangement} from '../../src/protocol/task-arrangement.js'
const task=(id:string)=>({id,title:id,goal:'Check the requested data',role:id,inputs:['input.csv'],outputs:[id+'.csv'],dependencies:[] as string[],acceptance:'Result can be checked',review:false})
const plan:TaskArrangement={mode:'single',rationale:'A small task needs no delegation',independentReview:false,tasks:[task('one')],questions:[]}
it('derives counts from actual plans and roundtrips a readable single source of truth',()=>{
 for(const tasks of [[task('one')],[task('one'),task('two')]]){
  const a={...plan,mode:tasks.length===1?'single' as const:'parallel' as const,tasks}
  const md=serializeTaskArrangement(a),parsed=parseTaskArrangement('## 问题与假设\nGoal\n'+md+'\n## 产物\n`out.csv`')
  expect(parsed.state).toBe('valid');if(parsed.state==='valid')expect(parsed.arrangement).toEqual(a)
  expect(md).not.toContain('"tasks"')
 }
})
it('does not treat unrelated Markdown headings as task counts',()=>{
 expect(parseTaskArrangement('### first\n### second').state).toBe('absent')
 expect(parseTaskArrangement('## 任务安排（自动安排）\nUnparseable').state).toBe('invalid')
})
it('rejects missing dependencies, cycles, duplicates and concurrent shared outputs',()=>{
 const a=task('a'),b=task('b')
 expect(TaskArrangementSchema.safeParse({...plan,tasks:[a,a]}).success).toBe(false)
 expect(TaskArrangementSchema.safeParse({...plan,tasks:[{...a,dependencies:['missing']}]}).success).toBe(false)
 expect(TaskArrangementSchema.safeParse({...plan,tasks:[{...a,dependencies:['b']},{...b,dependencies:['a']}]}).success).toBe(false)
 expect(TaskArrangementSchema.safeParse({...plan,mode:'parallel',tasks:[a,{...b,outputs:a.outputs}]}).success).toBe(false)
 expect(TaskArrangementSchema.safeParse({...plan,mode:'parallel',tasks:[a,{...b,dependencies:['a']}]}).success).toBe(false)
})
it('preserves required independent review when a user edits an arrangement',()=>{
 const review={...task('review'),review:true,dependencies:['one']}
 const original=serializeTaskArrangement({...plan,mode:'science',independentReview:true,tasks:[task('one'),review]})
 expect(()=>validateArrangementEdit(original,serializeTaskArrangement(plan))).toThrow(/审阅/)
 expect(()=>validateArrangementEdit(original,'## 产物\nremoved task section')).toThrow()
 expect(()=>validateArrangementEdit(original,original)).not.toThrow()
 expect(TaskArrangementSchema.safeParse({...plan,independentReview:true}).success).toBe(false)
 expect(TaskArrangementSchema.safeParse({...plan,independentReview:true,tasks:[task('one'),{...review,role:'one'}]}).success).toBe(false)
})
it('rejects ambiguous newlines, unknown fields, unsafe paths and oversized plans',()=>{
 for(const t of [{...task('a'),title:'a\nb'},{...task('a'),outputs:['../escape']},{...task('a'),role:''}])expect(TaskArrangementSchema.safeParse({...plan,tasks:[t]}).success).toBe(false)
 expect(parseTaskArrangement(serializeTaskArrangement(plan)+'\n- 隐藏字段：bad').state).toBe('invalid')
 expect(TaskArrangementSchema.safeParse({...plan,tasks:Array.from({length:13},(_,i)=>task('t'+i))}).success).toBe(false)
})
it('does not serialize inconsistent review flags into a different meaning',()=>{
 expect(TaskArrangementSchema.safeParse({...plan,mode:'science'}).success).toBe(false)
 const reviewer={...task('review'),review:true,dependencies:['one']}
 expect(TaskArrangementSchema.safeParse({...plan,mode:'chain',tasks:[task('one'),reviewer]}).success).toBe(false)
})
it('ignores arrangement examples inside fenced Markdown code blocks',()=>{
 const example=serializeTaskArrangement(plan)
 for(const fence of ['```','~~~'])expect(parseTaskArrangement(fence+'markdown\n'+example+'\n'+fence).state).toBe('absent')
 expect(parseTaskArrangement('```markdown\n'+example+'\n```\n\n'+example).state).toBe('valid')
})
it('does not turn indented Markdown code examples into task arrangements',()=>{
 const example=serializeTaskArrangement(plan)
 for(const indent of ['    ','\t'])expect(parseTaskArrangement(example.split('\n').map(l=>indent+l).join('\n')).state).toBe('absent')
 expect(parseTaskArrangement(example+'\n  ## 其他说明\n普通正文').state).toBe('valid')
})
