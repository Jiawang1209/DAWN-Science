/** Read-only confirmation that a host receipt belongs to the live branch AND the persisted Pi log. */
import {readFile} from 'node:fs/promises'
import {parseSessionEntries, type SessionManager, type FileEntry, type CustomMessageEntry} from '@earendil-works/pi-coding-agent'

function resultReceipt(entry: FileEntry, messageId: string): entry is CustomMessageEntry {
  return entry.type === 'custom_message' && entry.customType === 'dawn-subagent-result' &&
    typeof entry.details === 'object' && entry.details !== null && 'messageId' in entry.details && entry.details.messageId === messageId
}

/** Pi can retain a custom entry in memory after a failed append; memory alone cannot acknowledge an outbox. */
export async function hasDurableOrchestrationReceipt(manager: Pick<SessionManager, 'getSessionFile' | 'getBranch'>, messageId: string): Promise<boolean> {
  const file = manager.getSessionFile()
  if (!file || !manager.getBranch().some(entry => resultReceipt(entry, messageId))) return false
  let text: string
  try {text = await readFile(file, 'utf8')}
  catch (error) {
    // A new Pi session does not create its file until the first assistant response.
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') return false
    throw error
  }
  // Re-read the active branch after I/O so a concurrent rewind cannot authorize a removed receipt.
  const active = new Set(manager.getBranch().filter(entry => resultReceipt(entry, messageId)).map(entry => entry.id))
  return parseSessionEntries(text).some(entry => resultReceipt(entry, messageId) && active.has(entry.id))
}
