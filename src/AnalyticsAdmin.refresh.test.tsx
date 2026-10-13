import {act,cleanup,render,screen} from '@testing-library/react'
import {afterEach,expect,it,vi} from 'vitest'
import AnalyticsAdmin from './AnalyticsAdmin'
afterEach(()=>{cleanup();vi.useRealTimers();vi.unstubAllGlobals()})
it('首页和月度展示检测数，十分钟读取一次，手动刷新仍立即读取',async()=>{
 vi.useFakeTimers()
 const counts={pageviews:12,processed:2,inspected:8},site={id:'pixelflow-image-tools',name:'PixelFlow',host:'pixelflow-image-tools.pages.dev'}
 const fetcher=vi.fn(async()=>new Response(JSON.stringify({site,sites:[site],lifetime:counts,period:counts,monthly:[{month:'2026-10',...counts}],series:[],firstAt:Date.now(),lastAt:Date.now(),readAt:Date.now()}),{status:200}))
 vi.stubGlobal('fetch',fetcher)
 await act(async()=>{render(<AnalyticsAdmin/>);await Promise.resolve()})
 expect(screen.getByText('累计检测图片数量').closest('article')?.textContent).toContain('8')
 const initial=fetcher.mock.calls.length
 await act(async()=>{await vi.advanceTimersByTimeAsync(599999)})
 expect(fetcher).toHaveBeenCalledTimes(initial)
 await act(async()=>{await vi.advanceTimersByTimeAsync(1)})
 expect(fetcher).toHaveBeenCalledTimes(initial+1)
 await act(async()=>{screen.getByRole('button',{name:'立即刷新'}).click();await Promise.resolve()})
 expect(fetcher).toHaveBeenCalledTimes(initial+2)
 await act(async()=>{screen.getByRole('button',{name:'月度统计'}).click()})
 expect(screen.getByRole('table').textContent).toContain('8')
 expect(screen.queryByText('累计处理成功图片')).toBeNull()
})

