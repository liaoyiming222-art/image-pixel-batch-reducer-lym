import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { PathQueue } from './PathQueue'
afterEach(() => { cleanup(); vi.restoreAllMocks() })
it('copies the selected path before opening the folder dialog', async () => {
  const order: string[] = []
  const writeText = vi.fn(async (path: string) => { order.push(path) })
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
  render(<PathQueue busy={false} onChoose={() => order.push('choose')} />)
  fireEvent.change(screen.getByLabelText('批量添加文件夹路径'), { target: { value: '\\\\server\\images' } })
  fireEvent.click(screen.getByText('批量加入路径'))
  fireEvent.click(screen.getByRole('button', { name: '复制并选择文件夹' }))
  await waitFor(() => expect(order).toEqual(['\\\\server\\images', 'choose']))
})
it('keeps the dialog closed and explains manual selection when clipboard permission is denied', async () => {
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } })
  const choose = vi.fn()
  render(<PathQueue busy={false} onChoose={choose} />)
  fireEvent.change(screen.getByLabelText('批量添加文件夹路径'), { target: { value: 'C:\\images' } })
  fireEvent.click(screen.getByText('批量加入路径'))
  fireEvent.click(screen.getByRole('button', { name: '复制并选择文件夹' }))
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('浏览器未允许复制'))
  expect(choose).not.toHaveBeenCalled()
})
