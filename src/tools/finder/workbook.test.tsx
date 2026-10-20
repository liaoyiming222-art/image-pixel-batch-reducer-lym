import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import '@testing-library/jest-dom/vitest'
import JSZip from 'jszip'
import { readWorkbook } from './model'
import { ImageFinder } from './ImageFinder'

// Minimal OOXML fixtures exercise the real reader, without mocking its results.
async function workbook(sheets: { name: string; xml: string }[]) {
  const zip = new JSZip()
  zip.file('xl/workbook.xml', `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s, i) => `<sheet name="${s.name}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`)
  zip.file('xl/_rels/workbook.xml.rels', `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}</Relationships>`)
  sheets.forEach((s, i) => zip.file(`xl/worksheets/sheet${i + 1}.xml`, `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${s.xml}</sheetData></worksheet>`))
  return zip.generateAsync({ type: 'arraybuffer' })
}
const cell = (address: string, value: string) => `<c r="${address}" t="inlineStr"><is><t>${value}</t></is></c>`
async function upload(data: ArrayBuffer, name = '表格.xlsx') {
  const file = new File([], name)
  Object.defineProperty(file, 'arrayBuffer', { value: async () => data })
  fireEvent.change(screen.getByLabelText('上传 Excel 文件'), { target: { files: [file] } })
  await waitFor(() => expect(screen.getByRole('button', { name: /表格$/ })).toBeEnabled())
}
afterEach(cleanup)
describe('real Excel import', () => {
  it('reads text, preserves numeric identifiers and ignores embedded image formulas', async () => {
    const data = await workbook([{ name: '图名', xml: `<row r="1">${cell('A1', '图名称')}${cell('B1', '选图')}</row><row r="2">${cell('A2', '图&amp;名 修')}<c r="B2"><f>DISPIMG("id",1)</f><v/></c></row><row r="3"><c r="A3"><v>12345678901234567890</v></c></row>` }])
    const sheets = await readWorkbook(data)
    expect(sheets[0].rows[1][0]).toBe('图&名 修')
    expect(sheets[0].rows[2][0]).toBe('12345678901234567890')
    render(<ImageFinder />)
    await upload(data)
    expect(screen.getByRole('textbox', { name: '修改图名 图&名 修' })).toBeInTheDocument()
    expect(screen.queryByDisplayValue(/DISPIMG/)).not.toBeInTheDocument()
  })
  it('selects a recognized name column on a later sheet and allows switching sheets and columns', async () => {
    const data = await workbook([{ name: '空表', xml: '' }, { name: '无表头', xml: `<row r="1">${cell('A1', '无表头图片')}</row>` }, { name: '需求', xml: `<row r="1">${cell('A1', '备注')}</row><row r="2">${cell('A2', '备注')}${cell('B2', '图名称')}</row><row r="3">${cell('A3', '另一个图名')}${cell('B3', '目标图片')}</row>` }])
    render(<ImageFinder />)
    await upload(data)
    expect(screen.getByLabelText('工作表')).toHaveValue('2')
    expect(screen.getByLabelText('图名所在列')).toHaveValue('1')
    expect(screen.getByLabelText('从第几行提取')).toHaveValue(3)
    expect(screen.getByRole('textbox', { name: '修改图名 目标图片' })).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('图名所在列'), { target: { value: '0' } })
    expect(screen.getByRole('textbox', { name: '修改图名 另一个图名' })).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('工作表'), { target: { value: '1' } })
    expect(screen.getByRole('textbox', { name: '修改图名 无表头图片' })).toBeInTheDocument()
  })
  it('reports an empty workbook rather than silently importing no names', async () => {
    render(<ImageFinder />)
    await upload(await workbook([{ name: '空表', xml: '' }]))
    expect(screen.getByRole('alert')).toHaveTextContent('没有可读取的文字内容')
  })
  it('skips an empty first sheet when no sheet has a recognized header', async () => {
    render(<ImageFinder />)
    await upload(await workbook([{ name: '空表', xml: '' }, { name: '图片', xml: `<row r="1">${cell('A1', '无表头图片')}</row>` }]))
    expect(screen.getByLabelText('工作表')).toHaveValue('1')
    expect(screen.getByRole('textbox', { name: '修改图名 无表头图片' })).toBeInTheDocument()
  })
  it('explains an inaccessible source file and releases the busy state', async () => {
    render(<ImageFinder />)
    const file = new File([], '共享表格.xlsx')
    Object.defineProperty(file, 'arrayBuffer', { value: async () => { throw new Error('source disconnected') } })
    fireEvent.change(screen.getByLabelText('上传 Excel 文件'), { target: { files: [file] } })
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('确认文件仍可访问'))
    expect(screen.getByRole('button', { name: '选择表格' })).toBeEnabled()
    expect(screen.getByRole('alert')).not.toHaveTextContent('source disconnected')
  })
  it('retains a successful import when a replacement is corrupt and permits retrying', async () => {
    render(<ImageFinder />)
    const data = await workbook([{ name: '图名', xml: `<row r="1">${cell('A1', '图名称')}</row><row r="2">${cell('A2', '原图片')}</row>` }])
    await upload(data)
    await upload(new TextEncoder().encode('not an xlsx').buffer)
    expect(screen.getByRole('alert')).toHaveTextContent('当前图名清单已保留')
    expect(screen.getByRole('alert')).not.toHaveTextContent('Failed to fetch')
    expect(screen.getByRole('textbox', { name: '修改图名 原图片' })).toBeInTheDocument()
    await upload(data)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
