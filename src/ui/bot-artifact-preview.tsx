import {useEffect,useState} from "react"
import {FilePreviewContent,type FileContent} from "./files.js"
import {PreviewCloseButton} from "./preview-close-button.js"
import {Button,Loader} from "./primitives.js"
import {t,tf} from "./i18n/index.js"

export type ReadBotArtifact = (path:string)=>Promise<FileContent>
/** Each mounted artifact owns its read; cleanup discards close/switch/scope races. */
export function BotArtifactPreview({path,readArtifact,onClose}: {
  path:string; readArtifact:ReadBotArtifact; onClose:()=>void
}) {
  const [retry,setRetry]=useState(0)
  const [result,setResult]=useState<{path:string;reader:ReadBotArtifact;retry:number;content?:FileContent;error?:string}>()
  useEffect(()=>{
    let active=true
    // Promise boundary also captures synchronous path validation failures.
    void Promise.resolve().then(()=>readArtifact(path)).then(content=>{
      if(active)setResult({path,reader:readArtifact,retry,content})
    }).catch((error:unknown)=>{
      if(active)setResult({path,reader:readArtifact,retry,error:error instanceof Error?error.message:String(error)})
    })
    return ()=>{active=false}
  },[path,readArtifact,retry])
  const current=result?.path===path&&result.reader===readArtifact&&result.retry===retry?result:undefined
  return <section className="bot-artifact-preview" aria-label={tf("预览：{0}",path)}>
    <header className="bot-artifact-preview-head"><span className="name" tabIndex={0} aria-label={tf("预览：{0}",path)}>{path.split(/[\\/]/).pop()||path}</span><PreviewCloseButton onClose={onClose}/></header>
    <div className="bot-artifact-preview-body">
      {current?.error!==undefined?<><p className="bot-error" role="alert">{current.error}</p><Button variant="outline" size="sm" onClick={()=>setRetry(n=>n+1)}>{t("重试")}</Button></>:current?.content?<FilePreviewContent path={path} content={current.content}/>:<Loader label={t("正在读文件")}/>}
    </div>
  </section>
}
