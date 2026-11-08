/** Candidate demo wrapper; only changes its newly created disposable workspace. */
import {renameSync,writeFileSync} from 'node:fs'
import {join} from 'node:path'
import {prepareDemo as prepareBaseDemo,appRoot} from '../delivery-convergence-merge-20261108/prepare-demo.mjs'
export {appRoot}
export async function prepareDemo(){
 const demo=await prepareBaseDemo()
 const workspace=join(demo.dir,'DAWN-协作台新迭代-模拟模型')
 renameSync(demo.workspace,workspace);demo.workspace=workspace
 Object.assign(demo.env,{DAWN_DEFAULT_WORKSPACE:workspace,DAWN_PICK_DIRECTORY:workspace,DAWN_PICK_FILES:join(workspace,'input.csv')})
 writeFileSync(join(workspace,'README.md'),'# DAWN 协作台新迭代演示\n\n隔离候选版，使用 localhost 模拟模型，0 次真实模型请求。可检查批准状态、完整任务卡、真实文件工具、产物验收、记录与展开返回。\n\n本轮六题离线与分阶段用量见专项工作区 docs/validation/collaboration-evidence-20261108/。正式安装版与 main 未更改。\n')
 writeFileSync(join(demo.dir,'demo-identity.json'),JSON.stringify({purpose:'isolated candidate mock collaboration demo',workspace,appRoot,branch:'codex/collaboration-evidence-20261108',paidModelRequests:0},null,2)+'\n')
 return demo
}
