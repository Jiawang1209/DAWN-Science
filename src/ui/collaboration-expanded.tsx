import {useEffect,useRef,type ReactNode} from 'react'
import {createPortal} from 'react-dom'
import {在组词} from './ime.js'
import {openPalette} from './state/view.js'
import {t} from './i18n/index.js'
/** Native modal supplies focus containment, Escape and background inertness. */
export function CollaborationExpanded({children,onClose,onRestoreFocus}:{children:ReactNode;onClose:()=>void;onRestoreFocus:()=>void}){
 const restore=useRef(onRestoreFocus);restore.current=onRestoreFocus
 const ref=useRef<HTMLDialogElement>(null),close=useRef(onClose);close.current=onClose
 useEffect(()=>{
  const returnTo=document.activeElement instanceof HTMLElement?document.activeElement:undefined
  const dialog=ref.current;dialog?.showModal?.()
  return()=>{dialog?.close?.();restore.current();if(document.activeElement===document.body&&returnTo?.isConnected)returnTo.focus({preventScroll:true})}
 },[])
 useEffect(()=>{
  // A focused task detail can disappear between polling updates. Catch global navigation
  // at document capture as well, including events temporarily targeting the body.
  const onKey=(event:KeyboardEvent)=>{
   if(!ref.current?.open)return
   const key=event.key.toLowerCase()
   const globalShortcut=(event.metaKey||event.ctrlKey)&&(key==='k'||!event.shiftKey&&key==='p')||event.ctrlKey&&event.shiftKey&&key==='g'
   if(!globalShortcut)return
   if(在组词({nativeEvent:event})){event.stopPropagation();return}
   if(key==='k'){event.preventDefault();event.stopPropagation();close.current();openPalette()}
   else close.current()
  }
  document.addEventListener('keydown',onKey,true)
  return()=>document.removeEventListener('keydown',onKey,true)
 },[])
 return createPortal(<dialog ref={ref} className="collaboration-expanded" aria-label={t("流程工作台")} onCancel={event=>{event.preventDefault();close.current()}}>{children}</dialog>,document.body)
}
