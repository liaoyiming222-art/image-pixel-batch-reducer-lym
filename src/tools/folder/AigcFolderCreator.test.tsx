import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { FolderCreator } from './FolderCreator'
import { splitTable } from './parser'
import type { DirectoryHandle } from './createDirectories'

function tableRow(name = 'H83J08 带隔板弧边茶几 1.0米', type = '场景生成') {
  const row = Array<string>(32).fill('')
  row[0] = name; row[4] = '修改颜色和尺寸，不应从此处推测类型'; row[10] = '不要读取第11列'; row[11] = type; row[22] = '2026-10-15'
  return row
}
function pasteRows(text: string) {
  fireEvent.change(screen.getByRole('textbox', { name: '需求表格内容' }), { target: { value: text } })
  fireEvent.click(screen.getByRole('button', { name: '解析内容' }))
}
beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-19T02:00:00Z')) })
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); delete (window as Window & { showDirectoryPicker?: unknown }).showDirectoryPicker })

describe('AIGC folder requests', () => {
  it('reads columns 1 and 12 and updates the fixed naming rule when correcting values', () => {
    render(<FolderCreator />)
    pasteRows(tableRow().join('\t'))
    expect(screen.getByLabelText('需求名称列')).toHaveValue('0')
    expect(screen.getByLabelText('需求类型列')).toHaveValue('11')
    expect(screen.getByRole('textbox', { name: '第 1 条需求类型' })).toHaveValue('场景生成')
    expect(screen.getByText('【AI】2026-10-19-H83J08 带隔板弧边茶几 1.0米-场景生成')).toBeInTheDocument()
    expect(screen.getAllByRole('columnheader').map(cell => cell.textContent)).toEqual(['需求名称', '需求类型', '文件夹名称', '状态'])
    fireEvent.change(screen.getByRole('textbox', { name: '第 1 条需求类型' }), { target: { value: '产品精修' } })
    expect(screen.getByText('【AI】2026-10-19-H83J08 带隔板弧边茶几 1.0米-产品精修')).toBeInTheDocument()
    fireEvent.change(screen.getByRole('textbox', { name: '第 1 条需求名称' }), { target: { value: '茶几/组合' } })
    expect(screen.getByText('【AI】2026-10-19-茶几_组合-产品精修')).toBeInTheDocument()
  })

  it('handles multiple Excel rows with multiline descriptions and clears stale previews on new input', () => {
    const first = tableRow('茶几', '场景生成'); first[4] = '"第一行\n第二行"'
    const second = tableRow('餐桌', '产品精修')
    render(<FolderCreator />)
    pasteRows([first.join('\t'), second.join('\t')].join('\r\n'))
    expect(screen.getByText('【AI】2026-10-19-茶几-场景生成')).toBeInTheDocument()
    expect(screen.getByText('【AI】2026-10-19-餐桌-产品精修')).toBeInTheDocument()
    fireEvent.change(screen.getByRole('textbox', { name: '需求表格内容' }), { target: { value: tableRow('新批次').join('\t') } })
    expect(screen.queryByText('【AI】2026-10-19-茶几-场景生成')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '批量创建文件夹' })).toBeDisabled()
  })

  it('accepts a Markdown data row before a separator without losing the first request', () => {
    const first = tableRow('样例茶几', '场景生成'); first[4] = '正面场景<br>- 16:9 与 4:3'; first[9] = '\\\\server\\共享\\原图'
    const second = tableRow('样例餐桌', '产品精修')
    const text = `| ${first.join(' | ')} |\n| ${first.map(() => '-').join(' | ')} |\n| ${second.join(' | ')} |`
    const parsed = splitTable(text)
    expect(parsed).toHaveLength(2)
    expect(parsed[0]).toHaveLength(32)
    expect(parsed[0][4]).toBe('正面场景\n- 16:9 与 4:3')
    expect(parsed[0][9]).toBe(first[9])
    render(<FolderCreator />)
    pasteRows(text)
    expect(screen.getByText('【AI】2026-10-19-样例茶几-场景生成')).toBeInTheDocument()
    expect(screen.getByText('【AI】2026-10-19-样例餐桌-产品精修')).toBeInTheDocument()
  })

  it('does not fall back to the last available column when column 12 is absent', () => {
    render(<FolderCreator />)
    pasteRows(tableRow('茶几', '').slice(0, 12).join('\t'))
    expect(screen.getByText('缺少需求类型')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '批量创建文件夹' })).toBeDisabled()
    fireEvent.change(screen.getByRole('textbox', { name: '第 1 条需求类型' }), { target: { value: '场景生成' } })
    expect(screen.getByRole('button', { name: '批量创建文件夹' })).toBeEnabled()
  })

  it('uses the real creation day after midnight and still creates AI and original subfolders', async () => {
    const children = { name: '需求目录', getDirectoryHandle: vi.fn(async (name: string, options?: { create?: boolean }) => {
      if (!options?.create) throw new DOMException('missing', 'NotFoundError')
      return { name } as DirectoryHandle
    }) }
    const root: DirectoryHandle = { name: '测试位置', getDirectoryHandle: vi.fn(async (_name: string, options?: { create?: boolean }) => {
      if (!options?.create) throw new DOMException('missing', 'NotFoundError')
      return children
    }) }
    Object.defineProperty(window, 'showDirectoryPicker', { configurable: true, value: vi.fn(async () => root) })
    render(<FolderCreator />)
    pasteRows(tableRow('茶几').join('\t'))
    fireEvent.click(screen.getByRole('button', { name: '选择目标文件夹' }))
    await waitFor(() => expect(screen.getByText('已选择：测试位置')).toBeInTheDocument())
    vi.setSystemTime(new Date('2026-10-19T16:00:00Z'))
    fireEvent.click(screen.getByRole('button', { name: '批量创建文件夹' }))
    await waitFor(() => expect(screen.getByText('创建成功')).toBeInTheDocument())
    expect(root.getDirectoryHandle).toHaveBeenCalledWith('【AI】2026-10-20-茶几-场景生成', { create: true })
    expect(children.getDirectoryHandle).toHaveBeenCalledWith('AI', { create: true })
    expect(children.getDirectoryHandle).toHaveBeenCalledWith('原图', { create: true })
    expect(screen.getByText('【AI】2026-10-20-茶几-场景生成')).toBeInTheDocument()
  })

  it('removes module numbering in both modes and keeps ordinary folder naming', () => {
    render(<FolderCreator />)
    expect(screen.getAllByRole('heading').every(heading => !/^\d+\./.test(heading.textContent ?? ''))).toBe(true)
    fireEvent.click(screen.getByRole('tab', { name: '普通文件夹工具' }))
    expect(screen.getAllByRole('heading').every(heading => !/^\d+\./.test(heading.textContent ?? ''))).toBe(true)
    fireEvent.change(screen.getByPlaceholderText(/例如：客户资料/), { target: { value: '客户资料' } })
    fireEvent.click(screen.getByRole('button', { name: '生成预览' }))
    expect(screen.getByRole('table').querySelector('input')).toHaveValue('客户资料')
  })

  it('limits mapping options to the current table and lets users remap either field', () => {
    render(<FolderCreator />)
    fireEvent.change(screen.getByRole('textbox', { name: '需求表格内容' }), { target: { value: '场景生成\t样例茶几\t备注' } })
    const nameSelect = screen.getByLabelText('需求名称列') as HTMLSelectElement
    const typeSelect = screen.getByLabelText('需求类型列') as HTMLSelectElement
    expect(Array.from(typeSelect.options).filter(option => !option.disabled).map(option => option.value)).toEqual(['0', '1', '2'])
    expect(typeSelect).toHaveValue('-1')
    expect(screen.getByRole('button', { name: '解析内容' })).toBeDisabled()
    fireEvent.change(nameSelect, { target: { value: '1' } })
    fireEvent.change(typeSelect, { target: { value: '0' } })
    fireEvent.click(screen.getByRole('button', { name: '解析内容' }))
    expect(screen.getByText('【AI】2026-10-19-样例茶几-场景生成')).toBeInTheDocument()
    fireEvent.change(screen.getByRole('textbox', { name: '需求表格内容' }), { target: { value: '产品精修' } })
    expect(nameSelect).toHaveValue('-1')
    expect(Array.from(nameSelect.options).filter(option => !option.disabled)).toHaveLength(1)
    expect(screen.getByRole('button', { name: '解析内容' })).toBeDisabled()
    expect(screen.queryByRole('checkbox', { name: '第一行是表头' })).not.toBeInTheDocument()
  })

  it('skips only an explicit request header after removing the manual header option', () => {
    const header = tableRow('需求名称', '需求类型')
    render(<FolderCreator />)
    pasteRows([header.join('\t'), tableRow('样例茶几').join('\t')].join('\n'))
    expect(screen.getByText('【AI】2026-10-19-样例茶几-场景生成')).toBeInTheDocument()
    expect(screen.getByRole('table').textContent).not.toContain('【AI】2026-10-19-需求名称-需求类型')
    expect(screen.getByText('已解析 1 条')).toBeInTheDocument()
  })
})
