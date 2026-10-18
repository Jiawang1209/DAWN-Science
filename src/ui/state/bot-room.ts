import { atom } from "nanostores"

export interface BotRoomInput { requestId: string; message: string; toBotId?: string }
export interface BotTaskForm {expanded:boolean;draft:string;busy:boolean;error?:string|undefined}
export interface BotRoomState {
  page?: "overview" | "member" | "files" | "discussion" | undefined
  memberId?: string | undefined
  file?: string | undefined
  /** Opening the dock from a main-chat summary is an explicit scoped request. */
  openRequest?: string | undefined
  taskForms?:Readonly<Record<string,BotTaskForm>>|undefined
  draft: string
  target: string
  busy: boolean
  receipt?: BotRoomInput | undefined
  error?: string | undefined
  scrollTop: number
  pinned: boolean
  /** One expanded artifact per message; content stays component-local. */
  previews?: Readonly<Record<string,string | undefined>> | undefined
  messageCount: number
}
const empty: BotRoomState = {draft: "", target: "", busy: false, scrollTop: 0, pinned: true, messageCount: 0}
/** Renderer-owned room state survives dock/tab/member navigation, without crossing scope. */
export const $botRooms = atom<Readonly<Record<string, BotRoomState>>>({})
export function botRoomKey(owner: string | undefined, scope: string | undefined, team: string | undefined): string {
  return JSON.stringify([owner, scope, team])
}
export function readBotRoom(key: string): BotRoomState { return $botRooms.get()[key] ?? empty }
export function updateBotRoom(key: string, patch: Partial<BotRoomState>): void {
  $botRooms.set({...$botRooms.get(), [key]: {...readBotRoom(key), ...patch}})
}
