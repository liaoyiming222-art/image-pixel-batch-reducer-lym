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
  fireEvent.click(screen.getByRole('button', { name: '添加图片文件夹' }))
  expect(click).toHaveBeenCalledTimes(2)
  expect(picker).not.toHaveBeenCalled()
})

function directoryFiles(root: string, names: string[], modified = 1000) {
  return names.map(name => {
    const file = new File(['original'], name.split('/').pop()!, { lastModified: modified })
    Object.defineProperty(file, 'webkitRelativePath', { value: `${root}/${name}` })
    Object.defineProperty(file, 'arrayBuffer', { value: vi.fn(async () => Uint8Array.of(1, 2).buffer) })
    return file
  })
}
async function addDirectory(files: File[], expectedLabel: string) {
  fireEvent.change(screen.getByLabelText('共享图片文件夹'), { target: { files } })
  await waitFor(() => expect(screen.getByRole('button', { name: `移除目录 ${expectedLabel}` })).toBeEnabled())
}
function requestNames(text: string) {
  fireEvent.click(screen.getByRole('tab', { name: '粘贴文字' }))
  fireEvent.change(screen.getByRole('textbox', { name: '图名文字' }), { target: { value: text } })
  fireEvent.click(screen.getByRole('button', { name: '提取图名' }))
}

it('accumulates directories, refreshes ambiguous matches and removes stale choices when a source is removed', async () => {
  render(<ImageFinder />)
  requestNames('产品图\n独有图片')
  const first = directoryFiles('目录甲', ['原图/产品图.png', '独有图片.jpg'])
  await addDirectory(first, '目录甲')
  fireEvent.click(screen.getByRole('button', { name: '查找图片' }))
  expect(screen.getByText('2 张图片已选中')).toBeInTheDocument()
  const second = directoryFiles('目录乙', ['原图/产品图.png'])
  await addDirectory(second, '目录乙')
  expect(screen.getByRole('button', { name: '移除目录 目录甲' })).toBeInTheDocument()
  expect(screen.getByText('2 个目录 · 3 张图片')).toBeInTheDocument()
  expect(screen.getByText('1 张图片已选中')).toBeInTheDocument()
  const choices = screen.getByRole('combobox', { name: '为 产品图 选择图片' }) as HTMLSelectElement
  expect(Array.from(choices.options).map(option => option.textContent)).toEqual(['多个同名文件，请选择', '目录甲/原图/产品图.png', '目录乙/原图/产品图.png'])
  expect(choices.options[1].value).not.toBe(choices.options[2].value)
  fireEvent.change(choices, { target: { value: choices.options[1].value } })
  expect(screen.getByText('2 张图片已选中')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '移除目录 目录甲' }))
  expect(screen.getByText('1 个目录 · 1 张图片')).toBeInTheDocument()
  expect(screen.getByText('目录乙/原图/产品图.png')).toBeInTheDocument()
  expect(screen.getByRole('checkbox', { name: '下载 独有图片' })).toBeDisabled()
  expect(screen.queryByRole('combobox', { name: '为 产品图 选择图片' })).not.toBeInTheDocument()
  expect(screen.getByText('1 张图片已选中')).toBeInTheDocument()
  for (const file of [...first, ...second]) expect(file.arrayBuffer).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: '移除目录 目录乙' }))
  expect(screen.getByText('尚未选择图片文件夹')).toBeInTheDocument()
  expect(screen.getByText('0 张图片已选中')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '打包下载' })).toBeDisabled()
})

it('asks before adding an identical directory manifest and can retain distinct sources with identical metadata', async () => {
  render(<ImageFinder />)
  const files = directoryFiles('修图', ['原图/产品图.png'])
  await addDirectory(files, '修图')
  fireEvent.change(screen.getByLabelText('共享图片文件夹'), { target: { files } })
  await waitFor(() => expect(screen.getByRole('region', { name: '核对重复目录' })).toBeInTheDocument())
  expect(screen.getByText('1 个目录 · 1 张图片')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '取消添加' }))
  expect(screen.queryByRole('region', { name: '核对重复目录' })).not.toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('共享图片文件夹'), { target: { files } })
  await waitFor(() => expect(screen.getByRole('button', { name: '仍然添加' })).toBeEnabled())
  fireEvent.click(screen.getByRole('button', { name: '仍然添加' }))
  expect(screen.getByRole('button', { name: '移除目录 修图 (2)' })).toBeInTheDocument()
  expect(screen.getByText('2 个目录 · 2 张图片')).toBeInTheDocument()
  requestNames('产品图')
  fireEvent.click(screen.getByRole('button', { name: '查找图片' }))
  const options = (screen.getByRole('combobox', { name: '为 产品图 选择图片' }) as HTMLSelectElement).options
  expect(Array.from(options).map(option => option.text)).toEqual(['多个同名文件，请选择', '修图/原图/产品图.png', '修图 (2)/原图/产品图.png'])
})

it('preserves existing sources when an added directory contains no images or scanning is cancelled', async () => {
  render(<ImageFinder />)
  await addDirectory(directoryFiles('已添加', ['产品图.png']), '已添加')
  fireEvent.change(screen.getByLabelText('共享图片文件夹'), { target: { files: directoryFiles('空目录', ['说明.txt']) } })
  await waitFor(() => expect(screen.getByText('所选目录中没有找到支持的图片，已添加目录保持不变。')).toBeInTheDocument())
  expect(screen.getByText('1 个目录 · 1 张图片')).toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('共享图片文件夹'), { target: { files: directoryFiles('取消目录', ['产品图.png']) } })
  fireEvent.click(screen.getByRole('button', { name: '停止扫描' }))
  await waitFor(() => expect(screen.queryByRole('button', { name: '停止扫描' })).not.toBeInTheDocument())
  expect(screen.queryByRole('button', { name: '移除目录 取消目录' })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: '移除目录 已添加' })).toBeEnabled()
})
