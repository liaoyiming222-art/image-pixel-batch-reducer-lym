import { beijingDay } from './db'
export type Values = Record<string, number>
export interface DailyRow { day:string; tool:string; [metric:string]:number|string }
export interface TrafficRow { day:string;metric:string;value:number;fetched_at?:number }
export interface IdentityRow { bucket:string;users:number;sessions:number;effective_users:number }
export const SITE_LAUNCH='2026-07-31'
function dates(start:string,end:string) {
  const result:string[]=[]
  for(let at=Date.parse(start+'T00:00:00Z');at<=Date.parse(end+'T00:00:00Z');at+=86400000)result.push(new Date(at).toISOString().slice(0,10))
  return result
}
const sum=(rows:DailyRow[])=>{
  const value:Values={}
  for(const row of rows)for(const [key,n]of Object.entries(row))if(!['day','tool'].includes(key))value[key]=(value[key]||0)+Number(n||0)
  return value
}
export function buildDashboard(rows:DailyRow[],archive:TrafficRow[],identities:{lifetime:Values;period:Values;monthly:IdentityRow[];daily:IdentityRow[]},firstAt:number|null,start:string,end:string,now=Date.now()) {
  const today=beijingDay(now),businessStart=firstAt?beijingDay(firstAt):null
  const from=start<SITE_LAUNCH?SITE_LAUNCH:start,to=end>today?today:end
  const traffic=new Map<string,Partial<Values>>()
  for(const row of archive){if(row.day>SITE_LAUNCH||row.day===SITE_LAUNCH){const value=traffic.get(row.day)||{};value[row.metric]=Number(row.value);traffic.set(row.day,value)}}
  const trafficSum=(begin:string,finish:string)=>{
    const days=dates(begin,finish),known=days.filter(day=>traffic.get(day)?.pageviews!==undefined&&traffic.get(day)?.visits!==undefined)
    return {pageviews:known.length?known.reduce((n,day)=>n+Number(traffic.get(day)!.pageviews),0):null,visits:known.length?known.reduce((n,day)=>n+Number(traffic.get(day)!.visits),0):null,coveredDays:known.length,expectedDays:days.length,missingDays:days.length-known.length,firstDay:known[0]||null,lastDay:known.at(-1)||null}
  }
  const lifetimeBusiness=sum(rows.filter(row=>row.day<=today)),periodBusiness=sum(rows.filter(row=>row.day>=from&&row.day<=to))
  const monthlyUsers=new Map(identities.monthly.map(row=>[row.bucket,row])),dailyUsers=new Map(identities.daily.map(row=>[row.bucket,row]))
  const monthly=[]
  for(let month=SITE_LAUNCH.slice(0,7);month<=today.slice(0,7);){
    const date=new Date(month+'-01T00:00:00Z'),next=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,1)).toISOString().slice(0,10)
    const first=month+'-01'<SITE_LAUNCH?SITE_LAUNCH:month+'-01',last=new Date(Date.parse(next+'T00:00:00Z')-86400000).toISOString().slice(0,10)
    const until=last>today?today:last,available=!!businessStart&&until>=businessStart
    const business=sum(rows.filter(row=>row.day.slice(0,7)===month)),user=monthlyUsers.get(month)
    monthly.push({month,traffic:trafficSum(first,until),business:available?business:null,users:available?(user?.users||0):null,effectiveUsers:available?(user?.effective_users||0):null,partial:month===today.slice(0,7),businessPartial:available&&!!businessStart&&businessStart>first,businessStart:available?businessStart:null})
    month=next.slice(0,7)
  }
  const series=dates(from,to).map(day=>{
    const available=!!businessStart&&day>=businessStart,business=sum(rows.filter(row=>row.day===day)),user=dailyUsers.get(day)
    return {day,pageviews:traffic.get(day)?.pageviews??null,visits:traffic.get(day)?.visits??null,users:available?(user?.users||0):null,effectiveUsers:available?(user?.effective_users||0):null,processed:available?(business.processed||0):null,inspected:available?(business.inspected||0):null,exports:available?(business.exports||0):null,folders:available?((business.folders||0)+(business.subfolders||0)):null}
  })
  return {siteLaunch:SITE_LAUNCH,today,businessStart,lifetime:{traffic:trafficSum(SITE_LAUNCH,today),business:lifetimeBusiness,...identities.lifetime},period:{start:from,end:to,traffic:trafficSum(from,to),business:periodBusiness,...identities.period},monthly:monthly.reverse(),series}
}
