import JSZip from 'jszip'
export interface Reference { file: File; name: string; origin: string; warning: string }
const elements = (node: Document | Element, name: string) => Array.from(node.getElementsByTagNameNS('*', name))
const xml = (text: string) => new DOMParser().parseFromString(text, 'application/xml')
function resolve(base: string, target: string) { const parts = (target.startsWith('/') ? target.slice(1) : base.slice(0, base.lastIndexOf('/') + 1) + target).split('/'); const out: string[] = []; for(const part of parts) { if(part === '..') out.pop(); else if(part && part !== '.') out.push(part) } return out.join('/') }
const relFile = (path: string) => path.slice(0,path.lastIndexOf('/')+1)+'_rels/'+path.slice(path.lastIndexOf('/')+1)+'.rels'
export async function readReferences(file: File, columnOverride = ''): Promise<Reference[]> {
 if(!/\.xlsx$/i.test(file.name)) return [{file,name:'',origin:file.name,warning:''}]
 const zip=await JSZip.loadAsync(await file.arrayBuffer())
 const doc=async(path:string)=>xml(await zip.file(path)?.async('string') ?? '<empty/>')
 const rels=async(path:string)=>new Map(elements(await doc(relFile(path)),'Relationship').filter(e=>e.getAttribute('TargetMode')!=='External').map(e=>[e.getAttribute('Id')!,resolve(path,e.getAttribute('Target')!)]))
 const shared=elements(await doc('xl/sharedStrings.xml'),'si').map(e=>elements(e,'t').map(t=>t.textContent??'').join(''))
 const bookRels=await rels('xl/workbook.xml');const output:Reference[]=[]
 for(const sheet of elements(await doc('xl/workbook.xml'),'sheet')) {
  const id=sheet.getAttribute('r:id')??'';const path=bookRels.get(id);if(!path)continue
  const sheetDoc=await doc(path);const rows=new Map<number,Map<string,string>>();let nameColumn=''
  for(const cell of elements(sheetDoc,'c')) {const address=cell.getAttribute('r')??'';const col=address.replace(/\d/g,'');const row=Number(address.replace(/\D/g,''));const type=cell.getAttribute('t');const raw=elements(cell,'v')[0]?.textContent??'';const value=type==='s'?shared[Number(raw)]??'':type==='inlineStr'?elements(cell,'t').map(t=>t.textContent??'').join(''):raw; if(!rows.has(row))rows.set(row,new Map());rows.get(row)!.set(col,value);if(row<=30&&/^(图片名称|图片名|图名称|图名|文件名称|文件名)$/.test(value.replace(/\s/g,'')))nameColumn=col }
  if(columnOverride) nameColumn=columnOverride.trim().toUpperCase()
  const sheetRels=await rels(path)
  for(const drawing of elements(sheetDoc,'drawing')) {const drawingPath=sheetRels.get(drawing.getAttribute('r:id')??'');if(!drawingPath)continue;const drawingRels=await rels(drawingPath);const drawingDoc=await doc(drawingPath)
   const anchors=[...elements(drawingDoc,'oneCellAnchor'),...elements(drawingDoc,'twoCellAnchor'),...elements(drawingDoc,'absoluteAnchor')]
   const rowCounts=new Map<number,number>();for(const anchor of anchors){const row=Number(elements(anchor,'from')[0]&&elements(elements(anchor,'from')[0],'row')[0]?.textContent)+1;rowCounts.set(row,(rowCounts.get(row)??0)+1)}
   for(const anchor of anchors){const from=elements(anchor,'from')[0];const row=from?Number(elements(from,'row')[0]?.textContent)+1:0;for(const blip of elements(anchor,'blip')){const media=drawingRels.get(blip.getAttribute('r:embed')??'');const entry=media&&zip.file(media);if(!entry)continue;const ambiguous=!row||(rowCounts.get(row)??0)>1;output.push({file:new File([await entry.async('arraybuffer')],media!.split('/').pop()!),name:!ambiguous&&nameColumn?rows.get(row)?.get(nameColumn)?.trim()??'':'',origin:`${file.name} · ${sheet.getAttribute('name')} · ${row?'第'+row+'行':'浮动图片'}`,warning:ambiguous?'图片位置不明确，请检查名称对应关系':''})}}
  }
 }
 return output
}
