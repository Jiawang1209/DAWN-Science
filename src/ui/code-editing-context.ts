import { createContext } from 'react'

/** Entry points are provided only to the owning conversation/file surface. */
export const CodeEditingContext = createContext<{
  openCode: (source: { code: string; language: string; source: string }) => void
  openFile: (path: string) => void
} | undefined>(undefined)
