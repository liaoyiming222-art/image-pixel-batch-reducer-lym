import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {afterEach,expect,it,vi} from 'vitest'
import '@testing-library/jest-dom/vitest'
import {ImageFinder} from './ImageFinder'
import {readReferences} from './references'
vi.mock('./references',()=>({readReferences:vi.fn()}))
vi.mock('./similarity',async original=>({...await original<typeof import('./similarity')>(),imageHash:vi.fn(async()=> '1'.repeat(256)),cachedHash:vi.fn(async()=> '1'.repeat(256))}))
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.unstubAllEnvs();localStorage.clear()})
it('确认匹配源图片才上报数量，同清单重试与重复引用去重，新清单重新计数',async()=>{
 localStorage.clear();vi.stubEnv('PROD',true)
 vi.stubGlobal('location',{hostname:'pixelflow-image-tools.pages.dev',pathname:'/'})
 vi.stubGlobal('URL',{createObjectURL:vi.fn(()=> 'blob:test'),revokeObjectURL:vi.fn()})
 const batches:any[]=[];vi.stubGlobal('fetch',vi.fn(async(_url:unknown,options:RequestInit)=>{batches.push(...JSON.parse(String(options.body)).events);return new Response('{}',{status:200})}))
 const ref=new File(['reference'],'reference.png')
 vi.mocked(readReferences).mockResolvedValue(['exact.png','exact.png','ambig.png'].map((name,i)=>({file:ref,name,origin:`Excel 第${i+2}行`,warning:''})))
 render(<ImageFinder/>);
 const load=()=>fireEvent.change(screen.getByLabelText('参考图片 Excel 表格'),{target:{files:[new File([],'test.xlsx')]}})
 load();await screen.findByLabelText('图片名 Excel 第2行')
 const sources=['Library/exact.png','Library/a/ambig.png','Library/b/ambig.png'].map(path=>{const file=new File(['source'],path.split('/').pop()!);Object.defineProperty(file,'webkitRelativePath',{value:path});return file})
 fireEvent.change(screen.getByLabelText('共享图片文件夹'),{target:{files:sources}})
 await waitFor(()=>expect(screen.getByRole('button',{name:'开始检索'})).toBeEnabled())
 fireEvent.click(screen.getByRole('button',{name:'开始检索'}));await screen.findByRole('button',{name:'重试未完成项'})
 const count=()=>batches.filter(e=>e.name==='time_saving_completed'&&e.tool==='finder').reduce((sum,e)=>sum+e.props.count,0)
 await waitFor(()=>expect(count()).toBe(1))
 const selects=screen.getAllByLabelText('匹配 reference.png');fireEvent.change(selects[2],{target:{value:(selects[2] as HTMLSelectElement).options[1].value}})
 await waitFor(()=>expect(count()).toBe(2))
 fireEvent.click(screen.getByRole('button',{name:'开始检索'}));await waitFor(()=>expect(screen.getByRole('button',{name:'开始检索'})).toBeEnabled());await new Promise(resolve=>setTimeout(resolve,400));expect(count()).toBe(2)
 fireEvent.click(screen.getByRole('button',{name:'清空参考图'}));load();await screen.findByLabelText('图片名 Excel 第2行');fireEvent.click(screen.getByRole('button',{name:'开始检索'}));await waitFor(()=>expect(count()).toBe(3))
 expect(batches.every(e=>Object.keys(e.props).join(',')==='count')).toBe(true)
})
