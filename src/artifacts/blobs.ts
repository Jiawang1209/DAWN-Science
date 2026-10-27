import { UserFacingError } from "../errors.js"
import { Worker } from "node:worker_threads"
import { createHash } from "node:crypto"
import { join, resolve, parse, sep, relative } from "node:path"
import { realpathSync } from "node:fs"
import { mkdir, readdir, lstat } from "node:fs/promises"
import { ArtifactPath } from "./model.js"

// Hashing/copying runs off the Electron main thread. A single descriptor supplies
// both the digest and copied bytes; before/after checks reject ordinary races.
const workerSource = `
const {parentPort,workerData:w}=require('node:worker_threads');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
let input,output,fileBytes;
try {
 const root=fs.realpathSync(w.root); let at=root;
 for(const part of w.relative.split('/')) {at=path.join(at,part);if(fs.lstatSync(at).isSymbolicLink())throw Error('拒绝符号链接');}
 input=fs.openSync(at,fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW||0));
 const before=fs.fstatSync(input,{bigint:true});
 if(!before.isFile())throw Error('只支持普通文件');
 fileBytes=Number(before.size);
 if(before.size>BigInt(w.maxBytes))throw Error('文件超过本次字节上限');
 if(w.target) output=fs.openSync(w.target,'wx',0o600);
 const hash=crypto.createHash('sha256'),buffer=Buffer.alloc(128*1024),chunks=w.readBytes?[]:undefined;let bytes=0,n;
 while((n=fs.readSync(input,buffer,0,buffer.length,null))>0){bytes+=n;if(bytes>w.maxBytes)throw Error('文件超过本次字节上限');hash.update(buffer.subarray(0,n));if(chunks)chunks.push(Buffer.from(buffer.subarray(0,n)));if(output!==undefined){let pos=0;while(pos<n)pos+=fs.writeSync(output,buffer,pos,n-pos);}}
 const after=fs.fstatSync(input,{bigint:true}),current=fs.lstatSync(at,{bigint:true});
 for(const key of ['dev','ino','size','mtimeNs','ctimeNs'])if(before[key]!==after[key]||before[key]!==current[key])throw Error('文件在采集期间发生变化');
 let check=root;for(const part of w.relative.split('/')){check=path.join(check,part);if(fs.lstatSync(check).isSymbolicLink())throw Error('路径已被替换');}
 if(output!==undefined)fs.fsyncSync(output);
 const content=chunks?Uint8Array.from(Buffer.concat(chunks)):undefined;
 parentPort.postMessage({sha256:hash.digest('hex'),bytes,content},content?[content.buffer]:[]);
}catch(e){parentPort.postMessage({error:String(e.message||e),code:e.code,fileBytes});}finally{if(input!==undefined)fs.closeSync(input);if(output!==undefined)fs.closeSync(output);}
`
export function fileIdentity(
  root: string,
  relative: string,
  options: {
    maxBytes: number
    timeoutMs: number
    target?: string
    signal?: AbortSignal
    readBytes?: boolean
  },
): Promise<{
  sha256: string
  bytes: number
  content?: Uint8Array | undefined
}> {
  ArtifactPath.parse(relative)
  return new Promise((resolveResult, reject) => {
    if (options.signal?.aborted) {
      reject(new UserFacingError("已取消留存"))
      return
    }
    const worker = new Worker(workerSource, {
      eval: true,
      workerData: {
        root,
        relative,
        maxBytes: options.maxBytes,
        target: options.target,
        readBytes: options.readBytes,
      },
    })
    let done = false
    const finish = (
      error?: Error,
      result?: {
        sha256: string
        bytes: number
        content?: Uint8Array | undefined
      },
    ) => {
      if (done) return
      done = true
      clearTimeout(timer)
      options.signal?.removeEventListener("abort", abort)
      void worker.terminate()
      if (error) reject(error)
      else resolveResult(result!)
    }
    const abort = () => finish(new UserFacingError("已取消留存"))
    const timer = setTimeout(
      () => finish(new UserFacingError("文件采集超时")),
      options.timeoutMs,
    )
    options.signal?.addEventListener("abort", abort, { once: true })
    worker.once("error", (e) =>
      finish(e instanceof Error ? e : new UserFacingError(String(e))),
    )
    worker.once(
      "message",
      (r: {
        error?: string
        code?: string
        fileBytes?: number
        sha256: string
        bytes: number
        content?: Uint8Array
      }) =>
        r.error
          ? finish(
              Object.assign(new UserFacingError(r.error), {
                code: r.code,
                fileBytes: r.fileBytes,
              }),
            )
          : finish(undefined, {
              sha256: r.sha256,
              bytes: r.bytes,
              content: r.content,
            }),
    )
    worker.once("exit", (code) => {
      if (!done)
        finish(new UserFacingError(`文件采集 worker 提前退出：${code}`))
    })
  })
}
export function projectDirectory(directory: string, projectId: string): string {
  return join(
    resolve(directory),
    createHash("sha256").update(projectId).digest("hex"),
  )
}
export async function safeDirectory(
  path: string,
  create = true,
): Promise<void> {
  let absolute = resolve(path)
  // macOS exposes its temporary directory through the OS-owned /var alias.
  // Normalize only those fixed system aliases; user-created links stay denied.
  if (process.platform === "darwin")
    for (const alias of ["/var", "/tmp"])
      if (absolute.startsWith(alias + "/"))
        absolute = join(realpathSync(alias), relative(alias, absolute))
  // Refuse symlink ancestors even when the final directory already exists.
  const root = parse(absolute).root,
    parts = absolute.slice(root.length).split(sep).filter(Boolean)
  let at = root
  for (const part of parts) {
    at = join(at, part)
    try {
      const st = await lstat(at)
      if (st.isSymbolicLink() || !st.isDirectory())
        throw new UserFacingError("留存目录不安全")
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e
      if (!create) return
      await mkdir(at, { mode: 0o700 })
    }
  }
}
export async function directoryBytes(directory: string): Promise<number> {
  let total = 0
  try {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      if (entry.isSymbolicLink())
        throw new UserFacingError("留存目录出现符号链接")
      if (entry.isDirectory()) total += await directoryBytes(path)
      else if (entry.isFile()) total += (await lstat(path)).size
    }
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e
  }
  return total
}
