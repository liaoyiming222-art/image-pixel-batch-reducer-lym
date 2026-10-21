import {useEffect,useRef,useState} from 'react'
interface Visitor{id:string;label:string;first_at:number;last_at:number;sessions:number;pageviews:number;inspected:number;processed:number;folders:number;matched:number}
interface Result{total:number;page:number;pageSize:number;users:Visitor[]}
const timestamp=(at:number)=>new Date(at).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false})
export default function AnonymousUsers({site,start,end,refreshAt}:{site:string;start:string;end:string;refreshAt:number}){
 const [page,setPage]=useState(1),[data,setData]=useState<Result|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(false),sequence=useRef(0)
 useEffect(()=>{setPage(1);setData(null)},[site,start,end])
 useEffect(()=>{
  const id=++sequence.current;setLoading(true)
  void(async()=>{try{const r=await fetch(`/api/admin/users?site=${encodeURIComponent(site)}&start=${start}&end=${end}&page=${page}`,{cache:'no-store',signal:AbortSignal.timeout(8000)}),j=await r.json();if(id!==sequence.current)return;if(!r.ok)throw new Error(j.error||'读取失败');setData(j);setError('')}catch(e){if(id===sequence.current)setError(e instanceof Error?e.message:'读取失败')}finally{if(id===sequence.current)setLoading(false)}})()
  return()=>{sequence.current++}
 },[site,start,end,page,refreshAt])
 return <section className="dash-panel anonymous-users"><div className="panel-head"><div><h2>匿名用户使用明细</h2><p>所选期间内，按匿名浏览器编号去重，共 {data?.total??'—'} 位；不代表真人身份。</p></div></div><p className="visitor-definition">同一站点、同一浏览器重复访问计一位。换设备、隐身窗口或清除存储会产生新编号；不按 IP 合并用户。各月人数分别去重，不能相加为累计人数。</p>{error&&<p className="dash-error" role="alert">{error}</p>}<div className="dash-table-wrap"><table className="dash-table"><thead><tr><th>匿名编号</th><th>访问量</th><th>会话</th><th>服务图片</th><th>压缩成功</th><th>新建目录</th><th>图片匹配</th><th>最近活动</th></tr></thead><tbody>{data?.users.length?data.users.map(user=><tr key={user.id}><td title={user.id}>{user.label}</td><td>{user.pageviews}</td><td>{user.sessions}</td><td>{user.inspected}</td><td>{user.processed}</td><td>{user.folders}</td><td>{user.matched}</td><td><time dateTime={new Date(user.last_at).toISOString()}>{timestamp(user.last_at)}</time></td></tr>):<tr><td colSpan={8}>{loading?'正在读取…':'该期间尚无匿名用户记录'}</td></tr>}</tbody></table></div><div className="visitor-pagination"><span>{loading?'正在更新…':`第 ${page} 页 · 每页 ${data?.pageSize||20} 位`}</span><button className="refresh-button" disabled={loading||page<=1} onClick={()=>setPage(p=>p-1)}>上一页</button><button className="refresh-button" disabled={loading||!data||page*data.pageSize>=data.total} onClick={()=>setPage(p=>p+1)}>下一页</button></div><p className="visitor-definition">服务图片按原有读取事件统计；压缩可来自两个图片工具；目录包含主目录和子目录。图片匹配仅包含新匹配事件，未记录的历史不会补造。表格显示期间用量，不包含文件名、路径或个人资料。</p></section>
}
