import http from 'node:http'

/** Invented records for isolated development and Electron tests only. */
export const CROSSREF_FIXTURE_WORKS=[
  {DOI:'10.1234/example',title:['Warming and soil diversity'],author:[{given:'A.',family:'Researcher'},{name:'Soil Research Group'}],published:{'date-parts':[[2024,5,10]]},'container-title':['Ecology Example'],URL:'https://doi.org/10.1234/example',abstract:'<jats:p>Soil &amp; microbial <jats:italic>diversity</jats:italic> changes.</jats:p>'},
  {DOI:'10.1234/second',title:['Soil community observations'],issued:{'date-parts':[[2023]]}},
]
export async function startFakeCrossrefServer() {
  const requests=[]
  const server=http.createServer((req,res)=>{
    const url=new URL(req.url,'http://127.0.0.1')
    requests.push({path:decodeURIComponent(url.pathname),query:Object.fromEntries(url.searchParams)})
    res.setHeader('content-type','application/json')
    const send=(status,body)=>{res.statusCode=status;res.end(JSON.stringify(body))}
    if(req.method!=='GET')return send(405,{status:'error'})
    if(url.pathname==='/works') {
      const query=url.searchParams.get('query.bibliographic')
      if(query==='rate-limit-fixture')return send(429,{status:'error',message:'fixture rate limit'})
      const items=query==='no-results-fixture'?[]:CROSSREF_FIXTURE_WORKS
      return send(200,{status:'ok',message:{'total-results':items.length,items:items.slice(0,Number(url.searchParams.get('rows')??10))}})
    }
    const doi=decodeURIComponent(url.pathname.slice('/works/'.length))
    const work=CROSSREF_FIXTURE_WORKS.find(w=>w.DOI===doi)
    return work?send(200,{status:'ok',message:work}):send(404,{status:'error',message:'not found'})
  })
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
  return {url:`http://127.0.0.1:${server.address().port}`,requests,close:()=>new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()))}
}
