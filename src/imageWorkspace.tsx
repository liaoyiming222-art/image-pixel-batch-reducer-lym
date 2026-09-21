import { createContext, useContext, useEffect, useRef, useState } from 'react'
import type { Dispatch, ReactNode, SetStateAction } from 'react'
import type { ImageTask } from './types'

export type ProcessMode = 'none' | 'over'
export type CompressionMode = 'convert' | 'over'

interface ImageWorkspaceValue {
  tasks: ImageTask[]
  setTasks: Dispatch<SetStateAction<ImageTask[]>>
  tasksRef: React.MutableRefObject<ImageTask[]>
  compressionMode: CompressionMode
  setCompressionMode: Dispatch<SetStateAction<CompressionMode>>
  inspectorMode: ProcessMode
  setInspectorMode: Dispatch<SetStateAction<ProcessMode>>
  limitMB: number
  setLimitMB: Dispatch<SetStateAction<number>>
  edgeEnabled: boolean
  edgeLimit: number
  setEdgeLimit: Dispatch<SetStateAction<number>>
}

const ImageWorkspaceContext = createContext<ImageWorkspaceValue | null>(null)

export function ImageWorkspaceProvider({ children }: { children: ReactNode }) {
  const [tasks, setTasks] = useState<ImageTask[]>([])
  const tasksRef = useRef(tasks)
  const [compressionMode, setCompressionMode] = useState<CompressionMode>('over')
  const [inspectorMode, setInspectorMode] = useState<ProcessMode>('over')
  const [limitMB, setLimitMB] = useState(10)
  const edgeEnabled = true
  const [edgeLimit, setEdgeLimit] = useState(8000)
  useEffect(() => { tasksRef.current = tasks }, [tasks])
  useEffect(() => {
    setTasks(current => current.map(task => {
      if (task.status === 'pending') return task
      if (task.resultUrl) URL.revokeObjectURL(task.resultUrl)
      return { ...task, status: 'pending', progress: 0, result: undefined, resultUrl: undefined, resultWidth: undefined, resultHeight: undefined, error: undefined }
    }))
  }, [limitMB, edgeLimit, compressionMode, inspectorMode])
  useEffect(() => () => tasksRef.current.forEach(task => {
    URL.revokeObjectURL(task.previewUrl)
    if (task.resultUrl) URL.revokeObjectURL(task.resultUrl)
  }), [])
  return <ImageWorkspaceContext.Provider value={{ edgeEnabled, edgeLimit, setEdgeLimit, tasks, setTasks, tasksRef, compressionMode, setCompressionMode, inspectorMode, setInspectorMode, limitMB, setLimitMB }}>
    {children}
  </ImageWorkspaceContext.Provider>
}

export function useImageWorkspace() {
  const value = useContext(ImageWorkspaceContext)
  if (!value) throw new Error('useImageWorkspace must be used inside ImageWorkspaceProvider')
  return value
}
