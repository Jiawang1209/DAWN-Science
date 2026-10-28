import {describe,it,expect} from 'vitest'
import {buildAnalysisReport, recordedScriptCall} from '../../src/delivery/report.js'
import {DeliveryGenerationSchema} from '../../src/protocol/delivery.js'

const generate=(overrides:Record<string,unknown>={})=>DeliveryGenerationSchema.parse({readme:'# 运行说明\n输入位于原工作区。',interpretation:'分析目标是比较样地，实际统计结果仍需审阅。',scripts:[],gaps:[],steps:[{title:'清洗与绘图',purpose:'采用分步脚本',script:'analysis/01 清洗.py',args:[],inputs:['data/raw.csv'],outputs:['figures/图 (一).png'],interpretation:'图像像素没有交给模型，解释以统计表为据。'}],...overrides})
const files=[{path:'analysis/01 清洗.py',copyPath:'files/analysis/01 清洗.py'},{path:'figures/图 (一).png',copyPath:'files/figures/图 (一).png'}]
describe('deterministic analysis report',()=>{
  it('builds encoded package links and embeds pictures, with suggestions explicitly unexecuted',()=>{
    const r=buildAnalysisReport({name:'样地',generated:generate(),files,inputs:['data/raw.csv']})
    expect(r.report).toContain('(files/analysis/01%20%E6%B8%85%E6%B4%97.py)')
    expect(r.report).toContain('![figures/图 (一).png](files/figures/%E5%9B%BE%20%28%E4%B8%80%29.png)')
    expect(r.report).toContain("python3 'analysis/01 清洗.py'")
    expect(r.report).toContain('调用位置：交付目录下的 files/')
    expect(r.report).toContain('建议调用方式（未执行）')
    expect(r.gaps).toEqual([])
  })
  it('does not turn model path inventions into links or executed states',()=>{
    const r=buildAnalysisReport({name:'audit',generated:generate({interpretation:'请看 [私有文件](../../private.py)，此叙述仅为模型输出。',steps:[{title:'不存在',purpose:'unknown',script:'private.py',args:[],inputs:[],outputs:[]}]}),files,inputs:[]})
    expect(r.report).not.toContain('[私有文件](../../private.py)')
    expect(r.report).toContain('\\[私有文件\\]')
    expect(r.gaps).toContain('步骤脚本未纳入本次交付：private.py')
    expect(r.report).toContain('未确认步骤的脚本')
    expect(DeliveryGenerationSchema.safeParse({...generate(),steps:[{...generate().steps![0],status:'executed'}]}).success).toBe(false)
  })
  it('quotes arguments as literal argv and keeps command fences intact',()=>{
    const g=generate();g.steps![0]!.args=["a'b",'$(touch secret)', '```\nunsafe']
    const r=buildAnalysisReport({name:'quoting',generated:g,files,inputs:['data/raw.csv']})
    expect(r.report).toContain("'a'\\''b'")
    expect(r.report).toContain("'$(touch secret)'")
    expect(r.report).toContain('````sh')
  })
  it('reports missing inputs, results and unknown invocations instead of fabricating a working call',()=>{
    const g=generate();delete g.steps![0]!.args
    const r=buildAnalysisReport({name:'missing',generated:g,files:files.slice(0,1),inputs:[]})
    expect(r.report).toContain('调用方式未记录')
    expect(r.gaps).toContain('步骤引用未采用或未复制的文件：figures/图 (一).png')
    expect(r.gaps).toContain('步骤引用未采用或未复制的文件：data/raw.csv')
    expect(r.report).not.toContain('python3 ')
  })
  it('accepts old model responses and lists copied scripts without inventing steps',()=>{
    const g=generate();delete g.steps
    const r=buildAnalysisReport({name:'old response',generated:g,files,inputs:[]})
    expect(r.report).toContain('未确认步骤的脚本')
    expect(r.gaps).toContain('步骤及调用方式未记录：analysis/01 清洗.py')
  })
})
describe('backend frozen invocation facts',()=>{
  const source=(command:string)=>({execution:{workspace:'/w',tool:'bash',dispatch:'completed',status:'captured',code:JSON.stringify({command})}})
  it('recognizes only completed direct interpreter calls from the original workspace',()=>{
    expect(recordedScriptCall(source('/usr/bin/python3 analysis/01.py --input data.csv'),'/w')).toEqual({script:'analysis/01.py',command:'/usr/bin/python3 analysis/01.py --input data.csv'})
    expect(recordedScriptCall(source('Rscript --vanilla analysis/02.R'),'/w')?.script).toBe('analysis/02.R')
    for(const command of ['echo python3 analysis/01.py','python3 analysis/01.py; rm x','python3 "$SCRIPT"','python3 ../secret.py','python3 analysis/01.py\npython3 other.py'])expect(recordedScriptCall(source(command),'/w')).toBeUndefined()
    expect(recordedScriptCall(source('python3 analysis/01.py'),'/other')).toBeUndefined()
    expect(recordedScriptCall({execution:{...source('python3 analysis/01.py').execution,dispatch:'failed'}},'/w')).toBeUndefined()
  })
})
