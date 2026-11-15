import { createContext } from 'react'

/** Entry points are provided only to the owning conversation/file surface. */
export const CodeEditingContext = createContext<{
  openCode: (source: { code: string; language: string; source: string }) => void
  openFile: (path: string) => void
  editReply?: (replyId: string) => { status: 'pending' | 'applied' | 'expired'; requestId?: string } | undefined
  reviewCode?: (source: { requestId: string; code: string; language: string }) => void
  returnToScript?: (requestId: string) => void
} | undefined>(undefined)
