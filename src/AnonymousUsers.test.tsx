import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {afterEach,expect,it,vi} from 'vitest'
import '@testing-library/jest-dom/vitest'
import AnonymousUsers from './AnonymousUsers'
afterEach(()=>{cleanup();vi.unstubAllGlobals()})
it('匿名用户明细支持分页，数量随期间请求且不显示真实身份',async()=>{
 const fetcher=vi.fn(async(url:RequestInfo|URL)=>{
  const page=new URL(String(url),'https://local.example').searchParams.get('page')==='2'?2:1
  return new Response(JSON.stringify({page,total:21,pageSize:20,users:[{id:`hash${page}`,label:`访客 ABCDEF0${page}`,first_at:1,last_at:2,sessions:2,pageviews:3,inspected:10,processed:7,folders:3,matched:1}]}))
 })
 vi.stubGlobal('fetch',fetcher)
 render(<AnonymousUsers site="pixelflow-image-tools" start="2026-10-01" end="2026-10-21" refreshAt={1}/>)
 await screen.findByText('访客 ABCDEF01')
 expect(screen.getByRole('button',{name:'上一页'})).toBeDisabled()
 fireEvent.click(screen.getByRole('button',{name:'下一页'}))
 await screen.findByText('访客 ABCDEF02')
 await waitFor(()=>expect(screen.getByRole('button',{name:'下一页'})).toBeDisabled())
 expect(String(fetcher.mock.calls[1][0])).toContain('page=2')
 expect(screen.getByRole('table').textContent).toContain('服务图片')
})
