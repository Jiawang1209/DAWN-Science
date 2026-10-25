import http from 'node:http'
/** Synthetic metadata shared by dev:mock and Electron, never production API results. */
export const GEO_FIXTURES=[
 {uid:'200000123',accession:'GSE123',entrytype:'GSE',title:'Synthetic drought experiment',taxon:'Arabidopsis thaliana',summary:'Synthetic transcriptome comparison.',gdstype:'Expression profiling by high throughput sequencing',n_samples:2,gpl:'1234',samples:[{accession:'GSM1',title:'Control'},{accession:'GSM2',title:'Drought'}],pubmedids:['123'],bioproject:'PRJNA123'},
 {uid:'200000124',accession:'GSE124',entrytype:'GSE',title:'Synthetic soil experiment',taxon:'soil metagenome',n_samples:3,samples:[]},
]
export async function startFakeScienceServer(){
 const requests=[]
 const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://127.0.0.1'),q=url.searchParams
  requests.push({path:url.pathname,query:Object.fromEntries(q)})
  const send=(status,value)=>{res.statusCode=status;res.setHeader('content-type','application/json');res.end(JSON.stringify(value))}
  if(req.method!=='GET')return send(405,{error:'method'})
  if(q.get('term')?.includes('rate-limit-fixture'))return send(429,{error:'rate limit fixture'})
  if(url.pathname.endsWith('esearch.fcgi')){
   const term=q.get('term')??''
   const records=term.includes('no-results-fixture')?[]:term.includes('GSE123[ACCN]')?[GEO_FIXTURES[0]]:GEO_FIXTURES
   return send(200,{esearchresult:{count:String(records.length),idlist:records.slice(0,Number(q.get('retmax')??10)).map(r=>r.uid)}})
  }
  if(url.pathname.endsWith('esummary.fcgi')){
   const ids=q.get('id')?.split(',')??[]
   return send(200,{result:{uids:ids,...Object.fromEntries(ids.map(id=>[id,GEO_FIXTURES.find(r=>r.uid===id)]))}})
  }
  if(url.pathname==='/geo/query/acc.cgi'){
   res.setHeader('content-type','text/plain')
   return res.end('^SERIES = GSE123\n!Series_title = Synthetic drought experiment\n!Series_summary = Synthetic transcriptome comparison.\n!Series_overall_design = Two conditions with biological replicates.\n!Series_platform_id = GPL1234\n')
  }
  send(404,{error:'route'})
 })
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
 return {url:`http://127.0.0.1:${server.address().port}`,requests,close:()=>new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()))}
}
