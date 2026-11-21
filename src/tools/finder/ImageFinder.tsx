import { useMemo, useRef, useState } from 'react'
import { FolderOpen, Search, Trash2, Info, FileSpreadsheet } from 'lucide-react'
import { SimilaritySearch } from './SimilaritySearch'
import { PathQueue } from './PathQueue'
import { entriesFromFiles } from './files'
import type { ImageEntry } from './model'
import './finder.css'
interface Directory { id:string; label:string; signature:string; files:ImageEntry[] }
export function ImageFinder() {
 const [inputSlot,setInputSlot]=useState<HTMLDivElement|null>(null)
 const [directories,setDirectories]=useState<Directory[]>([])
 const [busy,setBusy]=useState(false)
 const [notice,setNotice]=useState('')
 const [scanned,setScanned]=useState(0)
 const [pending,setPending]=useState<Directory|null>(null)
 const folderInput=useRef<HTMLInputElement>(null)
 const cancel=useRef(false)
 const files=useMemo(()=>directories.flatMap(directory=>directory.files),[directories])
 const choose=()=>{if(!busy&&!pending)folderInput.current?.click()}
 const add=async(list:FileList)=>{
  if(busy||pending)return
  setBusy(true);cancel.current=false;setScanned(0)
  try{
   const all=Array.from(list);if(!all.length)return
   const name=all[0].webkitRelativePath.split('/')[0]||'所选目录';let label=name;let n=2
   while(directories.some(d=>d.label===label))label=`${name} (${n++})`
   const id=crypto.randomUUID();const entries:ImageEntry[]=[]
   for(let i=0;i<all.length;i+=500){await new Promise(resolve=>setTimeout(resolve,0));if(cancel.current){setNotice('已停止，已加入目录保持不变。');return}entries.push(...entriesFromFiles(all.slice(i,i+500),{id,label}));setScanned(Math.min(i+500,all.length))}
   if(!entries.length){setNotice('所选目录中没有找到支持的图片，已加入目录保持不变。');return}
   const signature=JSON.stringify(all.map(file=>[file.webkitRelativePath,file.size,file.lastModified]).sort())
   const directory={id,label,signature,files:entries}
   if(directories.some(d=>d.signature===signature)){setPending(directory);return}
   setDirectories(current=>[...current,directory])
   setNotice('目录已加入。若同时选择了上级目录及其子目录，请移除重叠范围，避免重复检索。')
  }catch{setNotice('无法读取目录，请检查权限或共享连接后重试。')}finally{setBusy(false)}
 }
 return <main className="finder-page">
  <section className="tool-intro"><div className="tool-intro-icon"><Search/></div><div><h1>检索打包图片</h1><p>上传一份 Excel，自动按名称或参考图片查找，核对后统一打包。</p></div></section>
  <section className="finder-card finder-import"><div className="finder-heading"><div><FileSpreadsheet size={20}/><h2>待检索图片</h2></div></div><p className="finder-stage-description">有明确图片名时先按名称查找，其余按图片检索。只读取单元格中的名称，不识别图片内文字。</p><div ref={setInputSlot}/></section>
  <section className="finder-card finder-library"><div className="finder-heading"><div><FolderOpen size={20}/><h2>图片目录 <small>{directories.length} 个目录 · {files.length} 张图片</small></h2></div><button className="finder-button" disabled={busy||!!pending} onClick={choose}><FolderOpen size={16}/>{directories.length?'添加图片目录':'选择图片目录'}</button></div>
   <p className="finder-directory-note"><Info size={16}/><span><strong>系统提示“上传”仅表示允许本页面读取文件。</strong>图片内容不会上传到网站服务器，也不会修改或删除原文件。</span></p>
   <p className="finder-directory-instructions">点击“选择图片目录”，在弹出窗口中选择文件夹，点击“上传”并确认授权。自动检索子文件夹，可继续添加多个目录。</p>
   <input ref={folderInput} type="file" multiple hidden aria-label="共享图片文件夹" {...({webkitdirectory:'',directory:''} as Record<string,string>)} onChange={event=>{if(event.target.files?.length)void add(event.target.files);event.target.value=''}}/>
   {!directories.length && !busy && <div className="finder-source"><FolderOpen size={22}/><div><strong>尚未选择图片目录</strong><span>选择后显示文件夹名称和图片数量。</span></div></div>}
   {directories.map(directory=><div className="finder-source connected" key={directory.id}><FolderOpen size={20}/><div><strong>{directory.label}</strong><span>{directory.files.length} 张图片 · 已授权</span></div><button className="finder-button" disabled={busy} aria-label={`移除目录 ${directory.label}`} onClick={()=>setDirectories(current=>current.filter(item=>item.id!==directory.id))}><Trash2 size={15}/>移除</button></div>)}
   <details className="finder-path-options"><summary>批量添加路径</summary><PathQueue busy={busy||!!pending} onChoose={choose} connected={directories.map(d=>d.label)}/><p className="finder-help">复制路径后，在选择窗口按 Ctrl+V，点击上传并确认授权。浏览器不会提供完整路径，请核对所选目录。</p></details>
   {busy&&<p role="status">已扫描 {scanned} 个文件 <button className="finder-button" onClick={()=>{cancel.current=true}}>停止扫描</button></p>}
   {pending&&<div className="finder-warning"><strong>这个目录可能已添加</strong><p>文件清单相同。如来自不同位置，可仍然加入。</p><button className="finder-button" onClick={()=>setPending(null)}>取消添加</button><button className="finder-button" onClick={()=>{setDirectories(current=>[...current,pending]);setPending(null)}}>仍然添加</button></div>}
   {notice&&<p className="finder-help" role="status">{notice}</p>}
  </section>
  <SimilaritySearch files={files} scope="local-library-v1" inputSlot={inputSlot}/>
 </main>
}
