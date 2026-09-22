/**
 * Device View — [PC] [Mobile] [PC+Mobile]. 데스크톱(≥1024px)에서만 의미가 있다.
 * Mobile / PC+Mobile 은 같은 라우트·같은 데이터를 "진짜 가상 뷰포트"(iframe: PC 1280px · Mobile 390px)로 보여 주고
 * 부모 화면 크기에 맞춰 scale 한다 — 미리보기가 작아져도 레이아웃 자체는 찌그러지지 않는다.
 * PC+Mobile 은 1440px 이상에서만 허용한다(억지로 압축하지 않는다). 프레임 안에서는 다시 프레임을 만들지 않는다(IS_FRAME).
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

export type DeviceView = 'pc' | 'mobile' | 'dual'
export const DEVICE_VIEWS: { id: DeviceView; label: string; hint: string }[] = [
  { id: 'pc', label: 'PC', hint: '데스크톱 화면만' },
  { id: 'mobile', label: 'Mobile', hint: '390px 폰 프레임만' },
  { id: 'dual', label: 'PC+Mobile', hint: '같은 화면을 PC(1280px)와 폰(390px)으로 동시에 — 1440px 이상' },
]
export const DUAL_MIN_WIDTH = 1440
export const VIRTUAL_PC_WIDTH = 1280
export const VIRTUAL_MOBILE_WIDTH = 390

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
  /** 실제로 적용되는 뷰 (dual 인데 화면이 좁으면 pc 로 fallback) */
  effectiveView: DeviceView
  setView: (v: DeviceView) => void
  isDesktop: boolean
  isFrame: boolean
  /** PC+Mobile 을 쓸 수 있는 폭인가 (≥1440) */
  dualAllowed: boolean
  width: number
}
const DeviceCtx = createContext<Ctx | null>(null)

export function DeviceViewProvider({ children }: { children: ReactNode }) {
  const [view, setViewState] = useState<DeviceView>(IS_FRAME ? 'pc' : readView)
  const [width, setWidth] = useState(() => (typeof window !== 'undefined' ? window.innerWidth : 1440))
  useEffect(() => {
    const on = () => setWidth(window.innerWidth)
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [])
  const setView = useCallback((v: DeviceView) => {
    setViewState(v)
    try {
      localStorage.setItem(KEY, v)
    } catch {
      /* ignore */
    }
  }, [])
  const isDesktop = width >= 1024
  const dualAllowed = width >= DUAL_MIN_WIDTH
  const effectiveView: DeviceView = IS_FRAME ? 'pc' : !isDesktop ? 'pc' : view === 'dual' && !dualAllowed ? 'pc' : view
  const value = useMemo(() => ({ view, effectiveView, setView, isDesktop, isFrame: IS_FRAME, dualAllowed, width }), [view, effectiveView, setView, isDesktop, dualAllowed, width])
  return <DeviceCtx.Provider value={value}>{children}</DeviceCtx.Provider>
}

export function useDeviceView(): Ctx {
  const ctx = useContext(DeviceCtx)
  if (!ctx) throw new Error('useDeviceView 는 DeviceViewProvider 안에서만 사용할 수 있습니다.')
  return ctx
}
