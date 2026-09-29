import { createContext, useContext, useEffect, useRef, useState } from 'react'
import type { Dispatch, ReactNode, SetStateAction } from 'react'
import type { ImageTask } from './types'
import { createImageImportRegistry } from './imageImport'

export type ProcessMode = 'none' | 'over'
export type CompressionMode = 'convert' | 'over'

interface ImageWorkspaceValue {
  tasks: ImageTask[]
  setTasks: Dispatch<SetStateAction<ImageTask[]>>
  tasksRef: React.MutableRefObject<ImageTask[]>
  importRegistry: ReturnType<typeof createImageImportRegistry>
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
  const importRegistryRef = useRef<ReturnType<typeof createImageImportRegistry> | null>(null)
  if (!importRegistryRef.current) importRegistryRef.current = createImageImportRegistry(tasksRef)
  const importRegistry = importRegistryRef.current
  const [compressionMode, setCompressionMode] = useState<CompressionMode>('over')
  const [inspectorMode, setInspectorMode] = useState<ProcessMode>('over')
  const [limitMB, setLimitMB] = useState(2)
  const edgeEnabled = true
  const [edgeLimit, setEdgeLimit] = useState(8000)
  const compressionSettings = compressionMode === 'convert' ? 'convert' : `over:${limitMB}:${edgeLimit}`
  const previousCompressionSettings = useRef(compressionSettings)
  useEffect(() => { tasksRef.current = tasks; importRegistry.settle() }, [tasks, importRegistry])
  useEffect(() => {
    if (previousCompressionSettings.current === compressionSettings) return
    previousCompressionSettings.current = compressionSettings
    setTasks(current => current.map(task => {
      if (task.status === 'pending') return task
      if (task.resultUrl) URL.revokeObjectURL(task.resultUrl)
      return { ...task, status: 'pending', progress: 0, result: undefined, resultUrl: undefined, resultWidth: undefined, resultHeight: undefined, error: undefined }
    }))
  }, [compressionSettings])
  useEffect(() => () => tasksRef.current.forEach(task => {
    URL.revokeObjectURL(task.previewUrl)
    if (task.resultUrl) URL.revokeObjectURL(task.resultUrl)
  }), [])
  return <ImageWorkspaceContext.Provider value={{ edgeEnabled, edgeLimit, setEdgeLimit, tasks, setTasks, tasksRef, importRegistry, compressionMode, setCompressionMode, inspectorMode, setInspectorMode, limitMB, setLimitMB }}>
    {children}
  </ImageWorkspaceContext.Provider>
}

export function useImageWorkspace() {
  const value = useContext(ImageWorkspaceContext)
  if (!value) throw new Error('useImageWorkspace must be used inside ImageWorkspaceProvider')
  return value
}
