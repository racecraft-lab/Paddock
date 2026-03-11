'use client'

import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'
import { THEMES, isThemeDark } from '@/lib/themes'

export function ThemeBackground() {
  const { theme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  // Sync the "dark" class on <html> so Tailwind dark: variants work.
  // next-themes applies the theme id as a single class; we add/remove
  // "dark" separately based on the theme's group.
  useEffect(() => {
    if (!mounted || !theme) return
    const el = document.documentElement
    if (isThemeDark(theme)) {
      el.classList.add('dark')
    } else {
      el.classList.remove('dark')
    }
  }, [mounted, theme])

  if (!mounted) return null

  const meta = THEMES.find(t => t.id === theme)
  const bgClass = meta?.background

  if (!bgClass) return null

  return (
    <div
      className={`${bgClass} fixed inset-0 -z-10 pointer-events-none`}
      aria-hidden="true"
    />
  )
}
