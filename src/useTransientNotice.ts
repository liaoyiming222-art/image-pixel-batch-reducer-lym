import { useCallback, useEffect, useState } from 'react'

export function useTransientNotice(duration = 5000) {
  const [notice, setNoticeState] = useState<{ text: string } | null>(null)
  const setNotice = useCallback((text: string) => setNoticeState(text ? { text } : null), [])

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNoticeState(null), duration)
    return () => window.clearTimeout(timer)
  }, [notice, duration])

  return [notice?.text ?? '', setNotice] as const
}
