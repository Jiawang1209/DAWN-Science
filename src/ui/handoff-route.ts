/** Readable projection only. Original frozen reference remains available for inspection. */
import {t,tf} from './i18n/index.js'
export function handoffRouteLines(text:string):string[]{
 try{
  const v=JSON.parse(text),s=v.step
  if(typeof v.title!=='string'||typeof v.goal!=='string'||!s||typeof s.title!=='string'||typeof s.purpose!=='string'||!Array.isArray(s.inputs)||!Array.isArray(s.outputs)||![...s.inputs,...s.outputs].every(p=>typeof p==='string'))throw new Error('unknown route')
  return[tf("路线标题：{0}",v.title),tf("目标：{0}",v.goal),tf("步骤：{0}",s.title),tf("步骤目的：{0}",s.purpose),tf("输入：{0}",s.inputs.join('、')),tf("输出：{0}",s.outputs.join('、'))]
 }catch{return[t("历史路线内容无法呈现，请核对引用原文")]}
}
