import { expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { HomeButton } from '../../src/ui/app-home.js'

it('返回首页只显示图标且保留可及名称与原点击动作', () => {
  const onClick=vi.fn()
  render(<HomeButton onClick={onClick} />)
  const button=screen.getByRole('button',{name:'首页'})
  expect(button.textContent).toBe('')
  expect(button.querySelector('svg')).toBeTruthy()
  fireEvent.click(button)
  expect(onClick).toHaveBeenCalledOnce()
})
