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
it('reserves review quota under one arm and cannot borrow from it or from the single arm',async()=>{
 const gate=await startEvaluationGate({limit:30,forward:async()=>new Response('ok')})
 try{
  const single=gate.partition(15),multi=gate.partition(15),work=multi.partition(11),review=multi.partition(4)
  const call=(token:string)=>fetch(gate.url+'/chat/completions',{method:'POST',headers:{authorization:`Bearer ${token}`},body:'{}'})
  expect((await call(multi.token)).status).toBe(403)
  expect((await Promise.all(Array.from({length:12},()=>call(work.token)))).map(r=>r.status).filter(s=>s===200)).toHaveLength(11)
  expect(review.stats().forwarded).toBe(0)
  expect(single.stats().forwarded).toBe(0)
  expect(multi.stats().forwarded).toBe(11)
  await Promise.all(Array.from({length:4},()=>call(review.token)))
  expect((await call(review.token)).status).toBe(429)
  expect(multi.stats().forwarded).toBe(15)
  await multi.close()
  expect((await call(review.token)).status).toBe(403)
  expect((await call(single.token)).status).toBe(200)
 }finally{await gate.close()}
})

it.each(['body','upstream'] as const)('a parent close drains its descendant %s and preserves the other arm',async phase=>{
 let cancelled=false,started!:()=>void
 const ready=new Promise<void>(r=>started=r)
 const gate=await startEvaluationGate({limit:30,timeoutMs:1000,forward:async(_body,_path,signal)=>{
  started()
  await new Promise<void>(r=>signal.addEventListener('abort',()=>{cancelled=true;r()},{once:true}))
  return new Response('cancelled')
 }})
 try{
  const single=gate.partition(15),multi=gate.partition(15),work=multi.partition(11),review=multi.partition(4)
  let settled:Promise<unknown>
  if(phase==='body')settled=new Promise<void>(r=>{
   const req=request(gate.url+'/chat/completions',{method:'POST',headers:{authorization:`Bearer ${work.token}`,'content-length':1000}},res=>res.resume())
   req.on('error',()=>{});req.once('close',r);req.write('{')
  })
  else{
   settled=fetch(gate.url+'/chat/completions',{method:'POST',headers:{authorization:`Bearer ${work.token}`},body:'{}'}).catch(()=>undefined)
   await ready
  }
  for(let i=0;i<50&&!work.stats().inFlight;i++)await new Promise(r=>setTimeout(r,2))
  expect(work.stats().inFlight).toBe(1)
  const closing=multi.close()
  const quick=await Promise.race([closing.then(()=>true),new Promise<boolean>(r=>setTimeout(()=>r(false),200))])
  await closing;await settled
  expect(quick).toBe(true)
  expect(multi.stats().inFlight).toBe(0);expect(work.stats().inFlight).toBe(0);expect(gate.stats().inFlight).toBe(0)
  expect(cancelled).toBe(phase==='upstream')
  expect(multi.stats().forwarded).toBe(phase==='upstream'?1:0)
  expect(review.stats().reserved).toBe(0);expect(single.stats().reserved).toBe(0)
  expect((await fetch(gate.url+'/chat/completions',{method:'POST',headers:{authorization:`Bearer ${review.token}`},body:'{}'})).status).toBe(403)
 }finally{await gate.close()}
})
it.each(['parent-close','deadline'] as const)('drains a backpressured response on %s without client cooperation',async cause=>{
 let upstreamAborted=false
 const gate=await startEvaluationGate({limit:30,timeoutMs:250,forward:async(_body,_path,signal)=>new Response(new ReadableStream<Uint8Array>({
  start(c){signal.addEventListener('abort',()=>{upstreamAborted=true;c.error(new Error('upstream aborted'))},{once:true})},
  pull(c){c.enqueue(new Uint8Array(1024*1024))},
 }))})
 const single=gate.partition(15),multi=gate.partition(15),work=multi.partition(11);multi.partition(4)
 let client:ReturnType<typeof request>|undefined,response:import('node:http').IncomingMessage|undefined
 try{
  await new Promise<void>((resolve,reject)=>{
   client=request(gate.url+'/chat/completions',{method:'POST',headers:{authorization:`Bearer ${work.token}`}},res=>{response=res;res.on('error',()=>{});res.pause();resolve()})
   client.on('error',reject);client.end('{}')
  })
  const closing=cause==='parent-close'?multi.close():(async()=>{while(multi.stats().inFlight)await new Promise(r=>setTimeout(r,5))})()
  const drained=await Promise.race([closing.then(()=>true),new Promise<boolean>(r=>setTimeout(()=>r(false),800))])
  expect(drained).toBe(true)
  expect(upstreamAborted).toBe(true)
  expect(work.stats().inFlight).toBe(0);expect(multi.stats().inFlight).toBe(0);expect(gate.stats().inFlight).toBe(0)
  expect(work.stats().forwarded).toBe(1);expect(single.stats().reserved).toBe(0)
 }finally{response?.destroy();client?.destroy();await gate.close()}
})
