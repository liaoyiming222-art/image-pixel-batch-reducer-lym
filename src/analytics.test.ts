import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest'
beforeEach(()=>{vi.resetModules();vi.useFakeTimers();localStorage.clear();vi.stubEnv('PROD',true);vi.stubGlobal('location',{hostname:'pixelflow-image-tools.pages.dev',pathname:'/'});vi.stubGlobal('fetch',vi.fn(async()=>new Response('{}',{status:200})))})
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();vi.unstubAllEnvs()})
describe('浏览器采集',()=>{
  it('第二个正式站点发送自己的标识，清理另一站点的待发事件',async()=>{
    vi.stubGlobal('location',{hostname:'pixelfloweverybody.pages.dev',pathname:'/'})
    localStorage.setItem('pixelflow.analytics.queue.v1',JSON.stringify([{site:'pixelflow-image-tools',at:Date.now(),id:'legacy'}]))
    const {track}=await import('./analytics');track('page_view','app');await vi.advanceTimersByTimeAsync(1500)
    const events=JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body)).events
    expect(events).toHaveLength(1);expect(events[0].site).toBe('pixelfloweverybody')
  })
  it('浏览器用户编号持久化，新会话不会增加用户编号',async()=>{
    const {track}=await import('./analytics');track('page_view','app');await vi.advanceTimersByTimeAsync(1500)
    const first=JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body)).events[0]
    vi.advanceTimersByTime(31*60000);track('page_view','app');await vi.advanceTimersByTimeAsync(1500)
    const second=JSON.parse(String(vi.mocked(fetch).mock.calls[1][1]?.body)).events[0]
    expect(first.user).toBe(second.user);expect(first.session).not.toBe(second.session)
  })
  it('发送失败会重试相同事件编号，成功后清空队列',async()=>{
    vi.mocked(fetch).mockRejectedValueOnce(new Error('offline'))
    const {track}=await import('./analytics');track('page_view','app');await vi.advanceTimersByTimeAsync(1500);await vi.advanceTimersByTimeAsync(6000)
    const bodies=vi.mocked(fetch).mock.calls.map(call=>JSON.parse(String(call[1]?.body)))
    expect(bodies[0].events[0].id).toBe(bodies[1].events[0].id)
    expect(JSON.parse(localStorage.getItem('pixelflow.analytics.queue.v1')!)).toEqual([])
  })
  it('预览部署与后台不采集，重复检测结果不重复计算',async()=>{
    const {track,trackInspection}=await import('./analytics')
    vi.stubGlobal('location',{hostname:'preview.pixelflow-image-tools.pages.dev',pathname:'/'})
    track('page_view','app');await vi.advanceTimersByTimeAsync(1500);expect(fetch).not.toHaveBeenCalled()
    vi.stubGlobal('location',{hostname:'pixelflow-image-tools.pages.dev',pathname:'/admin'})
    track('page_view','app');await vi.advanceTimersByTimeAsync(1500);expect(fetch).not.toHaveBeenCalled()
    vi.stubGlobal('location',{hostname:'pixelflow-image-tools.pages.dev',pathname:'/'})
    trackInspection(['a','b']);trackInspection(['a','b']);trackInspection(['a','b','c']);await vi.advanceTimersByTimeAsync(1500)
    const events=JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body)).events
    expect(events.map((e:{props:{count:number}})=>e.props.count)).toEqual([2,1])
  })
})

it('存储不可用仍采集，300毫秒发送且不阻塞产品',async()=>{
 vi.spyOn(Storage.prototype,'getItem').mockImplementation(()=>{throw new Error('blocked storage')})
 const {track}=await import('./analytics');track('page_view','app')
 await vi.advanceTimersByTimeAsync(299);expect(fetch).not.toHaveBeenCalled()
 await vi.advanceTimersByTimeAsync(1);expect(fetch).toHaveBeenCalledTimes(1)
})
