import { act, renderHook } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useTransientNotice } from './useTransientNotice'

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

it('提示显示五秒后消失；再次提示会重新计时', () => {
  vi.useFakeTimers()
  const { result } = renderHook(() => useTransientNotice())
  act(() => result.current[1]('已跳过重复文件'))
  act(() => vi.advanceTimersByTime(4000))
  expect(result.current[0]).toBe('已跳过重复文件')
  act(() => result.current[1]('已跳过重复文件'))
  act(() => vi.advanceTimersByTime(4000))
  expect(result.current[0]).toBe('已跳过重复文件')
  act(() => vi.advanceTimersByTime(1000))
  expect(result.current[0]).toBe('')
})
