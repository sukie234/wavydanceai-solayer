import { createContext, useContext, useEffect, useState } from 'react'

export type Theme = 'light' | 'dark'

const STORAGE_KEY = 'wavy.theme'

function readInitial(): Theme {
  if (typeof document === 'undefined') return 'light'
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored === 'dark' || stored === 'light') return stored
  const attr = document.documentElement.getAttribute('data-theme')
  if (attr === 'dark' || attr === 'light') return attr
  return 'light'
}

export const ThemeContext = createContext<{
  theme: Theme
  setTheme: (t: Theme) => void
  toggle: () => void
}>({
  theme: 'light',
  setTheme: () => {},
  toggle: () => {},
})

export function useThemeProvider() {
  const [theme, setTheme] = useState<Theme>(readInitial)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem(STORAGE_KEY, theme)
  }, [theme])

  const toggle = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))
  return { theme, setTheme, toggle }
}

export function useTheme() {
  return useContext(ThemeContext)
}
