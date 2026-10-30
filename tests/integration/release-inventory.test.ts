import { expect, it } from 'vitest'
import { parse } from 'yaml'
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'

it('发布库存按架构与安装器变体检查，不能仅凭扩展名宣称齐全',()=>{
  const workflow=parse(readFileSync('.github/workflows/release.yml','utf8'))
  const script=workflow.jobs.release.steps.find((s:{id?:string})=>s.id==='inventory').run
  const dir=mkdtempSync(join(tmpdir(),'dawn-release-check-'))
  try {
    mkdirSync(join(dir,'artifacts'))
    const files=['mac-arm64.dmg','win-x64.exe','linux-x64.AppImage','linux-x64.deb']
    for(const f of files)writeFileSync(join(dir,'artifacts','DAWN-Science-0.0.41-'+f),'')
    const out=join(dir,'out')
    const run=spawnSync('bash',['-c',script],{cwd:dir,env:{...process.env,GITHUB_OUTPUT:out,GITHUB_REF_NAME:'v0.0.41'},encoding:'utf8'})
    expect(run.status).toBe(0)
    const note=readFileSync(out,'utf8')
    expect(note).toContain('macOS x64')
    expect(note).toContain('Linux arm64')
    expect(note).toContain('Windows portable')
    for(const f of ['mac-arm64.zip','mac-x64.zip','mac-x64.dmg','win-x64-portable.exe','linux-arm64.AppImage','linux-arm64.deb'])writeFileSync(join(dir,'artifacts','DAWN-Science-0.0.41-'+f),'')
    writeFileSync(out,'')
    expect(spawnSync('bash',['-c',script],{cwd:dir,env:{...process.env,GITHUB_OUTPUT:out,GITHUB_REF_NAME:'v0.0.41'}}).status).toBe(0)
    expect(readFileSync(out,'utf8')).not.toContain('缺')
  }finally{rmSync(dir,{recursive:true,force:true})}
})
