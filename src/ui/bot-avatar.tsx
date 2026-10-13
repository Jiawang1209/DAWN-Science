import rpIcon from "../../packaging/icon.svg"
import {tf} from "./i18n/index.js"

/** A Bot keeps its visual identity across rooms, private chats and profile edits. */
export function BotAvatar(p:{id:string;name:string;kind?:"bot"|"user"|"captain"|"system"}) {
  const kind=p.kind??"bot"
  let hash=0
  for(const code of p.id)hash=(Math.imul(hash,31)+code.codePointAt(0)!)>>>0
  const mark=hash%4
  return <span className={`bot-avatar bot-avatar-${kind}`} role="img" aria-label={tf("{0}的头像",p.name)} data-identity={p.id} data-tone={hash%6}>
    {kind==="captain"?<img src={rpIcon} alt=""/>:<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {kind==="user"?<><circle cx="12" cy="8" r="3.2"/><path d="M5.5 20v-2a6.5 6.5 0 0 1 13 0v2"/></>:kind==="system"?<><circle cx="12" cy="12" r="7"/><path d="M12 10v6m0-9v.1"/></>:<>
        <rect x="4" y="6" width="16" height="13" rx="4"/><path d="M12 3v3M2 11v3m20-3v3"/>
        {mark===0?<><circle cx="8.5" cy="11.5" r=".8" fill="currentColor"/><circle cx="15.5" cy="11.5" r=".8" fill="currentColor"/><path d="M9 15.5h6"/></>:mark===1?<><path d="M7.5 12h3m3-2h3M9 15.5h6"/></>:mark===2?<><path d="m7.5 12 1.5-1.5 1.5 1.5m3 0 1.5-1.5 1.5 1.5M10 15.5h4"/></>:<><circle cx="8.5" cy="11.5" r="1.2"/><circle cx="15.5" cy="11.5" r="1.2"/><path d="m10 15 2 1 2-1"/></>}
        <circle cx="18.5" cy="5.5" r="2" fill="currentColor" stroke="none"/>
      </>}
    </svg>}
  </span>
}
