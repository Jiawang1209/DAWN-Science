/** Reopen an isolated, user-operable mock development build. Never starts a paid model. */
import {_electron} from 'playwright'
import {prepareDemo,appRoot} from './prepare-demo.mjs'
const demo=await prepareDemo()
let app
try{
 app=await _electron.launch({args:demo.args,cwd:appRoot,env:demo.env})
 const page=await app.firstWindow()
 await page.evaluate(()=>{localStorage.setItem('dawn.global.setupSkipped','1');localStorage.setItem('dawn.global.theme','dark')})
 await page.reload()
 console.log('DAWN隔离开发版已打开：本地模拟模型，无付费API。')
 console.log('演示工作区：'+demo.workspace)
 console.log('点击“打开文件夹”进入此演示工作区，创建会话后可生成、采纳并检查自动安排。')
 console.log('退出该开发版可停止本地模拟服务；正式App配置和数据保持独立。')
 const close=()=>{void app.close().catch(()=>{})}
 process.once('SIGINT',close);process.once('SIGTERM',close)
 await new Promise(resolve=>app.once('close',resolve))
 process.off('SIGINT',close);process.off('SIGTERM',close)
}finally{await app?.close().catch(()=>{});await demo.close()}
