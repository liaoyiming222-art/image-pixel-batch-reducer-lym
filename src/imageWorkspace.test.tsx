import { act, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ImageWorkspaceProvider, useImageWorkspace } from './imageWorkspace'
import type { ImageTask } from './types'

const file = new File(['old'], 'old.jpg', { type: 'image/jpeg' })
const completed: ImageTask = { id: 'old', file, name: file.name, format: 'JPG', size: file.size,
  width: 10, height: 10, ratio: '1:1', closestRatio: '1:1', ratioErrorPercent: 0,
  previewUrl: 'old-preview', status: 'done', progress: 100, result: new Blob(['done']), resultUrl: 'old-result' }
const newTask: ImageTask = { ...completed, id: 'new', name: 'new.jpg', status: 'pending', progress: 0,
  result: undefined, resultUrl: undefined }

let workspace: ReturnType<typeof useImageWorkspace>
function Probe() { workspace = useImageWorkspace(); return null }

afterEach(() => vi.restoreAllMocks())

describe('共享任务与压缩设置', () => {
  it('两个工具默认大小限制为 2 MB；追加图片和更改下载选项不重置旧结果，压缩参数改变才重置', () => {
    const revoke = vi.fn()
    URL.revokeObjectURL = revoke
    const view = render(<ImageWorkspaceProvider><Probe /></ImageWorkspaceProvider>)
    expect(workspace.limitMB).toBe(2)
    act(() => workspace.setTasks([completed]))
    act(() => workspace.setTasks(current => [...current, newTask]))
    expect(workspace.tasks.map(task => task.status)).toEqual(['done', 'pending'])
    expect(workspace.tasks[0].resultUrl).toBe('old-result')
    act(() => workspace.setInspectorMode('none'))
    expect(workspace.tasks[0].status).toBe('done')
    expect(revoke).not.toHaveBeenCalledWith('old-result')
    act(() => workspace.setLimitMB(3))
    expect(workspace.tasks.map(task => task.status)).toEqual(['pending', 'pending'])
    expect(workspace.tasks[0].resultUrl).toBeUndefined()
    expect(revoke).toHaveBeenCalledWith('old-result')
    view.unmount()
  })

  it('仅转格式时大小和尺寸输入变化不影响已完成任务', () => {
    const revoke = vi.fn()
    URL.revokeObjectURL = revoke
    const view = render(<ImageWorkspaceProvider><Probe /></ImageWorkspaceProvider>)
    act(() => workspace.setCompressionMode('convert'))
    act(() => workspace.setTasks([completed]))
    act(() => { workspace.setLimitMB(4); workspace.setEdgeLimit(6000) })
    expect(workspace.tasks[0].status).toBe('done')
    expect(workspace.tasks[0].resultUrl).toBe('old-result')
    expect(revoke).not.toHaveBeenCalledWith('old-result')
    view.unmount()
  })
})
