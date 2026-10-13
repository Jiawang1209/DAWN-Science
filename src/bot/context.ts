import path, {posix} from "node:path"
/** Only promote mentioned, scope-owned, existing files into deliverable references. */
export async function verifiedArtifacts(text:string,workspace:string,exists:(path:string)=>Promise<boolean>, remote=false) {
 const paths=remote?posix:path
 const mentioned=new Set<string>()
 for(const match of text.matchAll(/\]\(([^)]+)\)|`([^`\n]+)`/g)){
  const value=(match[1]??match[2]??"").trim()
  if(!/\.(?:py|r|rmd|ipynb|md|txt|csv|tsv|json|pdf|png|jpg|jpeg|svg|html|xlsx|docx|pptx)$/i.test(value)||/^[a-z]+:\/\//i.test(value))continue
  const path=paths.resolve(workspace,value)
  if(path!==workspace&&!path.startsWith(paths.resolve(workspace)+paths.sep))continue
  mentioned.add(path)
 }
 const artifacts:string[]=[],unverified:string[]=[]
 for(const path of mentioned){try{(await exists(path)?artifacts:unverified).push(path)}catch{unverified.push(path)}}
 return{artifacts,unverified}
}
