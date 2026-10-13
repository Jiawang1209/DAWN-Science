import{expect,it}from"vitest"
import{verifiedArtifacts}from"../../src/bot/context.js"
it("只交付实际存在且属于任务工作目录的产物，缺失路径单独说明",async()=>{
 const seen:string[]=[];const result=await verifiedArtifacts("[脚本](scripts/model.py) `figures/plot.png` `missing.csv` `/etc/passwd`", "/work", async p=>{seen.push(p);return p.endsWith("model.py")})
 expect(result.artifacts).toEqual(["/work/scripts/model.py"]);expect(result.unverified).toContain("/work/missing.csv");expect(seen).not.toContain("/etc/passwd")
})
