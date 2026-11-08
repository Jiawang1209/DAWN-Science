import {expect,it} from 'vitest'
import {adviseMode,type ModeBrief} from '../../src/orchestration/mode-advice.js'
const base:ModeBrief={blocks:3,dependency:'independent',sharedWrites:false,independentReview:false}
it.each([[1,'single'],[2,'parallel'],[8,'parallel']] as const)('recommends for %i independent blocks', (blocks,mode)=>expect(adviseMode({...base,blocks}).recommended).toBe(mode))
it('keeps shared writes or ordered dependencies serial',()=>{
 expect(adviseMode({...base,sharedWrites:true}).recommended).toBe('chain')
 expect(adviseMode({...base,dependency:'sequential'}).recommended).toBe('chain')
 expect(adviseMode({...base,sharedWrites:true,preferred:'parallel'}).valid).toBe(false)
 expect(adviseMode({...base,dependency:'sequential',preferred:'parallel'}).valid).toBe(false)
})
it('never downgrades independent review via manual choice',()=>{
 for(const preferred of ['single','parallel','chain'] as const){const a=adviseMode({...base,independentReview:true,preferred});expect(a.recommended).toBe('science');expect(a.reviewRequired).toBe(true);expect(a.valid).toBe(false)}
 expect(adviseMode({...base,independentReview:true,preferred:'science'}).valid).toBe(true)
})
it('preserves explicit safe choices and still explains recommendation',()=>{
 const a=adviseMode({...base,preferred:'single'});expect(a.selected).toBe('single');expect(a.recommended).toBe('parallel');expect(a.valid).toBe(true)
})
it('does not invent structure for unknown input or invalid block counts',()=>{
 for(const blocks of [undefined,0,-1,1.2,9,Infinity,NaN]){const a=adviseMode({...base,blocks});expect(a.valid).toBe(false);expect(a.recommended).toBeUndefined();expect(a.reasons).toContain('blocks-required')}
 expect(adviseMode({...base,dependency:'unknown'}).valid).toBe(false)
 expect(adviseMode({...base,dependency:'unknown',independentReview:true}).valid).toBe(false)
})
