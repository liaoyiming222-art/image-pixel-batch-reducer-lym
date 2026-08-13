import { createContext, useContext, useEffect, useRef, useState } from 'react'
import type { Dispatch, ReactNode, SetStateAction } from 'react'
import type { ImageTask } from './types'

export type ProcessMode = 'none' | 'over' | 'all'

interface ImageWorkspaceValue {
  tasks: ImageTask[]
  setTasks: Dispatch<SetStateAction<ImageTask[]>>
  tasksRef: React.MutableRefObject<ImageTask[]>
  mode: ProcessMode
  setMode: Dispatch<SetStateAction<ProcessMode>>
  limitMB: number
  setLimitMB: Dispatch<SetStateAction<number>>
  targetMB: number
  setTargetMB: Dispatch<SetStateAction<number>>
}

const ImageWorkspaceContext = createContext<ImageWorkspaceValue | null>(null)

export function ImageWorkspaceProvider({ children }: { children: ReactNode }) {
  const [tasks, setTasks] = useState<ImageTask[]>([])
  const tasksRef = useRef(tasks)
  const [mode, setMode] = useState<ProcessMode>('over')
  const [limitMB, setLimitMB] = useState(10)
  const [targetMB, setTargetMB] = useState(5)
  useEffect(() => { tasksRef.current = tasks }, [tasks])
  useEffect(() => () => tasksRef.current.forEach(task => {
    URL.revokeObjectURL(task.previewUrl)
    if (task.resultUrl) URL.revokeObjectURL(task.resultUrl)
  }), [])
  return <ImageWorkspaceContext.Provider value={{ tasks, setTasks, tasksRef, mode, setMode, limitMB, setLimitMB, targetMB, setTargetMB }}>
    {children}
  </ImageWorkspaceContext.Provider>
}

export function useImageWorkspace() {
  const value = useContext(ImageWorkspaceContext)
  if (!value) throw new Error('useImageWorkspace must be used inside ImageWorkspaceProvider')
  return value
}
