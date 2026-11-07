import {expect,it} from 'vitest'
import {startEvaluationGate} from '../../scripts/evaluation-request-gate.js'
import {request} from 'node:http'
it('counts concurrent attempts atomically and never forwards beyond the whole-run limit',async()=>{
 let received=0
 const gate=await startEvaluationGate({limit:30,forward:async(_body,_path,signal)=>{received++;await new Promise(r=>setTimeout(r,5));if(signal.aborted)throw new Error('cancelled');return new Response('ok')}})
 try{
  const responses=await Promise.all(Array.from({length:31},()=>fetch(gate.url+'/chat/completions',{method:'POST',headers:{authorization:`Bearer ${gate.token}`},body:'{}'})))
  expect(received).toBe(30);expect(gate.stats().forwarded).toBe(30)
  expect(responses.filter(r=>r.status===429)).toHaveLength(1)
  expect((await fetch(gate.url+'/chat/completions',{method:'POST',headers:{authorization:`Bearer ${gate.token}`},body:'{}'})).status).toBe(429)
  expect(received).toBe(30)
 }finally{await gate.close()}
})
it('does not forward unowned traffic and aborts an in-flight request when closed',async()=>{
 let cancelled=false,started!:()=>void
 const ready=new Promise<void>(r=>started=r)
 const gate=await startEvaluationGate({limit:1,forward:async(_body,_path,signal)=>{started();await new Promise<void>(resolve=>signal.addEventListener('abort',()=>{cancelled=true;resolve()},{once:true}));return new Response('stopped')}})
 expect((await fetch(gate.url+'/chat/completions',{method:'POST',body:'{}'})).status).toBe(403)
 expect(gate.stats().forwarded).toBe(0)
 const pending=fetch(gate.url+'/chat/completions',{method:'POST',headers:{authorization:`Bearer ${gate.token}`},body:'{}'}).catch(()=>undefined)
 await ready;await gate.close();await pending;expect(cancelled).toBe(true)
})
it('ends an owned incomplete request body at the deadline without forwarding it',async()=>{
 let received=0
 const gate=await startEvaluationGate({limit:1,timeoutMs:30,forward:async()=>{received++;return new Response('ok')}})
 try{
  const closed=new Promise<void>(resolve=>{
   const req=request(gate.url+'/chat/completions',{method:'POST',headers:{authorization:`Bearer ${gate.token}`,'content-length':1000}},res=>res.resume())
   req.on('error',()=>{});req.once('close',resolve);req.write('{')
  })
  const outcome=await Promise.race([closed.then(()=>true),new Promise<boolean>(r=>setTimeout(()=>r(false),200))])
  expect(outcome).toBe(true);expect(received).toBe(0)
 }finally{await gate.close()}
})
it('reserves equal independent arms and refuses late requests from a finished arm',async()=>{
 const gate=await startEvaluationGate({limit:6,forward:async()=>new Response('ok')})
 try{
  const a=gate.partition(3),b=gate.partition(3),call=(token:string)=>fetch(gate.url+'/chat/completions',{method:'POST',headers:{authorization:`Bearer ${token}`},body:'{}'})
  expect((await Promise.all(Array.from({length:4},()=>call(a.token)))).map(r=>r.status).sort()).toEqual([200,200,200,429])
  expect(gate.stats().forwarded).toBe(3);expect(b.stats().forwarded).toBe(0)
  expect(()=>gate.partition(1)).toThrow(/quota/)
  await a.close();expect((await call(a.token)).status).toBe(403)
  await Promise.all(Array.from({length:3},()=>call(b.token)))
  expect(b.stats().forwarded).toBe(3);expect(gate.stats().forwarded).toBe(6)
 }finally{await gate.close()}
})
it('closes a partition by aborting and draining its in-flight call without consuming the other arm',async()=>{
 let started!:()=>void;const ready=new Promise<void>(r=>started=r)
 const gate=await startEvaluationGate({limit:2,forward:async(_body,_path,signal)=>{started();await new Promise<void>(r=>signal.addEventListener('abort',()=>r(),{once:true}));return new Response('aborted')}})
 try{
  const a=gate.partition(1),b=gate.partition(1)
  const pending=fetch(gate.url+'/chat/completions',{method:'POST',headers:{authorization:`Bearer ${a.token}`},body:'{}'}).catch(()=>undefined)
  await ready;await a.close();await pending
  expect(a.stats().inFlight).toBe(0);expect(b.stats().reserved).toBe(0)
  expect((await fetch(gate.url+'/chat/completions',{method:'POST',headers:{authorization:`Bearer ${gate.token}`},body:'{}'})).status).toBe(403)
 }finally{await gate.close()}
})
it('a partition close drains an incomplete request body immediately rather than waiting for its deadline',async()=>{
 const gate=await startEvaluationGate({limit:1,timeoutMs:500,forward:async()=>new Response('unreachable')})
 try{
  const arm=gate.partition(1)
  const req=request(gate.url+'/chat/completions',{method:'POST',headers:{authorization:`Bearer ${arm.token}`,'content-length':1000}},res=>res.resume());req.on('error',()=>{});req.write('{')
  for(let i=0;i<50&&!arm.stats().inFlight;i++)await new Promise(r=>setTimeout(r,2))
  expect(arm.stats().inFlight).toBe(1)
  const close=arm.close(),quick=await Promise.race([close.then(()=>true),new Promise<boolean>(r=>setTimeout(()=>r(false),150))])
  await close;expect(quick).toBe(true);expect(arm.stats().inFlight).toBe(0);expect(gate.stats().forwarded).toBe(0)
 }finally{await gate.close()}
})
