import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {afterEach,expect,it,vi} from 'vitest'
import '@testing-library/jest-dom/vitest'
import {ImageFinder} from './ImageFinder'
import {readReferences} from './references'
import {imageHash,cachedHash} from './similarity'
vi.mock('./references',()=>({readReferences:vi.fn()}))
vi.mock('./similarity',async original=>({...await original<typeof import('./similarity')>(),imageHash:vi.fn(),cachedHash:vi.fn()}))
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.clearAllMocks()})
it('uses one Excel entry point, visible authorization and no search-mode tabs',()=>{render(<ImageFinder/>);expect(screen.queryByRole('tab')).not.toBeInTheDocument();expect(screen.getByLabelText('参考图片 Excel 表格')).toBeInTheDocument();expect(screen.getByText('系统提示“上传”仅表示允许本页面读取文件。')).toBeVisible();expect(screen.getByRole('button',{name:'开始检索'})).toBeDisabled()})
it('combines named and unnamed references in one search, using hashes only for fallback',async()=>{
 vi.stubGlobal('URL',{createObjectURL:vi.fn(()=> 'blob:test'),revokeObjectURL:vi.fn()})
 const ref=new File(['ref'],'reference.png');vi.mocked(readReferences).mockResolvedValue([{file:ref,name:'exact.png',origin:'Excel 第2行',warning:''},{file:ref,name:'',origin:'Excel 第3行',warning:''},{file:ref,name:'missing.png',origin:'Excel 第4行',warning:''}])
 vi.mocked(imageHash).mockResolvedValue('1'.repeat(256));vi.mocked(cachedHash).mockResolvedValue('1'.repeat(256))
 render(<ImageFinder/>);fireEvent.change(screen.getByLabelText('参考图片 Excel 表格'),{target:{files:[new File([],'query.xlsx')]}})
 await waitFor(()=>expect(screen.getByLabelText('图片名 Excel 第2行')).toHaveValue('exact.png'))
 const source=new File(['source'],'exact.png');Object.defineProperty(source,'webkitRelativePath',{value:'Library/exact.png'})
 fireEvent.change(screen.getByLabelText('共享图片文件夹'),{target:{files:[source]}})
 await waitFor(()=>expect(screen.getByRole('button',{name:'开始检索'})).toBeEnabled())
 fireEvent.click(screen.getByRole('button',{name:'开始检索'}))
 await waitFor(()=>expect(screen.getByRole('button',{name:'打包下载（1）'})).toBeEnabled())
 expect(imageHash).toHaveBeenCalledTimes(2);expect(cachedHash).toHaveBeenCalledTimes(1)
 expect(screen.getByText('missing.png · 名称未找到，按图片检索')).toBeInTheDocument()
})
it('retains existing directories when an empty directory is selected',async()=>{render(<ImageFinder/>);const picture=new File(['image'],'a.png');Object.defineProperty(picture,'webkitRelativePath',{value:'Library/a.png'});fireEvent.change(screen.getByLabelText('共享图片文件夹'),{target:{files:[picture]}});await waitFor(()=>expect(screen.getByText('Library')).toBeInTheDocument());const text=new File(['text'],'a.txt');Object.defineProperty(text,'webkitRelativePath',{value:'Empty/a.txt'});fireEvent.change(screen.getByLabelText('共享图片文件夹'),{target:{files:[text]}});await waitFor(()=>expect(screen.getByText('所选目录中没有找到支持的图片，已加入目录保持不变。')).toBeInTheDocument());expect(screen.getByText('Library')).toBeInTheDocument()})
