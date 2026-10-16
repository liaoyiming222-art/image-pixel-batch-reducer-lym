import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import App from '../../App'
import { ImageFinder } from './ImageFinder'

afterEach(() => { cleanup(); vi.unstubAllGlobals(); delete (window as Window & { showDirectoryPicker?: unknown }).showDirectoryPicker })
function selectSource(name: string, read = vi.fn()) {
  const file = new File(['source'], name, { type: 'image/png' })
  Object.defineProperty(file, 'webkitRelativePath', { value: `共享目录/原图/${name}` })
  Object.defineProperty(file, 'arrayBuffer', { value: read })
  fireEvent.change(screen.getByLabelText('共享图片文件夹'), { target: { files: [file] } })
  return read
}
it('lets users paste names, find pictures and keep the workspace when switching tools', async () => {
  render(<App />)
  fireEvent.click(screen.getAllByRole('button', { name: '按名称查找图片' })[0])
  fireEvent.click(screen.getByRole('tab', { name: '粘贴文字' }))
  fireEvent.change(screen.getByRole('textbox', { name: '图名文字' }), { target: { value: '产品图\n不存在的图片' } })
  fireEvent.click(screen.getByRole('button', { name: '提取图名' }))
  fireEvent.click(screen.getByRole('button', { name: '选择图片文件夹' }))
  const read = selectSource('产品图.png')
  await waitFor(() => expect(screen.getByText('共享目录')).toBeInTheDocument())
  expect(read).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: '查找图片' }))
  expect(screen.getByRole('checkbox', { name: '下载 产品图' })).toBeChecked()
  expect(screen.getByRole('checkbox', { name: '下载 不存在的图片' })).toBeDisabled()
  expect(screen.getByText('1 张图片已选中')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: /^首页$/ }))
  fireEvent.click(screen.getAllByRole('button', { name: '按名称查找图片' })[0])
  expect(screen.getByRole('checkbox', { name: '下载 产品图' })).toBeChecked()
  expect(screen.getByRole('textbox', { name: '图名文字' })).toHaveValue('产品图\n不存在的图片')
  delete (window as Window & { showDirectoryPicker?: unknown }).showDirectoryPicker
})

it('keeps failed shared-file reads visible and lets the user exclude them', async () => {
  render(<ImageFinder />)
  fireEvent.click(screen.getByRole('tab', { name: '粘贴文字' }))
  fireEvent.change(screen.getByRole('textbox', { name: '图名文字' }), { target: { value: '读取失败图.png' } })
  fireEvent.click(screen.getByRole('button', { name: '提取图名' }))
  fireEvent.click(screen.getByRole('button', { name: '选择图片文件夹' }))
  selectSource('读取失败图.png', vi.fn().mockRejectedValue(new Error('network share disconnected')))
  await waitFor(() => expect(screen.getByText('共享目录')).toBeInTheDocument())
  fireEvent.click(screen.getByRole('button', { name: '查找图片' }))
  fireEvent.click(screen.getByRole('button', { name: '打包下载' }))
  await waitFor(() => expect(screen.getByText('1 张图片无法读取，未生成压缩包。')).toBeInTheDocument())
  expect(screen.getByText('无法读取图片，请检查共享连接或权限后重试，也可取消勾选。')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('checkbox', { name: '下载 读取失败图.png' }))
  expect(screen.getByRole('button', { name: '重试打包下载' })).toBeDisabled()
})

it('uses the ordinary directory input directly without a separate compatibility mode', async () => {
  const picker = vi.fn(async () => { throw new DOMException('Shared directory rejected', 'AbortError') })
  Object.defineProperty(window, 'showDirectoryPicker', { configurable: true, value: picker })
  render(<ImageFinder />)
  const input = screen.getByLabelText('共享图片文件夹') as HTMLInputElement
  const click = vi.spyOn(input, 'click')
  fireEvent.click(screen.getByRole('button', { name: '选择图片文件夹' }))
  expect(click).toHaveBeenCalledTimes(1)
  selectSource('共享图片.png')
  await waitFor(() => expect(screen.getByText('共享目录')).toBeInTheDocument())
  expect(screen.getByText('找到 1 张图片 · 仅建立名称索引，打包时才读取图片内容')).toBeInTheDocument()
  expect(screen.queryByText('兼容方式选择')).not.toBeInTheDocument()
  expect(screen.queryByText('能进入目录，但无法确认选择？')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '更换图片文件夹' }))
  expect(click).toHaveBeenCalledTimes(2)
  expect(picker).not.toHaveBeenCalled()
})
