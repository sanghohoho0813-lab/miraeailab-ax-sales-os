/**
 * 테마 — 7개 캐노니컬 테마. 기본은 PURE WHITE / MIRAE AI LAB.
 * 테마는 사이드바·주 색·활성·KPI·차트·배지·선택·하이라이트만 바꾼다(index.css 의 --th-* 변수).
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

export type ThemeId = 'pure_white' | 'deep_navy' | 'navy_gold' | 'emerald_gold' | 'forest_sage' | 'deep_teal' | 'onyx_gold'

export interface ThemeMeta {
  id: ThemeId
  label: string
  desc: string
  /** 사이드바가 어두운 테마 — 밝은 로고 자산을 쓴다 */
  sideDark: boolean
  swatch: { side: string; accent: string }
}

export const THEMES: ThemeMeta[] = [
  { id: 'pure_white', label: 'Pure White · 미래AI랩', desc: '기본. 흰 표면과 브랜드 오렌지 강조', sideDark: false, swatch: { side: '#ffffff', accent: '#d47a4a' } },
  { id: 'deep_navy', label: 'Deep Navy Blue', desc: '짙은 남색 사이드바, 파란 강조', sideDark: true, swatch: { side: '#0b1b3a', accent: '#2a4d9b' } },
  { id: 'navy_gold', label: 'Navy Gold', desc: '남색 사이드바, 금색 강조', sideDark: true, swatch: { side: '#0f1d3a', accent: '#b8862b' } },
  { id: 'emerald_gold', label: 'Emerald Gold', desc: '짙은 녹색 사이드바, 금색 강조', sideDark: true, swatch: { side: '#0f3b2e', accent: '#b8862b' } },
  { id: 'forest_sage', label: 'Forest Sage', desc: '숲색 사이드바, 세이지 강조', sideDark: true, swatch: { side: '#23402f', accent: '#5f8a6a' } },
  { id: 'deep_teal', label: 'Deep Teal', desc: '청록 사이드바와 강조', sideDark: true, swatch: { side: '#0b2f36', accent: '#1c7c8a' } },
  { id: 'onyx_gold', label: 'Onyx Gold', desc: '검정 사이드바, 금색 강조', sideDark: true, swatch: { side: '#121212', accent: '#c9a24a' } },
]

const KEY = 'axpartner.theme'
const DEFAULT: ThemeId = 'pure_white'

function readTheme(): ThemeId {
  try {
    const v = localStorage.getItem(KEY) as ThemeId | null
    return v && THEMES.some((t) => t.id === v) ? v : DEFAULT
  } catch {
    return DEFAULT
  }
}

interface ThemeCtx {
  theme: ThemeId
  meta: ThemeMeta
  setTheme: (id: ThemeId) => void
}
const Ctx = createContext<ThemeCtx | null>(null)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeId>(readTheme)
  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])
  // 다른 창(듀얼 뷰의 폰 프레임)에서 바꾸면 따라간다
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY) setThemeState(readTheme())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])
  const setTheme = useCallback((id: ThemeId) => {
    setThemeState(id)
    try {
      localStorage.setItem(KEY, id)
    } catch {
      /* private mode */
    }
  }, [])
  const value = useMemo(() => ({ theme, meta: THEMES.find((t) => t.id === theme) ?? THEMES[0], setTheme }), [theme, setTheme])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useTheme(): ThemeCtx {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useTheme 는 ThemeProvider 안에서만 사용할 수 있습니다.')
  return ctx
}
