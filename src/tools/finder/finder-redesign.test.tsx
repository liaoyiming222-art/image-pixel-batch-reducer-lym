import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { ImageFinder } from './ImageFinder'
afterEach(cleanup)
it('switches between names and pictures without the removed text input', () => {
  render(<ImageFinder />)
  expect(screen.getByRole('heading', { name: '检索打包图片' })).toBeInTheDocument()
  expect(screen.queryByText('粘贴文字')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('tab', { name: /按图片查找/ }))
  expect(screen.getByLabelText('参考图片或表格')).toHaveAttribute('multiple')
  expect(screen.getByRole('button', { name: '开始图片检索' })).toBeDisabled()
})
it('deduplicates bulk paths and supports adding child folders together', () => {
  render(<ImageFinder />)
  fireEvent.change(screen.getByLabelText('批量添加文件夹路径'), { target: { value: 'C:\\Photos\nC:\\Photos\n\\\\server\\images' } })
  fireEvent.click(screen.getByRole('button', { name: '批量加入路径' }))
  expect(screen.getAllByLabelText('文件夹路径')).toHaveLength(2)
  const checkbox = screen.getByRole('checkbox', { name: /批量加入其中的子文件夹/ })
  fireEvent.click(checkbox)
  expect(checkbox).toBeChecked()
})
