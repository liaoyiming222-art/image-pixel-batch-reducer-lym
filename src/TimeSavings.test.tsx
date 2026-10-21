import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {afterEach,expect,it,vi} from 'vitest'
import '@testing-library/jest-dom/vitest'
import TimeSavings from './TimeSavings'
import {defaultTimeConfigs,type TimeConfigs} from '../shared/time-savings'
afterEach(()=>{cleanup();vi.unstubAllGlobals()})
function setup(conflict=false){
 let configs:TimeConfigs=defaultTimeConfigs(),revision=0
 const counts={compress:2,inspect:0,folders:0,finder:0}
 const fetcher=vi.fn(async(_url:RequestInfo|URL,options?:RequestInit)=>{
  if(options?.method==='PUT'){
   if(conflict)return new Response(JSON.stringify({error:'参数已被其他窗口修改，请放弃修改并重新读取。'}),{status:409})
   const body=JSON.parse(String(options.body));configs=body.configs;revision++
   return new Response(JSON.stringify({configs,revision,updatedAt:Date.now()}))
  }
  return new Response(JSON.stringify({site:'pixelflow-image-tools',configs,revision,updatedAt:revision?Date.now():null,firstAt:Date.now(),lastAt:Date.now(),readAt:Date.now(),usage:{lifetime:counts,period:counts,monthly:[{month:'2026-10',counts}]}}))
 })
 vi.stubGlobal('fetch',fetcher)
 return fetcher
}
it('一位小数编辑立即预览，保存后重新打开仍使用保存值',async()=>{
 const fetcher=setup(),view=render(<TimeSavings site="pixelflow-image-tools" start="2026-10-01" end="2026-10-20" refreshAt={1}/> )
 const input=await screen.findByLabelText('图片压缩工具流程时间')
 expect((input as HTMLInputElement).value).toBe('3.0')
 expect(screen.getAllByText('54.0 秒').length).toBeGreaterThan(0)
 fireEvent.change(input,{target:{value:'4.0'}})
 expect(screen.getAllByText('52.0 秒').length).toBeGreaterThan(0)
 expect(fetcher.mock.calls.filter(call=>call[1]?.method==='PUT')).toHaveLength(0)
 fireEvent.click(screen.getByRole('button',{name:'保存参数'}))
 await screen.findByText('参数已保存，累计与月度估算已按当前参数重算。')
 view.unmount()
 render(<TimeSavings site="pixelflow-image-tools" start="2026-10-01" end="2026-10-20" refreshAt={2}/> )
 await waitFor(()=>expect(screen.getByLabelText('图片压缩工具流程时间')).toHaveValue(4))
 expect(screen.getAllByText('52.0 秒').length).toBeGreaterThan(0)
})
it('非法参数不能保存，编辑冲突保留草稿并明确提示',async()=>{
 setup(true);render(<TimeSavings site="pixelflow-image-tools" start="2026-10-01" end="2026-10-20" refreshAt={1}/>)
 const input=await screen.findByLabelText('图片压缩工具流程时间')
 fireEvent.change(input,{target:{value:''}})
 expect(screen.getByRole('button',{name:'保存参数'})).toBeDisabled()
 fireEvent.change(input,{target:{value:'2.5'}})
 fireEvent.click(screen.getByRole('button',{name:'保存参数'}))
 await screen.findByText('参数已被其他窗口修改，请放弃修改并重新读取。')
 expect(input).toHaveValue(2.5)
})

it('自动刷新期间不把新版本当作自己的编辑版本，避免覆盖其他窗口修改',async()=>{
 let reads=0,submitted=-1;const counts={compress:1,inspect:0,folders:0,finder:0}
 vi.stubGlobal('fetch',vi.fn(async(_url:RequestInfo|URL,options?:RequestInit)=>{
  if(options?.method==='PUT'){submitted=JSON.parse(String(options.body)).revision;return new Response(JSON.stringify({error:'版本冲突'}),{status:409})}
  reads++;return new Response(JSON.stringify({site:'pixelflow-image-tools',configs:defaultTimeConfigs(),revision:reads===1?1:2,updatedAt:Date.now(),firstAt:Date.now(),lastAt:Date.now(),readAt:Date.now(),usage:{lifetime:counts,period:counts,monthly:[]}}))
 }))
 const view=render(<TimeSavings site="pixelflow-image-tools" start="2026-10-01" end="2026-10-20" refreshAt={1}/>)
 const input=await screen.findByLabelText('图片压缩工具流程时间');fireEvent.change(input,{target:{value:'2.5'}})
 view.rerender(<TimeSavings site="pixelflow-image-tools" start="2026-10-01" end="2026-10-20" refreshAt={2}/>)
 await waitFor(()=>expect(reads).toBe(2));await waitFor(()=>expect(screen.getByRole('button',{name:'保存参数'})).toBeEnabled())
 fireEvent.click(screen.getByRole('button',{name:'保存参数'}));await screen.findByText('版本冲突');expect(submitted).toBe(1);expect(input).toHaveValue(2.5)
})

it('无历史和新完成记录时明确显示零秒，不用横线隐藏累计值',async()=>{
 const counts={compress:0,inspect:0,folders:0,finder:0}
 vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({site:'pixelflow-image-tools',configs:defaultTimeConfigs(),revision:0,updatedAt:null,firstAt:null,lastAt:null,readAt:Date.now(),historical:counts,usage:{lifetime:counts,period:counts,monthly:[]}}))))
 render(<TimeSavings site="pixelflow-image-tools" start="2026-10-01" end="2026-10-21" refreshAt={1}/>)
 await screen.findByLabelText('图片压缩工具流程时间')
 expect(screen.getByText('累计预计节约').closest('article')?.querySelector('strong')?.textContent).toBe('0.0 秒')
 expect(screen.getByText('本期预计节约').closest('article')?.querySelector('strong')?.textContent).toBe('0.0 秒')
})
