import { useState } from 'react'
export function PathQueue({ onChoose, busy }: { onChoose: () => void; busy: boolean }) {
  const [text, setText] = useState('')
  const [paths, setPaths] = useState<string[]>([])
  const [message, setMessage] = useState('')
  const copy = async (path: string) => {
    try { await navigator.clipboard.writeText(path); setMessage('路径已复制，可在文件夹选择窗口中粘贴。') }
    catch { setMessage('复制失败，请选中路径后按 Ctrl+C。') }
  }
  const copyAndChoose = async (path: string) => {
    try {
      await navigator.clipboard.writeText(path)
      setMessage('路径已复制。在选择窗口的文件夹栏按 Ctrl+V，然后点击上传。')
      onChoose()
    } catch { setMessage('浏览器未允许复制，尚未打开选择窗口。请手动复制路径，再点击页面上方的选择图片文件夹。') }
  }
  return <div className="finder-path-queue"><label htmlFor="finder-paths">批量添加文件夹路径</label><textarea id="finder-paths" value={text} disabled={busy} onChange={event => setText(event.target.value)} placeholder={'每行一个本地或共享文件夹路径\n例如：\\\\服务器\\共享目录'} /><div className="finder-input-actions"><button className="finder-button" disabled={busy || !text.trim()} onClick={() => { const incoming = text.split(/\r?\n/).map(value => value.trim().replace(/^"|"$/g, '')).filter(Boolean); setPaths(current => [...new Map([...current, ...incoming].map(path => [path.toLowerCase().replace(/[\\/]+$/, ''), path])).values()]); setText('') }}>批量加入路径</button><span>点击“复制并选择文件夹”，在弹窗中按 Ctrl+V 后上传。</span></div>{paths.map(path => <div className="finder-path-row" key={path}><input aria-label="文件夹路径" readOnly value={path} /><button className="finder-button" onClick={() => void copy(path)}>复制路径</button><button className="finder-button" disabled={busy} onClick={() => void copyAndChoose(path)}>复制并选择文件夹</button><button className="finder-button" disabled={busy} aria-label={`移除路径 ${path}`} onClick={() => setPaths(current => current.filter(item => item !== path))}>移除</button></div>)}<p className="finder-help" role="status">{message}</p></div>
}
