import {it,expect} from "vitest"
// @ts-expect-error shared development mock is JavaScript
import {botCollaborationTool} from "../../scripts/mock-bot-collaboration.mjs"
const system={role:"system",content:"BOT_COLLAB_STATS BOT_COLLAB_CONFIRM"}
it("optional shared scenario pauses for the actual user's answer and never treats cancellation as consent",()=>{
 const inspection=[system,{role:"assistant",tool_calls:[{function:{name:"bash"}}]},{role:"tool",content:'OBSERVED_INPUT={"suspect":[{"y":"-999"}]}'}]
 expect(botCollaborationTool({messages:inspection}).toolName).toBe("ask_user_question")
 const answered=(result:unknown)=>({messages:[...inspection,{role:"assistant",tool_calls:[{function:{name:"ask_user_question"}}]},{role:"tool",content:JSON.stringify(result)}]})
 expect(botCollaborationTool(answered({answers:[{id:"missing",selected:["排除缺失行"]}]}))).toMatchObject({toolName:"bot_colleagues"})
 expect(botCollaborationTool(answered({cancelled:true}))).toBeUndefined()
})
