/**
 * Device View — [PC] [Mobile] [PC+Mobile]. 데스크톱(≥1024px)에서만 의미가 있다.
 * Mobile / PC+Mobile 은 같은 라우트·같은 데이터를 390px 실제 폰 프레임(iframe)으로 보여 준다.
 * 프레임 안에서는 다시 프레임을 만들지 않는다(IS_FRAME).
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

export type DeviceView = 'pc' | 'mobile' | 'dual'
export const DEVICE_VIEWS: { id: DeviceView; label: string; hint: string }[] = [
  { id: 'pc', label: 'PC', hint: '데스크톱 화면만' },
  { id: 'mobile', label: 'Mobile', hint: '390px 폰 프레임만' },
  { id: 'dual', label: 'PC+Mobile', hint: '같은 화면을 PC 와 폰으로 동시에' },
]

/** 폰 프레임(iframe) 안에서 실행 중인가 — 재귀 프리뷰 금지 */
export const IS_FRAME = typeof window !== 'undefined' && window.self !== window.top

const KEY = 'axpartner.deviceView'
function readView(): DeviceView {
  try {
    const v = localStorage.getItem(KEY) as DeviceView | null
    return v === 'mobile' || v === 'dual' ? v : 'pc'
  } catch {
    return 'pc'
  }
}

interface Ctx {
  view: DeviceView
  setView: (v: DeviceView) => void
  /** 실제로 프레임 UI 를 그릴 수 있는가 (데스크톱 + 프레임 안이 아님) */
  isDesktop: boolean
  isFrame: boolean
}
const DeviceCtx = createContext<Ctx | null>(null)

export function DeviceViewProvider({ children }: { children: ReactNode }) {
  const [view, setViewState] = useState<DeviceView>(IS_FRAME ? 'pc' : readView)
  const [isDesktop, setDesktop] = useState(() => (typeof window !== 'undefined' ? window.matchMedia('(min-width: 1024px)').matches : true))
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)')
    const on = () => setDesktop(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  const setView = useCallback((v: DeviceView) => {
    setViewState(v)
    try {
      localStorage.setItem(KEY, v)
    } catch {
      /* ignore */
    }
  }, [])
  const value = useMemo(() => ({ view, setView, isDesktop, isFrame: IS_FRAME }), [view, setView, isDesktop])
  return <DeviceCtx.Provider value={value}>{children}</DeviceCtx.Provider>
}

export function useDeviceView(): Ctx {
  const ctx = useContext(DeviceCtx)
  if (!ctx) throw new Error('useDeviceView 는 DeviceViewProvider 안에서만 사용할 수 있습니다.')
  return ctx
}
