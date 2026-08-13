export type TaskStatus = 'pending' | 'processing' | 'done' | 'skipped' | 'error'

export interface ImageTask {
  id: string
  file: File
  name: string
  relativePath?: string
  format: string
  size: number
  width: number
  height: number
  ratio: string
  closestRatio: string
  ratioErrorPercent: number
  previewUrl: string
  status: TaskStatus
  progress: number
  result?: Blob
  resultUrl?: string
  resultWidth?: number
  resultHeight?: number
  error?: string
}

export interface ProcessOptions {
  targetBytes: number
  onProgress?: (progress: number) => void
}
