import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ProjectFilePicker } from '../../src/ui/project-file-picker.js'
import type { WorkbenchClient } from '../../src/ui/client.js'
afterEach(cleanup)
const directory = { path: '', entries: [{name:'old.py',kind:'file',modifiedAt:'2026'},{name:'.env',kind:'file',modifiedAt:'2026'}], ignored:0, omitted:0 }
const client = (get: unknown) => ({get}) as WorkbenchClient

describe('explicit project file selection', () => {
  it('searches the entire project, surfaces truncation, and preserves checked files across views', async () => {
    const get = vi.fn(async (op:string) => op === 'searchFiles' ? {matches:[{path:'figures/old.png',kind:'file'}],visited:100,skippedDirs:1,unreadable:0,truncated:'matches'} : directory)
    const add=vi.fn()
    render(<ProjectFilePicker sessionId="s" client={client(get)} selected={[]} onAdd={add} onClose={vi.fn()} />)
    fireEvent.click(await screen.findByRole('checkbox',{name:'old.py'}))
    expect(screen.queryByRole('checkbox',{name:'.env'})).toBeNull()
    fireEvent.change(screen.getByLabelText('按文件名搜索项目'),{target:{value:'png'}})
    fireEvent.click(screen.getByRole('button',{name:'搜索'}))
    fireEvent.click(await screen.findByRole('checkbox',{name:'figures/old.png'}))
    expect(get).toHaveBeenCalledWith('searchFiles',{sessionId:'s',path:'',query:'png'})
    expect(screen.getByText(/搜索未覆盖全部文件/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button',{name:'添加所选文件'}))
    expect(add).toHaveBeenCalledWith(['old.py','figures/old.png'])
  })

  it('requires explicit addition, disables duplicates and enforces the delivery limit', async () => {
    const close=vi.fn(), add=vi.fn()
    render(<ProjectFilePicker sessionId="s" client={client(vi.fn(async()=>directory))} selected={Array.from({length:60},(_,i)=>i===0?'old.py':`f${i}.py`)} onAdd={add} onClose={close} />)
    expect((await screen.findByRole('checkbox',{name:'old.py'}) as HTMLInputElement).disabled).toBe(true)
    expect((screen.getByRole('button',{name:'添加所选文件'}) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button',{name:'取消'}))
    expect(close).toHaveBeenCalledOnce()
    expect(add).not.toHaveBeenCalled()
  })

  it('reports load errors and retries the same directory', async () => {
    const get=vi.fn().mockRejectedValueOnce(new Error('项目暂时不可读')).mockResolvedValue(directory)
    render(<ProjectFilePicker sessionId="s" client={client(get)} selected={[]} onAdd={vi.fn()} onClose={vi.fn()} />)
    expect((await screen.findByRole('alert')).textContent).toContain('项目暂时不可读')
    fireEvent.click(screen.getByRole('button',{name:'重试'}))
    await screen.findByRole('checkbox',{name:'old.py'})
    await waitFor(()=>expect(get).toHaveBeenCalledTimes(2))
  })
})
