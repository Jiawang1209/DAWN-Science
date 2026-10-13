import {expect,it,vi} from "vitest"
import {readOnlyBotCallbacks} from "../../src/ui/bot-member-view.js"
it("查看协作成员只保留读取与明确问答，不能拿到停止、改配置或派单回调",async()=>{
 const answer=vi.fn(),stop=vi.fn(),model=vi.fn()
 const input={onSend:vi.fn(),onAbort:stop,onPickModel:model,onCompact:vi.fn(),onSetPlan:vi.fn(),onSetConfigOption:vi.fn(),onRewind:vi.fn(),onAnswerQuestion:answer,onAnswerPermission:answer,model:{model:"m"}}
 const output=readOnlyBotCallbacks(input as never)
 expect(output.disabled).toBe(true);expect((output as unknown as {readOnlyReason:string}).readOnlyReason).toBe("协作执行对话，仅供查看");expect(output.onAbort).toBeUndefined();expect(output.onPickModel).toBeUndefined();expect(output.onSetConfigOption).toBeUndefined();expect(output.onCompact).toBeUndefined();expect(output.onRewind).toBeUndefined();expect(output.onSetPlan).toBeUndefined()
 expect(output.onAnswerQuestion).toBe(answer);expect(output.onAnswerPermission).toBe(answer)
 await expect(output.onSend("write")).rejects.toThrow()
 expect(stop).not.toHaveBeenCalled();expect(model).not.toHaveBeenCalled()
})
