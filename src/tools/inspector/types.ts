export type Orientation = '横图' | '竖图' | '方图'

export interface ImageRecord {
  id: string
  signature: string
  order: number
  name: string
  width: number
  height: number
  size: number
  orientation: Orientation
  actualRatioText: string
  closestRatio: string
  errorPercent: number
}

export type SortKey = 'order' | 'name' | 'width' | 'height' | 'closestRatio' | 'errorPercent'
export type SortDirection = 'asc' | 'desc'
