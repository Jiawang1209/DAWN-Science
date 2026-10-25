import http from 'node:http'
/** Synthetic metadata shared by dev:mock and Electron, never production API results. */
export const GEO_FIXTURES=[
 {uid:'200000123',accession:'GSE123',entrytype:'GSE',title:'Synthetic drought experiment',taxon:'Arabidopsis thaliana',summary:'Synthetic transcriptome comparison.',gdstype:'Expression profiling by high throughput sequencing',n_samples:2,gpl:'1234',samples:[{accession:'GSM1',title:'Control'},{accession:'GSM2',title:'Drought'}],pubmedids:['123'],bioproject:'PRJNA123'},
 {uid:'200000124',accession:'GSE124',entrytype:'GSE',title:'Synthetic soil experiment',taxon:'soil metagenome',n_samples:3,samples:[]},
]
export const SRA_FIXTURES=[
 {uid:'123',expxml:'<Summary><Title>Synthetic soil RNA experiment</Title><Platform instrument_model="NovaSeq">ILLUMINA</Platform><Statistics total_runs="2" total_spots="10" total_bases="50" total_size="30"/></Summary><Experiment acc="SRX123"/><Study acc="SRP123" name="Synthetic soil study"/><Sample acc="SRS123"/><Organism taxid="9606" ScientificName="Homo sapiens"/><Library_descriptor><LIBRARY_STRATEGY>RNA-Seq</LIBRARY_STRATEGY><LIBRARY_SOURCE>TRANSCRIPTOMIC</LIBRARY_SOURCE><LIBRARY_SELECTION>cDNA</LIBRARY_SELECTION><LIBRARY_LAYOUT><PAIRED/></LIBRARY_LAYOUT></Library_descriptor><Bioproject>PRJNA123</Bioproject>',runs:'<Run acc="SRR123" total_spots="4" total_bases="20" is_public="true"/><Run acc="SRR124" total_spots="6" total_bases="30" is_public="false"/>'},
 {uid:'124',expxml:'<Summary><Title>Synthetic second experiment</Title></Summary><Experiment acc="SRX124"/><Study acc="SRP123"/><Sample acc="SRS124"/>',runs:'<Run acc="SRR125"/>'},
]
export const UNIPROT_FIXTURES=[
 {primaryAccession:'P04637',uniProtkbId:'P53_HUMAN',entryType:'UniProtKB reviewed (Swiss-Prot)',organism:{scientificName:'Homo sapiens',taxonId:9606},proteinDescription:{recommendedName:{fullName:{value:'Synthetic p53 protein fixture'}}},genes:[{geneName:{value:'TP53'}}],comments:[{commentType:'FUNCTION',texts:[{value:'Synthetic function annotation, not a biological claim.',evidences:[{source:'PubMed',id:'123'}]}]}],sequence:{value:'ACDEFG',length:6}},
 {primaryAccession:'P12345',uniProtkbId:'SYNTHETIC_ENTRY',entryType:'UniProtKB unreviewed (TrEMBL)'},
]
export async function startFakeScienceServer(){
 const requests=[]
 const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://127.0.0.1'),q=url.searchParams
  requests.push({path:url.pathname,query:Object.fromEntries(q)})
  const send=(status,value)=>{res.statusCode=status;res.setHeader('content-type','application/json');res.end(JSON.stringify(value))}
  if(req.method!=='GET')return send(405,{error:'method'})
  if(q.get('term')?.includes('rate-limit-fixture'))return send(429,{error:'rate limit fixture'})
  if(url.pathname==='/uniprotkb/search'){
   const term=q.get('query')??''
   if(term==='rate-limit-fixture')return send(429,{messages:['rate limit fixture']})
   const records=term==='no-results-fixture'?[]:term.startsWith('accession:')?UNIPROT_FIXTURES.filter(r=>r.primaryAccession===term.slice(10)):UNIPROT_FIXTURES
   res.setHeader('x-total-results',String(records.length))
   return send(200,{results:records.slice(0,Number(q.get('size')??10))})
  }
  if(url.pathname.endsWith('esearch.fcgi')){
   const term=q.get('term')??''
   const source=q.get('db')==='sra'?SRA_FIXTURES:GEO_FIXTURES
   const records=term.includes('no-results-fixture')?[]:term.includes('GSE123[ACCN]')||term.includes('SRR123[ACCN]')?[source[0]]:source
   return send(200,{esearchresult:{count:String(records.length),idlist:records.slice(0,Number(q.get('retmax')??10)).map(r=>r.uid)}})
  }
  if(url.pathname.endsWith('esummary.fcgi')){
   const ids=q.get('id')?.split(',')??[]
   const source=q.get('db')==='sra'?SRA_FIXTURES:GEO_FIXTURES
   return send(200,{result:{uids:ids,...Object.fromEntries(ids.map(id=>[id,source.find(r=>r.uid===id)]))}})
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
