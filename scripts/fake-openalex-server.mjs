import http from 'node:http'

/** Shared isolated fixture. These invented records never reach the production endpoint. */
export const OPENALEX_FIXTURE_WORKS = [
  {id:'https://openalex.org/W12345',doi:'https://doi.org/10.1234/example',title:'Warming and soil diversity',publication_year:2024,publication_date:'2024-05-01',authorships:[{author:{display_name:'A. Researcher'}},{author:{display_name:'B. Scientist'}}],primary_location:{source:{display_name:'Ecology Example'},landing_page_url:'https://doi.org/10.1234/example'},abstract_inverted_index:{Soil:[0],diversity:[1],changes:[2]}},
  {id:'https://openalex.org/W12346',doi:null,title:'Soil community observations',publication_year:2023,publication_date:'2023-06-01',authorships:[],primary_location:null,abstract_inverted_index:null},
]
export async function startFakeOpenAlexServer() {
  const requests=[]
  const server=http.createServer((req,res)=>{
    const url=new URL(req.url,'http://127.0.0.1')
    requests.push({path:decodeURIComponent(url.pathname),query:Object.fromEntries(url.searchParams)})
    res.setHeader('content-type','application/json')
    const send=(status,body)=>{res.statusCode=status;res.end(JSON.stringify(body))}
    if(req.method!=='GET')return send(405,{error:'method not allowed'})
    if(url.pathname==='/works') {
      if(url.searchParams.get('search')==='rate-limit-fixture')return send(429,{error:'fixture rate limit'})
      const results=url.searchParams.get('search')==='no-results-fixture'?[]:OPENALEX_FIXTURE_WORKS
      return send(200,{meta:{count:results.length},results:results.slice(0,Number(url.searchParams.get('per_page')??10))})
    }
    const doi=decodeURIComponent(url.pathname.slice('/works/'.length))
    const work=OPENALEX_FIXTURE_WORKS.find(w=>w.doi===doi)
    return work?send(200,work):send(404,{error:'not found'})
  })
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
  return {url:`http://127.0.0.1:${server.address().port}`,requests,close:()=>new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()))}
}
